import { gsap, confetti } from './vendor.js';
import {
  db,
  collectionGroup,
  query,
  where,
  onSnapshot,
  orderBy,
  updateDoc,
  deleteDoc,
  setDoc,
  doc,
  getDocs,
} from './firebase-config.js';

import { state } from './state.js';
import { showCustomAlert } from './ui/alerts.js';
import { sendAssignmentPush } from './push.js';
import { syncServerClock } from './clock.js';
import { canUserEditTask, getTaskEditPermission, taskEditDenyMessage } from './permissions.js';
const lucide = window.lucide;


let unsubscribeTasks = null;
let initialLoadComplete = false;
// Notifications are provided by auth-ui.js
function sendLocalNotification(title, body) {
  if (typeof window.__sendLocalNotification === 'function') {
    window.__sendLocalNotification(title, body);
  }
}


// --- FIREBASE TASKS ---
function subscribeToTasks() {
    if (unsubscribeTasks) unsubscribeTasks();

    let isFirstLoad = true;
    const loadingScreen = document.getElementById('loading-screen');
    if (!initialLoadComplete && loadingScreen) loadingScreen.classList.remove('hidden');

    const year = state.date.getFullYear();
    const month = state.date.getMonth();
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    function onTaskSnapshot(snapshot) {
        state.tasks = snapshot.docs.map(doc => ({ id: doc.id, path: doc.ref.path, ...doc.data() }));

        if (isFirstLoad && loadingScreen) {
            loadingScreen.classList.add('hidden');
            initialLoadComplete = true;
        }

        if (!isFirstLoad) {
            snapshot.docChanges().forEach((change) => {
                const task = change.doc.data();
                if (snapshot.metadata.hasPendingWrites) return;

                const userName = state.user ? (state.user.name || state.user.nome || "").toUpperCase() : "";
                if (userName && task.assignee && task.assignee.includes(userName) && !task.completed) {
                    const [y, m, d] = task.date.split('-');
                    const dateFmt = `${d}/${m}`;
                    if (change.type === "added") {
                        sendLocalNotification("NOVA ESCALA!", `Atividade: ${task.title}\nData: ${dateFmt}`);
                    }
                    if (change.type === "modified") {
                        sendLocalNotification("ATUALIZAÇÃO DE ESCALA", `Verifique sua atividade: ${task.title}\nData: ${dateFmt}`);
                    }
                }
            });
        }
        isFirstLoad = false;
        if (state.calendarView === 'week') renderWeeklyView();
        else renderCalendar();
        if (state.selectedDate) renderTaskList(state.selectedDate.toISOString().split('T')[0]);
    }

    function onTaskError(err) {
        console.warn('Query filtrada falhou, usando query completa:', err);
        if (loadingScreen) loadingScreen.classList.add('hidden');
        // Fallback: carrega tudo sem filtro
        unsubscribeTasks = onSnapshot(
            query(collectionGroup(db, "atividades")),
            onTaskSnapshot,
            (fallbackErr) => {
                console.error('Erro ao carregar tarefas:', fallbackErr);
                if (loadingScreen) loadingScreen.classList.add('hidden');
                renderCalendar();
            }
        );
    }

    try {
        const tasksQuery = query(
            collectionGroup(db, "atividades"),
            where("date", ">=", startDate),
            where("date", "<=", endDate)
        );
        unsubscribeTasks = onSnapshot(tasksQuery, onTaskSnapshot, onTaskError);
    } catch (err) {
        console.warn('Erro na query filtrada:', err);
        unsubscribeTasks = onSnapshot(
            query(collectionGroup(db, "atividades")),
            onTaskSnapshot,
            (fallbackErr) => {
                console.error('Erro ao carregar tarefas:', fallbackErr);
                if (loadingScreen) loadingScreen.classList.add('hidden');
                renderCalendar();
            }
        );
    }
}

// --- UI HELPERS ---
function playIntro() { gsap.to('.login-item', { opacity: 1, y: 0, duration: 0.8, stagger: 0.1, ease: "power4.out" }); }
function animatePageTransition() {
    gsap.timeline()
        .to('#login-screen', { opacity: 0, scale: 0.95, duration: 0.4, onComplete: () => {
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-screen').classList.remove('hidden');
        }})
        .to('.app-content', { opacity: 1, y: 0, duration: 0.6, stagger: 0.15, onComplete: () => {
            setupSwipeGestures();
            if (window.startOnboarding) {
                const isAdmin = state.user && state.user.role === 'admin';
                window.startOnboarding(isAdmin);
            }
        }});
}

// --- CALENDAR ---
window.changeMonth = function(offset) {
    const grid = state.calendarView === 'week'
        ? document.getElementById('weekly-grid')
        : document.getElementById('calendar-grid');
    if (!grid) return;

    const direction = offset > 0 ? -1 : 1;
    gsap.to(grid, {
        x: direction * 80,
        opacity: 0,
        duration: 0.2,
        ease: "power2.in",
        onComplete: () => {
            if (state.calendarView === 'week') {
                state.date.setDate(state.date.getDate() + (offset * 7));
                renderWeeklyView();
            } else {
                state.date.setMonth(state.date.getMonth() + offset);
                renderSkeletonCalendar();
                subscribeToTasks();
            }
            gsap.fromTo(grid,
                { x: -direction * 80, opacity: 0 },
                { x: 0, opacity: 1, duration: 0.3, ease: "power2.out" }
            );
        }
    });
}

// --- FILTER HELPERS ---
function getFilteredTasks() {
    let filtered = state.tasks;
    if (state.filterText) {
        const search = state.filterText.toUpperCase();
        filtered = filtered.filter(t => t.title.toUpperCase().includes(search));
    }
    if (state.filterCollaborator) {
        const collab = state.filterCollaborator.toUpperCase();
        filtered = filtered.filter(t => t.assignee && t.assignee.toUpperCase().includes(collab));
    }
    if (state.filterStatus === 'pending') {
        filtered = filtered.filter(t => !t.completed);
    } else if (state.filterStatus === 'completed') {
        filtered = filtered.filter(t => t.completed);
    }
    return filtered;
}

function updateFilterCollaborators() {
    const select = document.getElementById('filter-collaborator');
    if (!select) return;
    const current = select.value;
    const names = new Set();
    state.tasks.forEach(t => {
        if (t.assignee) t.assignee.split(',').forEach(n => { const name = n.trim().toUpperCase(); if (name) names.add(name); });
    });
    select.innerHTML = '<option value="">Todos</option>';
    [...names].sort().forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
    });
    select.value = current;
}

