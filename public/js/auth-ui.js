import { gsap } from './vendor.js';
import {
  app,
  db,
  auth,
  setDoc,
  doc,
  getDoc,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signInAnonymously,
  signOut,
  onAuthStateChanged,
} from './firebase-config.js';


import { state, resetStateForLogout } from './state.js';
import { showCustomAlert } from './ui/alerts.js';
import { subscribeToTasks, renderCalendar, stopTaskSubscription, playIntro, animatePageTransition } from './tasks.js';
import { fetchColaborators } from './team.js';
import { syncServerClock } from './clock.js';

// --- HELPERS ---
window.forceUppercase = function(input) {
  const start = input.selectionStart;
  input.value = input.value.toUpperCase();
  input.setSelectionRange(start, start);
};

window.togglePasswordField = function(fieldId, button) {
  const input = document.getElementById(fieldId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  const icon = button ? button.querySelector('i') : null;
  if (icon) icon.setAttribute('data-lucide', input.type === 'password' ? 'eye' : 'eye-off');
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
};

// Force uppercase visuals for text inputs
const style = document.createElement('style');
style.innerHTML = `input[type="text"], textarea { text-transform: uppercase; }`;
document.head.appendChild(style);
async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';

  try {
    return await Notification.requestPermission();
  } catch (e) {
    console.warn(e);
    return Notification.permission;
  }
}

function refreshNotificationButton() {
  const btn = document.getElementById('btn-notifications');
  if (!btn) return;

  const perm = ('Notification' in window) ? Notification.permission : 'denied';
  let icon = 'bell-off';
  let title = 'Ativar notificacoes';
  let classes = 'group w-10 h-10 rounded-xl border flex items-center justify-center hover:shadow-md transition-all ';

  if (perm === 'granted') {
    icon = 'bell';
    title = 'Notificacoes ativas';
    classes += 'bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100';
  } else if (perm === 'denied') {
    icon = 'bell-off';
    title = 'Notificacoes bloqueadas no navegador';
    classes += 'bg-slate-100 border-slate-200 text-slate-400 hover:bg-slate-200';
  } else {
    icon = 'bell-off';
    title = 'Ativar notificacoes';
    classes += 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100';
  }

  btn.className = classes;
  btn.title = title;
  btn.innerHTML = `<i data-lucide="${icon}" class="w-4 h-4"></i>`;
  if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
}

window.enableNotifications = async function() {
  const perm = await requestNotificationPermission();
  refreshNotificationButton();

  if (perm !== 'granted') {
    showCustomAlert('Ative as notificacoes nas configuracoes do navegador.');
    return;
  }

  if (!state.user || state.user.role === 'admin') {
    showCustomAlert('Notificacoes ativadas neste dispositivo.', 'success');
    return;
  }

  await initPushNotificationsForUser(state.user, true);
  showCustomAlert('Notificacoes ativadas com sucesso!', 'success');
};

async function sendLocalNotification(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const options = { body, icon: 'https://i.postimg.cc/nrCMQ8mx/logo-calendario.jpg', badge: 'https://i.postimg.cc/nrCMQ8mx/logo-calendario.jpg' };
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  // Mobile browsers are more reliable with ServiceWorkerRegistration.showNotification.
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, options);
        return;
      }
    }
  } catch (e) {
    console.warn(e);
  }

  try { new Notification(title, options); } catch (e) { console.warn(e); }
}

