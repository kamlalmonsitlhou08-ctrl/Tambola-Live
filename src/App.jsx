import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { 
  Trophy, UserPlus, Share2, Undo2, Play, Pause, AlertCircle, Trash2, Ticket as TicketIcon, Clock, CheckCircle2, Award
} from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'tambola-prod-v1';

// --- Ticket Generation Logic ---
const generateTicket = (id) => {
  const ticket = Array(3).fill(null).map(() => Array(9).fill(0));
  const colPools = Array.from({ length: 9 }, (_, i) => {
    const start = i === 0 ? 1 : i * 10;
    const end = i === 8 ? 90 : i * 10 + 9;
    return Array.from({ length: end - start + 1 }, (_, k) => start + k);
  });
  const colCounts = Array(9).fill(0);
  for (let c = 0; c < 9; c++) {
    const r = Math.floor(Math.random() * 3);
    ticket[r][c] = -1;
    colCounts[c]++;
  }
  for (let r = 0; r < 3; r++) {
    let rowFill = ticket[r].filter(cell => cell === -1).length;
    while (rowFill < 5) {
      const c = Math.floor(Math.random() * 9);
      if (ticket[r][c] === 0 && colCounts[c] < 2) {
        ticket[r][c] = -1;
        colCounts[c]++;
        rowFill++;
      }
    }
  }
  for (let c = 0; c < 9; c++) {
    const colNums = [];
    for (let r = 0; r < 3; r++) if (ticket[r][c] === -1) {
      const idx = Math.floor(Math.random() * colPools[c].length);
      colNums.push(colPools[c].splice(idx, 1)[0]);
    }
    colNums.sort((a, b) => a - b);
    let nIdx = 0;
    for (let r = 0; r < 3; r++) if (ticket[r][c] === -1) ticket[r][c] = colNums[nIdx++];
  }
  return { id, data: JSON.stringify(ticket), status: 'available', playerName: null };
};

