import { gsap } from './vendor.js';
import {
  db,
  collection,
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  deleteField,
} from './firebase-config.js';

import { state } from './state.js';
import { syncServerClock } from './clock.js';
import { getTaskEditPermission, taskEditDenyMessage } from './permissions.js';
import { sendAssignmentPush } from './push.js';
const lucide = window.lucide;

// --- GESTÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢O DE EQUIPE ---
export async function fetchColaborators() {
    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        state.colaborators = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const nomeBase = (data.nome || data.name || '').trim();

            // Ignore technical docs (e.g. admin push profile) that are not collaborators.
            if (!nomeBase) return;

            state.colaborators.push({
                id: doc.id, matricula: doc.id,
                nome: nomeBase.toUpperCase(),
                funcao: (data.funcao || "COLABORADOR").toUpperCase(),
                active: data.active !== false,
                photo: data.photo || null,
                pin: String(data.pin || '').trim(),
                hasPin: !!String(data.pin || '').trim()
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
    gsap.fromTo(modal.querySelector('.bottom-sheet'), { y: '100%' }, { y: 0, duration: 0.5, ease: "power3.out", onComplete: () => {
        if (window.startTeamModalTour) window.startTeamModalTour();
    }});
}

window.closeTeamModal = function() {
    const modal = document.getElementById('team-modal');
    gsap.to(modal.querySelector('.bottom-sheet'), { y: '100%', duration: 0.4, ease: "power3.in" });
    gsap.to(modal, { opacity: 0, duration: 0.3, delay: 0.1, onComplete: () => modal.classList.add('hidden') });
}

window.filterTeamList = function(query) {
    const items = document.querySelectorAll('#team-list > div');
    const q = (query || '').toUpperCase().trim();
    items.forEach(item => {
        const name = (item.dataset.name || '').toUpperCase();
        const matricula = (item.dataset.matricula || '');
        const match = !q || name.includes(q) || matricula.includes(q);
        item.style.display = match ? '' : 'none';
    });
}

function renderTeamList() {
    const list = document.getElementById('team-list');
    list.innerHTML = '';
    const searchInput = document.getElementById('team-search');
    if (searchInput) searchInput.value = '';
    const sorted = state.colaborators.sort((a,b) => a.nome.localeCompare(b.nome));
    sorted.forEach((user, idx) => {
        const avatar = user.photo
            ? `<img src="${user.photo}" class="w-11 h-11 rounded-full object-cover border-2 border-white" style="box-shadow:0 2px 8px rgba(15,23,42,0.08)">`
            : `<div class="w-11 h-11 rounded-full bg-[#e41e26] flex items-center justify-center text-white font-black text-sm" style="box-shadow:0 4px 12px rgba(228,30,38,0.2)">${user.nome.charAt(0)}</div>`;

        const statusDot = user.active
            ? `<span class="w-2 h-2 rounded-full bg-[#22c55e] shadow-[0_0_6px_rgba(34,197,94,0.4)]"></span>`
            : `<span class="w-2 h-2 rounded-full bg-[#ef4444]"></span>`;

        const item = document.createElement('div');
        item.className = "group bg-white p-4 rounded-[14px] border border-[#e5e7eb] flex justify-between items-center transition-all hover:border-[#e41e26]/20 cursor-pointer";
        item.style.cssText = `box-shadow:0 2px 8px rgba(15,23,42,0.03); animation: teamCardIn 400ms cubic-bezier(.22,.78,.24,1) both; animation-delay: ${idx * 40}ms`;
        item.dataset.name = user.nome;
        item.dataset.matricula = user.matricula;
        item.onclick = (e) => { if (e.target.closest('button')) return; openUserForm(user.matricula); };
        item.innerHTML = `
            <div class="flex items-center gap-3.5 min-w-0 flex-1">
                <div class="relative flex-shrink-0">
                    ${avatar}
                    <div class="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white flex items-center justify-center border border-[#e5e7eb]">
                        ${statusDot}
                    </div>
                </div>
                <div class="min-w-0">
                    <h4 class="font-extrabold text-[#151515] text-[13px] tracking-tight truncate ${!user.active ? 'line-through text-[#94a3b8]' : ''}">${user.nome}</h4>
                    <div class="flex items-center gap-2 mt-1">
                        <span class="text-[10px] text-[#6b7280] font-bold uppercase tracking-[0.1em] truncate">${user.funcao}</span>
                        <span class="text-[#e5e7eb]">·</span>
                        <span class="text-[10px] font-bold text-[#94a3b8] bg-[#fafafa] px-1.5 py-0.5 rounded-md border border-[#e5e7eb]">#${user.matricula}</span>
                        ${!user.active ? '<span class="text-[9px] font-extrabold text-[#ef4444] bg-[#fef2f2] px-1.5 py-0.5 rounded-full border border-[#fecaca] uppercase tracking-wider">Inativo</span>' : ''}
                    </div>
                </div>
            </div>
            <button onclick="openUserForm('${user.matricula}')" class="p-2.5 rounded-[10px] text-[#cbd5e1] hover:text-[#e41e26] hover:bg-[#fef2f2] transition-all opacity-0 group-hover:opacity-100 flex-shrink-0" title="Editar">
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

// --- FUNÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢O DE FOTO QUE ESTAVA FALTANDO (RECRIADA E CORRIGIDA) ---
window.handleRealPhoto = function(input, taskId) {
    const MAX_PHOTO_BYTES = 500000; // ~500KB base64 data URL
    if (input.files && input.files[0]) {
        const file = input.files[0];

        // Bloqueia upload se não houver colaborador atribuído
        const task = state.tasks.find(t => t.id === taskId);
        if (task && (!task.assignee || task.assignee.trim() === '')) {
            showCustomAlert('Atribua um colaborador antes de adicionar foto.');
            input.value = '';
            return;
        }

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
                const maxSize = 1200; // Tamanho mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ximo (px)
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
                const base64String = canvas.toDataURL('image/jpeg', 0.75);

                if (base64String.length > MAX_PHOTO_BYTES) {
                    showCustomAlert('Foto muito grande. Tente aproximar menos ou tirar outra foto.');
                    return;
                }

                // Salva no banco
                await syncServerClock();
                const task = state.tasks.find(t => t.id === taskId);
                if(task) {
                    const perm = getTaskEditPermission(task);
                    if (!perm.ok) {
                        showCustomAlert(taskEditDenyMessage(perm.reason));
                        return;
                    }
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
        const pinInput = document.getElementById('user-pin');
        pinInput.value = String(user.pin || '');
        pinInput.type = 'password';
        const pinToggleBtn = document.getElementById('user-pin-toggle');
        if (pinToggleBtn) {
            const icon = pinToggleBtn.querySelector('i');
            if (icon) icon.setAttribute('data-lucide', 'eye');
            if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
        }
        pinInput.placeholder = user.hasPin ? 'PIN ATUAL (PODE EDITAR)' : 'DEFINA UM PIN';
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
        const pinInput = document.getElementById('user-pin');
        pinInput.value = '';
        pinInput.type = 'password';
        const pinToggleBtn2 = document.getElementById('user-pin-toggle');
        if (pinToggleBtn2) {
            const icon2 = pinToggleBtn2.querySelector('i');
            if (icon2) icon2.setAttribute('data-lucide', 'eye');
            if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
        }
        pinInput.placeholder = 'DEFINA UM PIN';
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
    const pinRaw = document.getElementById('user-pin').value.trim();

    if (!name || !newMatricula) return;
    if (pinRaw && pinRaw.length < 4) {
        showCustomAlert('PIN inválido. Use ao menos 4 dígitos.');
        return;
    }
    if (!oldMatricula && !pinRaw) {
        showCustomAlert('Defina um PIN para o novo colaborador.');
        return;
    }
    if (oldMatricula && oldMatricula !== newMatricula && !pinRaw) {
        showCustomAlert('Ao alterar a matrícula, informe um novo PIN.');
        return;
    }

    const btn = e.submitter;
    const originalText = btn.innerHTML;
    btn.innerHTML = `<div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>`;

    const finalPhoto = photoSrc.includes("placehold.co") ? null : photoSrc;
    const userData = { nome: name, funcao: funcao, role: "employee", active: active, photo: finalPhoto };

    try {
        if (pinRaw) {
            userData.pin = pinRaw;
        }

        if (oldMatricula && oldMatricula !== newMatricula) {
            // Copy existing data to new matricula doc, then delete old
            const oldSnap = await getDoc(doc(db, "users", oldMatricula));
            const oldData = oldSnap.exists() ? oldSnap.data() : {};
            const mergedData = { ...oldData, ...userData };
            if (pinRaw) delete mergedData.pinHash;
            await setDoc(doc(db, "users", newMatricula), mergedData);
            await deleteDoc(doc(db, "users", oldMatricula));
        } else {
            if (pinRaw) userData.pinHash = deleteField();
            await setDoc(doc(db, "users", newMatricula), userData, { merge: true });
        }

        await fetchColaborators();
        renderTeamList();
        closeUserForm();
        showCustomAlert("COLABORADOR SALVO!", "success");

    } catch (err) {
        console.error(err);
        showCustomAlert("ERRO AO SALVAR.");
    } finally {
        btn.innerHTML = originalText;
    }
}

// --- LOGICA DE TAGS E AUTOCOMPLETE ---
window.addCollaboratorTag = function(name, matricula = null) {
    if (!state.selectedCollaborators.includes(name)) {
        state.selectedCollaborators.push(name);
        state.selectedCollaboratorIds.push(matricula);
        renderCollaboratorTags();
    }
}

window.removeCollaboratorTag = function(name) {
    const idx = state.selectedCollaborators.indexOf(name);
    if (idx > -1) {
        state.selectedCollaborators.splice(idx, 1);
        state.selectedCollaboratorIds.splice(idx, 1);
    }
    renderCollaboratorTags();
}

function renderCollaboratorTags() {
    const container = document.getElementById('selected-collabs-container');
    if (!container) return;

    container.innerHTML = state.selectedCollaborators.map(name => `
        <span class="bg-[#fef2f2] text-[#e41e26] px-2.5 py-1 rounded-full text-[10px] font-bold border border-[#e41e26]/15 flex items-center gap-1.5 transition-all hover:bg-[#e41e26] hover:text-white hover:border-[#e41e26]">
            ${name}
            <button onclick="removeCollaboratorTag('${name}')" type="button" class="flex items-center justify-center opacity-60 hover:opacity-100">
                <i data-lucide="x" class="w-3 h-3"></i>
            </button>
        </span>
    `).join('');
    lucide.createIcons();
}

window.renderCollaboratorTags = renderCollaboratorTags;
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
                const suggAvatar = c.photo
                    ? `<img src="${c.photo}" class="w-7 h-7 rounded-full object-cover border border-white" style="box-shadow:0 1px 3px rgba(15,23,42,0.08)">`
                    : `<div class="w-7 h-7 rounded-full bg-[#e41e26] flex items-center justify-center text-white font-black text-[10px]">${c.nome.charAt(0)}</div>`;
                const item = document.createElement('div');
                item.className = "px-3.5 py-2.5 cursor-pointer hover:bg-[#fef2f2] border-b border-[#e5e7eb]/40 flex items-center gap-3 transition-colors";
                item.innerHTML = `${suggAvatar}<div class="flex-1 min-w-0"><span class="font-bold text-[#151515] text-[12px] block truncate">${c.nome}</span><span class="text-[9px] font-bold text-[#94a3b8] uppercase tracking-wider">${c.funcao} · #${c.matricula}</span></div>`;
                item.onclick = () => {
                    addCollaboratorTag(c.nome, c.matricula); input.value = ''; suggestionsBox.classList.add('hidden'); input.focus();
                };
                suggestionsBox.appendChild(item);
            });
            suggestionsBox.classList.remove('hidden');
        } else { suggestionsBox.classList.add('hidden'); }
    });
}

