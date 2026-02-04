/**
 * GET /api/admin/listing-moderation-config
 * PATCH /api/admin/listing-moderation-config
 *
 * Admin-only: read/update AI listing moderation config (adminConfig/listingModeration).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireAdmin, json } from '@/app/api/admin/_util';
import { getListingModerationConfig, DEFAULT_CONFIG } from '@/lib/compliance/aiModeration/config';

const patchSchema = z.object({
  aiAutoApproveEnabled: z.boolean().optional(),
  minTextConfidence: z.number().min(0).max(1).optional(),
  maxRiskScore: z.number().min(0).max(1).optional(),
  allowFactorOverride: z.boolean().optional(),
  disallowedFlags: z.array(z.string()).optional(),
  manualOnlyCategories: z.array(z.string()).optional(),
  manualOnlySellerUnverified: z.boolean().optional(),
});

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  try {
    const config = await getListingModerationConfig(admin.ctx.db as any);
    return json({
      ok: true,
      config: {
        aiAutoApproveEnabled: config.aiAutoApproveEnabled,
        minTextConfidence: config.minTextConfidence,
        maxRiskScore: config.maxRiskScore,
        allowFactorOverride: config.allowFactorOverride,
        disallowedFlags: config.disallowedFlags,
        manualOnlyCategories: config.manualOnlyCategories,
        manualOnlySellerUnverified: config.manualOnlySellerUnverified,
        policyVersion: config.policyVersion,
        updatedAt: config.updatedAt?.toMillis?.() ?? null,
        updatedBy: config.updatedBy,
      },
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? 'Failed to load config' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
  }

  const updates = parsed.data;
  const ref = admin.ctx.db.collection('adminConfig').doc('listingModeration');

  try {
    const existing = await ref.get();
    const current = existing.exists ? (existing.data() as any) : {};

    const next = {
      ...current,
      ...updates,
      policyVersion: current.policyVersion ?? DEFAULT_CONFIG.policyVersion,
      updatedAt: Timestamp.now(),
      updatedBy: admin.ctx.actorUid,
    };

    await ref.set(next, { merge: true });
    return json({
      ok: true,
      config: {
        aiAutoApproveEnabled: next.aiAutoApproveEnabled ?? DEFAULT_CONFIG.aiAutoApproveEnabled,
        minTextConfidence: next.minTextConfidence ?? DEFAULT_CONFIG.minTextConfidence,
        maxRiskScore: next.maxRiskScore ?? DEFAULT_CONFIG.maxRiskScore,
        allowFactorOverride: next.allowFactorOverride !== false,
        disallowedFlags: next.disallowedFlags ?? DEFAULT_CONFIG.disallowedFlags,
        manualOnlyCategories: next.manualOnlyCategories ?? DEFAULT_CONFIG.manualOnlyCategories,
        manualOnlySellerUnverified: next.manualOnlySellerUnverified ?? DEFAULT_CONFIG.manualOnlySellerUnverified,
        policyVersion: next.policyVersion,
        updatedAt: next.updatedAt?.toMillis?.() ?? Date.now(),
        updatedBy: next.updatedBy,
      },
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? 'Failed to update config' }, { status: 500 });
  }
}
