import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { getFieldNotesTags, getFieldNotesByTagSlug } from '@/lib/content/field-notes';

export async function generateStaticParams() {
  const tags = await getFieldNotesTags();
  return tags.map((t) => ({ tag: t.slug }));
}

export async function generateMetadata({ params }: { params: { tag: string } }): Promise<Metadata> {
  const posts = await getFieldNotesByTagSlug(params.tag);
  const label = posts.length ? (posts.find((p) => (p.tags || []).some(() => true))?.tags || [])[0] : params.tag;
  return {
    title: `#${label || params.tag} | Field Notes | Wildlife Exchange`,
    description: `Posts tagged #${label || params.tag} on Wildlife Exchange Field Notes.`,
    alternates: { canonical: `/field-notes/tags/${params.tag}` },
  };
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default async function FieldNotesTagPage({ params }: { params: { tag: string } }) {
  const posts = await getFieldNotesByTagSlug(params.tag);

  if (!posts.length) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 md:px-6 py-10 space-y-6">
          <Link href="/field-notes/tags" className="text-sm font-semibold text-primary hover:underline underline-offset-4">
            ← Back to Tags
          </Link>
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            Tag not found.
          </div>
        </div>
      </div>
    );
  }

  // Use the first matching tag label from content (preserves capitalization)
  const tagLabel =
    posts.flatMap((p) => p.tags || []).find((t) => t && String(t).trim()) || params.tag;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 md:px-6 py-10 space-y-6">
        <Link href="/field-notes/tags" className="text-sm font-semibold text-primary hover:underline underline-offset-4">
          ← Back to Tags
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight font-founders">#{tagLabel}</h1>
            <p className="text-sm text-muted-foreground">Field Notes posts tagged “{tagLabel}”.</p>
          </div>
          <Badge variant="secondary">{posts.length} posts</Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((p) => (
            <Link key={p.slug} href={`/field-notes/${p.slug}`} className="group">
              <Card className="h-full border-2 transition-colors group-hover:border-primary/40">
                <CardContent className="p-4 space-y-3">
                  <div className="aspect-[16/9] w-full rounded-xl bg-muted overflow-hidden relative">
                    {p.coverImage ? (
                      <Image src={p.coverImage} alt="" fill className="object-cover transition-transform group-hover:scale-[1.03]" />
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {p.category ? <Badge variant="secondary">{p.category}</Badge> : null}
                    <Badge variant="outline">{formatDate(p.date)}</Badge>
                    <Badge variant="outline">{p.readingMinutes} min</Badge>
                  </div>
                  <div className="space-y-1">
                    <div className="font-extrabold tracking-tight text-lg leading-snug">{p.title}</div>
                    <div className="text-sm text-muted-foreground line-clamp-3">{p.description}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

