/**
 * Netlify Scheduled Function: Expire Offers
 *
 * Runs every 10 minutes:
 * - Finds offers with status in ("open","countered") and expiresAt < now
 * - Marks them expired, appends history entry, writes audit log
 */

import { Handler, schedule } from '@netlify/functions';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { logInfo, logWarn, logError } from '../../lib/monitoring/logger';

let adminApp: App | undefined;
let db: ReturnType<typeof getFirestore>;

function normalizePrivateKey(v: string | undefined): string | undefined {
  if (!v) return undefined;
  let s = v.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s.replace(/\\n/g, '\n');
}

async function initializeFirebaseAdmin() {
  if (!adminApp) {
    if (!getApps().length) {
      const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);
      const serviceAccount = projectId && clientEmail && privateKey ? { projectId, clientEmail, privateKey } : undefined;

      if (serviceAccount) {
        adminApp = initializeApp({ credential: cert(serviceAccount as any) });
      } else {
        adminApp = initializeApp();
      }
    } else {
      adminApp = getApps()[0];
    }
  }
  db = getFirestore(adminApp);
  return db;
}

const baseHandler: Handler = async () => {
  const requestId = `cron_expireOffers_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const startedAt = Date.now();
  let scanned = 0;
  let expired = 0;

  try {
    await initializeFirebaseAdmin();
    const nowTs = Timestamp.now();

    // Query offers that are past expiry
    const snap = await db
      .collection('offers')
      .where('status', 'in', ['open', 'countered'])
      .where('expiresAt', '<=', nowTs)
      .orderBy('expiresAt', 'asc')
      .limit(200)
      .get();

    scanned = snap.size;
    if (snap.empty) {
      logInfo('expireOffers: nothing to expire', { requestId, scanned, expired, ms: Date.now() - startedAt });
      return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, expired }) };
    }

    const batch = db.batch();

    snap.docs.forEach((doc) => {
      const data = doc.data() as any;
      const history = Array.isArray(data.history) ? data.history : [];
      const nextHistory = [
        ...history,
        { type: 'expire', actorId: 'system', actorRole: 'system', createdAt: nowTs },
      ];

      batch.update(doc.ref, {
        status: 'expired',
        lastActorRole: 'system',
        updatedAt: nowTs,
        history: nextHistory,
      });

      const auditRef = db.collection('auditLogs').doc();
      batch.set(auditRef, {
        auditId: auditRef.id,
        actorUid: 'system',
        actorRole: 'system',
        actionType: 'offer_expired',
        listingId: data.listingId,
        metadata: { offerId: doc.id },
        source: 'cron',
        createdAt: nowTs,
      });
      expired++;
    });

    await batch.commit();

    logInfo('expireOffers: completed', { requestId, scanned, expired, ms: Date.now() - startedAt });
    return { statusCode: 200, body: JSON.stringify({ ok: true, scanned, expired }) };
  } catch (error: any) {
    logError('expireOffers failed', error, { requestId, scanned, expired });
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: error?.message || 'Unknown error' }) };
  }
};

export const handler = schedule('*/10 * * * *', baseHandler);

