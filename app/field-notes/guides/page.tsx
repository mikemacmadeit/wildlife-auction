import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { getFieldNotesIndex, toUrlSlug } from '@/lib/content/field-notes';

export const metadata: Metadata = {
  title: 'Guides | Field Notes | Wildlife Exchange',
  description:
    'Guides on payments, compliance, delivery/pickup, and how to buy/sell with confidence on Wildlife Exchange.',
  alternates: { canonical: '/field-notes/guides' },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default async function FieldNotesGuidesPage() {
  const posts = await getFieldNotesIndex();
  const guides = posts.filter((p) => (p.category || '').toLowerCase() === 'guides' || (p.tags || []).some((t) => toUrlSlug(t) === 'guides'));

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 md:px-6 py-10 space-y-6">
        <Link href="/field-notes" className="text-sm font-semibold text-primary hover:underline underline-offset-4">
          ← Back to Field Notes
        </Link>

        <div className="rounded-2xl border bg-card p-6 md:p-10 overflow-hidden relative">
          <div className="pointer-events-none absolute inset-0 opacity-[0.35] [background:radial-gradient(80%_60%_at_20%_0%,hsl(var(--primary)/.18)_0%,transparent_60%),radial-gradient(60%_60%_at_80%_10%,hsl(var(--accent)/.16)_0%,transparent_55%)]" />
          <div className="relative space-y-3">
            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Field Notes</div>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight font-founders">Guides</h1>
            <p className="text-sm md:text-base text-muted-foreground max-w-2xl">
              Practical guides on payments, compliance, delivery/pickup, and trust-first buying and selling.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Badge variant="secondary">Payments</Badge>
              <Badge variant="secondary">Compliance</Badge>
              <Badge variant="secondary">Delivery / pickup</Badge>
              <Badge variant="secondary">Buy & sell</Badge>
            </div>
          </div>
        </div>

        {guides.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            No guide posts yet.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {guides.map((p) => (
              <Link key={p.slug} href={`/field-notes/${p.slug}`} className="group">
                <Card className="h-full border-2 transition-colors group-hover:border-primary/40">
                  <CardContent className="p-4 space-y-3">
                    <div className="aspect-[16/9] w-full rounded-xl bg-muted overflow-hidden relative">
                      {p.coverImage ? (
                        <Image src={p.coverImage} alt="" fill className="object-cover transition-transform group-hover:scale-[1.03]" />
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">Guides</Badge>
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
        )}
      </div>
    </div>
  );
}

