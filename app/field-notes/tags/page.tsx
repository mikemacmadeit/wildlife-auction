import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getFieldNotesTags } from '@/lib/content/field-notes';

export const metadata: Metadata = {
  title: 'Tags | Field Notes | Agchange',
  description: 'Browse Field Notes posts by tag.',
  alternates: { canonical: '/field-notes/tags' },
};

export default async function FieldNotesTagsPage() {
  const tags = await getFieldNotesTags();

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 md:px-6 py-10 space-y-6">
        <div className="space-y-2">
          <Link href="/field-notes" className="text-sm font-semibold text-primary hover:underline underline-offset-4">
            ← Back to Field Notes
          </Link>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight font-founders">Tags</h1>
          <p className="text-sm text-muted-foreground">Browse posts by topic.</p>
        </div>

        {tags.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            No tags found yet.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tags.map((t) => (
              <Link key={t.slug} href={`/field-notes/tags/${t.slug}`} className="group">
                <Card className="h-full border-2 transition-colors group-hover:border-primary/40">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2">
                      <span className="truncate">#{t.tag}</span>
                      <Badge variant="secondary">{t.count}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    View posts tagged “{t.tag}”.
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

