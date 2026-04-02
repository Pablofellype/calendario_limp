import { auth } from './firebase-config.js';

function toArray(v) {
  return Array.isArray(v) ? v.filter(Boolean) : [];
}

export async function sendAssignmentPush({ assigneeIds, title, body, taskPath = '', taskId = '', date = '' }) {
  const ids = toArray(assigneeIds);
  if (!ids.length) return;

  // Only admins are authenticated via Firebase Auth in this app.
  const user = auth.currentUser;
  if (!user) return;

  let token = '';
  try {
    token = await user.getIdToken();
  } catch {
    return;
  }

  try {
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ assigneeIds: ids, title, body, taskPath, taskId, date })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.warn('Push notify failed', data && data.error ? data.error : res.status);
    }
  } catch {
    // Best-effort: notifications should not block task writes.
  }
}

