import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { ChessAI, ChessEngine, STANDARD_START_FEN } from '../../../packages/shared/src/index.js';
import { hashPassword, requireAuth, signToken, verifyPassword, verifyToken, type AuthPayload, type AuthedRequest } from './auth.js';
import { db, initDb } from './db.js';

const PORT = Number(process.env.PORT || 4200);

function resolveProjectRoot() {
  const currentFileDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.cwd(),
    resolve(process.cwd(), '../..'),
    resolve(currentFileDir, '../../../../../..'),
    resolve(currentFileDir, '../../../../..'),
  ];

  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, 'apps/web'))) {
      return candidate;
    }
  }

  return process.cwd();
}

const projectRoot = resolveProjectRoot();
const configuredOrigins = (process.env.CLIENT_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const webDistDir = resolve(projectRoot, 'apps/web/dist');
const uploadsDir = resolve(process.env.UPLOAD_DIR || resolve(projectRoot, process.env.RENDER === 'true' ? 'var/data/uploads' : 'uploads'));
const ai = new ChessAI();

mkdirSync(uploadsDir, { recursive: true });
initDb();

const allowOrigin = (origin?: string | null) => {
  if (!origin) return true;
  if (configuredOrigins.length === 0) return true;
  return configuredOrigins.includes(origin);
};

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => callback(null, allowOrigin(origin)),
    credentials: true,
  },
});

app.use(cors({
  origin: (origin, callback) => callback(null, allowOrigin(origin)),
  credentials: true,
}));
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", 'https:', 'data:'],
      imgSrc: ["'self'", 'https:', 'data:', 'blob:'],
      mediaSrc: ["'self'", 'https:', 'data:', 'blob:'],
      connectSrc: ["'self'", 'https:', 'http:', 'ws:', 'wss:'],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
      objectSrc: ["'none'"],
    },
  },
}));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 60_000, max: 180 }));
app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));

const sanitize = (value: string) => value.trim().replace(/[<>]/g, '');
const now = () => new Date().toISOString();
const publicAssetUrl = (req: express.Request, relativePath: string) => {
  if (configuredOrigins[0]) return `${configuredOrigins[0]}${relativePath}`;
  return `${req.protocol}://${req.get('host')}${relativePath}`;
};

const registerSchema = z.object({
  username: z.string().min(3).max(24),
  email: z.string().email(),
  password: z.string().min(8).max(64),
});
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(64) });
const roomSchema = z.object({
  name: z.string().min(3).max(50),
  visibility: z.enum(['public', 'private', 'password']),
  password: z.string().min(4).max(32).optional(),
  maxPlayers: z.number().min(2).max(16).default(2),
  timeControl: z.string().default('blitz'),
  incrementSeconds: z.number().min(0).max(60).default(0),
});
const moveSchema = z.object({
  from: z.string().length(2),
  to: z.string().length(2),
  promotion: z.enum(['q', 'r', 'b', 'n']).optional(),
});
const uploadImageSchema = z.object({
  fileName: z.string().min(1).max(120).optional(),
  dataUrl: z.string().min(30),
});

function getOptionalAuth(req: express.Request): AuthPayload | undefined {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return undefined;
  try {
    return verifyToken(auth.slice(7));
  } catch {
    return undefined;
  }
}

