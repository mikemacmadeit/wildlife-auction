/**
 * GET /api/admin/knowledge-base/[slug]
 * PUT /api/admin/knowledge-base/[slug]
 * DELETE /api/admin/knowledge-base/[slug]
 *
 * Admin-only: Get, update, or delete a knowledge base article.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';

const UpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().trim().min(1).max(50000).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  audience: z.array(z.enum(['buyer', 'seller', 'all'])).min(1).optional(),
  tags: z.array(z.string().trim().max(50)).optional(),
  enabled: z.boolean().optional(),
});

function toIsoSafe(v: any): string | null {
  try {
    if (!v) return null;
    if (typeof v === 'string') return v;
    if (typeof v?.toDate === 'function') {
      const d = v.toDate();
      return d instanceof Date ? d.toISOString() : null;
    }
    if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000).toISOString();
    if (v instanceof Date) return v.toISOString();
    return null;
  } catch {
    return null;
  }
}

export async function GET(request: Request, ctx: { params: { slug: string } }) {
  const rl = await requireRateLimit(request);
  if (!rl.ok) return rl.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const slug = String(ctx?.params?.slug || '').trim();
  if (!slug) return json({ ok: false, error: 'Missing slug' }, { status: 400 });

  const { db } = admin.ctx;

  try {
    // Try by slug first, then by ID
    let docRef = db.collection('knowledgeBaseArticles').doc(slug);
    let snap = await docRef.get();

    if (!snap.exists) {
      // Try finding by slug field
      const slugQuery = await db.collection('knowledgeBaseArticles').where('slug', '==', slug).limit(1).get();
      if (slugQuery.empty) {
        return json({ ok: false, error: 'Article not found' }, { status: 404 });
      }
      docRef = slugQuery.docs[0].ref;
      snap = await docRef.get();
    }

    const data = snap.data();
    if (!data) {
      return json({ ok: false, error: 'Article not found' }, { status: 404 });
    }

    return json({
      ok: true,
      article: {
        id: snap.id,
        slug: data.slug || snap.id,
        title: data.title || '',
        content: data.content || '',
        category: data.category || 'other',
        audience: Array.isArray(data.audience) ? data.audience : ['all'],
        tags: Array.isArray(data.tags) ? data.tags : [],
        enabled: data.enabled !== false,
        version: data.version || 1,
        createdAt: toIsoSafe(data.createdAt),
        updatedAt: toIsoSafe(data.updatedAt),
        createdBy: data.createdBy || null,
        updatedBy: data.updatedBy || null,
      },
    });
  } catch (e: any) {
    console.error(`Failed to fetch KB article ${slug}:`, e);
    return json({ ok: false, error: 'Failed to fetch article', message: e?.message || String(e) }, { status: 500 });
  }
}

export async function PUT(request: Request, ctx: { params: { slug: string } }) {
  const rl = await requireRateLimit(request);
  if (!rl.ok) return rl.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const slug = String(ctx?.params?.slug || '').trim();
  if (!slug) return json({ ok: false, error: 'Missing slug' }, { status: 400 });

  const { db, actorUid } = admin.ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: 'Validation error', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    // Find article by slug or ID
    let docRef = db.collection('knowledgeBaseArticles').doc(slug);
    let snap = await docRef.get();

    if (!snap.exists) {
      const slugQuery = await db.collection('knowledgeBaseArticles').where('slug', '==', slug).limit(1).get();
      if (slugQuery.empty) {
        return json({ ok: false, error: 'Article not found' }, { status: 404 });
      }
      docRef = slugQuery.docs[0].ref;
      snap = await docRef.get();
    }

    const existing = snap.data();
    if (!existing) {
      return json({ ok: false, error: 'Article not found' }, { status: 404 });
    }

    const updateData: any = {
      updatedAt: Timestamp.now(),
      updatedBy: actorUid,
    };

    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.content !== undefined) updateData.content = parsed.data.content;
    if (parsed.data.category !== undefined) updateData.category = parsed.data.category;
    if (parsed.data.audience !== undefined) updateData.audience = parsed.data.audience;
    if (parsed.data.tags !== undefined) updateData.tags = parsed.data.tags;
    if (parsed.data.enabled !== undefined) updateData.enabled = parsed.data.enabled;

    // Increment version if content changed
    if (parsed.data.content !== undefined && parsed.data.content !== existing.content) {
      updateData.version = (existing.version || 1) + 1;
    }

    await docRef.set(updateData, { merge: true });

    return json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error(`Failed to update KB article ${slug}:`, e);
    return json({ ok: false, error: 'Failed to update article', message: e?.message || String(e) }, { status: 500 });
  }
}

export async function DELETE(request: Request, ctx: { params: { slug: string } }) {
  const rl = await requireRateLimit(request);
  if (!rl.ok) return rl.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const slug = String(ctx?.params?.slug || '').trim();
  if (!slug) return json({ ok: false, error: 'Missing slug' }, { status: 400 });

  const { db } = admin.ctx;

  try {
    // Find article by slug or ID
    let docRef = db.collection('knowledgeBaseArticles').doc(slug);
    let snap = await docRef.get();

    if (!snap.exists) {
      const slugQuery = await db.collection('knowledgeBaseArticles').where('slug', '==', slug).limit(1).get();
      if (slugQuery.empty) {
        return json({ ok: false, error: 'Article not found' }, { status: 404 });
      }
      docRef = slugQuery.docs[0].ref;
    }

    await docRef.delete();

    return json({ ok: true }, { status: 200 });
  } catch (e: any) {
    console.error(`Failed to delete KB article ${slug}:`, e);
    return json({ ok: false, error: 'Failed to delete article', message: e?.message || String(e) }, { status: 500 });
  }
}
