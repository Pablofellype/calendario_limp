import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import webpush from 'web-push';

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getAdminApp() {
  if (getApps().length) return getApps()[0];

  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) {
    const err = new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON');
    err.code = 'missing_service_account';
    throw err;
  }

  let creds;
  try {
    const jsonText = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    creds = JSON.parse(jsonText);
  } catch {
    const err = new Error('FIREBASE_SERVICE_ACCOUNT_JSON must be raw JSON or base64-encoded JSON');
    err.code = 'invalid_service_account';
    throw err;
  }

  return initializeApp({ credential: cert(creds) });
}

function toArray(v) {
  return Array.isArray(v) ? v.filter(Boolean) : [];
}

function dedupeStrings(arr) {
  return Array.from(new Set(toArray(arr).map((x) => String(x).trim()).filter(Boolean)));
}

function isValidWebPushSub(s) {
  if (!s || typeof s !== 'object') return false;
  if (!s.endpoint || typeof s.endpoint !== 'string') return false;
  const keys = s.keys;
  if (!keys || typeof keys !== 'object') return false;
  if (!keys.p256dh || !keys.auth) return false;
  return true;
}

function dedupeSubsByEndpoint(subs) {
  const m = new Map();
  for (const s of toArray(subs)) {
    if (!isValidWebPushSub(s)) continue;
    m.set(String(s.endpoint), s);
  }
  return Array.from(m.values());
}

async function collectWebPushSubs(db, assigneeIds) {
  const ids = dedupeStrings(assigneeIds);
  if (!ids.length) return [];

  const snaps = await Promise.all(ids.map((id) => db.doc(`users/${id}`).get()));
  const subs = [];

  for (const snap of snaps) {
    if (!snap.exists) continue;
    const data = snap.data() || {};

    if (isValidWebPushSub(data.webPushSub)) {
      subs.push(data.webPushSub);
    }

    const arr = Array.isArray(data.webPushSubs) ? data.webPushSubs : [];
    for (const s of arr) subs.push(s);
  }

  return dedupeSubsByEndpoint(subs);
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return json(res, 405, { ok: false, error: 'method_not_allowed' });
    }

    const authHeader = req.headers.authorization || '';
    const m = /^Bearer\s+(.+)$/i.exec(authHeader);
    if (!m) return json(res, 401, { ok: false, error: 'missing_auth' });

    const app = getAdminApp();
    const auth = getAuth(app);

    let decoded;
    try {
      decoded = await auth.verifyIdToken(m[1]);
    } catch {
      return json(res, 401, { ok: false, error: 'invalid_auth' });
    }

    // Optional allowlist: comma-separated emails.
    const allowRaw = (process.env.ADMIN_EMAILS || '').trim();
    if (allowRaw) {
      const allow = new Set(allowRaw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
      const email = decoded && decoded.email ? String(decoded.email).toLowerCase() : '';
      if (!allow.has(email)) return json(res, 403, { ok: false, error: 'forbidden' });
    }

    const body = await readBody(req);
    const assigneeIds = toArray(body.assigneeIds);
    const title = body.title ? String(body.title) : '';
    const msgBody = body.body ? String(body.body) : '';

    if (!assigneeIds.length || !title) {
      return json(res, 400, { ok: false, error: 'missing_fields' });
    }

    const publicKey = (process.env.WEBPUSH_PUBLIC_KEY || '').trim();
    const privateKey = (process.env.WEBPUSH_PRIVATE_KEY || '').trim();
    const subject = (process.env.WEBPUSH_SUBJECT || 'mailto:admin@example.com').trim();

    if (!publicKey || !privateKey) {
      return json(res, 500, { ok: false, error: 'missing_webpush_keys' });
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);

    const db = getFirestore(app);
    const subs = await collectWebPushSubs(db, assigneeIds);

    if (!subs.length) {
      return json(res, 200, { ok: true, sent: 0, reason: 'no_subscriptions' });
    }

    const data = {
      taskPath: body.taskPath ? String(body.taskPath) : '',
      taskId: body.taskId ? String(body.taskId) : '',
      date: body.date ? String(body.date) : ''
    };

    const payload = JSON.stringify({ title, body: msgBody, data });

    const results = await Promise.allSettled(
      subs.map((s) => webpush.sendNotification(s, payload))
    );

    let sent = 0;
    let failed = 0;
    for (const r of results) {
      if (r.status === 'fulfilled') sent++;
      else failed++;
    }

    return json(res, 200, { ok: true, sent, failed });
  } catch (e) {
    console.error(e);
    const code = e && e.code ? String(e.code) : '';
    const fallbackCode = (e && e.errorInfo && e.errorInfo.code) ? String(e.errorInfo.code) : '';
    if (code === 'missing_service_account' || code === 'invalid_service_account') {
      return json(res, 500, { ok: false, error: code });
    }
    return json(res, 500, { ok: false, error: code || fallbackCode || 'server_error' });
  }
}