let _swRegPromise = null;
function registerMessagingServiceWorker() {
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  if (_swRegPromise) return _swRegPromise;

  _swRegPromise = navigator.serviceWorker.register('/firebase-messaging-sw.js').catch((e) => {
    console.warn('Service worker registration failed', e);
    return null;
  });

  return _swRegPromise;
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

let _pushInitPromise = null;
function initPushNotificationsForUser(user, force = false) {
  if (force) _pushInitPromise = null;
  if (_pushInitPromise) return _pushInitPromise;

  _pushInitPromise = (async () => {
    if (!user) return;
    if (user.role === 'admin') return;

    const userId = String(user.matricula || '').trim();
    if (!userId) return;

    const reg = await registerMessagingServiceWorker();
    if (!reg) return;

    if (!('PushManager' in window)) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const publicKey = (
      (import.meta && import.meta.env && import.meta.env.VITE_WEBPUSH_PUBLIC_KEY) ||
      (import.meta && import.meta.env && import.meta.env.VITE_FCM_VAPID_KEY) ||
      localStorage.getItem('WEBPUSH_PUBLIC_KEY') ||
      localStorage.getItem('FCM_VAPID_KEY') ||
      ''
    ).trim();

    if (!publicKey) {
      console.warn('Missing Web Push public key. Set VITE_WEBPUSH_PUBLIC_KEY (build) or localStorage WEBPUSH_PUBLIC_KEY (quick test).');
      return;
    }

    const options = {
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    };

    let sub = await reg.pushManager.getSubscription();

    try {
      if (!sub) {
        sub = await reg.pushManager.subscribe(options);
      } else {
        try {
          const refreshed = await reg.pushManager.subscribe(options);
          sub = refreshed || sub;
        } catch (e) {
          if (String(e && e.name) === 'InvalidStateError') {
            try { await sub.unsubscribe(); } catch {}
            sub = await reg.pushManager.subscribe(options);
          } else {
            throw e;
          }
        }
      }
    } catch (e) {
      console.warn('Push subscription failed', e);
      return;
    }

    const subJson = sub && sub.toJSON ? sub.toJSON() : null;
    if (!subJson || !subJson.endpoint) return;

    await setDoc(
      doc(db, 'users', userId),
      { webPushSub: subJson, webPushSubs: [subJson], webPushUpdatedAt: Date.now() },
      { merge: true }
    );
  })();

  return _pushInitPromise;
}

// Expose for tasks module (notifications)
window.__sendLocalNotification = sendLocalNotification;
const SESSION_KEY = 'pl_session_v1';
let didAttemptSessionRestore = false;

function saveEmployeeSession(matricula) {
  try {
    if (!matricula) return;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ matricula, ts: Date.now() }));
  } catch (e) {
    console.warn(e);
  }
}

function clearEmployeeSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { console.warn(e); }
}

async function tryRestoreEmployeeSession() {
  if (didAttemptSessionRestore) return;
  didAttemptSessionRestore = true;

  let raw = null;
  try { raw = localStorage.getItem(SESSION_KEY); } catch (e) { console.warn(e); }
  if (!raw) return;

  let matricula = '';
  try {
    const parsed = JSON.parse(raw);
    matricula = (parsed && parsed.matricula) ? String(parsed.matricula).trim() : '';
  } catch {
    matricula = String(raw).trim();
  }

  if (!matricula) {
    clearEmployeeSession();
    return;
  }

  try {
    const docSnap = await getDoc(doc(db, 'users', matricula));
    if (!docSnap.exists()) {
      clearEmployeeSession();
      return;
    }

    const userData = docSnap.data();
    if (userData && userData.active === false) {
      clearEmployeeSession();
      return;
    }

    state.user = { id: docSnap.id, matricula: docSnap.id, ...userData };
    completeLogin();
  } catch (e) {
    console.error(e);
  }
}



const lucide = window.lucide;

// --- PDF ---
window.generatePDFReport = async function() {
  const mod = await import('./reports.js');
  mod.generatePDF(state);
};

// --- PWA SETUP ---
let deferredPrompt = null;
function setupPWA() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (!isStandalone) {
    setTimeout(() => {
      const toast = document.getElementById('pwa-install-toast');
      if (toast) toast.classList.remove('translate-y-[150%]');
    }, 2000);
  }

  // Avoid Chrome warning spam; let the browser decide if it shows a banner.
  window.addEventListener('beforeinstallprompt', (e) => {
    deferredPrompt = e;
  });

  const installBtn = document.getElementById('pwa-install-trigger');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (deferredPrompt && typeof deferredPrompt.prompt === 'function') {
        deferredPrompt.prompt();
        try {
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === 'accepted') window.dismissInstall();
        } catch {}
        deferredPrompt = null;
        return;
      }

      // iOS: show instructions modal if present.
      const iosModal = document.getElementById('ios-install-modal');
      if (iosModal) {
        iosModal.classList.remove('hidden');
        gsap.to(iosModal, { opacity: 1, duration: 0.3 });
        return;
      }

      alert('Para instalar: toque no menu do navegador e selecione "Adicionar a Tela de Inicio".');
    });
  }
}