function getUserByEmail(email: string) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
}
function getUserById(id: string) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
}
function getSettings(userId: string) {
  return db.prepare('SELECT * FROM settings WHERE user_id = ?').get(userId) as any;
}
function roomExists(roomId: string) {
  return Boolean(db.prepare('SELECT 1 FROM rooms WHERE id = ?').get(roomId));
}
function ensureWallet(userId: string) {
  db.prepare('INSERT OR IGNORE INTO wallets (user_id, updated_at) VALUES (?, ?)').run(userId, now());
}
function listRooms(currentUserId?: string) {
  const rows = db.prepare(`
    SELECT r.*, u.username AS host_username,
      (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id) AS member_count
    FROM rooms r
    JOIN users u ON u.id = r.host_user_id
    ORDER BY r.created_at DESC
  `).all() as Array<Record<string, any>>;

  if (!currentUserId) {
    return rows.map((room) => ({ ...room, is_member: false }));
  }

  const membershipRows = db.prepare('SELECT room_id FROM room_members WHERE user_id = ?').all(currentUserId) as Array<{ room_id: string }>;
  const membership = new Set(membershipRows.map((entry) => entry.room_id));
  return rows.map((room) => ({ ...room, is_member: membership.has(room.id) }));
}
function listRoomMembers(roomId: string) {
  return db.prepare(`
    SELECT rm.room_id, rm.user_id, rm.role, rm.joined_at, u.username, u.avatar_url, u.rating
    FROM room_members rm
    JOIN users u ON u.id = rm.user_id
    WHERE rm.room_id = ?
    ORDER BY CASE rm.role WHEN 'host' THEN 0 ELSE 1 END, rm.joined_at ASC
  `).all(roomId);
}
function getFriendsPayload(userId: string) {
  const friends = db.prepare(`
    SELECT f.user_id, f.friend_id, f.status, f.created_at,
      CASE WHEN f.user_id = ? THEN u2.id ELSE u1.id END AS friend_user_id,
      CASE WHEN f.user_id = ? THEN u2.username ELSE u1.username END AS friend_username,
      CASE WHEN f.user_id = ? THEN u2.avatar_url ELSE u1.avatar_url END AS friend_avatar_url,
      CASE WHEN f.user_id = ? THEN u2.rating ELSE u1.rating END AS friend_rating
    FROM friends f
    JOIN users u1 ON u1.id = f.user_id
    JOIN users u2 ON u2.id = f.friend_id
    WHERE (f.user_id = ? OR f.friend_id = ?)
      AND f.status = 'accepted'
    ORDER BY f.created_at DESC
  `).all(userId, userId, userId, userId, userId, userId);

  const incoming = db.prepare(`
    SELECT f.user_id AS requester_id, u.username AS requester_username, u.avatar_url AS requester_avatar_url, u.rating AS requester_rating, f.created_at
    FROM friends f
    JOIN users u ON u.id = f.user_id
    WHERE f.friend_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(userId);

  const outgoing = db.prepare(`
    SELECT f.friend_id AS target_id, u.username AS target_username, u.avatar_url AS target_avatar_url, u.rating AS target_rating, f.created_at
    FROM friends f
    JOIN users u ON u.id = f.friend_id
    WHERE f.user_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(userId);

  return { friends, incoming, outgoing };
}
function updateUserRecord(userId: string, changes: { wins?: number; losses?: number; draws?: number; streakReset?: boolean; streakIncrement?: boolean }) {
  const user = getUserById(userId);
  if (!user) return;

  const nextWins = user.wins + (changes.wins ?? 0);
  const nextLosses = user.losses + (changes.losses ?? 0);
  const nextDraws = user.draws + (changes.draws ?? 0);
  const nextStreak = changes.streakReset ? 0 : changes.streakIncrement ? user.streak + 1 : user.streak;
  const nextMaxStreak = Math.max(user.max_streak, nextStreak);

  db.prepare('UPDATE users SET wins = ?, losses = ?, draws = ?, streak = ?, max_streak = ?, updated_at = ? WHERE id = ?')
    .run(nextWins, nextLosses, nextDraws, nextStreak, nextMaxStreak, now(), userId);
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'royal-square-server',
    webBundlePresent: existsSync(resolve(webDistDir, 'index.html')),
  });
});

