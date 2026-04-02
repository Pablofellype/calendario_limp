const admin = require('firebase-admin');
const { setGlobalOptions } = require('firebase-functions/v2');
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');

admin.initializeApp();

// Cost control.
setGlobalOptions({ maxInstances: 10 });

function toArray(v) {
  return Array.isArray(v) ? v.filter(Boolean) : [];
}

function fmtDate(iso) {
  if (!iso || typeof iso !== 'string') return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}`;
}

async function collectTokensForAssignees(assigneeIds) {
  const ids = toArray(assigneeIds).map((x) => String(x).trim()).filter(Boolean);
  if (!ids.length) return [];

  const snaps = await Promise.all(
    ids.map((id) => admin.firestore().doc(`users/${id}`).get())
  );

  const tokens = [];
  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = snap.data() || {};
    const t = Array.isArray(data.fcmTokens) ? data.fcmTokens : [];
    for (const token of t) {
      if (typeof token === 'string' && token.trim()) tokens.push(token.trim());
    }
  }

  return Array.from(new Set(tokens));
}

async function pruneInvalidTokens(invalidTokens) {
  const invalid = toArray(invalidTokens).map(String).map((t) => t.trim()).filter(Boolean);
  if (!invalid.length) return;

  // Firestore array-contains-any supports up to 10 values.
  const qs = await admin
    .firestore()
    .collection('users')
    .where('fcmTokens', 'array-contains-any', invalid.slice(0, 10))
    .get();

  await Promise.all(
    qs.docs.map((d) => d.ref.update({
      fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalid)
    }))
  ).catch(() => {});
}

async function sendToTokens(tokens, title, body, data) {
  const tokenList = toArray(tokens).map(String).map((t) => t.trim()).filter(Boolean);
  if (!tokenList.length) return;

  const res = await admin.messaging().sendEachForMulticast({
    tokens: tokenList,
    notification: { title, body },
    data: Object.fromEntries(Object.entries(data || {}).map(([k, v]) => [k, String(v)]))
  });

  const invalid = [];
  res.responses.forEach((r, idx) => {
    if (r.success) return;
    const code = r.error && r.error.code ? String(r.error.code) : '';
    if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
      invalid.push(tokenList[idx]);
    }
  });

  await pruneInvalidTokens(invalid);
}

const TASK_PATH = 'cleaning_tasks/{y}/{m}/{d}/atividades/{taskId}';

exports.notifyTaskAssignedOnCreate = onDocumentCreated(TASK_PATH, async (event) => {
  const snap = event.data;
  if (!snap) return;

  const task = snap.data() || {};
  const assigneeIds = toArray(task.assigneeIds);
  if (!assigneeIds.length) return;

  const tokens = await collectTokensForAssignees(assigneeIds);
  const title = 'NOVA ESCALA!';
  const body = `Atividade: ${task.title || 'Sem titulo'}\nData: ${fmtDate(task.date)}`;

  await sendToTokens(tokens, title, body, {
    taskPath: snap.ref.path,
    taskId: event.params.taskId,
    date: task.date || ''
  });
});

exports.notifyTaskAssignedOnUpdate = onDocumentUpdated(TASK_PATH, async (event) => {
  const beforeSnap = event.data && event.data.before;
  const afterSnap = event.data && event.data.after;
  if (!beforeSnap || !afterSnap) return;

  const before = beforeSnap.data() || {};
  const after = afterSnap.data() || {};

  const beforeIds = new Set(toArray(before.assigneeIds).map((x) => String(x).trim()).filter(Boolean));
  const afterIds = toArray(after.assigneeIds).map((x) => String(x).trim()).filter(Boolean);
  const newlyAdded = afterIds.filter((id) => id && !beforeIds.has(id));

  if (!newlyAdded.length) return;

  const tokens = await collectTokensForAssignees(newlyAdded);
  const title = 'ATUALIZACAO DE ESCALA';
  const body = `Verifique sua atividade: ${after.title || 'Sem titulo'}\nData: ${fmtDate(after.date)}`;

  await sendToTokens(tokens, title, body, {
    taskPath: afterSnap.ref.path,
    taskId: event.params.taskId,
    date: after.date || ''
  });
});
