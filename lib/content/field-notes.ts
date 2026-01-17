import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import readingTime from 'reading-time';
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

export type FieldNoteFrontmatter = {
  title: string;
  description: string;
  date: string; // ISO string
  author?: string;
  tags?: string[];
  category?: string;
  coverImage?: string; // public URL
  featured?: boolean;
  editorPick?: boolean;
};

export type FieldNoteIndexItem = FieldNoteFrontmatter & {
  slug: string;
  readingMinutes: number;
};

export type FieldNotePost = FieldNoteIndexItem & {
  html: string;
};

const CONTENT_DIR = path.join(process.cwd(), 'content', 'field-notes');

function assertFrontmatter(slug: string, data: any): FieldNoteFrontmatter {
  const title = String(data?.title || '').trim();
  const description = String(data?.description || '').trim();
  const date = String(data?.date || '').trim();
  if (!title || !description || !date) {
    throw new Error(`Invalid frontmatter for ${slug}.md: title, description, date are required.`);
  }
  const tags = Array.isArray(data?.tags) ? data.tags.map((t: any) => String(t)) : undefined;
  const category = data?.category ? String(data.category) : undefined;
  const author = data?.author ? String(data.author) : undefined;
  const coverImage = data?.coverImage ? String(data.coverImage) : undefined;
  const featured = data?.featured === true;
  const editorPick = data?.editorPick === true;
  return { title, description, date, tags, category, author, coverImage, featured, editorPick };
}

export function toUrlSlug(input: string): string {
  const s = String(input || '').trim().toLowerCase();
  return s
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function getFieldNotesAuthors(): Promise<Array<{ slug: string; name: string; count: number }>> {
  const posts = await getFieldNotesIndex();
  const map = new Map<string, { slug: string; name: string; count: number }>();
  for (const p of posts) {
    const name = (p.author || '').trim();
    if (!name) continue;
    const slug = toUrlSlug(name);
    const prev = map.get(slug);
    if (!prev) map.set(slug, { slug, name, count: 1 });
    else prev.count += 1;
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function getFieldNotesByAuthorSlug(authorSlug: string): Promise<FieldNoteIndexItem[]> {
  const posts = await getFieldNotesIndex();
  return posts.filter((p) => p.author && toUrlSlug(p.author) === authorSlug);
}

export async function getFieldNotesTags(): Promise<Array<{ slug: string; tag: string; count: number }>> {
  const posts = await getFieldNotesIndex();
  const map = new Map<string, { slug: string; tag: string; count: number }>();
  for (const p of posts) {
    for (const t of p.tags || []) {
      const tag = String(t).trim();
      if (!tag) continue;
      const slug = toUrlSlug(tag);
      const prev = map.get(slug);
      if (!prev) map.set(slug, { slug, tag, count: 1 });
      else prev.count += 1;
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export async function getFieldNotesByTagSlug(tagSlug: string): Promise<FieldNoteIndexItem[]> {
  const posts = await getFieldNotesIndex();
  return posts.filter((p) => (p.tags || []).some((t) => toUrlSlug(t) === tagSlug));
}

export async function pickFeaturedAndEditorPicks(posts: FieldNoteIndexItem[]): Promise<{
  featured: FieldNoteIndexItem | null;
  editorPicks: FieldNoteIndexItem[];
}> {
  const featured = posts.find((p) => p.featured === true) || posts[0] || null;
  const explicitPicks = posts.filter((p) => p.editorPick === true && p.slug !== featured?.slug);
  const fallbackPicks = posts.filter((p) => p.slug !== featured?.slug).slice(0, 3);
  const editorPicks = explicitPicks.length ? explicitPicks.slice(0, 3) : fallbackPicks;
  return { featured, editorPicks };
}

async function listMarkdownFiles(): Promise<string[]> {
  const entries = await fs.readdir(CONTENT_DIR).catch(() => []);
  return entries
    .filter((f) => (f.endsWith('.md') || f.endsWith('.mdx')) && f.toLowerCase() !== 'readme.md')
    .sort();
}

export async function getFieldNotesIndex(): Promise<FieldNoteIndexItem[]> {
  const files = await listMarkdownFiles();
  const items: FieldNoteIndexItem[] = [];

  for (const file of files) {
    const slug = file.replace(/\.mdx?$/, '');
    const full = path.join(CONTENT_DIR, file);
    const raw = await fs.readFile(full, 'utf8');
    const parsed = matter(raw);
    const fm = assertFrontmatter(slug, parsed.data);
    const rt = readingTime(parsed.content || '');
    items.push({
      slug,
      ...fm,
      readingMinutes: Math.max(1, Math.round(rt.minutes)),
    });
  }

  // Newest first by date
  items.sort((a, b) => (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0));
  return items;
}

export async function getFieldNoteBySlug(slug: string): Promise<FieldNotePost | null> {
  const candidates = [path.join(CONTENT_DIR, `${slug}.md`), path.join(CONTENT_DIR, `${slug}.mdx`)];
  let raw: string | null = null;
  for (const c of candidates) {
    try {
      raw = await fs.readFile(c, 'utf8');
      break;
    } catch {}
  }
  if (!raw) return null;

  const parsed = matter(raw);
  const fm = assertFrontmatter(slug, parsed.data);
  const rt = readingTime(parsed.content || '');

  // SECURITY: We intentionally do NOT allow raw HTML passthrough from markdown.
  // This prevents XSS via inline HTML in content files. We also run a conservative sanitizer.
  const processed = await remark()
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSanitize, {
      ...defaultSchema,
      // Allow common class-based styling (Tailwind prose classes, etc.)
      attributes: {
        ...(defaultSchema.attributes || {}),
        '*': [...((defaultSchema.attributes as any)?.['*'] || []), 'className', 'class'],
        a: [...((defaultSchema.attributes as any)?.a || []), 'target', 'rel'],
      },
    })
    .use(rehypeStringify)
    .process(parsed.content || '');

  const html = String(processed);

  return {
    slug,
    ...fm,
    readingMinutes: Math.max(1, Math.round(rt.minutes)),
    html,
  };
}