// --- CALENDAR DRAG & DROP (between dates) ---
async function handleCalendarDrop(newDateKey) {
    const taskId = state.calendarDragTaskId;
    if (!taskId) return;
    const task = state.tasks.find(t => t.id === taskId);
    if (!task || task.date === newDateKey) return;
    const isAdmin = state.user && state.user.role === 'admin';
    if (!isAdmin) { showCustomAlert('Apenas administradores podem mover tarefas!'); return; }
    try {
        const modal = document.getElementById('task-modal');
        if (modal) { modal.style.pointerEvents = ''; modal.style.opacity = ''; }
        await updateDoc(doc(db, task.path), { date: newDateKey });
        showCustomAlert('Tarefa movida!', 'success');
        closeModal();
    } catch(e) {
        console.error(e);
        showCustomAlert('Erro ao mover tarefa.');
        const modal = document.getElementById('task-modal');
        if (modal) { modal.style.pointerEvents = ''; modal.style.opacity = ''; }
    }
    state.calendarDragTaskId = null;
    const dragHint = document.getElementById('drag-hint');
    if (dragHint) dragHint.classList.add('hidden');
}

// --- SKELETON LOADING ---
function renderSkeletonCalendar() {
    const grid = document.getElementById('calendar-grid');
    if (!grid) return;

    const monthName = state.date.toLocaleDateString('pt-BR', { month: 'long' });
    document.getElementById('current-month').innerText = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    document.getElementById('current-year').innerText = state.date.getFullYear();

    const year = state.date.getFullYear();
    const month = state.date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    grid.innerHTML = '';
    for (let i = 0; i < firstDay; i++) {
        grid.innerHTML += '<div class="cal-cell" style="cursor:default;opacity:0"></div>';
    }
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'cal-cell skeleton-cell';
        cell.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="skeleton-pulse" style="width:22px;height:22px;border-radius:6px"></div>
            </div>
            <div class="mt-auto flex-col gap-1 hidden sm:flex">
                <div class="skeleton-pulse" style="height:14px;width:100%;border-radius:3px"></div>
                <div class="skeleton-pulse" style="height:14px;width:70%;border-radius:3px"></div>
            </div>
            <div class="cal-dots-row">
                <div class="skeleton-pulse" style="width:5px;height:5px;border-radius:50%"></div>
                <div class="skeleton-pulse" style="width:5px;height:5px;border-radius:50%"></div>
            </div>`;
        grid.appendChild(cell);
    }
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    if(!grid) return;

    const monthName = state.date.toLocaleDateString('pt-BR', { month: 'long' });
    document.getElementById('current-month').innerText = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    document.getElementById('current-year').innerText = state.date.getFullYear();
    grid.innerHTML = '';

    const year = state.date.getFullYear();
    const month = state.date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = new Date().toISOString().split('T')[0];
    const filteredTasks = getFilteredTasks();
    updateFilterCollaborators();

    for(let i=0; i<firstDay; i++) grid.innerHTML += `<div class="cal-cell" style="cursor:default;opacity:0"></div>`;

    for(let day=1; day<=daysInMonth; day++) {
        const dateObj = new Date(year, month, day);
        const dateKey = dateObj.toISOString().split('T')[0];
        const isToday = new Date().toDateString() === dateObj.toDateString();
        const dayTasks = filteredTasks.filter(t => t.date === dateKey);
        const allCompleted = dayTasks.length > 0 && dayTasks.every(t => t.completed);

        const cell = document.createElement('div');
        let cellClass = 'cal-cell';
        if (isToday) cellClass += ' is-today';
        else if (allCompleted) cellClass += ' all-done';
        else if (dayTasks.length > 0) cellClass += ' has-tasks';
        cell.className = cellClass;
        cell.onclick = () => openModal(dateObj);

        // Calendar cell as drop target for moving tasks between dates
        cell.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; cell.classList.add('cal-drag-over'); });
        cell.addEventListener('dragleave', (e) => { if (!cell.contains(e.relatedTarget)) cell.classList.remove('cal-drag-over'); });
        cell.addEventListener('drop', (e) => { e.preventDefault(); cell.classList.remove('cal-drag-over'); handleCalendarDrop(dateKey); });

        // Day number
        const dayNum = `<span class="cal-day-number">${day}</span>`;
        const checkIcon = allCompleted ? '<i data-lucide="check" class="w-3 h-3 text-emerald-500 sm:w-3.5 sm:h-3.5" style="flex-shrink:0"></i>' : '';

        // Desktop: task tag previews
        let desktopTags = '';
        dayTasks.slice(0, 2).forEach(t => {
            const dotColor = t.completed ? 'background:#16a34a' : (t.date < todayStr && (!t.photos || t.photos.length === 0)) ? 'background:#ef4444' : 'background:#f59e0b';
            desktopTags += `<div class="cal-task-tag"><span class="cal-task-dot" style="${dotColor}"></span><span class="${t.completed ? 'line-through opacity-40' : ''}" style="overflow:hidden;text-overflow:ellipsis">${t.title}</span></div>`;
        });
        if(dayTasks.length > 2) desktopTags += `<span class="text-[9px] font-medium text-gray-400 pl-1">+${dayTasks.length - 2}</span>`;

        // Mobile: colored dots
        let mobileDots = '';
        if (dayTasks.length > 0) {
            mobileDots = dayTasks.slice(0, 4).map(t => {
                const c = t.completed ? '#16a34a' : (t.date < todayStr && (!t.photos || t.photos.length === 0)) ? '#ef4444' : '#f59e0b';
                return `<span class="cal-task-dot" style="background:${c}"></span>`;
            }).join('');
            if (dayTasks.length > 4) mobileDots += `<span style="font-size:7px;color:#9ca3af;font-weight:700">+${dayTasks.length - 4}</span>`;
        }

        cell.innerHTML = `
            <div class="flex justify-between items-start">${dayNum}${checkIcon}</div>
            <div class="mt-auto flex flex-col gap-0.5">${desktopTags}</div>
            <div class="cal-dots-row">${mobileDots}</div>`;
        grid.appendChild(cell);
    }
    lucide.createIcons();
}

// --- WEEKLY VIEW ---
function renderWeeklyView() {
    const calGrid = document.getElementById('calendar-grid');
    const weekGrid = document.getElementById('weekly-grid');
    const weekdayHeaders = document.getElementById('weekday-headers');
    if (!weekGrid) return;

    if (calGrid) calGrid.classList.add('hidden');
    if (weekdayHeaders) weekdayHeaders.classList.add('hidden');
    weekGrid.classList.remove('hidden');

    const refDate = new Date(state.date);
    const dayOfWeek = refDate.getDay();
    const weekStart = new Date(refDate);
    weekStart.setDate(refDate.getDate() - dayOfWeek);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const monthStart = weekStart.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
    const monthEnd = weekEnd.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
    document.getElementById('current-month').innerText = `${weekStart.getDate()} - ${weekEnd.getDate()}`;
    document.getElementById('current-year').innerText =
        monthStart === monthEnd ? `${monthStart} ${weekStart.getFullYear()}` :
        `${monthStart} - ${monthEnd} ${weekEnd.getFullYear()}`;

    const todayStr = new Date().toISOString().split('T')[0];
    const filteredTasks = getFilteredTasks();
    const dayNames = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

    weekGrid.innerHTML = '';

    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(weekStart);
        dayDate.setDate(weekStart.getDate() + i);
        const dateKey = dayDate.toISOString().split('T')[0];
        const isToday = dateKey === todayStr;
        const dayTasks = filteredTasks.filter(t => t.date === dateKey);

        const col = document.createElement('div');
        col.className = `weekly-day${isToday ? ' weekly-today' : ''}${i === 0 || i === 6 ? ' weekly-weekend' : ''}`;
        col.onclick = () => openModal(new Date(dayDate));

        let tasksHTML = dayTasks.length === 0
            ? '<p class="weekly-no-tasks">\u2014</p>'
            : dayTasks.map(t => {
                const dot = t.completed ? '#22c55e' : '#f59e0b';
                return `<div class="weekly-task${t.completed ? ' weekly-task-done' : ''}">
                    <span class="weekly-task-dot" style="background:${dot}"></span>
                    <span class="weekly-task-title">${t.title}</span>
                </div>`;
            }).join('');

        col.innerHTML = `
            <div class="weekly-day-header">
                <span class="weekly-day-name">${dayNames[i]}</span>
                <span class="weekly-day-num${isToday ? ' weekly-num-today' : ''}">${dayDate.getDate()}</span>
            </div>
            <div class="weekly-day-tasks">${tasksHTML}</div>`;
        weekGrid.appendChild(col);
    }
    lucide.createIcons();
}

// --- VIEW TOGGLE ---
window.setCalendarView = function(view) {
    state.calendarView = view;
    document.querySelectorAll('.view-toggle-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`view-${view}`);
    if (activeBtn) activeBtn.classList.add('active');

    const calGrid = document.getElementById('calendar-grid');
    const weekGrid = document.getElementById('weekly-grid');
    const weekdayHeaders = document.getElementById('weekday-headers');

    if (view === 'week') {
        if (calGrid) calGrid.classList.add('hidden');
        if (weekdayHeaders) weekdayHeaders.classList.add('hidden');
        renderWeeklyView();
    } else {
        if (weekGrid) { weekGrid.classList.add('hidden'); weekGrid.innerHTML = ''; }
        if (weekdayHeaders) weekdayHeaders.classList.remove('hidden');
        if (calGrid) calGrid.classList.remove('hidden');
        renderCalendar();
    }
}

// --- SWIPE GESTURES ---
function setupSwipeGestures() {
    const wrapper = document.querySelector('.cal-wrapper');
    if (!wrapper || wrapper._swipeReady) return;
    wrapper._swipeReady = true;

    let startX = 0, startY = 0, swiping = false;

    wrapper.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        swiping = true;
    }, { passive: true });

    wrapper.addEventListener('touchmove', (e) => {
        if (!swiping) return;
        if (Math.abs(e.touches[0].clientY - startY) > 30) swiping = false;
    }, { passive: true });

    wrapper.addEventListener('touchend', (e) => {
        if (!swiping) return;
        const diff = startX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 60) changeMonth(diff > 0 ? 1 : -1);
        swiping = false;
    });
}

window.toggleDay = function(btn) {
    const day = parseInt(btn.dataset.day);
    btn.classList.toggle('selected');
    if(btn.classList.contains('selected')) state.selectedRecurrenceDays.push(day);
    else state.selectedRecurrenceDays = state.selectedRecurrenceDays.filter(d => d !== day);
}

// --- WIZARD STEP NAVIGATION ---
window.goToStep = function(step) {
    if (step === 2) {
        const title = document.getElementById('input-title');
        if (!title || !title.value.trim()) {
            showCustomAlert('Digite o nome da atividade!');
            if (title) title.focus();
            return;
        }
    }
    document.querySelectorAll('.wizard-step').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(`wizard-step-${step}`);
    if (target) target.classList.remove('hidden');
    document.querySelectorAll('#step-dots .step-dot').forEach((dot, i) => {
        dot.style.background = (i < step) ? '#e41e26' : 'rgba(228,30,38,0.2)';
        dot.style.width = (i + 1 === step) ? '16px' : '8px';
    });
    if (step === 3 && state.selectedDate) {
        const dateSpan = document.getElementById('wizard-selected-date');
        if (dateSpan) {
            const d = state.selectedDate;
            dateSpan.textContent = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
        }
    }
    lucide.createIcons();
}

function openModal(date) {
    state.selectedDate = date;
    const modal = document.getElementById('task-modal');
    document.getElementById('modal-title').innerText = date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric' }).toUpperCase();
    
    const isAdmin = state.user && state.user.role === 'admin';
    const adminArea = document.getElementById('admin-add-area');
    const shareBtn = document.getElementById('btn-share-schedule');

    if(adminArea) {
        adminArea.classList.toggle('hidden', !isAdmin);
        state.selectedCollaborators = [];
    state.selectedCollaboratorIds = [];
    state.selectedCollaboratorIds = [];
        if (typeof window.renderCollaboratorTags === 'function') window.renderCollaboratorTags();
        document.getElementById('input-resp').value = '';
        if (isAdmin && typeof window.setupAutocomplete === 'function') window.setupAutocomplete();
    }
    if (shareBtn) shareBtn.classList.toggle('hidden', !isAdmin);
    if (typeof window.goToStep === 'function') window.goToStep(1);

    renderTaskList(date.toISOString().split('T')[0]);
    modal.classList.remove('hidden');
    gsap.to(modal, { opacity: 1, duration: 0.3 });
    gsap.fromTo(modal.querySelector('.bottom-sheet'), { y: '100%' }, { y: 0, duration: 0.5, ease: "power3.out" });
}

window.closeModal = function() {
    const modal = document.getElementById('task-modal');
    gsap.to(modal.querySelector('.bottom-sheet'), { y: '100%', duration: 0.4, ease: "power3.in" });
    gsap.to(modal, { opacity: 0, duration: 0.3, delay: 0.1, onComplete: () => modal.classList.add('hidden') });
    state.editingTaskId = null;
}

function renderTaskList(dateKey) {
    const list = document.getElementById('task-list');
    const allDayTasks = state.tasks.filter(t => t.date === dateKey);
    const dayTasks = getFilteredTasks().filter(t => t.date === dateKey).sort((a, b) => (a.order || 0) - (b.order || 0));
    const emptyState = document.getElementById('empty-state');
    const hiddenByFilter = allDayTasks.length - dayTasks.length;

    list.innerHTML = '';
    if (hiddenByFilter > 0) {
        const banner = document.createElement('div');
        banner.className = 'flex items-center justify-between bg-[#fef8f8] border border-[#e41e26]/10 rounded-[12px] px-4 py-3 mb-3';
        banner.innerHTML = `<div class="flex items-center gap-2"><i data-lucide="filter" class="w-3.5 h-3.5 text-[#e41e26]"></i><span class="text-[11px] font-bold text-[#e41e26]">${hiddenByFilter} tarefa(s) oculta(s) pelo filtro</span></div><button onclick="clearFilters()" class="text-[10px] font-bold text-[#94a3b8] hover:text-[#e41e26] uppercase tracking-[0.15em]">Limpar</button>`;
        list.appendChild(banner);
    }
    if (dayTasks.length === 0) {
        emptyState.classList.remove('hidden'); gsap.to(emptyState, { opacity: 1, scale: 1 });
    } else {
        emptyState.classList.add('hidden'); emptyState.style.opacity = 0;
    }

    const isAdmin = state.user && state.user.role === 'admin';

    dayTasks.forEach(task => {
        const isEditing = state.editingTaskId === task.id;
        let contentHTML = '';
        const recurIcon = (task.recurrence && task.recurrence !== 'none') ? `<span class="ml-2 text-[9px] text-slate-400"><i data-lucide="refresh-cw" class="w-3 h-3 inline"></i></span>` : '';

        const canEdit = canUserEditTask(task);

        if (isEditing && isAdmin) {
            const assignees = task.assignee.split(',').map(n => n.trim()).filter(n => n);
            // GERA TAGS VISUAIS COM BOTÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢O DE REMOVER LOCAL
            let tagsHTML = assignees.map(name => `
                <span class="cursor-pointer hover:bg-[#fef2f2] hover:text-[#e41e26] hover:border-[#e41e26]/30 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#fafafa] text-[10px] font-bold text-[#151515] border border-[#e5e7eb] transition-all" data-name="${name}" onclick="this.remove()">
                    ${name} <i data-lucide="x" class="w-3 h-3 text-[#94a3b8]"></i>
                </span>`).join('');

            contentHTML = `
                <div class="flex flex-col gap-3.5 w-full bg-[#fafafa] p-4 rounded-[12px] border border-[#e5e7eb]">
                    <div>
                        <label class="text-[10px] font-bold text-[#6b7280] uppercase tracking-[0.15em] mb-1.5 block">Editar Título</label>
                        <input type="text" id="edit-title-${task.id}" value="${task.title}" oninput="forceUppercase(this)" class="w-full bg-white border border-[#e5e7eb] rounded-[10px] px-3.5 py-2.5 text-sm font-bold outline-none focus:border-[#e41e26] focus:ring-2 focus:ring-[#e41e26]/10 text-[#151515] transition-all">
                    </div>
                    <div>
                        <p class="text-[10px] font-bold text-[#6b7280] uppercase tracking-[0.15em] mb-2">Colaboradores</p>
                        <div id="tags-container-${task.id}" class="flex flex-wrap mb-2 gap-1.5">${tagsHTML}</div>
                        <div class="flex gap-2 relative">
                            <input type="text" id="new-collab-${task.id}" placeholder="BUSCAR NOME..." oninput="handleEditSearch(this, '${task.id}')" class="flex-1 bg-white border border-[#e5e7eb] rounded-[10px] px-3.5 py-2.5 text-xs font-bold outline-none focus:border-[#e41e26] focus:ring-2 focus:ring-[#e41e26]/10 transition-all">
                            <div id="suggestions-${task.id}" class="absolute top-full left-0 w-full bg-white border border-[#e5e7eb] rounded-[12px] z-50 hidden max-h-32 overflow-y-auto mt-1" style="box-shadow:0 20px 40px rgba(15,23,42,0.12)"></div>
                            <button onclick="addLocalTag('${task.id}')" class="bg-[#e41e26] text-white p-2.5 rounded-[10px] hover:bg-[#c61a21] transition-colors shadow-sm"><i data-lucide="plus" class="w-4 h-4"></i></button>
                        </div>
                    </div>
                    <button onclick="saveEdit('${task.id}')" class="w-full py-2.5 bg-[#e41e26] hover:bg-[#c61a21] text-white rounded-[10px] font-extrabold text-xs shadow-lg shadow-[#e41e26]/20 uppercase tracking-wider transition-all active:scale-[0.97]">Salvar Alterações</button>
                </div>`;
        } else {
            let checkbox = '';
            if (!state.user) {
                checkbox = `<div class="w-7 h-7 rounded-full border-2 border-[#e5e7eb] mr-3 bg-[#fafafa] flex-shrink-0"></div>`;
            } else if (canEdit) {
                checkbox = `<button onclick="toggleTask('${task.id}')" class="w-7 h-7 rounded-full border-2 mr-3 flex items-center justify-center transition-all flex-shrink-0 ${task.completed ? 'bg-[#22c55e] border-[#22c55e] shadow-md shadow-green-500/20 scale-105' : 'border-[#cbd5e1] hover:border-[#e41e26] hover:bg-[#fef2f2]'}">${task.completed ? '<i data-lucide="check" class="text-white w-3.5 h-3.5"></i>' : ''}</button>`;
            } else {
                checkbox = `<div class="w-7 h-7 rounded-full border-2 border-[#e5e7eb] mr-3 flex items-center justify-center bg-[#fafafa] text-[#cbd5e1] cursor-not-allowed flex-shrink-0" title="Restrito"><i data-lucide="lock" class="w-3 h-3"></i></div>`;
            }

            let assigneesHTML = task.assignee.split(',').map(n => {
                const trimmed = n.trim();
                if (!trimmed) return '';
                const collab = (state.colaborators || []).find(c => c.nome.toUpperCase() === trimmed.toUpperCase());
                const avatarHTML = collab && collab.photo
                    ? `<img src="${collab.photo}" class="w-6 h-6 rounded-full object-cover border-2 border-white shadow-sm">`
                    : `<div class="w-6 h-6 rounded-full bg-[#e41e26] text-white flex items-center justify-center text-[9px] font-black shadow-sm border-2 border-white">${trimmed.charAt(0)}</div>`;
                return `<div class="flex items-center gap-2 px-3 py-1.5 rounded-[10px] border border-[#e5e7eb] bg-[#fafafa] text-[#151515]">${avatarHTML}<span class="text-[11px] font-bold">${trimmed}</span></div>`;
            }).join('');
            let editBtn = isAdmin ? `<button onclick="enableEdit('${task.id}')" class="text-[#cbd5e1] hover:text-[#e41e26] p-1.5 rounded-lg hover:bg-[#fef2f2] transition-all"><i data-lucide="pencil" class="w-4 h-4"></i></button>` : '';
            let deleteBtn = isAdmin ? `<button onclick="askDelete('task', '${task.id}')" class="text-[#cbd5e1] hover:text-[#ef4444] p-1.5 rounded-lg hover:bg-[#fef2f2] transition-all"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : '';

            contentHTML = `
                <div class="flex items-start justify-between w-full">
                    <div class="flex items-start flex-1 min-w-0">
                        ${checkbox}
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-1.5">
                                <h4 class="font-extrabold text-[#151515] text-[14px] tracking-tight leading-tight ${task.completed ? 'line-through text-[#94a3b8]' : ''}">${task.title}</h4>
                                ${recurIcon}
                            </div>
                            ${assigneesHTML ? `<div class="mt-3"><p class="text-[9px] font-bold text-[#9ca3af] uppercase tracking-[0.15em] mb-1.5">Responsáveis</p><div class="flex flex-wrap gap-1.5">${assigneesHTML}</div></div>` : ''}
                        </div>
                    </div>
                    <div class="flex gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">${editBtn}${deleteBtn}</div>
                </div>`;
        }

        let photosHTML = (task.photos || []).map((p, i) => `<div class="relative group/photo w-24 h-24 sm:w-28 sm:h-28 rounded-[12px] border border-[#e5e7eb] overflow-hidden hover:shadow-lg transition-shadow cursor-pointer" onclick="viewImage('${p}')"><img src="${p}" class="w-full h-full object-cover">${state.user ? `<button onclick="event.stopPropagation(); askDelete('photo', '${task.id}', null, ${i})" class="absolute top-1 right-1 bg-[#ef4444] text-white p-1 rounded-full opacity-0 group-hover/photo:opacity-100 transition-opacity shadow-sm"><i data-lucide="x" class="w-2.5 h-2.5"></i></button>` : ''}</div>`).join('');
        const hasAssignee = task.assignee && task.assignee.trim() !== '';
        let uploadBtn = (state.user && !task.completed && canEdit && hasAssignee) ? `<label class="w-24 h-24 sm:w-28 sm:h-28 rounded-[12px] border-2 border-dashed border-[#d1d5db] text-[#94a3b8] text-[10px] font-bold hover:text-[#e41e26] hover:border-[#e41e26]/40 hover:bg-[#fef2f2] flex flex-col items-center justify-center gap-1.5 cursor-pointer bg-[#fafafa] transition-all"><input type="file" accept="image/*" capture="environment" onchange="handleRealPhoto(this, '${task.id}')"><i data-lucide="camera" class="w-5 h-5"></i><span class="uppercase tracking-wider">Foto</span></label>` : '';
        let commentsHTML = (task.comments || []).map((c, i) => {
            const isAdminComment = c.matricula && String(c.matricula).includes('@');
            const identityLabel = isAdminComment ? `<span class="text-[#b0b0b0] font-medium text-[9px]">${c.matricula}</span>` : `<span class="text-[#b0b0b0] font-medium text-[9px]">#${c.matricula || 'N/A'}</span>`;
            const initial = c.author ? c.author.charAt(0) : '?';
            return `<div class="flex gap-2.5 mb-3 group/comment last:mb-0">
                <div class="w-7 h-7 rounded-full bg-[#e41e26] text-white flex items-center justify-center text-[9px] font-black flex-shrink-0 mt-0.5">${initial}</div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <div class="flex items-center gap-1.5 min-w-0">
                            <span class="text-[11px] font-bold text-[#151515] truncate">${c.author}</span>
                            ${identityLabel}
                        </div>
                        ${state.user ? `<button onclick="askDelete('comment', '${task.id}', null, ${i})" class="text-[#d1d5db] hover:text-[#ef4444] opacity-0 group-hover/comment:opacity-100 transition-all flex-shrink-0"><i data-lucide="trash" class="w-3 h-3"></i></button>` : ''}
                    </div>
                    <div class="text-[11px] text-[#4b5563] bg-[#f5f5f5] p-2.5 rounded-lg rounded-tl-none leading-relaxed">${c.text}</div>
                </div>
            </div>`;
        }).join('');
        let commentInput = state.user ? `<div class="mt-3 flex gap-2 items-center"><div class="flex-1 relative"><input type="text" id="comment-${task.id}" oninput="forceUppercase(this)" placeholder="Escrever observação…" class="w-full bg-[#f5f5f5] rounded-full pl-4 pr-3 py-2.5 text-[11px] font-bold outline-none focus:bg-white focus:ring-2 focus:ring-[#e41e26]/10 focus:border-[#e41e26] border border-transparent focus:border-[#e5e7eb] transition-all text-[#151515] placeholder-[#b0b0b0]"></div><button onclick="prepareComment('${task.id}')" class="w-9 h-9 rounded-full text-white bg-[#e41e26] hover:bg-[#c61a21] transition-all flex items-center justify-center flex-shrink-0 shadow-sm active:scale-95"><i data-lucide="send" class="w-3.5 h-3.5"></i></button></div>` : '';

        const item = document.createElement('div');
        item.className = `task-item draggable-item opacity-0 translate-y-4 group bg-white p-5 rounded-[14px] border border-[#e5e7eb] transition-all duration-300 hover:border-[#e41e26]/20 ${task.completed ? 'opacity-50' : ''}`;
        item.style.cssText = 'box-shadow: 0 2px 8px rgba(15,23,42,0.04)';
        item.id = `task-item-${task.id}`;
        item.draggable = true;
        item.ondragstart = (e) => {
            handleListDragStart(e, task.id);
            // Custom ghost element
            const ghost = document.createElement('div');
            ghost.className = 'drag-ghost';
            ghost.textContent = task.title;
            document.body.appendChild(ghost);
            e.dataTransfer.setDragImage(ghost, 20, 20);
            setTimeout(() => ghost.remove(), 0);
            if (isAdmin) {
                state.calendarDragTaskId = task.id;
                e.dataTransfer.setData('text/plain', task.id);
                setTimeout(() => {
                    const taskModal = document.getElementById('task-modal');
                    if (taskModal) { taskModal.style.pointerEvents = 'none'; taskModal.style.opacity = '0.15'; }
                    const dragHint = document.getElementById('drag-hint');
                    if (dragHint) dragHint.classList.remove('hidden');
                }, 200);
            }
        };
        item.ondragend = (e) => {
            e.target.classList.remove('dragging');
            listDraggedId = null;
            if (isAdmin) {
                state.calendarDragTaskId = null;
                const taskModal = document.getElementById('task-modal');
                if (taskModal) { taskModal.style.pointerEvents = ''; taskModal.style.opacity = ''; }
                document.querySelectorAll('.cal-drag-over').forEach(c => c.classList.remove('cal-drag-over'));
                const dragHint = document.getElementById('drag-hint');
                if (dragHint) dragHint.classList.add('hidden');
            }
        };
        item.ondragover = (e) => handleListDragOver(e);
        item.ondrop = (e) => handleListDrop(e, task.id, dateKey);
        item.onmouseenter = () => { item.style.boxShadow = '0 8px 24px rgba(15,23,42,0.08)'; };
        item.onmouseleave = () => { item.style.boxShadow = '0 2px 8px rgba(15,23,42,0.04)'; };

        const hasPhotos = photosHTML || uploadBtn;
        const hasComments = (task.comments && task.comments.length) || state.user;
        item.innerHTML = `${contentHTML}${hasPhotos ? `<div class="mt-4 pl-10"><p class="text-[9px] font-bold text-[#9ca3af] uppercase tracking-[0.15em] mb-2">Comprovantes</p><div class="flex flex-wrap gap-2 items-start">${photosHTML}${uploadBtn}</div></div>` : ''}${hasComments ? `<div class="mt-4 pl-10 pt-4 border-t border-[#f3f4f6]"><p class="text-[9px] font-bold text-[#9ca3af] uppercase tracking-[0.15em] mb-3 flex items-center gap-1.5"><i data-lucide="message-square" class="w-3 h-3"></i> Observações</p>${commentsHTML}${commentInput}</div>` : ''}`;
        list.appendChild(item);
    });
    
    lucide.createIcons();
    const taskItems = document.querySelectorAll('.task-item');
    if (taskItems.length) {
        gsap.to(taskItems, { opacity: 1, y: 0, duration: 0.4, stagger: 0.08 });
    }
}