app.post('/api/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const username = sanitize(parsed.data.username);
  const email = sanitize(parsed.data.email.toLowerCase());
  if (getUserByEmail(email)) return res.status(409).json({ message: 'Email already in use' });
  const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existingUsername) return res.status(409).json({ message: 'Username already in use' });

  const id = uuid();
  const timestamp = now();
  const passwordHash = await hashPassword(parsed.data.password);
  db.prepare(`
    INSERT INTO users (id, username, email, password_hash, created_at, updated_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, username, email, passwordHash, timestamp, timestamp, timestamp);
  db.prepare('INSERT INTO settings (user_id) VALUES (?)').run(id);
  ensureWallet(id);

  const token = signToken({ sub: id, username });
  res.status(201).json({ token, user: getUserById(id), settings: getSettings(id) });
});

app.post('/api/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const email = sanitize(parsed.data.email.toLowerCase());
  const user = getUserByEmail(email);
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });
  const valid = await verifyPassword(parsed.data.password, user.password_hash);
  if (!valid) return res.status(401).json({ message: 'Invalid credentials' });
  db.prepare('UPDATE users SET last_seen_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), user.id);
  res.json({ token: signToken({ sub: user.id, username: user.username }), user: getUserById(user.id), settings: getSettings(user.id) });
});

app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
  const user = getUserById(req.auth!.sub);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user, settings: getSettings(user.id), wallet: db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(user.id) });
});

app.post('/api/uploads/image', requireAuth, (req: AuthedRequest, res) => {
  const parsed = uploadImageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());

  const match = parsed.data.dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/);
  if (!match) return res.status(400).json({ message: 'Unsupported image format' });

  const [, rawExtension, base64Payload] = match;
  const buffer = Buffer.from(base64Payload, 'base64');
  if (buffer.byteLength > 3 * 1024 * 1024) {
    return res.status(413).json({ message: 'Image is too large' });
  }

  const extension = rawExtension === 'jpeg' ? 'jpg' : rawExtension;
  const fileName = `${req.auth!.sub}-${Date.now()}-${uuid()}.${extension}`;
  const outputPath = resolve(uploadsDir, fileName);
  writeFileSync(outputPath, buffer);

  res.status(201).json({
    url: `/uploads/${fileName}`,
    absoluteUrl: publicAssetUrl(req, `/uploads/${fileName}`),
  });
});

app.patch('/api/profile', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({
    username: z.string().min(3).max(24).optional(),
    bio: z.string().max(280).optional(),
    avatarUrl: z.string().min(1).optional(),
    language: z.enum(['ar', 'en', 'fr']).optional(),
    theme: z.enum(['light', 'dark']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const user = getUserById(req.auth!.sub);
  if (!user) return res.status(404).json({ message: 'User not found' });

  const username = parsed.data.username ? sanitize(parsed.data.username) : user.username;
  const existingUsername = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, user.id);
  if (existingUsername) return res.status(409).json({ message: 'Username already in use' });

  const bio = parsed.data.bio ? sanitize(parsed.data.bio) : user.bio;
  const avatarUrl = parsed.data.avatarUrl ?? user.avatar_url;
  const language = parsed.data.language ?? user.language;
  const theme = parsed.data.theme ?? user.theme;
  db.prepare('UPDATE users SET username = ?, bio = ?, avatar_url = ?, language = ?, theme = ?, updated_at = ? WHERE id = ?').run(username, bio, avatarUrl, language, theme, now(), user.id);
  res.json({ user: getUserById(user.id) });
});

app.get('/api/search', requireAuth, (req: AuthedRequest, res) => {
  const query = String(req.query.q || '').trim();
  if (!query) return res.json({ users: [], rooms: [] });
  const like = `%${query.toLowerCase()}%`;

  const users = db.prepare(`
    SELECT id, username, avatar_url, rating, bio
    FROM users
    WHERE id != ? AND (LOWER(username) LIKE ? OR LOWER(email) LIKE ?)
    ORDER BY username ASC
    LIMIT 20
  `).all(req.auth!.sub, like, like);

  const rooms = db.prepare(`
    SELECT r.*, u.username AS host_username,
      (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id) AS member_count
    FROM rooms r
    JOIN users u ON u.id = r.host_user_id
    WHERE LOWER(r.name) LIKE ?
    ORDER BY r.created_at DESC
    LIMIT 20
  `).all(like);

  res.json({ users, rooms });
});

app.get('/api/friends', requireAuth, (req: AuthedRequest, res) => {
  res.json(getFriendsPayload(req.auth!.sub));
});

app.post('/api/friends/request', requireAuth, (req: AuthedRequest, res) => {
  const parsed = z.object({ friendId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const friendId = parsed.data.friendId;
  if (friendId === req.auth!.sub) return res.status(400).json({ message: 'You cannot add yourself' });
  const friend = getUserById(friendId);
  if (!friend) return res.status(404).json({ message: 'User not found' });

  const existing = db.prepare(`
    SELECT * FROM friends
    WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
  `).get(req.auth!.sub, friendId, friendId, req.auth!.sub) as any;

  if (existing?.status === 'accepted') return res.status(409).json({ message: 'Already friends' });
  if (existing?.status === 'pending') return res.status(409).json({ message: 'Friend request already exists' });

  db.prepare('INSERT INTO friends (user_id, friend_id, status, created_at) VALUES (?, ?, ?, ?)')
    .run(req.auth!.sub, friendId, 'pending', now());

  res.status(201).json({ ok: true });
});

app.post('/api/friends/:friendId/accept', requireAuth, (req: AuthedRequest, res) => {
  const friendId = req.params.friendId;
  const pending = db.prepare('SELECT * FROM friends WHERE user_id = ? AND friend_id = ? AND status = ?').get(friendId, req.auth!.sub, 'pending') as any;
  if (!pending) return res.status(404).json({ message: 'Friend request not found' });

  db.prepare('UPDATE friends SET status = ? WHERE user_id = ? AND friend_id = ?').run('accepted', friendId, req.auth!.sub);
  res.json({ ok: true });
});

app.delete('/api/friends/:friendId', requireAuth, (req: AuthedRequest, res) => {
  const result = db.prepare(`
    DELETE FROM friends
    WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
  `).run(req.auth!.sub, req.params.friendId, req.params.friendId, req.auth!.sub);

  if (!result.changes) return res.status(404).json({ message: 'Friend relation not found' });
  res.json({ ok: true });
});

app.get('/api/leaderboard', (_req, res) => {
  const rows = db.prepare('SELECT id, username, avatar_url, rating, wins, losses, draws, max_streak FROM users ORDER BY rating DESC, wins DESC LIMIT 100').all();
  res.json({ players: rows });
});

app.get('/api/history', requireAuth, (req: AuthedRequest, res) => {
  const rows = db.prepare(`
    SELECT g.*, wu.username AS white_username, bu.username AS black_username
    FROM games g
    LEFT JOIN users wu ON wu.id = g.white_user_id
    LEFT JOIN users bu ON bu.id = g.black_user_id
    WHERE white_user_id = ? OR black_user_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).all(req.auth!.sub, req.auth!.sub);
  res.json({ games: rows });
});