// --- Prize Detection Logic ---
const checkPrize = (ticketJson, called, prizeId) => {
  const data = JSON.parse(ticketJson);
  const set = new Set(called);
  const rows = data.map(r => r.filter(n => n !== 0));
  const all = data.flat().filter(n => n !== 0);
  switch (prizeId) {
    case 'Early 5': return all.filter(n => set.has(n)).length >= 5;
    case 'Top Line': return rows[0].every(n => set.has(n));
    case 'Middle Line': return rows[1].every(n => set.has(n));
    case 'Bottom Line': return rows[2].every(n => set.has(n));
    case 'Full House': return all.every(n => set.has(n));
    default: return false;
  }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('player'); 
  const [view, setView] = useState('landing');
  const [gameId, setGameId] = useState('');
  const [gameData, setGameData] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [bookingName, setBookingName] = useState('');

  useEffect(() => {
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const gid = params.get('gameId');

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();

    if (path.includes('/admin')) {
      setRole('admin');
      setView('admin-init');
    } else if (gid) {
      setRole('player');
      setGameId(gid);
      setView('player-join');
    } else {
      setRole('player');
      setView('public-landing');
    }

    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!gameId || !user) return;
    const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'games', gameId);
    return onSnapshot(gameRef, (s) => s.exists() && setGameData(s.data()), (err) => console.error(err));
  }, [gameId, user]);

  // Automatic Game Loop for Admin
  useEffect(() => {
    let t;
    if (role === 'admin' && gameData?.status === 'active' && !gameData?.isPaused) {
      t = setInterval(async () => {
        const pool = Array.from({length: 90}, (_, i) => i + 1).filter(n => !gameData.calledNumbers.includes(n));
        if (pool.length > 0) {
          const next = pool[Math.floor(Math.random() * pool.length)];
          const newCalled = [...gameData.calledNumbers, next];
          const winners = [...(gameData.winners || [])];
          const prizeTypes = ['Early 5', 'Top Line', 'Middle Line', 'Bottom Line', 'Full House'];

          gameData.tickets.forEach(tk => {
            if (tk.status !== 'booked') return;
            prizeTypes.forEach(pType => {
              const alreadyWon = winners.some(w => w.type === pType);
              if (!alreadyWon && checkPrize(tk.data, newCalled, pType)) {
                winners.push({ type: pType, playerName: tk.playerName, ticketId: tk.id, time: Date.now() });
              }
            });
          });

          const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'games', gameId);
          await updateDoc(gameRef, { calledNumbers: newCalled, winners });
        }
      }, 5000);
    }
    return () => clearInterval(t);
  }, [role, gameData, gameId]);

  const createGame = async () => {
    if (!user) return;
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    const tickets = Array.from({length: 100}, (_, i) => generateTicket(i + 1));
    const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'games', id);
    await setDoc(gameRef, {
      id, status: 'booking', tickets, calledNumbers: [], winners: [], isPaused: true, createdAt: Date.now()
    });
    setGameId(id); setView('admin-dashboard');
  };

  const bookTicket = async () => {
    if (!bookingName || !gameData) return;
    const tks = [...gameData.tickets];
    const idx = tks.findIndex(t => t.status === 'available');
    if (idx !== -1) {
      tks[idx] = {...tks[idx], status: 'booked', playerName: bookingName};
      const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'games', gameId);
      await updateDoc(gameRef, { tickets: tks });
      setBookingName('');
    }
  };

  const removeBooking = async (ticketId) => {
    const tks = [...gameData.tickets];
    const idx = tks.findIndex(t => t.id === ticketId);
    if (idx !== -1) {
      tks[idx] = {...tks[idx], status: 'available', playerName: null};
      const gameRef = doc(db, 'artifacts', appId, 'public', 'data', 'games', gameId);
      await updateDoc(gameRef, { tickets: tks });
    }
  };

  const myTickets = useMemo(() => gameData?.tickets.filter(t => t.playerName?.toLowerCase() === playerName.toLowerCase()) || [], [gameData, playerName]);

  // --- UI Components ---

  const AdminInit = () => (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="text-center">
        <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl rotate-3">
          <Trophy size={40} className="text-white" />
        </div>
        <h1 className="text-4xl font-black text-white mb-8 tracking-tight">Admin Control Center</h1>
        <button onClick={createGame} className="bg-indigo-600 hover:bg-indigo-500 text-white px-12 py-6 rounded-3xl font-bold text-xl shadow-xl transition-all hover:scale-105 active:scale-95">
          Create New Match
        </button>
      </div>
    </div>
  );

  const AdminDashboard = () => (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left: Controls */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
            <p className="text-[10px] font-black uppercase text-slate-400 mb-1 tracking-widest">Match Session</p>
            <h2 className="text-3xl font-black text-slate-900 mb-6">{gameId}</h2>
            
            <button 
              onClick={() => {
                const url = `${window.location.origin}/?gameId=${gameId}`;
                navigator.clipboard.writeText(url);
                alert("Join link copied!");
              }}
              className="w-full flex items-center justify-center gap-2 bg-slate-100 p-4 rounded-2xl font-bold text-slate-700 hover:bg-slate-200 transition-colors mb-4"
            >
              <Share2 size={18} /> Copy Player Link
            </button>

            <button 
              onClick={() => updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'games', gameId), {
                status: gameData.status === 'booking' ? 'active' : gameData.status,
                isPaused: !gameData.isPaused
              })}
              className={`w-full p-6 rounded-[2rem] font-black text-lg shadow-lg flex items-center justify-center gap-3 transition-all ${
                gameData.isPaused ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'
              }`}
            >
              {gameData.isPaused ? <><Play fill="currentColor"/> Start Game</> : <><Pause fill="currentColor"/> Stop Game</>}
            </button>
          </div>

          <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-4">Manual Ticket Booking</h3>
            <div className="flex gap-2">
              <input 
                value={bookingName} 
                onChange={e => setBookingName(e.target.value)} 
                placeholder="Enter Player Name" 
                className="flex-1 bg-slate-50 border-2 border-transparent focus:border-indigo-500 p-4 rounded-2xl outline-none font-bold"
              />
              <button onClick={bookTicket} className="bg-slate-900 text-white px-6 rounded-2xl font-bold hover:bg-black">Book</button>
            </div>
          </div>
        </div>

        {/* Right: Dashboard */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
              <TicketIcon className="text-indigo-600" /> Booked Tickets Dashboard
            </h3>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black uppercase text-slate-400 border-b border-slate-50">
                    <th className="pb-4">Ticket ID</th>
                    <th className="pb-4">Player Name</th>
                    <th className="pb-4">Game ID</th>
                    <th className="pb-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {gameData.tickets.filter(t => t.status === 'booked').map(t => (
                    <tr key={t.id} className="group">
                      <td className="py-4 font-black text-indigo-600">#{t.id}</td>
                      <td className="py-4 font-bold text-slate-700">{t.playerName}</td>
                      <td className="py-4 font-medium text-slate-400">{gameId}</td>
                      <td className="py-4 text-right">
                        <button 
                          onClick={() => removeBooking(t.id)}
                          className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-xl transition-all"
                          title="Undo Booking"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {gameData.tickets.filter(t => t.status === 'booked').length === 0 && (
                    <tr>
                      <td colSpan="4" className="py-12 text-center text-slate-400 font-bold italic">No tickets booked yet...</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
              <Award className="text-amber-500" /> Recent Winners
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {gameData.winners?.map((w, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                  <div>
                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">{w.type}</p>
                    <p className="font-bold text-slate-900">{w.playerName}</p>
                  </div>
                  <div className="text-xs font-bold text-amber-500">Ticket #{w.ticketId}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );

  const PublicLanding = () => (
    <div className="min-h-screen bg-white flex items-center justify-center p-6 text-center">
      <div className="max-w-md">
        <div className="bg-indigo-600 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl">
          <TicketIcon className="text-white" size={32} />
        </div>
        <h1 className="text-4xl font-black text-slate-900 mb-4">Tambola Live</h1>
        <p className="text-slate-500 font-medium mb-8">Please use the join link provided by your host to enter the match.</p>
        <div className="p-4 bg-slate-50 rounded-2xl text-slate-400 text-sm font-bold">
          Public hosting is disabled.
        </div>
      </div>
    </div>
  );

  const PlayerJoin = () => (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white p-10 rounded-[3rem] shadow-xl text-center border border-slate-100">
        <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <UserPlus size={32} />
        </div>
        <h2 className="text-2xl font-black mb-2 text-slate-800">Welcome to Tambola</h2>
        <p className="text-slate-500 mb-8 font-medium italic">Join Match ID: {gameId}</p>
        
        <input 
          value={playerName} 
          onChange={e => setPlayerName(e.target.value)} 
          placeholder="Enter Your Name" 
          className="w-full bg-slate-50 p-6 rounded-[2rem] text-center font-bold text-xl mb-4 outline-none border-2 border-transparent focus:border-indigo-500 transition-all" 
        />
        
        <button 
          onClick={() => {
            if (myTickets.length > 0) setView('player-view');
            else alert("No tickets found for this name. Please check with your host.");
          }} 
          className="w-full bg-indigo-600 text-white p-6 rounded-[2rem] font-black text-lg shadow-lg hover:bg-indigo-700 active:scale-95 transition-all"
        >
          Enter Match
        </button>
      </div>
    </div>
  );

  const PlayerView = () => (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 max-w-4xl mx-auto space-y-8 pb-20">
      {/* Real-time Header */}
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 bg-slate-900 text-white p-12 rounded-[3rem] text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-4 left-6 text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Latest Number</div>
          <div className="text-9xl font-black tabular-nums">{gameData.calledNumbers[gameData.calledNumbers.length-1] || '--'}</div>
          {gameData.isPaused && (
            <div className="absolute bottom-4 right-6 flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-widest">
              <Clock size={14}/> Match Paused
            </div>
          )}
        </div>

        <div className="flex-1 bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Board History</h3>
          <div className="grid grid-cols-10 gap-1.5">
            {Array.from({length: 90}, (_, i) => i + 1).map(n => (
              <div 
                key={n} 
                className={`aspect-square flex items-center justify-center text-[10px] font-black rounded-lg transition-all ${
                  gameData.calledNumbers.includes(n) 
                  ? 'bg-emerald-500 text-white shadow-sm' 
                  : 'bg-slate-50 text-slate-300'
                }`}
              >
                {n}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Winner Announcement */}
      {gameData.winners?.length > 0 && (
        <div className="bg-amber-50 p-6 rounded-[2.5rem] border border-amber-100 animate-pulse">
           <div className="flex items-center gap-3 mb-4">
              <Trophy className="text-amber-500" />
              <h3 className="font-black text-amber-800 uppercase text-xs tracking-widest">Recent Winners</h3>
           </div>
           <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
              {gameData.winners.slice().reverse().map((w, i) => (
                <div key={i} className="flex-shrink-0 bg-white px-6 py-4 rounded-2xl shadow-sm border border-amber-200">
                   <p className="text-[10px] font-black text-amber-500 uppercase">{w.type}</p>
                   <p className="font-bold text-slate-900">{w.playerName}</p>
                </div>
              ))}
           </div>
        </div>
      )}

      {/* Prizes List */}
      <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Prizes Status</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {['Early 5', 'Top Line', 'Middle Line', 'Bottom Line', 'Full House'].map(pType => {
            const winner = gameData.winners?.find(w => w.type === pType);
            return (
              <div key={pType} className={`p-4 rounded-2xl border ${winner ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                <p className="text-[8px] font-black text-slate-400 uppercase mb-1">{pType}</p>
                {winner ? (
                  <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
                    <CheckCircle2 size={14}/> {winner.playerName}
                  </div>
                ) : (
                  <p className="text-sm font-bold text-slate-300">Available</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* My Tickets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {myTickets.map(t => (
          <div key={t.id} className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100 relative overflow-hidden">
            <div className="flex justify-between items-center mb-6">
              <div className="text-xs font-black text-indigo-600 bg-indigo-50 px-4 py-1.5 rounded-full uppercase tracking-tighter">Ticket #{t.id}</div>
              <div className="text-xs font-bold text-slate-300">{playerName}</div>
            </div>
            <div className="grid grid-cols-9 gap-1.5">
              {JSON.parse(t.data).map((row, rIdx) => row.map((n, cIdx) => (
                <div 
                  key={`${rIdx}-${cIdx}`} 
                  className={`aspect-square flex items-center justify-center text-xs sm:text-lg font-black rounded-2xl border-2 transition-all duration-500 ${
                    n === 0 
                    ? 'bg-slate-50 border-transparent' 
                    : gameData.calledNumbers.includes(n) 
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-200 shadow-lg scale-105' 
                      : 'bg-white border-slate-50 text-slate-600'
                  }`}
                >
                  {n !== 0 && n}
                </div>
              )))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Main Render Switch
  if (role === 'admin') {
    return view === 'admin-init' ? <AdminInit /> : <AdminDashboard />;
  }

  if (view === 'public-landing') return <PublicLanding />;
  if (view === 'player-join') return <PlayerJoin />;
  if (view === 'player-view' && gameData) return <PlayerView />;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
    </div>
  );
}
