/**
 * POST /api/admin/users/[userId]/plan-override
 * 
 * Admin-only endpoint to override seller exposure tier
 */

// IMPORTANT: Avoid importing `NextRequest` / `NextResponse` from `next/server` in this repo.
// In the current environment, dev bundling can attempt to resolve a missing internal Next module
// (`next/dist/server/web/exports/next-response`) and crash compilation.
// Route handlers work fine with standard Web `Request` / `Response`.
import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin } from '@/app/api/admin/_util';
import { validateRequest } from '@/lib/validation/api-schemas';
import { rateLimitMiddleware, RATE_LIMITS } from '@/lib/rate-limit';
import { z } from 'zod';
import { mapLegacyPlanToTier, mapTierToLegacyPlanId, type SubscriptionTier } from '@/lib/pricing/subscriptions';
import { logInfo, logError } from '@/lib/monitoring/logger';
import { captureException } from '@/lib/monitoring/capture';
import { createAuditLog } from '@/lib/audit/logger';

const planOverrideSchema = z.object({
  // Back-compat: allow legacy ids too. Stored as adminPlanOverride (legacy string) + subscriptionTier (canonical).
  planOverride: z.enum(['standard', 'priority', 'premier', 'free', 'pro', 'elite']).optional().nullable(), // null = remove override
  reason: z.string().min(1).max(500), // Required reason for override
  notes: z.string().max(1000).optional(),
});

function json(body: any, init?: { status?: number; headers?: Record<string, string> }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    // Rate limiting
    const rateLimitCheck = rateLimitMiddleware(RATE_LIMITS.admin);
    const rateLimitResult = await rateLimitCheck(request as any);
    if (!rateLimitResult.allowed) {
      return json(rateLimitResult.body, {
        status: rateLimitResult.status,
        headers: { 'Retry-After': rateLimitResult.body.retryAfter.toString() },
      });
    }

    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = await requireAdmin(request);
    if (!admin.ok) {
      if (admin.response.status === 401) return json({ error: 'Unauthorized - Invalid token' }, { status: 401 });
      if (admin.response.status === 403) return json({ error: 'Forbidden - Admin access required' }, { status: 403 });
      return admin.response;
    }

    const adminId = admin.ctx.actorUid;
    const db = admin.ctx.db;

    const userId = params.userId;

    // Validate request body
    const body = await request.json();
    const validation = validateRequest(planOverrideSchema, body);
    if (!validation.success) {
      return json({ error: validation.error, details: validation.details?.errors }, { status: 400 });
    }

    const { planOverride, reason, notes } = validation.data;

    // Get user
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userDoc.data()!;
    const beforeState = {
      adminPlanOverride: userData?.adminPlanOverride || null,
      subscriptionPlan: userData?.subscriptionPlan || 'free',
      subscriptionTier: userData?.subscriptionTier || null,
    };

    // Update user with override
    const updateData: any = {
      updatedAt: Timestamp.now(),
    };

    if (planOverride === null) {
      updateData.adminPlanOverride = null;
      updateData.adminOverrideReason = null;
      updateData.adminOverrideBy = null;
      updateData.adminOverrideAt = null;
      // Do not force subscriptionTier here; webhook/subscription state will govern.
    } else if (planOverride) {
      const tier: SubscriptionTier = mapLegacyPlanToTier(planOverride);
      updateData.adminPlanOverride = planOverride;
      updateData.subscriptionTier = tier;
      updateData.subscriptionPlan = mapTierToLegacyPlanId(tier); // legacy field
      updateData.adminOverrideReason = reason;
      updateData.adminOverrideBy = adminId;
      updateData.adminOverrideAt = Timestamp.now();
    }

    await userRef.update(updateData);

    // Create audit log
    await createAuditLog(db, {
      actorUid: adminId,
      actorRole: 'admin',
      actionType: 'admin_plan_override',
      listingId: undefined,
      beforeState,
      afterState: {
        adminPlanOverride: updateData.adminPlanOverride ?? userData?.adminPlanOverride ?? null,
        subscriptionTier: updateData.subscriptionTier ?? userData?.subscriptionTier ?? null,
        subscriptionPlan: (updateData.subscriptionPlan ?? userData?.subscriptionPlan) || 'free',
      },
      metadata: {
        targetUserId: userId,
        planOverride,
        reason,
        notes: notes || undefined,
      },
      source: 'admin_ui',
    });

    logInfo('Admin plan override set', {
      route: '/api/admin/users/[userId]/plan-override',
      adminId,
      targetUserId: userId,
      planOverride,
    });

    return json({
      success: true,
      userId,
      planOverride: updateData.adminPlanOverride ?? null,
      message: 'Seller tier override updated successfully',
    });
  } catch (error: any) {
    logError('Error setting plan override', error, {
      route: '/api/admin/users/[userId]/plan-override',
    });
    captureException(error instanceof Error ? error : new Error(String(error)), {
      route: '/api/admin/users/[userId]/plan-override',
    });
    return json({ error: 'Failed to set plan override', message: error.message }, { status: 500 });
  }
}
