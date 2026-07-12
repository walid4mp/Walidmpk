import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChessEngine, STANDARD_START_FEN } from '../../../packages/shared/src/index';
import type { Socket } from 'socket.io-client';
import { ChessBoard } from './components/ChessBoard';
import { VoiceChatPanel } from './components/VoiceChatPanel';
import { api } from './lib/api';
import { getSocket, resetSocket } from './lib/socket';

interface User {
  id: string;
  username: string;
  email: string;
  rating: number;
  bio?: string;
  avatar_url?: string | null;
  theme: 'light' | 'dark';
  language: 'ar' | 'en' | 'fr';
}

interface AuthState {
  token: string | null;
  user: User | null;
}

interface Room {
  id: string;
  name: string;
  visibility: string;
  max_players: number;
  status: string;
  host_username: string;
  host_user_id?: string;
  member_count: number;
  settings_json: string;
  is_member?: boolean;
}

interface FriendItem {
  friend_user_id: string;
  friend_username: string;
  friend_avatar_url?: string | null;
  friend_rating: number;
  created_at: string;
}

interface IncomingFriendRequest {
  requester_id: string;
  requester_username: string;
  requester_avatar_url?: string | null;
  requester_rating: number;
  created_at: string;
}

interface OutgoingFriendRequest {
  target_id: string;
  target_username: string;
  target_avatar_url?: string | null;
  target_rating: number;
  created_at: string;
}

interface SearchUser {
  id: string;
  username: string;
  rating: number;
  bio?: string;
  avatar_url?: string | null;
}

function persistAuth(token: string | null, user: User | null) {
  if (token) localStorage.setItem('royal-token', token);
  else localStorage.removeItem('royal-token');

  if (user) localStorage.setItem('royal-user', JSON.stringify(user));
  else localStorage.removeItem('royal-user');
}

