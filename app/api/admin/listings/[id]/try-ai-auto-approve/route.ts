/**
 * POST /api/admin/listings/[id]/try-ai-auto-approve
 *
 * Admin-only: re-runs AI evaluation on a pending listing and auto-approves if it passes.
 * Use when AI auto-approve is on but a listing went to manual (e.g. retry after config change).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { isAdminUid } from '@/app/api/admin/notifications/_admin';
import { emitAndProcessEventForUser } from '@/lib/notifications';
import { getSiteUrl } from '@/lib/site-url';
import { createAuditLog } from '@/lib/audit/logger';
import { coerceDurationDays, computeEndAt } from '@/lib/listings/duration';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const listingId = String(ctx?.params?.id || '').trim();
  if (!listingId) return json({ ok: false, error: 'Missing listingId' }, { status: 400 });

  let auth: ReturnType<typeof getAdminAuth>;
  let db: ReturnType<typeof getAdminDb>;
  try {
    auth = getAdminAuth();
    db = getAdminDb();
  } catch (e: any) {
    return json({ ok: false, error: 'Server not configured', message: e?.message }, { status: 503 });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  let decoded: any;
  try {
    decoded = await auth.verifyIdToken(authHeader.slice('Bearer '.length));
  } catch {
    return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const uid = decoded?.uid as string | undefined;
  if (!uid) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const claimRole = (decoded as any)?.role;
  const claimSuper = (decoded as any)?.superAdmin === true;
  const claimIsAdmin = claimRole === 'admin' || claimRole === 'super_admin' || claimSuper;
  const docIsAdmin = claimIsAdmin ? true : await isAdminUid(uid);
  if (!docIsAdmin) return json({ ok: false, error: 'Admin access required' }, { status: 403 });

  const listingRef = db.collection('listings').doc(listingId);
  const listingSnap = await listingRef.get();
  if (!listingSnap.exists) return json({ ok: false, error: 'Listing not found' }, { status: 404 });

  const listingData = listingSnap.data() as any;
  if (listingData?.status !== 'pending') {
    return json({ ok: false, error: 'Listing must be pending to try AI auto-approve', reasons: [] }, { status: 400 });
  }

  const sellerId = String(listingData?.sellerId || '');
  const userDoc = await db.collection('users').doc(sellerId).get();
  const userData = userDoc.exists ? (userDoc.data() as any) : {};
  const payoutsReady =
    userData?.stripeOnboardingStatus === 'complete' &&
    userData?.payoutsEnabled === true &&
    userData?.chargesEnabled === true &&
    !!userData?.stripeAccountId;
  const identityVerified = userData?.seller?.credentials?.identityVerified === true;
  const sellerVerified =
    userData?.seller?.verified === true ||
    identityVerified ||
    payoutsReady;

  const category = String(listingData?.category || '').trim();
  const { getListingModerationConfig } = await import('@/lib/compliance/aiModeration/config');
  const { runListingTextModeration } = await import('@/lib/compliance/aiModeration/listingTextModeration');
  const { evaluateAutoApprove } = await import('@/lib/compliance/aiModeration/evaluateAutoApprove');

  const config = await getListingModerationConfig(db as any);
  const textResult = config.aiAutoApproveEnabled
    ? await runListingTextModeration({
        title: String(listingData?.title || ''),
        description: String(listingData?.description || ''),
        category,
        type: String(listingData?.type || ''),
        locationState: listingData?.location?.state,
        locationCity: listingData?.location?.city,
        attributesSpeciesId: listingData?.attributes?.speciesId,
        transportOption: listingData?.transportOption,
        deliveryTimeframe: listingData?.deliveryDetails?.deliveryTimeframe,
        sellerVerified,
        price: listingData?.price,
        startingBid: listingData?.startingBid,
      })
    : null;

  const decision = evaluateAutoApprove({
    listing: listingData,
    sellerVerified,
    config,
    textResult,
  });

  if (!decision.canAutoApprove) {
    return json({
      ok: false,
      error: 'Listing did not pass AI auto-approve',
      reasons: decision.reasons,
      decision: decision.decision,
    }, { status: 200 });
  }

  const buildAiModeration = () => {
    const out: Record<string, any> = {
      decision: 'auto_approved',
      policyVersion: config.policyVersion,
      evaluatedAt: Timestamp.now(),
      evaluatedBy: 'system',
      flags: decision.flags ?? [],
      reasons: decision.reasons ?? [],
      model: textResult?.model ?? 'gpt-4o-mini',
    };
    if (decision.scores && typeof decision.scores === 'object') {
      const scores: Record<string, number> = {};
      if (typeof decision.scores.textConfidence === 'number') scores.textConfidence = decision.scores.textConfidence;
      if (typeof decision.scores.riskScore === 'number') scores.riskScore = decision.scores.riskScore;
      if (Object.keys(scores).length > 0) out.scores = scores;
    }
    if (textResult?.evidence?.length) out.evidence = textResult.evidence;
    return out;
  };

  const now = Timestamp.now();
  const durationDays = coerceDurationDays((listingData as any)?.durationDays, 7);
  const startAt = now;
  const endAtMs = computeEndAt(startAt.toMillis(), durationDays);
  const endAt = Timestamp.fromMillis(endAtMs);

  await listingRef.update({
    status: 'active',
    publishedAt: now,
    startAt,
    endAt,
    complianceStatus: 'approved',
    aiModeration: buildAiModeration(),
    updatedAt: now,
    updatedBy: uid,
    ...(String((listingData as any)?.type || '') === 'auction' ? { endsAt: endAt } : {}),
  });

  await createAuditLog(db as any, {
    actorUid: uid,
    actorRole: 'admin',
    actionType: 'listing_ai_auto_approved',
    listingId,
    targetUserId: sellerId,
    beforeState: { status: 'pending' },
    afterState: { status: 'active', complianceStatus: 'approved' },
    metadata: { source: 'try_ai_auto_approve', scores: decision.scores },
    source: 'admin_ui',
  });

  try {
    const origin = getSiteUrl();
    await emitAndProcessEventForUser({
      type: 'Listing.Approved',
      actorId: uid,
      entityType: 'listing',
      entityId: listingId,
      targetUserId: sellerId,
      payload: {
        type: 'Listing.Approved',
        listingId,
        listingTitle: String(listingData?.title || 'Listing'),
        listingUrl: `${origin}/listing/${listingId}`,
      },
      optionalHash: `listing_approved:${listingId}`,
    });
  } catch {
    // Non-blocking
  }

  return json({ ok: true });
}