app.get('/api/rooms', (req, res) => {
  const auth = getOptionalAuth(req);
  res.json({ rooms: listRooms(auth?.sub) });
});

app.get('/api/rooms/:roomId/members', requireAuth, (req: AuthedRequest, res) => {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.roomId) as any;
  if (!room) return res.status(404).json({ message: 'Room not found' });
  res.json({ members: listRoomMembers(room.id) });
});

app.post('/api/rooms', requireAuth, async (req: AuthedRequest, res) => {
  const parsed = roomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const data = parsed.data;
  const roomId = uuid();
  const timestamp = now();
  const passwordHash = data.password ? await hashPassword(data.password) : null;
  db.prepare(`
    INSERT INTO rooms (id, host_user_id, name, visibility, password_hash, max_players, status, settings_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'waiting', ?, ?, ?)
  `).run(roomId, req.auth!.sub, sanitize(data.name), data.visibility, passwordHash, data.maxPlayers, JSON.stringify({ timeControl: data.timeControl, incrementSeconds: data.incrementSeconds }), timestamp, timestamp);
  db.prepare('INSERT INTO room_members (room_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(roomId, req.auth!.sub, 'host', timestamp);
  res.status(201).json({ room: db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) });
});

app.post('/api/rooms/:roomId/join', requireAuth, async (req: AuthedRequest, res) => {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.roomId) as any;
  if (!room) return res.status(404).json({ message: 'Room not found' });
  if (room.visibility === 'password') {
    const password = z.string().min(4).parse(req.body.password);
    const ok = await verifyPassword(password, room.password_hash);
    if (!ok) return res.status(403).json({ message: 'Wrong password' });
  }
  const count = Number((db.prepare('SELECT COUNT(*) as total FROM room_members WHERE room_id = ?').get(room.id) as any).total);
  if (count >= room.max_players) return res.status(409).json({ message: 'Room is full' });
  db.prepare('INSERT OR IGNORE INTO room_members (room_id, user_id, role, joined_at) VALUES (?, ?, ?, ?)').run(room.id, req.auth!.sub, 'member', now());
  res.json({ ok: true });
});