function useAuth() {
  const [auth, setAuth] = useState<AuthState>(() => ({
    token: localStorage.getItem('royal-token'),
    user: localStorage.getItem('royal-user') ? JSON.parse(localStorage.getItem('royal-user')!) : null,
  }));
  const [booting, setBooting] = useState(true);

  const logout = useCallback(() => {
    persistAuth(null, null);
    resetSocket();
    setAuth({ token: null, user: null });
    setBooting(false);
  }, []);

  const setUser = useCallback((user: User | null) => {
    setAuth((prev) => {
      const next = { ...prev, user };
      persistAuth(next.token, next.user);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!auth.token) return null;
    const response = await api<{ user: User }>('/api/auth/me', { token: auth.token });
    setUser(response.user);
    return response.user;
  }, [auth.token, setUser]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      if (!auth.token) {
        if (!cancelled) setBooting(false);
        return;
      }

      try {
        const response = await api<{ user: User }>('/api/auth/me', { token: auth.token });
        if (cancelled) return;
        setAuth((prev) => {
          const next = { ...prev, user: response.user };
          persistAuth(next.token, next.user);
          return next;
        });
      } catch {
        if (!cancelled) {
          persistAuth(null, null);
          resetSocket();
          setAuth({ token: null, user: null });
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (auth.user?.theme) document.documentElement.dataset.theme = auth.user.theme;
  }, [auth.user?.theme]);

  const login = (token: string, user: User) => {
    persistAuth(token, user);
    setAuth({ token, user });
    setBooting(false);
  };

  return { auth, booting, setUser, login, logout, refresh };
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="card loading-card">
        <div className="spinner" aria-hidden="true" />
        <h2>جاري تحميل WARHEX</h2>
        <p>يتم التحقق من الجلسة وتجهيز الواجهة.</p>
      </div>
    </div>
  );
}

function AppShell({ auth, logout, setUser }: { auth: AuthState; logout: () => void; setUser: (user: User | null) => void }) {
  const { t, i18n } = useTranslation();
  const location = useLocation();

  return (
    <div className="shell">
      <aside className="sidebar card">
        <div>
          <p className="eyebrow">WARHEX · AAA CHESS STRATEGY</p>
          <h1>{t('brand')}</h1>
          <p>منصة شطرنج تنافسية فاخرة: مباريات مباشرة، غرف، أصدقاء، دردشة، صوت، وإعادات لعب داخل هوية WARHEX الموحدة.</p>
        </div>
        <nav className="nav-list">
          <Link className={location.pathname === '/app' ? 'active' : ''} to="/app">اللوبي</Link>
          <Link className={location.pathname === '/app/game' ? 'active' : ''} to="/app/game">اللعب السريع</Link>
          <Link className={location.pathname === '/app/rooms' ? 'active' : ''} to="/app/rooms">الغرف</Link>
          <Link className={location.pathname === '/app/friends' ? 'active' : ''} to="/app/friends">الأصدقاء</Link>
          <Link className={location.pathname === '/app/search' ? 'active' : ''} to="/app/search">البحث</Link>
          <Link className={location.pathname === '/app/leaderboard' ? 'active' : ''} to="/app/leaderboard">المتصدرين</Link>
          <Link className={location.pathname === '/app/history' ? 'active' : ''} to="/app/history">السجل</Link>
          <Link className={location.pathname === '/app/replay' ? 'active' : ''} to="/app/replay">إعادة اللعب</Link>
          <Link className={location.pathname === '/app/profile' ? 'active' : ''} to="/app/profile">الملف الشخصي</Link>
          <Link className={location.pathname === '/app/settings' ? 'active' : ''} to="/app/settings">الإعدادات</Link>
        </nav>
        <div className="sidebar-footer">
          <label className="field compact">
            <span>اللغة</span>
            <select value={i18n.language} onChange={(event) => i18n.changeLanguage(event.target.value)}>
              <option value="ar">العربية</option>
              <option value="en">English</option>
              <option value="fr">Français</option>
            </select>
          </label>
          <button className="btn secondary" type="button" onClick={logout}>{t('logout')}</button>
        </div>
      </aside>
      <main className="page-content">
        <header className="topbar card">
          <div>
            <h2>مرحبًا، {auth.user?.username}</h2>
            <p>تصنيف Elo الحالي: {auth.user?.rating ?? 1200}</p>
          </div>
          <div className="pill-row">
            <span className="pill">Realtime</span>
            <span className="pill">Voice</span>
            <span className="pill">Friends</span>
            <span className="pill">PGN / FEN</span>
          </div>
        </header>
        <Routes>
          <Route index element={<LobbyPage auth={auth} />} />
          <Route path="game" element={<GamePage auth={auth} />} />
          <Route path="rooms" element={<RoomsPage auth={auth} />} />
          <Route path="friends" element={<FriendsPage auth={auth} />} />
          <Route path="search" element={<SearchPage auth={auth} />} />
          <Route path="leaderboard" element={<LeaderboardPage />} />
          <Route path="history" element={<HistoryPage token={auth.token!} />} />
          <Route path="replay" element={<ReplayPage />} />
          <Route path="profile" element={<ProfilePage auth={auth} setUser={setUser} />} />
          <Route path="settings" element={<SettingsPage auth={auth} setUser={setUser} />} />
        </Routes>
      </main>
    </div>
  );
}

function LandingPage() {
  const { t } = useTranslation();
  return (
    <div className="landing">
      <section className="hero card glow">
        <p className="eyebrow">PREMIUM AAA MOBILE CHESS EXPERIENCE</p>
        <h1>{t('brand')}</h1>
        <p>
          اللعب المحلي، اللعب ضد الذكاء الاصطناعي، المباريات المباشرة، الغرف، الصوت، الدردشة، الأصدقاء، البحث، PGN/FEN، وإعادة اللعب — داخل هوية WARHEX السوداء والذهبية.
        </p>
        <div className="hero-actions">
          <Link className="btn" to="/register">ابدأ الآن</Link>
          <Link className="btn secondary" to="/login">تسجيل الدخول</Link>
        </div>
      </section>
      <section className="feature-grid">
        {[
          ['قواعد FIDE كاملة', 'كش، مات، تعادل، تبييت، أون باسون، ترقية، وتكرار الموقف.'],
          ['ذكاء اصطناعي', 'Minimax + Alpha-Beta مع تقييم مراكز ومستويات متعددة.'],
          ['محادثة وصوت', 'Socket.IO للدردشة و WebRTC للتواصل الصوتي أثناء الغرف والمباراة.'],
          ['الأصدقاء والبحث', 'إرسال طلبات صداقة، قبولها، والبحث عن اللاعبين والغرف.'],
        ].map(([title, body]) => (
          <article key={title} className="card">
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </section>
    </div>
  );
}

function AuthPage({ mode, onLogin }: { mode: 'login' | 'register'; onLogin: (token: string, user: User) => void }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ username: '', email: '', password: '' });

  return (
    <div className="auth-layout">
      <form
        className="card auth-card"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            setLoading(true);
            setError('');
            const response = await api<{ token: string; user: User }>(mode === 'login' ? '/api/auth/login' : '/api/auth/register', {
              method: 'POST',
              body: JSON.stringify(mode === 'login' ? { email: form.email, password: form.password } : form),
            });
            onLogin(response.token, response.user);
            navigate('/app');
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setLoading(false);
          }
        }}
      >
        <p className="eyebrow">{mode === 'login' ? 'Welcome back' : 'Create account'}</p>
        <h2>{mode === 'login' ? 'تسجيل الدخول' : 'إنشاء حساب'}</h2>
        {mode === 'register' && (
          <label className="field"><span>اسم المستخدم</span><input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
        )}
        <label className="field"><span>البريد الإلكتروني</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label className="field"><span>كلمة المرور</span><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
        {error && <p className="error-text">{error}</p>}
        <button className="btn" type="submit" disabled={loading}>{loading ? 'جارٍ التنفيذ...' : mode === 'login' ? 'دخول' : 'إنشاء الحساب'}</button>
        <Link className="text-link" to={mode === 'login' ? '/register' : '/login'}>{mode === 'login' ? 'ليس لديك حساب؟' : 'لديك حساب بالفعل؟'}</Link>
      </form>
    </div>
  );
}

