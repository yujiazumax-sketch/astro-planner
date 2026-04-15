import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Calendar, Clock, Trash2, CalendarDays, Database, Repeat } from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
// Switched to Email/Password to bypass Apple's PWA blocking
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';

// =========================================================================
// 🛑 REPLACE THESE VALUES WITH YOUR FIREBASE CONFIGURATION 🛑
// Make sure this is named 'myFirebaseConfig' and NOT 'firebaseConfig'
// =========================================================================
const myFirebaseConfig = {
  apiKey: "AIzaSyDLQk9dHA19QDSz_0XZWROMaYnec_SoBsI",
  authDomain: "astro-planner-86f55.firebaseapp.com",
  projectId: "astro-planner-86f55",
  storageBucket: "astro-planner-86f55.firebasestorage.app",
  messagingSenderId: "115002608009",
  appId: "1:115002608009:web:27966b2bd204650db63958",
  measurementId: "G-XSRTZZD6XW"
};

// --- System Initialization ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : myFirebaseConfig;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const artifactAppId = typeof __app_id !== 'undefined' ? __app_id : 'astro-mecha';

// --- Utility Functions for Dates ---
const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0,0,0,0);
  return d;
};
const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};
const formatDate = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const getDayName = (date) => ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][date.getDay()];
const formatTimeDisplay = (timeStr) => timeStr;

const START_HOUR = 7;
const END_HOUR = 24;
const TOTAL_HOURS = END_HOUR - START_HOUR;

