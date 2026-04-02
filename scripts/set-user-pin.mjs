import { createHash } from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getAdminApp() {
  if (getApps().length) return getApps()[0];

  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON');

  let creds;
  try {
    const jsonText = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    creds = JSON.parse(jsonText);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must be raw JSON or base64-encoded JSON');
  }

  return initializeApp({ credential: cert(creds) });
}

function sha256Hex(value) {
  return createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

async function main() {
  const [, , matriculaArg, pinArg] = process.argv;
  const matricula = String(matriculaArg || '').trim();
  const pin = String(pinArg || '').trim();

  if (!matricula || !pin) {
    console.error('Uso: npm run set-pin -- <MATRICULA> <PIN>');
    process.exit(1);
  }

  if (pin.length < 4) {
    console.error('PIN invalido. Use ao menos 4 digitos.');
    process.exit(1);
  }

  const app = getAdminApp();
  const db = getFirestore(app);

  const ref = db.doc(`users/${matricula}`);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`Usuario ${matricula} nao encontrado em users.`);
    process.exit(1);
  }

  const pinHash = sha256Hex(pin);
  await ref.set({ pinHash }, { merge: true });

  console.log(`PIN atualizado para usuario ${matricula}.`);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});