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
    if (loadingScreen) loadingScreen.classList.remove('hidden');

    const year = state.date.getFullYear();
    const month = state.date.getMonth();
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    function onTaskSnapshot(snapshot) {
        state.tasks = snapshot.docs.map(doc => ({ id: doc.id, path: doc.ref.path, ...doc.data() }));

        if (isFirstLoad && loadingScreen) {
            loadingScreen.classList.add('hidden');
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
        renderCalendar();
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
        .to('.app-content', { opacity: 1, y: 0, duration: 0.6, stagger: 0.15 });
}

// --- CALENDAR ---
window.changeMonth = function(offset) {
    state.date.setMonth(state.date.getMonth() + offset);
    subscribeToTasks();
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    if(!grid) return;
    document.getElementById('current-month').innerText = state.date.toLocaleDateString('pt-BR', { month: 'long' }).toUpperCase();
    document.getElementById('current-year').innerText = state.date.getFullYear();
    grid.innerHTML = '';

    const year = state.date.getFullYear();
    const month = state.date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for(let i=0; i<firstDay; i++) grid.innerHTML += `<div class="min-h-[80px] sm:min-h-[120px]"></div>`;

    for(let day=1; day<=daysInMonth; day++) {
        const dateObj = new Date(year, month, day);
        const dateKey = dateObj.toISOString().split('T')[0];
        const isToday = new Date().toDateString() === dateObj.toDateString();
        const dayTasks = state.tasks.filter(t => t.date === dateKey);
        
        const allCompleted = dayTasks.length > 0 && dayTasks.every(t => t.completed);
        const cell = document.createElement('div');
        cell.className = `relative min-h-[80px] sm:min-h-[120px] p-2 sm:p-3 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between overflow-hidden
            ${isToday ? 'bg-white border-[#f40009] ring-4 ring-[#f40009]/5 shadow-xl z-10' :
              allCompleted ? 'bg-emerald-50 border-emerald-200 hover:bg-white hover:shadow-lg' :
              dayTasks.length > 0 ? 'bg-[#fff1f2] border-red-100 hover:bg-white hover:shadow-lg' :
              'bg-white/60 border-transparent hover:bg-white hover:shadow-lg hover:-translate-y-1'}`;
        
        cell.onclick = () => openModal(dateObj);

        let tasksHTML = '';
        dayTasks.slice(0, 3).forEach(t => {
            const isRecur = t.recurrence && t.recurrence !== 'none';
            const icon = isRecur ? '<i data-lucide="refresh-cw" class="w-2.5 h-2.5 ml-1 text-slate-400"></i>' : '';
            const todayStr = new Date().toISOString().split('T')[0];
            const dotColor = t.completed ? 'bg-emerald-500' : (t.date < todayStr && (!t.photos || t.photos.length === 0)) ? 'bg-red-500' : 'bg-amber-400';
            tasksHTML += `<div class="hidden sm:flex items-center gap-1.5 text-[10px] font-bold text-slate-600 bg-white/60 px-2 py-1 rounded-lg mb-1 truncate border border-slate-200/50"><div class="w-1.5 h-1.5 rounded-full ${dotColor}"></div><span class="${t.completed ? 'line-through opacity-50' : ''}">${t.title}</span>${icon}</div><div class="sm:hidden w-1.5 h-1.5 rounded-full ${dotColor} mb-1 mx-auto"></div>`;
        });
        if(dayTasks.length > 3) tasksHTML += `<div class="hidden sm:block text-[9px] font-bold text-slate-400 pl-1">+${dayTasks.length - 3}</div>`;

        cell.innerHTML = `<div class="flex justify-between items-start"><span class="flex items-center justify-center font-bold rounded-lg text-sm sm:text-base ${isToday ? 'bg-[#f40009] text-white w-7 h-7 sm:w-8 sm:h-8 shadow-md' : (allCompleted ? 'text-emerald-600' : dayTasks.length > 0 ? 'text-[#f40009]' : 'text-slate-600')}">${day}</span>${allCompleted ? '<i data-lucide="check-circle" class="w-4 h-4 text-emerald-500"></i>' : ''}</div><div class="mt-2 space-y-0.5 sm:space-y-0">${tasksHTML}</div>`;
        grid.appendChild(cell);
    }
    lucide.createIcons();
}

window.toggleDay = function(btn) {
    const day = parseInt(btn.dataset.day);
    btn.classList.toggle('selected');
    if(btn.classList.contains('selected')) state.selectedRecurrenceDays.push(day);
    else state.selectedRecurrenceDays = state.selectedRecurrenceDays.filter(d => d !== day);
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
    const dayTasks = state.tasks.filter(t => t.date === dateKey).sort((a, b) => (a.order || 0) - (b.order || 0));
    const emptyState = document.getElementById('empty-state');

    list.innerHTML = '';
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
                <span class="cursor-pointer hover:bg-red-100 hover:text-red-500 inline-flex items-center px-2 py-1 rounded bg-slate-50 text-xs font-bold text-slate-600 border border-slate-200 mr-1 mb-1" data-name="${name}" onclick="this.remove()">
                    ${name} <i data-lucide="x" class="w-3 h-3 ml-1"></i>
                </span>`).join('');

            contentHTML = `
                <div class="flex flex-col gap-3 w-full bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">Editar Título</label>
                    <input type="text" id="edit-title-${task.id}" value="${task.title}" oninput="forceUppercase(this)" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-[#f40009]">
                    <div>
                        <p class="text-[10px] font-bold text-slate-400 uppercase mb-2">Colaboradores</p>
                        <div id="tags-container-${task.id}" class="flex flex-wrap mb-2 gap-1">${tagsHTML}</div>
                        <div class="flex gap-2 relative">
                            <input type="text" id="new-collab-${task.id}" placeholder="BUSCAR NOME..." oninput="handleEditSearch(this, '${task.id}')" class="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none">
                            <div id="suggestions-${task.id}" class="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-lg shadow-xl z-50 hidden max-h-32 overflow-y-auto"></div>
                            <button onclick="addLocalTag('${task.id}')" class="bg-blue-500 text-white p-2 rounded-lg"><i data-lucide="plus" class="w-4 h-4"></i></button>
                        </div>
                    </div>
                    <button onclick="saveEdit('${task.id}')" class="w-full py-2 bg-[#f40009] text-white rounded-lg font-bold text-xs shadow-md">SALVAR ALTERAÇÕES</button>
                </div>`;
        } else {
            let checkbox = '';
            if (!state.user) {
                checkbox = `<div class="w-6 h-6 rounded-full border-2 border-slate-300 mr-3 bg-white"></div>`;
            } else if (canEdit) {
                checkbox = `<button onclick="toggleTask('${task.id}')" class="w-6 h-6 rounded-full border-2 mr-3 flex items-center justify-center transition-all ${task.completed ? 'bg-emerald-500 border-emerald-500 scale-110' : 'border-slate-300 hover:border-[#f40009]'}">${task.completed ? '<i data-lucide="check" class="text-white w-3.5 h-3.5"></i>' : ''}</button>`;
            } else {
                checkbox = `<div class="w-6 h-6 rounded-full border-2 border-slate-200 mr-3 flex items-center justify-center bg-slate-100 text-slate-400 cursor-not-allowed" title="Restrito"><i data-lucide="lock" class="w-3 h-3"></i></div>`;
            }

            let assigneesHTML = task.assignee.split(',').map(n => {
                const trimmed = n.trim();
                if (!trimmed) return '';
                const collab = (state.colaborators || []).find(c => c.nome.toUpperCase() === trimmed.toUpperCase());
                const avatarHTML = collab && collab.photo
                    ? `<img src="${collab.photo}" class="w-5 h-5 rounded-full object-cover border border-slate-100">`
                    : `<div class="w-5 h-5 rounded-full bg-white text-slate-500 flex items-center justify-center text-[8px] font-black border border-slate-100">${trimmed.charAt(0)}</div>`;
                return `<div class="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 shadow-sm">${avatarHTML}<span class="text-[10px] font-bold text-slate-600">${trimmed}</span></div>`;
            }).join('');
            let editBtn = isAdmin ? `<button onclick="enableEdit('${task.id}')" class="text-slate-400 hover:text-blue-500 p-1.5"><i data-lucide="pencil" class="w-4 h-4"></i></button>` : '';
            let deleteBtn = isAdmin ? `<button onclick="askDelete('task', '${task.id}')" class="text-slate-400 hover:text-red-500 p-1.5"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : '';

            contentHTML = `<div class="flex items-start justify-between w-full"><div class="flex items-start flex-1">${checkbox}<div><div class="flex items-center"><h4 class="font-bold text-slate-800 text-sm ${task.completed ? 'line-through text-slate-400' : ''}">${task.title}</h4>${recurIcon}</div><div class="flex flex-wrap gap-2 mt-2">${assigneesHTML}</div></div></div><div class="flex gap-1">${editBtn}${deleteBtn}</div></div>`;
        }

        let photosHTML = (task.photos || []).map((p, i) => `<div class="relative group/photo w-20 h-20 rounded-xl border border-white shadow-sm overflow-hidden hover:shadow-md"><img src="${p}" class="w-full h-full object-cover cursor-pointer" onclick="viewImage('${p}')">${state.user ? `<button onclick="askDelete('photo', '${task.id}', null, ${i})" class="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl-lg opacity-0 group-hover/photo:opacity-100"><i data-lucide="x" class="w-3 h-3"></i></button>` : ''}</div>`).join('');
        const hasAssignee = task.assignee && task.assignee.trim() !== '';
        let uploadBtn = (state.user && !task.completed && canEdit && hasAssignee) ? `<label class="h-12 px-3 rounded-lg border border-dashed border-slate-300 text-slate-400 text-xs font-bold hover:text-[#f40009] hover:border-[#f40009] flex items-center gap-1 cursor-pointer bg-white"><input type="file" accept="image/*" capture="environment" onchange="handleRealPhoto(this, '${task.id}')"><i data-lucide="camera" class="w-4 h-4"></i> <span class="hidden sm:inline">Foto</span></label>` : '';
        let commentsHTML = (task.comments || []).map((c, i) => {
            const isAdminComment = c.matricula && String(c.matricula).includes('@');
            const identityLabel = isAdminComment ? `<span class="text-slate-400 font-normal ml-1">${c.matricula}</span>` : `<span class="text-slate-400 font-normal ml-1">#${c.matricula || 'N/A'}</span>`;
            return `<div class="text-[11px] bg-slate-50 p-3 rounded-xl border border-slate-100 mb-2 group/comment"><div class="flex justify-between items-center mb-1"><span class="font-bold text-[#f40009]">${c.author} ${identityLabel}</span>${state.user ? `<button onclick="askDelete('comment', '${task.id}', null, ${i})" class="text-slate-300 hover:text-red-500 opacity-0 group-hover/comment:opacity-100"><i data-lucide="trash" class="w-3 h-3"></i></button>` : ''}</div><div class="text-slate-600 pl-3 border-l-2 border-slate-200">${c.text}</div></div>`;
        }).join('');
        let commentInput = state.user ? `<div class="mt-4 flex gap-2"><input type="text" id="comment-${task.id}" oninput="forceUppercase(this)" placeholder="ESCREVER OBSERVAÇÃO..." class="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs outline-none"><button onclick="prepareComment('${task.id}')" class="p-2 bg-slate-100 rounded-xl text-slate-400 hover:text-white hover:bg-[#f40009]"><i data-lucide="send" width="16"></i></button></div>` : '';

        const item = document.createElement('div');
        item.className = `task-item draggable-item opacity-0 translate-y-4 group bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-lg transition-all duration-300 ${task.completed ? 'opacity-60 bg-slate-50' : ''}`;
        item.id = `task-item-${task.id}`;
        item.draggable = true;
        item.ondragstart = (e) => handleListDragStart(e, task.id);
        item.ondragover = (e) => handleListDragOver(e);
        item.ondrop = (e) => handleListDrop(e, task.id, dateKey);
        
        item.innerHTML = `${contentHTML}<div class="mt-4 pl-9 flex flex-wrap gap-2 items-center">${photosHTML}${uploadBtn}</div><div class="mt-5 pt-4 border-t border-slate-100">${commentsHTML}${commentInput}</div>`;
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
                showCustomAlert("Tarefa duplicada para este dia.");
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
                showCustomAlert("Cancelado: Haveria duplicatas na série.");
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
        showCustomAlert('Obrigatório anexar foto antes de concluir.'); return;
    }

    try {
        const userName = state.user ? (state.user.name || state.user.nome) : 'Usuário';
        await updateDoc(doc(db, task.path), { 
            completed: !task.completed, 
            completedBy: task.completed ? null : userName 
        });
        if (!task.completed) confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#f40009', '#ffffff'] });
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
    if(!name || !mat) { showCustomAlert('Preencha os dados!'); return; }
    
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
        title.innerText = "Tarefa Recorrente"; desc.innerText = "Este item faz parte de uma série.";
    } else {
        singleBtns.classList.remove('hidden'); groupBtns.classList.add('hidden');
        title.innerText = "Excluir Item?"; desc.innerText = "Essa ação é irreversível.";
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
    const days = ["DOMINGO", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"];
    document.getElementById("card-subtitle").innerHTML = "<span class=\"w-1.5 h-1.5 rounded-full bg-[#f40009]\"></span> PROGRAMAÇÃO DE " + days[date.getDay()];
    const listEl = document.getElementById('card-task-list');
    listEl.innerHTML = tasks.length === 0 ? '<div class="text-center py-8 text-slate-400 italic text-sm">DIA LIVRE.</div>' : '';
    tasks.forEach(task => {
        const assignees = task.assignee.split(',').map(n => `<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200 uppercase">${n}</span>`).join('');
        listEl.innerHTML += `<div class="bg-white p-3.5 rounded-xl border-l-4 border-[#f40009] shadow-sm flex flex-col gap-1.5 mb-2"><h4 class="font-bold text-slate-800 text-sm">${task.title}</h4><div class="flex flex-wrap gap-1 mt-0.5">${assignees}</div></div>`;
    });
    const modal = document.getElementById('share-modal');
    modal.classList.remove('hidden'); gsap.to(modal, { opacity: 1, duration: 0.3 });
    try {
        await new Promise(r => setTimeout(r, 100));
        const { default: html2canvas } = await import('html2canvas');
        const canvas = await html2canvas(document.getElementById('share-card-template'), { scale: 3, useCORS: true });
        const img = document.createElement('img'); img.src = canvas.toDataURL("image/png"); img.className = "w-full h-auto shadow-md rounded-lg"; img.id = "generated-card-img";
        const cont = document.getElementById('share-preview-container'); cont.innerHTML = ''; cont.appendChild(img);
    } catch (err) { console.error(err); }
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





export function stopTaskSubscription() {
  if (unsubscribeTasks) {
    unsubscribeTasks();
    unsubscribeTasks = null;
  }
}

export { subscribeToTasks, renderCalendar, playIntro, animatePageTransition };














