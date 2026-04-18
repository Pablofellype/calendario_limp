import { showToast } from './toast.js';

export function showCustomAlert(message, type = 'error') {
  showToast(message, type);
}

export function closeCustomAlert() {
  // Toasts auto-dismiss
}

// Backwards-compat: existing code/HTML calls window.*
window.showCustomAlert = showCustomAlert;
window.closeCustomAlert = closeCustomAlert;