window.addTask = async function(e) {
    e.preventDefault();
    const titleInput = document.getElementById('input-title');

    if (!titleInput.value.trim()) return;

    const baseDate = new Date(state.selectedDate);
    const titleVal = titleInput.value.trim().toUpperCase();
    const assigneeNames = state.selectedCollaborators.join(', ');
    const assigneeIds = state.selectedCollaboratorIds.filter(Boolean);

    const generateSafeId = (title) => {
        const clean = title.toLowerCase().replace(/[^a-z0-9]/g, '_');
        return `${clean}_${Date.now()}`;
    };

    const getCollectionPath = (dateObj, title) => {
        const y = dateObj.getFullYear().toString();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        const safeId = generateSafeId(title);
        return {
            docRef: doc(db, "cleaning_tasks", y, m, d, "atividades", safeId),
            dateStr: dateObj.toISOString().split('T')[0]
        };
    };

    const checkDuplicate = (dateStr) => state.tasks.some(t => t.date === dateStr && t.title.toUpperCase() === titleVal);

    const btn = e.submitter;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>`;

    try {
        if (state.selectedRecurrenceDays.length === 0) {
            const { docRef, dateStr } = getCollectionPath(baseDate, titleVal);
            if (checkDuplicate(dateStr)) {
                showCustomAlert("Tarefa duplicada para este dia!");
                btn.innerHTML = originalText;
                return;
            }

            await setDoc(docRef, {
                title: titleVal,
                assignee: assigneeNames,
                assigneeIds: assigneeIds,
                date: dateStr,
                completed: false,
                hasPhotoProof: false,
                photos: [],
                comments: [],
                searchKeywords: titleVal.toLowerCase().split(' '),
                recurrence: 'none',
                order: Date.now()
            });

            if (assigneeIds.length) {
                const parts = dateStr.split('-');
                const dateFmt = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dateStr;
                sendAssignmentPush({
                    assigneeIds,
                    title: 'NOVA ESCALA!',
                    body: `Atividade: ${titleVal}\nData: ${dateFmt}`,
                    taskPath: docRef.path,
                    taskId: docRef.id,
                    date: dateStr
                });
            }

        } else {
            const groupId = Date.now().toString();
            const batchPromises = [];
            let baseDocRef = null;
            let duplicateFound = false;

            const startYear = baseDate.getFullYear();
            let loopDate = new Date(baseDate);
            let orderCount = 0;
            const baseDateStr = baseDate.toISOString().split('T')[0];

            while (loopDate.getFullYear() === startYear) {
                if (state.selectedRecurrenceDays.includes(loopDate.getDay())) {
                    const { docRef, dateStr } = getCollectionPath(loopDate, titleVal);

                    if (checkDuplicate(dateStr)) { duplicateFound = true; break; }

                    const instanceAssignee = (dateStr === baseDateStr) ? assigneeNames : "";
                    const instanceAssigneeIds = (dateStr === baseDateStr) ? assigneeIds : [];

                    if (dateStr === baseDateStr) baseDocRef = docRef;

                    batchPromises.push(setDoc(docRef, {
                        title: titleVal,
                        assignee: instanceAssignee,
                        assigneeIds: instanceAssigneeIds,
                        date: dateStr,
                        completed: false,
                        hasPhotoProof: false,
                        photos: [],
                        comments: [],
                        searchKeywords: titleVal.toLowerCase().split(' '),
                        recurrence: 'weekly',
                        groupId: groupId,
                        order: Date.now() + orderCount
                    }));
                }
                loopDate.setDate(loopDate.getDate() + 1);
                orderCount++;
            }

            if (duplicateFound) {
                showCustomAlert("Cancelado: haveria duplicatas na série.");
                btn.innerHTML = originalText;
                return;
            }

            await Promise.all(batchPromises);

            if (baseDocRef && assigneeIds.length) {
                const parts = baseDateStr.split('-');
                const dateFmt = parts.length === 3 ? `${parts[2]}/${parts[1]}` : baseDateStr;
                sendAssignmentPush({
                    assigneeIds,
                    title: 'NOVA ESCALA!',
                    body: `Atividade: ${titleVal}\nData: ${dateFmt}`,
                    taskPath: baseDocRef.path,
                    taskId: baseDocRef.id,
                    date: baseDateStr
                });
            }
        }

        titleInput.value = '';
        document.getElementById('input-resp').value = '';
        state.selectedRecurrenceDays = [];
        state.selectedCollaborators = [];
        state.selectedCollaboratorIds = [];
        if (typeof window.renderCollaboratorTags === 'function') window.renderCollaboratorTags();
        document.querySelectorAll('.day-toggle').forEach(b => b.classList.remove('selected'));
        if (typeof window.goToStep === 'function') window.goToStep(1);

        btn.innerHTML = `<i data-lucide="check" class="w-5 h-5"></i>`;
        btn.classList.add('bg-emerald-500');
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.classList.remove('bg-emerald-500');
            lucide.createIcons();
        }, 2000);

    } catch (e) {
        console.error(e);
        showCustomAlert("Erro ao salvar.");
        btn.innerHTML = originalText;
    }
}
window.toggleTask = async function(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;

    await syncServerClock();
    const perm = getTaskEditPermission(task);
    if (!perm.ok) {
        showCustomAlert(taskEditDenyMessage(perm.reason));
        return;
    }
    const isAdmin = state.user && state.user.role === 'admin';
    const hasPhotos = task.photos && task.photos.length > 0;

    if(!isAdmin && !task.completed && !hasPhotos) {
        gsap.to('.bottom-sheet', { x: [-5, 5, -5, 5, 0], duration: 0.4 });
        showCustomAlert('Obrigatório anexar foto antes de concluir!'); return;
    }

    try {
        const userName = state.user ? (state.user.name || state.user.nome) : 'Usuário';
        await updateDoc(doc(db, task.path), { 
            completed: !task.completed, 
            completedBy: task.completed ? null : userName 
        });
        if (!task.completed) confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#e41e26', '#ffffff'] });
    } catch (e) { console.error(e); }
}

window.enableEdit = function(taskId) { state.editingTaskId = taskId; renderTaskList(state.selectedDate.toISOString().split('T')[0]); }

window.prepareComment = async function(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
        await syncServerClock();
        const perm = getTaskEditPermission(task);
        if (!perm.ok) {
            showCustomAlert(taskEditDenyMessage(perm.reason));
            return;
        }
    }
    const input = document.getElementById(`comment-${taskId}`);
    if(!input.value.trim()) return;
    const commentText = input.value.trim().toUpperCase();

    // Admin: post comment directly with email, no identity modal needed
    const isAdmin = state.user && state.user.role === 'admin';
    if (isAdmin && task) {
        try {
            await updateDoc(doc(db, task.path), {
                comments: [...(task.comments||[]), { text: commentText, author: state.user.name || 'ADMIN', matricula: state.user.name || state.user.id }]
            });
            input.value = '';
        } catch(e) { console.error(e); }
        return;
    }

    state.pendingComment = { taskId, text: commentText };
    const modal = document.getElementById('identity-modal');
    modal.classList.remove('hidden');
    gsap.to(modal, { opacity: 1, duration: 0.2 });

    if(state.user) {
        document.getElementById('id-name').value = (state.user.name || state.user.nome || '').toUpperCase();
        document.getElementById('id-matricula').value = state.user.matricula || state.user.id || '';
    }
}

window.closeIdentityModal = function() {
    const modal = document.getElementById('identity-modal');
    gsap.to(modal, { opacity: 0, duration: 0.2, onComplete: () => { 
        modal.classList.add('hidden'); 
        state.pendingComment = null; 
    }});
}

window.confirmIdentity = async function() {
    const name = document.getElementById('id-name').value.toUpperCase();
    const mat = document.getElementById('id-matricula').value;
    if(!name || !mat) { showCustomAlert('Preencha todos os dados!'); return; }
    
    if(state.pendingComment) {
        const { taskId, text } = state.pendingComment;
        const task = state.tasks.find(t => t.id === taskId);
        if (task) {
            await syncServerClock();
            const perm = getTaskEditPermission(task);
            if (!perm.ok) {
                showCustomAlert(taskEditDenyMessage(perm.reason));
                window.closeIdentityModal();
                return;
            }
        }
        try {
            await updateDoc(doc(db, task.path), { 
                comments: [...(task.comments||[]), { text, author: name, matricula: mat }]
            });
        } catch(e) { console.error(e); }
    }
    window.closeIdentityModal();
}

window.askDelete = function(type, id, parentId, index) {
    const task = state.tasks.find(t => t.id === id);
    const isRecurring = type === 'task' && task && task.groupId && task.recurrence !== 'none';
    state.pendingDelete = { type, id, parentId, index, isRecurring, groupId: task?.groupId, date: task?.date };
    const modal = document.getElementById('delete-modal');
    const singleBtns = document.getElementById('delete-btns-single');
    const groupBtns = document.getElementById('delete-btns-group');
    const title = document.getElementById('delete-modal-title');
    const desc = document.getElementById('delete-modal-desc');

    if (isRecurring) {
        singleBtns.classList.add('hidden'); groupBtns.classList.remove('hidden');
        title.innerText = "Tarefa recorrente"; desc.innerText = "Este item faz parte de uma série. O que deseja fazer?";
    } else {
        singleBtns.classList.remove('hidden'); groupBtns.classList.add('hidden');
        title.innerText = "Excluir item?"; desc.innerText = "Essa ação é irreversível.";
    }

    modal.classList.remove('hidden');
    gsap.to(modal, { opacity: 1, duration: 0.2 });
    gsap.fromTo(modal.querySelector('div'), { scale: 0.9 }, { scale: 1, duration: 0.3 });
}

window.closeDeleteModal = function() {
    const modal = document.getElementById('delete-modal');
    gsap.to(modal, { opacity: 0, duration: 0.2, onComplete: () => { modal.classList.add('hidden'); state.pendingDelete = null; }});
}

window.confirmDelete = async function(deleteFuture = false) {
    if (state.pendingDelete) {
        const { type, id, index, groupId, date } = state.pendingDelete;
        try {
            if (type === 'task') {
                if (deleteFuture && groupId) {
                    const q = query(collectionGroup(db, "atividades"), where("groupId", "==", groupId), where("date", ">=", date));
                    const snapshot = await getDocs(q);
                    const batchPromises = snapshot.docs.map(d => deleteDoc(d.ref));
                    await Promise.all(batchPromises);

                } else {
                    const task = state.tasks.find(t => t.id === id);
                    if(task) {
                        const el = document.getElementById(`task-item-${id}`);
                        if(el) gsap.to(el, { x: 100, opacity: 0, duration: 0.3 });
                        await deleteDoc(doc(db, task.path));
                    }
                }
            } else if (type === 'photo') {
                const task = state.tasks.find(t => t.id === id);
                const newPhotos = [...task.photos]; newPhotos.splice(index, 1);
                await updateDoc(doc(db, task.path), { photos: newPhotos });
            } else if (type === 'comment') {
                const task = state.tasks.find(t => t.id === id);
                const newComments = [...task.comments]; newComments.splice(index, 1);
                await updateDoc(doc(db, task.path), { comments: newComments });
            }
            closeDeleteModal();
        } catch(e) {
            console.error("Erro ao deletar: ", e); showCustomAlert("Erro ao excluir.");
        }
    }
}

let listDraggedId = null;
window.handleListDragStart = function(e, id) { listDraggedId = id; e.target.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
window.handleListDragOver = function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
window.handleListDrop = async function(e, targetId, dateKey) {
    e.preventDefault(); const draggedItem = document.getElementById(`task-item-${listDraggedId}`);
    if(draggedItem) draggedItem.classList.remove('dragging');
    if(listDraggedId === targetId) return;
    const dayTasks = state.tasks.filter(t => t.date === dateKey).sort((a, b) => (a.order || 0) - (b.order || 0));
    const dragIndex = dayTasks.findIndex(t => t.id === listDraggedId);
    const targetIndex = dayTasks.findIndex(t => t.id === targetId);
    
    if(dragIndex > -1 && targetIndex > -1) {
        try {
            const taskDrag = dayTasks[dragIndex];
            const taskTarget = dayTasks[targetIndex];
            await updateDoc(doc(db, taskDrag.path), { order: taskTarget.order });
            await updateDoc(doc(db, taskTarget.path), { order: taskDrag.order });
        } catch(e) { console.error(e); }
    } listDraggedId = null;
}

window.viewImage = function(src) {
    const modal = document.getElementById('image-viewer-modal');
    const img = document.getElementById('full-image');
    if(!modal || !img) return;
    img.src = src; modal.classList.remove('hidden');
    requestAnimationFrame(() => { modal.classList.remove('opacity-0'); img.classList.remove('scale-95'); });
}
window.closeImageModal = function() {
    const modal = document.getElementById('image-viewer-modal');
    const img = document.getElementById('full-image');
    if(!modal || !img) return;
    modal.classList.add('opacity-0'); img.classList.add('scale-95');
    setTimeout(() => { modal.classList.add('hidden'); img.src = ''; }, 300);
}


window.generateShareCard = async function() {
    const date = state.selectedDate;
    const tasks = state.tasks.filter(t => t.date === date.toISOString().split('T')[0]).sort((a, b) => (a.order || 0) - (b.order || 0));
    document.getElementById('card-date-day').innerText = date.getDate();
    document.getElementById('card-date-month').innerText = date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.','').toUpperCase();
    const days = ["DOMINGO", "SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO"];
    document.getElementById("card-subtitle").innerHTML = "<span class=\"w-1.5 h-1.5 rounded-full bg-[#e41e26]\"></span> PROGRAMAÇÃO DE " + days[date.getDay()];
    const listEl = document.getElementById('card-task-list');
    listEl.innerHTML = tasks.length === 0 ? '<div class="text-center py-8 text-slate-400 italic text-sm">DIA LIVRE.</div>' : '';
    tasks.forEach(task => {
        const assignees = task.assignee.split(',').map(n => `<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200 uppercase">${n}</span>`).join('');
        listEl.innerHTML += `<div class="bg-white p-3.5 rounded-xl border-l-4 border-[#e41e26] shadow-sm flex flex-col gap-1.5 mb-2"><h4 class="font-bold text-slate-800 text-sm">${task.title}</h4><div class="flex flex-wrap gap-1 mt-0.5">${assignees}</div></div>`;
    });
    const modal = document.getElementById('share-modal');
    modal.classList.remove('hidden'); gsap.to(modal, { opacity: 1, duration: 0.3 });

    // Move template on-screen so html2canvas can render it (overflow-x:hidden blocks off-screen elements)
    const template = document.getElementById('share-card-template');
    const origStyle = template.style.cssText;
    template.style.cssText = "font-family:'Barlow',sans-serif; position:fixed; left:0; top:0; z-index:-1; pointer-events:none;";

    try {
        await new Promise(r => setTimeout(r, 300));
        const { default: html2canvas } = await import('html2canvas');
        const canvas = await html2canvas(template, { scale: 3, useCORS: true, allowTaint: true, logging: false });
        const img = document.createElement('img');
        img.src = canvas.toDataURL("image/png");
        img.className = "w-full h-auto rounded-[12px]";
        img.id = "generated-card-img";
        const cont = document.getElementById('share-preview-container');
        cont.innerHTML = '';
        cont.appendChild(img);
    } catch (err) {
        console.error('Erro ao gerar card:', err);
        const cont = document.getElementById('share-preview-container');
        cont.innerHTML = '<div class="flex flex-col items-center gap-2 p-6"><i data-lucide="alert-triangle" class="w-6 h-6 text-[#ef4444]"></i><p class="text-[11px] text-[#ef4444] font-bold uppercase tracking-[0.15em]">Erro ao gerar imagem</p></div>';
        lucide.createIcons();
    }

    // Restore template off-screen
    template.style.cssText = origStyle;
}

