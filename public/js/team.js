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
                        ${user.funcao} - #${user.matricula}
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
        showCustomAlert('PIN invalido. Use ao menos 4 digitos.');
        return;
    }
    if (!oldMatricula && !pinRaw) {
        showCustomAlert('Defina um PIN para o novo colaborador.');
        return;
    }
    if (oldMatricula && oldMatricula !== newMatricula && !pinRaw) {
        showCustomAlert('Ao alterar matricula, informe um novo PIN.');
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
            delete mergedData.pinHash;
            await setDoc(doc(db, "users", newMatricula), mergedData);
            await deleteDoc(doc(db, "users", oldMatricula));
        } else {
            userData.pinHash = deleteField();
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
        <span class="bg-blue-100 text-blue-600 px-2 py-1 rounded-lg text-xs font-bold border border-blue-200 flex items-center gap-1">
            ${name}
            <button onclick="removeCollaboratorTag('${name}')" type="button" class="hover:text-blue-800 flex items-center justify-center">
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
                const item = document.createElement('div');
                item.className = "px-4 py-3 cursor-pointer hover:bg-slate-50 border-b border-slate-50 flex justify-between items-center";
                item.innerHTML = `<span class="font-bold text-slate-700 text-sm">${c.nome}</span><span class="text-[10px] bg-slate-100 text-slate-500 px-1 rounded">#${c.matricula}</span>`;
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