// Used by tasks.js
window.setupAutocomplete = setupAutocomplete;




// --- FUNÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ES DE EDIÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢O LOCAL ---
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
            const editAvatar = c.photo
                ? `<img src="${c.photo}" class="w-6 h-6 rounded-full object-cover border border-white" style="box-shadow:0 1px 3px rgba(15,23,42,0.08)">`
                : `<div class="w-6 h-6 rounded-full bg-[#e41e26] flex items-center justify-center text-white font-black text-[8px]">${c.nome.charAt(0)}</div>`;
            const item = document.createElement('div');
            item.className = "px-3 py-2 cursor-pointer hover:bg-[#fef2f2] border-b border-[#e5e7eb]/40 flex items-center gap-2.5 bg-white transition-colors";
            item.innerHTML = `${editAvatar}<span class="font-bold text-[#151515] text-[11px]">${c.nome}</span>`;
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
    span.className = "cursor-pointer hover:bg-[#fef2f2] hover:text-[#e41e26] hover:border-[#e41e26]/30 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#fafafa] text-[10px] font-bold text-[#151515] border border-[#e5e7eb] transition-all";
    span.dataset.name = name;
    span.innerHTML = `${name} <i data-lucide="x" class="w-3 h-3 text-[#94a3b8]"></i>`;
    span.onclick = function() { this.remove(); };
    
    container.appendChild(span);
    input.value = '';
    lucide.createIcons();
}

