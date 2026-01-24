'use client';

import Link from 'next/link';
import { SafeImage } from '@/components/shared/SafeImage';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { FieldNoteIndexItem } from '@/lib/content/field-notes';

type SortKey = 'newest' | 'oldest' | 'reading_time';

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function FieldNotesIndexClient(props: { posts: FieldNoteIndexItem[] }) {
  const { posts } = props;
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [category, setCategory] = useState<string>('all');

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of posts) if (p.category) set.add(p.category);
    return Array.from(set).sort();
  }, [posts]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = posts.slice();

    if (category !== 'all') list = list.filter((p) => (p.category || '').toLowerCase() === category.toLowerCase());
    if (needle) {
      list = list.filter((p) => {
        const hay = `${p.title} ${p.description} ${(p.tags || []).join(' ')}`.toLowerCase();
        return hay.includes(needle);
      });
    }

    list.sort((a, b) => {
      if (sort === 'reading_time') return (a.readingMinutes || 0) - (b.readingMinutes || 0);
      const at = new Date(a.date).getTime() || 0;
      const bt = new Date(b.date).getTime() || 0;
      return sort === 'newest' ? bt - at : at - bt;
    });

    return list;
  }, [category, posts, q, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search Field Notes…"
            className="sm:min-w-[320px]"
          />
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="sm:min-w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="md:min-w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Sort: Newest</SelectItem>
            <SelectItem value="oldest">Sort: Oldest</SelectItem>
            <SelectItem value="reading_time">Sort: Short reads</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          No posts match your filters.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Link key={p.slug} href={`/field-notes/${p.slug}`} className="group">
              <Card className="h-full border-2 transition-all group-hover:border-primary/40 group-hover:shadow-2xl group-hover:shadow-primary/10">
                <CardContent className="p-4 space-y-3">
                  <div className="aspect-[16/9] w-full rounded-xl bg-muted overflow-hidden relative">
                    {p.coverImage ? (
                      <SafeImage src={p.coverImage} alt="" fill className="object-cover transition-transform group-hover:scale-[1.03]" />
                    ) : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
                    <div className="absolute left-3 right-3 bottom-3 flex flex-wrap items-center gap-2">
                      {p.featured ? (
                        <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white font-semibold">
                          Featured
                        </span>
                      ) : null}
                      {p.editorPick ? (
                        <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white font-semibold">
                          Editor Pick
                        </span>
                      ) : null}
                      {p.category ? (
                        <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white font-semibold">
                          {p.category}
                        </span>
                      ) : null}
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white font-semibold">
                        {p.readingMinutes} min
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{formatDate(p.date)}</Badge>
                    {p.author ? <Badge variant="secondary">{p.author}</Badge> : null}
                  </div>

                  <div className="space-y-1">
                    <div className="font-extrabold tracking-tight text-lg leading-snug group-hover:underline underline-offset-4">
                      {p.title}
                    </div>
                    <div className="text-sm text-muted-foreground line-clamp-3">{p.description}</div>
                  </div>

                  {p.tags?.length ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {p.tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-xs text-muted-foreground">
                          #{t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

