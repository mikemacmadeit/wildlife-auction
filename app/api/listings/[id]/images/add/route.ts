import { z } from 'zod';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  url: z.string().min(1),
});

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(request: Request, ctx: { params: { id: string } }) {
  const listingId = ctx.params.id;
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const token = authHeader.slice('Bearer '.length);
  let decoded: any;
  try {
    decoded = await getAdminAuth().verifyIdToken(token);
  } catch {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const uid = decoded?.uid as string | undefined;
  if (!uid) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json({ ok: false, error: 'Invalid body' }, { status: 400 });

  const db = getAdminDb();
  const ref = db.collection('listings').doc(listingId);
  const snap = await ref.get();
  if (!snap.exists) return json({ ok: false, error: 'Listing not found' }, { status: 404 });

  const data = snap.data() as any;
  if (data?.sellerId !== uid) return json({ ok: false, error: 'Forbidden' }, { status: 403 });

  await ref.update({
    images: FieldValue.arrayUnion(parsed.data.url),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid,
  });

  return json({ ok: true });
}

