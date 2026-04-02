import { createHash, timingSafeEqual } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

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

function sha256Hex(value) {
  return createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function constantEquals(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

function sanitizeUser(id, data) {
  const safe = { ...(data || {}) };
  delete safe.webPushSubs;
  delete safe.fcmTokens;
  return { id, ...safe };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return json(res, 405, { ok: false, error: 'method_not_allowed' });
    }

    const body = await readBody(req);
    const matricula = body.matricula ? String(body.matricula).trim() : '';
    const pin = body.pin ? String(body.pin).trim() : '';
    const pinHash = body.pinHash ? String(body.pinHash).trim().toLowerCase() : '';

    if (!matricula || (!pin && !pinHash)) {
      return json(res, 400, { ok: false, error: 'missing_fields' });
    }

    const app = getAdminApp();
    const db = getFirestore(app);
    const auth = getAuth(app);

    const userRef = db.doc(`users/${matricula}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return json(res, 401, { ok: false, error: 'invalid_credentials' });
    }

    const userData = userSnap.data() || {};
    if (userData.active === false) {
      return json(res, 403, { ok: false, error: 'inactive_user' });
    }

    const expectedPin = String(userData.pin || '').trim();
    const expectedHash = String(userData.pinHash || '').trim().toLowerCase();

    if (expectedPin) {
      if (!pin || !constantEquals(expectedPin, pin)) {
        return json(res, 401, { ok: false, error: 'invalid_credentials' });
      }
    } else if (expectedHash) {
      const normalizedHash = /^[0-9a-f]{64}$/.test(pinHash) ? pinHash : sha256Hex(pin || pinHash);
      if (!constantEquals(expectedHash, normalizedHash)) {
        return json(res, 401, { ok: false, error: 'invalid_credentials' });
      }
    } else {
      return json(res, 403, { ok: false, error: 'pin_not_configured' });
    }

    const token = await auth.createCustomToken(matricula, {
      role: 'employee',
      matricula
    });

    return json(res, 200, {
      ok: true,
      token,
      user: sanitizeUser(userSnap.id, userData)
    });
  } catch (e) {
    console.error(e);
    const code = e && e.code ? String(e.code) : '';
    return json(res, 500, { ok: false, error: code || 'server_error' });
  }
}