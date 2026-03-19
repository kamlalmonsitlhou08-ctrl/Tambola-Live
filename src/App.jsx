import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { 
  Trophy, UserPlus, Share2, Undo2, Play, Pause, AlertCircle, Trash2, Ticket as TicketIcon, Clock, CheckCircle2, Award, Hash, LayoutGrid, UserCheck, Volume2, Timer, Settings
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

// --- FULL PHRASE LIST ---
const tambolaPhrases = {
  1: "Lone ranger / Top of the house number 1", 2: "Kala dhan / do no ka maal", 3: "Happy family", 4: "Knock at the door / Murgi chor", 5: "Hum paanch / Punjab da puttar", 6: "Chopping sticks / Super sixer", 7: "Lucky no. Seven / One hockey stick / God’s in Heaven", 8: "One fat major / Garden gate", 9: "You are mine / Doctor’s time", 10: "A big fat hen", 11: "Two heavenly legs / Two beautiful legs / Sexy legs", 12: "One dozen / Monkeys cousin", 13: "Bakers dozen / Unlucky for some lucky for me no", 14: "Valentine’s Day", 15: "First Patiala", 16: "Sweet sixteen", 17: "Dancing Queen", 18: "Voting age", 19: "End of teens / Goodbye teens", 20: "One score", 21: "President’s salute / All women age", 22: "Two little ducks", 23: "You and me", 24: "Two dozen / Want some more at 24", 25: "Wish to have a wife at 25", 26: "Republic Day", 27: "Gateway to heaven", 28: "Duck and its mate / Overweight at 28", 29: "In your prime / Gin & Wine", 30: "Women get flirty at 30", 31: "Time for fun / Baskin Robbins", 32: "Mouth full / Buckle my shoe", 33: "All the 3s / Two little bees", 34: "Dil mange more / Lions roar", 35: "Jump and jive", 36: "Three dozens / Yardstick", 37: "Mixed luck / More than eleven / Lime and lemon", 38: "Christmas cake", 39: "Watch your waistline", 40: "Naughty forty / Men get naughty", 41: "Life’s begun at 41", 42: "Quit India Movement / Winnie the Pooh", 43: "Down on your knees / Climb a tree", 44: "All the fours / Chor chor", 45: "Halfway there", 46: "Up to tricks", 47: "Year of Independence / Four and seven", 48: "Four dozen / You are not late", 49: "Rise and shine", 50: "Half a century / Golden Jubilee", 51: "Charity begins at 51", 52: "Pack of cards / Weeks in a year", 53: "Stuck in a tree", 54: "Clean the floor / House of bamboo door", 55: "All the fives / Snakes alive at 55", 56: "Pick up sticks", 57: "First war of independence", 58: "Make them wait / Time to retire", 59: "One year to retire", 60: "Five dozen", 61: "Bakers bun", 62: "Turn the screw / Click the two", 63: "Tickle me / Click the three", 64: "Hard core / Catch the chor", 65: "Old age pension", 66: "Chakke pe chakka / All the 6s", 67: "Made in heaven", 68: "Check your weight / Saving grace", 69: "Ulta pulta", 70: "Lucky blind", 71: "Bang the drum / Lucky bachelor", 72: "Lucky 2", 73: "Under the tree / A crutch and a flea", 74: "Still want more / Candy store", 75: "Lucky five / Diamond Jubilee", 76: "Lucky six", 77: "Two hockey sticks / Hum saat saat hai", 78: "Heaven’s gate / Lucky seven", 79: "One more time lucky nine", 80: "Gandhi’s breakfast", 81: "Corner shot", 82: "Last of the two", 83: "India wins Cricket World Cup / Time for tea", 84: "Last of the chors / Seven dozen", 85: "Staying alive / Grandma age", 86: "Between the sticks / Last six", 87: "Grandpa / Fat lady with a crutch", 88: "Two fat ladies", 89: "All but one / Nearly there", 90: "Top of the house / End of the line / As far as we go"
};

// --- LOGIC HELPERS (STABLE) ---
function getPhrase(number) {
  const entry = tambolaPhrases[number];
  if (!entry) return `Number ${number}`;
  const parts = entry.split("/");
  return parts[Math.floor(Math.random() * parts.length)].trim();
}

const generateTicket = (id) => {
  const ticket = Array(3).fill(null).map(() => Array(9).fill(0));
  const colPools = Array.from({ length: 9 }, (_, i) => {
    const start = i === 0 ? 1 : i * 10;
    const end = i === 8 ? 90 : i * 10 + 9;
    return Array.from({ length: end - start + 1 }, (_, k) => start + k);
  });
  for (let r = 0; r < 3; r++) {
    const cols = Array.from({ length: 9 }, (_, i) => i).sort(() => Math.random() - 0.5).slice(0, 5);
    cols.forEach(c => {
      const idx = Math.floor(Math.random() * colPools[c].length);
      ticket[r][c] = colPools[c].splice(idx, 1)[0];
    });
  }
  for (let c = 0; c < 9; c++) {
    const columnValues = [];
    for (let r = 0; r < 3; r++) if (ticket[r][c] !== 0) columnValues.push(ticket[r][c]);
    columnValues.sort((a, b) => a - b);
    let valIdx = 0;
    for (let r = 0; r < 3; r++) if (ticket[r][c] !== 0) ticket[r][c] = columnValues[valIdx++];
  }
  return { id, data: JSON.stringify(ticket), status: 'available', playerName: null };
};

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
      return corners.length === 4 && corners.every(n => set.has(n));
    }
    case 'Star Pattern': {
      const starCells = [data[1][4], data[0][0], data[0][8], data[2][0], data[2][8]].filter(n => n !== 0);
      return starCells.every(n => set.has(n));
    }
    case 'Full House': return all.every(n => set.has(n));
    default: return false;
  }
};