function LobbyPage({ auth }: { auth: AuthState }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    api<{ rooms: Room[] }>('/api/rooms', { token: auth.token }).then((response) => setRooms(response.rooms));
  }, [auth.token]);

  return (
    <div className="dashboard-grid">
      <section className="card hero-panel">
        <div>
          <p className="eyebrow">Quick start</p>
          <h3>ابدأ مباراة خلال ثوانٍ</h3>
          <p>اختر بين اللعب المحلي، ضد الذكاء الاصطناعي، أو من داخل غرفة أونلاين.</p>
        </div>
        <div className="inline-actions wrap">
          <button className="btn" type="button" onClick={() => navigate('/app/game?mode=local')}>محلي</button>
          <button className="btn secondary" type="button" onClick={() => navigate('/app/game?mode=ai')}>ضد الكمبيوتر</button>
          <button className="btn secondary" type="button" onClick={() => navigate('/app/rooms')}>إنشاء غرفة</button>
          <button className="btn secondary" type="button" onClick={() => navigate('/app/search')}>البحث</button>
        </div>
      </section>
      <section className="card">
        <div className="section-header"><h3>الغرف الجارية</h3><Link to="/app/rooms">عرض الكل</Link></div>
        <div className="list-grid">
          {rooms.slice(0, 5).map((room) => (
            <article key={room.id} className="list-item">
              <div>
                <strong>{room.name}</strong>
                <p>{room.host_username} · {room.visibility} · {room.member_count}/{room.max_players}</p>
              </div>
              <Link className="btn secondary" to="/app/rooms">فتح</Link>
            </article>
          ))}
          {rooms.length === 0 && <p>لا توجد غرف بعد. أنشئ أول غرفة الآن.</p>}
        </div>
      </section>
      <section className="card">
        <div className="section-header"><h3>ملخص الحساب</h3></div>
        <div className="stats-grid">
          <div><span>اللاعب</span><strong>{auth.user?.username}</strong></div>
          <div><span>Elo</span><strong>{auth.user?.rating ?? 1200}</strong></div>
          <div><span>الوضع</span><strong>{auth.user?.theme === 'dark' ? 'داكن' : 'فاتح'}</strong></div>
        </div>
      </section>
    </div>
  );
}

