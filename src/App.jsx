import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { 
  Trophy, UserPlus, Share2, Undo2, Play, Pause, AlertCircle
} from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
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

// --- Ticket Generation & Prize Detection Logic (Remains unchanged) ---
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
  return { id, data: JSON.stringify(ticket), status: 'available', playerName: null, bookedAt: null };
};

const checkPrize = (ticketJson, called, prizeId) => {
  const data = JSON.parse(ticketJson);
  const set = new Set(called);
  const rows = data.map(r => r.filter(n => n !== 0));
  const all = data.flat().filter(n => n !== 0);
  switch (prizeId) {
    case 'earlyFive': return all.filter(n => set.has(n)).length >= 5;
    case 'topLine': return rows[0].every(n => set.has(n));
    case 'midLine': return rows[1].every(n => set.has(n));
    case 'botLine': return rows[2].every(n => set.has(n));
    case 'fullHouse': return all.every(n => set.has(n));
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
  const [inputCode, setInputCode] = useState('');

  useEffect(() => {
    // 1. Role separation based on URL path
    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const gid = params.get('gameId');

    if (path === '/admin') {
      setRole('admin');
      setView('admin-landing');
    } else {
      setRole('player');
      if (gid) {
        setGameId(gid);
        setView('player-join');
      } else {
        setView('player-landing');
      }
    }

    signInAnonymously(auth);
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!gameId || !user) return;
    return onSnapshot(doc(db, 'games', gameId), (s) => s.exists() && setGameData(s.data()));
  }, [gameId, user]);

  // Admin Game Loop (Remains unchanged)
  useEffect(() => {
    let t;
    if (role === 'admin' && gameData?.status === 'active' && !gameData?.isPaused) {
      t = setInterval(() => {
        const pool = Array.from({length: 90}, (_, i) => i + 1).filter(n => !gameData.calledNumbers.includes(n));
        if (pool.length > 0) {
          const next = pool[Math.floor(Math.random() * pool.length)];
          const newCalled = [...gameData.calledNumbers, next];
          const winners = {...gameData.winners};
          ['earlyFive', 'topLine', 'midLine', 'botLine', 'fullHouse'].forEach(pId => {
            if (!winners[pId]) {
              const won = gameData.tickets.filter(tk => tk.status === 'booked' && checkPrize(tk.data, newCalled, pId));
              if (won.length > 0) winners[pId] = won.map(w => ({playerName: w.playerName, ticketId: w.id}));
            }
          });
          updateDoc(doc(db, 'games', gameId), { calledNumbers: newCalled, winners });
        }
      }, 5000);
    }
    return () => clearInterval(t);
  }, [role, gameData, gameId]);

  const createGame = async () => {
    const id = Math.random().toString(36).substring(2, 7).toUpperCase();
    const tickets = Array.from({length: 60}, (_, i) => generateTicket(i + 1));
    await setDoc(doc(db, 'games', id), {
      id, status: 'booking', tickets, calledNumbers: [], winners: {}, isPaused: true, createdAt: Date.now()
    });
    setGameId(id); setView('admin-dashboard');
  };

  const bookTicket = async () => {
    if (!bookingName || !gameData) return;
    const tks = [...gameData.tickets];
    const idx = tks.findIndex(t => t.status === 'available');
    if (idx !== -1) {
      tks[idx] = {...tks[idx], status: 'booked', playerName: bookingName};
      await updateDoc(doc(db, 'games', gameId), { tickets: tks });
      setBookingName('');
    }
  };

  const myTickets = useMemo(() => gameData?.tickets.filter(t => t.playerName === playerName) || [], [gameData, playerName]);

  // --- RENDERING LOGIC ---

  // ADMIN INTERFACE
  if (role === 'admin') {
    if (view === 'admin-landing') {
      return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
          <div className="text-center">
            <h1 className="text-4xl font-black text-white mb-8">Host Portal</h1>
            <button onClick={createGame} className="bg-indigo-600 text-white px-12 py-6 rounded-3xl font-bold text-xl shadow-2xl hover:scale-105 transition-transform">
              Create New Match
            </button>
          </div>
        </div>
      );
    }

    if (view === 'admin-dashboard' && gameData) {
      return (
        <div className="min-h-screen bg-slate-50 p-4 max-w-4xl mx-auto space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase">Game Code</p>
              <h2 className="text-2xl font-black text-indigo-600">{gameId}</h2>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}?gameId=${gameId}`); alert("Link Copied!"); }} className="bg-slate-100 p-3 rounded-xl flex items-center gap-2 font-bold text-sm"><Share2 size={18}/> Share Join Link</button>
          </div>
          <div className="bg-white p-6 rounded-3xl shadow-sm space-y-4">
            <h3 className="font-bold text-slate-700">Assign Tickets</h3>
            <div className="flex gap-2">
              <input value={bookingName} onChange={e => setBookingName(e.target.value)} placeholder="Player Name" className="flex-1 bg-slate-50 p-4 rounded-2xl outline-none border-2 border-transparent focus:border-indigo-500 transition-all" />
              <button onClick={bookTicket} className="bg-slate-900 text-white px-8 rounded-2xl font-bold">Book</button>
            </div>
          </div>
          <button 
            onClick={() => updateDoc(doc(db, 'games', gameId), {status: 'active', isPaused: !gameData.isPaused})}
            className={`w-full p-6 rounded-3xl font-black text-white shadow-lg ${gameData.isPaused ? 'bg-emerald-500' : 'bg-amber-500'}`}
          >
            {gameData.status === 'booking' ? 'Start Match' : gameData.isPaused ? 'Resume Number Calling' : 'Pause Number Calling'}
          </button>
        </div>
      );
    }
  }

  // PLAYER INTERFACE
  if (role === 'player') {
    if (view === 'player-landing') {
      return (
        <div className="min-h-screen bg-white flex items-center justify-center p-6">
          <div className="max-w-sm w-full text-center">
            <div className="bg-indigo-600 w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-white rotate-3 shadow-xl">
              <Trophy size={40} />
            </div>
            <h1 className="text-3xl font-black text-slate-900 mb-8">Tambola Live</h1>
            <div className="space-y-4">
              <input 
                value={inputCode} 
                onChange={(e) => setInputCode(e.target.value.toUpperCase())} 
                placeholder="ENTER GAME CODE" 
                maxLength={5}
                className="w-full bg-slate-50 border-2 border-slate-100 p-6 rounded-[2rem] text-center font-black text-2xl outline-none focus:border-indigo-500 transition-all"
              />
              <button 
                disabled={inputCode.length < 5}
                onClick={() => { setGameId(inputCode); setView('player-join'); }}
                className="w-full bg-slate-900 text-white p-6 rounded-[2rem] font-black text-lg disabled:opacity-20 shadow-xl active:scale-95 transition-all"
              >
                Join Match
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (view === 'player-join') {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white p-10 rounded-[3rem] shadow-xl text-center border border-slate-100">
            <UserPlus size={48} className="mx-auto text-indigo-600 mb-4" />
            <h2 className="text-2xl font-black mb-2 text-slate-800">Identify Yourself</h2>
            <p className="text-slate-500 mb-8 font-medium">Enter the name the host used for your ticket</p>
            <input value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="Your Name" className="w-full bg-slate-50 p-5 rounded-[2rem] text-center font-bold text-xl mb-4 outline-none border-2 border-transparent focus:border-indigo-500" />
            <button onClick={() => myTickets.length > 0 ? setView('player-view') : alert('No tickets found. Ask host to assign you a ticket using this name.')} className="w-full bg-indigo-600 text-white p-5 rounded-[2rem] font-black text-lg shadow-lg">View My Tickets</button>
          </div>
        </div>
      );
    }

    if (view === 'player-view' && gameData) {
      return (
        <div className="min-h-screen bg-slate-50 p-4 max-w-xl mx-auto space-y-6 pb-12">
          <div className="bg-slate-900 text-white p-12 rounded-[3rem] text-center shadow-2xl">
            <p className="text-[10px] font-black uppercase opacity-40 mb-2 tracking-widest">Number Called</p>
            <div className="text-8xl font-black tabular-nums">{gameData.calledNumbers[gameData.calledNumbers.length-1] || '--'}</div>
          </div>
          <div className="space-y-4">
            {myTickets.map(t => (
              <div key={t.id} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase">Ticket #{t.id}</span>
                </div>
                <div className="grid grid-cols-9 gap-1.5">
                  {JSON.parse(t.data).map((row, rIdx) => row.map((n, cIdx) => (
                    <div key={`${rIdx}-${cIdx}`} className={`aspect-square flex items-center justify-center text-xs sm:text-base font-black rounded-xl border-2 transition-all ${n === 0 ? 'bg-slate-50 border-transparent' : gameData.calledNumbers.includes(n) ? 'bg-emerald-500 text-white border-emerald-400 shadow-lg scale-105' : 'bg-white border-slate-100 text-slate-700'}`}>
                      {n !== 0 && n}
                    </div>
                  )))}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
    </div>
  );
}
