import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { 
  Trophy, UserPlus, Share2, Undo2, Play, Pause, AlertCircle, Trash2, Ticket as TicketIcon, Clock, CheckCircle2, Award, Hash, LayoutGrid, UserCheck
} from 'lucide-react';

// --- STABLE FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyAKpiq88GO0vgRdkAY4BI-C0lG9mmvN3TA",
  authDomain: "tambola-live-1dae5.firebaseapp.com",
  projectId: "tambola-live-1dae5",
  storageBucket: "tambola-live-1dae5.firebasestorage.app",
  messagingSenderId: "883669512130",
  appId: "1:883669512130:web:72efde7bebeed4cd4f705b",
  measurementId: "G-NLMJ1L53BQ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Logic Helpers (Prize & Ticket Gen) - KEPT INTACT ---
const checkPrize = (ticketJson, called, prizeId, previousWinners = []) => {
  const data = JSON.parse(ticketJson);
  const set = new Set(called);
  const rows = data.map(r => r.filter(n => n !== 0));
  const all = data.flat().filter(n => n !== 0);

  switch (prizeId) {
    case '1st Line': return rows[0].every(n => set.has(n));
    case '2nd Line': return rows[1].every(n => set.has(n));
    case '3rd Line': return rows[2].every(n => set.has(n));
    case 'Corners': {
      const corners = [data[0][0], data[0][8], data[2][0], data[2][8]].filter(n => n !== 0);
      return corners.every(n => set.has(n));
    }
    case 'Star Pattern': {
      const starCells = [data[1][4], data[0][0], data[0][8], data[2][0], data[2][8]].filter(n => n !== 0);
      return starCells.every(n => set.has(n));
    }
    case 'Full House': return all.every(n => set.has(n));
    case '2nd Full House': {
      const hasWonFirstFH = previousWinners.some(w => w.type === 'Full House' && w.ticketId === JSON.parse(ticketJson).id);
      return !hasWonFirstFH && all.every(n => set.has(n));
    }
    default: return false;
  }
};

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

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('player'); 
  const [view, setView] = useState('loading');
  const [gameId, setGameId] = useState('');
  const [gameCodeInput, setGameCodeInput] = useState('');
  const [gameData, setGameData] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');

  // Admin Config State
  const [ticketCount, setTicketCount] = useState(30);
  const [enabledPrizes, setEnabledPrizes] = useState(['1st Line', '2nd Line', '3rd Line', 'Full House']);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isAdmin = params.get('admin') === 'true' || window.location.pathname.includes('/admin');
    const gid = params.get('gameId');

    if (isAdmin) {
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

    signInAnonymously(auth).catch(e => console.error("Auth Error", e));
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!gameId || !user) return;
    const gameRef = doc(db, 'games', gameId);
    return onSnapshot(gameRef, (s) => {
      if (s.exists()) {
        setGameData(s.data());
        setError('');
      } else {
        setError('Invalid Game Code');
      }
    });
  }, [gameId, user]);

  // Admin Game Loop - KEPT INTACT
  useEffect(() => {
    let t;
    if (role === 'admin' && gameData?.status === 'active' && !gameData?.isPaused) {
      t = setInterval(async () => {
        const pool = Array.from({length: 90}, (_, i) => i + 1).filter(n => !gameData.calledNumbers.includes(n));
        if (pool.length > 0) {
          const next = pool[Math.floor(Math.random() * pool.length)];
          const newCalled = [...gameData.calledNumbers, next];
          const winners = [...(gameData.winners || [])];
          
          gameData.tickets.forEach(tk => {
            if (tk.status !== 'booked') return;
            gameData.enabledPrizes.forEach(pType => {
              const alreadyWon = winners.some(w => w.type === pType);
              if (!alreadyWon && checkPrize(tk.data, newCalled, pType, winners)) {
                winners.push({ type: pType, playerName: tk.playerName, ticketId: tk.id, number: next });
              }
            });
          });

          await updateDoc(doc(db, 'games', gameId), { calledNumbers: newCalled, winners });
        }
      }, 5000);
    }
    return () => clearInterval(t);
  }, [role, gameData, gameId]);

  const handleJoinByCode = () => {
    if (!gameCodeInput) return;
    setGameId(gameCodeInput.toUpperCase());
    setView('player-join');
  };

  const createGame = async () => {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    const tickets = Array.from({length: ticketCount}, (_, i) => generateTicket(i + 1));
    await setDoc(doc(db, 'games', id), {
      id, status: 'booking', tickets, enabledPrizes, calledNumbers: [], winners: [], isPaused: true, createdAt: Date.now()
    });
    setGameId(id); setView('admin-dashboard');
  };

  // --- NEW MASTER BOARD LOGIC ---
  const toggleTicketBooking = async (ticketIndex) => {
    const tks = [...gameData.tickets];
    const target = tks[ticketIndex];

    if (target.status === 'available') {
      const name = prompt(`Enter Player Name for Ticket #${target.id}:`);
      if (name) {
        tks[ticketIndex] = { ...target, status: 'booked', playerName: name };
      }
    } else {
      if (window.confirm(`Unbook Ticket #${target.id} from ${target.playerName}?`)) {
        tks[ticketIndex] = { ...target, status: 'available', playerName: null };
      }
    }
    await updateDoc(doc(db, 'games', gameId), { tickets: tks });
  };

  const myTickets = useMemo(() => gameData?.tickets.filter(t => t.playerName?.toLowerCase() === playerName.toLowerCase()) || [], [gameData, playerName]);

  if (view === 'loading') return <div className="min-h-screen flex items-center justify-center font-bold text-slate-400">Loading Tambola...</div>;

  // --- ADMIN UI ---
  if (role === 'admin') {
    if (view === 'admin-init') return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-800 p-8 rounded-[3rem] border border-slate-700 shadow-2xl">
          <Trophy size={48} className="text-indigo-500 mx-auto mb-6" />
          <h1 className="text-2xl font-black text-white text-center mb-8">Setup Game</h1>
          <div className="space-y-6">
            <div>
              <label className="text-slate-400 text-xs font-black uppercase mb-2 block">Total Tickets (Grid Size)</label>
              <input type="number" value={ticketCount} onChange={e => setTicketCount(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 p-4 rounded-2xl text-white font-bold" />
            </div>
            <div>
              <label className="text-slate-400 text-xs font-black uppercase mb-2 block">Prizes</label>
              <div className="grid grid-cols-2 gap-2">
                {['1st Line', '2nd Line', '3rd Line', 'Full House', '2nd Full House', 'Corners', 'Star Pattern'].map(p => (
                  <button key={p} onClick={() => setEnabledPrizes(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])} className={`p-3 rounded-xl text-xs font-bold transition-all ${enabledPrizes.includes(p) ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-500'}`}>{p}</button>
                ))}
              </div>
            </div>
            <button onClick={createGame} className="w-full bg-indigo-600 text-white p-5 rounded-[2rem] font-black text-lg">Create Match</button>
          </div>
        </div>
      </div>
    );

    if (view === 'admin-dashboard' && gameData) return (
      <div className="min-h-screen bg-slate-50 p-6 lg:p-12 max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-8 rounded-[3rem] shadow-sm">
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Game Code</p>
            <h2 className="text-3xl font-black text-slate-900">{gameId}</h2>
          </div>
          <div className="flex gap-3">
             <button onClick={() => updateDoc(doc(db, 'games', gameId), { status: 'active', isPaused: !gameData.isPaused })} className={`px-8 py-4 rounded-2xl text-white font-black flex items-center gap-2 ${gameData.isPaused ? 'bg-emerald-500' : 'bg-amber-500'}`}>{gameData.isPaused ? <Play size={20}/> : <Pause size={20}/>} {gameData.isPaused ? 'START CALLING' : 'PAUSE'}</button>
             <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/?gameId=${gameId}`); alert("Link Copied!"); }} className="bg-slate-100 px-6 py-4 rounded-2xl font-bold text-slate-600"><Share2 size={20}/></button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* 1. MASTER BOARD */}
          <div className="lg:col-span-2 bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
            <h3 className="text-xl font-black mb-6 flex items-center gap-2"><LayoutGrid className="text-indigo-600"/> Master Ticket Board</h3>
            <div className="grid grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3">
              {gameData.tickets.map((t, idx) => (
                <button 
                  key={t.id} 
                  onClick={() => toggleTicketBooking(idx)}
                  className={`aspect-square rounded-2xl flex flex-col items-center justify-center border-2 transition-all ${
                    t.status === 'booked' 
                    ? 'bg-rose-50 border-rose-500 text-rose-600 shadow-rose-100 shadow-md' 
                    : 'bg-slate-50 border-slate-100 text-slate-400 hover:border-indigo-300'
                  }`}
                >
                  <span className="text-[10px] font-black uppercase">Tkt</span>
                  <span className="text-lg font-black">{t.id}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. BOOKED TICKETS DASHBOARD */}
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
              <h3 className="text-xl font-black mb-6 flex items-center gap-2"><UserCheck className="text-emerald-500"/> Booked Dashboard</h3>
              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {gameData.tickets.filter(t => t.status === 'booked').map(t => (
                  <div key={t.id} className="flex justify-between items-center p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <div>
                      <span className="text-[10px] font-black text-emerald-600 uppercase block">Ticket #{t.id}</span>
                      <span className="font-bold text-slate-800">{t.playerName}</span>
                    </div>
                    <button 
                      onClick={() => toggleTicketBooking(gameData.tickets.findIndex(x => x.id === t.id))}
                      className="text-emerald-400 hover:text-rose-500"
                    >
                      <Trash2 size={18}/>
                    </button>
                  </div>
                ))}
                {gameData.tickets.filter(t => t.status === 'booked').length === 0 && <div className="py-8 text-center text-slate-300 italic font-bold">No bookings yet</div>}
              </div>
            </div>

            {/* Winners Preview */}
            <div className="bg-slate-900 p-8 rounded-[3rem] text-white">
               <h3 className="font-black mb-4 flex items-center gap-2 text-indigo-400"><Award size={20}/> Recent Winners</h3>
               <div className="space-y-2">
                 {gameData.winners.slice(-3).reverse().map((w, i) => (
                   <div key={i} className="text-sm bg-slate-800 p-3 rounded-xl border border-slate-700">
                     <span className="font-black text-indigo-400 uppercase text-[10px]">{w.type}</span>
                     <p className="font-bold">{w.playerName} (#{w.number})</p>
                   </div>
                 ))}
               </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- PLAYER UI --- (Kept Intact)
  if (view === 'public-landing') return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6 text-center">
      <div className="max-w-sm w-full">
        <div className="bg-indigo-600 w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-xl rotate-3">
          <Trophy size={40} className="text-white" />
        </div>
        <h1 className="text-4xl font-black text-slate-900 mb-2">Tambola Live</h1>
        <div className="space-y-4">
          <div className="relative">
            <Hash className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
            <input value={gameCodeInput} onChange={e => setGameCodeInput(e.target.value.toUpperCase())} className="w-full bg-slate-50 border-2 p-6 pl-14 rounded-[2rem] text-2xl font-black" placeholder="GAME CODE" maxLength={6}/>
          </div>
          <button onClick={handleJoinByCode} className="w-full bg-slate-900 text-white p-6 rounded-[2rem] font-black text-lg">Join Match</button>
        </div>
      </div>
    </div>
  );

  if (view === 'player-join') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white p-12 rounded-[3.5rem] shadow-xl w-full max-w-md text-center">
        <h2 className="text-3xl font-black mb-2">Identify Yourself</h2>
        <input value={playerName} onChange={e => setPlayerName(e.target.value)} className="w-full bg-slate-50 p-6 rounded-[2rem] mb-6 text-center font-black text-xl" placeholder="Your Name"/>
        <button onClick={() => myTickets.length > 0 ? setView('player-view') : alert("No tickets found for this name.")} className="w-full bg-indigo-600 text-white p-6 rounded-[2rem] font-black text-lg">Join Game</button>
      </div>
    </div>
  );

  if (view === 'player-view' && gameData) return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 max-w-5xl mx-auto space-y-8 pb-24">
      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-slate-900 text-white p-16 rounded-[4rem] text-center shadow-2xl relative">
          <div className="text-[10rem] leading-none font-black tabular-nums">{gameData.calledNumbers[gameData.calledNumbers.length-1] || '--'}</div>
        </div>
        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
          <div className="grid grid-cols-10 gap-2">
            {Array.from({length: 90}, (_, i) => i + 1).map(n => (
              <div key={n} className={`aspect-square flex items-center justify-center text-[10px] font-black rounded-lg ${gameData.calledNumbers.includes(n) ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-200'}`}>{n}</div>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {myTickets.map(t => (
          <div key={t.id} className="bg-white p-10 rounded-[4rem] shadow-xl">
            <div className="grid grid-cols-9 gap-2">
              {JSON.parse(t.data).map((row, rIdx) => row.map((n, cIdx) => (
                <div key={`${rIdx}-${cIdx}`} className={`aspect-square flex items-center justify-center text-xl font-black rounded-2xl border-2 ${n === 0 ? 'bg-slate-50 border-transparent' : gameData.calledNumbers.includes(n) ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-white border-slate-100 text-slate-600'}`}>{n !== 0 && n}</div>
              )))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return null;
}
