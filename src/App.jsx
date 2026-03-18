import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, getDoc } from 'firebase/firestore';
import { 
  Trophy, UserPlus, Share2, Undo2, Play, Pause, AlertCircle, Trash2, Ticket as TicketIcon, Clock, CheckCircle2, Award, Hash, LayoutGrid, UserCheck, Volume2, Settings
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

// --- PHRASES (KEPT FULL LIST INTERNALLY) ---
const tambolaPhrases = {
  1: "Lone ranger / Top of the house number 1", 2: "Kala dhan / do no ka maal", 3: "Happy family", 4: "Knock at the door / Murgi chor", 5: "Hum paanch / Punjab da puttar", 6: "Chopping sticks / Super sixer", 7: "Lucky no. Seven / One hockey stick / God’s in Heaven", 8: "One fat major / Garden gate", 9: "You are mine / Doctor’s time", 10: "A big fat hen", 11: "Two heavenly legs / Two beautiful legs / Sexy legs", 12: "One dozen / Monkeys cousin", 13: "Bakers dozen / Unlucky for some lucky for me no", 14: "Valentine’s Day", 15: "First Patiala", 16: "Sweet sixteen", 17: "Dancing Queen", 18: "Voting age", 19: "End of teens / Goodbye teens", 20: "One score", 21: "President’s salute / All women age", 22: "Two little ducks", 23: "You and me", 24: "Two dozen / Want some more at 24", 25: "Wish to have a wife at 25", 26: "Republic Day", 27: "Gateway to heaven", 28: "Duck and its mate / Overweight at 28", 29: "In your prime / Gin & Wine", 30: "Women get flirty at 30", 31: "Time for fun / Baskin Robbins", 32: "Mouth full / Buckle my shoe", 33: "All the 3s / Two little bees", 34: "Dil mange more / Lions roar", 35: "Jump and jive", 36: "Three dozens / Yardstick", 37: "Mixed luck / More than eleven / Lime and lemon", 38: "Christmas cake", 39: "Watch your waistline", 40: "Naughty forty / Men get naughty", 41: "Life’s begun at 41", 42: "Quit India Movement / Winnie the Pooh", 43: "Down on your knees / Climb a tree", 44: "All the fours / Chor chor", 45: "Halfway there", 46: "Up to tricks", 47: "Year of Independence / Four and seven", 48: "Four dozen / You are not late", 49: "Rise and shine", 50: "Half a century / Golden Jubilee", 51: "Charity begins at 51", 52: "Pack of cards / Weeks in a year", 53: "Stuck in a tree", 54: "Clean the floor / House of bamboo door", 55: "All the fives / Snakes alive at 55", 56: "Pick up sticks", 57: "First war of independence", 58: "Make them wait / Time to retire", 59: "One year to retire", 60: "Five dozen", 61: "Bakers bun", 62: "Turn the screw / Click the two", 63: "Tickle me / Click the three", 64: "Hard core / Catch the chor", 65: "Old age pension", 66: "Chakke pe chakka / All the 6s", 67: "Made in heaven", 68: "Check your weight / Saving grace", 69: "Ulta pulta", 70: "Lucky blind", 71: "Bang the drum / Lucky bachelor", 72: "Lucky 2", 73: "Under the tree / A crutch and a flea", 74: "Still want more / Candy store", 75: "Lucky five / Diamond Jubilee", 76: "Lucky six", 77: "Two hockey sticks / Hum saat saat hai", 78: "Heaven’s gate / Lucky seven", 79: "One more time lucky nine", 80: "Gandhi’s breakfast", 81: "Corner shot", 82: "Last of the two", 83: "India wins Cricket World Cup / Time for tea", 84: "Last of the chors / Seven dozen", 85: "Staying alive / Grandma age", 86: "Between the sticks / Last six", 87: "Grandpa / Fat lady with a crutch", 88: "Two fat ladies", 89: "All but one / Nearly there", 90: "Top of the house / End of the line / As far as we go"
};

// --- FEATURE 1: FIX PHRASE SELECTION ---
function getTambolaPhrase(number) {
  const full = tambolaPhrases[number];
  if (!full) return `Number ${number}`;
  const parts = full.split("/");
  const random = parts[Math.floor(Math.random() * parts.length)];
  return random.trim();
}

// --- FEATURE 7: TICKET GENERATION RULE FIX ---
const generateTicket = (id) => {
  const ticket = Array(3).fill(null).map(() => Array(9).fill(0));
  const colPools = Array.from({ length: 9 }, (_, i) => {
    const start = i === 0 ? 1 : i * 10;
    const end = i === 8 ? 90 : i * 10 + 9;
    return Array.from({ length: end - start + 1 }, (_, k) => start + k);
  });

  // Assign 5 numbers per row
  for (let r = 0; r < 3; r++) {
    const cols = Array.from({ length: 9 }, (_, i) => i).sort(() => Math.random() - 0.5).slice(0, 5);
    cols.forEach(c => {
      const idx = Math.floor(Math.random() * colPools[c].length);
      ticket[r][c] = colPools[c].splice(idx, 1)[0];
    });
  }

  // Sort columns vertically
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
    case '2nd Full House': {
      const hasWonFirstFH = previousWinners.some(w => w.type === 'Full House' && w.ticketId === JSON.parse(ticketJson).id);
      return !hasWonFirstFH && all.every(n => set.has(n));
    }
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
  const [error, setError] = useState('');
  const [callSpeed, setCallSpeed] = useState(0.85); // FEATURE 4: SPEED STATE
  
  const lastSpokenNumber = useRef(null); // FEATURE 3: REF PREVENT DOUBLE TRIGGER

  // --- FEATURE 2: SPEAK PHRASE THEN NUMBER ---
  function speakNumber(number, speed = 0.85) {
    const phrase = getTambolaPhrase(number);
    const phraseUtter = new SpeechSynthesisUtterance(phrase);
    phraseUtter.rate = speed;
    const numberUtter = new SpeechSynthesisUtterance(number.toString());
    numberUtter.rate = speed;

    speechSynthesis.cancel();
    speechSynthesis.speak(phraseUtter);

    phraseUtter.onend = () => {
      setTimeout(() => {
        speechSynthesis.speak(numberUtter);
      }, 500);
    };
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isAdmin = params.get('admin') === 'true' || window.location.pathname.includes('/admin');
    const gidFromUrl = params.get('gameId');

    // --- FEATURE 8 & 10: ADMIN PERSISTENCE ---
    const savedAdminGameId = localStorage.getItem("adminGameId");

    if (isAdmin) {
      setRole('admin');
      if (savedAdminGameId) {
        setGameId(savedAdminGameId);
        setView('admin-dashboard');
      } else {
        setView('admin-init');
      }
    } else if (gidFromUrl) {
      setRole('player');
      setGameId(gidFromUrl);
      setView('player-join');
    } else {
      setRole('player');
      setView('public-landing');
    }

    signInAnonymously(auth).catch(e => console.error("Auth Error", e));
    return onAuthStateChanged(auth, setUser);
  }, []);

  // --- FEATURE 9: AUTO RESTORE STATE ---
  useEffect(() => {
    if (!gameId || !user) return;
    const gameRef = doc(db, 'games', gameId);
    return onSnapshot(gameRef, (s) => {
      if (s.exists()) {
        const data = s.data();
        setGameData(data);
        setError('');

        // Trigger Voice if new number
        const latest = data.calledNumbers?.[data.calledNumbers.length - 1];
        if (latest && latest !== lastSpokenNumber.current) {
          speakNumber(latest, callSpeed);
          lastSpokenNumber.current = latest;
        }
      } else {
        setError('Invalid Game Code');
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
            gameData.enabledPrizes.forEach(pType => {
              const alreadyWon = winners.some(w => w.type === pType);
              if (!alreadyWon && checkPrize(tk.data, newCalled, pType, winners)) {
                winners.push({ type: pType, playerName: tk.playerName, ticketId: tk.id, number: next });
              }
            });
          });

          await updateDoc(doc(db, 'games', gameId), { calledNumbers: newCalled, winners });
        }
      }, 7000);
    }
    return () => clearInterval(t);
  }, [role, gameData, gameId]);

  const createGame = async (ticketCount, enabledPrizes) => {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    const tickets = Array.from({length: ticketCount}, (_, i) => generateTicket(i + 1));
    const payload = {
      id, status: 'booking', tickets, enabledPrizes, calledNumbers: [], winners: [], isPaused: true, createdAt: Date.now()
    };
    await setDoc(doc(db, 'games', id), payload);
    localStorage.setItem("adminGameId", id); // FEATURE 8
    setGameId(id);
    setView('admin-dashboard');
  };

  const handleJoinByCode = () => {
    if (!gameCodeInput) return;
    setGameId(gameCodeInput.toUpperCase());
    setView('player-join');
  };

  const myTickets = useMemo(() => gameData?.tickets.filter(t => t.playerName?.toLowerCase() === playerName.toLowerCase()) || [], [gameData, playerName]);

  if (view === 'loading') return <div className="min-h-screen flex items-center justify-center font-bold text-slate-400">Loading Tambola...</div>;

  // --- ADMIN UI ---
  if (role === 'admin') {
    if (view === 'admin-init') return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-white">
        <AdminSetup onCreate={createGame} />
      </div>
    );

    if (view === 'admin-dashboard' && gameData) return (
      <div className="min-h-screen bg-slate-50 p-6 lg:p-12 max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Game Code</p>
            <h2 className="text-3xl font-black text-slate-900">{gameId}</h2>
          </div>
          
          {/* FEATURE 4: SPEED SLIDER */}
          <div className="flex items-center gap-4 bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100">
            <Volume2 className="text-indigo-500" size={20}/>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase">Voice Speed: {callSpeed}x</span>
              <input 
                type="range" min="0.5" max="1.2" step="0.05" 
                value={callSpeed} 
                onChange={(e) => setCallSpeed(parseFloat(e.target.value))}
                className="w-32 accent-indigo-600"
              />
            </div>
          </div>

          <div className="flex gap-3">
             <button onClick={() => updateDoc(doc(db, 'games', gameId), { status: 'active', isPaused: !gameData.isPaused })} className={`px-8 py-4 rounded-2xl text-white font-black flex items-center gap-2 ${gameData.isPaused ? 'bg-emerald-500' : 'bg-amber-500'}`}>{gameData.isPaused ? <Play size={20}/> : <Pause size={20}/>} {gameData.isPaused ? 'START' : 'PAUSE'}</button>
             <button onClick={() => { localStorage.removeItem("adminGameId"); window.location.reload(); }} className="p-4 rounded-2xl bg-slate-100 text-slate-400 hover:text-red-500"><Trash2 size={20}/></button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
             {/* FEATURE 5: CALLED NUMBERS BOARD (1-90) */}
            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
               <h3 className="text-xl font-black mb-6 flex items-center gap-2 text-indigo-600"><Volume2 size={20}/> Board (1-90)</h3>
               <div className="grid grid-cols-10 gap-2">
                 {Array.from({length: 90}, (_, i) => i + 1).map(n => {
                   const isCalled = gameData.calledNumbers.includes(n);
                   return (
                     <div key={n} className={`aspect-square flex items-center justify-center text-xs font-black rounded-lg transition-all ${isCalled ? 'bg-indigo-600 text-white shadow-md scale-105' : 'bg-slate-50 text-slate-200'}`}>
                       {n}
                     </div>
                   );
                 })}
               </div>
            </div>

            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
              <h3 className="text-xl font-black mb-6 flex items-center gap-2 text-indigo-600"><LayoutGrid size={20}/> Master Board</h3>
              <div className="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-10 gap-3">
                {gameData.tickets.map((t, idx) => (
                  <button key={t.id} onClick={async () => {
                    const tks = [...gameData.tickets];
                    if (t.status === 'available') {
                      const name = prompt("Player Name:");
                      if (name) tks[idx] = { ...t, status: 'booked', playerName: name };
                    } else {
                      if (confirm("Unbook?")) tks[idx] = { ...t, status: 'available', playerName: null };
                    }
                    await updateDoc(doc(db, 'games', gameId), { tickets: tks });
                  }} className={`aspect-square rounded-2xl flex items-center justify-center font-black text-lg border-2 ${t.status === 'booked' ? 'bg-rose-50 border-rose-500 text-rose-600' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>{t.id}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-100">
               <h3 className="text-xl font-black mb-4 flex items-center gap-2 text-emerald-500"><UserCheck size={20}/> Booked List</h3>
               <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                 {gameData.tickets.filter(t => t.status === 'booked').map(t => (
                   <div key={t.id} className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center">
                     <div><p className="text-[10px] font-black text-slate-400 uppercase">T#{t.id}</p><p className="font-bold text-slate-800">{t.playerName}</p></div>
                   </div>
                 ))}
               </div>
            </div>
            <div className="bg-slate-900 p-8 rounded-[3rem] text-white">
              <h3 className="font-black mb-4 text-indigo-400 uppercase tracking-widest text-xs">Winner Log</h3>
              <div className="space-y-3">
                {gameData.winners.slice().reverse().map((w, i) => (
                  <div key={i} className="text-sm bg-slate-800 p-4 rounded-2xl border border-slate-700">
                    <p className="font-black text-indigo-400 text-[10px] uppercase">{w.type}</p>
                    <p className="font-bold">{w.playerName}</p>
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
      <div className="max-w-sm w-full space-y-8">
        <div className="bg-indigo-600 w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto shadow-xl"><Trophy size={40} className="text-white"/></div>
        <h1 className="text-4xl font-black text-slate-900">Tambola Live</h1>
        <div className="relative">
          <Hash className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20}/>
          <input value={gameCodeInput} onChange={e => setGameCodeInput(e.target.value.toUpperCase())} className="w-full bg-slate-50 border-2 p-6 pl-14 rounded-[2rem] text-2xl font-black outline-none focus:border-indigo-500" placeholder="GAME CODE" maxLength={6}/>
        </div>
        <button onClick={handleJoinByCode} className="w-full bg-slate-900 text-white p-6 rounded-[2rem] font-black text-lg">Join Match</button>
      </div>
    </div>
  );

  if (view === 'player-join') return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white p-12 rounded-[3.5rem] shadow-xl w-full max-w-md text-center">
        <h2 className="text-3xl font-black mb-10 text-slate-900">Your Name</h2>
        <input value={playerName} onChange={e => setPlayerName(e.target.value)} className="w-full bg-slate-50 p-6 rounded-[2rem] mb-6 text-center font-black text-xl outline-none" placeholder="Enter Name"/>
        <button onClick={() => myTickets.length > 0 ? setView('player-view') : alert("No tickets found for this name.")} className="w-full bg-indigo-600 text-white p-6 rounded-[2rem] font-black text-lg">Enter Game</button>
      </div>
    </div>
  );

  if (view === 'player-view' && gameData) return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 max-w-5xl mx-auto space-y-8 pb-24">
      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-slate-900 text-white p-12 rounded-[4rem] text-center shadow-2xl">
          <div className="text-[8rem] md:text-[10rem] leading-none font-black tabular-nums">{gameData.calledNumbers[gameData.calledNumbers.length-1] || '--'}</div>
          <div className="mt-4 text-indigo-400 font-bold italic text-sm">{getTambolaPhrase(gameData.calledNumbers[gameData.calledNumbers.length-1])}</div>
        </div>
        <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 overflow-hidden">
           <div className="grid grid-cols-10 gap-1.5">
            {Array.from({length: 90}, (_, i) => i + 1).map(n => (
              <div key={n} className={`aspect-square flex items-center justify-center text-[9px] font-black rounded-md ${gameData.calledNumbers.includes(n) ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-50 text-slate-200'}`}>{n}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {myTickets.map(t => (
          <div key={t.id} className="bg-white p-8 rounded-[3rem] shadow-xl border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-4 py-2 rounded-full uppercase">Ticket #{t.id}</span>
              <span className="text-xs font-bold text-slate-300">{playerName}</span>
            </div>
            {/* FEATURE 6: IMPROVED TICKET UI */}
            <div className="grid grid-cols-9 gap-2 p-3 bg-slate-50 rounded-2xl">
              {JSON.parse(t.data).map((row, rIdx) => (
                <div key={rIdx} className="contents">
                  {row.map((n, cIdx) => (
                    <div key={cIdx} className={`aspect-square w-full flex items-center justify-center text-sm md:text-lg font-bold rounded-lg border-2 transition-all duration-500 ${n === 0 ? 'bg-transparent border-transparent' : gameData.calledNumbers.includes(n) ? 'bg-emerald-500 text-white border-emerald-400 shadow-md scale-105' : 'bg-white border-slate-100 text-slate-600'}`}>
                      {n !== 0 && n}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* FEATURE 11: LIVE WINNERS PLAYER PANEL */}
      <div className="bg-white p-10 rounded-[4rem] shadow-sm border border-slate-100">
         <h3 className="text-xl font-black mb-8 flex items-center gap-2"><Award className="text-amber-500"/> LIVE WINNERS</h3>
         <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {gameData.winners.slice().reverse().map((w, i) => (
              <div key={i} className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                 <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{w.type}</span>
                    <span className="text-[10px] font-black text-slate-300 uppercase">T#{w.ticketId}</span>
                 </div>
                 <p className="font-black text-slate-800 text-lg">{w.playerName}</p>
                 <p className="text-xs font-bold text-slate-400 mt-1">Won at number: {w.number}</p>
              </div>
            ))}
            {gameData.winners.length === 0 && <p className="col-span-full py-10 text-center text-slate-300 font-bold italic">Game in progress... No winners yet!</p>}
         </div>
      </div>
    </div>
  );

  return null;
}

// Sub-component for Setup to keep Main clean
function AdminSetup({ onCreate }) {
  const [tickets, setTickets] = useState(30);
  const [prizes, setPrizes] = useState(['1st Line', '2nd Line', '3rd Line', 'Full House', 'Corners']);

  return (
    <div className="max-w-md w-full bg-slate-800 p-8 rounded-[3rem] border border-slate-700 shadow-2xl">
      <Trophy size={48} className="text-indigo-500 mx-auto mb-6" />
      <h1 className="text-2xl font-black text-center mb-8">Setup Match</h1>
      <div className="space-y-6">
        <div>
          <label className="text-slate-400 text-xs font-black uppercase mb-2 block">Tickets to Generate</label>
          <input type="number" value={tickets} onChange={e => setTickets(Number(e.target.value))} className="w-full bg-slate-900 border border-slate-700 p-4 rounded-2xl text-white font-bold outline-none" />
        </div>
        <div>
          <label className="text-slate-400 text-xs font-black uppercase mb-2 block">Prize Configuration</label>
          <div className="grid grid-cols-2 gap-2">
            {['1st Line', '2nd Line', '3rd Line', 'Full House', '2nd Full House', 'Corners', 'Star Pattern'].map(p => (
              <button key={p} onClick={() => setPrizes(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])} className={`p-3 rounded-xl text-xs font-bold transition-all ${prizes.includes(p) ? 'bg-indigo-600 text-white' : 'bg-slate-900 text-slate-500'}`}>{p}</button>
            ))}
          </div>
        </div>
        <button onClick={() => onCreate(tickets, prizes)} className="w-full bg-indigo-600 text-white p-5 rounded-[2rem] font-black text-lg active:scale-95 transition-all">Create Game</button>
      </div>
    </div>
  );
}
