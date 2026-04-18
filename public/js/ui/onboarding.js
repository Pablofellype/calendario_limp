// ─── Onboarding & Contextual Tours ───

const STORAGE_KEY = 'calendario_onboarding_done';
const TOUR_PREFIX = 'calendario_tour_';

// ─── MAIN ONBOARDING (first visit only) ───
const STEPS = [
    {
        target: '.corp-header-logo',
        title: 'Bem-vindo!',
        text: 'Este é o Calendário DPA — seu sistema de gestão de escalas e tarefas.',
        position: 'bottom'
    },
    {
        target: '#current-month',
        title: 'Navegação',
        text: 'Veja o mês atual. Use as setas ou deslize o calendário para navegar entre meses.',
        position: 'bottom'
    },
    {
        target: '.cal-wrapper',
        title: 'Calendário',
        text: 'Clique em qualquer dia para ver ou adicionar atividades. As cores indicam o status das tarefas.',
        position: 'top'
    },
    {
        target: '#filter-bar',
        title: 'Filtros',
        text: 'Busque atividades por nome, colaborador ou status para encontrar rapidamente o que procura.',
        position: 'bottom'
    },
    {
        target: '#view-toggle-container',
        title: 'Visualização',
        text: 'Alterne entre visão mensal e semanal do calendário.',
        position: 'bottom'
    },
    {
        target: '#btn-notifications',
        title: 'Notificações',
        text: 'Ative para receber avisos quando novas escalas forem atribuídas a você.',
        position: 'bottom-left'
    },
];

const ADMIN_STEPS = [
    {
        target: '#btn-team-management',
        title: 'Equipe',
        text: 'Gerencie colaboradores: adicione, edite ou remova membros da equipe.',
        position: 'bottom-left'
    },
    {
        target: '#btn-report',
        title: 'Relatório PDF',
        text: 'Gere relatórios mensais com todas as atividades, responsáveis e status.',
        position: 'bottom-left'
    },
];

// ─── CONTEXTUAL TOURS (on first open of each modal) ───
const TASK_MODAL_TOUR = [
    {
        target: '#admin-add-area',
        title: 'Nova Atividade',
        text: 'Preencha o nome da atividade e clique em Próximo para atribuir responsáveis.',
        position: 'bottom'
    },
    {
        target: '#task-list',
        title: 'Lista de Tarefas',
        text: 'Veja todas as atividades do dia. Clique no checkbox para concluir (foto obrigatória).',
        position: 'top'
    },
    {
        target: '#btn-share-schedule',
        title: 'Compartilhar',
        text: 'Gere uma imagem da escala do dia para enviar por WhatsApp ou salvar.',
        position: 'bottom-left'
    },
];

const TEAM_MODAL_TOUR = [
    {
        target: '#team-search',
        title: 'Busca Rápida',
        text: 'Busque colaboradores por nome ou matrícula.',
        position: 'bottom'
    },
    {
        target: '#team-list',
        title: 'Lista da Equipe',
        text: 'Clique em um colaborador para editar seus dados, foto ou PIN de acesso.',
        position: 'top'
    },
];

// ─── ENGINE ───
let currentStep = 0;
let activeSteps = [];
let activeTourKey = null;

