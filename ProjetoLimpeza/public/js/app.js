/**
 * js/app.js
 * Arquivo Principal (Com PDF separado e Correção da Foto)
 */

import { 
    db, auth, 
    collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, where, getDocs, getDoc, setDoc, collectionGroup,
    signInWithEmailAndPassword, signOut, onAuthStateChanged
} from './firebase-config.js';

// --- IMPORTAÇÃO DO MÓDULO DE RELATÓRIO (PDF SEPARADO) ---
import { generatePDF } from './reports.js';

// --- CONFIGURAÇÃO PWA ---
const manifest = {
    "name": "Calendário Limpeza",
    "short_name": "PortalUltra",
    "start_url": ".",
    "display": "standalone",
    "background_color": "#f8fafc",
    "theme_color": "#e41e26",
    "icons": [{ "src": "img/logo_administrativo.png", "sizes": "192x192", "type": "image/png" }]
};
const link = document.createElement('link');
link.rel = 'manifest';
link.href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], {type: 'application/json'}));
document.head.appendChild(link);

// --- ESTADO GLOBAL ---
let deferredPrompt;
let unsubscribeTasks = null;
const state = {
    user: null, 
    date: new Date(),
    selectedDate: null,
    tasks: [], 
    colaborators: [], 
    selectedCollaborators: [], 
    pendingDelete: null,
    pendingComment: null,
    editingTaskId: null,
    selectedRecurrenceDays: [],
    draggedTaskItem: null
};

// --- HELPER: FORÇAR CAIXA ALTA ---
window.forceUppercase = function(input) {
    const start = input.selectionStart;
    input.value = input.value.toUpperCase();
    input.setSelectionRange(start, start);
}

// Injeta estilo global
const style = document.createElement('style');
style.innerHTML = `
    input[type="text"], textarea { text-transform: uppercase; }
    .suggestion-item:hover { background-color: #f1f5f9; }
`;
document.head.appendChild(style);

// --- FUNÇÃO GLOBAL DO PDF (LIGA O BOTÃO AO ARQUIVO reports.js) ---
window.generatePDFReport = function() {
    generatePDF(state);
};

// --- HELPER: VERIFICA PERMISSÃO ---
function canUserEdit(task) {
    if (!state.user) return false;
    if (state.user.role === 'admin') return true;

    const userName = state.user.nome || state.user.name || "";
    if (!task.assignee || !task.assignee.toLowerCase().includes(userName.toLowerCase())) {
        return false; 
    }

    const today = new Date();
    today.setHours(0,0,0,0);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const [y, m, d] = task.date.split('-');
    const taskDate = new Date(y, m-1, d);
    taskDate.setHours(0,0,0,0);

    if (taskDate > today || taskDate < yesterday) return false; 
    
    return true; 
}

// --- NOTIFICAÇÕES ---
function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }
}

function sendLocalNotification(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        new Notification(title, {
            body: body,
            icon: 'img/logo_administrativo.png',
            badge: 'img/logo_administrativo.png'
        });
    }
}

// --- INICIALIZAÇÃO ---
window.addEventListener('load', () => {
    if (typeof lucide !== 'undefined') lucide.createIcons();
    playIntro();
    setupPWA();
    
    document.addEventListener('click', (e) => {
        const suggestions = document.getElementById('resp-suggestions');
        const input = document.getElementById('input-resp');
        if (suggestions && input && !suggestions.contains(e.target) && e.target !== input) {
            suggestions.classList.add('hidden');
        }
        
        if (state.editingTaskId) {
            const editSugg = document.getElementById(`suggestions-${state.editingTaskId}`);
            const editInput = document.getElementById(`new-collab-${state.editingTaskId}`);
            if (editSugg && editInput && !editSugg.contains(e.target) && e.target !== editInput) {
                editSugg.classList.add('hidden');
            }
        }
    });

    const identityModal = document.getElementById('identity-modal');
    if (identityModal) {
        identityModal.addEventListener('click', (e) => {
            if (e.target === identityModal) window.closeIdentityModal();
        });
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            if (!state.user) {
                 state.user = { name: "Administrador", role: "admin", id: user.uid };
            }
            completeLogin();
        }
    });
});

// --- PWA SETUP ---
function setupPWA() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (!isStandalone) {
        setTimeout(() => {
            const toast = document.getElementById('pwa-install-toast');
            if (toast) toast.classList.remove('translate-y-[150%]');
        }, 2000);
    }
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
    });
    const installBtn = document.getElementById('pwa-install-trigger');
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') dismissInstall();
                deferredPrompt = null;
            } else {
                const iosModal = document.getElementById('ios-install-modal');
                if(iosModal) {
                    iosModal.classList.remove('hidden');
                    gsap.to(iosModal, { opacity: 1, duration: 0.3 });
                } else {
                    alert("Para instalar: Toque no menu do navegador e selecione 'Adicionar à Tela de Início'.");
                }
            }
        });
    }
}

