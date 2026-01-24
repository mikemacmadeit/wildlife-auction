import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SafeImage } from '@/components/shared/SafeImage';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { getFieldNoteBySlug, getFieldNotesIndex, toUrlSlug } from '@/lib/content/field-notes';
import { InlineEmailCapture } from '@/components/marketing/InlineEmailCapture';

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export async function generateStaticParams() {
  const posts = await getFieldNotesIndex();
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const post = await getFieldNoteBySlug(params.slug);
  if (!post) return {};

  const title = `${post.title} | Field Notes | Wildlife Exchange`;
  return {
    title,
    description: post.description,
    openGraph: {
      title,
      description: post.description,
      type: 'article',
      url: `/field-notes/${post.slug}`,
      images: post.coverImage ? [{ url: post.coverImage }] : undefined,
    },
    alternates: {
      canonical: `/field-notes/${post.slug}`,
    },
  };
}

export default async function FieldNotePostPage({ params }: { params: { slug: string } }) {
  const post = await getFieldNoteBySlug(params.slug);
  if (!post) return notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: post.author ? { '@type': 'Person', name: post.author } : { '@type': 'Organization', name: 'Wildlife Exchange' },
    image: post.coverImage ? [post.coverImage] : undefined,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `/field-notes/${post.slug}`,
    },
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 md:px-6 py-10">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="space-y-3">
            <Link href="/field-notes" className="text-sm font-semibold text-primary hover:underline underline-offset-4">
              ← Back to Field Notes
            </Link>

            {/* Hero */}
            <div className="rounded-2xl border overflow-hidden bg-card">
              <div className="relative h-56 md:h-72 lg:h-80 bg-muted">
                {post.coverImage ? <SafeImage src={post.coverImage} alt="" fill className="object-cover" priority /> : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                <div className="absolute inset-0 p-5 md:p-7 flex flex-col justify-end">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    {post.category ? (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white font-semibold">
                        {post.category}
                      </span>
                    ) : null}
                    <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white font-semibold">
                      {formatDate(post.date)}
                    </span>
                    <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white font-semibold">
                      {post.readingMinutes} min read
                    </span>
                    {post.author ? (
                      <Link href={`/field-notes/authors/${toUrlSlug(post.author)}`}>
                        <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white font-semibold">
                          By {post.author}
                        </span>
                      </Link>
                    ) : null}
                  </div>
                  <h1 className="text-2xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-white font-founders leading-tight">
                    {post.title}
                  </h1>
                  <p className="text-sm md:text-base text-white/85 mt-2 max-w-3xl">
                    {post.description}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <article className="we-prose we-prose-article" dangerouslySetInnerHTML={{ __html: post.html }} />

          <Separator />

          {post.tags?.length ? (
            <div className="flex flex-wrap gap-2">
              {post.tags.map((t) => (
                <Link key={t} href={`/field-notes/tags/${toUrlSlug(t)}`}>
                  <Badge variant="outline">#{t}</Badge>
                </Link>
              ))}
            </div>
          ) : null}

          <InlineEmailCapture
            source={`field_notes_post_${post.slug}`}
            className="mt-6"
          />
        </div>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </div>
    </div>
  );
}

