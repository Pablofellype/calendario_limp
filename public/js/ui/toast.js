// ─── Stackable Toast Notification System ───

function getContainer() {
    let el = document.getElementById('toast-container');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast-container';
        document.body.appendChild(el);
    }
    return el;
}

function dismiss(toast) {
    if (toast._gone) return;
    toast._gone = true;
    clearTimeout(toast._timer);
    toast.style.transform = 'translateX(120%)';
    toast.style.opacity = '0';
    setTimeout(() => {
        toast.style.maxHeight = '0';
        toast.style.padding = '0';
        toast.style.marginBottom = '0';
        toast.style.borderWidth = '0';
        setTimeout(() => toast.remove(), 200);
    }, 300);
}

export function showToast(message, type = 'error', duration = 4000) {
    const container = getContainer();

    const configs = {
        success: { icon: 'check-circle', bg: '#f0fdf4', color: '#22c55e', bar: '#22c55e', border: '#dcfce7' },
        error:   { icon: 'alert-triangle', bg: '#fef2f2', color: '#e41e26', bar: '#e41e26', border: '#fecaca' },
        info:    { icon: 'info', bg: '#eff6ff', color: '#3b82f6', bar: '#3b82f6', border: '#bfdbfe' },
    };
    const c = configs[type] || configs.error;

    const toast = document.createElement('div');
    toast.className = 'toast-item';
    toast.style.borderColor = c.border;
    toast.innerHTML = `
        <div class="toast-icon" style="background:${c.bg};color:${c.color}">
            <i data-lucide="${c.icon}" class="w-4 h-4"></i>
        </div>
        <p class="toast-msg">${message}</p>
        <button class="toast-dismiss" aria-label="Fechar">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>
        <div class="toast-bar-track"><div class="toast-bar" style="background:${c.bar};animation-duration:${duration}ms"></div></div>
    `;

    container.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('show'));
    });

    toast.querySelector('.toast-dismiss').onclick = () => dismiss(toast);
    toast._timer = setTimeout(() => dismiss(toast), duration);

    // Limit stack to 5
    while (container.children.length > 5) dismiss(container.children[0]);
}

// Expose globally
window.showToast = showToast;