app.post('/api/rooms/:roomId/leave', requireAuth, (req: AuthedRequest, res) => {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.roomId) as any;
  if (!room) return res.status(404).json({ message: 'Room not found' });

  db.prepare('DELETE FROM room_members WHERE room_id = ? AND user_id = ?').run(room.id, req.auth!.sub);
  const members = listRoomMembers(room.id) as Array<Record<string, any>>;

  if (members.length === 0) {
    db.prepare('DELETE FROM rooms WHERE id = ?').run(room.id);
    return res.json({ ok: true, deleted: true });
  }

  if (room.host_user_id === req.auth!.sub) {
    const nextHost = members[0];
    db.prepare('UPDATE rooms SET host_user_id = ?, updated_at = ? WHERE id = ?').run(nextHost.user_id, now(), room.id);
    db.prepare('UPDATE room_members SET role = ? WHERE room_id = ? AND user_id = ?').run('host', room.id, nextHost.user_id);
  }

  res.json({ ok: true, deleted: false, members: listRoomMembers(room.id) });
});

app.get('/api/games/:gameId', (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.gameId) as any;
  if (!game) return res.status(404).json({ message: 'Game not found' });
  const moves = db.prepare('SELECT * FROM moves WHERE game_id = ? ORDER BY ply ASC').all(req.params.gameId);
  res.json({ game, moves });
});

app.post('/api/games/ai', requireAuth, (req: AuthedRequest, res) => {
  const schema = z.object({ fen: z.string().default(STANDARD_START_FEN), depth: z.number().min(1).max(3).default(2), color: z.enum(['w', 'b']).default('b') });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const engine = new ChessEngine(parsed.data.fen);
  const result = ai.search(engine, parsed.data.depth, parsed.data.color);
  res.json(result);
});

