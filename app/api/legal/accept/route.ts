/**
 * POST /api/legal/accept
 *
 * Server-authoritative recording of legal acceptance.
 * - Prevents spoofing acceptance via direct client writes.
 * - Stores version + timestamp on users/{uid}.legal.*
 */
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { LEGAL_VERSIONS, type LegalDocKey } from '@/lib/legal/versions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

const acceptSchema = z.object({
  docs: z.array(z.enum(['tos', 'marketplacePolicies', 'buyerAcknowledgment', 'sellerPolicy'])).min(1),
});

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const auth = getAdminAuth();
    const db = getAdminDb();

    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const body = await request.json().catch(() => null);
    const parsed = acceptSchema.safeParse(body);
    if (!parsed.success) {
      return json({ ok: false, error: 'Invalid request', details: parsed.error.errors }, { status: 400 });
    }

    const now = Timestamp.now();
    const updates: Record<string, any> = {};
    const legalNested: Record<string, any> = {};

    for (const docKey of parsed.data.docs) {
      const key = docKey as LegalDocKey;
      const v = (LEGAL_VERSIONS as any)[key]?.version;
      if (!v) continue;
      updates[`legal.${key}`] = { version: v, acceptedAt: now };
      legalNested[key] = { version: v, acceptedAt: now };
    }

    if (Object.keys(updates).length === 0) {
      return json({ ok: false, error: 'No valid docs provided' }, { status: 400 });
    }

    const userRef = db.collection('users').doc(uid);

    // IMPORTANT: use update() so field paths like "legal.tos" are applied as nested fields.
    // set(..., {merge:true}) with dotted keys can behave unexpectedly depending on SDK/version.
    try {
      await userRef.update({
        ...updates,
        updatedAt: now,
      });
    } catch (e: any) {
      // If the user doc doesn't exist yet, create it with a properly nested object.
      await userRef.set(
        {
          legal: legalNested,
          updatedAt: now,
        },
        { merge: true }
      );
    }

    return json({ ok: true, accepted: parsed.data.docs });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to record acceptance', message: e?.message || String(e) }, { status: 500 });
  }
}