window.dismissInstall = function() { 
    document.getElementById('pwa-install-toast').classList.add('translate-y-[150%]'); 
}
window.closeIosModal = function() { 
    gsap.to('#ios-install-modal', { opacity: 0, duration: 0.3, onComplete: () => document.getElementById('ios-install-modal').classList.add('hidden') }); 
}

// --- ALERTA PERSONALIZADO (VERDE/VERMELHO) ---
window.showCustomAlert = function(message, type = 'error') {
    const modal = document.getElementById('custom-alert-modal');
    const msgElement = document.getElementById('custom-alert-message');
    
    const iconContainer = document.getElementById('alert-icon-container');
    const icon = document.getElementById('alert-icon');
    const title = document.getElementById('alert-title');
    const btn = document.getElementById('alert-btn');

    if (modal && msgElement && iconContainer) {
        msgElement.innerText = message;

        // Resetar classes base
        iconContainer.className = 'w-16 h-16 rounded-full flex items-center justify-center mb-4 mx-auto ring-4 transition-colors';
        btn.className = 'w-full py-3.5 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-all';

        if (type === 'success') {
            // Estilo VERDE (Sucesso)
            iconContainer.classList.add('bg-green-100', 'text-green-600', 'ring-green-50');
            if(icon) icon.setAttribute('data-lucide', 'check-circle');
            if(title) title.innerText = "Sucesso!";
            btn.classList.add('bg-green-600', 'hover:bg-green-700', 'shadow-green-500/20');
        } else {
            // Estilo VERMELHO (Erro/Atenção)
            iconContainer.classList.add('bg-red-50', 'text-[#e41e26]', 'ring-red-50');
            if(icon) icon.setAttribute('data-lucide', 'alert-triangle');
            if(title) title.innerText = "Atenção";
            btn.classList.add('bg-[#e41e26]', 'hover:bg-[#c61a21]', 'shadow-red-500/20');
        }

        lucide.createIcons();

        modal.classList.remove('hidden');
        gsap.to(modal, { opacity: 1, duration: 0.2 });
        gsap.fromTo(modal.querySelector('div'), { scale: 0.9 }, { scale: 1, duration: 0.3, ease: "back.out(1.7)" });
    } else { 
        alert(message); 
    }
}

window.closeCustomAlert = function() {
    const modal = document.getElementById('custom-alert-modal');
    if (modal) gsap.to(modal, { opacity: 0, duration: 0.2, onComplete: () => modal.classList.add('hidden') });
}

// --- LOGIN ---
window.toggleLoginMode = function() {
    const adminForm = document.getElementById('form-admin');
    const empForm = document.getElementById('form-employee');
    const title = document.getElementById('login-mode-title');
    const btnToggle = document.getElementById('toggle-login-btn');

    if (adminForm.classList.contains('hidden')) {
        adminForm.classList.remove('hidden'); adminForm.classList.add('flex');
        empForm.classList.add('hidden');
        title.innerHTML = `<h2 class="text-lg font-bold text-slate-800">Acesso Administrativo</h2><p class="text-xs text-slate-500">Área restrita</p>`;
        btnToggle.innerText = "Sou Colaborador";
    } else {
        adminForm.classList.add('hidden'); adminForm.classList.remove('flex');
        empForm.classList.remove('hidden');
        title.innerHTML = `<h2 class="text-lg font-bold text-slate-800">Acesso Colaborador</h2><p class="text-xs text-slate-500">Digite sua matrícula</p>`;
        btnToggle.innerText = "Sou Administrador";
    }
}

window.handleEmployeeLogin = async function(e) {
    e.preventDefault();
    const matriculaInput = document.getElementById('login-matricula').value.trim();
    if(!matriculaInput) return;
    const btn = e.submitter; 
    const originalText = btn.innerHTML;
    btn.innerHTML = `<div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>`;

    try {
        const docSnap = await getDoc(doc(db, "users", matriculaInput));
        if (docSnap.exists()) {
            const userData = docSnap.data();
            if (userData.active === false) {
                showCustomAlert("Acesso inativado. Procure a gestão.");
                btn.innerHTML = originalText;
                return;
            }
            state.user = { id: docSnap.id, ...userData };
            completeLogin();
        } else {
            showCustomAlert("Matrícula não encontrada.");
            btn.innerHTML = originalText;
        }
    } catch (error) {
        console.error(error); showCustomAlert("Erro de conexão."); btn.innerHTML = originalText;
    }
}

window.handleAdminLogin = async function(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    const btn = e.submitter; 
    const originalText = btn.innerHTML;
    btn.innerHTML = `<div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>`;

    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
        showCustomAlert("Email ou senha incorretos."); btn.innerHTML = originalText;
    }
}