app.post('/api/games/import/fen', (req, res) => {
  const schema = z.object({ fen: z.string().min(10) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const engine = new ChessEngine(parsed.data.fen);
  res.json(engine.exportState());
});

app.post('/api/games/import/pgn', (req, res) => {
  const schema = z.object({ pgn: z.string().min(3) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const engine = new ChessEngine();
  engine.loadPGN(parsed.data.pgn);
  res.json(engine.exportState());
});

const liveGames = new Map<string, { engine: ChessEngine; whiteId?: string; blackId?: string; roomId?: string; timeControl: string; incrementSeconds: number }>();

function expectedScore(ratingA: number, ratingB: number) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}
function updateElo(whiteId: string, blackId: string, scoreWhite: number, gameId: string) {
  const white = getUserById(whiteId);
  const black = getUserById(blackId);
  if (!white || !black) return;
  const k = 24;
  const expectedWhite = expectedScore(white.rating, black.rating);
  const expectedBlack = expectedScore(black.rating, white.rating);
  const newWhite = Math.round(white.rating + k * (scoreWhite - expectedWhite));
  const newBlack = Math.round(black.rating + k * ((1 - scoreWhite) - expectedBlack));
  db.prepare('UPDATE users SET rating = ?, updated_at = ? WHERE id = ?').run(newWhite, now(), whiteId);
  db.prepare('UPDATE users SET rating = ?, updated_at = ? WHERE id = ?').run(newBlack, now(), blackId);
  db.prepare('INSERT INTO ratings (user_id, game_id, before_rating, after_rating, delta, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(whiteId, gameId, white.rating, newWhite, newWhite - white.rating, now());
  db.prepare('INSERT INTO ratings (user_id, game_id, before_rating, after_rating, delta, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(blackId, gameId, black.rating, newBlack, newBlack - black.rating, now());
}
function updateGameRecords(whiteId?: string, blackId?: string, result = '*') {
  if (!whiteId || !blackId) return;
  if (result === '1-0') {
    updateUserRecord(whiteId, { wins: 1, streakIncrement: true });
    updateUserRecord(blackId, { losses: 1, streakReset: true });
    return;
  }
  if (result === '0-1') {
    updateUserRecord(whiteId, { losses: 1, streakReset: true });
    updateUserRecord(blackId, { wins: 1, streakIncrement: true });
    return;
  }
  if (result === '1/2-1/2') {
    updateUserRecord(whiteId, { draws: 1, streakReset: true });
    updateUserRecord(blackId, { draws: 1, streakReset: true });
  }
}
function persistFinishedGame(gameId: string, engine: ChessEngine, whiteId?: string, blackId?: string, result = '*', roomId?: string) {
  const status = engine.getStatus();
  const winnerUserId = result === '1-0' ? whiteId ?? null : result === '0-1' ? blackId ?? null : null;
  const pgn = engine.toPGN({ Result: result });
  db.prepare('UPDATE games SET status = ?, result = ?, winner_user_id = ?, final_fen = ?, pgn = ?, move_count = ?, finished_at = ? WHERE id = ?')
    .run(status.checkmate || status.draw ? 'finished' : 'active', result, winnerUserId, engine.exportFEN(), pgn, engine.history.length, now(), gameId);
  engine.history.forEach((entry, index) => {
    db.prepare('INSERT INTO moves (game_id, ply, san, from_square, to_square, promotion, fen_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(gameId, index + 1, entry.move.san ?? `${entry.move.from}${entry.move.to}`, entry.move.from, entry.move.to, entry.move.promotion ?? null, entry.fenAfter, now());
  });
  if (whiteId && blackId) {
    if (result === '1-0') updateElo(whiteId, blackId, 1, gameId);
    if (result === '0-1') updateElo(whiteId, blackId, 0, gameId);
    if (result === '1/2-1/2') updateElo(whiteId, blackId, 0.5, gameId);
    updateGameRecords(whiteId, blackId, result);
  }
  if (roomId) {
    db.prepare('UPDATE rooms SET current_game_id = NULL, status = ?, updated_at = ? WHERE id = ?').run('waiting', now(), roomId);
  }
  liveGames.delete(gameId);
}

io.use((socket, next) => {
  try {
    const token = String(socket.handshake.auth.token || '');
    socket.data.user = verifyToken(token);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  const auth = socket.data.user as { sub: string; username: string };
  socket.join(`user:${auth.sub}`);
  io.emit('presence:update', { userId: auth.sub, status: 'online' });

  socket.on('room:join', ({ roomId }) => {
    socket.join(`room:${roomId}`);
  });

  socket.on('chat:send', ({ roomId, receiverUserId, content, scope = 'room', messageType = 'text' }, callback) => {
    const broadcastRoomId = roomId ? String(roomId) : null;
    const persistedRoomId = broadcastRoomId && roomExists(broadcastRoomId) ? broadcastRoomId : null;
    const message = {
      id: uuid(),
      roomId: persistedRoomId,
      senderUserId: auth.sub,
      receiverUserId: receiverUserId ?? null,
      scope,
      messageType,
      content: sanitize(String(content || '')),
      createdAt: now(),
    };
    db.prepare('INSERT INTO messages (id, room_id, sender_user_id, receiver_user_id, scope, message_type, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(message.id, message.roomId, message.senderUserId, message.receiverUserId, message.scope, message.messageType, message.content, message.createdAt);
    if (broadcastRoomId) {
      if (persistedRoomId) io.to(`room:${broadcastRoomId}`).emit('chat:message', message);
      else io.to(`game:${broadcastRoomId}`).emit('chat:message', message);
    }
    if (receiverUserId) io.to(`user:${receiverUserId}`).emit('chat:message', message);
    callback?.({ ok: true, message });
  });

  socket.on('voice:signal', ({ targetUserId, payload }) => {
    io.to(`user:${targetUserId}`).emit('voice:signal', { fromUserId: auth.sub, payload });
  });

  socket.on('game:create', ({ roomId, whiteId, blackId, timeControl = 'blitz', incrementSeconds = 0 }, callback) => {
    const gameId = uuid();
    const engine = new ChessEngine();
    liveGames.set(gameId, { engine, whiteId, blackId, roomId, timeControl, incrementSeconds });
    db.prepare('INSERT INTO games (id, white_user_id, black_user_id, mode, status, initial_fen, final_fen, time_control, increment_seconds, started_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(gameId, whiteId ?? null, blackId ?? null, blackId ? 'online' : 'training', 'active', engine.exportFEN(), engine.exportFEN(), timeControl, incrementSeconds, now(), now());
    if (roomId) db.prepare('UPDATE rooms SET current_game_id = ?, status = ?, updated_at = ? WHERE id = ?').run(gameId, 'playing', now(), roomId);
    callback?.({ ok: true, gameId, state: engine.exportState() });
  });

  socket.on('game:join', ({ gameId }) => {
    socket.join(`game:${gameId}`);
    const live = liveGames.get(gameId);
    if (live) socket.emit('game:state', { gameId, state: live.engine.exportState() });
  });

  socket.on('game:move', ({ gameId, move }, callback) => {
    const live = liveGames.get(gameId);
    if (!live) return callback?.({ ok: false, message: 'Game not found' });
    try {
      const parsedMove = moveSchema.parse(move);
      const result = live.engine.makeMove(parsedMove);
      const status = live.engine.getStatus();
      const payload = { gameId, move: result, state: live.engine.exportState() };
      io.to(`game:${gameId}`).emit('game:update', payload);
      if (status.checkmate || status.draw) {
        const finalResult = status.checkmate ? (live.engine.turn === 'w' ? '0-1' : '1-0') : '1/2-1/2';
        persistFinishedGame(gameId, live.engine, live.whiteId, live.blackId, finalResult, live.roomId);
        io.to(`game:${gameId}`).emit('game:finished', { gameId, result: finalResult, state: live.engine.exportState() });
      }
      callback?.({ ok: true, ...payload });
    } catch (error) {
      callback?.({ ok: false, message: (error as Error).message });
    }
  });

  socket.on('game:resign', ({ gameId }, callback) => {
    const live = liveGames.get(gameId);
    if (!live) return callback?.({ ok: false });
    const result = auth.sub === live.whiteId ? '0-1' : '1-0';
    persistFinishedGame(gameId, live.engine, live.whiteId, live.blackId, result, live.roomId);
    io.to(`game:${gameId}`).emit('game:finished', { gameId, result });
    callback?.({ ok: true, result });
  });

  socket.on('disconnect', () => {
    io.emit('presence:update', { userId: auth.sub, status: 'offline' });
  });
});

if (existsSync(resolve(webDistDir, 'index.html'))) {
  app.use(express.static(webDistDir, { index: 'index.html' }));
  app.get(/^(?!\/api|\/socket\.io|\/uploads).*/, (_req, res) => {
    res.sendFile(resolve(webDistDir, 'index.html'));
  });
}

function startServer() {
  return httpServer.listen(PORT, () => {
    console.log(`Royal Square server running on http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app, httpServer, startServer };
