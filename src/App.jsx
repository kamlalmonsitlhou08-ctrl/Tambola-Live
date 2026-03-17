import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { 
  Trophy, UserPlus, Share2, Undo2, Play, Pause, AlertCircle, Trash2, Ticket as TicketIcon, Clock, CheckCircle2, Award
} from 'lucide-react';

// --- STABLE FIREBASE CONFIG ---
// Replace the placeholders with your actual keys if the __firebase_config check fails
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

// --- Logic Helpers (unchanged) ---
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
  const [view, setView] = useState('loading');
  const [gameId, setGameId] = useState('');
  const [gameData, setGameData] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [bookingName, setBookingName] = useState('');

  useEffect(() => {
    // Detect Admin via URL param ?admin=true or path /admin
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
    // Use the document path directly to ensure compatibility
    const gameRef = doc(db, 'games', gameId);
    return onSnapshot(gameRef, (s) => {
      if (s.exists()) setGameData(s.data());
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
          const prizeTypes = ['Early 5', 'Top Line', 'Middle Line', 'Bottom Line', 'Full House'];

          gameData.tickets.forEach(tk => {
            if (tk.status !== 'booked') return;
            prizeTypes.forEach(pType => {
              if (!winners.some(w => w.type === pType) && checkPrize(tk.data, newCalled, pType)) {
                winners.push({ type: pType, playerName: tk.playerName, ticketId: tk.id, time: Date.now() });
              }
            });
          });

          await updateDoc(doc(db, 'games', gameId), { calledNumbers: newCalled, winners });
        }
      }, 5000);
    }
    return () => clearInterval(t);
  }, [role, gameData, gameId]);

  const createGame = async () => {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    const tickets = Array.from({length: 100}, (_, i) => generateTicket(i + 1));
    await setDoc(doc(db, 'games', id), {
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

  // --- UI Renders ---

  if (view === 'loading') return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  if (role === 'admin') {
    if (view === 'admin-init') return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-4xl font-black text-white mb-8">Admin Portal</h1>
          <button onClick={createGame} className="bg-indigo-600 text-white px-12 py-6 rounded-3xl font-bold text-xl">Create New Match</button>
        </div>
      </div>
    );

    if (view === 'admin-dashboard' && gameData) return (
      <div className="min-h-screen bg-slate-50 p-6 max-w-6xl mx-auto space-y-6">
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm flex justify-between items-center">
           <h2 className="text-2xl font-black">Game: {gameId}</h2>
           <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/?gameId=${gameId}`); alert("Link Copied!"); }} className="flex items-center gap-2 font-bold text-indigo-600"><Share2 size={18}/> Share Link</button>
        </div>
        
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm">
            <h3 className="font-black mb-4">Booked Tickets Dashboard</h3>
            <div className="space-y-2">
              {gameData.tickets.filter(t => t.status === 'booked').map(t => (
                <div key={t.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                  <span className="font-bold">#{t.id} - {t.playerName}</span>
                  <button onClick={() => removeBooking(t.id)} className="text-red-500"><Trash2 size={18}/></button>
                </div>
              ))}
            </div>
            <div className="mt-6 flex gap-2">
              <input value={bookingName} onChange={e => setBookingName(e.target.value)} className="flex-1 p-3 border rounded-xl" placeholder="Player Name"/>
              <button onClick={bookTicket} className="bg-indigo-600 text-white px-4 rounded-xl font-bold">Book</button>
            </div>
          </div>

          <div className="space-y-6">
            <button 
              onClick={() => updateDoc(doc(db, 'games', gameId), { status: 'active', isPaused: !gameData.isPaused })}
              className={`w-full p-8 rounded-[2.5rem] text-white font-black text-2xl ${gameData.isPaused ? 'bg-emerald-500' : 'bg-amber-500'}`}
            >
              {gameData.status === 'booking' ? 'Start Game' : gameData.isPaused ? 'Resume' : 'Stop'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Player Views
  if (view === 'public-landing') return (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div>
        <TicketIcon size={64} className="mx-auto text-indigo-600 mb-6"/>
        <h1 className="text-3xl font-black mb-4">Tambola Live</h1>
        <p className="text-slate-500">Please use the join link provided by your host.</p>
      </div>
    </div>
  );

  if (view === 'player-join') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white p-10 rounded-[3rem] shadow-xl w-full max-w-md text-center">
        <h2 className="text-2xl font-black mb-6">Enter Match</h2>
        <input value={playerName} onChange={e => setPlayerName(e.target.value)} className="w-full p-4 border-2 rounded-2xl mb-4 text-center font-bold" placeholder="Your Name"/>
        <button onClick={() => myTickets.length > 0 ? setView('player-view') : alert("No tickets found for this name.")} className="w-full bg-indigo-600 text-white p-4 rounded-2xl font-black">Join Game</button>
      </div>
    </div>
  );

  if (view === 'player-view' && gameData) return (
    <div className="min-h-screen bg-slate-50 p-4 max-w-xl mx-auto space-y-6">
      <div className="bg-slate-900 text-white p-12 rounded-[3rem] text-center">
        <div className="text-8xl font-black">{gameData.calledNumbers[gameData.calledNumbers.length-1] || '--'}</div>
      </div>
      {myTickets.map(t => (
        <div key={t.id} className="bg-white p-6 rounded-[2.5rem] shadow-sm">
          <div className="grid grid-cols-9 gap-1">
            {JSON.parse(t.data).map((row, rIdx) => row.map((n, cIdx) => (
              <div key={`${rIdx}-${cIdx}`} className={`aspect-square flex items-center justify-center text-xs font-black rounded-lg ${n === 0 ? 'bg-slate-50' : gameData.calledNumbers.includes(n) ? 'bg-indigo-600 text-white' : 'border'}`}>
                {n !== 0 && n}
              </div>
            )))}
          </div>
        </div>
      ))}
    </div>
  );

  return null;
}
