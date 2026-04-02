import { state } from './state.js';
import { getTrustedNow, hasFreshServerClock } from './clock.js';

function parseYmd(dateKey) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}

function isAssignedToUser(task, user) {
  const userId = String(user.matricula || user.id || '').trim();
  const userName = String(user.name || user.nome || '').trim().toUpperCase();

  // Preferred: ID match (matricula) via assigneeIds.
  if (userId && Array.isArray(task?.assigneeIds)) {
    const ids = task.assigneeIds.map((x) => String(x).trim()).filter(Boolean);
    if (ids.includes(userId)) return true;
  }

  // Fallback: name match via assignee string.
  if (userName && typeof task?.assignee === 'string') {
    const names = task.assignee.split(',').map((s) => String(s).trim().toUpperCase()).filter(Boolean);
    if (names.includes(userName)) return true;
  }

  return false;
}

export function getTaskEditPermission(task) {
  const user = state.user;
  if (!user) return { ok: false, reason: 'no_user' };

  // Admin can do anything.
  if (user.role === 'admin') return { ok: true, reason: 'admin' };

  // Collaborator requires a fresh server clock so device time doesn't matter.
  if (!hasFreshServerClock()) return { ok: false, reason: 'clock_unsynced' };

  if (!isAssignedToUser(task, user)) return { ok: false, reason: 'not_assigned' };

  const dateKey = task && task.date ? String(task.date) : '';
  const p = parseYmd(dateKey);
  if (!p) return { ok: false, reason: 'invalid_date' };

  const now = getTrustedNow();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const taskDate = new Date(p.y, p.mo - 1, p.d);
  taskDate.setHours(0, 0, 0, 0);
  if (Number.isNaN(taskDate.getTime())) return { ok: false, reason: 'invalid_date' };

  if (taskDate > today) return { ok: false, reason: 'future' };
  if (taskDate < yesterday) return { ok: false, reason: 'too_old' };

  return { ok: true, reason: 'ok' };
}

export function canUserEditTask(task) {
  return getTaskEditPermission(task).ok;
}

export function taskEditDenyMessage(reason) {
  switch (reason) {
    case 'clock_unsynced':
      return 'Conecte-se a internet para validar a data/hora e continuar.';
    case 'not_assigned':
      return 'Restrito ao responsável.';
    case 'future':
      return 'Colaborador não pode marcar dias futuros.';
    case 'too_old':
      return 'Colaborador só pode marcar hoje e ontem.';
    default:
      return 'Ação não permitida.';
  }
}