window.dismissInstall = function() {
  const toast = document.getElementById('pwa-install-toast');
  if (toast) toast.classList.add('translate-y-[150%]');
};

window.closeIosModal = function() {
  const el = document.getElementById('ios-install-modal');
  if (!el) return;
  gsap.to(el, { opacity: 0, duration: 0.3, onComplete: () => el.classList.add('hidden') });
};

// --- INIT ---
window.addEventListener('load', () => {
  try { if (lucide) lucide.createIcons(); } catch {}

  playIntro();
  setupPWA();

  // Register SW early so pushes can be received even with the tab closed.
  registerMessagingServiceWorker();

  // Close suggestion popovers when clicking outside.
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

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      return;
    }

    // Anonymous user = viewer mode (no state.user, view-only)
    if (user.isAnonymous) {
      state.user = null;
      const badge = document.getElementById('user-role-badge');
      if (badge) {
        badge.innerText = 'Visualizador';
        badge.className = 'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-white shadow-sm text-emerald-600 border-emerald-200';
      }
      // Hide admin-only buttons for viewer
      document.getElementById('btn-team-management').classList.add('hidden');
      document.getElementById('btn-report').classList.add('hidden');
      subscribeToTasks();
      animatePageTransition();
      renderCalendar();
      return;
    }

    if (!state.user) {
      try {
        const token = await user.getIdTokenResult();
        const claims = token && token.claims ? token.claims : {};
        const isEmployee = claims.role === 'employee' || String(claims.matricula || '').trim() !== '';

        if (isEmployee) {
          const docSnap = await getDoc(doc(db, 'users', user.uid));
          if (docSnap.exists()) {
            state.user = { id: docSnap.id, matricula: docSnap.id, ...docSnap.data(), role: 'employee' };
          } else {
            state.user = { id: user.uid, matricula: user.uid, role: 'employee', name: 'Colaborador' };
          }
        } else {
          state.user = { name: user.email || 'Administrador', role: 'admin', id: user.uid };
        }
      } catch (err) {
        console.error(err);
        state.user = { name: 'Administrador', role: 'admin', id: user.uid };
      }
    }

    completeLogin();
  });
});

// --- LOGIN ---
window.toggleLoginMode = function() {
    const adminForm = document.getElementById('form-admin');
    const empForm = document.getElementById('form-employee');
    const title = document.getElementById('login-mode-title');
    const btnToggle = document.getElementById('toggle-login-btn');

    if (adminForm.classList.contains('hidden')) {
        adminForm.classList.remove('hidden'); adminForm.classList.add('flex');
        empForm.classList.add('hidden');
        title.innerHTML = `<h2 class="text-lg font-bold text-slate-800">Acesso Administrativo</h2><p class="text-xs text-slate-500">Area restrita</p>`;
        btnToggle.innerText = "Sou Colaborador";
    } else {
        adminForm.classList.add('hidden'); adminForm.classList.remove('flex');
        empForm.classList.remove('hidden');
        title.innerHTML = `<h2 class="text-lg font-bold text-slate-800">Acesso Colaborador</h2><p class="text-xs text-slate-500">Digite sua matricula para entrar</p>`;
        btnToggle.innerText = "Sou Administrador";
    }
}

window.handleEmployeeLogin = async function(e) {
    e.preventDefault();
    const matriculaInput = document.getElementById('login-matricula').value.trim();
    const pinInput = document.getElementById('login-pin').value.trim();
    if (!matriculaInput || !pinInput) return;

    if (pinInput.length < 4) {
      showCustomAlert('PIN invalido. Use ao menos 4 digitos.');
      return;
    }

    const btn = e.submitter;
    const originalText = btn ? btn.innerHTML : "";
    if (btn) btn.innerHTML = '<div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>';

    try {
        const pin = pinInput;
        const res = await fetch('/api/employee-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matricula: matriculaInput, pin })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok || !data.token || !data.user) {
          const code = data && data.error ? String(data.error) : '';
          if (code === 'invalid_credentials') showCustomAlert('Matricula ou PIN invalidos.');
          else if (code === 'inactive_user') showCustomAlert('Acesso inativado. Procure a gestao.');
          else if (code === 'pin_not_configured') showCustomAlert('Usuario sem PIN cadastrado. Procure a gestao.');
          else showCustomAlert('Nao foi possivel autenticar.');
          return;
        }

        state.user = { id: data.user.id, matricula: data.user.id, ...data.user, role: 'employee' };
        saveEmployeeSession(data.user.id);
        await signInWithCustomToken(auth, data.token);
    } catch (error) {
        console.error(error);
        showCustomAlert('Erro de conexao.');
    } finally {
        if (btn) btn.innerHTML = originalText;
    }
}

