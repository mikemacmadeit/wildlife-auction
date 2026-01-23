'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { collection, getCountFromServer, getDocs, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import type { SavedSellerDoc } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Loader2, MessageCircle, Search, Star, Store, Trash2 } from 'lucide-react';
import { unfollowSeller } from '@/lib/firebase/following';

type SortKey = 'recent' | 'highest_rated' | 'most_sales';

function toDateSafe(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v?.toDate === 'function') {
    try {
      const d = v.toDate();
      return d instanceof Date ? d : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function SavedSellersList(props: { className?: string }) {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [rows, setRows] = useState<SavedSellerDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [removing, setRemoving] = useState<string | null>(null);
  const [activeCountBySellerId, setActiveCountBySellerId] = useState<Record<string, number | null>>({});
  const [messagingSellerId, setMessagingSellerId] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.uid) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = collection(db, 'users', user.uid, 'following');
    const q = query(ref, orderBy('followedAt', 'desc'), limit(200));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const out: SavedSellerDoc[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          out.push({
            sellerId: String(data.sellerId || d.id),
            followedAt: toDateSafe(data.followedAt) || new Date(0),
            sellerUsername: String(data.sellerUsername || '').trim(),
            sellerDisplayName: String(data.sellerDisplayName || 'Seller').trim(),
            sellerPhotoURL: data.sellerPhotoURL ? String(data.sellerPhotoURL) : undefined,
            ratingAverage: Number(data.ratingAverage || 0) || 0,
            ratingCount: Number(data.ratingCount || 0) || 0,
            positivePercent: Number(data.positivePercent || 0) || 0,
            itemsSold: Number(data.itemsSold || 0) || 0,
          });
        });
        setRows(out);
        setLoading(false);
      },
      () => {
        setRows([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [authLoading, user?.uid]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter((r) => {
        const name = r.sellerDisplayName.toLowerCase();
        const u = r.sellerUsername.toLowerCase();
        return name.includes(q) || (u && u.includes(q));
      });
    }

    const sorted = [...list].sort((a, b) => {
      if (sortKey === 'recent') return b.followedAt.getTime() - a.followedAt.getTime();
      if (sortKey === 'highest_rated') {
        if (b.ratingAverage !== a.ratingAverage) return b.ratingAverage - a.ratingAverage;
        return (b.ratingCount || 0) - (a.ratingCount || 0);
      }
      return (b.itemsSold || 0) - (a.itemsSold || 0);
    });
    return sorted;
  }, [rows, queryText, sortKey]);

  // Best-effort active listings count per seller (powers UI + messaging affordance).
  useEffect(() => {
    if (!user?.uid) return;
    if (!filtered.length) return;

    const sellerIds = filtered.slice(0, 50).map((r) => r.sellerId);
    const missing = sellerIds.filter((id) => !(id in activeCountBySellerId));
    if (missing.length === 0) return;

    // Mark missing as "loading"
    setActiveCountBySellerId((prev) => {
      const next = { ...prev };
      for (const id of missing) next[id] = null;
      return next;
    });

    let cancelled = false;
    (async () => {
      const updates: Record<string, number> = {};
      await Promise.all(
        missing.map(async (sellerId) => {
          try {
            const listingsRef = collection(db, 'listings');
            const q = query(listingsRef, where('sellerId', '==', sellerId), where('status', '==', 'active'));
            const snap = await getCountFromServer(q);
            updates[sellerId] = Number(snap.data().count || 0);
          } catch {
            updates[sellerId] = 0;
          }
        })
      );
      if (cancelled) return;
      setActiveCountBySellerId((prev) => ({ ...prev, ...updates }));
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCountBySellerId, filtered, user?.uid]);

  const onRemove = async (sellerId: string) => {
    if (!user?.uid) return;
    setRemoving(sellerId);
    // optimistic
    const prev = rows;
    setRows((r) => r.filter((x) => x.sellerId !== sellerId));
    try {
      await unfollowSeller(sellerId);
      toast({ title: 'Removed', description: 'Seller removed from your saved sellers.' });
    } catch (e: any) {
      setRows(prev);
      toast({ title: 'Remove failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setRemoving(null);
    }
  };

  if (authLoading) {
    return (
      <div className={cn('min-h-[200px] flex items-center justify-center', props.className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <Card className={cn('border-2', props.className)}>
        <CardContent className="py-10 text-center space-y-3">
          <div className="text-lg font-extrabold">Sign in required</div>
          <p className="text-sm text-muted-foreground">Sign in to manage your saved sellers.</p>
          <Button asChild className="min-h-[44px] font-semibold">
            <Link href="/login">Go to login</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-4', props.className)}>
      <Card className="border-2 border-border/50 bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-lg font-extrabold">Saved sellers</CardTitle>
              <div className="text-sm text-muted-foreground">{rows.length} saved</div>
            </div>
            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              <div className="relative w-full sm:w-[320px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  placeholder="Search sellers…"
                  className="pl-9"
                />
              </div>
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger className="min-w-[200px]">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Sort: Recently saved</SelectItem>
                  <SelectItem value="highest_rated">Sort: Highest rated</SelectItem>
                  <SelectItem value="most_sales">Sort: Most sales</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      {loading ? (
        <div className="py-10 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-2">
          <CardContent className="py-10 text-center space-y-2">
            <div className="text-lg font-extrabold">No saved sellers</div>
            <div className="text-sm text-muted-foreground">
              Save a seller from any listing page to see them here.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const usernameLabel = s.sellerUsername ? `${s.sellerUsername}` : `${s.sellerId.slice(0, 8)}`;
            const hasRating = s.ratingCount > 0;
            const ratingLabel = hasRating ? s.ratingAverage.toFixed(1) : '—';
            const positiveLabel = s.itemsSold > 0 && s.positivePercent > 0 ? `${Math.round(s.positivePercent)}%` : '—';
            const shopHref = `/sellers/${s.sellerId}`;
            const activeCount = activeCountBySellerId[s.sellerId];

            return (
              <Card key={s.sellerId} className="border-2">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="relative h-12 w-12 rounded-full overflow-hidden bg-muted shrink-0 border">
                        {s.sellerPhotoURL ? (
                          <Image src={s.sellerPhotoURL} alt="" fill className="object-cover" sizes="48px" unoptimized />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-sm font-extrabold text-muted-foreground">
                            {String(s.sellerDisplayName || 'S').trim().charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="font-extrabold truncate">{s.sellerDisplayName}</div>
                        <div className="text-xs text-muted-foreground truncate">{usernameLabel}</div>

                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs inline-flex items-center gap-1">
                            <Star className="h-3.5 w-3.5" />
                            {ratingLabel}
                            <span className="text-muted-foreground">({s.ratingCount || 0})</span>
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Positive {positiveLabel}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Sold {s.itemsSold || 0}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            Active {activeCount === null ? '…' : activeCount ?? 0}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 justify-end flex-wrap">
                      <Button asChild variant="outline" className="min-h-[40px]">
                        <Link href={shopHref}>
                          <Store className="h-4 w-4 mr-2" />
                          View seller store
                        </Link>
                      </Button>
                      <Button
                        className="min-h-[40px]"
                        disabled={messagingSellerId === s.sellerId || (typeof activeCount === 'number' && activeCount <= 0)}
                        onClick={async () => {
                          if (!user?.uid) return;
                          try {
                            setMessagingSellerId(s.sellerId);
                            const listingsRef = collection(db, 'listings');
                            const q = query(listingsRef, where('sellerId', '==', s.sellerId), where('status', '==', 'active'), limit(1));
                            const snap = await getDocs(q);
                            const listingId = snap.docs[0]?.id;
                            if (!listingId) {
                              toast({ title: 'No active listings', description: 'This seller has no active listings to message about yet.' });
                              return;
                            }
                            router.push(`/dashboard/messages?listingId=${listingId}&sellerId=${s.sellerId}`);
                          } catch (e: any) {
                            toast({ title: 'Error', description: e?.message || 'Failed to start a message', variant: 'destructive' });
                          } finally {
                            setMessagingSellerId(null);
                          }
                        }}
                      >
                        {messagingSellerId === s.sellerId ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <MessageCircle className="h-4 w-4 mr-2" />
                        )}
                        Message seller
                      </Button>
                      <Button
                        variant="destructive"
                        className="min-h-[40px]"
                        disabled={removing === s.sellerId}
                        onClick={() => onRemove(s.sellerId)}
                      >
                        {removing === s.sellerId ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-2" />
                        )}
                        Remove
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

