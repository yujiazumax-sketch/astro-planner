import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Calendar, Clock, Trash2, CalendarDays, Database, Repeat } from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';

// =========================================================================
// 🛑 REPLACE THESE VALUES WITH YOUR FIREBASE CONFIGURATION 🛑
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

export default function App() {
  const [currentWeekStart, setCurrentWeekStart] = useState(getStartOfWeek(new Date()));
  const [isDatabankOpen, setIsDatabankOpen] = useState(false);
  
  // --- State ---
  const [user, setUser] = useState(null);
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
    type: 'scheduled',
    title: '',
    date: formatDate(new Date()),
    startTime: '09:00',
    endTime: '10:00',
    repeat: 'none'
  });

  // --- FIREBASE SYNC HOOKS ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth failed", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

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
  }, [user]);


  // --- Derived Data ---
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i)), [currentWeekStart]);
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // --- Handlers ---
  const handlePrevWeek = () => setCurrentWeekStart(prev => addDays(prev, -7));
  const handleNextWeek = () => setCurrentWeekStart(prev => addDays(prev, 7));
  const handleToday = () => setCurrentWeekStart(getStartOfWeek(new Date()));

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
      await updateDoc(doc(db, 'artifacts', artifactAppId, 'users', user.uid, 'flexibleTasks', id), { isCompleted: !task.isCompleted });
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
    const startH = Math.floor(snappedMinutes / 60);
    const startM = snappedMinutes % 60;
    const endMinutes = snappedMinutes + 60;
    const endH = Math.floor(endMinutes / 60);
    const endM = endMinutes % 60;

    const startStr = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
    const endStr = `${String(Math.min(23, endH)).padStart(2, '0')}:${String(endH >= 24 ? 59 : endM).padStart(2, '0')}`;

    setNewTask({ type: 'scheduled', title: '', date: dateStr, startTime: startStr, endTime: endStr, repeat: 'none' });
    setIsModalOpen(true);
  };

  const handleFlexibleDoubleClick = (e, dateStr) => {
    if (isDraggingRef.current) return;
    const clientX = e.clientX || (e.changedTouches && e.changedTouches[0].clientX);
    const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);
    const dx = Math.abs(clientX - mouseDownPos.current.x);
    const dy = Math.abs(clientY - mouseDownPos.current.y);
    if (dx > 10 || dy > 10) return;

    setNewTask({ type: 'flexible', title: '', date: dateStr, startTime: '09:00', endTime: '10:00', repeat: 'none' });
    setIsModalOpen(true);
  };

  const handleSaveTask = async () => {
    if (!newTask.title.trim() || !user) return;
    const newId = Date.now().toString();

    if (newTask.type === 'databank') {
      await setDoc(doc(db, 'artifacts', artifactAppId, 'users', user.uid, 'databankTasks', newId), { title: newTask.title });
      if (!isDatabankOpen) setIsDatabankOpen(true);
    } else if (newTask.type === 'flexible') {
      await setDoc(doc(db, 'artifacts', artifactAppId, 'users', user.uid, 'flexibleTasks', newId), { date: newTask.date, title: newTask.title, isCompleted: false });
    } else {
      await setDoc(doc(db, 'artifacts', artifactAppId, 'users', user.uid, 'scheduledTasks', newId), {
        date: newTask.date, startTime: newTask.startTime, endTime: newTask.endTime, title: newTask.title, repeat: newTask.repeat || 'none', deletedDates: []
      });
    }
    setIsModalOpen(false);
    setNewTask({ ...newTask, title: '' }); 
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
    await deleteDoc(doc(db, 'artifacts', artifactAppId, 'users', user.uid, `${type}Tasks`, id));
  };

  const confirmDelete = async (scope) => {
    if (!deleteConfirm || !user) return;
    const { id, dateStr } = deleteConfirm;
    const taskRef = doc(db, 'artifacts', artifactAppId, 'users', user.uid, 'scheduledTasks', id);
    const task = scheduledTasks.find(t => t.id === id);
    
    if (scope === 'single') {
      await updateDoc(taskRef, { deletedDates: [...(task.deletedDates || []), dateStr] });
    } else if (scope === 'future') {
      await updateDoc(taskRef, { stoppedOnDate: dateStr });
    }
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
    await setDoc(doc(db, 'artifacts', artifactAppId, 'users', user.uid, `${newSource}Tasks`, taskId), newData);
    if (oldSource !== newSource) {
      await deleteDoc(doc(db, 'artifacts', artifactAppId, 'users', user.uid, `${oldSource}Tasks`, taskId));
    }
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
    const newStartH = Math.floor(snappedMinutes / 60);
    const newStartM = snappedMinutes % 60;
    
    let durationMins = 60;
    if (source === 'scheduled') {
      const [sh, sm] = taskData.startTime.split(':').map(Number);
      const [eh, em] = taskData.endTime.split(':').map(Number);
      durationMins = (eh * 60 + em) - (sh * 60 + sm);
    }
    const newEndMinutes = snappedMinutes + durationMins;
    const newEndH = Math.floor(newEndMinutes / 60);
    const newEndM = newEndMinutes % 60;

    const newStartStr = `${String(Math.min(23, newStartH)).padStart(2, '0')}:${String(newStartM).padStart(2, '0')}`;
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
            <div className="text-[9px] sm:text-[10px] font-mono text-slate-500">{user ? 'DB: Connected' : 'DB: Syncing...'}</div>
          </div>
          <button 
            onClick={() => { setNewTask({ type: 'scheduled', title: '', date: formatDate(new Date()), startTime: '09:00', endTime: '10:00', repeat: 'none' }); setIsModalOpen(true); }}
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
          <style>{`.custom-scrollbar::-webkit-scrollbar { display: none; }`}</style>
          <div className="min-w-[800px] flex flex-col h-full">
            
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
                          onClick={(e) => { e.stopPropagation(); toggleFlexibleTask(task.id); }}
                          className={`group text-[10px] sm:text-xs mb-1 sm:mb-1.5 p-1.5 sm:p-2 rounded border transition-all cursor-move flex items-start space-x-1.5 sm:space-x-2 ${task.isCompleted ? 'bg-slate-900/50 border-slate-800 text-slate-600' : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'}`}
                        >
                          <div className={`mt-0.5 w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm border flex-shrink-0 transition-colors ${task.isCompleted ? 'bg-slate-700 border-slate-600' : 'border-slate-500'}`}>
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
              <div className="w-14 sm:w-16 flex-shrink-0 border-r border-slate-800 bg-slate-900/60 relative" style={{ height: `${24 * 60}px` }}>
                {hours.map(h => (
                  <div key={h} className="absolute w-full text-right pr-1.5 sm:pr-2 text-xs sm:text-sm font-mono text-slate-400 -mt-2.5" style={{ top: `${h * 60}px` }}>
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
                    className={`flex-1 border-r border-slate-800 relative cursor-pointer hover:bg-cyan-900/5 transition-colors ${isToday ? 'bg-cyan-900/10' : ''}`} 
                    style={{ height: `${24 * 60}px` }}
                    onMouseDown={handleMouseDown}
                    onTouchStart={handleMouseDown}
                    onDoubleClick={(e) => handleGridDoubleClick(e, dateStr)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleGridDrop(e, dateStr)}
                  >
                    {/* Grid Lines */}
                    {hours.map(h => (
                      <div key={h} className="absolute w-full border-t border-slate-800/50 pointer-events-none" style={{ top: `${h * 60}px` }}></div>
                    ))}
                    
                    {/* Tasks */}
                    {todaysTasks.map(task => {
                      const [startH, startM] = task.startTime.split(':').map(Number);
                      const [endH, endM] = task.endTime.split(':').map(Number);
                      const top = startH * 60 + startM;
                      const height = (endH * 60 + endM) - top;
                      
                      const isDragged = draggedTask?.id === task.id;
                      const style = { top: `${top}px`, height: `${Math.max(20, height)}px` };

                      return (
                        <div 
                          key={task.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, task.id, 'scheduled')}
                          onDragEnd={handleDragEnd}
                          className={`absolute left-0.5 right-0.5 sm:left-1 sm:right-1 rounded border overflow-hidden p-1 sm:p-1.5 cursor-move group transition-all duration-200 ${isDragged ? 'opacity-50 scale-95 z-50' : 'opacity-100 z-10 hover:z-20 hover:scale-[1.02] shadow-sm'} bg-cyan-900/80 border-cyan-500/50 hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] backdrop-blur-sm`}
                          style={style}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex items-center space-x-1 overflow-hidden pr-1">
                              {(task.repeat === 'daily' || task.repeat === 'weekly') && <Repeat size={10} className="text-cyan-300 flex-shrink-0" />}
                              <div className="text-xs sm:text-sm font-semibold text-cyan-50 leading-tight truncate">{task.title}</div>
                            </div>
                            <button onClick={(e) => handleDeleteTask(task.id, 'scheduled', e, dateStr)} className="text-slate-400 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0 bg-slate-900 rounded-sm p-0.5">
                              <X size={12} className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            </button>
                          </div>
                          <div className="text-[10px] sm:text-xs font-mono text-cyan-400 mt-0.5 opacity-80 truncate">{formatTimeDisplay(task.startTime)} - {formatTimeDisplay(task.endTime)}</div>
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
        <div 
          className={`absolute sm:relative top-0 right-0 h-full bg-slate-950 border-l border-slate-800 transition-all duration-300 z-50 flex flex-col ${isDatabankOpen ? 'w-64 sm:w-72 translate-x-0 shadow-[-10px_0_30px_rgba(0,0,0,0.5)] sm:shadow-none' : 'w-0 translate-x-full sm:translate-x-0 sm:w-0 overflow-hidden'}`}
          onDragOver={handleDragOver}
          onDrop={handleDatabankDrop}
        >
          <div className="p-3 sm:p-4 border-b border-slate-800 flex justify-between items-center bg-purple-950/20">
            <h2 className="text-[10px] sm:text-xs font-mono font-bold text-purple-400 flex items-center tracking-widest"><Database size={14} className="mr-2 sm:w-4 sm:h-4" /> DATABANK</h2>
            <button onClick={() => setIsDatabankOpen(false)} className="text-slate-500 hover:text-slate-300 sm:hidden"><X size={16} /></button>
          </div>
          
          <div className="p-3 sm:p-4 flex-1 overflow-y-auto custom-scrollbar">
            <button 
              onClick={() => { setNewTask({ type: 'databank', title: '', date: formatDate(new Date()), startTime: '09:00', endTime: '10:00', repeat: 'none' }); setIsModalOpen(true); }}
              className="w-full mb-4 border border-dashed border-purple-800/50 hover:border-purple-500 text-purple-500 bg-purple-950/10 hover:bg-purple-900/20 py-2 sm:py-2.5 rounded text-[10px] sm:text-xs font-mono font-bold transition-all flex items-center justify-center tracking-wide"
            >
              <Plus size={14} className="mr-1.5" /> ADD_RECORD
            </button>
            
            <div className="space-y-2">
              {databankTasks.map(task => (
                <div 
                  key={task.id} 
                  draggable
                  onDragStart={(e) => handleDragStart(e, task.id, 'databank')}
                  onDragEnd={handleDragEnd}
                  className="group bg-slate-900 border border-slate-800 p-2.5 sm:p-3 rounded cursor-move hover:border-purple-500/50 transition-colors flex justify-between items-start"
                >
                  <span className="text-xs sm:text-sm text-slate-300 font-medium leading-tight">{task.title}</span>
                  <button onClick={(e) => handleDeleteTask(task.id, 'databank', e)} className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity ml-2 flex-shrink-0">
                    <X size={12} className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {databankTasks.length === 0 && (
                <div className="text-center py-8 text-slate-600 font-mono text-[10px] sm:text-xs border border-dashed border-slate-800 rounded">NO_RECORDS_FOUND</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* NEW TASK MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-[0_0_40px_rgba(0,0,0,0.5)] w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className={`px-4 py-3 sm:px-6 sm:py-4 border-b flex justify-between items-center ${newTask.type === 'databank' ? 'border-purple-900 bg-purple-950/30' : 'border-cyan-900 bg-cyan-950/30'}`}>
              <h3 className={`font-mono font-bold tracking-widest text-xs sm:text-sm flex items-center ${newTask.type === 'databank' ? 'text-purple-400' : 'text-cyan-400'}`}>
                {newTask.type === 'databank' ? <Database size={14} className="mr-2" /> : <Calendar size={14} className="mr-2" />}
                NEW_RECORD_ENTRY
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
            </div>
            
            <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
              <div>
                <label className="block text-[10px] sm:text-xs font-mono text-slate-400 mb-1.5">Record.Title</label>
                <input 
                  type="text" 
                  autoFocus
                  value={newTask.title}
                  onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                  className="w-full bg-slate-950 border border-slate-700 text-cyan-50 rounded px-3 py-2 sm:px-4 sm:py-2.5 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-sans text-sm"
                  placeholder="Initialize logic sequence..."
                />
              </div>

              {newTask.type !== 'databank' && (
                <div>
                  <label className="block text-[10px] sm:text-xs font-mono text-slate-400 mb-1.5">Record.Date</label>
                  <input 
                    type="date" 
                    value={newTask.date}
                    onChange={(e) => setNewTask({...newTask, date: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-700 text-cyan-100 rounded px-3 py-2 focus:outline-none focus:border-cyan-500 font-mono text-xs sm:text-sm [color-scheme:dark]"
                  />
                </div>
              )}

              {newTask.type === 'scheduled' && (
                <div className="flex flex-col space-y-3 sm:space-y-4">
                  <div className="flex space-x-3 sm:space-x-4">
                    <div className="flex-1">
                      <label className="block text-[10px] sm:text-xs font-mono text-slate-400 mb-1">Time.Start</label>
                      <input 
                        type="time" 
                        value={newTask.startTime}
                        onChange={(e) => setNewTask({...newTask, startTime: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-700 text-cyan-100 rounded px-2.5 py-2 sm:px-3 focus:outline-none focus:border-cyan-500 font-mono text-xs sm:text-sm [color-scheme:dark]"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] sm:text-xs font-mono text-slate-400 mb-1">Time.End</label>
                      <input 
                        type="time" 
                        value={newTask.endTime}
                        onChange={(e) => setNewTask({...newTask, endTime: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-700 text-cyan-100 rounded px-2.5 py-2 sm:px-3 focus:outline-none focus:border-cyan-500 font-mono text-xs sm:text-sm [color-scheme:dark]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] sm:text-xs font-mono text-slate-400 mb-1">Repeat.Cycle</label>
                    <div className="flex bg-slate-950 p-1 rounded border border-slate-800">
                      <button onClick={() => setNewTask({...newTask, repeat: 'none'})} className={`flex-1 py-1.5 sm:py-2 text-[10px] sm:text-xs font-mono tracking-wider rounded transition-all ${newTask.repeat === 'none' || !newTask.repeat ? 'bg-cyan-900/40 text-cyan-300 border border-cyan-800/50' : 'text-slate-500 hover:text-slate-300'}`}>[ NONE ]</button>
                      <button onClick={() => setNewTask({...newTask, repeat: 'daily'})} className={`flex-1 py-1.5 sm:py-2 text-[10px] sm:text-xs font-mono tracking-wider rounded transition-all ${newTask.repeat === 'daily' ? 'bg-cyan-900/40 text-cyan-300 border border-cyan-800/50' : 'text-slate-500 hover:text-slate-300'}`}>[ DAILY ]</button>
                      <button onClick={() => setNewTask({...newTask, repeat: 'weekly'})} className={`flex-1 py-1.5 sm:py-2 text-[10px] sm:text-xs font-mono tracking-wider rounded transition-all ${newTask.repeat === 'weekly' ? 'bg-cyan-900/40 text-cyan-300 border border-cyan-800/50' : 'text-slate-500 hover:text-slate-300'}`}>[ WEEKLY ]</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-900/80 flex justify-end space-x-3">
              <button onClick={() => setIsModalOpen(false)} className="px-3 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-mono text-slate-400 border border-slate-700 rounded hover:bg-slate-800 transition-colors">ABORT</button>
              <button onClick={handleSaveTask} disabled={!newTask.title.trim()} className={`px-3 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-mono font-bold text-slate-950 rounded transition-all ${newTask.type === 'databank' ? 'bg-purple-500 hover:bg-purple-400' : 'bg-cyan-500 hover:bg-cyan-400'}`}>EXECUTE</button>
            </div>
          </div>
        </div>
      )}

      {/* REPEAT TASK DELETE CONFIRMATION MODAL */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-slate-900 border border-red-900/50 rounded-lg shadow-[0_0_40px_rgba(220,38,38,0.3)] w-full max-w-sm p-4 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-red-400 font-mono font-bold tracking-wide text-sm sm:text-base flex items-center gap-2">
              <Trash2 size={18} /> CONFIRM DELETION
            </h3>
            <p className="text-slate-300 text-xs sm:text-sm font-mono leading-relaxed">This is a repeating task cycle. Specify the deletion parameter:</p>
            <div className="flex flex-col space-y-2 pt-2">
              <button onClick={() => confirmDelete('single')} className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded font-mono text-xs transition-colors text-left flex justify-between items-center group">
                <span>[ DELETE INSTANCE ]</span><span className="text-slate-500">Only this date</span>
              </button>
              <button onClick={() => confirmDelete('future')} className="px-4 py-2.5 bg-red-900/20 hover:bg-red-900/40 text-red-300 border border-red-900/50 rounded font-mono text-xs transition-colors text-left flex justify-between items-center group">
                <span>[ DELETE FUTURE ]</span><span className="text-red-500/50">This & upcoming</span>
              </button>
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 mt-2 text-slate-500 hover:text-slate-300 font-mono text-xs transition-colors text-center w-full">ABORT SEQUENCE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}