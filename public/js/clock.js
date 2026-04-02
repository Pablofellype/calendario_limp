import { state } from './state.js';

const DEFAULT_TTL_MS = 2 * 60 * 1000;

export async function syncServerClock(force = false) {
  const now = Date.now();
  if (!force && state.serverClockSyncedAt && (now - state.serverClockSyncedAt) < DEFAULT_TTL_MS) {
    return true;
  }

  try {
    const res = await fetch('/api/now', { cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data || data.ok !== true || typeof data.now !== 'number') return false;

    // Offset that makes (Date.now() + offset) ~= server time.
    state.serverClockOffsetMs = data.now - Date.now();
    state.serverClockSyncedAt = Date.now();
    return true;
  } catch {
    return false;
  }
}

export function hasFreshServerClock(ttlMs = DEFAULT_TTL_MS) {
  if (!state.serverClockSyncedAt) return false;
  return (Date.now() - state.serverClockSyncedAt) < ttlMs;
}

export function getTrustedNow() {
  return new Date(Date.now() + (state.serverClockOffsetMs || 0));
}