export default function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('player'); 
  const [view, setView] = useState('loading');
  const [gameId, setGameId] = useState('');
  const [gameCodeInput, setGameCodeInput] = useState('');
  const [gameData, setGameData] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [callSpeed, setCallSpeed] = useState(0.8);
  const [callDelay, setCallDelay] = useState(5000);
  const lastCalledRef = useRef(null);

  // --- PROFESSIONAL CALLING STYLE ---
  function speakTambola(number, speed = 0.8) {
    const phrase = getPhrase(number);
    const utterPhrase = new SpeechSynthesisUtterance(phrase);
    utterPhrase.rate = speed;
    const utterNumber = new SpeechSynthesisUtterance(number.toString());
    utterNumber.rate = speed - 0.1;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterPhrase);
    utterPhrase.onend = () => {
      setTimeout(() => speechSynthesis.speak(utterNumber), 600);
    };
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isAdmin = params.get('admin') === 'true' || window.location.pathname.includes('/admin');
    const gid = params.get('gameId');
    const savedAdminGameId = localStorage.getItem("adminGameId");

    if (isAdmin) {
      setRole('admin');
      if (savedAdminGameId) { setGameId(savedAdminGameId); setView('admin-dashboard'); }
      else { setView('admin-init'); }
    } else if (gid) {
      setRole('player'); setGameId(gid); setView('player-join');
    } else {
      setRole('player'); setView('public-landing');
    }
    signInAnonymously(auth);
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!gameId || !user) return;
    const gameRef = doc(db, 'games', gameId);
    return onSnapshot(gameRef, (s) => {
      if (s.exists()) {
        const data = s.data();
        setGameData(data);
        const latest = data.calledNumbers[data.calledNumbers.length - 1];
        if (latest && latest !== lastCalledRef.current) {
          speakTambola(latest, callSpeed);
          lastCalledRef.current = latest;
        }
      }
    });
  }, [gameId, user, callSpeed]);

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
            gameData.enabledPrizes.forEach(p => {
              if (!winners.some(w => w.type === p) && checkPrize(tk.data, newCalled, p)) {
                winners.push({ type: p, playerName: tk.playerName, ticketId: tk.id, number: next });
              }
            });
          });
          await updateDoc(doc(db, 'games', gameId), { calledNumbers: newCalled, winners });
        }
      }, callDelay);
    }
    return () => clearInterval(t);
  }, [role, gameData?.status, gameData?.isPaused, gameId, callDelay, gameData?.calledNumbers]);

  const createGame = async (ticketCount, enabledPrizes) => {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    const tickets = Array.from({length: ticketCount}, (_, i) => generateTicket(i + 1));
    await setDoc(doc(db, 'games', id), {
      id, status: 'booking', tickets, enabledPrizes, calledNumbers: [], winners: [], isPaused: true, createdAt: Date.now()
    });
    localStorage.setItem("adminGameId", id);
    setGameId(id); setView('admin-dashboard');
  };

  if (view === 'loading') return <div className="min-h-screen flex items-center justify-center font-bold text-slate-400">Loading Tambola...</div>;

  if (role === 'admin') {
    if (view === 'admin-init') return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-white">
        <AdminSetup onCreate={createGame} />
      </div>
    );
    return (
      <div className="min-h-screen bg-slate-50 p-6 lg:p-12 max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Game Code</p>
            <h2 className="text-3xl font-black text-slate-900">{gameId}</h2>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-2xl border border-slate-100">
              <Timer size={18} className="text-indigo-500" />
              <input type="range" min="3000" max="6000" step="500" value={callDelay} onChange={(e) => setCallDelay(parseInt(e.target.value))} className="w-24 accent-indigo-600" />
            </div>
            <button onClick={() => updateDoc(doc(db, 'games', gameId), { status: 'active', isPaused: !gameData?.isPaused })} className={`px-8 py-4 rounded-2xl text-white font-black ${gameData?.isPaused ? 'bg-emerald-500' : 'bg-amber-500'}`}>
              {gameData?.isPaused ? 'RESUME' : 'PAUSE'}
            </button>
            <button onClick={() => { localStorage.removeItem("adminGameId"); window.location.reload(); }} className="p-4 rounded-2xl bg-slate-100 text-slate-400"><Trash2 size={20}/></button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-slate-900 text-white p-12 rounded-[4rem] text-center shadow-2xl">
               <div className="text-[10rem] leading-none font-black tabular-nums">
                 {gameData?.calledNumbers[gameData.calledNumbers.length - 1] || '--'}
               </div>
               <div className="mt-6 text-indigo-400 font-bold italic text-sm">
                 {getPhrase(gameData?.calledNumbers[gameData.calledNumbers.length - 1])}
               </div>
            </div>
            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
               <div className="grid grid-cols-10 gap-2">
                 {Array.from({length: 90}, (_, i) => i + 1).map(n => (
                   <div key={n} className={`aspect-square flex items-center justify-center text-xs font-black rounded-lg ${gameData?.calledNumbers[gameData.calledNumbers.length-1] === n ? 'bg-indigo-600 text-white scale-110 shadow-lg' : gameData?.calledNumbers.includes(n) ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-200'}`}>
                     {n}
                   </div>
                 ))}
               </div>
            </div>
          </div>
          <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
            <h3 className="text-xl font-black mb-6 text-emerald-500">Winners</h3>
            <div className="space-y-4">
               {gameData?.winners?.slice().reverse().map((w, i) => (
                 <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-black text-indigo-500 uppercase">{w.type}</span>
                    <p className="font-bold text-slate-800">{w.playerName}</p>
                 </div>
               ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- PLAYER UI ---
  if (view === 'public-landing') return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6 text-center">
      <div className="max-w-sm w-full space-y-8">
        <Trophy size={60} className="text-indigo-600 mx-auto" />
        <h1 className="text-4xl font-black text-slate-900">Tambola Live</h1>
        <input value={gameCodeInput} onChange={e => setGameCodeInput(e.target.value.toUpperCase())} className="w-full bg-slate-50 border-2 p-6 rounded-[2rem] text-2xl font-black outline-none text-center" placeholder="GAME CODE" maxLength={6}/>
        <button onClick={() => { if(gameCodeInput){ setGameId(gameCodeInput); setView('player-join'); } }} className="w-full bg-slate-900 text-white p-6 rounded-[2rem] font-black text-lg">Join</button>
      </div>
    </div>
  );

  if (view === 'player-join') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white p-12 rounded-[3.5rem] shadow-xl w-full max-w-md text-center">
        <h2 className="text-3xl font-black mb-10">Your Name</h2>
        <input value={playerName} onChange={e => setPlayerName(e.target.value)} className="w-full bg-slate-50 p-6 rounded-[2rem] mb-6 text-center font-black text-xl" placeholder="Name"/>
        <button onClick={() => setView('player-view')} className="w-full bg-indigo-600 text-white p-6 rounded-[2rem] font-black text-lg">Enter Game</button>
      </div>
    </div>
  );

  if (view === 'player-view' && gameData) return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 max-w-5xl mx-auto space-y-8 pb-24">
       <div className="bg-slate-900 text-white p-12 rounded-[4rem] text-center shadow-2xl">
          <div className="text-[10rem] leading-none font-black tabular-nums">
            {gameData.calledNumbers[gameData.calledNumbers.length-1] || '--'}
          </div>
          <div className="mt-4 text-indigo-400 font-bold italic text-sm">{getPhrase(gameData.calledNumbers[gameData.calledNumbers.length-1])}</div>
       </div>
       <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {gameData.tickets.filter(t => t.playerName?.toLowerCase() === playerName.toLowerCase()).map(t => (
          <div key={t.id} className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-4 py-2 rounded-full uppercase">Ticket #{t.id}</span>
            </div>
            <div className="grid grid-cols-9 gap-2 p-3 bg-slate-50 rounded-2xl">
              {JSON.parse(t.data).map((row, rIdx) => (
                <div key={rIdx} className="contents">
                  {row.map((n, cIdx) => (
                    <div key={cIdx} className={`aspect-square w-full flex items-center justify-center text-lg font-bold rounded-lg border-2 ${n === 0 ? 'bg-transparent border-transparent' : gameData.calledNumbers.includes(n) ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-white border-slate-100 text-slate-600'}`}>
                      {n !== 0 && n}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="bg-white p-10 rounded-[4rem] shadow-sm border border-slate-100">
         <h3 className="text-xl font-black mb-8">LIVE WINNERS</h3>
         <div className="grid sm:grid-cols-3 gap-4">
            {gameData.winners.slice().reverse().map((w, i) => (
              <div key={i} className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                 <span className="text-[10px] font-black text-indigo-500 uppercase">{w.type}</span>
                 <p className="font-black text-slate-800 text-lg">{w.playerName}</p>
              </div>
            ))}
         </div>
      </div>
    </div>
  );
  return null;
}

function AdminSetup({ onCreate }) {
  const [tickets, setTickets] = useState(30);
  const [prizes, setPrizes] = useState(['1st Line', '2nd Line', '3rd Line', 'Full House']);
  return (
    <div className="max-w-md w-full bg-slate-800 p-8 rounded-[3rem] border border-slate-700 shadow-2xl">
      <h1 className="text-2xl font-black text-center mb-8">Match Setup</h1>
      <div className="space-y-6">
        <input type="number" value={tickets} onChange={e => setTickets(Number(e.target.value))} className="w-full bg-slate-900 p-4 rounded-2xl text-white font-bold" />
        <div className="grid grid-cols-2 gap-2">
          {['1st Line', '2nd Line', '3rd Line', 'Full House', 'Corners', 'Star Pattern'].map(p => (
            <button key={p} onClick={() => setPrizes(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])} className={`p-3 rounded-xl text-xs font-bold ${prizes.includes(p) ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-500'}`}>{p}</button>
          ))}
        </div>
        <button onClick={() => onCreate(tickets, prizes)} className="w-full bg-indigo-600 text-white p-5 rounded-[2rem] font-black text-lg">Launch Game</button>
      </div>
    </div>
  );
}
