import { gsap } from '../vendor.js';

export function showCustomAlert(message, type = 'error') {
  const modal = document.getElementById('custom-alert-modal');
  const msgElement = document.getElementById('custom-alert-message');

  const iconContainer = document.getElementById('alert-icon-container');
  const icon = document.getElementById('alert-icon');
  const title = document.getElementById('alert-title');
  const btn = document.getElementById('alert-btn');

  if (modal && msgElement && iconContainer) {
    msgElement.innerText = message;

    iconContainer.className = 'w-16 h-16 rounded-full flex items-center justify-center mb-4 mx-auto ring-4 transition-colors';
    btn.className = 'w-full py-3.5 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-all';

    if (type === 'success') {
      iconContainer.classList.add('bg-green-100', 'text-green-600', 'ring-green-50');
      if (icon) icon.setAttribute('data-lucide', 'check-circle');
      if (title) title.innerText = 'Sucesso!';
      btn.classList.add('bg-green-600', 'hover:bg-green-700', 'shadow-green-500/20');
    } else {
      iconContainer.classList.add('bg-red-50', 'text-[#f40009]', 'ring-red-50');
      if (icon) icon.setAttribute('data-lucide', 'alert-triangle');
      if (title) title.innerText = 'Atencao';
      btn.classList.add('bg-[#f40009]', 'hover:bg-[#d00008]', 'shadow-red-500/20');
    }

    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();

    modal.classList.remove('hidden');
    gsap.to(modal, { opacity: 1, duration: 0.2 });
    gsap.fromTo(modal.querySelector('div'), { scale: 0.9 }, { scale: 1, duration: 0.3, ease: 'back.out(1.7)' });
  } else {
    alert(message);
  }
}

export function closeCustomAlert() {
  const modal = document.getElementById('custom-alert-modal');
  if (modal) gsap.to(modal, { opacity: 0, duration: 0.2, onComplete: () => modal.classList.add('hidden') });
}

// Backwards-compat: existing code/HTML calls window.*
window.showCustomAlert = showCustomAlert;
window.closeCustomAlert = closeCustomAlert;