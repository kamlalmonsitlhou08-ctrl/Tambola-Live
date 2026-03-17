import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { 
  Trophy, UserPlus, Share2, Undo2, Play, Pause, AlertCircle, Trash2, Ticket as TicketIcon, Clock, CheckCircle2, Award, Hash
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
const appId = "tambola-prod-v1"; 

// --- Star Pattern & Prize Logic ---
const checkPrize = (ticketJson, called, prizeId, previousWinners = []) => {
  const data = JSON.parse(ticketJson);
  const set = new Set(called);
  const rows = data.map(r => r.filter(n => n !== 0));
  const all = data.flat().filter(n => n !== 0);

  // Helper for specific positions
  const getCell = (r, c) => data[r][c];
  const isMarked = (r, c) => {
    const val = getCell(r, c);
    return val === 0 || set.has(val);
  };

  switch (prizeId) {
    case '1st Line': return rows[0].every(n => set.has(n));
    case '2nd Line': return rows[1].every(n => set.has(n));
    case '3rd Line': return rows[2].every(n => set.has(n));
    case 'Corners': {
      const corners = [data[0][0], data[0][8], data[2][0], data[2][8]].filter(n => n !== 0);
      return corners.every(n => set.has(n));
    }
    case 'Star Pattern': {
      // Star = Center cell (1, 4) + the 4 corners of the ticket
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
  const [bookingName, setBookingName] = useState('');
  const [error, setError] = useState('');

  // Admin Config State
  const [ticketCount, setTicketCount] = useState(60);
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
    }, (err) => console.error("Firestore Error:", err));
  }, [gameId, user]);

  // Admin Game Loop
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
              // Allow multiple winners for the same prize if claimed at the same number
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
      id, 
      status: 'booking', 
      tickets, 
      enabledPrizes,
      calledNumbers: [], 
      winners: [], 
      isPaused: true, 
      createdAt: Date.now()
    });
    setGameId(id); 
    setView('admin-dashboard');
  };

  const togglePrize = (prize) => {
    setEnabledPrizes(prev => 
      prev.includes(prize) ? prev.filter(p => p !== prize) : [...prev, prize]
    );
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

  const removeBooking = async (ticketId) => {
    const tks = [...gameData.tickets];
    const idx = tks.findIndex(t => t.id === ticketId);
    if (idx !== -1) {
      tks[idx] = {...tks[idx], status: 'available', playerName: null};
      await updateDoc(doc(db, 'games', gameId), { tickets: tks });
    }
  };

  const myTickets = useMemo(() => gameData?.tickets.filter(t => t.playerName?.toLowerCase() === playerName.toLowerCase()) || [], [gameData, playerName]);

  if (view === 'loading') return <div className="flex items-center justify-center min-h-screen text-slate-400 font-bold">Initializing Tambola...</div>;

  // --- ADMIN UI ---
  if (role === 'admin') {
    if (view === 'admin-init') return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-800 p-8 rounded-[3rem] border border-slate-700 shadow-2xl">
          <Trophy size={48} className="text-indigo-500 mx-auto mb-6" />
          <h1 className="text-2xl font-black text-white text-center mb-8">Setup New Match</h1>
          
          <div className="space-y-6">
            <div>
              <label className="text-slate-400 text-xs font-black uppercase mb-2 block">Number of Tickets</label>
              <input type="number" value={ticketCount} onChange={e => setTicketCount(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 p-4 rounded-2xl text-white font-bold outline-none focus:border-indigo-500" />
            </div>

            <div>
              <label className="text-slate-400 text-xs font-black uppercase mb-2 block">Configure Prizes</label>
              <div className="grid grid-cols-2 gap-2">
                {['1st Line', '2nd Line', '3rd Line', 'Full House', '2nd Full House', 'Corners', 'Star Pattern'].map(p => (
                  <button key={p} onClick={() => togglePrize(p)} className={`p-3 rounded-xl text-xs font-bold transition-all ${enabledPrizes.includes(p) ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-900 text-slate-500 border border-slate-700'}`}>{p}</button>
                ))}
              </div>
            </div>

            <button onClick={createGame} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white p-5 rounded-[2rem] font-black text-lg shadow-xl transition-all active:scale-95">Create Match</button>
          </div>
        </div>
      </div>
    );

    if (view === 'admin-dashboard' && gameData) return (
      <div className="min-h-screen bg-slate-50 p-6 lg:p-12 max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Active Game Code</p>
            <h2 className="text-4xl font-black text-slate-900">{gameId}</h2>
          </div>
          <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/?gameId=${gameId}`); alert("Join Link Copied!"); }} className="flex items-center gap-2 bg-white px-6 py-3 rounded-2xl font-bold text-indigo-600 shadow-sm border border-slate-100 hover:bg-slate-50 transition-all"><Share2 size={18}/> Copy Join Link</button>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
              <h3 className="text-xl font-black mb-6 flex items-center gap-2"><TicketIcon className="text-indigo-600"/> Booked Tickets Dashboard</h3>
              <div className="grid md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {gameData.tickets.filter(t => t.status === 'booked').map(t => (
                  <div key={t.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 group">
                    <div>
                      <span className="text-[10px] font-black text-indigo-500 uppercase block">Ticket #{t.id}</span>
                      <span className="font-bold text-slate-800">{t.playerName}</span>
                    </div>
                    <button onClick={() => removeBooking(t.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={20}/></button>
                  </div>
                ))}
                {gameData.tickets.filter(t => t.status === 'booked').length === 0 && <div className="col-span-2 py-12 text-center text-slate-300 font-bold italic">No tickets booked yet...</div>}
              </div>
              <div className="mt-8 pt-8 border-t border-slate-50 flex gap-3">
                <input value={bookingName} onChange={e => setBookingName(e.target.value)} className="flex-1 bg-slate-50 p-4 rounded-2xl border-2 border-transparent focus:border-indigo-500 outline-none font-bold" placeholder="Player Name"/>
                <button onClick={bookTicket} className="bg-slate-900 text-white px-8 rounded-2xl font-black hover:bg-black transition-all">Book</button>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <button 
              onClick={() => updateDoc(doc(db, 'games', gameId), { status: 'active', isPaused: !gameData.isPaused })}
              className={`w-full p-10 rounded-[3rem] text-white font-black text-3xl shadow-2xl transition-all active:scale-95 flex flex-col items-center gap-2 ${gameData.isPaused ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-amber-500 hover:bg-amber-600'}`}
            >
              {gameData.isPaused ? <><Play size={40} fill="currentColor"/> START</> : <><Pause size={40} fill="currentColor"/> PAUSE</>}
            </button>

            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
              <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2"><Award className="text-amber-500"/> Winners</h3>
              <div className="space-y-3">
                {gameData.winners.slice().reverse().map((w, i) => (
                  <div key={i} className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest">{w.type}</p>
                    <p className="font-bold text-slate-900">{w.playerName} <span className="text-slate-400 font-medium">at #{w.number}</span></p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- PLAYER UI ---
  if (view === 'public-landing') return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6 text-center">
      <div className="max-w-sm w-full">
        <div className="bg-indigo-600 w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-xl rotate-3">
          <Trophy size={40} className="text-white" />
        </div>
        <h1 className="text-4xl font-black text-slate-900 mb-2">Tambola Live</h1>
        <p className="text-slate-400 font-medium mb-10">Enter code to join the party</p>
        
        <div className="space-y-4">
          <div className="relative">
            <Hash className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
            <input 
              value={gameCodeInput} 
              onChange={e => setGameCodeInput(e.target.value.toUpperCase())} 
              className={`w-full bg-slate-50 border-2 p-6 pl-14 rounded-[2rem] text-2xl font-black outline-none transition-all ${error ? 'border-red-100 text-red-500' : 'border-slate-100 focus:border-indigo-500'}`} 
              placeholder="GAME CODE"
              maxLength={6}
            />
          </div>
          {error && <p className="text-red-500 text-sm font-bold flex items-center justify-center gap-1"><AlertCircle size={14}/> {error}</p>}
          <button 
            disabled={gameCodeInput.length < 5}
            onClick={handleJoinByCode} 
            className="w-full bg-slate-900 text-white p-6 rounded-[2rem] font-black text-lg shadow-xl disabled:opacity-20 active:scale-95 transition-all"
          >
            Join Match
          </button>
        </div>
      </div>
    </div>
  );

  if (view === 'player-join') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white p-12 rounded-[3.5rem] shadow-xl w-full max-w-md text-center border border-slate-100">
        <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <UserPlus size={40} />
        </div>
        <h2 className="text-3xl font-black mb-2 text-slate-900">Identify Yourself</h2>
        <p className="text-slate-400 font-medium mb-10">Use the same name used for your ticket</p>
        <input value={playerName} onChange={e => setPlayerName(e.target.value)} className="w-full bg-slate-50 p-6 rounded-[2rem] mb-6 text-center font-black text-xl outline-none border-2 border-transparent focus:border-indigo-500 transition-all" placeholder="Your Name"/>
        <button onClick={() => myTickets.length > 0 ? setView('player-view') : alert("No tickets found for this name. Please verify with host.")} className="w-full bg-indigo-600 text-white p-6 rounded-[2rem] font-black text-lg shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">Join Game</button>
      </div>
    </div>
  );

  if (view === 'player-view' && gameData) return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 max-w-5xl mx-auto space-y-8 pb-24">
      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-slate-900 text-white p-16 rounded-[4rem] text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-6 left-1/2 -translate-x-1/2 text-[10px] font-black uppercase opacity-30 tracking-[0.3em]">Latest Number</div>
          <div className="text-[10rem] leading-none font-black tabular-nums">{gameData.calledNumbers[gameData.calledNumbers.length-1] || '--'}</div>
          {gameData.isPaused && <div className="mt-4 inline-flex items-center gap-2 bg-amber-500/20 text-amber-500 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-500/20">Game Paused</div>}
        </div>

        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Board Status</h3>
          <div className="grid grid-cols-10 gap-2">
            {Array.from({length: 90}, (_, i) => i + 1).map(n => (
              <div key={n} className={`aspect-square flex items-center justify-center text-[10px] font-black rounded-lg transition-all duration-500 ${gameData.calledNumbers.includes(n) ? 'bg-indigo-600 text-white shadow-lg scale-110' : 'bg-slate-50 text-slate-200'}`}>
                {n}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {myTickets.map(t => (
          <div key={t.id} className="bg-white p-10 rounded-[4rem] shadow-xl border border-slate-100">
            <div className="flex justify-between items-center mb-8">
               <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-5 py-2 rounded-full uppercase">Ticket #{t.id}</span>
               <span className="text-xs font-bold text-slate-300">{playerName}</span>
            </div>
            <div className="grid grid-cols-9 gap-2">
              {JSON.parse(t.data).map((row, rIdx) => row.map((n, cIdx) => (
                <div key={`${rIdx}-${cIdx}`} className={`aspect-square flex items-center justify-center text-sm md:text-xl font-black rounded-2xl border-2 transition-all duration-700 ${n === 0 ? 'bg-slate-50 border-transparent' : gameData.calledNumbers.includes(n) ? 'bg-emerald-500 text-white border-emerald-400 shadow-emerald-100 shadow-lg scale-105' : 'bg-white border-slate-100 text-slate-600'}`}>
                  {n !== 0 && n}
                </div>
              )))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return null;
}
