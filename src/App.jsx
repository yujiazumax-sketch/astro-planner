import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Calendar, Clock, Trash2, CalendarDays, Database, Repeat } from 'lucide-react';

// --- FIREBASE IMPORTS ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
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

// =========================================================================
// 🎨 THEME CONFIGURATION
// Swap this URL to change the background image!
// =========================================================================
const BG_IMAGE_URL = "/background.png";

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

const parseLocal = (dStr) => {
  const [y, m, d] = dStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const START_HOUR = 7;
const END_HOUR = 24;
const TOTAL_HOURS = END_HOUR - START_HOUR;

export default function App() {
  const [currentWeekStart, setCurrentWeekStart] = useState(getStartOfWeek(new Date()));
  const [isDatabankOpen, setIsDatabankOpen] = useState(true);
  const [weekAnim, setWeekAnim] = useState('');
  
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

  const getInitialTaskState = (overrides = {}) => ({
    id: null,
    type: 'scheduled',
    title: '',
    description: '',
    date: formatDate(new Date()),
    startTime: '09:00',
    endTime: '10:00',
    repeat: 'none',
    repeatInterval: 1,
    originalDate: null,
    ...overrides
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); 
  const [editConfirm, setEditConfirm] = useState(null);
  const [newTask, setNewTask] = useState(getInitialTaskState());

  // --- FIREBASE SYNC HOOKS ---
  useEffect(() => {
    try {
      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        setUser(currentUser);
        setIsAuthenticating(false);
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn("Auth init failed, bypassing for preview", e);
      setUser({ uid: 'preview-user', email: 'guest@planner.app' });
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
      setAuthError('Password must be at least 6 characters.');
      return;
    }
    setIsAuthenticating(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/email-already-in-use') {
        setAuthError('Account already exists for this email. Please login.');
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
      const subScheduled = onSnapshot(collection(db, 'artifacts', artifactAppId, 'users', user.uid, 'scheduledTasks'), (snap) => {
        setScheduledTasks(snap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      }, err => console.error(err));

      const subFlexible = onSnapshot(collection(db, 'artifacts', artifactAppId, 'users', user.uid, 'flexibleTasks'), (snap) => {
        setFlexibleTasks(snap.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      }, err => console.error(err));

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

    setNewTask(getInitialTaskState({ type: 'scheduled', date: dateStr, startTime: startStr, endTime: endStr }));
    setIsModalOpen(true);
  };

  const handleFlexibleDoubleClick = (e, dateStr) => {
    if (isDraggingRef.current) return;
    const clientX = e.clientX || (e.changedTouches && e.changedTouches[0].clientX);
    const clientY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);
    const dx = Math.abs(clientX - mouseDownPos.current.x);
    const dy = Math.abs(clientY - mouseDownPos.current.y);
    if (dx > 10 || dy > 10) return;

    setNewTask(getInitialTaskState({ type: 'flexible', date: dateStr }));
    setIsModalOpen(true);
  };

  const handleEditTask = (e, task, type, instanceDateStr = null) => {
    e.stopPropagation();
    const effectiveDate = instanceDateStr || task.date || formatDate(new Date());
    setNewTask({
      id: task.id,
      type: type,
      title: task.title,
      description: task.description || '',
      date: effectiveDate,
      startTime: task.startTime || '09:00',
      endTime: task.endTime || '10:00',
      repeat: task.repeat || 'none',
      repeatInterval: task.repeatInterval || 1,
      originalDate: effectiveDate
    });
    setIsModalOpen(true);
  };

  const handleSaveTask = async () => {
    if (!newTask.title.trim() || !user) return;
    const targetId = newTask.id || Date.now().toString();

    if (newTask.id && newTask.type === 'scheduled') {
      const existing = scheduledTasks.find(t => t.id === targetId);
      if (existing && existing.repeat && existing.repeat !== 'none') {
        setEditConfirm({ id: targetId, instanceDate: newTask.originalDate, pendingData: newTask });
        setIsModalOpen(false);
        return;
      }
    }

    await saveTaskDirectly(targetId, newTask);
  };

  const saveTaskDirectly = async (targetId, taskData) => {
    try {
      if (taskData.type === 'databank') {
        await setDoc(doc(db, 'artifacts', artifactAppId, 'users', user.uid, 'databankTasks', targetId), { title: taskData.title, description: taskData.description });
      } else if (taskData.type === 'flexible') {
        const existing = flexibleTasks.find(t => t.id === targetId);
        await setDoc(doc(db, 'artifacts', artifactAppId, 'users', user.uid, 'flexibleTasks', targetId), { date: taskData.date, title: taskData.title, description: taskData.description, isCompleted: existing ? existing.isCompleted : false });
      } else {
        const existing = scheduledTasks.find(t => t.id === targetId);
        await setDoc(doc(db, 'artifacts', artifactAppId, 'users', user.uid, 'scheduledTasks', targetId), {
          date: taskData.date, 
          startTime: taskData.startTime, 
          endTime: taskData.endTime, 
          title: taskData.title, 
          description: taskData.description,
          repeat: taskData.repeat || 'none', 
          repeatInterval: taskData.repeatInterval || 1,
          deletedDates: existing ? existing.deletedDates : [], 
          stoppedOnDate: existing ? existing.stoppedOnDate : null
        });
      }
    } catch (e) {
      console.warn("Firestore sync bypassed. Local state update needed for full offline functionality.", e);
    }
    setIsModalOpen(false);
    setNewTask(getInitialTaskState()); 
  };

  const handleConfirmEdit = async (scope) => {
    if (!editConfirm || !user) return;
    const { id, instanceDate, pendingData } = editConfirm;
    const taskRef = doc(db, 'artifacts', artifactAppId, 'users', user.uid, 'scheduledTasks', id);
    const originalTask = scheduledTasks.find(t => t.id === id);

    // FIX: Cleanly extract and remove 'id' and 'originalDate' so Firestore doesn't reject the payload
    const { id: pendingId, originalDate, ...dataToSave } = pendingData;

    try {
      if (scope === 'single') {
        await updateDoc(taskRef, { deletedDates: [...(originalTask.deletedDates || []), instanceDate] });
        const newId = Date.now().toString();
        await setDoc(doc(db, 'artifacts', artifactAppId, 'users', user.uid, 'scheduledTasks', newId), {
          ...dataToSave, date: pendingData.date, repeat: 'none', repeatInterval: 1, deletedDates: [], stoppedOnDate: null
        });
      } else if (scope === 'future') {
        await updateDoc(taskRef, { stoppedOnDate: instanceDate });
        const newId = Date.now().toString();
        await setDoc(doc(db, 'artifacts', artifactAppId, 'users', user.uid, 'scheduledTasks', newId), {
          ...dataToSave, date: pendingData.date, deletedDates: [], stoppedOnDate: null
        });
      } else if (scope === 'all') {
        await updateDoc(taskRef, {
          title: pendingData.title, description: pendingData.description, startTime: pendingData.startTime, endTime: pendingData.endTime, repeat: pendingData.repeat, repeatInterval: pendingData.repeatInterval
        });
      }
    } catch(e) { console.warn("Firestore bypassed", e); }
    setEditConfirm(null);
    setNewTask(getInitialTaskState());
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
      description: taskData.description || '',
      date: targetDateStr,
      startTime: newStartStr,
      endTime: newEndStr,
      repeat: taskData.repeat || 'none',
      repeatInterval: taskData.repeatInterval || 1,
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

    const newData = { date: targetDateStr, title: taskData.title, description: taskData.description || '', isCompleted: taskData.isCompleted || false };
    await moveTaskInFirestore(taskId, source, 'flexible', newData);
    setDraggedTask(null);
  };

  const handleDatabankDrop = async (e) => {
    e.preventDefault();
    if (!draggedTask || !user) return;
    const { id: taskId, source } = draggedTask;
    const taskData = getTaskData(taskId, source);
    if (!taskData) return;

    await moveTaskInFirestore(taskId, source, 'databank', { title: taskData.title, description: taskData.description || '' });
    setDraggedTask(null);
  };

  if (isAuthenticating) {
    return <div className="h-screen w-full bg-gray-50 flex items-center justify-center text-blue-600 font-sans text-sm">Loading Workspace...</div>;
  }

  if (!user) {
    return (
      <div 
        className="h-screen w-full flex flex-col items-center justify-center text-gray-800 font-sans p-4 select-none bg-cover bg-center"
        style={{ backgroundImage: `url(${BG_IMAGE_URL})` }}
      >
        <div className="bg-white/90 backdrop-blur-md p-8 rounded-2xl shadow-xl w-full max-w-sm flex flex-col items-center border border-white">
          <Database size={48} className="text-blue-600 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">Planner Login</h1>
          <p className="text-gray-500 text-sm mb-6 text-center leading-relaxed">
            Sign in to access and synchronize your schedule.
          </p>
          
          <form className="w-full space-y-4" onSubmit={handleLogin}>
            <div>
              <input 
                type="email" 
                placeholder="Email Address" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 text-gray-900 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-colors"
                required
              />
            </div>
            <div>
              <input 
                type="password" 
                placeholder="Password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 text-gray-900 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-colors"
                required
              />
            </div>
            
            {authError && <div className="text-red-600 text-xs text-center p-2 bg-red-50 rounded border border-red-200">{authError}</div>}
            
            <div className="flex space-x-3 pt-4">
              <button 
                type="button"
                onClick={handleRegister}
                className="flex-1 py-3 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-lg border border-gray-300 transition-all text-sm active:scale-95"
              >
                Register
              </button>
              <button 
                type="submit"
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-md hover:shadow-lg transition-all text-sm active:scale-95"
              >
                Sign In
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col text-gray-800 font-sans overflow-hidden select-none bg-gray-50">
      
      {/* HEADER (Solid background) */}
      <div className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 bg-white border-b border-gray-200 shrink-0 shadow-sm z-50">
        <div className="flex items-center space-x-2 sm:space-x-4">
          <button onClick={() => setIsDatabankOpen(!isDatabankOpen)} className={`p-1.5 sm:p-2 rounded-lg transition-colors ${isDatabankOpen ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-gray-100 text-gray-500 hover:text-blue-600 hover:bg-gray-200'}`}>
            <Database size={18} className="sm:w-5 sm:h-5" />
          </button>
          <div className="h-4 sm:h-6 w-px bg-gray-300 mx-1"></div>
          <div className="flex items-center space-x-1 bg-gray-100/80 rounded-lg p-1 border border-gray-200">
            <button onClick={handlePrevWeek} className="p-1 sm:p-1.5 hover:bg-white rounded text-gray-500 hover:text-blue-600 transition-colors shadow-sm"><ChevronLeft size={16} className="sm:w-5 sm:h-5"/></button>
            <button onClick={handleToday} className="px-3 sm:px-4 py-1 text-xs font-semibold text-gray-700 hover:text-blue-600 transition-colors">Today</button>
            <button onClick={handleNextWeek} className="p-1 sm:p-1.5 hover:bg-white rounded text-gray-500 hover:text-blue-600 transition-colors shadow-sm"><ChevronRight size={16} className="sm:w-5 sm:h-5"/></button>
          </div>
          <span className="text-sm sm:text-lg font-bold text-gray-800 hidden sm:inline-block ml-2 sm:ml-4">
            {currentWeekStart.toLocaleString('default', { month: 'long' })} {currentWeekStart.getFullYear()}
          </span>
        </div>
        
        <div className="flex items-center space-x-3 sm:space-x-5">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] sm:text-xs text-blue-600 font-bold uppercase tracking-wide">Online</div>
            <button onClick={handleLogout} className="text-[10px] text-gray-500 hover:text-red-500 transition-colors">Disconnect [{user.email?.split('@')[0] || 'User'}]</button>
          </div>
          <button 
            onClick={() => { setNewTask(getInitialTaskState()); setIsModalOpen(true); }}
            className="flex items-center space-x-1 sm:space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-[11px] sm:text-sm font-semibold transition-all shadow-md hover:shadow-lg active:scale-95"
          >
            <Plus size={16} className="sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">New Task</span>
          </button>
        </div>
      </div>

      {/* BODY CONTENT AREA */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* MAIN CALENDAR AREA (WITH BACKGROUND IMAGE) */}
        <div 
          className="flex-1 relative bg-cover bg-center"
          style={{ backgroundImage: `url(${BG_IMAGE_URL})` }}
        >
          <div 
            className="absolute inset-0 overflow-x-auto overflow-y-auto custom-scrollbar touch-pan-x touch-pan-y" 
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
              
              {/* Day Headers (Lowered blur and opacity) */}
              <div className="flex sticky top-0 z-40 bg-white/80 backdrop-blur-sm border-b border-gray-200 shadow-sm">
                <div className="w-14 sm:w-16 flex-shrink-0 border-r border-gray-200 bg-white/50"></div>
                {weekDays.map((day, i) => {
                  const isToday = formatDate(day) === formatDate(new Date());
                  return (
                    <div key={i} className={`flex-1 flex flex-col items-center py-2 sm:py-3 border-r border-gray-200 ${isToday ? 'bg-blue-50/70 relative' : ''}`}>
                      {isToday && <div className="absolute top-0 left-0 w-full h-0.5 bg-blue-500"></div>}
                      <span className={`text-[10px] sm:text-xs font-semibold uppercase tracking-wider ${isToday ? 'text-blue-600' : 'text-gray-600'}`}>{getDayName(day)}</span>
                      <span className={`text-lg sm:text-2xl mt-0.5 ${isToday ? 'text-blue-700 font-bold' : 'text-gray-800 font-medium'}`}>{day.getDate()}</span>
                    </div>
                  );
                })}
              </div>

              {/* Flexible Task Row (Lowered blur and opacity) */}
              <div className="flex border-b border-gray-200 bg-white/60 backdrop-blur-sm relative z-30">
                <div className="w-14 sm:w-16 flex-shrink-0 border-r border-gray-200 flex items-center justify-center bg-white/50">
                  <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase -rotate-90 tracking-widest w-max whitespace-nowrap">Flexible</span>
                </div>
                {weekDays.map((day, i) => {
                  const dateStr = formatDate(day);
                  const todaysFlexibleTasks = flexibleTasks.filter(t => t.date === dateStr);
                  return (
                    <div 
                      key={i} 
                      className="flex-1 border-r border-gray-200 p-1.5 sm:p-2 min-h-[70px] sm:min-h-[80px] cursor-pointer hover:bg-white/40 transition-colors group/cell"
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
                            className={`group text-[11px] sm:text-xs mb-1.5 p-1.5 sm:p-2 rounded border transition-all cursor-move flex items-start space-x-2 ${task.isCompleted ? 'bg-gray-100/90 border-gray-200 text-gray-400' : 'bg-white/95 border-gray-200 text-gray-700 hover:border-blue-400 hover:shadow-md'} z-20 shadow-sm`}
                          >
                            <div 
                              onClick={(e) => { e.stopPropagation(); toggleFlexibleTask(task.id); }}
                              className={`mt-0.5 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded border flex-shrink-0 transition-colors cursor-pointer hover:border-blue-400 flex items-center justify-center ${task.isCompleted ? 'bg-gray-200 border-gray-300' : 'border-gray-300 bg-white'}`}
                            >
                              {task.isCompleted && <X size={10} className="text-gray-500 w-2.5 h-2.5" />}
                            </div>
                            <span className={`flex-1 leading-tight ${task.isCompleted ? 'line-through' : 'font-medium'}`}>{task.title}</span>
                            <button onClick={(e) => handleDeleteTask(task.id, 'flexible', e)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity">
                              <X size={14} className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Time Grid (Lowered blur and opacity for clear image visibility) */}
              <div className="flex relative bg-white/40 backdrop-blur-sm flex-1">
                <div className="w-14 sm:w-16 flex-shrink-0 border-r border-gray-200 bg-white/60 relative" style={{ height: `${TOTAL_HOURS * 60}px` }}>
                  {hours.map(h => (
                    <div key={h} className="absolute w-full text-right pr-2 text-[10px] sm:text-xs text-gray-600 font-medium -mt-2" style={{ top: `${(h - START_HOUR) * 60}px` }}>
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
                      const taskDate = parseLocal(t.date);
                      const currDate = parseLocal(dateStr);
                      if (currDate < taskDate) return false;
                      if (currDate.getDay() !== taskDate.getDay()) return false;
                      
                      const msPerWeek = 7 * 24 * 60 * 60 * 1000;
                      const weeksDiff = Math.round((currDate.getTime() - taskDate.getTime()) / msPerWeek);
                      const interval = t.repeatInterval || 1;
                      return weeksDiff % interval === 0;
                    }
                    return false;
                  });
                  const isToday = dateStr === formatDate(new Date());

                  return (
                    <div 
                      key={dayIndex} 
                      className={`flex-1 border-r border-gray-200/60 relative cursor-pointer hover:bg-white/30 transition-colors overflow-hidden ${isToday ? 'bg-blue-50/30' : ''}`} 
                      style={{ height: `${TOTAL_HOURS * 60}px` }}
                      onMouseDown={handleMouseDown}
                      onTouchStart={handleMouseDown}
                      onDoubleClick={(e) => handleGridDoubleClick(e, dateStr)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleGridDrop(e, dateStr)}
                    >
                      {/* Grid Lines */}
                      {hours.map(h => (
                        <div key={h} className="absolute w-full border-t border-gray-200/60 pointer-events-none" style={{ top: `${(h - START_HOUR) * 60}px` }}></div>
                      ))}
                      
                      {/* Tasks */}
                      {todaysTasks.map(task => {
                        const [startH, startM] = task.startTime.split(':').map(Number);
                        const [endH, endM] = task.endTime.split(':').map(Number);
                        const top = (startH - START_HOUR) * 60 + startM;
                        const height = (endH * 60 + endM) - (startH * 60 + startM);
                        
                        const isDragged = draggedTask?.id === task.id;
                        const style = { top: `${top}px`, height: `${Math.max(22, height)}px` };

                        return (
                          <div 
                            key={task.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, task.id, 'scheduled')}
                            onDragEnd={handleDragEnd}
                            onClick={(e) => handleEditTask(e, task, 'scheduled', dateStr)}
                            className={`absolute left-1 right-1 sm:left-2 sm:right-2 rounded-md p-1.5 sm:p-2 text-[10px] sm:text-xs leading-tight overflow-hidden transition-all group cursor-move z-20 border shadow-md flex flex-col ${isDragged ? 'opacity-60 scale-95' : 'opacity-100 hover:shadow-lg'} bg-blue-100/95 backdrop-blur-none border-blue-200 text-blue-900 hover:bg-blue-200/95`}
                            style={style}
                          >
                            <div className="font-bold truncate">{task.title}</div>
                            <div className="text-[9px] sm:text-[10px] text-blue-700 opacity-90 shrink-0 font-medium">{task.startTime} - {task.endTime}</div>
                            {task.description && <div className="text-[9px] text-blue-600/80 truncate mt-0.5">{task.description}</div>}
                            <button onClick={(e) => handleDeleteTask(task.id, 'scheduled', e, dateStr)} className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 text-blue-500 hover:text-red-500 transition-opacity bg-white/50 rounded-sm">
                              <X size={12} className="sm:w-3.5 sm:h-3.5" />
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
        </div>

        {/* DATABANK SIDEBAR (Solid background, no image behind it) */}
        {isDatabankOpen && (
          <div 
            className="w-64 bg-white border-l border-gray-200 flex flex-col z-50 shrink-0 shadow-[-5px_0_20px_rgba(0,0,0,0.05)]"
            onDragOver={handleDragOver}
            onDrop={handleDatabankDrop}
          >
            <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/80">
              <h2 className="text-sm font-bold text-gray-800 flex items-center space-x-2">
                <Database size={16} className="text-blue-600" /> <span>Databank</span>
              </h2>
              <button onClick={() => setIsDatabankOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-md transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-3 overflow-y-auto flex-1">
              {databankTasks.map(task => (
                <div 
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id, 'databank')}
                    onDragEnd={handleDragEnd}
                    onClick={(e) => handleEditTask(e, task, 'databank')}
                    className="bg-white border border-gray-200 p-3 rounded-lg text-xs mb-2.5 cursor-move hover:border-blue-400 hover:shadow-md transition-all group flex flex-col items-start shadow-sm"
                  >
                    <div className="flex justify-between w-full items-start">
                      <span className="text-gray-800 font-medium leading-tight">{task.title}</span>
                      <button onClick={(e) => handleDeleteTask(task.id, 'databank', e)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 ml-2 shrink-0 transition-opacity">
                        <X size={14} />
                      </button>
                    </div>
                    {task.description && <span className="text-[10px] text-gray-500 mt-1 line-clamp-2">{task.description}</span>}
                </div>
              ))}
              <button 
                onClick={() => { setNewTask(getInitialTaskState({ type: 'databank' })); setIsModalOpen(true); }}
                className="w-full mt-2 py-3 border border-dashed border-gray-300 text-gray-500 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50/50 rounded-lg text-xs font-semibold transition-colors flex justify-center items-center space-x-1"
              >
                <Plus size={14} /> <span>Add Entry</span>
              </button>
            </div>
          </div>
        )}

      </div>

      {/* NEW/EDIT TASK MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h2 className="text-sm font-bold text-gray-800">{newTask.id ? 'Edit Task' : 'Configure Task'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-200 rounded-md transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-5 flex flex-col space-y-4">
              
              {/* TASK TYPE SELECTOR */}
              <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                {['scheduled', 'flexible', 'databank'].map(t => (
                  <button 
                    key={t} 
                    onClick={() => setNewTask({...newTask, type: t})} 
                    className={`flex-1 py-2 text-[11px] font-semibold capitalize rounded-md transition-all ${newTask.type === t ? 'bg-white text-blue-600 shadow-sm border border-gray-200/50' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-600 uppercase block mb-1.5 tracking-wide">Title / Objective</label>
                <input 
                  type="text" 
                  autoFocus
                  value={newTask.title}
                  onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                  placeholder="Enter task designation..."
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-gray-600 uppercase block mb-1.5 tracking-wide">Description / Notes</label>
                <textarea 
                  value={newTask.description}
                  onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                  rows="2"
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none transition-colors"
                  placeholder="Optional context..."
                />
              </div>

              {newTask.type === 'scheduled' && (
                <>
                  <div className="flex space-x-3">
                    <div className="flex-1">
                      <label className="text-[11px] font-semibold text-gray-600 uppercase block mb-1.5 tracking-wide flex items-center"><Clock size={12} className="mr-1 text-gray-400"/> Start</label>
                      <input 
                        type="time" 
                        step="900"
                        value={newTask.startTime}
                        onChange={(e) => setNewTask({...newTask, startTime: e.target.value})}
                        className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[11px] font-semibold text-gray-600 uppercase block mb-1.5 tracking-wide flex items-center"><Clock size={12} className="mr-1 text-gray-400"/> End</label>
                      <input 
                        type="time" 
                        step="900"
                        value={newTask.endTime}
                        onChange={(e) => setNewTask({...newTask, endTime: e.target.value})}
                        className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-[11px] font-semibold text-gray-600 uppercase block mb-1.5 tracking-wide flex items-center"><Repeat size={12} className="mr-1 text-gray-400"/> Recurrence</label>
                    <select 
                      value={newTask.repeat}
                      onChange={(e) => setNewTask({...newTask, repeat: e.target.value})}
                      className="w-full bg-white border border-gray-300 rounded-lg px-2.5 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="none">One-time specific task</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>

                  {newTask.repeat === 'weekly' && (
                    <div>
                      <label className="text-[11px] font-semibold text-gray-600 uppercase block mb-1.5 tracking-wide">Interval (Every X Weeks)</label>
                      <input 
                        type="number" 
                        min="1" 
                        max="52"
                        value={newTask.repeatInterval}
                        onChange={(e) => setNewTask({...newTask, repeatInterval: Math.max(1, parseInt(e.target.value) || 1)})}
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </>
              )}

              <div className="flex space-x-3 pt-4 border-t border-gray-100">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveTask}
                  className="flex-1 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md hover:shadow-lg transition-all"
                >
                  Save Task
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white border border-red-100 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col p-6 items-center text-center">
            <div className="bg-red-50 p-3 rounded-full mb-4">
              <Trash2 size={28} className="text-red-500" />
            </div>
            <h2 className="font-bold text-gray-900 text-lg mb-2">Delete Recurring Task</h2>
            <p className="text-sm text-gray-500 mb-6">This task is part of a recurring schedule. How would you like to handle the deletion?</p>
            
            <div className="flex flex-col space-y-3 w-full">
              <button 
                onClick={() => confirmDelete('single')}
                className="w-full py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 text-sm font-medium rounded-lg transition-colors"
              >
                Delete this instance only
              </button>
              <button 
                onClick={() => confirmDelete('future')}
                className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-sm font-medium rounded-lg transition-colors"
              >
                Delete this and all future instances
              </button>
              <button 
                onClick={() => setDeleteConfirm(null)}
                className="w-full py-2 text-gray-500 hover:text-gray-700 text-sm font-medium mt-2"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT CONFIRMATION MODAL */}
      {editConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white border border-blue-100 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col p-6 items-center text-center">
            <div className="bg-blue-50 p-3 rounded-full mb-4">
              <Repeat size={28} className="text-blue-600" />
            </div>
            <h2 className="font-bold text-gray-900 text-lg mb-2">Edit Recurring Task</h2>
            <p className="text-sm text-gray-500 mb-6">This task is part of a recurring schedule. Apply these changes to:</p>
            
            <div className="flex flex-col space-y-3 w-full">
              <button 
                onClick={() => handleConfirmEdit('single')}
                className="w-full py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 text-sm font-medium rounded-lg transition-colors"
              >
                This instance only
              </button>
              <button 
                onClick={() => handleConfirmEdit('future')}
                className="w-full py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 text-sm font-medium rounded-lg transition-colors"
              >
                This and all future instances
              </button>
              <button 
                onClick={() => handleConfirmEdit('all')}
                className="w-full py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-sm font-medium rounded-lg transition-colors"
              >
                All instances
              </button>
              <button 
                onClick={() => setEditConfirm(null)}
                className="w-full py-2 text-gray-500 hover:text-gray-700 text-sm font-medium mt-2"
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