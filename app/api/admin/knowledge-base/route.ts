/**
 * GET /api/admin/knowledge-base
 * POST /api/admin/knowledge-base
 *
 * Admin-only: List and create knowledge base articles.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { requireAdmin, requireRateLimit, json } from '@/app/api/admin/_util';
import { KnowledgeBaseArticle, KBArticleAudience } from '@/lib/types';

const CreateSchema = z.object({
  slug: z.string().trim().min(1).max(200).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(50000),
  category: z.string().trim().min(1).max(100),
  audience: z.array(z.enum(['buyer', 'seller', 'all'])).min(1),
  tags: z.array(z.string().trim().max(50)).default([]),
  enabled: z.boolean().default(true),
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

export async function GET(request: Request) {
  const rl = await requireRateLimit(request);
  if (!rl.ok) return rl.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const { db } = admin.ctx;
  const url = new URL(request.url);
  const enabled = url.searchParams.get('enabled');
  const category = url.searchParams.get('category');
  const audience = url.searchParams.get('audience');

  try {
    let q: any = db.collection('knowledgeBaseArticles');

    if (enabled === 'true') {
      q = q.where('enabled', '==', true);
    } else if (enabled === 'false') {
      q = q.where('enabled', '==', false);
    }

    if (category) {
      q = q.where('category', '==', category);
    }

    if (audience && ['buyer', 'seller', 'all'].includes(audience)) {
      q = q.where('audience', 'array-contains', audience);
    }

    q = q.orderBy('updatedAt', 'desc');

    const snap = await q.get();
    const articles = snap.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        slug: data.slug || doc.id,
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
      };
    });

    return json({ ok: true, articles }, { status: 200 });
  } catch (e: any) {
    console.error('Failed to fetch KB articles:', e);
    return json({ ok: false, error: 'Failed to fetch articles', message: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const rl = await requireRateLimit(request);
  if (!rl.ok) return rl.response;

  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const { db, actorUid } = admin.ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: 'Validation error', details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    // Check if slug already exists
    const existingSnap = await db.collection('knowledgeBaseArticles').where('slug', '==', parsed.data.slug).limit(1).get();
    if (!existingSnap.empty) {
      return json({ ok: false, error: 'Slug already exists', code: 'SLUG_EXISTS' }, { status: 409 });
    }

    const now = Timestamp.now();
    const docRef = db.collection('knowledgeBaseArticles').doc(parsed.data.slug);

    await docRef.set({
      slug: parsed.data.slug,
      title: parsed.data.title,
      content: parsed.data.content,
      category: parsed.data.category,
      audience: parsed.data.audience,
      tags: parsed.data.tags || [],
      enabled: parsed.data.enabled !== false,
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: actorUid,
      updatedBy: actorUid,
    });

    return json({ ok: true, articleId: docRef.id }, { status: 201 });
  } catch (e: any) {
    console.error('Failed to create KB article:', e);
    return json({ ok: false, error: 'Failed to create article', message: e?.message || String(e) }, { status: 500 });
  }
}