export default function App() {
  const [currentWeekStart, setCurrentWeekStart] = useState(getStartOfWeek(new Date()));
  const [isDatabankOpen, setIsDatabankOpen] = useState(false);
  const [weekAnim, setWeekAnim] = useState(''); // Tracks animation direction
  
  // --- State ---
  const [user, setUser] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [databankTasks, setDatabankTasks] = useState([]);
  const [flexibleTasks, setFlexibleTasks] = useState([]);
  const [scheduledTasks, setScheduledTasks] = useState([]);

  const [draggedTask, setDraggedTask] = useState(null); 
  
  const isDraggingRef = useRef(false);
  const mouseDownPos = useRef({ x: 0, y: 0 });
  const scrollContainerRef = useRef(null);
  const swipeStartRef = useRef(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); 
  const [newTask, setNewTask] = useState({
    id: null,
    type: 'scheduled',
    title: '',
    date: formatDate(new Date()),
    startTime: '09:00',
    endTime: '10:00',
    repeat: 'none'
  });

  // --- FIREBASE SYNC HOOKS ---
  useEffect(() => {
    // For local preview stability if Firebase credentials are bad/missing
    try {
      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        setIsAuthenticating(false);
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn("Auth init failed, bypassing for preview", e);
      setUser({ uid: 'preview-user', email: 'guest@astro-mecha.net' });
      setIsAuthenticating(false);
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setIsAuthenticating(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setAuthError('Access Denied: Invalid credentials.');
      } else {
        setAuthError(err.message);
      }
      setIsAuthenticating(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (password.length < 6) {
      setAuthError('Passcode must be at least 6 characters.');
      return;
    }
    setIsAuthenticating(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setAuthError('Uplink already established for this email. Please login.');
      } else {
        setAuthError(err.message);
      }
      setIsAuthenticating(false);
    }
  };

  const handleLogout = () => signOut(auth);

  useEffect(() => {
    if (!user) return;

    try {
      // Listen to Scheduled Tasks
      const subScheduled = onSnapshot(collection(db, 'artifacts', artifactAppId, 'users', user.uid, 'scheduledTasks'), (snap) => {
        setScheduledTasks(snap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      }, err => console.error(err));

      // Listen to Flexible Tasks
      const subFlexible = onSnapshot(collection(db, 'artifacts', artifactAppId, 'users', user.uid, 'flexibleTasks'), (snap) => {
        setFlexibleTasks(snap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      }, err => console.error(err));

      // Listen to Databank Tasks
      const subDatabank = onSnapshot(collection(db, 'artifacts', artifactAppId, 'users', user.uid, 'databankTasks'), (snap) => {
        setDatabankTasks(snap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      }, err => console.error(err));

      return () => {
        subScheduled();
        subFlexible();
        subDatabank();
      };
    } catch(e) {
      console.warn("Firestore sync bypassed for preview.");
    }
  }, [user]);


  // --- Derived Data ---
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i)), [currentWeekStart]);
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR);

  // --- Handlers ---
  const handlePrevWeek = () => {
    setWeekAnim('animate-slide-prev');
    setCurrentWeekStart(prev => addDays(prev, -7));
  };
  
  const handleNextWeek = () => {
    setWeekAnim('animate-slide-next');
    setCurrentWeekStart(prev => addDays(prev, 7));
  };
  
  const handleToday = () => {
    const today = getStartOfWeek(new Date());
    if (today.getTime() > currentWeekStart.getTime()) setWeekAnim('animate-slide-next');
    else if (today.getTime() < currentWeekStart.getTime()) setWeekAnim('animate-slide-prev');
    setCurrentWeekStart(today);
  };

  const handleSwipeStart = (e) => {
    if (e.button === 2 || (e.touches && e.touches.length > 1)) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    swipeStartRef.current = { x: clientX, y: clientY, time: Date.now() };
  };

  const handleSwipeEnd = (e) => {
    if (!swipeStartRef.current) return;
    const endX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const endY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    const dx = swipeStartRef.current.x - endX;
    const dy = Math.abs(swipeStartRef.current.y - endY);
    const timeElapsed = Date.now() - swipeStartRef.current.time;

    if (Math.abs(dx) > 75 && dy < 100 && timeElapsed < 1000) {
      const container = scrollContainerRef.current;
      if (!container) return;
      const isAtLeftEdge = container.scrollLeft <= 10;
      const isAtRightEdge = container.scrollLeft >= container.scrollWidth - container.clientWidth - 10;

      if (dx > 0 && isAtRightEdge) handleNextWeek(); 
      else if (dx < 0 && isAtLeftEdge) handlePrevWeek(); 
    }
    swipeStartRef.current = null;
  };

  const toggleFlexibleTask = async (id) => {
    if (!user) return;
    const task = flexibleTasks.find(t => t.id === id);
    if (task) {
      try {
        await updateDoc(doc(db, 'artifacts', artifactAppId, 'users', user.uid, 'flexibleTasks', id), { isCompleted: !task.isCompleted });
      } catch (e) { console.warn("Firestore bypassed", e); }
    }
  };

  const handleDragStart = (e, id, source) => {
    isDraggingRef.current = true;
    setDraggedTask({ id, source });
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => { if (e.target) e.target.style.opacity = '0.5'; }, 0);
  };

  const handleDragEnd = (e) => {
    if (e.target) e.target.style.opacity = '1';
    setTimeout(() => { isDraggingRef.current = false; }, 100);
  };

  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };

  const handleMouseDown = (e) => {
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    mouseDownPos.current = { x: clientX, y: clientY };
  };

  const handleGridDoubleClick = (e, dateStr) => {
    if (isDraggingRef.current) return;
    const clientX = e.clientX || (e.changedTouches && e.changedTouches[0].clientX);
    const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);
    const dx = Math.abs(clientX - mouseDownPos.current.x);
    const dy = Math.abs(clientY - mouseDownPos.current.y);
    if (dx > 10 || dy > 10) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = clientY - rect.top;
    const snappedMinutes = Math.floor(y / 15) * 15;
    const startH = Math.floor(snappedMinutes / 60) + START_HOUR;
    const startM = snappedMinutes % 60;
    const endMinutes = snappedMinutes + 60;
    const endH = Math.floor(endMinutes / 60) + START_HOUR;
    const endM = endMinutes % 60;

    const startStr = `${String(Math.min(23, Math.max(0, startH))).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
    const endStr = `${String(Math.min(23, endH)).padStart(2, '0')}:${String(endH >= 24 ? 59 : endM).padStart(2, '0')}`;

    setNewTask({ id: null, type: 'scheduled', title: '', date: dateStr, startTime: startStr, endTime: endStr, repeat: 'none' });
    setIsModalOpen(true);
  };

  const handleFlexibleDoubleClick = (e, dateStr) => {
    if (isDraggingRef.current) return;
    const clientX = e.clientX || (e.changedTouches && e.changedTouches[0].clientX);
    const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);
    const dx = Math.abs(clientX - mouseDownPos.current.x);
    const dy = Math.abs(clientY - mouseDownPos.current.y);
    if (dx > 10 || dy > 10) return;

    setNewTask({ id: null, type: 'flexible', title: '', date: dateStr, startTime: '09:00', endTime: '10:00', repeat: 'none' });
    setIsModalOpen(true);
  };

  const handleEditTask = (e, task, type) => {
    e.stopPropagation();
    setNewTask({
      id: task.id,
      type: type,
      title: task.title,
      date: task.date || formatDate(new Date()),
      startTime: task.startTime || '09:00',
      endTime: task.endTime || '10:00',
      repeat: task.repeat || 'none'
    });
    setIsModalOpen(true);
  };

  const handleSaveTask = async () => {
    if (!newTask.title.trim() || !user) return;
    const targetId = newTask.id || Date.now().toString();

    try {
      if (newTask.type === 'databank') {
        await setDoc(doc(db, 'artifacts', artifactAppId, 'users', user.uid, 'databankTasks', targetId), { title: newTask.title });
        if (!isDatabankOpen) setIsDatabankOpen(true);
      } else if (newTask.type === 'flexible') {
        const existing = flexibleTasks.find(t => t.id === targetId);
        await setDoc(doc(db, 'artifacts', artifactAppId, 'users', user.uid, 'flexibleTasks', targetId), { date: newTask.date, title: newTask.title, isCompleted: existing ? existing.isCompleted : false });
      } else {
        const existing = scheduledTasks.find(t => t.id === targetId);
        await setDoc(doc(db, 'artifacts', artifactAppId, 'users', user.uid, 'scheduledTasks', targetId), {
          date: newTask.date, startTime: newTask.startTime, endTime: newTask.endTime, title: newTask.title, repeat: newTask.repeat || 'none', deletedDates: existing ? existing.deletedDates : [], stoppedOnDate: existing ? existing.stoppedOnDate : null
        });
      }
    } catch (e) {
      console.warn("Firestore sync bypassed. Local state update needed for full offline functionality.", e);
      // In a real scenario we'd update local state here if Firestore fails.
    }
    setIsModalOpen(false);
    setNewTask({ id: null, type: 'scheduled', title: '', date: formatDate(new Date()), startTime: '09:00', endTime: '10:00', repeat: 'none' }); 
  };

  const handleDeleteTask = async (id, type, e, dateStr = null) => {
    e.stopPropagation();
    if (!user) return;
    
    if (type === 'scheduled') {
      const task = scheduledTasks.find(t => t.id === id);
      if (task && task.repeat && task.repeat !== 'none' && dateStr) {
        setDeleteConfirm({ id, dateStr });
        return; 
      }
    }
    try {
      await deleteDoc(doc(db, 'artifacts', artifactAppId, 'users', user.uid, `${type}Tasks`, id));
    } catch(e) { console.warn("Firestore bypassed", e); }
  };

  const confirmDelete = async (scope) => {
    if (!deleteConfirm || !user) return;
    const { id, dateStr } = deleteConfirm;
    const taskRef = doc(db, 'artifacts', artifactAppId, 'users', user.uid, 'scheduledTasks', id);
    const task = scheduledTasks.find(t => t.id === id);
    
    try {
      if (scope === 'single') {
        await updateDoc(taskRef, { deletedDates: [...(task.deletedDates || []), dateStr] });
      } else if (scope === 'future') {
        await updateDoc(taskRef, { stoppedOnDate: dateStr });
      }
    } catch(e) { console.warn("Firestore bypassed", e); }
    setDeleteConfirm(null);
  };

  // --- Drag & Drop Firestore Sync ---
  const getTaskData = (taskId, source) => {
    if (source === 'scheduled') return scheduledTasks.find(t => t.id === taskId);
    if (source === 'flexible') return flexibleTasks.find(t => t.id === taskId);
    if (source === 'databank') return databankTasks.find(t => t.id === taskId);
    return null;
  };

  const moveTaskInFirestore = async (taskId, oldSource, newSource, newData) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'artifacts', artifactAppId, 'users', user.uid, `${newSource}Tasks`, taskId), newData);
      if (oldSource !== newSource) {
        await deleteDoc(doc(db, 'artifacts', artifactAppId, 'users', user.uid, `${oldSource}Tasks`, taskId));
      }
    } catch(e) { console.warn("Firestore bypassed", e); }
  };

  const handleGridDrop = async (e, targetDateStr) => {
    e.preventDefault();
    if (!draggedTask || !user) return;
    const { id: taskId, source } = draggedTask;
    const taskData = getTaskData(taskId, source);
    if (!taskData) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const snappedMinutes = Math.floor(y / 15) * 15;
    const newStartH = Math.floor(snappedMinutes / 60) + START_HOUR;
    const newStartM = snappedMinutes % 60;
    
    let durationMins = 60;
    if (source === 'scheduled') {
      const [sh, sm] = taskData.startTime.split(':').map(Number);
      const [eh, em] = taskData.endTime.split(':').map(Number);
      durationMins = (eh * 60 + em) - (sh * 60 + sm);
    }
    const newEndMinutes = snappedMinutes + durationMins;
    const newEndH = Math.floor(newEndMinutes / 60) + START_HOUR;
    const newEndM = newEndMinutes % 60;

    const newStartStr = `${String(Math.min(23, Math.max(0, newStartH))).padStart(2, '0')}:${String(newStartM).padStart(2, '0')}`;
    const newEndStr = `${String(Math.min(23, newEndH)).padStart(2, '0')}:${String(newEndH >= 24 ? 59 : newEndM).padStart(2, '0')}`;

    const newData = {
      title: taskData.title,
      date: targetDateStr,
      startTime: newStartStr,
      endTime: newEndStr,
      repeat: taskData.repeat || 'none',
      deletedDates: taskData.deletedDates || [],
      stoppedOnDate: taskData.stoppedOnDate || null
    };

    await moveTaskInFirestore(taskId, source, 'scheduled', newData);
    setDraggedTask(null);
  };

  const handleFlexibleDrop = async (e, targetDateStr) => {
    e.preventDefault();
    if (!draggedTask || !user) return;
    const { id: taskId, source } = draggedTask;
    const taskData = getTaskData(taskId, source);
    if (!taskData) return;

    const newData = { date: targetDateStr, title: taskData.title, isCompleted: taskData.isCompleted || false };
    await moveTaskInFirestore(taskId, source, 'flexible', newData);
    setDraggedTask(null);
  };

  const handleDatabankDrop = async (e) => {
    e.preventDefault();
    if (!draggedTask || !user) return;
    const { id: taskId, source } = draggedTask;
    const taskData = getTaskData(taskId, source);
    if (!taskData) return;

    await moveTaskInFirestore(taskId, source, 'databank', { title: taskData.title });
    setDraggedTask(null);
  };

  if (isAuthenticating) {
    return <div className="h-screen w-full bg-slate-950 flex items-center justify-center text-cyan-500 font-mono tracking-widest text-xs sm:text-sm">INITIALIZING_UPLINK...</div>;
  }

  if (!user) {
    return (
      <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center text-slate-200 font-mono p-4 select-none">
        <Database size={56} className="text-cyan-500 mb-6 drop-shadow-[0_0_15px_rgba(6,182,212,0.8)]" />
        <h1 className="text-xl sm:text-3xl font-bold text-cyan-400 mb-3 tracking-widest text-center">ASTRO-MECHA UPLINK</h1>
        <p className="text-slate-500 text-xs sm:text-sm mb-6 text-center max-w-sm leading-relaxed">
          Establish a secure, localized connection identity to synchronize across PC and Mobile.
        </p>
        
        <form className="w-full max-w-xs space-y-4" onSubmit={handleLogin}>
          <div>
            <input 
              type="email" 
              placeholder="Uplink.Email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-cyan-50 rounded px-4 py-3 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono text-xs sm:text-sm placeholder-slate-600"
              required
            />
          </div>
          <div>
            <input 
              type="password" 
              placeholder="Uplink.Passcode" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 text-cyan-50 rounded px-4 py-3 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono text-xs sm:text-sm placeholder-slate-600"
              required
            />
          </div>
          
          {authError && <div className="text-red-400 text-[10px] sm:text-xs text-center p-2 bg-red-950/30 rounded border border-red-900/50">{authError}</div>}
          
          <div className="flex space-x-3 pt-2">
            <button 
              type="button"
              onClick={handleRegister}
              className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-cyan-400 font-bold rounded border border-slate-700 transition-all text-[10px] sm:text-xs tracking-wider active:scale-95"
            >
              [ REGISTER ]
            </button>
            <button 
              type="submit"
              className="flex-1 py-3 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)] transition-all text-[10px] sm:text-xs tracking-wider active:scale-95"
            >
              [ LOGIN ]
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col bg-slate-950 text-slate-200 font-sans overflow-hidden select-none">
      
      {/* HEADER */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 bg-slate-950 border-b border-slate-800 shrink-0">
        <div className="flex items-center space-x-2 sm:space-x-3">
          <button onClick={() => setIsDatabankOpen(!isDatabankOpen)} className={`p-1.5 sm:p-2 rounded-lg transition-colors ${isDatabankOpen ? 'bg-purple-900/40 text-purple-400 border border-purple-800' : 'bg-slate-900 text-slate-400 hover:text-cyan-400 hover:bg-slate-800'}`}>
            <Database size={16} className="sm:w-5 sm:h-5" />
          </button>
          <div className="h-4 sm:h-6 w-px bg-slate-800 mx-1 sm:mx-2"></div>
          <div className="flex items-center space-x-1 sm:space-x-2 bg-slate-900 rounded-lg p-0.5 sm:p-1 border border-slate-800">
            <button onClick={handlePrevWeek} className="p-1 sm:p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-cyan-400 transition-colors"><ChevronLeft size={16} className="sm:w-5 sm:h-5"/></button>
            <button onClick={handleToday} className="px-2 sm:px-4 py-1 sm:py-1.5 text-[10px] sm:text-xs font-mono font-bold tracking-widest text-cyan-500 hover:text-cyan-300 transition-colors uppercase">Today</button>
            <button onClick={handleNextWeek} className="p-1 sm:p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-cyan-400 transition-colors"><ChevronRight size={16} className="sm:w-5 sm:h-5"/></button>
          </div>
          <span className="text-xs sm:text-lg font-mono font-bold text-slate-300 hidden sm:inline-block ml-4 tracking-wide">
            {currentWeekStart.toLocaleString('default', { month: 'short' }).toUpperCase()} {currentWeekStart.getFullYear()}
          </span>
        </div>
        
        <div className="flex items-center space-x-2 sm:space-x-4">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] sm:text-xs font-mono text-cyan-500 font-semibold tracking-widest uppercase">System.Online</div>
            <button onClick={handleLogout} className="text-[9px] sm:text-[10px] font-mono text-slate-500 hover:text-red-400 transition-colors uppercase">Disconnect [{user.email?.split('@')[0] || 'User'}]</button>
          </div>
          <button 
            onClick={() => { setNewTask({ id: null, type: 'scheduled', title: '', date: formatDate(new Date()), startTime: '09:00', endTime: '10:00', repeat: 'none' }); setIsModalOpen(true); }}
            className="flex items-center space-x-1 sm:space-x-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-3 py-1.5 sm:px-4 sm:py-2 rounded font-mono text-[10px] sm:text-xs font-bold transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)] hover:shadow-[0_0_25px_rgba(6,182,212,0.6)] active:scale-95"
          >
            <Plus size={14} className="sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">NEW_TASK</span>
          </button>
        </div>
      </div>

      {/* BODY CONTENT AREA */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* MAIN CALENDAR AREA */}
        <div 
          className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar touch-pan-x touch-pan-y relative" 
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          ref={scrollContainerRef}
          onTouchStart={handleSwipeStart}
          onTouchEnd={handleSwipeEnd}
          onMouseDown={handleSwipeStart}
          onMouseUp={handleSwipeEnd}
        >
          <style>{`
            .custom-scrollbar::-webkit-scrollbar { display: none; }
            @keyframes slideNext {
              0% { transform: translateX(40px); opacity: 0; }
              100% { transform: translateX(0); opacity: 1; }
            }
            @keyframes slidePrev {
              0% { transform: translateX(-40px); opacity: 0; }
              100% { transform: translateX(0); opacity: 1; }
            }
            .animate-slide-next { animation: slideNext 0.25s ease-out forwards; }
            .animate-slide-prev { animation: slidePrev 0.25s ease-out forwards; }
          `}</style>
          <div key={currentWeekStart.toISOString()} className={`min-w-[800px] flex flex-col h-full ${weekAnim}`}>
            
            {/* Day Headers */}
            <div className="flex sticky top-0 z-40 bg-slate-950 border-b border-slate-800 shadow-md">
              <div className="w-14 sm:w-16 flex-shrink-0 border-r border-slate-800 bg-slate-950"></div>
              {weekDays.map((day, i) => {
                const isToday = formatDate(day) === formatDate(new Date());
                return (
                  <div key={i} className={`flex-1 flex flex-col items-center py-2 sm:py-3 border-r border-slate-800 ${isToday ? 'bg-cyan-950/30 relative' : 'bg-slate-950'}`}>
                    {isToday && <div className="absolute top-0 left-0 w-full h-0.5 bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,1)]"></div>}
                    <span className={`text-[9px] sm:text-[10px] font-mono tracking-widest ${isToday ? 'text-cyan-400 font-bold' : 'text-slate-500'}`}>{getDayName(day)}</span>
                    <span className={`text-sm sm:text-xl font-light mt-0.5 ${isToday ? 'text-cyan-50 font-medium' : 'text-slate-300'}`}>{day.getDate()}</span>
                  </div>
                );
              })}
            </div>

            {/* Flexible Task Row */}
            <div className="flex border-b border-slate-800 bg-slate-900/40 relative z-30">
              <div className="w-14 sm:w-16 flex-shrink-0 border-r border-slate-800 flex items-center justify-center bg-slate-900/60">
                <span className="text-[9px] sm:text-[10px] font-mono text-slate-500 -rotate-90 tracking-widest w-max whitespace-nowrap">FLEX.POOL</span>
              </div>
              {weekDays.map((day, i) => {
                const dateStr = formatDate(day);
                const todaysFlexibleTasks = flexibleTasks.filter(t => t.date === dateStr);
                return (
                  <div 
                    key={i} 
                    className="flex-1 border-r border-slate-800 p-1.5 sm:p-2 min-h-[70px] sm:min-h-[80px] cursor-pointer hover:bg-slate-800/50 transition-colors group/cell"
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleMouseDown}
                    onDoubleClick={(e) => handleFlexibleDoubleClick(e, dateStr)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleFlexibleDrop(e, dateStr)}
                  >
                    {todaysFlexibleTasks.map(task => {
                      return (
                        <div 
                          key={task.id} 
                          draggable
                          onDragStart={(e) => handleDragStart(e, task.id, 'flexible')}
                          onDragEnd={handleDragEnd}
                          onClick={(e) => handleEditTask(e, task, 'flexible')}
                          className={`group text-[10px] sm:text-xs mb-1 sm:mb-1.5 p-1.5 sm:p-2 rounded border transition-all cursor-move flex items-start space-x-1.5 sm:space-x-2 ${task.isCompleted ? 'bg-slate-900 border-slate-800 text-slate-600' : 'bg-slate-800 border-slate-600 text-slate-200 hover:border-cyan-700 hover:bg-slate-700'} z-20 shadow-sm`}
                        >
                          <div 
                            onClick={(e) => { e.stopPropagation(); toggleFlexibleTask(task.id); }}
                            className={`mt-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm border flex-shrink-0 transition-colors cursor-pointer hover:border-cyan-400 ${task.isCompleted ? 'bg-slate-700 border-slate-600' : 'border-slate-500'}`}
                          >
                            {task.isCompleted && <X size={10} className="text-slate-900 w-2 h-2 sm:w-2.5 sm:h-2.5 m-px" />}
                          </div>
                          <span className={`flex-1 leading-tight ${task.isCompleted ? 'line-through' : ''}`}>{task.title}</span>
                          <button onClick={(e) => handleDeleteTask(task.id, 'flexible', e)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity">
                            <X size={12} className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Time Grid */}
            <div className="flex relative bg-slate-950 flex-1">
              <div className="w-14 sm:w-16 flex-shrink-0 border-r border-slate-800 bg-slate-900/60 relative" style={{ height: `${TOTAL_HOURS * 60}px` }}>
                {hours.map(h => (
                  <div key={h} className="absolute w-full text-right pr-1.5 sm:pr-2 text-xs sm:text-sm font-mono text-slate-400 -mt-2.5" style={{ top: `${(h - START_HOUR) * 60}px` }}>
                    {String(h).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {weekDays.map((day, dayIndex) => {
                const dateStr = formatDate(day);
                const todaysTasks = scheduledTasks.filter(t => {
                  if (t.deletedDates && t.deletedDates.includes(dateStr)) return false;
                  if (t.stoppedOnDate && dateStr >= t.stoppedOnDate) return false;
                  
                  const tRepeat = t.repeat || 'none';
                  if (tRepeat === 'none') return t.date === dateStr;
                  if (tRepeat === 'daily') return dateStr >= t.date;
                  if (tRepeat === 'weekly') {
                    return dateStr >= t.date && new Date(dateStr).getDay() === new Date(t.date).getDay();
                  }
                  return false;
                });
                const isToday = dateStr === formatDate(new Date());

                return (
                  <div 
                    key={dayIndex} 
                    className={`flex-1 border-r border-slate-800 relative cursor-pointer hover:bg-cyan-900/5 transition-colors overflow-hidden ${isToday ? 'bg-cyan-900/10' : ''}`} 
                    style={{ height: `${TOTAL_HOURS * 60}px` }}
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleMouseDown}
                    onDoubleClick={(e) => handleGridDoubleClick(e, dateStr)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleGridDrop(e, dateStr)}
                  >
                    {/* Grid Lines */}
                    {hours.map(h => (
                      <div key={h} className="absolute w-full border-t border-slate-800/50 pointer-events-none" style={{ top: `${(h - START_HOUR) * 60}px` }}></div>
                    ))}
                    
                    {/* Tasks */}
                    {todaysTasks.map(task => {
                      const [startH, startM] = task.startTime.split(':').map(Number);
                      const [endH, endM] = task.endTime.split(':').map(Number);
                      const top = (startH - START_HOUR) * 60 + startM;
                      const height = (endH * 60 + endM) - (startH * 60 + startM);
                      
                      const isDragged = draggedTask?.id === task.id;
                      const style = { top: `${top}px`, height: `${Math.max(20, height)}px` };

                      return (
                        <div 
                          key={task.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, task.id, 'scheduled')}
                          onDragEnd={handleDragEnd}
                          onClick={(e) => handleEditTask(e, task, 'scheduled')}
                          className={`absolute left-1 right-1 sm:left-2 sm:right-2 rounded p-1 sm:p-2 text-[9px] sm:text-[10px] leading-tight overflow-hidden transition-all group cursor-move z-20 border shadow-md ${isDragged ? 'opacity-50' : 'opacity-100'} bg-cyan-950 border-cyan-700 text-cyan-100 hover:bg-cyan-900`}
                          style={style}
                        >
                          <div className="font-semibold truncate">{task.title}</div>
                          <div className="text-[8px] sm:text-[9px] text-cyan-400 opacity-80">{task.startTime} - {task.endTime}</div>
                          <button onClick={(e) => handleDeleteTask(task.id, 'scheduled', e, dateStr)} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-cyan-500 hover:text-red-400">
                            <X size={10} className="sm:w-3 sm:h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* DATABANK SIDEBAR */}
        {isDatabankOpen && (
          <div 
            className="w-64 bg-slate-900 border-l border-slate-800 flex flex-col z-20 shrink-0 shadow-[-5px_0_15px_rgba(0,0,0,0.5)]"
            onDragOver={handleDragOver}
            onDrop={handleDatabankDrop}
          >
            <div className="p-3 border-b border-slate-800 flex justify-between items-center">
              <h2 className="font-mono text-xs font-bold text-purple-400 flex items-center space-x-2">
                <Database size={14} /> <span>DATABANK</span>
              </h2>
              <button onClick={() => setIsDatabankOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X size={16} />
              </button>
            </div>
            <div className="p-2 overflow-y-auto flex-1">
              {databankTasks.map(task => (
                <div 
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id, 'databank')}
                  onDragEnd={handleDragEnd}
                  onClick={(e) => handleEditTask(e, task, 'databank')}
                  className="bg-slate-800 border border-slate-600 p-2 rounded text-xs mb-2 cursor-move hover:border-cyan-500 hover:bg-slate-700 transition-colors group flex justify-between items-start shadow-sm"
                >
                  <span className="text-slate-200">{task.title}</span>
                  <button onClick={(e) => handleDeleteTask(task.id, 'databank', e)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 ml-2 shrink-0">
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button 
                onClick={() => { setNewTask({ id: null, type: 'databank', title: '', date: formatDate(new Date()), startTime: '09:00', endTime: '10:00', repeat: 'none' }); setIsModalOpen(true); }}
                className="w-full mt-2 py-2 border border-dashed border-slate-700 text-slate-500 hover:text-purple-400 hover:border-purple-500 rounded text-xs font-mono transition-colors flex justify-center items-center space-x-1"
              >
                <Plus size={12} /> <span>ADD_ENTRY</span>
              </button>
            </div>
          </div>
        )}

      </div>

      {/* NEW TASK MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-[0_0_30px_rgba(0,0,0,0.8)] w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-950">
              <h2 className="font-mono text-xs font-bold text-cyan-400">CONFIGURE_TASK</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-red-400">
                <X size={16} />
              </button>
            </div>
            
            <div className="p-4 flex flex-col space-y-4">
              <div>
                <label className="text-[10px] font-mono text-slate-500 uppercase block mb-1">Title / Objective</label>
                <input 
                  type="text" 
                  autoFocus
                  value={newTask.title}
                  onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-cyan-50 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  placeholder="Enter task designation..."
                />
              </div>

              {newTask.type === 'scheduled' && (
                <>
                  <div className="flex space-x-3">
                    <div className="flex-1">
                      <label className="text-[10px] font-mono text-slate-500 uppercase block mb-1 flex items-center"><Clock size={10} className="mr-1"/> Start</label>
                      <input 
                        type="time" 
                        step="900"
                        value={newTask.startTime}
                        onChange={(e) => setNewTask({...newTask, startTime: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-cyan-50 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-mono text-slate-500 uppercase block mb-1 flex items-center"><Clock size={10} className="mr-1"/> End</label>
                      <input 
                        type="time" 
                        step="900"
                        value={newTask.endTime}
                        onChange={(e) => setNewTask({...newTask, endTime: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-cyan-50 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-[10px] font-mono text-slate-500 uppercase block mb-1 flex items-center"><Repeat size={10} className="mr-1"/> Recurrence</label>
                    <select 
                      value={newTask.repeat}
                      onChange={(e) => setNewTask({...newTask, repeat: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-xs text-cyan-50 focus:outline-none focus:border-cyan-500"
                    >
                      <option value="none">One-time specific task</option>
                      <option value="daily">Daily Loop</option>
                      <option value="weekly">Weekly Loop</option>
                    </select>
                  </div>
                </>
              )}

              <div className="flex space-x-2 pt-2">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2 text-xs font-mono text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded transition-colors"
                >
                  CANCEL
                </button>
                <button 
                  onClick={handleSaveTask}
                  className="flex-1 py-2 text-xs font-mono font-bold text-slate-950 bg-cyan-500 hover:bg-cyan-400 rounded shadow-[0_0_10px_rgba(6,182,212,0.3)] transition-all"
                >
                  SAVE_DATA
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-slate-900 border border-red-900/50 rounded-lg shadow-[0_0_30px_rgba(220,38,38,0.3)] w-full max-w-sm overflow-hidden flex flex-col p-5 items-center text-center">
            <Trash2 size={32} className="text-red-500 mb-3" />
            <h2 className="font-bold text-slate-200 mb-1">Delete Recurring Task</h2>
            <p className="text-xs text-slate-400 mb-5">This task is part of a recurring loop. How would you like to handle the deletion?</p>
            
            <div className="flex flex-col space-y-2 w-full">
              <button 
                onClick={() => confirmDelete('single')}
                className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded transition-colors"
              >
                Delete this instance only
              </button>
              <button 
                onClick={() => confirmDelete('future')}
                className="w-full py-2 bg-red-900/40 hover:bg-red-900/60 text-red-400 border border-red-900/50 text-xs rounded transition-colors"
              >
                Delete this and all future instances
              </button>
              <button 
                onClick={() => setDeleteConfirm(null)}
                className="w-full py-2 text-slate-500 hover:text-slate-300 text-xs mt-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}