function completeLogin() {
    const badge = document.getElementById('user-role-badge');
    if(badge && state.user) {
        requestNotificationPermission();

        const isAdmin = state.user.role === 'admin';
        const roleColor = isAdmin ? 'text-[#e41e26] border-[#e41e26]/20' : 'text-blue-600 border-blue-200';
        const name = state.user.name || state.user.nome || (isAdmin ? 'Admin' : 'Colab');
        badge.innerText = `${name.split(' ')[0]} (${isAdmin ? 'Admin' : 'Colab'})`;
        badge.className = `text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-white shadow-sm ${roleColor}`;
        
        if (isAdmin) {
            document.getElementById('btn-team-management').classList.remove('hidden');
            fetchColaborators();
        }
    }
    subscribeToTasks();
    animatePageTransition();
    renderCalendar();
}

window.logout = function() { 
    if (unsubscribeTasks) {
        unsubscribeTasks();
        unsubscribeTasks = null;
    }
    state.user = null; 
    state.colaborators = []; 
    state.selectedCollaborators = [];
    state.tasks = [];
    signOut(auth).then(() => {
        showLoginScreen();
    }).catch((e) => {
        console.error(e);
        showLoginScreen();
    });
}

function showLoginScreen() {
    gsap.to('.app-content', { opacity: 0, y: -10, duration: 0.3, onComplete: () => {
        document.getElementById('app-screen').classList.add('hidden');
        document.getElementById('login-matricula').value = '';
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        const loginScreen = document.getElementById('login-screen');
        loginScreen.classList.remove('hidden');
        gsap.fromTo('.login-item', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.1 });
    }});
}

// --- GESTÃO DE EQUIPE ---
async function fetchColaborators() {
    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        state.colaborators = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            state.colaborators.push({
                id: doc.id, matricula: doc.id,
                nome: (data.nome || data.name || "SEM NOME").toUpperCase(),
                funcao: (data.funcao || "COLABORADOR").toUpperCase(),
                active: data.active !== false,
                photo: data.photo || null
            });
        });
        setupAutocomplete();
    } catch (e) { console.error("Erro ao buscar equipe:", e); }
}

window.openTeamModal = async function() {
    await fetchColaborators(); renderTeamList();
    const modal = document.getElementById('team-modal');
    modal.classList.remove('hidden');
    gsap.to(modal, { opacity: 1, duration: 0.3 });
    gsap.fromTo(modal.querySelector('.bottom-sheet'), { y: '100%' }, { y: 0, duration: 0.5, ease: "power3.out" });
}

window.closeTeamModal = function() {
    const modal = document.getElementById('team-modal');
    gsap.to(modal.querySelector('.bottom-sheet'), { y: '100%', duration: 0.4, ease: "power3.in" });
    gsap.to(modal, { opacity: 0, duration: 0.3, delay: 0.1, onComplete: () => modal.classList.add('hidden') });
}

function renderTeamList() {
    const list = document.getElementById('team-list');
    list.innerHTML = '';
    const sorted = state.colaborators.sort((a,b) => a.nome.localeCompare(b.nome));
    sorted.forEach(user => {
        const avatar = user.photo 
            ? `<img src="${user.photo}" class="w-10 h-10 rounded-full object-cover border border-slate-200">`
            : `<div class="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold border border-slate-200">${user.nome.charAt(0)}</div>`;

        const item = document.createElement('div');
        item.className = "bg-white p-3 rounded-xl border border-slate-200 flex justify-between items-center shadow-sm";
        item.innerHTML = `
            <div class="flex items-center gap-3">
                ${avatar}
                <div>
                    <h4 class="font-bold text-slate-800 text-sm ${!user.active ? 'line-through text-slate-400' : ''}">${user.nome}</h4>
                    <p class="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-0.5">
                        ${user.funcao} • #${user.matricula}
                        ${!user.active ? '<span class="text-red-500 ml-1">(INATIVO)</span>' : ''}
                    </p>
                </div>
            </div>
            <button onclick="openUserForm('${user.matricula}')" class="p-2 bg-slate-50 text-blue-500 rounded-lg hover:bg-blue-50 transition-colors">
                <i data-lucide="pencil" class="w-4 h-4"></i>
            </button>`;
        list.appendChild(item);
    });
    lucide.createIcons();
}

window.handleUserPhoto = function(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image(); img.src = e.target.result;
            img.onload = function() {
                const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
                const maxSize = 300;
                let width = img.width; let height = img.height;
                if (width > height) { if (width > maxSize) { height *= maxSize / width; width = maxSize; } }
                else { if (height > maxSize) { width *= maxSize / height; height = maxSize; } }
                canvas.width = width; canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                document.getElementById('user-photo-preview').src = canvas.toDataURL('image/jpeg', 0.7);
            }
        };
        reader.readAsDataURL(file);
    }
}

