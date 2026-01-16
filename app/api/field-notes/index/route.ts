import { getFieldNotesIndex, pickFeaturedAndEditorPicks } from '@/lib/content/field-notes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: any, init?: { status?: number }) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

export async function GET() {
  try {
    const posts = await getFieldNotesIndex();
    const { featured, editorPicks } = await pickFeaturedAndEditorPicks(posts);
    return json({ ok: true, posts, featured, editorPicks });
  } catch (e: any) {
    return json({ ok: false, error: 'Failed to load Field Notes', message: e?.message || 'Unknown error' }, { status: 500 });
  }
}