window.closeShareModal = function() { gsap.to('#share-modal', { opacity: 0, duration: 0.3, onComplete: () => document.getElementById('share-modal').classList.add('hidden') }); }
window.copyImageToClipboard = async function() {
    const img = document.getElementById('generated-card-img');
    if(!img) return;
    try {
        const blob = await (await fetch(img.src)).blob();
        if (navigator.share && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
            await navigator.share({ files: [new File([blob], 'escala.png', { type: blob.type })] });
        } else {
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            showCustomAlert("Copiado!", "success");
        }
    } catch (err) { showCustomAlert("Erro ao copiar."); }
}





// --- FILTER UI ---
window.applyFilters = function() {
    const searchInput = document.getElementById('filter-search');
    const collabSelect = document.getElementById('filter-collaborator');
    state.filterText = searchInput ? searchInput.value.trim() : '';
    state.filterCollaborator = collabSelect ? collabSelect.value : '';
    const hasFilters = state.filterText || state.filterCollaborator || state.filterStatus !== 'all';
    const indicator = document.getElementById('filter-active-indicator');
    if (indicator) indicator.classList.toggle('hidden', !hasFilters);
    if (state.calendarView === 'week') renderWeeklyView();
    else renderCalendar();
    if (state.selectedDate) renderTaskList(state.selectedDate.toISOString().split('T')[0]);
}

window.setStatusFilter = function(status) {
    state.filterStatus = status;
    document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`filter-status-${status}`);
    if (activeBtn) activeBtn.classList.add('active');
    applyFilters();
}

window.clearFilters = function() {
    state.filterText = '';
    state.filterCollaborator = '';
    state.filterStatus = 'all';
    const searchInput = document.getElementById('filter-search');
    if (searchInput) searchInput.value = '';
    const collabSelect = document.getElementById('filter-collaborator');
    if (collabSelect) collabSelect.value = '';
    document.querySelectorAll('.filter-pill').forEach(btn => btn.classList.remove('active'));
    const allBtn = document.getElementById('filter-status-all');
    if (allBtn) allBtn.classList.add('active');
    const indicator = document.getElementById('filter-active-indicator');
    if (indicator) indicator.classList.add('hidden');
    if (state.calendarView === 'week') renderWeeklyView();
    else renderCalendar();
    if (state.selectedDate) renderTaskList(state.selectedDate.toISOString().split('T')[0]);
}

export function stopTaskSubscription() {
  if (unsubscribeTasks) {
    unsubscribeTasks();
    unsubscribeTasks = null;
  }
}

export { subscribeToTasks, renderCalendar, playIntro, animatePageTransition };