// --- FUNÇÃO DE FOTO QUE ESTAVA FALTANDO (RECRIADA E CORRIGIDA) ---
window.handleRealPhoto = function(input, taskId) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        // Alerta de carregamento
        showCustomAlert("Processando foto...", "success");

        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.src = e.target.result;
            img.onload = async function() {
                // Comprimir imagem
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const maxSize = 800; // Tamanho máximo (px)
                let width = img.width; 
                let height = img.height;

                if (width > height) { 
                    if (width > maxSize) { height *= maxSize / width; width = maxSize; } 
                } else { 
                    if (height > maxSize) { width *= maxSize / height; height = maxSize; } 
                }
                
                canvas.width = width; 
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                // Converte para Base64 (Texto)
                const base64String = canvas.toDataURL('image/jpeg', 0.6);

                // Salva no banco
                const task = state.tasks.find(t => t.id === taskId);
                if(task) {
                    try {
                        const newPhotos = [...(task.photos || []), base64String];
                        await updateDoc(doc(db, task.path), { 
                            photos: newPhotos,
                            hasPhotoProof: true 
                        });
                        showCustomAlert("FOTO ADICIONADA!", "success");
                    } catch(err) {
                        console.error(err);
                        showCustomAlert("ERRO AO SALVAR FOTO.");
                    }
                }
            }
        };
        reader.readAsDataURL(file);
    }
}

window.openUserForm = function(matricula = null) {
    const modal = document.getElementById('user-form-modal');
    const defaultImg = "https://placehold.co/150?text=FOTO";
    
    if (matricula) {
        const user = state.colaborators.find(u => u.matricula === matricula);
        document.getElementById('user-form-title').innerText = "EDITAR COLABORADOR";
        document.getElementById('user-name').value = user.nome;
        document.getElementById('user-matricula').value = user.matricula;
        document.getElementById('user-role-desc').value = user.funcao;
        document.getElementById('user-active').checked = user.active;
        document.getElementById('user-original-matricula').value = matricula;
        document.getElementById('user-photo-preview').src = user.photo || defaultImg;
        document.getElementById('user-matricula').disabled = false;
    } else {
        document.getElementById('user-form-title').innerText = "NOVO COLABORADOR";
        document.getElementById('user-name').value = '';
        document.getElementById('user-matricula').value = '';
        document.getElementById('user-matricula').disabled = false;
        document.getElementById('user-role-desc').value = '';
        document.getElementById('user-active').checked = true;
        document.getElementById('user-original-matricula').value = '';
        document.getElementById('user-photo-preview').src = defaultImg;
    }
    modal.classList.remove('hidden');
    gsap.to(modal, { opacity: 1, duration: 0.2 });
    gsap.fromTo(modal.querySelector('div'), { scale: 0.9 }, { scale: 1, duration: 0.3 });
}

window.closeUserForm = function() {
    const modal = document.getElementById('user-form-modal');
    gsap.to(modal, { opacity: 0, duration: 0.2, onComplete: () => modal.classList.add('hidden') });
}

window.saveUser = async function(e) {
    e.preventDefault();
    const name = document.getElementById('user-name').value.trim().toUpperCase();
    const newMatricula = document.getElementById('user-matricula').value.trim();
    const oldMatricula = document.getElementById('user-original-matricula').value;
    const funcao = document.getElementById('user-role-desc').value.trim().toUpperCase();
    const active = document.getElementById('user-active').checked;
    const photoSrc = document.getElementById('user-photo-preview').src;
    
    if (!name || !newMatricula) return;
    const btn = e.submitter;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>`;

    const finalPhoto = photoSrc.includes("placehold.co") ? null : photoSrc;
    const userData = { nome: name, funcao: funcao, role: "employee", active: active, photo: finalPhoto };

    try {
        if (oldMatricula && oldMatricula !== newMatricula) {
            await setDoc(doc(db, "users", newMatricula), userData);
            await deleteDoc(doc(db, "users", oldMatricula));
        } else {
            await setDoc(doc(db, "users", newMatricula), userData, { merge: true });
        }
        await fetchColaborators(); renderTeamList(); closeUserForm();
        
        showCustomAlert("COLABORADOR SALVO!", "success");
        
    } catch (err) { console.error(err); showCustomAlert("ERRO AO SALVAR."); } 
    finally { btn.innerHTML = originalText; }
}

// --- LOGICA DE TAGS E AUTOCOMPLETE ---
window.addCollaboratorTag = function(name) {
    if (!state.selectedCollaborators.includes(name)) {
        state.selectedCollaborators.push(name);
        renderCollaboratorTags();
    }
}

window.removeCollaboratorTag = function(name) {
    state.selectedCollaborators = state.selectedCollaborators.filter(n => n !== name);
    renderCollaboratorTags();
}

function renderCollaboratorTags() {
    const container = document.getElementById('selected-collabs-container');
    if (!container) return;
    
    container.innerHTML = state.selectedCollaborators.map(name => `
        <span class="bg-blue-100 text-blue-600 px-2 py-1 rounded-lg text-xs font-bold border border-blue-200 flex items-center gap-1">
            ${name}
            <button onclick="removeCollaboratorTag('${name}')" type="button" class="hover:text-blue-800 flex items-center justify-center">
                <i data-lucide="x" class="w-3 h-3"></i>
            </button>
        </span>
    `).join('');
    lucide.createIcons();
}

function setupAutocomplete() {
    const input = document.getElementById('input-resp');
    const suggestionsBox = document.getElementById('resp-suggestions');
    if (!input || !suggestionsBox) return;

    input.addEventListener('input', function() {
        forceUppercase(this); 
        const val = this.value.toUpperCase(); 
        suggestionsBox.innerHTML = '';
        if (!val) { suggestionsBox.classList.add('hidden'); return; }

        const matches = state.colaborators.filter(c => c.active && c.nome.toUpperCase().startsWith(val));

        if (matches.length > 0) {
            matches.forEach(c => {
                const item = document.createElement('div');
                item.className = "px-4 py-3 cursor-pointer hover:bg-slate-50 border-b border-slate-50 flex justify-between items-center";
                item.innerHTML = `<span class="font-bold text-slate-700 text-sm">${c.nome}</span><span class="text-[10px] bg-slate-100 text-slate-500 px-1 rounded">#${c.matricula}</span>`;
                item.onclick = () => { 
                    addCollaboratorTag(c.nome); input.value = ''; suggestionsBox.classList.add('hidden'); input.focus(); 
                };
                suggestionsBox.appendChild(item);
            });
            suggestionsBox.classList.remove('hidden');
        } else { suggestionsBox.classList.add('hidden'); }
    });
}

