import React, { useState, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Calendar, Clock, Trash2, CalendarDays, Database, Repeat } from 'lucide-react';

// --- Utility Functions for Dates ---
const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day; // Sunday is 0
  return new Date(d.setDate(diff));
};

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatTimeDisplay = (timeStr) => {
  const [hours, minutes] = timeStr.split(':');
  return `${hours}:${minutes}`;
};

export default function App() {
  // --- State ---
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getStartOfWeek(new Date()));
  const [isDatabankOpen, setIsDatabankOpen] = useState(false);
  
  // Mock initial data
  const [databankTasks, setDatabankTasks] = useState([
    { id: 'b1', title: 'Recalibrate Thrusters' },
    { id: 'b2', title: 'Analyze Sector Maps' }
  ]);

  const [flexibleTasks, setFlexibleTasks] = useState([
    { id: 'f1', date: formatDate(new Date()), title: 'System Diagnostics', isCompleted: false },
    { id: 'f2', date: formatDate(new Date()), title: 'Core Alignment', isCompleted: true }
  ]);
  
  const [scheduledTasks, setScheduledTasks] = useState([
    { id: 'd1', date: formatDate(new Date()), startTime: '09:00', endTime: '10:30', title: 'Comms Sync', repeat: 'daily' },
    { id: 'd2', date: formatDate(new Date()), startTime: '13:00', endTime: '14:00', title: 'Recharge', repeat: 'none' },
    { id: 'd3', date: formatDate(addDays(new Date(), 1)), startTime: '15:00', endTime: '16:45', title: 'Engine Maintenance', repeat: 'weekly' },
  ]);

  const [draggedTask, setDraggedTask] = useState(null); // { id, source: 'databank' | 'flexible' | 'scheduled' }
  
  // Refs to prevent accidental clicks after dragging or swiping
  const isDraggingRef = useRef(false);
  const mouseDownPos = useRef({ x: 0, y: 0 });

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, dateStr } for repeating tasks
  const [newTask, setNewTask] = useState({
    type: 'scheduled', // 'scheduled', 'flexible', 'databank'
    title: '',
    date: formatDate(new Date()),
    startTime: '09:00',
    endTime: '10:00',
    repeat: 'none'
  });

  // --- Derived Data ---
  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      days.push(addDays(currentWeekStart, i));
    }
    return days;
  }, [currentWeekStart]);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  // --- Handlers ---
  const handlePrevWeek = () => setCurrentWeekStart(prev => addDays(prev, -7));
  const handleNextWeek = () => setCurrentWeekStart(prev => addDays(prev, 7));
  const handleToday = () => setCurrentWeekStart(getStartOfWeek(new Date()));

  const toggleFlexibleTask = (id) => {
    setFlexibleTasks(prev => prev.map(task => 
      task.id === id ? { ...task, isCompleted: !task.isCompleted } : task
    ));
  };

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

  const handleSaveTask = () => {
    if (!newTask.title.trim()) return;

    const newId = Date.now().toString();
    if (newTask.type === 'databank') {
      setDatabankTasks([...databankTasks, { id: newId, title: newTask.title }]);
      if (!isDatabankOpen) setIsDatabankOpen(true);
    } else if (newTask.type === 'flexible') {
      setFlexibleTasks([...flexibleTasks, { id: newId, date: newTask.date, title: newTask.title, isCompleted: false }]);
    } else {
      setScheduledTasks([...scheduledTasks, {
        id: newId, date: newTask.date, startTime: newTask.startTime, endTime: newTask.endTime, title: newTask.title, repeat: newTask.repeat || 'none', deletedDates: []
      }]);
    }
    setIsModalOpen(false);
    setNewTask({ ...newTask, title: '' }); 
  };

  const handleDeleteTask = (id, type, e, dateStr = null) => {
    e.stopPropagation();
    
    if (type === 'scheduled') {
      const task = scheduledTasks.find(t => t.id === id);
      if (task && task.repeat && task.repeat !== 'none' && dateStr) {
        setDeleteConfirm({ id, dateStr });
        return; // Open confirmation instead of deleting immediately
      }
    }

    if (type === 'databank') setDatabankTasks(prev => prev.filter(t => t.id !== id));
    if (type === 'flexible') setFlexibleTasks(prev => prev.filter(t => t.id !== id));
    if (type === 'scheduled') setScheduledTasks(prev => prev.filter(t => t.id !== id));
  };

  const confirmDelete = (scope) => {
    if (!deleteConfirm) return;
    const { id, dateStr } = deleteConfirm;
    
    if (scope === 'single') {
      setScheduledTasks(prev => prev.map(t => 
        t.id === id ? { ...t, deletedDates: [...(t.deletedDates || []), dateStr] } : t
      ));
    } else if (scope === 'future') {
      setScheduledTasks(prev => prev.map(t => 
        t.id === id ? { ...t, stoppedOnDate: dateStr } : t
      ));
    }
    setDeleteConfirm(null);
  };

  // --- Drag & Drop Universal Extraction ---
  const extractDraggedTask = (taskId, source) => {
    let taskTitle = '';
    let durationMins = 60;
    let isCompleted = false;
    let repeat = 'none';

    if (source === 'scheduled') {
      const task = scheduledTasks.find(t => t.id === taskId);
      if (task) {
        taskTitle = task.title;
        repeat = task.repeat || 'none';
        const [sh, sm] = task.startTime.split(':').map(Number);
        const [eh, em] = task.endTime.split(':').map(Number);
        durationMins = (eh * 60 + em) - (sh * 60 + sm);
      }
      setScheduledTasks(prev => prev.filter(t => t.id !== taskId));
    } else if (source === 'flexible') {
      const task = flexibleTasks.find(t => t.id === taskId);
      if (task) { taskTitle = task.title; isCompleted = task.isCompleted; }
      setFlexibleTasks(prev => prev.filter(t => t.id !== taskId));
    } else if (source === 'databank') {
      const task = databankTasks.find(t => t.id === taskId);
      if (task) taskTitle = task.title;
      setDatabankTasks(prev => prev.filter(t => t.id !== taskId));
    }
    return { taskTitle, durationMins, isCompleted };
  };

  const handleGridDrop = (e, targetDateStr) => {
    e.preventDefault();
    if (!draggedTask) return;
    const { id: taskId, source } = draggedTask;

    const { taskTitle, durationMins, repeat } = extractDraggedTask(taskId, source);
    if (!taskTitle) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = parseFloat(e.dataTransfer.getData('offsetY')) || 0;
    let y = Math.max(0, e.clientY - rect.top - offsetY); 

    const snappedMinutes = Math.round(y / 15) * 15;
    const newStartH = Math.floor(snappedMinutes / 60);
    const newStartM = snappedMinutes % 60;
    const newEndMinutes = snappedMinutes + durationMins;
    const newEndH = Math.floor(newEndMinutes / 60);
    const newEndM = newEndMinutes % 60;

    const newStartStr = `${String(Math.min(23, newStartH)).padStart(2, '0')}:${String(newStartM).padStart(2, '0')}`;
    const newEndStr = `${String(Math.min(23, newEndH)).padStart(2, '0')}:${String(newEndH >= 24 ? 59 : newEndM).padStart(2, '0')}`;

    setScheduledTasks(prev => [...prev, {
      id: taskId, date: targetDateStr, startTime: newStartStr, endTime: newEndStr, title: taskTitle, repeat
    }]);
    setDraggedTask(null);
  };

  const handleFlexibleDrop = (e, targetDateStr) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedTask) return;
    const { id: taskId, source } = draggedTask;

    const { taskTitle, isCompleted } = extractDraggedTask(taskId, source);
    if (taskTitle) {
      setFlexibleTasks(prev => [...prev, { id: taskId, date: targetDateStr, title: taskTitle, isCompleted }]);
    }
    setDraggedTask(null);
  };

  const handleDatabankDrop = (e) => {
    e.preventDefault();
    if (!draggedTask) return;
    const { id: taskId, source } = draggedTask;

    const { taskTitle } = extractDraggedTask(taskId, source);
    if (taskTitle) {
      setDatabankTasks(prev => [...prev, { id: taskId, title: taskTitle }]);
    }
    setDraggedTask(null);
  };

  const handleDragOver = (e) => e.preventDefault();

  const handleDragStart = (e, id, source, includeOffsetY = false) => {
    e.stopPropagation();
    isDraggingRef.current = true;
    setDraggedTask({ id, source });
    e.dataTransfer.setData('text/plain', id);
    if (includeOffsetY) {
      const rect = e.currentTarget.getBoundingClientRect();
      e.dataTransfer.setData('offsetY', e.clientY - rect.top);
    }
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setTimeout(() => { isDraggingRef.current = false; }, 100); 
  };

  // --- Render Helpers ---
  const getMonthYear = () => {
    const endOfWeek = addDays(currentWeekStart, 6);
    const startMonth = currentWeekStart.toLocaleString('default', { month: 'short' });
    const endMonth = endOfWeek.toLocaleString('default', { month: 'short' });
    if (startMonth === endMonth) return `${startMonth}`;
    return `${startMonth} - ${endMonth}`;
  };

  const getTaskStyles = (startTime, endTime) => {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const topMinutes = startH * 60 + startM;
    const durationMinutes = (endH * 60 + endM) - topMinutes;
    return { top: `${topMinutes}px`, height: `${Math.max(durationMinutes, 15)}px` };
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-slate-950 text-slate-300 font-sans selection:bg-cyan-900 selection:text-cyan-100">
      {/* HEADER */}
      <header className="flex flex-col sm:flex-row items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-slate-800 bg-slate-900 shadow-md gap-3 z-30">
        <div className="flex items-center justify-between w-full sm:w-auto">
          <h1 className="text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 tracking-wider uppercase drop-shadow-[0_0_10px_rgba(6,182,212,0.5)]">
            Astro-Mecha
          </h1>
          <div className="flex sm:hidden gap-2">
            <button onClick={() => setIsDatabankOpen(true)} className="p-2 bg-slate-800 border border-slate-700 text-purple-400 rounded-full hover:bg-slate-700 transition-all">
              <Database size={18} />
            </button>
            <button onClick={() => setIsModalOpen(true)} className="p-2 bg-cyan-600/20 border border-cyan-500/50 text-cyan-400 rounded-full hover:bg-cyan-600/40 transition-all">
              <Plus size={18} />
            </button>
          </div>
        </div>
        
        <div className="flex items-center space-x-2 sm:space-x-4 w-full sm:w-auto justify-between sm:justify-end">
          <button onClick={handleToday} className="px-2 sm:px-3 py-1 text-xs sm:text-sm bg-slate-800 border border-slate-700 text-cyan-400 rounded hover:bg-slate-700 transition-all font-mono">
            <CalendarDays size={14} className="inline sm:hidden mr-1" />
            <span className="hidden sm:inline">System.</span>Today()
          </button>
          
          <div className="flex items-center justify-center space-x-1 sm:space-x-2 bg-slate-800/50 p-1 rounded border border-slate-700 flex-1 sm:flex-none">
            <button onClick={handlePrevWeek} className="p-1.5 text-slate-400 hover:text-cyan-400 active:scale-95 transition-all"><ChevronLeft size={18} /></button>
            <span className="font-mono text-xs sm:text-sm w-24 sm:w-32 text-center text-cyan-100 truncate">{getMonthYear()}</span>
            <button onClick={handleNextWeek} className="p-1.5 text-slate-400 hover:text-cyan-400 active:scale-95 transition-all"><ChevronRight size={18} /></button>
          </div>

          <div className="hidden sm:flex gap-3">
            <button onClick={() => setIsDatabankOpen(!isDatabankOpen)} className={`flex items-center space-x-2 px-3 py-2 border rounded transition-all font-mono text-sm ${isDatabankOpen ? 'bg-purple-900/40 border-purple-500 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.3)]' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-purple-400 hover:border-purple-500/50'}`}>
              <Database size={16} />
              <span>Databank</span>
            </button>
            <button onClick={() => setIsModalOpen(true)} className="flex items-center space-x-2 px-4 py-2 bg-cyan-600/20 border border-cyan-500/50 text-cyan-400 rounded hover:bg-cyan-600/40 hover:shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all font-mono text-sm">
              <Plus size={16} />
              <span>Deploy</span>
            </button>
          </div>
        </div>
      </header>

      {/* BODY CONTENT AREA */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* MAIN CALENDAR AREA */}
        <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar touch-pan-x touch-pan-y relative" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <style>{`.custom-scrollbar::-webkit-scrollbar { display: none; }`}</style>
          <div className="min-w-[800px] flex flex-col h-full">
            
            {/* Day Headers */}
            <div className="flex border-b border-slate-800 sticky top-0 bg-slate-900 z-20 shadow-sm">
              <div className="w-14 sm:w-16 flex-shrink-0 border-r border-slate-800 bg-slate-900/80"></div>
              {weekDays.map((day, i) => {
                const isToday = formatDate(day) === formatDate(new Date());
                return (
                  <div key={i} className={`flex-1 text-center py-2 sm:py-3 border-r border-slate-800 ${isToday ? 'bg-cyan-950/30' : ''}`}>
                    <div className={`text-[10px] sm:text-xs font-mono tracking-widest uppercase ${isToday ? 'text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]' : 'text-slate-500'}`}>
                      {day.toLocaleString('default', { weekday: 'short' })}
                    </div>
                    <div className={`text-xl sm:text-2xl mt-0.5 sm:mt-1 font-mono ${isToday ? 'text-cyan-300 font-bold' : 'text-slate-300'}`}>
                      {String(day.getDate()).padStart(2, '0')}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Flexible Tasks Row */}
            <div className="flex border-b border-slate-800 bg-slate-900/40">
              <div className="w-14 sm:w-16 flex-shrink-0 border-r border-slate-800 flex flex-col items-center justify-start pt-3 text-[10px] sm:text-xs font-mono text-purple-400 bg-slate-900/60">
                <Calendar size={14} className="mb-1" />
                Tasks
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
                      const isDragging = draggedTask?.id === task.id;
                      return (
                        <div 
                          key={task.id} 
                          draggable
                          onDragStart={(e) => handleDragStart(e, task.id, 'flexible')}
                          onDragEnd={handleDragEnd}
                          className={`flex items-start justify-between mb-1.5 sm:mb-2 text-sm group/task bg-slate-800/40 rounded p-1 hover:bg-slate-800/80 cursor-move transition-all border border-transparent hover:border-slate-700 ${isDragging ? 'opacity-50' : ''}`} 
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-start space-x-1 sm:space-x-2 overflow-hidden">
                            <input 
                              type="checkbox" 
                              checked={task.isCompleted}
                              onChange={() => toggleFlexibleTask(task.id)}
                              className="mt-0.5 sm:mt-1 flex-shrink-0 w-3 h-3 sm:w-4 sm:h-4 rounded-sm border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                            />
                            <span className={`leading-tight cursor-pointer font-mono text-[10px] sm:text-xs truncate ${task.isCompleted ? 'line-through text-slate-600' : 'text-slate-300 group-hover/task:text-cyan-200'}`}
                                  onClick={() => toggleFlexibleTask(task.id)}>
                              {task.title}
                            </span>
                          </div>
                          <button onClick={(e) => handleDeleteTask(task.id, 'flexible', e)} className="text-slate-600 hover:text-red-400 sm:opacity-0 sm:group-hover/task:opacity-100 transition-opacity ml-1">
                            <Trash2 size={12} className="sm:w-3.5 sm:h-3.5" />
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
                  <div key={h} className="absolute w-full text-right pr-1 sm:pr-2 text-[9px] sm:text-[10px] font-mono text-slate-500 -mt-2" style={{ top: `${h * 60}px` }}>
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
                      <React.Fragment key={h}>
                        <div className="absolute w-full border-t border-slate-800 pointer-events-none" style={{ top: `${h * 60}px`, height: '15px' }}></div>
                        <div className="absolute w-full border-t border-slate-800/30 border-dashed pointer-events-none" style={{ top: `${h * 60 + 15}px`, height: '15px' }}></div>
                        <div className="absolute w-full border-t border-slate-800/30 border-dashed pointer-events-none" style={{ top: `${h * 60 + 30}px`, height: '15px' }}></div>
                        <div className="absolute w-full border-t border-slate-800/30 border-dashed pointer-events-none" style={{ top: `${h * 60 + 45}px`, height: '15px' }}></div>
                      </React.Fragment>
                    ))}

                    {/* Tasks */}
                    {todaysTasks.map(task => {
                      const style = getTaskStyles(task.startTime, task.endTime);
                      const isDragging = draggedTask?.id === task.id;
                      
                      return (
                        <div 
                          key={task.id} 
                          draggable
                          onDragStart={(e) => handleDragStart(e, task.id, 'scheduled', true)}
                          onDragEnd={handleDragEnd}
                          className={`absolute left-0.5 right-0.5 sm:left-1 sm:right-1 bg-slate-800/95 border-l-[3px] border-cyan-500 rounded-sm p-1 sm:p-1.5 overflow-hidden shadow-[0_0_8px_rgba(6,182,212,0.2)] hover:shadow-[0_0_12px_rgba(6,182,212,0.5)] transition-all cursor-move z-10 group backdrop-blur-md ${isDragging ? 'opacity-50 border-dashed' : 'opacity-100'}`}
                          style={style}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex items-center space-x-1 overflow-hidden pr-1">
                              {(task.repeat === 'daily' || task.repeat === 'weekly') && <Repeat size={8} className="text-cyan-300 flex-shrink-0" />}
                              <div className="text-[10px] sm:text-xs font-semibold text-cyan-50 leading-tight truncate">{task.title}</div>
                            </div>
                            <button onClick={(e) => handleDeleteTask(task.id, 'scheduled', e, dateStr)} className="text-slate-400 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0 bg-slate-900 rounded-sm p-0.5">
                              <X size={10} className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                            </button>
                          </div>
                          <div className="text-[8px] sm:text-[10px] font-mono text-cyan-400 mt-0.5 opacity-80 truncate">{formatTimeDisplay(task.startTime)} - {formatTimeDisplay(task.endTime)}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* DATABANK SIDEBAR / DRAWER */}
        {/* Mobile Backdrop */}
        {isDatabankOpen && (
          <div className="sm:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={() => setIsDatabankOpen(false)} />
        )}
        
        <aside 
          className={`absolute right-0 top-0 h-full bg-slate-900/95 border-l border-slate-700 z-50 flex flex-col shadow-[-5px_0_20px_rgba(0,0,0,0.5)] backdrop-blur-md transition-transform duration-300 w-64 sm:w-72 sm:relative sm:translate-x-0 ${isDatabankOpen ? 'translate-x-0' : 'translate-x-full hidden sm:flex sm:hidden'}`}
          onDragOver={handleDragOver}
          onDrop={handleDatabankDrop}
        >
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
            <div className="flex items-center space-x-2 text-purple-400 font-mono font-bold tracking-wider">
              <Database size={18} />
              <span>DATABANK</span>
            </div>
            <button onClick={() => setIsDatabankOpen(false)} className="sm:hidden text-slate-500 hover:text-slate-300">
              <X size={20} />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
            {databankTasks.length === 0 ? (
              <div className="text-center p-6 border border-dashed border-slate-700 rounded-lg text-slate-500 font-mono text-xs">
                No archived tasks. Drop tasks here to unschedule.
              </div>
            ) : (
              databankTasks.map(task => {
                const isDragging = draggedTask?.id === task.id;
                return (
                  <div 
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id, 'databank')}
                    onDragEnd={handleDragEnd}
                    className={`bg-slate-800 border border-slate-700 rounded p-3 cursor-move hover:border-purple-500/50 hover:shadow-[0_0_8px_rgba(168,85,247,0.2)] transition-all group flex justify-between items-start ${isDragging ? 'opacity-50 border-dashed' : ''}`}
                  >
                    <span className="font-mono text-xs text-slate-300 group-hover:text-purple-200">{task.title}</span>
                    <button onClick={(e) => handleDeleteTask(task.id, 'databank', e)} className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
          
          <div className="p-3 border-t border-slate-800 bg-slate-900/80">
            <button 
              onClick={() => { setNewTask({ type: 'databank', title: '', date: formatDate(new Date()), startTime: '09:00', endTime: '10:00' }); setIsModalOpen(true); }}
              className="w-full flex items-center justify-center space-x-2 py-2 bg-slate-800 border border-slate-700 text-slate-400 rounded hover:text-purple-400 hover:border-purple-500/50 transition-all font-mono text-xs"
            >
              <Plus size={14} />
              <span>Add to Databank</span>
            </button>
          </div>
        </aside>

      </div>

      {/* NEW TASK MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-[0_0_40px_rgba(0,0,0,0.8)] w-full max-w-sm sm:max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-3 sm:p-4 border-b border-slate-700 bg-slate-800/50">
              <h2 className="text-base sm:text-lg font-mono font-bold text-cyan-400 tracking-wide">Initialize Task</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-500 hover:text-cyan-400 p-1">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
              <div className="flex bg-slate-950 p-1 rounded border border-slate-800">
                <button 
                  className={`flex-1 py-1.5 sm:py-2 text-[10px] sm:text-xs font-mono tracking-wider rounded transition-all ${newTask.type === 'scheduled' ? 'bg-cyan-900/40 text-cyan-300 border border-cyan-800/50 shadow-[0_0_10px_rgba(6,182,212,0.2)]' : 'text-slate-500 hover:text-slate-300'}`}
                  onClick={() => setNewTask({...newTask, type: 'scheduled'})}
                >
                  SCHEDULED
                </button>
                <button 
                  className={`flex-1 py-1.5 sm:py-2 text-[10px] sm:text-xs font-mono tracking-wider rounded transition-all ${newTask.type === 'flexible' ? 'bg-cyan-900/20 text-cyan-400 border border-transparent' : 'text-slate-500 hover:text-slate-300'}`}
                  onClick={() => setNewTask({...newTask, type: 'flexible'})}
                >
                  FLEXIBLE
                </button>
                <button 
                  className={`flex-1 py-1.5 sm:py-2 text-[10px] sm:text-xs font-mono tracking-wider rounded transition-all ${newTask.type === 'databank' ? 'bg-purple-900/40 text-purple-300 border border-purple-800/50 shadow-[0_0_10px_rgba(168,85,247,0.2)]' : 'text-slate-500 hover:text-slate-300'}`}
                  onClick={() => setNewTask({...newTask, type: 'databank'})}
                >
                  DATABANK
                </button>
              </div>

              <div>
                <label className="block text-[10px] sm:text-xs font-mono text-slate-400 mb-1">Task.Title</label>
                <input 
                  type="text" 
                  value={newTask.title}
                  onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                  placeholder="Enter objective..."
                  className="w-full bg-slate-950 border border-slate-700 text-cyan-100 rounded px-2.5 py-2 sm:px-3 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 placeholder-slate-700 font-sans"
                  autoFocus
                />
              </div>

              {newTask.type !== 'databank' && (
                <div>
                  <label className="block text-[10px] sm:text-xs font-mono text-slate-400 mb-1">Task.Date</label>
                  <input 
                    type="date" 
                    value={newTask.date}
                    onChange={(e) => setNewTask({...newTask, date: e.target.value})}
                    className="w-full bg-slate-950 border border-slate-700 text-cyan-100 rounded px-2.5 py-2 sm:px-3 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono text-xs sm:text-sm [color-scheme:dark]"
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
                        className="w-full bg-slate-950 border border-slate-700 text-cyan-100 rounded px-2.5 py-2 sm:px-3 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono text-xs sm:text-sm [color-scheme:dark]"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] sm:text-xs font-mono text-slate-400 mb-1">Time.End</label>
                      <input 
                        type="time" 
                        value={newTask.endTime}
                        onChange={(e) => setNewTask({...newTask, endTime: e.target.value})}
                        className="w-full bg-slate-950 border border-slate-700 text-cyan-100 rounded px-2.5 py-2 sm:px-3 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono text-xs sm:text-sm [color-scheme:dark]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] sm:text-xs font-mono text-slate-400 mb-1">Repeat.Cycle</label>
                    <div className="flex bg-slate-950 p-1 rounded border border-slate-800">
                      <button 
                        onClick={() => setNewTask({...newTask, repeat: 'none'})}
                        className={`flex-1 py-1.5 sm:py-2 text-[10px] sm:text-xs font-mono tracking-wider rounded transition-all ${newTask.repeat === 'none' || !newTask.repeat ? 'bg-cyan-900/40 text-cyan-300 border border-cyan-800/50 shadow-[0_0_10px_rgba(6,182,212,0.2)]' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        [ NONE ]
                      </button>
                      <button 
                        onClick={() => setNewTask({...newTask, repeat: 'daily'})}
                        className={`flex-1 py-1.5 sm:py-2 text-[10px] sm:text-xs font-mono tracking-wider rounded transition-all ${newTask.repeat === 'daily' ? 'bg-cyan-900/40 text-cyan-300 border border-cyan-800/50 shadow-[0_0_10px_rgba(6,182,212,0.2)]' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        [ DAILY ]
                      </button>
                      <button 
                        onClick={() => setNewTask({...newTask, repeat: 'weekly'})}
                        className={`flex-1 py-1.5 sm:py-2 text-[10px] sm:text-xs font-mono tracking-wider rounded transition-all ${newTask.repeat === 'weekly' ? 'bg-cyan-900/40 text-cyan-300 border border-cyan-800/50 shadow-[0_0_10px_rgba(6,182,212,0.2)]' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                        [ WEEKLY ]
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-900/80 flex justify-end space-x-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-3 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-mono text-slate-400 bg-transparent border border-slate-700 rounded hover:bg-slate-800 hover:text-slate-200 transition-colors"
              >
                ABORT
              </button>
              <button 
                onClick={handleSaveTask}
                disabled={!newTask.title.trim()}
                className={`px-3 py-1.5 sm:px-4 sm:py-2 text-[10px] sm:text-xs font-mono font-bold text-slate-950 rounded disabled:opacity-50 disabled:bg-slate-700 disabled:text-slate-500 disabled:shadow-none transition-all active:scale-95 ${newTask.type === 'databank' ? 'bg-purple-500 hover:bg-purple-400 hover:shadow-[0_0_15px_rgba(168,85,247,0.6)]' : 'bg-cyan-500 hover:bg-cyan-400 hover:shadow-[0_0_15px_rgba(6,182,212,0.6)]'}`}
              >
                EXECUTE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REPEAT TASK DELETE CONFIRMATION MODAL */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-slate-900 border border-red-900/50 rounded-lg shadow-[0_0_40px_rgba(220,38,38,0.3)] w-full max-w-sm p-4 sm:p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-red-400 font-mono font-bold tracking-wide text-sm sm:text-base flex items-center gap-2">
              <Trash2 size={18} />
              CONFIRM DELETION
            </h3>
            <p className="text-slate-300 text-xs sm:text-sm font-mono leading-relaxed">
              This is a repeating task cycle. Specify the deletion parameter:
            </p>
            <div className="flex flex-col space-y-2 pt-2">
              <button onClick={() => confirmDelete('single')} className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded font-mono text-xs transition-colors text-left flex justify-between items-center group">
                <span>[ DELETE INSTANCE ]</span>
                <span className="text-slate-500 group-hover:text-cyan-400">Only this date</span>
              </button>
              <button onClick={() => confirmDelete('future')} className="px-4 py-2.5 bg-red-900/20 hover:bg-red-900/40 text-red-300 border border-red-900/50 rounded font-mono text-xs transition-colors text-left flex justify-between items-center group">
                <span>[ DELETE FUTURE ]</span>
                <span className="text-red-500/50 group-hover:text-red-400">This & upcoming</span>
              </button>
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 mt-2 text-slate-500 hover:text-slate-300 font-mono text-xs transition-colors text-center w-full">
                ABORT SEQUENCE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}