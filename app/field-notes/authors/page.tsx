import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getFieldNotesAuthors } from '@/lib/content/field-notes';

export const metadata: Metadata = {
  title: 'Authors | Field Notes | Wildlife Exchange',
  description: 'Browse Field Notes posts by author.',
  alternates: { canonical: '/field-notes/authors' },
};

export default async function FieldNotesAuthorsPage() {
  const authors = await getFieldNotesAuthors();

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 md:px-6 py-10 space-y-6">
        <div className="space-y-2">
          <Link href="/field-notes" className="text-sm font-semibold text-primary hover:underline underline-offset-4">
            ← Back to Field Notes
          </Link>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight font-founders">Authors</h1>
          <p className="text-sm text-muted-foreground">Browse posts by the people writing Field Notes.</p>
        </div>

        {authors.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
            No authors found yet.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {authors.map((a) => (
              <Link key={a.slug} href={`/field-notes/authors/${a.slug}`} className="group">
                <Card className="h-full border-2 transition-colors group-hover:border-primary/40">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2">
                      <span className="truncate">{a.name}</span>
                      <Badge variant="secondary">{a.count}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    View posts by {a.name}.
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

