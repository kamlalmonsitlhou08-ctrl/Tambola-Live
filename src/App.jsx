import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { 
  Play, Pause, Trophy, Ticket as TicketIcon, 
  Settings, Clock, UserPlus, ShieldCheck, Share2, Undo2, Award, CheckCircle2, XCircle, AlertCircle
} from 'lucide-react';

// --- YOUR FIREBASE CONFIGURATION ---
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

// --- Ticket Generation ---
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
    for (let r = 0; r < 3; r++) {
      if (ticket[r][c] === -1) {
        const idx = Math.floor(Math.random() * colPools[c].length);
        colNums.push(colPools[c].splice(idx, 1)[0]);
      }
    }
    colNums.sort((a, b) => a - b);
    let nIdx = 0;
    for (let r = 0; r < 3; r++) if (ticket[r][c] === -1) ticket[r][c] = colNums[nIdx++];
  }
  return { id, data: JSON.stringify(ticket), status: 'available', playerName: null, bookedAt: null };
};

// --- Prize Detection ---
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
  const [authError, setAuthError] = useState(null);
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
    if (path === '/admin') { setRole('admin'); setView('landing'); }
    else if (gid) { setGameId(gid); setView('join'); }

    const performSignIn = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth Error:", error);
        if (error.code === 'auth/configuration-not-found') {
          setAuthError("Anonymous sign-in is not enabled in your Firebase Console. Please go to Authentication > Sign-in method and enable 'Anonymous'.");
        } else {
          setAuthError(error.message);
        }
      }
    };

    performSignIn();
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!gameId || !user) return;
    const unsubscribe = onSnapshot(doc(db, 'games', gameId), 
      (s) => s.exists() && setGameData(s.data()),
      (err) => console.error("Firestore Error:", err)
    );
    return () => unsubscribe();
  }, [gameId, user]);

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
    if (!user) return;
    const id = Math.random().toString(36).substring(2, 7).toUpperCase();
    const tickets = Array.from({length: 100}, (_, i) => generateTicket(i + 1));
    await setDoc(doc(db, 'games', id), {
      id, status: 'booking', tickets, calledNumbers: [], winners: {}, isPaused: true, createdAt: Date.now()
    });
    setGameId(id); setView('dashboard');
  };

  const bookTicket = async () => {
    if (!bookingName || !gameData || !user) return;
    const tks = [...gameData.tickets];
    const idx = tks.findIndex(t => t.status === 'available');
    if (idx !== -1) {
      tks[idx] = {...tks[idx], status: 'booked', playerName: bookingName, bookedAt: Date.now()};
      await updateDoc(doc(db, 'games', gameId), { tickets: tks });
      setBookingName('');
    }
  };

  const cancelTicket = async (id) => {
    if (!user) return;
    const tks = [...gameData.tickets];
    const idx = tks.findIndex(t => t.id === id);
    tks[idx] = {...tks[idx], status: 'available', playerName: null, bookedAt: null};
    await updateDoc(doc(db, 'games', gameId), { tickets: tks });
  };

  const myTickets = useMemo(() => gameData?.tickets.filter(t => t.playerName === playerName) || [], [gameData, playerName]);

  if (authError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border-t-4 border-red-500">
          <div className="flex justify-center mb-4 text-red-500">
            <AlertCircle size={48} />
          </div>
          <h2 className="text-xl font-bold text-center mb-4 text-slate-800">Authentication Setup Required</h2>
          <p className="text-slate-600 text-center mb-6 leading-relaxed">
            {authError}
          </p>
          <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-500 space-y-2">
            <p>1. Open <a href="https://console.firebase.google.com/" target="_blank" className="text-indigo-600 underline">Firebase Console</a></p>
            <p>2. Select your project: <strong>tambola-live-1dae5</strong></p>
            <p>3. Go to <strong>Authentication</strong> &gt; <strong>Sign-in method</strong></p>
            <p>4. Enable the <strong>Anonymous</strong> provider.</p>
          </div>
          <button 
            onClick={() => window.location.reload()} 
            className="w-full mt-6 bg-indigo-600 text-white p-4 rounded-2xl font-bold shadow-lg hover:bg-indigo-700 transition-colors"
          >
            I've enabled it, Refresh Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-4">
      {!user && (
        <div className="flex items-center justify-center mt-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      )}

      {user && view === 'landing' && role === 'admin' && (
        <div className="max-w-md mx-auto mt-20 text-center">
          <h1 className="text-4xl font-black mb-8 text-slate-800">Admin Console</h1>
          <button onClick={createGame} className="bg-indigo-600 text-white p-6 rounded-2xl w-full font-bold shadow-lg hover:scale-[1.02] transition-transform">
            Create New Game
          </button>
        </div>
      )}

      {user && view === 'dashboard' && gameData && (
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm">
            <h2 className="text-xl font-bold text-slate-800">Game ID: {gameId}</h2>
            <button 
              onClick={() => { 
                const url = `${window.location.origin}${window.location.pathname}?gameId=${gameId}`;
                document.execCommand('copy'); // Fallback for iFrame
                navigator.clipboard?.writeText(url);
                alert("Link copied to clipboard!");
              }} 
              className="text-indigo-600 font-bold flex items-center gap-2"
            >
              <Share2 size={18} /> Copy Join Link
            </button>
          </div>
          
          <div className="bg-white p-6 rounded-2xl shadow-sm space-y-4">
            <h3 className="font-bold border-b pb-2 text-slate-700">Issue Tickets</h3>
            <div className="flex gap-2">
              <input value={bookingName} onChange={e => setBookingName(e.target.value)} placeholder="Player Name" className="flex-1 border p-3 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none" />
              <button onClick={bookTicket} className="bg-indigo-600 text-white px-6 rounded-xl font-bold hover:bg-indigo-700">Book</button>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm">
            <h3 className="font-bold mb-4 text-slate-700">Booked Tickets Dashboard</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {gameData.tickets.filter(t => t.status === 'booked').map(t => (
                <div key={t.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <span className="font-bold text-slate-700 text-sm">Ticket #{t.id} - {t.playerName}</span>
                  <button onClick={() => cancelTicket(t.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Undo2 size={16}/></button>
                </div>
              ))}
            </div>
            {gameData.status === 'booking' && (
              <button onClick={() => updateDoc(doc(db, 'games', gameId), {status: 'active', isPaused: false})} className="w-full mt-6 bg-emerald-500 text-white p-4 rounded-xl font-bold shadow-md hover:bg-emerald-600">
                Start Game Loop
              </button>
            )}
          </div>
        </div>
      )}

      {user && view === 'join' && (
        <div className="max-w-md mx-auto mt-20 bg-white p-8 rounded-3xl shadow-xl text-center">
          <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserPlus size={32} />
          </div>
          <h2 className="text-2xl font-bold mb-4 text-slate-800">Enter Game</h2>
          <p className="text-slate-500 mb-6">Enter your name to see your tickets</p>
          <input 
            value={playerName} 
            onChange={e => setPlayerName(e.target.value)} 
            placeholder="Your Name" 
            className="w-full border p-4 rounded-2xl mb-4 text-center focus:ring-2 focus:ring-indigo-500 outline-none text-lg font-bold" 
          />
          <button 
            onClick={() => myTickets.length > 0 ? setView('play') : alert('No tickets found for this name')} 
            className="w-full bg-indigo-600 text-white p-4 rounded-2xl font-bold shadow-lg hover:bg-indigo-700"
          >
            Join Game
          </button>
        </div>
      )}

      {user && view === 'play' && gameData && (
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="text-center bg-indigo-600 text-white p-8 rounded-3xl shadow-xl relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                <div className="grid grid-cols-10 gap-2 p-2">
                  {Array.from({length: 20}).map((_, i) => <div key={i} className="text-4xl font-bold">#</div>)}
                </div>
             </div>
             <div className="text-7xl font-black mb-2 drop-shadow-lg">{gameData.calledNumbers[gameData.calledNumbers.length-1] || '--'}</div>
             <div className="text-xs uppercase tracking-widest opacity-80 font-bold">Current Called Number</div>
          </div>

          <div className="grid gap-6">
            {myTickets.map(t => (
              <div key={t.id} className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                <div className="flex justify-between items-center mb-4">
                  <div className="text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full tracking-wider uppercase">TICKET #{t.id}</div>
                  <div className="text-xs text-slate-400 font-bold">{t.playerName}</div>
                </div>
                <div className="grid grid-cols-9 gap-1.5">
                  {JSON.parse(t.data).map((row, rIdx) => row.map((n, cIdx) => (
                    <div 
                      key={`${rIdx}-${cIdx}`} 
                      className={`aspect-square flex items-center justify-center text-sm md:text-base font-black rounded-xl transition-all duration-300 ${
                        n === 0 
                        ? 'bg-slate-50' 
                        : gameData.calledNumbers.includes(n) 
                          ? 'bg-emerald-500 text-white shadow-inner scale-100 ring-2 ring-emerald-200' 
                          : 'bg-white border-2 border-slate-100 text-slate-700'
                      }`}
                    >
                      {n || ''}
                    </div>
                  )))}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm">
             <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Trophy className="text-amber-500" /> Recent Numbers
             </h3>
             <div className="flex flex-wrap gap-2">
                {[...gameData.calledNumbers].reverse().slice(1, 11).map(n => (
                  <div key={n} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-sm">
                    {n}
                  </div>
                ))}
             </div>
          </div>
        </div>
      )}
    </div>
  );
      }