function createOverlay() {
    let existing = document.getElementById('onboarding-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.className = 'onboarding-overlay';
    overlay.innerHTML = `
        <div id="onboarding-spotlight" class="onboarding-spotlight"></div>
        <div id="onboarding-tooltip" class="onboarding-tooltip">
            <div class="onboarding-step-counter"></div>
            <h4 class="onboarding-title"></h4>
            <p class="onboarding-text"></p>
            <div class="onboarding-actions">
                <button class="onboarding-skip">Pular</button>
                <button class="onboarding-next">Próximo</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('.onboarding-skip').onclick = endTour;
    overlay.querySelector('.onboarding-next').onclick = nextStep;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) nextStep(); });

    requestAnimationFrame(() => overlay.classList.add('active'));
    return overlay;
}

function positionStep(step) {
    const el = document.querySelector(step.target);
    if (!el || el.offsetParent === null) { nextStep(); return; }

    const rect = el.getBoundingClientRect();
    const spotlight = document.getElementById('onboarding-spotlight');
    const tooltip = document.getElementById('onboarding-tooltip');
    const pad = 8;

    spotlight.style.top = (rect.top - pad) + 'px';
    spotlight.style.left = (rect.left - pad) + 'px';
    spotlight.style.width = (rect.width + pad * 2) + 'px';
    spotlight.style.height = (rect.height + pad * 2) + 'px';

    tooltip.querySelector('.onboarding-step-counter').textContent = `${currentStep + 1} / ${activeSteps.length}`;
    tooltip.querySelector('.onboarding-title').textContent = step.title;
    tooltip.querySelector('.onboarding-text').textContent = step.text;
    tooltip.querySelector('.onboarding-next').textContent =
        currentStep === activeSteps.length - 1 ? 'Concluir' : 'Próximo';

    tooltip.style.opacity = '0';
    tooltip.style.transform = 'translateY(10px)';

    requestAnimationFrame(() => {
        const tr = tooltip.getBoundingClientRect();
        let top = step.position.startsWith('top') ? rect.top - tr.height - 16 : rect.bottom + 16;
        let left = step.position.includes('left')
            ? Math.max(16, rect.right - tr.width)
            : rect.left + (rect.width - tr.width) / 2;

        left = Math.max(16, Math.min(left, window.innerWidth - tr.width - 16));
        top = Math.max(16, Math.min(top, window.innerHeight - tr.height - 16));

        tooltip.style.top = top + 'px';
        tooltip.style.left = left + 'px';
        requestAnimationFrame(() => {
            tooltip.style.opacity = '1';
            tooltip.style.transform = 'translateY(0)';
        });
    });
}

function nextStep() {
    currentStep++;
    if (currentStep >= activeSteps.length) { endTour(); return; }
    positionStep(activeSteps[currentStep]);
}

function endTour() {
    const overlay = document.getElementById('onboarding-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 300);
    }
    if (activeTourKey) {
        localStorage.setItem(activeTourKey, 'true');
    }
    activeTourKey = null;
}

function runTour(steps, storageKey) {
    if (localStorage.getItem(storageKey)) return;

    // Filter to visible targets
    const visible = steps.filter(s => {
        const el = document.querySelector(s.target);
        return el && !el.classList.contains('hidden') && el.offsetParent !== null;
    });

    if (visible.length === 0) return;

    activeSteps = visible;
    currentStep = 0;
    activeTourKey = storageKey;

    setTimeout(() => {
        createOverlay();
        positionStep(activeSteps[0]);
    }, 600);
}

// ─── PUBLIC API ───

// Main onboarding (after first data load)
export function startOnboarding(isAdmin = false) {
    const steps = [...STEPS];
    if (isAdmin) steps.push(...ADMIN_STEPS);
    runTour(steps, STORAGE_KEY);
}

// Contextual: task modal opened
export function startTaskModalTour() {
    runTour(TASK_MODAL_TOUR, TOUR_PREFIX + 'task_modal');
}

// Contextual: team modal opened
export function startTeamModalTour() {
    runTour(TEAM_MODAL_TOUR, TOUR_PREFIX + 'team_modal');
}

// Global access
window.startOnboarding = startOnboarding;
window.startTaskModalTour = startTaskModalTour;
window.startTeamModalTour = startTeamModalTour;

// Manual re-run (help button)
window.resetOnboarding = function() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOUR_PREFIX + 'task_modal');
    localStorage.removeItem(TOUR_PREFIX + 'team_modal');
    const isAdmin = document.getElementById('btn-team-management') &&
        !document.getElementById('btn-team-management').classList.contains('hidden');
    startOnboarding(isAdmin);
};
