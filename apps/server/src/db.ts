import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function resolveDatabasePath() {
  if (process.env.DATABASE_URL?.startsWith('sqlite://')) {
    return process.env.DATABASE_URL.replace('sqlite://', '');
  }

  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('://')) {
    return process.env.DATABASE_URL;
  }

  if (process.env.DB_PATH) {
    return process.env.DB_PATH;
  }

  return resolve(process.cwd(), process.env.RENDER === 'true' ? 'var/data/royal-square.sqlite' : 'data/royal-square.sqlite');
}

const DB_PATH = resolveDatabasePath();
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_url TEXT,
      bio TEXT DEFAULT '',
      rating INTEGER DEFAULT 1200,
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      draws INTEGER DEFAULT 0,
      streak INTEGER DEFAULT 0,
      max_streak INTEGER DEFAULT 0,
      average_think_ms INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      language TEXT DEFAULT 'ar',
      theme TEXT DEFAULT 'dark'
    );

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      white_user_id TEXT,
      black_user_id TEXT,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      result TEXT DEFAULT '*',
      winner_user_id TEXT,
      initial_fen TEXT NOT NULL,
      final_fen TEXT NOT NULL,
      pgn TEXT DEFAULT '',
      time_control TEXT NOT NULL,
      increment_seconds INTEGER DEFAULT 0,
      move_count INTEGER DEFAULT 0,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (white_user_id) REFERENCES users(id),
      FOREIGN KEY (black_user_id) REFERENCES users(id),
      FOREIGN KEY (winner_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS moves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id TEXT NOT NULL,
      ply INTEGER NOT NULL,
      san TEXT NOT NULL,
      from_square TEXT NOT NULL,
      to_square TEXT NOT NULL,
      promotion TEXT,
      fen_after TEXT NOT NULL,
      clock_white_ms INTEGER,
      clock_black_ms INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      host_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      visibility TEXT NOT NULL,
      password_hash TEXT,
      max_players INTEGER DEFAULT 2,
      status TEXT NOT NULL,
      settings_json TEXT NOT NULL,
      current_game_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (host_user_id) REFERENCES users(id),
      FOREIGN KEY (current_game_id) REFERENCES games(id)
    );

    CREATE TABLE IF NOT EXISTS room_members (
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (room_id, user_id),
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS friends (
      user_id TEXT NOT NULL,
      friend_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, friend_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      room_id TEXT,
      sender_user_id TEXT NOT NULL,
      receiver_user_id TEXT,
      scope TEXT NOT NULL,
      message_type TEXT NOT NULL,
      content TEXT NOT NULL,
      attachment_url TEXT,
      edited_at TEXT,
      deleted_at TEXT,
      reply_to_message_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      before_rating INTEGER NOT NULL,
      after_rating INTEGER NOT NULL,
      delta INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      unlocked_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY,
      sound_enabled INTEGER DEFAULT 1,
      music_enabled INTEGER DEFAULT 0,
      board_theme TEXT DEFAULT 'classic',
      piece_theme TEXT DEFAULT 'neo',
      move_input TEXT DEFAULT 'drag',
      locale TEXT DEFAULT 'ar',
      theme_mode TEXT DEFAULT 'dark',
      voice_input_device TEXT,
      voice_output_device TEXT,
      voice_volume INTEGER DEFAULT 100,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wallets (
      user_id TEXT PRIMARY KEY,
      coins INTEGER DEFAULT 0,
      gems INTEGER DEFAULT 0,
      tickets INTEGER DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      currency TEXT NOT NULL,
      amount INTEGER NOT NULL,
      metadata_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS gifts (
      id TEXT PRIMARY KEY,
      sender_user_id TEXT NOT NULL,
      receiver_user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      decided_at TEXT,
      FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
}