function GamePage({ auth }: { auth: AuthState }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') || 'local';
  const [fen, setFen] = useState(STANDARD_START_FEN);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [history, setHistory] = useState<string[]>([STANDARD_START_FEN]);
  const [statusText, setStatusText] = useState('جاهز');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameId, setGameId] = useState<string | null>(null);
  const [joinGameId, setJoinGameId] = useState('');
  const [messages, setMessages] = useState<Array<{ senderUserId: string; content: string }>>([]);
  const [chatText, setChatText] = useState('');
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState('');
  const engine = useMemo(() => new ChessEngine(fen), [fen]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    setFen(STANDARD_START_FEN);
    setHistory([STANDARD_START_FEN]);
    setLastMove(null);
    setStatusText('جاهز');
    setMessages([]);
    setGameId(null);
    setJoinGameId('');
  }, [mode]);

  useEffect(() => {
    if (!auth.token) return;
    const instance = getSocket(auth.token);
    setSocket(instance);

    const onChatMessage = (message: { senderUserId: string; content: string }) => setMessages((prev) => [...prev, message]);
    const onGameUpdate = ({ state, move }: any) => {
      setFen(state.fen);
      setLastMove({ from: move.from, to: move.to });
      setHistory((prev) => [...prev, state.fen]);
      setStatusText(state.status.checkmate ? 'كش مات' : state.status.draw ? 'تعادل' : state.status.inCheck ? 'كش' : 'نقلة ناجحة');
    };
    const onGameState = ({ state, gameId: incomingGameId }: any) => {
      setGameId(incomingGameId);
      setFen(state.fen);
      setHistory([state.fen]);
      setStatusText('تم تحميل المباراة الأونلاين');
    };
    const onGameFinished = ({ result }: any) => {
      setStatusText(result === '1/2-1/2' ? 'انتهت المباراة بالتعادل' : `انتهت المباراة: ${result}`);
    };

    instance.on('chat:message', onChatMessage);
    instance.on('game:update', onGameUpdate);
    instance.on('game:state', onGameState);
    instance.on('game:finished', onGameFinished);

    return () => {
      instance.off('chat:message', onChatMessage);
      instance.off('game:update', onGameUpdate);
      instance.off('game:state', onGameState);
      instance.off('game:finished', onGameFinished);
    };
  }, [auth.token]);

  const applyLocalMove = async (move: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }) => {
    if (mode === 'online' && socket && gameId) {
      socket.emit('game:move', { gameId, move }, (response: any) => {
        if (!response?.ok) {
          setStatusText(response?.message || 'تعذر إرسال النقلة');
        }
      });
      return;
    }

    const local = new ChessEngine(fen);
    const result = local.makeMove(move);
    setFen(local.exportFEN());
    setLastMove({ from: result.from, to: result.to });
    setHistory((prev) => [...prev, local.exportFEN()]);
    const status = local.getStatus();
    setStatusText(status.checkmate ? 'كش مات' : status.draw ? 'تعادل' : status.inCheck ? 'كش' : 'دور الطرف الآخر');

    if (mode === 'ai' && !status.checkmate && !status.draw) {
      const response = await api<{ move: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' } | null }>('/api/games/ai', {
        method: 'POST',
        token: auth.token,
        body: JSON.stringify({ fen: local.exportFEN(), depth: 2, color: local.turn }),
      });
      if (response.move) {
        const followUp = new ChessEngine(local.exportFEN());
        const aiMove = followUp.makeMove(response.move);
        setFen(followUp.exportFEN());
        setLastMove({ from: aiMove.from, to: aiMove.to });
        setHistory((prev) => [...prev, followUp.exportFEN()]);
        const nextStatus = followUp.getStatus();
        setStatusText(nextStatus.checkmate ? 'الكمبيوتر أنهى المباراة' : nextStatus.inCheck ? 'أنت تحت كش' : 'دورك');
      }
    }
  };

  const startOnline = () => {
    if (!socket || !auth.user) return;
    socket.emit('game:create', { whiteId: auth.user.id, timeControl: 'rapid', incrementSeconds: 2 }, (response: any) => {
      if (response.ok) {
        setGameId(response.gameId);
        setJoinGameId(response.gameId);
        setFen(response.state.fen);
        setHistory([response.state.fen]);
        socket.emit('game:join', { gameId: response.gameId });
        setStatusText('تم إنشاء مباراة أونلاين');
      }
    });
  };

  const connectToGame = () => {
    if (!socket || !joinGameId.trim()) return;
    socket.emit('game:join', { gameId: joinGameId.trim() });
    setGameId(joinGameId.trim());
    setStatusText('تم الانضمام إلى غرفة المباراة');
  };

  const resignGame = () => {
    if (!socket || !gameId) return;
    socket.emit('game:resign', { gameId }, (response: any) => {
      if (response?.ok) setStatusText(`استسلام: ${response.result}`);
    });
  };

  const sendMessage = () => {
    if (!socket || !chatText.trim()) return;
    socket.emit('chat:send', { roomId: gameId, content: chatText, scope: 'room' });
    setChatText('');
  };

  const recordVoiceMessage = async () => {
    try {
      setVoiceError('');
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('المتصفح لا يدعم التسجيل الصوتي');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      voiceChunksRef.current = [];
      recorder.ondataavailable = (event) => voiceChunksRef.current.push(event.data);
      recorder.onstop = () => {
        const blob = new Blob(voiceChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          socket?.emit('chat:send', { roomId: gameId, content: reader.result, scope: 'room', messageType: 'voice' });
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start();
      setStatusText('جارٍ تسجيل رسالة صوتية لمدّة 5 ثوانٍ');
      setTimeout(() => recorder.stop(), 5000);
    } catch (error) {
      setVoiceError((error as Error).message);
    }
  };

  return (
    <div className="game-layout">
      <section className="card board-panel">
        <div className="section-header">
          <div>
            <h3>ساحة اللعب</h3>
            <p>{mode === 'local' ? 'محلي لاعب ضد لاعب' : mode === 'ai' ? 'لعب ضد الكمبيوتر' : 'مباراة أونلاين'}</p>
          </div>
          <div className="inline-actions wrap">
            {mode === 'online' && <button className="btn secondary" type="button" onClick={startOnline}>بدء مباراة أونلاين</button>}
            {mode === 'online' && <button className="btn secondary" type="button" onClick={resignGame} disabled={!gameId}>استسلام</button>}
            <button className="btn secondary" type="button" onClick={() => navigator.clipboard.writeText(new ChessEngine(fen).toPGN())}>نسخ PGN</button>
            <button className="btn secondary" type="button" onClick={() => navigator.clipboard.writeText(fen)}>نسخ FEN</button>
          </div>
        </div>
        {mode === 'online' && (
          <div className="form-grid compact-grid">
            <label className="field">
              <span>معرّف المباراة</span>
              <input value={joinGameId} onChange={(event) => setJoinGameId(event.target.value)} placeholder="ألصق Game ID" />
            </label>
            <div className="inline-actions stretch-end">
              <button className="btn secondary" type="button" onClick={connectToGame}>انضمام لمباراة</button>
            </div>
          </div>
        )}
        {gameId && <p className="pill-inline">Game ID: <code>{gameId}</code></p>}
        <ChessBoard fen={fen} lastMove={lastMove} onMove={applyLocalMove} />
        <div className="stats-grid board-info">
          <div><span>الدور</span><strong>{engine.turn === 'w' ? 'الأبيض' : 'الأسود'}</strong></div>
          <div><span>الوضع</span><strong>{statusText}</strong></div>
          <div><span>عدد النقلات</span><strong>{Math.max(history.length - 1, 0)}</strong></div>
        </div>
      </section>
      <section className="side-stack">
        <section className="card">
          <div className="section-header"><h3>الدردشة</h3><button className="btn secondary" type="button" onClick={recordVoiceMessage}>رسالة صوتية</button></div>
          {voiceError && <p className="error-text">{voiceError}</p>}
          <div className="chat-box">
            {messages.map((message, index) => (
              <div key={`${message.senderUserId}-${index}`} className="chat-item">
                <strong>{message.senderUserId === auth.user?.id ? 'أنت' : 'لاعب'}</strong>
                {String(message.content).startsWith('data:audio') ? <audio controls src={message.content} /> : <p>{message.content}</p>}
              </div>
            ))}
            {messages.length === 0 && <p>لا توجد رسائل بعد.</p>}
          </div>
          <div className="inline-actions">
            <input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="اكتب رسالة..." />
            <button className="btn" type="button" onClick={sendMessage}>إرسال</button>
          </div>
        </section>
        <VoiceChatPanel socket={socket} targetUserId={targetUserId} />
        <section className="card">
          <div className="section-header"><h3>تحكم بالصوت</h3></div>
          <label className="field compact"><span>معرّف اللاعب المستهدف</span><input value={targetUserId ?? ''} onChange={(event) => setTargetUserId(event.target.value)} placeholder="ضع user id" /></label>
          <p>ضع معرف اللاعب الآخر لتفعيل WebRTC بينكما أثناء التجربة المحلية أو المباراة الأونلاين.</p>
        </section>
      </section>
    </div>
  );
}

function RoomsPage({ auth }: { auth: AuthState }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [members, setMembers] = useState<Record<string, Array<{ user_id: string; username: string; role: string }>>>({});
  const [form, setForm] = useState({ name: '', visibility: 'public', password: '', maxPlayers: 2, timeControl: 'blitz', incrementSeconds: 0 });
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const loadRooms = useCallback(() => api<{ rooms: Room[] }>('/api/rooms', { token: auth.token }).then((response) => setRooms(response.rooms)), [auth.token]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const toggleMembers = async (roomId: string) => {
    if (members[roomId]) {
      setMembers((prev) => {
        const next = { ...prev };
        delete next[roomId];
        return next;
      });
      return;
    }
    const response = await api<{ members: Array<{ user_id: string; username: string; role: string }> }>(`/api/rooms/${roomId}/members`, { token: auth.token });
    setMembers((prev) => ({ ...prev, [roomId]: response.members }));
  };

  return (
    <div className="two-column">
      <section className="card">
        <div className="section-header"><h3>إنشاء غرفة</h3></div>
        <div className="form-grid">
          <label className="field"><span>اسم الغرفة</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label className="field"><span>النوع</span><select value={form.visibility} onChange={(event) => setForm({ ...form, visibility: event.target.value })}><option value="public">عامة</option><option value="private">خاصة</option><option value="password">بكلمة مرور</option></select></label>
          {form.visibility === 'password' && <label className="field"><span>كلمة المرور</span><input value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>}
          <label className="field"><span>عدد اللاعبين</span><input type="number" min={2} max={16} value={form.maxPlayers} onChange={(event) => setForm({ ...form, maxPlayers: Number(event.target.value) })} /></label>
          <label className="field"><span>نوع الوقت</span><select value={form.timeControl} onChange={(event) => setForm({ ...form, timeControl: event.target.value })}><option>bullet</option><option>blitz</option><option>rapid</option><option>classical</option><option>custom</option></select></label>
          <label className="field"><span>Increment</span><input type="number" min={0} max={60} value={form.incrementSeconds} onChange={(event) => setForm({ ...form, incrementSeconds: Number(event.target.value) })} /></label>
        </div>
        <button className="btn" type="button" onClick={async () => {
          try {
            setError('');
            const payload = {
              ...form,
              password: form.visibility === 'password' ? form.password : undefined,
            };
            await api('/api/rooms', { method: 'POST', token: auth.token, body: JSON.stringify(payload) });
            setFeedback('تم إنشاء الغرفة');
            loadRooms();
          } catch (err) {
            setError((err as Error).message);
          }
        }}>إنشاء</button>
        {feedback && <p>{feedback}</p>}
        {error && <p className="error-text">{error}</p>}
      </section>
      <section className="card">
        <div className="section-header"><h3>اللوبي</h3></div>
        <div className="list-grid">
          {rooms.map((room) => (
            <article key={room.id} className="list-item vertical">
              <div className="row-spread full-width">
                <div>
                  <strong>{room.name}</strong>
                  <p>{room.host_username} · {room.visibility} · {room.status}</p>
                </div>
                <span className="pill">{room.member_count}/{room.max_players}</span>
              </div>
              <div className="inline-actions wrap">
                {!room.is_member ? (
                  <button className="btn secondary" type="button" onClick={async () => {
                    try {
                      setError('');
                      await api(`/api/rooms/${room.id}/join`, { method: 'POST', token: auth.token, body: JSON.stringify(room.visibility === 'password' ? { password: prompt('كلمة المرور') || '' } : {}) });
                      setFeedback(`تم الانضمام إلى ${room.name}`);
                      loadRooms();
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}>انضمام</button>
                ) : (
                  <button className="btn secondary" type="button" onClick={async () => {
                    try {
                      setError('');
                      await api(`/api/rooms/${room.id}/leave`, { method: 'POST', token: auth.token });
                      setFeedback(`تم مغادرة ${room.name}`);
                      loadRooms();
                    } catch (err) {
                      setError((err as Error).message);
                    }
                  }}>مغادرة</button>
                )}
                <button className="btn secondary" type="button" onClick={() => toggleMembers(room.id)}>{members[room.id] ? 'إخفاء الأعضاء' : 'عرض الأعضاء'}</button>
              </div>
              {members[room.id] && (
                <div className="list-grid full-width">
                  {members[room.id].map((member) => (
                    <div key={member.user_id} className="table-row">
                      <strong>{member.username}</strong>
                      <span>{member.role === 'host' ? 'Host' : 'Member'}</span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
          {rooms.length === 0 && <p>لا يوجد غرف حالياً.</p>}
        </div>
      </section>
    </div>
  );
}

function FriendsPage({ auth }: { auth: AuthState }) {
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [incoming, setIncoming] = useState<IncomingFriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<OutgoingFriendRequest[]>([]);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const loadFriends = useCallback(async () => {
    const response = await api<{ friends: FriendItem[]; incoming: IncomingFriendRequest[]; outgoing: OutgoingFriendRequest[] }>('/api/friends', { token: auth.token });
    setFriends(response.friends);
    setIncoming(response.incoming);
    setOutgoing(response.outgoing);
  }, [auth.token]);

  useEffect(() => {
    loadFriends().catch((err) => setError((err as Error).message));
  }, [loadFriends]);

  return (
    <div className="two-column">
      <section className="card">
        <div className="section-header"><h3>قائمة الأصدقاء</h3><button className="btn secondary" type="button" onClick={() => navigate('/app/search')}>بحث عن لاعبين</button></div>
        <div className="list-grid">
          {friends.map((friend) => (
            <article key={friend.friend_user_id} className="list-item">
              <div>
                <strong>{friend.friend_username}</strong>
                <p>Elo: {friend.friend_rating}</p>
              </div>
              <button className="btn secondary" type="button" onClick={async () => {
                await api(`/api/friends/${friend.friend_user_id}`, { method: 'DELETE', token: auth.token });
                loadFriends();
              }}>إزالة</button>
            </article>
          ))}
          {friends.length === 0 && <p>لا يوجد أصدقاء بعد.</p>}
        </div>
      </section>
      <section className="card">
        <div className="section-header"><h3>الطلبات الواردة</h3></div>
        <div className="list-grid">
          {incoming.map((request) => (
            <article key={request.requester_id} className="list-item vertical">
              <div className="row-spread full-width">
                <div>
                  <strong>{request.requester_username}</strong>
                  <p>Elo: {request.requester_rating}</p>
                </div>
                <button className="btn" type="button" onClick={async () => {
                  await api(`/api/friends/${request.requester_id}/accept`, { method: 'POST', token: auth.token });
                  loadFriends();
                }}>قبول</button>
              </div>
            </article>
          ))}
          {incoming.length === 0 && <p>لا توجد طلبات واردة.</p>}
        </div>
        <div className="section-header top-gap"><h3>الطلبات المرسلة</h3></div>
        <div className="list-grid">
          {outgoing.map((request) => (
            <article key={request.target_id} className="list-item">
              <div>
                <strong>{request.target_username}</strong>
                <p>بانتظار القبول</p>
              </div>
              <button className="btn secondary" type="button" onClick={async () => {
                await api(`/api/friends/${request.target_id}`, { method: 'DELETE', token: auth.token });
                loadFriends();
              }}>إلغاء</button>
            </article>
          ))}
          {outgoing.length === 0 && <p>لا توجد طلبات مرسلة.</p>}
        </div>
        {error && <p className="error-text">{error}</p>}
      </section>
    </div>
  );
}

function SearchPage({ auth }: { auth: AuthState }) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSearch = async () => {
    try {
      setError('');
      setMessage('');
      const response = await api<{ users: SearchUser[]; rooms: Room[] }>(`/api/search?q=${encodeURIComponent(query)}`, { token: auth.token });
      setUsers(response.users);
      setRooms(response.rooms);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="two-column">
      <section className="card">
        <div className="section-header"><h3>البحث</h3></div>
        <div className="inline-actions">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن لاعب أو غرفة" />
          <button className="btn" type="button" onClick={handleSearch}>بحث</button>
        </div>
        {message && <p>{message}</p>}
        {error && <p className="error-text">{error}</p>}
      </section>
      <section className="card">
        <div className="section-header"><h3>نتائج اللاعبين</h3></div>
        <div className="list-grid">
          {users.map((user) => (
            <article key={user.id} className="list-item vertical">
              <div className="row-spread full-width">
                <div>
                  <strong>{user.username}</strong>
                  <p>{user.bio || 'لا توجد نبذة'} · Elo {user.rating}</p>
                </div>
                <button className="btn secondary" type="button" onClick={async () => {
                  try {
                    await api('/api/friends/request', { method: 'POST', token: auth.token, body: JSON.stringify({ friendId: user.id }) });
                    setMessage(`تم إرسال طلب صداقة إلى ${user.username}`);
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}>إضافة صديق</button>
              </div>
            </article>
          ))}
          {query && users.length === 0 && <p>لا توجد نتائج لاعبين.</p>}
        </div>
        <div className="section-header top-gap"><h3>نتائج الغرف</h3></div>
        <div className="list-grid">
          {rooms.map((room) => (
            <article key={room.id} className="list-item vertical">
              <div>
                <strong>{room.name}</strong>
                <p>{room.host_username} · {room.member_count}/{room.max_players}</p>
              </div>
              <Link className="btn secondary" to="/app/rooms">فتح الغرفة</Link>
            </article>
          ))}
          {query && rooms.length === 0 && <p>لا توجد نتائج غرف.</p>}
        </div>
      </section>
    </div>
  );
}

function LeaderboardPage() {
  const [players, setPlayers] = useState<User[]>([]);
  useEffect(() => {
    api<{ players: User[] }>('/api/leaderboard').then((response) => setPlayers(response.players));
  }, []);
  return (
    <section className="card">
      <div className="section-header"><h3>لوحة المتصدرين</h3></div>
      <div className="table-like">
        {players.map((player, index) => (
          <div key={player.id} className="table-row">
            <span>#{index + 1}</span>
            <strong>{player.username}</strong>
            <span>{player.rating}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function HistoryPage({ token }: { token: string }) {
  const [games, setGames] = useState<any[]>([]);
  useEffect(() => {
    api<{ games: any[] }>('/api/history', { token }).then((response) => setGames(response.games));
  }, [token]);
  return (
    <section className="card">
      <div className="section-header"><h3>سجل المباريات</h3></div>
      <div className="list-grid">
        {games.map((game) => (
          <article key={game.id} className="list-item vertical">
            <strong>{game.white_username || 'White'} vs {game.black_username || 'Black'}</strong>
            <p>{game.time_control} · {game.result} · {game.status}</p>
            <code>{game.final_fen}</code>
          </article>
        ))}
        {games.length === 0 && <p>لا توجد مباريات محفوظة بعد.</p>}
      </div>
    </section>
  );
}

function ReplayPage() {
  const [input, setInput] = useState('');
  const [fens, setFens] = useState<string[]>([STANDARD_START_FEN]);
  const [index, setIndex] = useState(0);
  return (
    <div className="two-column">
      <section className="card board-panel">
        <div className="section-header"><h3>إعادة اللعب والتحليل</h3></div>
        <ChessBoard fen={fens[index] ?? STANDARD_START_FEN} interactive={false} />
        <div className="inline-actions wrap">
          <button className="btn secondary" type="button" onClick={() => setIndex(0)}>البداية</button>
          <button className="btn secondary" type="button" onClick={() => setIndex((value) => Math.max(0, value - 1))}>السابق</button>
          <button className="btn secondary" type="button" onClick={() => setIndex((value) => Math.min(fens.length - 1, value + 1))}>التالي</button>
          <button className="btn secondary" type="button" onClick={() => setIndex(fens.length - 1)}>النهاية</button>
        </div>
      </section>
      <section className="card">
        <div className="section-header"><h3>استيراد PGN أو FEN</h3></div>
        <textarea rows={12} value={input} onChange={(event) => setInput(event.target.value)} placeholder="ألصق PGN أو FEN هنا" />
        <div className="inline-actions wrap">
          <button className="btn" type="button" onClick={() => {
            const text = input.trim();
            if (text.includes('/')) {
              const engine = new ChessEngine(text);
              setFens([engine.exportFEN()]);
              setIndex(0);
              return;
            }
            const engine = new ChessEngine();
            engine.loadPGN(text);
            setFens([STANDARD_START_FEN, ...engine.history.map((entry) => entry.fenAfter)]);
            setIndex(0);
          }}>تحميل</button>
          <button className="btn secondary" type="button" onClick={() => navigator.clipboard.writeText(fens[index] ?? STANDARD_START_FEN)}>نسخ FEN الحالي</button>
        </div>
      </section>
    </div>
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الملف'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

function ProfilePage({ auth, setUser }: { auth: AuthState; setUser: (user: User | null) => void }) {
  const [bio, setBio] = useState(auth.user?.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(auth.user?.avatar_url ?? '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  return (
    <section className="card">
      <div className="section-header"><h3>الملف الشخصي</h3></div>
      <div className="form-grid">
        <label className="field"><span>اسم المستخدم</span><input value={auth.user?.username ?? ''} readOnly /></label>
        <label className="field"><span>رابط الصورة الشخصية</span><input value={avatarUrl ?? ''} onChange={(event) => setAvatarUrl(event.target.value)} /></label>
        <label className="field stretch">
          <span>رفع صورة</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={async (event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              if (!file || !auth.token) return;
              try {
                setUploading(true);
                setError('');
                setMessage('');
                const dataUrl = await readFileAsDataUrl(file);
                const response = await api<{ url: string }>('/api/uploads/image', {
                  method: 'POST',
                  token: auth.token,
                  body: JSON.stringify({ fileName: file.name, dataUrl }),
                });
                setAvatarUrl(response.url);
                setMessage('تم رفع الصورة بنجاح. اضغط حفظ لتثبيتها في الملف الشخصي.');
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setUploading(false);
                input.value = '';
              }
            }}
          />
        </label>
        {avatarUrl && (
          <div className="field stretch">
            <span>معاينة</span>
            <img src={avatarUrl} alt="Avatar preview" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 20, border: '1px solid var(--border)' }} />
          </div>
        )}
        <label className="field stretch"><span>النبذة</span><textarea rows={4} value={bio} onChange={(event) => setBio(event.target.value)} /></label>
      </div>
      <button className="btn" type="button" disabled={!auth.token || uploading} onClick={async () => {
        if (!auth.token) return;
        try {
          setError('');
          const response = await api<{ user: User }>('/api/profile', { method: 'PATCH', token: auth.token, body: JSON.stringify({ bio, avatarUrl }) });
          setUser(response.user);
          setMessage('تم تحديث الملف الشخصي');
        } catch (err) {
          setError((err as Error).message);
        }
      }}>{uploading ? 'جارٍ رفع الصورة...' : 'حفظ'}</button>
      {message && <p>{message}</p>}
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}

function SettingsPage({ auth, setUser }: { auth: AuthState; setUser: (user: User | null) => void }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(auth.user?.theme ?? 'dark');
  const [language, setLanguage] = useState<'ar' | 'en' | 'fr'>(auth.user?.language ?? 'ar');
  const [boardTheme, setBoardTheme] = useState('classic');
  const [moveInput, setMoveInput] = useState('drag');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <section className="card">
      <div className="section-header"><h3>الإعدادات</h3></div>
      <div className="form-grid">
        <label className="field"><span>المظهر</span><select value={theme} onChange={(event) => setTheme(event.target.value as 'light' | 'dark')}><option value="dark">داكن</option><option value="light">فاتح</option></select></label>
        <label className="field"><span>اللغة</span><select value={language} onChange={(event) => setLanguage(event.target.value as 'ar' | 'en' | 'fr')}><option value="ar">العربية</option><option value="en">English</option><option value="fr">Français</option></select></label>
        <label className="field"><span>ألوان الرقعة</span><select value={boardTheme} onChange={(event) => setBoardTheme(event.target.value)}><option value="classic">Classic</option><option value="forest">Forest</option><option value="midnight">Midnight</option></select></label>
        <label className="field"><span>طريقة التحريك</span><select value={moveInput} onChange={(event) => setMoveInput(event.target.value)}><option value="drag">سحب وإفلات</option><option value="click">نقر</option></select></label>
      </div>
      <button className="btn" type="button" disabled={!auth.token} onClick={async () => {
        if (!auth.token) return;
        try {
          setSaved(false);
          setError('');
          const response = await api<{ user: User }>('/api/profile', { method: 'PATCH', token: auth.token, body: JSON.stringify({ theme, language }) });
          setUser(response.user);
          setSaved(true);
        } catch (err) {
          setError((err as Error).message);
        }
      }}>حفظ الإعدادات</button>
      {saved && <p>تم حفظ الإعدادات.</p>}
      {error && <p className="error-text">{error}</p>}
    </section>
  );
}

export default function App() {
  const { auth, booting, login, logout, setUser } = useAuth();

  if (booting) return <LoadingScreen />;

  return (
    <Routes>
      <Route path="/" element={auth.token ? <Navigate to="/app" replace /> : <LandingPage />} />
      <Route path="/login" element={auth.token ? <Navigate to="/app" replace /> : <AuthPage mode="login" onLogin={login} />} />
      <Route path="/register" element={auth.token ? <Navigate to="/app" replace /> : <AuthPage mode="register" onLogin={login} />} />
      <Route path="/app/*" element={auth.token ? <AppShell auth={auth} logout={logout} setUser={setUser} /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
