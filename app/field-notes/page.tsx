import Link from 'next/link';
import { Metadata } from 'next';
import { getFieldNotesIndex } from '@/lib/content/field-notes';
import { FieldNotesIndexClient } from '@/components/content/FieldNotesIndexClient';
import { InlineEmailCapture } from '@/components/marketing/InlineEmailCapture';

export const metadata: Metadata = {
  title: 'Field Notes | Wildlife Exchange',
  description: 'Guides, insights, and trust-first education for high-ticket marketplace transactions on Wildlife Exchange.',
  openGraph: {
    title: 'Field Notes | Wildlife Exchange',
    description: 'Guides, insights, and trust-first education for high-ticket marketplace transactions on Wildlife Exchange.',
    type: 'website',
    url: '/field-notes',
  },
  alternates: {
    canonical: '/field-notes',
  },
};

export default async function FieldNotesIndexPage() {
  const posts = await getFieldNotesIndex();

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 md:px-6 py-10 space-y-8">
        <div className="rounded-2xl border bg-card p-6 md:p-10 overflow-hidden relative">
          <div className="pointer-events-none absolute inset-0 opacity-[0.35] [background:radial-gradient(80%_60%_at_20%_0%,hsl(var(--primary)/.18)_0%,transparent_60%),radial-gradient(60%_60%_at_80%_10%,hsl(var(--accent)/.16)_0%,transparent_55%)]" />
          <div className="relative space-y-3">
            <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Wildlife Exchange</div>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight font-founders">
              Field Notes
            </h1>
            <p className="text-sm md:text-base text-muted-foreground max-w-2xl">
              High-signal education on buying, selling, trust, compliance, and payments—written for real-world, high-ticket transactions.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Link
                href="/field-notes/guides"
                className="text-sm font-semibold text-primary hover:underline underline-offset-4"
              >
                Browse Guides →
              </Link>
              <Link
                href="/how-it-works"
                className="text-sm font-semibold text-primary hover:underline underline-offset-4"
              >
                New here? Start with How It Works →
              </Link>
            </div>
          </div>
        </div>

        <FieldNotesIndexClient posts={posts} />

        <InlineEmailCapture
          source="field_notes_index_inline"
          className="mt-8"
        />
      </div>
    </div>
  );
}