// --- FUNÇÕES DE EDIÇÃO LOCAL ---
window.handleEditSearch = function(input, taskId) {
    forceUppercase(input);
    const val = input.value.toUpperCase();
    const suggestionsBox = document.getElementById(`suggestions-${taskId}`);
    if(!suggestionsBox) return;
    suggestionsBox.innerHTML = '';
    if (!val) { suggestionsBox.classList.add('hidden'); return; }

    const matches = state.colaborators.filter(c => c.active && c.nome.toUpperCase().startsWith(val));
    if (matches.length > 0) {
        matches.forEach(c => {
            const item = document.createElement('div');
            item.className = "px-4 py-2 cursor-pointer hover:bg-slate-50 border-b border-slate-50 flex justify-between items-center bg-white";
            item.innerHTML = `<span class="font-bold text-slate-700 text-xs">${c.nome}</span>`;
            item.onclick = () => { 
                input.value = c.nome; 
                suggestionsBox.classList.add('hidden'); 
            };
            suggestionsBox.appendChild(item);
        });
        suggestionsBox.classList.remove('hidden');
    } else { suggestionsBox.classList.add('hidden'); }
}

window.addLocalTag = function(taskId) {
    const input = document.getElementById(`new-collab-${taskId}`);
    const name = input.value.trim().toUpperCase();
    if(!name) return;
    
    const container = document.getElementById(`tags-container-${taskId}`);
    const exists = Array.from(container.children).some(child => child.dataset.name === name);
    if(exists) { input.value = ''; return; }

    const span = document.createElement('span');
    span.className = "cursor-pointer hover:bg-red-100 hover:text-red-500 inline-flex items-center px-2 py-1 rounded bg-slate-50 text-xs font-bold text-slate-600 border border-slate-200 mr-1 mb-1";
    span.dataset.name = name;
    span.innerHTML = `${name} <i data-lucide="x" class="w-3 h-3 ml-1"></i>`;
    span.onclick = function() { this.remove(); };
    
    container.appendChild(span);
    input.value = '';
    lucide.createIcons();
}

window.saveEdit = async function(taskId) {
    const newTitle = document.getElementById(`edit-title-${taskId}`).value.toUpperCase();
    const container = document.getElementById(`tags-container-${taskId}`);
    const newAssignees = Array.from(container.children).map(child => child.dataset.name).join(', ');
    
    const task = state.tasks.find(t => t.id === taskId);
    if (!newTitle || !task) return;
    
    try {
        await updateDoc(doc(db, task.path), { 
            title: newTitle,
            assignee: newAssignees 
        });
        state.editingTaskId = null; 
        renderTaskList(state.selectedDate.toISOString().split('T')[0]);
        showCustomAlert("ALTERAÇÕES SALVAS!", "success");

    } catch (e) { console.error(e); }
}