window.handleAdminLogin = async function(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;

    const btn = e.submitter;
    const originalText = btn ? btn.innerHTML : "";
    if (btn) btn.innerHTML = '<div class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>';

    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
        showCustomAlert("Email ou senha incorretos.");
    } finally {
        if (btn) btn.innerHTML = originalText;
    }
}

window.handleViewerLogin = async function() {
    try {
        await signInAnonymously(auth);
        state.user = null; // viewer has no user profile
        subscribeToTasks();
        animatePageTransition();
        renderCalendar();
    } catch (error) {
        console.error(error);
        showCustomAlert('Erro ao acessar modo visualizacao.');
    }
}

function completeLogin() {
    syncServerClock(true);
    try {
        if (window.__clockInterval) clearInterval(window.__clockInterval);
        window.__clockInterval = setInterval(() => syncServerClock(false), 60 * 1000);
    } catch {}

    const badge = document.getElementById('user-role-badge');
    if (badge && state.user) {
        const isAdmin = state.user.role === 'admin';
        refreshNotificationButton();
        if (!isAdmin && ('Notification' in window) && Notification.permission === 'granted') {
            initPushNotificationsForUser(state.user);
        }

        const roleColor = isAdmin ? 'text-[#f40009] border-[#f40009]/20' : 'text-blue-600 border-blue-200';
        badge.innerText = isAdmin ? 'Administrador' : 'Colaborador';
        badge.className = `text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-white shadow-sm whitespace-nowrap ${roleColor}`;

        if (isAdmin) {
            document.getElementById('btn-team-management').classList.remove('hidden');
            document.getElementById('btn-report').classList.remove('hidden');
            fetchColaborators();
        } else {
            document.getElementById('btn-team-management').classList.add('hidden');
            document.getElementById('btn-report').classList.add('hidden');
        }
    }
    subscribeToTasks();
    animatePageTransition();
    renderCalendar();
}

window.logout = function() {
  try { if (window.__clockInterval) clearInterval(window.__clockInterval); } catch {}
  window.__clockInterval = null;
  // Stop live listeners before signing out.
  try { stopTaskSubscription(); } catch (e) { console.warn(e); }
  clearEmployeeSession();
  resetStateForLogout();

  // Hide admin-only buttons immediately
  document.getElementById('btn-team-management').classList.add('hidden');
  document.getElementById('btn-report').classList.add('hidden');

  // Always return to login UI immediately; signOut can take time/fail.
  showLoginScreen();

  signOut(auth).catch((e) => console.error(e));
}

function showLoginScreen() {
    const appScreen = document.getElementById('app-screen');
    const loginScreen = document.getElementById('login-screen');

    // Reset properties left by animatePageTransition() so login never becomes a blank page.
    try { gsap.killTweensOf('#login-screen'); } catch {}
    if (loginScreen) {
        loginScreen.style.opacity = '1';
        loginScreen.style.transform = 'none';
        try { gsap.set('#login-screen', { opacity: 1, scale: 1 }); } catch {}
    }
    try { gsap.set('.login-item', { opacity: 0, y: 10 }); } catch {}

    if (appScreen) appScreen.classList.add('hidden');
    if (loginScreen) loginScreen.classList.remove('hidden');

    const m = document.getElementById('login-matricula');
    const pin = document.getElementById('login-pin');
    const e = document.getElementById('login-email');
    const p = document.getElementById('login-password');
    if (m) m.value = '';
    if (pin) pin.value = '';
    if (e) e.value = '';
    if (p) p.value = '';

    // Animate if targets exist; UI state shouldn't depend on animation callbacks.
    gsap.to('.app-content', { opacity: 0, y: -10, duration: 0.2 });
    gsap.fromTo('.login-item', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.1 });
}























