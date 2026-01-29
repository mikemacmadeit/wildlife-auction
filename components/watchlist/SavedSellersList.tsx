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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Filter, Grid3x3, List as ListIcon, Loader2, MessageCircle, Search, Star, Store, Trash2 } from 'lucide-react';
import { unfollowSeller } from '@/lib/firebase/following';

type SortKey = 'recent' | 'highest_rated' | 'most_sales';
type ViewMode = 'grid' | 'list';

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

interface SellerCardProps {
  s: SavedSellerDoc;
  activeCount: number | null | undefined;
  removing: boolean;
  messaging: boolean;
  onRemove: (sellerId: string) => void;
  onMessage: (sellerId: string) => void;
}

function SellerListCard({ s, activeCount, removing, messaging, onRemove, onMessage }: SellerCardProps) {
  const usernameLabel = s.sellerUsername ? `${s.sellerUsername}` : `${s.sellerId.slice(0, 8)}`;
  const hasRating = s.ratingCount > 0;
  const ratingLabel = hasRating ? s.ratingAverage.toFixed(1) : '—';
  const positiveLabel = s.itemsSold > 0 && s.positivePercent > 0 ? `${Math.round(s.positivePercent)}%` : '—';
  const shopHref = `/sellers/${s.sellerId}`;

  return (
    <Card className="border overflow-hidden rounded-xl w-full">
      <CardContent className="p-3 md:p-4 w-full">
        {/* Mobile: full-width layout — row1: avatar | name+stats (flex) | remove; row2: View store | Message (full width) */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4 w-full">
          <div className="flex items-center gap-3 min-w-0 flex-1 w-full md:w-auto pr-10 md:pr-0">
            <div className="relative h-11 w-11 md:h-12 md:w-12 rounded-full overflow-hidden bg-muted shrink-0 border">
              {s.sellerPhotoURL ? (
                <Image src={s.sellerPhotoURL} alt="" fill className="object-cover" sizes="48px" unoptimized />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xs md:text-sm font-extrabold text-muted-foreground">
                  {String(s.sellerDisplayName || 'S').trim().charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 flex flex-col justify-center">
              <div className="font-semibold md:font-extrabold text-sm md:text-base truncate">{s.sellerDisplayName}</div>
              <div className="text-xs text-muted-foreground truncate">{usernameLabel}</div>
              <div className="mt-0.5 md:mt-2 flex items-center gap-1.5 md:gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground inline-flex items-center gap-0.5">
                  <Star className="h-3 w-3" />
                  {ratingLabel}
                </span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">Sold {s.itemsSold || 0}</span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">Active {activeCount ?? 0}</span>
              </div>
            </div>
          </div>
          {/* Remove: top-right on mobile, inline on desktop */}
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 md:relative md:top-0 md:right-0 h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            disabled={removing}
            onClick={() => onRemove(s.sellerId)}
            aria-label="Remove seller"
          >
            {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
          {/* Actions: full-width row on mobile (2 cols), inline on desktop */}
          <div className="grid grid-cols-2 gap-2 w-full md:w-auto md:flex md:items-center md:gap-2 md:shrink-0">
            <Button asChild variant="outline" size="sm" className="h-9 w-full text-xs md:min-h-[40px] md:px-3 md:text-sm md:w-auto border-primary text-primary hover:bg-primary/10 hover:text-primary">
              <Link href={shopHref} className="flex items-center justify-center"><Store className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2 shrink-0" />View store</Link>
            </Button>
            <Button
              size="sm"
              className="h-9 w-full text-xs md:min-h-[40px] md:px-3 md:text-sm md:w-auto"
              disabled={messaging || (typeof activeCount === 'number' && activeCount <= 0)}
              onClick={() => onMessage(s.sellerId)}
            >
              {messaging ? <Loader2 className="h-3.5 w-3.5 md:h-4 md:w-4 animate-spin mr-1.5 md:mr-2 shrink-0" /> : <MessageCircle className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2 shrink-0" />}
              Message
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SellerGridCard({ s, activeCount, removing, messaging, onRemove, onMessage }: SellerCardProps) {
  const usernameLabel = s.sellerUsername ? `${s.sellerUsername}` : `${s.sellerId.slice(0, 8)}`;
  const hasRating = s.ratingCount > 0;
  const ratingLabel = hasRating ? s.ratingAverage.toFixed(1) : '—';
  const shopHref = `/sellers/${s.sellerId}`;

  return (
    <Card className="border h-full flex flex-col overflow-hidden rounded-xl">
      <CardContent className="p-3 flex flex-col flex-1 md:p-4">
        {/* Remove button in corner — mobile and desktop */}
        <div className="absolute top-2 right-2 z-10">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            disabled={removing}
            onClick={(e) => {
              e.preventDefault();
              onRemove(s.sellerId);
            }}
            aria-label="Remove seller"
          >
            {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <div className="flex flex-col items-center text-center mb-2 md:mb-3">
          <div className="relative h-12 w-12 md:h-16 md:w-16 rounded-full overflow-hidden bg-muted shrink-0 border mb-1.5 md:mb-2">
            {s.sellerPhotoURL ? (
              <Image src={s.sellerPhotoURL} alt="" fill className="object-cover" sizes="64px" unoptimized />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-sm md:text-xl font-extrabold text-muted-foreground">
                {String(s.sellerDisplayName || 'S').trim().charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="font-semibold md:font-extrabold text-sm md:text-base truncate w-full">{s.sellerDisplayName}</div>
          <div className="text-[11px] md:text-xs text-muted-foreground truncate w-full">{usernameLabel}</div>
          <div className="mt-1 md:mt-1.5 flex items-center justify-center gap-1 flex-wrap text-[11px] md:text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-0.5"><Star className="h-2.5 w-2.5 md:h-3 md:w-3" />{ratingLabel}</span>
            <span>·</span>
            <span>Sold {s.itemsSold || 0}</span>
            <span>·</span>
            <span>Active {activeCount ?? 0}</span>
          </div>
        </div>
        <div className="mt-auto flex flex-row gap-1.5 md:gap-2">
          <Button asChild variant="outline" size="sm" className="flex-1 min-w-0 h-8 text-xs md:h-9 md:text-sm border-primary text-primary hover:bg-primary/10 hover:text-primary">
            <Link href={shopHref} className="flex items-center justify-center"><Store className="h-3 w-3 md:h-3.5 md:w-3.5 mr-1 shrink-0" />View store</Link>
          </Button>
          <Button
            size="sm"
            className="flex-1 min-w-0 h-8 text-xs md:h-9 md:text-sm"
            disabled={messaging || (typeof activeCount === 'number' && activeCount <= 0)}
            onClick={() => onMessage(s.sellerId)}
          >
            {messaging ? <Loader2 className="h-3 w-3 md:h-3.5 md:w-3.5 animate-spin mr-1 shrink-0" /> : <MessageCircle className="h-3 w-3 md:h-3.5 md:w-3.5 mr-1 shrink-0" />}
            Message
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function SavedSellersList(props: { className?: string }) {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [rows, setRows] = useState<SavedSellerDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [removing, setRemoving] = useState<string | null>(null);
  const [activeCountBySellerId, setActiveCountBySellerId] = useState<Record<string, number | null>>({});
  const [messagingSellerId, setMessagingSellerId] = useState<string | null>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

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

  const handleMessage = async (sellerId: string) => {
    if (!user?.uid) return;
    try {
      setMessagingSellerId(sellerId);
      const listingsRef = collection(db, 'listings');
      const q = query(listingsRef, where('sellerId', '==', sellerId), where('status', '==', 'active'), limit(1));
      const snap = await getDocs(q);
      const listingId = snap.docs[0]?.id;
      if (!listingId) {
        toast({ title: 'No active listings', description: 'This seller has no active listings to message about yet.' });
        return;
      }
      router.push(`/dashboard/messages?listingId=${listingId}&sellerId=${sellerId}`);
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to start a message', variant: 'destructive' });
    } finally {
      setMessagingSellerId(null);
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
      {/* Mobile: Filters / Lists / Search row – same pattern as saved listings tab */}
      <div className="md:hidden space-y-3">
        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full h-8 px-3 text-xs font-medium shrink-0"
              >
                <Filter className="h-3.5 w-3.5 mr-1" />
                Filters
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setSortKey('recent')}>
                Recently saved
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSortKey('highest_rated')}>
                Highest rated
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSortKey('most_sales')}>
                Most sales
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {rows.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full h-8 px-3 text-xs font-medium shrink-0"
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            >
              <ListIcon className="h-3.5 w-3.5 mr-1" />
              {viewMode === 'list' ? 'List' : 'Grid'}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            className="rounded-full h-8 w-8 shrink-0"
            onClick={() => setMobileSearchOpen((o) => !o)}
            aria-label="Search saved sellers"
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>
        {mobileSearchOpen && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search sellers…"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              className="pl-10 rounded-full"
              autoFocus
            />
          </div>
        )}
      </div>

      {/* Desktop: Card header with title, search, sort, view */}
      <Card className="border-2 border-border/50 bg-card hidden md:block">
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
              {rows.length > 0 && (
                <div className="flex gap-2">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('grid')}
                    aria-label="Gallery view"
                  >
                    <Grid3x3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('list')}
                    aria-label="List view"
                  >
                    <ListIcon className="h-4 w-4" />
                  </Button>
                </div>
              )}
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
      ) : viewMode === 'list' ? (
        <div className="space-y-2 md:space-y-3">
          {filtered.map((s) => (
            <SellerListCard
              key={s.sellerId}
              s={s}
              activeCount={activeCountBySellerId[s.sellerId]}
              removing={removing === s.sellerId}
              messaging={messagingSellerId === s.sellerId}
              onRemove={onRemove}
              onMessage={handleMessage}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {filtered.map((s) => (
            <SellerGridCard
              key={s.sellerId}
              s={s}
              activeCount={activeCountBySellerId[s.sellerId]}
              removing={removing === s.sellerId}
              messaging={messagingSellerId === s.sellerId}
              onRemove={onRemove}
              onMessage={handleMessage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