// --- FIREBASE TASKS ---
function subscribeToTasks() {
    if (unsubscribeTasks) unsubscribeTasks();

    let isFirstLoad = true;
    const tasksQuery = query(collectionGroup(db, "atividades"));
    
    unsubscribeTasks = onSnapshot(tasksQuery, (snapshot) => {
        state.tasks = snapshot.docs.map(doc => ({ id: doc.id, path: doc.ref.path, ...doc.data() }));
        
        if (!isFirstLoad) {
            snapshot.docChanges().forEach((change) => {
                const task = change.doc.data();
                if (snapshot.metadata.hasPendingWrites) return;

                const userName = state.user ? (state.user.name || state.user.nome || "").toUpperCase() : "";
                if (userName && task.assignee && task.assignee.includes(userName) && !task.completed) {
                    const [y, m, d] = task.date.split('-');
                    const dateFmt = `${d}/${m}`;
                    if (change.type === "added") {
                        sendLocalNotification("📅 NOVA ESCALA!", `Atividade: ${task.title}\nData: ${dateFmt}`);
                    }
                    if (change.type === "modified") {
                        sendLocalNotification("🔄 ATUALIZAÇÃO DE ESCALA", `Verifique sua atividade: ${task.title}\nData: ${dateFmt}`);
                    }
                }
            });
        }
        isFirstLoad = false;
        renderCalendar();
        if (state.selectedDate) renderTaskList(state.selectedDate.toISOString().split('T')[0]);
    });
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
    renderCalendar();
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
        
        const cell = document.createElement('div');
        cell.className = `relative min-h-[80px] sm:min-h-[120px] p-2 sm:p-3 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between overflow-hidden
            ${isToday ? 'bg-white border-[#e41e26] ring-4 ring-[#e41e26]/5 shadow-xl z-10' : 
              dayTasks.length > 0 ? 'bg-[#fff1f2] border-red-100 hover:bg-white hover:shadow-lg' : 
              'bg-white/60 border-transparent hover:bg-white hover:shadow-lg hover:-translate-y-1'}`;
        
        cell.onclick = () => openModal(dateObj);

        let tasksHTML = '';
        dayTasks.slice(0, 3).forEach(t => {
            const isRecur = t.recurrence && t.recurrence !== 'none';
            const icon = isRecur ? '<i data-lucide="refresh-cw" class="w-2.5 h-2.5 ml-1 text-slate-400"></i>' : '';
            tasksHTML += `<div class="hidden sm:flex items-center gap-1.5 text-[10px] font-bold text-slate-600 bg-white/60 px-2 py-1 rounded-lg mb-1 truncate border border-slate-200/50"><div class="w-1.5 h-1.5 rounded-full ${t.completed ? 'bg-emerald-500' : 'bg-amber-400'}"></div><span class="${t.completed ? 'line-through opacity-50' : ''}">${t.title}</span>${icon}</div><div class="sm:hidden w-1.5 h-1.5 rounded-full ${t.completed ? 'bg-emerald-500' : 'bg-amber-400'} mb-1 mx-auto"></div>`;
        });
        if(dayTasks.length > 3) tasksHTML += `<div class="hidden sm:block text-[9px] font-bold text-slate-400 pl-1">+${dayTasks.length - 3}</div>`;

        cell.innerHTML = `<div class="flex justify-between items-start"><span class="flex items-center justify-center font-bold rounded-lg text-sm sm:text-base ${isToday ? 'bg-[#e41e26] text-white w-7 h-7 sm:w-8 sm:h-8 shadow-md' : (dayTasks.length > 0 ? 'text-[#e41e26]' : 'text-slate-600')}">${day}</span></div><div class="mt-2 space-y-0.5 sm:space-y-0">${tasksHTML}</div>`;
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
        renderCollaboratorTags();
        document.getElementById('input-resp').value = '';
        if(isAdmin) setupAutocomplete();
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

        const canEdit = canUserEdit(task);

        if (isEditing && isAdmin) {
            const assignees = task.assignee.split(',').map(n => n.trim()).filter(n => n);
            // GERA TAGS VISUAIS COM BOTÃO DE REMOVER LOCAL
            let tagsHTML = assignees.map(name => `
                <span class="cursor-pointer hover:bg-red-100 hover:text-red-500 inline-flex items-center px-2 py-1 rounded bg-slate-50 text-xs font-bold text-slate-600 border border-slate-200 mr-1 mb-1" data-name="${name}" onclick="this.remove()">
                    ${name} <i data-lucide="x" class="w-3 h-3 ml-1"></i>
                </span>`).join('');

            contentHTML = `
                <div class="flex flex-col gap-3 w-full bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">Editar Título</label>
                    <input type="text" id="edit-title-${task.id}" value="${task.title}" oninput="forceUppercase(this)" class="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:border-[#e41e26]">
                    <div>
                        <p class="text-[10px] font-bold text-slate-400 uppercase mb-2">Colaboradores</p>
                        <div id="tags-container-${task.id}" class="flex flex-wrap mb-2 gap-1">${tagsHTML}</div>
                        <div class="flex gap-2 relative">
                            <input type="text" id="new-collab-${task.id}" placeholder="BUSCAR NOME..." oninput="handleEditSearch(this, '${task.id}')" class="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs outline-none">
                            <div id="suggestions-${task.id}" class="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-lg shadow-xl z-50 hidden max-h-32 overflow-y-auto"></div>
                            <button onclick="addLocalTag('${task.id}')" class="bg-blue-500 text-white p-2 rounded-lg"><i data-lucide="plus" class="w-4 h-4"></i></button>
                        </div>
                    </div>
                    <button onclick="saveEdit('${task.id}')" class="w-full py-2 bg-[#e41e26] text-white rounded-lg font-bold text-xs shadow-md">SALVAR ALTERAÇÕES</button>
                </div>`;
        } else {
            let checkbox = '';
            if (!state.user) {
                checkbox = `<div class="w-6 h-6 rounded-full border-2 border-slate-300 mr-3 bg-white"></div>`;
            } else if (canEdit) {
                checkbox = `<button onclick="toggleTask('${task.id}')" class="w-6 h-6 rounded-full border-2 mr-3 flex items-center justify-center transition-all ${task.completed ? 'bg-emerald-500 border-emerald-500 scale-110' : 'border-slate-300 hover:border-[#e41e26]'}">${task.completed ? '<i data-lucide="check" class="text-white w-3.5 h-3.5"></i>' : ''}</button>`;
            } else {
                checkbox = `<div class="w-6 h-6 rounded-full border-2 border-slate-200 mr-3 flex items-center justify-center bg-slate-100 text-slate-400 cursor-not-allowed" title="Restrito"><i data-lucide="lock" class="w-3 h-3"></i></div>`;
            }

            let assigneesHTML = task.assignee.split(',').map(n => n.trim() ? `<div class="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 shadow-sm"><div class="w-4 h-4 rounded-full bg-white text-slate-500 flex items-center justify-center text-[8px] font-black border border-slate-100">${n.charAt(0)}</div><span class="text-[10px] font-bold text-slate-600">${n}</span></div>` : '').join('');
            let editBtn = isAdmin ? `<button onclick="enableEdit('${task.id}')" class="text-slate-400 hover:text-blue-500 p-1.5"><i data-lucide="pencil" class="w-4 h-4"></i></button>` : '';
            let deleteBtn = isAdmin ? `<button onclick="askDelete('task', '${task.id}')" class="text-slate-400 hover:text-red-500 p-1.5"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : '';

            contentHTML = `<div class="flex items-start justify-between w-full"><div class="flex items-start flex-1">${checkbox}<div><div class="flex items-center"><h4 class="font-bold text-slate-800 text-sm ${task.completed ? 'line-through text-slate-400' : ''}">${task.title}</h4>${recurIcon}</div><div class="flex flex-wrap gap-2 mt-2">${assigneesHTML}</div></div></div><div class="flex gap-1">${editBtn}${deleteBtn}</div></div>`;
        }

        let photosHTML = (task.photos || []).map((p, i) => `<div class="relative group/photo w-12 h-12 rounded-xl border border-white shadow-sm overflow-hidden hover:shadow-md"><img src="${p}" class="w-full h-full object-cover cursor-pointer" onclick="viewImage('${p}')">${state.user ? `<button onclick="askDelete('photo', '${task.id}', null, ${i})" class="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl-lg opacity-0 group-hover/photo:opacity-100"><i data-lucide="x" class="w-3 h-3"></i></button>` : ''}</div>`).join('');
        let uploadBtn = (state.user && !task.completed && canEdit) ? `<label class="h-12 px-3 rounded-lg border border-dashed border-slate-300 text-slate-400 text-xs font-bold hover:text-[#e41e26] hover:border-[#e41e26] flex items-center gap-1 cursor-pointer bg-white"><input type="file" accept="image/*" capture="environment" onchange="handleRealPhoto(this, '${task.id}')"><i data-lucide="camera" class="w-4 h-4"></i> <span class="hidden sm:inline">Foto</span></label>` : '';
        let commentsHTML = (task.comments || []).map((c, i) => `<div class="text-[11px] bg-slate-50 p-3 rounded-xl border border-slate-100 mb-2 group/comment"><div class="flex justify-between items-center mb-1"><span class="font-bold text-[#e41e26]">${c.author} <span class="text-slate-400 font-normal ml-1">#${c.matricula || 'N/A'}</span></span>${state.user ? `<button onclick="askDelete('comment', '${task.id}', null, ${i})" class="text-slate-300 hover:text-red-500 opacity-0 group-hover/comment:opacity-100"><i data-lucide="trash" class="w-3 h-3"></i></button>` : ''}</div><div class="text-slate-600 pl-3 border-l-2 border-slate-200">${c.text}</div></div>`).join('');
        let commentInput = state.user ? `<div class="mt-4 flex gap-2"><input type="text" id="comment-${task.id}" oninput="forceUppercase(this)" placeholder="ESCREVER OBSERVAÇÃO..." class="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs outline-none"><button onclick="prepareComment('${task.id}')" class="p-2 bg-slate-100 rounded-xl text-slate-400 hover:text-white hover:bg-[#e41e26]"><i data-lucide="send" width="16"></i></button></div>` : '';

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
    gsap.to('.task-item', { opacity: 1, y: 0, duration: 0.4, stagger: 0.08 });
}

window.addTask = async function(e) {
    e.preventDefault();
    const titleInput = document.getElementById('input-title');
    
    if(!titleInput.value.trim()) return;

    const baseDate = new Date(state.selectedDate);
    const titleVal = titleInput.value.trim().toUpperCase(); 
    const assigneeNames = state.selectedCollaborators.join(', ');

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
                showCustomAlert("Tarefa duplicada para este dia."); btn.innerHTML = originalText; return;
            }
            await setDoc(docRef, {
                title: titleVal, assignee: assigneeNames, date: dateStr, 
                completed: false, hasPhotoProof: false, photos: [], comments: [], 
                searchKeywords: titleVal.toLowerCase().split(' '), recurrence: 'none', order: Date.now()
            });

        } else {
            const groupId = Date.now().toString(); 
            const batchPromises = [];
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

                    batchPromises.push(setDoc(docRef, {
                        title: titleVal, assignee: instanceAssignee, date: dateStr, 
                        completed: false, hasPhotoProof: false, photos: [], comments: [], 
                        searchKeywords: titleVal.toLowerCase().split(' '), recurrence: 'weekly', 
                        groupId: groupId, order: Date.now() + orderCount
                    }));
                }
                loopDate.setDate(loopDate.getDate() + 1);
                orderCount++;
            }

            if(duplicateFound) {
                showCustomAlert("Cancelado: Haveria duplicatas na série."); btn.innerHTML = originalText; return;
            }
            await Promise.all(batchPromises);
        }

        titleInput.value = ''; 
        document.getElementById('input-resp').value = '';
        state.selectedRecurrenceDays = [];
        state.selectedCollaborators = []; 
        renderCollaboratorTags(); 
        document.querySelectorAll('.day-toggle').forEach(b => b.classList.remove('selected'));
        
        btn.innerHTML = `<i data-lucide="check" class="w-5 h-5"></i>`; btn.classList.add('bg-emerald-500');
        setTimeout(() => { btn.innerHTML = originalText; btn.classList.remove('bg-emerald-500'); lucide.createIcons(); }, 2000);
    } catch (e) {
        console.error(e); showCustomAlert("Erro ao salvar."); btn.innerHTML = originalText;
    }
}