window.saveEdit = async function(taskId) {
    const titleEl = document.getElementById(`edit-title-${taskId}`);
    const newTitle = titleEl ? String(titleEl.value || '').toUpperCase() : '';

    const container = document.getElementById(`tags-container-${taskId}`);
    const names = container ? Array.from(container.children).map(child => String(child.dataset.name || '').trim()).filter(Boolean) : [];
    const newAssignees = names.join(', ');

    const task = state.tasks.find(t => t.id === taskId);
    if (!newTitle || !task) return;

    const newAssigneeIds = names
        .map((name) => {
            const hit = (state.colaborators || []).find(c => String(c.nome || '').toUpperCase() === name.toUpperCase());
            return hit ? String(hit.matricula || hit.id || '').trim() : '';
        })
        .filter(Boolean);

    const oldIds = Array.isArray(task.assigneeIds) ? task.assigneeIds.map(x => String(x).trim()) : [];
    const newlyAdded = newAssigneeIds.filter((id) => id && !oldIds.includes(id));

    try {
        await updateDoc(doc(db, task.path), {
            title: newTitle,
            assignee: newAssignees,
            assigneeIds: newAssigneeIds
        });

        if (newlyAdded.length) {
            const parts = String(task.date || '').split('-');
            const dateFmt = parts.length === 3 ? `${parts[2]}/${parts[1]}` : String(task.date || '');
            sendAssignmentPush({
                assigneeIds: newlyAdded,
                title: 'ATUALIZACAO DE ESCALA',
                body: `Verifique sua atividade: ${newTitle}\nData: ${dateFmt}`,
                taskPath: task.path,
                taskId: taskId,
                date: String(task.date || '')
            });
        }

        state.editingTaskId = null;
        renderTaskList(state.selectedDate.toISOString().split('T')[0]);
        showCustomAlert('ALTERACOES SALVAS!', 'success');

    } catch (e) {
        console.error(e);
    }
}