window.toggleTask = async function(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;

    if (!canUserEdit(task)) {
        showCustomAlert("Restrito ao responsável ou período fechado.");
        return;
    }

    const isAdmin = state.user && state.user.role === 'admin';
    const hasPhotos = task.photos && task.photos.length > 0;

    if(!isAdmin && !task.completed && !hasPhotos) {
        gsap.to('.bottom-sheet', { x: [-5, 5, -5, 5, 0], duration: 0.4 });
        showCustomAlert('⚠️ Obrigatório anexar foto antes de concluir.'); return;
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

window.prepareComment = function(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (task && !canUserEdit(task)) {
        showCustomAlert("Somente o responsável pode enviar observações.");
        return;
    }

    const input = document.getElementById(`comment-${taskId}`);
    if(!input.value.trim()) return;
    state.pendingComment = { taskId, text: input.value.trim().toUpperCase() };
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

function initPWA() { /* ... */ } 
window.dismissInstall = function() { document.getElementById('pwa-install-toast').classList.add('translate-y-[150%]'); }
window.closeIosModal = function() { gsap.to('#ios-install-modal', { opacity: 0, duration: 0.3, onComplete: () => document.getElementById('ios-install-modal').classList.add('hidden') }); }

window.generateShareCard = async function() {
    const date = state.selectedDate;
    const tasks = state.tasks.filter(t => t.date === date.toISOString().split('T')[0]).sort((a, b) => (a.order || 0) - (b.order || 0));
    document.getElementById('card-date-day').innerText = date.getDate();
    document.getElementById('card-date-month').innerText = date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.','').toUpperCase();
    const days = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'];
    document.getElementById('card-subtitle').innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-[#e41e26]"></span> PROGRAMAÇÃO • ${days[date.getDay()]}`;
    const listEl = document.getElementById('card-task-list');
    listEl.innerHTML = tasks.length === 0 ? '<div class="text-center py-8 text-slate-400 italic text-sm">DIA LIVRE.</div>' : '';
    tasks.forEach(task => {
        const assignees = task.assignee.split(',').map(n => `<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200 uppercase">${n}</span>`).join('');
        listEl.innerHTML += `<div class="bg-white p-3.5 rounded-xl border-l-4 border-[#e41e26] shadow-sm flex flex-col gap-1.5 mb-2"><h4 class="font-bold text-slate-800 text-sm">${task.title}</h4><div class="flex flex-wrap gap-1 mt-0.5">${assignees}</div></div>`;
    });
    const modal = document.getElementById('share-modal');
    modal.classList.remove('hidden'); gsap.to(modal, { opacity: 1, duration: 0.3 });
    try {
        await new Promise(r => setTimeout(r, 100));
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