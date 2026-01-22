'use client';

import { useMemo, useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Shield, TrendingUp, Users, ArrowRight, Gavel, Zap, LayoutGrid, List, FileCheck, BookOpen } from 'lucide-react';
import { FeaturedListingCard } from '@/components/listings/FeaturedListingCard';
import { CreateListingGateButton } from '@/components/listings/CreateListingGate';
import { ListingCard } from '@/components/listings/ListingCard';
import { ListItem } from '@/components/listings/ListItem';
import { collection, getCountFromServer, onSnapshot, orderBy, query, where, limit as fsLimit, getDocs } from 'firebase/firestore';
import { listActiveListings, listEndingSoonAuctions, listMostWatchedListings, getListingsByIds, toListing } from '@/lib/firebase/listings';
import { db } from '@/lib/firebase/config';
import type { Listing, SavedSellerDoc } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useFavorites } from '@/hooks/use-favorites';
import { useRecentlyViewed } from '@/hooks/use-recently-viewed';

type ViewMode = 'card' | 'list';

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

export default function HomePage() {
  const { user } = useAuth();
  const { recentIds } = useRecentlyViewed();
  const { favoriteIds, isLoading: favoritesLoading } = useFavorites();

  const [listings, setListings] = useState<Listing[]>([]);
  const [mostWatched, setMostWatched] = useState<Listing[]>([]);
  const [endingSoon, setEndingSoon] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fieldNotesLoading, setFieldNotesLoading] = useState(true);
  const [fieldNotesFeatured, setFieldNotesFeatured] = useState<any | null>(null);
  const [fieldNotesPicks, setFieldNotesPicks] = useState<any[]>([]);

  // View mode with localStorage persistence
  // Initialize to 'card' to ensure server/client consistency
  const [viewMode, setViewMode] = useState<ViewMode>('card');

  // Personalized modules (signed-in home)
  const [recentlyViewedListings, setRecentlyViewedListings] = useState<Listing[]>([]);
  const [watchlistListings, setWatchlistListings] = useState<Listing[]>([]);
  const [savedSellers, setSavedSellers] = useState<SavedSellerDoc[]>([]);
  const [activeCountBySellerId, setActiveCountBySellerId] = useState<Record<string, number | null>>({});
  const [newFromSavedSellers, setNewFromSavedSellers] = useState<Listing[]>([]);

  // Load from localStorage after hydration (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('home-view-mode');
      if (saved === 'card' || saved === 'list') {
        setViewMode(saved);
      }
    }
  }, []);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('home-view-mode', mode);
    }
  };

  const ViewModeToggle = (props: { className?: string }) => {
    return (
      <div className={cn('flex items-center gap-2 border border-border rounded-lg p-1 bg-card', props.className)}>
        <Button
          variant={viewMode === 'card' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => handleViewModeChange('card')}
          className="h-8 px-3"
        >
          <LayoutGrid className="h-4 w-4 mr-2" />
          Gallery
        </Button>
        <Button
          variant={viewMode === 'list' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => handleViewModeChange('list')}
          className="h-8 px-3"
        >
          <List className="h-4 w-4 mr-2" />
          List
        </Button>
      </div>
    );
  };

  // Fetch listings from Firestore
  useEffect(() => {
    async function fetchListings() {
      try {
        setLoading(true);
        setError(null);
        const results = await Promise.allSettled([
          listActiveListings({ limitCount: 12 }),
          listMostWatchedListings({ limitCount: 8 }),
          listEndingSoonAuctions({ limitCount: 8 }),
        ]);

        const [dataRes, mwRes, esRes] = results;

        if (dataRes.status === 'fulfilled') setListings(dataRes.value);
        if (mwRes.status === 'fulfilled') {
          // Hide the section unless there is actual watch activity.
          const filtered = (mwRes.value || []).filter((l: any) => {
            const watchers = typeof l?.watcherCount === 'number' ? l.watcherCount : Number(l?.metrics?.favorites || 0);
            return watchers > 0;
          });
          setMostWatched(filtered);
        }
        if (esRes.status === 'fulfilled') setEndingSoon(esRes.value);

        // Only surface an error if the *primary* listings query failed.
        if (dataRes.status === 'rejected') {
          const err = dataRes.reason;
          console.error('Error fetching listings:', err);
          setError(err instanceof Error ? err.message : 'Failed to load listings');
        } else {
          // Non-blocking: log secondary section failures but keep page usable.
          if (mwRes.status === 'rejected') console.warn('Most watched unavailable:', mwRes.reason);
          if (esRes.status === 'rejected') console.warn('Ending soon unavailable:', esRes.reason);
        }
      } catch (err) {
        console.error('Error fetching listings:', err);
        setError(err instanceof Error ? err.message : 'Failed to load listings');
      } finally {
        setLoading(false);
      }
    }
    fetchListings();
  }, []);

  // Fetch Field Notes (Featured + Editor picks) from server (client page cannot read filesystem)
  useEffect(() => {
    let cancelled = false;
    async function fetchFieldNotes() {
      try {
        setFieldNotesLoading(true);
        const res = await fetch('/api/field-notes/index');
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) throw new Error(data?.error || 'Failed to load Field Notes');
        if (cancelled) return;
        setFieldNotesFeatured(data.featured || null);
        setFieldNotesPicks(Array.isArray(data.editorPicks) ? data.editorPicks : []);
      } catch {
        if (!cancelled) {
          setFieldNotesFeatured(null);
          setFieldNotesPicks([]);
        }
      } finally {
        if (!cancelled) setFieldNotesLoading(false);
      }
    }
    fetchFieldNotes();
    return () => {
      cancelled = true;
    };
  }, []);

  // Signed-in: Recently viewed listings
  useEffect(() => {
    if (!user?.uid) {
      setRecentlyViewedListings([]);
      return;
    }
    if (!recentIds?.length) {
      setRecentlyViewedListings([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const fetched = await getListingsByIds(recentIds);
        if (cancelled) return;
        const valid = fetched.filter((x) => x !== null) as Listing[];
        setRecentlyViewedListings(valid);
      } catch {
        if (!cancelled) setRecentlyViewedListings([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [recentIds, user?.uid]);

  // Signed-in: Watchlist preview
  useEffect(() => {
    if (!user?.uid) {
      setWatchlistListings([]);
      return;
    }
    if (favoritesLoading) return;

    const ids = Array.from(favoriteIds || []);
    if (!ids.length) {
      setWatchlistListings([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const fetched = await getListingsByIds(ids.slice(0, 12));
        if (cancelled) return;
        const valid = fetched.filter((x) => x !== null) as Listing[];
        setWatchlistListings(valid);
      } catch {
        if (!cancelled) setWatchlistListings([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [favoriteIds, favoritesLoading, user?.uid]);

  // Signed-in: Saved sellers subscription
  useEffect(() => {
    if (!user?.uid) {
      setSavedSellers([]);
      return;
    }

    const ref = collection(db, 'users', user.uid, 'following');
    const q = query(ref, orderBy('followedAt', 'desc'), fsLimit(50));
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
        setSavedSellers(out);
      },
      () => {
        setSavedSellers([]);
      }
    );
    return () => unsub();
  }, [user?.uid]);

  // Signed-in: Best-effort active listings count per saved seller (small cap)
  useEffect(() => {
    if (!user?.uid) return;
    if (!savedSellers.length) return;

    const sellerIds = savedSellers.slice(0, 12).map((s) => s.sellerId);
    const missing = sellerIds.filter((id) => !(id in activeCountBySellerId));
    if (missing.length === 0) return;

    // Mark missing as loading
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
  }, [activeCountBySellerId, savedSellers, user?.uid]);

  // Signed-in: New listings from saved sellers (lightweight, capped)
  useEffect(() => {
    if (!user?.uid) {
      setNewFromSavedSellers([]);
      return;
    }
    if (!savedSellers.length) {
      setNewFromSavedSellers([]);
      return;
    }

    let cancelled = false;
    (async () => {
      const sellers = savedSellers.slice(0, 6);
      const listingsRef = collection(db, 'listings');

      const results = await Promise.allSettled(
        sellers.map(async (s) => {
          // Prefer newest, but gracefully fallback if an index is missing.
          try {
            const q1 = query(
              listingsRef,
              where('sellerId', '==', s.sellerId),
              where('status', '==', 'active'),
              orderBy('createdAt', 'desc'),
              fsLimit(2)
            );
            const snap = await getDocs(q1);
            return snap.docs.map((d) => toListing({ ...(d.data() as any), id: d.id } as any));
          } catch {
            const q2 = query(listingsRef, where('sellerId', '==', s.sellerId), where('status', '==', 'active'), fsLimit(2));
            const snap = await getDocs(q2);
            return snap.docs.map((d) => toListing({ ...(d.data() as any), id: d.id } as any));
          }
        })
      );

      if (cancelled) return;
      const flat = results
        .filter((r): r is PromiseFulfilledResult<Listing[]> => r.status === 'fulfilled')
        .flatMap((r) => r.value || []);

      const uniq: Listing[] = [];
      const seen = new Set<string>();
      for (const l of flat) {
        if (!l?.id) continue;
        if (seen.has(l.id)) continue;
        seen.add(l.id);
        uniq.push(l);
      }

      setNewFromSavedSellers(uniq.slice(0, 12));
    })();

    return () => {
      cancelled = true;
    };
  }, [savedSellers, user?.uid]);

  const featuredListings = listings.filter(l => l.featured).slice(0, 3);
  const recentListings = listings.slice(0, 6);

  const recommendedForYou = useMemo(() => {
    if (!user?.uid) return [];
    const exclude = new Set<string>([
      ...recentlyViewedListings.map((l) => l.id),
      ...watchlistListings.map((l) => l.id),
    ]);

    const weightsByCategory: Record<string, number> = {};
    const weightsBySpecies: Record<string, number> = {};

    const signalListings = [...recentlyViewedListings, ...watchlistListings];
    for (const l of signalListings) {
      if (l?.category) weightsByCategory[l.category] = (weightsByCategory[l.category] || 0) + 2;
      const species = (l as any)?.attributes?.speciesId;
      if (species) weightsBySpecies[String(species)] = (weightsBySpecies[String(species)] || 0) + 1;
    }

    const scored = (listings || [])
      .filter((l) => l?.id && !exclude.has(l.id))
      .map((l) => {
        const species = (l as any)?.attributes?.speciesId ? String((l as any).attributes.speciesId) : null;
        const score =
          (l?.category ? (weightsByCategory[l.category] || 0) : 0) +
          (species ? (weightsBySpecies[species] || 0) : 0) +
          (l?.featured ? 0.25 : 0);
        return { l, score };
      })
      .sort((a, b) => b.score - a.score);

    return scored.map((x) => x.l).slice(0, 12);
  }, [listings, recentlyViewedListings, user?.uid, watchlistListings]);

  const SectionHeader = (props: { title: string; subtitle?: string; href?: string; actionLabel?: string; right?: ReactNode }) => {
    return (
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold mb-1 font-founders">{props.title}</h2>
          {props.subtitle ? <p className="text-muted-foreground">{props.subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {props.right}
          {props.href ? (
            <Button asChild variant="outline" size="sm" className="min-h-[40px] font-semibold">
              <Link href={props.href}>{props.actionLabel || 'See all'}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    );
  };

  const ListingRail = (props: { listings: Listing[]; emptyText: string }) => {
    if (!props.listings.length) {
      return (
        <Card className="border-2 border-border/50">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{props.emptyText}</CardContent>
        </Card>
      );
    }

    if (viewMode === 'list') {
      return (
        <div className="space-y-3">
          {props.listings.slice(0, 8).map((listing) => (
            <ListItem key={listing.id} listing={listing} />
          ))}
        </div>
      );
    }

    return (
      <div className="overflow-x-auto pb-2 -mx-4 px-4">
        <div className="flex gap-4 min-w-max">
          {props.listings.map((listing) => (
            <div key={listing.id} className="min-w-[280px] max-w-[280px]">
              <ListingCard listing={listing} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.5,
      },
    },
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden min-h-[50vh] md:min-h-[60vh] flex items-center justify-center">
        {/* Background Image with Dark Overlay */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/Buck_1.webp"
            alt="Wildlife Exchange Hero Background"
            fill
            className="object-cover object-[50%_20%]"
            priority
            quality={90}
            sizes="100vw"
          />
          {/* Dark Overlay for Text Readability - Strong enough for contrast */}
          <div className="absolute inset-0 bg-black/60 z-0" />
        </div>

        {/* Hero Content */}
        <div className="relative z-10 container mx-auto px-4 text-center text-white">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-4xl mx-auto"
          >
            <div className="flex items-center justify-center gap-3 sm:gap-4 mb-4 sm:mb-6 flex-wrap sm:flex-nowrap px-4">
              <div className="hidden md:block relative h-12 w-12 sm:h-16 sm:w-16 md:h-20 md:w-20 flex-shrink-0">
                <div className="h-full w-full mask-kudu bg-[hsl(37_27%_70%)]" />
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold font-barletta text-[hsl(37,27%,70%)] whitespace-nowrap">
                Wildlife Exchange
              </h1>
            </div>
            <p className="text-lg sm:text-xl md:text-2xl mb-6 sm:mb-8 text-white/90 font-medium px-4">
              Wildlife-first marketplace for Texas livestock, horses &amp; ranch assets
            </p>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4">
              <Button
                asChild
                size="lg"
                className="min-h-[48px] sm:min-h-[56px] w-full sm:min-w-[220px] text-base sm:text-lg font-semibold"
              >
                <Link href="/browse">
                  Browse Listings
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <CreateListingGateButton
                href="/dashboard/listings/new?fresh=1"
                variant="outline"
                size="lg"
                className="min-h-[48px] sm:min-h-[56px] w-full sm:min-w-[220px] text-base sm:text-lg font-semibold bg-white/10 border-white/30 text-white hover:bg-white/20 backdrop-blur-sm"
              >
                Create listing
              </CreateListingGateButton>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Trust Indicators */}
      <section className="py-8 md:py-12 border-b border-border/50 bg-card/50">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {[
              { icon: Shield, text: 'Verified Sellers', color: 'text-primary' },
              { icon: FileCheck, text: 'TPWD Compliant', color: 'text-primary' },
              { icon: Users, text: 'Trusted Community', color: 'text-primary' },
              { icon: Gavel, text: 'Secure Auctions', color: 'text-primary' },
            ].map((item, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + idx * 0.1 }}
                className="flex flex-col items-center text-center"
              >
                <item.icon className={`h-8 w-8 md:h-10 md:w-10 mb-2 ${item.color}`} />
                <span className="text-sm md:text-base font-medium text-foreground">{item.text}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Signed-in only: Personalized home */}
      {user ? (
        <section className="py-10 md:py-12 border-b border-border/50 bg-background">
          <div className="container mx-auto px-4 space-y-8">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="text-sm text-muted-foreground">Welcome back</div>
                <h1 className="text-3xl md:text-4xl font-bold font-founders truncate">
                  {user.displayName ? user.displayName : '—'}
                </h1>
                <div className="text-sm text-muted-foreground mt-1">Pick up where you left off.</div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button asChild className="min-h-[44px] font-semibold">
                  <Link href="/browse">
                    <Search className="h-4 w-4 mr-2" />
                    Browse
                  </Link>
                </Button>
                <Button asChild variant="outline" className="min-h-[44px] font-semibold">
                  <Link href="/dashboard/watchlist">Watchlist</Link>
                </Button>
                <Button asChild variant="outline" className="min-h-[44px] font-semibold">
                  <Link href="/dashboard/messages">Messages</Link>
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <SectionHeader
                title="Recently viewed"
                subtitle="Your latest clicks — fast way back in."
                href="/dashboard/recently-viewed"
              />
              <ListingRail listings={recentlyViewedListings} emptyText="No recently viewed listings yet." />
            </div>

            <div className="space-y-4">
              <SectionHeader
                title="Watched items"
                subtitle="Listings you’re keeping an eye on."
                href="/dashboard/watchlist"
                right={
                  favoritesLoading ? (
                    <span className="text-xs text-muted-foreground">Loading…</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{Array.from(favoriteIds || []).length} watched</span>
                  )
                }
              />
              <ListingRail listings={watchlistListings} emptyText="No watched items yet. Tap the heart on any listing." />
            </div>

            <div className="space-y-4">
              <SectionHeader title="Saved sellers" subtitle="Sellers you follow — with their active inventory." href="/dashboard/watchlist" actionLabel="Manage" />
              {savedSellers.length === 0 ? (
                <Card className="border-2 border-border/50">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    You haven’t saved any sellers yet. Save a seller from a listing page to get updates here.
                  </CardContent>
                </Card>
              ) : (
                <div className="overflow-x-auto pb-2 -mx-4 px-4">
                  <div className="flex gap-3 min-w-max">
                    {savedSellers.slice(0, 12).map((s) => {
                      const activeCount = activeCountBySellerId[s.sellerId];
                      const href = `/sellers/${s.sellerId}`;
                      return (
                        <Link
                          key={s.sellerId}
                          href={href}
                          className="group border-2 border-border/50 hover:border-primary/40 transition-colors rounded-xl bg-card px-3 py-2 min-w-[220px]"
                        >
                          <div className="flex items-center gap-3">
                            <div className="relative h-10 w-10 rounded-full overflow-hidden bg-muted border shrink-0">
                              {s.sellerPhotoURL ? (
                                <Image src={s.sellerPhotoURL} alt="" fill className="object-cover" sizes="40px" unoptimized />
                              ) : (
                                <div className="h-full w-full flex items-center justify-center text-sm font-extrabold text-muted-foreground">
                                  {String(s.sellerDisplayName || 'S').trim().charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-extrabold leading-tight truncate">{s.sellerDisplayName}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {activeCount === null ? 'Loading…' : `${activeCount ?? 0} active listings`}
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <SectionHeader
                title="New from saved sellers"
                subtitle="Fresh inventory from people you follow."
                href="/dashboard/watchlist"
                actionLabel="See sellers"
              />
              <ListingRail listings={newFromSavedSellers} emptyText="No active listings from your saved sellers yet." />
            </div>

            <div className="space-y-4">
              <SectionHeader title="New for you" subtitle="Personalized picks based on what you view and watch." href="/browse" actionLabel="Browse all" />
              <ListingRail listings={recommendedForYou} emptyText="Browse a few listings and we’ll start tuning this feed for you." />
            </div>
          </div>
        </section>
      ) : null}

      {/* Category Tiles */}
      <section className="py-12 md:py-16 bg-background border-b border-border/50">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 text-center"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-2 font-founders">
              Browse by Category
            </h2>
            <p className="text-muted-foreground text-base md:text-lg">
              Explore our marketplace by category
            </p>
          </motion.div>

          {/* Mobile-only: compact 2-column grid (icons + title only) */}
          <div className="grid grid-cols-2 gap-3 max-w-xl mx-auto md:hidden">
            {[
              { href: '/browse?category=whitetail_breeder', label: 'Whitetail Breeder', icon: <div className="w-9 h-9 icon-primary-color mask-icon-whitetail-breeder" /> },
              { href: '/browse?category=wildlife_exotics', label: 'Wildlife & Exotics', icon: <div className="w-9 h-9 icon-primary-color mask-icon-fallow" /> },
              { href: '/browse?category=cattle_livestock', label: 'Cattle & Livestock', icon: <div className="w-9 h-9 icon-primary-color mask-icon-bull" /> },
              {
                href: '/browse?category=horse_equestrian',
                label: 'Horse & Equestrian',
                icon: (
                  <div
                    className="w-9 h-9"
                    style={{
                      WebkitMaskImage: `url('/images/Horse.png')`,
                      WebkitMaskSize: 'contain',
                      WebkitMaskRepeat: 'no-repeat',
                      WebkitMaskPosition: 'center',
                      maskImage: `url('/images/Horse.png')`,
                      maskSize: 'contain',
                      maskRepeat: 'no-repeat',
                      maskPosition: 'center',
                      backgroundColor: 'hsl(var(--primary))',
                    }}
                  />
                ),
              },
              { href: '/browse?category=sporting_working_dogs', label: 'Sporting Dogs', icon: <div className="w-9 h-9 icon-primary-color mask-icon-dog" /> },
              { href: '/browse?category=hunting_outfitter_assets', label: 'Hunting Assets', icon: <div className="w-9 h-9 icon-primary-color mask-icon-hunting-blind" /> },
              { href: '/browse?category=ranch_equipment', label: 'Ranch Equipment', icon: <div className="w-9 h-9 icon-primary-color mask-icon-tractor" /> },
              { href: '/browse?category=ranch_vehicles', label: 'Vehicles & Trailers', icon: <div className="w-9 h-9 icon-primary-color mask-icon-top-drive" /> },
            ].map((c) => (
              <Link key={c.href} href={c.href} className="group">
                <Card className="border-2 border-border/60 hover:border-primary/40 transition-colors">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3 min-h-[56px]">
                      <div className="flex-shrink-0">{c.icon}</div>
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold leading-tight line-clamp-2">{c.label}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Desktop/tablet: keep existing layout exactly */}
          <div className="hidden md:grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
            {/* Whitetail Breeder - First priority */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <Link href="/browse?category=whitetail_breeder">
                <Card className="h-full border-2 hover:border-primary/50 transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4 md:flex-col md:text-center">
                      <div className="w-16 h-16 icon-primary-color mask-icon-whitetail-breeder flex-shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-lg font-bold leading-tight">Whitetail Breeder</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                      TPWD-permitted breeder deer with verified genetics and health records
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>

            {/* Wildlife & Exotics */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Link href="/browse?category=wildlife_exotics">
                <Card className="h-full border-2 hover:border-primary/50 transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4 md:flex-col md:text-center">
                      <div className="w-16 h-16 icon-primary-color mask-icon-fallow flex-shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-lg font-bold leading-tight">Wildlife &amp; Exotics</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          Axis deer, blackbuck, fallow deer, and other exotic species
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>

            {/* Cattle & Livestock */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Link href="/browse?category=cattle_livestock">
                <Card className="h-full border-2 hover:border-primary/50 transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4 md:flex-col md:text-center">
                      <div className="w-16 h-16 icon-primary-color mask-icon-bull flex-shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-lg font-bold leading-tight">Cattle &amp; Livestock</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          Cattle, bulls, cows, heifers, and registered livestock
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>

            {/* Ranch Equipment & Attachments */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Link href="/browse?category=ranch_equipment">
                <Card className="h-full border-2 hover:border-primary/50 transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4 md:flex-col md:text-center">
                      <div className="w-16 h-16 icon-primary-color mask-icon-tractor flex-shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-lg font-bold leading-tight">Ranch Equipment &amp; Attachments</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          Tractors, skid steers, machinery, and attachments/implements (vehicles &amp; trailers listed separately)
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>

            {/* Ranch Vehicles & Trailers */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
            >
              <Link href="/browse?category=ranch_vehicles">
                <Card className="h-full border-2 hover:border-primary/50 transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4 md:flex-col md:text-center">
                      <div className="w-16 h-16 icon-primary-color mask-icon-top-drive flex-shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-lg font-bold leading-tight">Ranch Vehicles &amp; Trailers</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          Trucks, UTVs/ATVs, and trailers (stock, gooseneck, flatbed, utility)
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>

            {/* Horse & Equestrian */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Link href="/browse?category=horse_equestrian">
                <Card className="h-full border-2 hover:border-primary/50 transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4 md:flex-col md:text-center">
                      <div
                        className="w-16 h-16 flex-shrink-0"
                        style={{
                          WebkitMaskImage: `url('/images/Horse.png')`,
                          WebkitMaskSize: 'contain',
                          WebkitMaskRepeat: 'no-repeat',
                          WebkitMaskPosition: 'center',
                          maskImage: `url('/images/Horse.png')`,
                          maskSize: 'contain',
                          maskRepeat: 'no-repeat',
                          maskPosition: 'center',
                          backgroundColor: 'hsl(var(--primary))',
                        }}
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-lg font-bold leading-tight">Horse &amp; Equestrian</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          Horses, tack, and equestrian listings with required transfer paperwork
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>

            {/* Sporting & Working Dogs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.55 }}
            >
              <Link href="/browse?category=sporting_working_dogs">
                <Card className="h-full border-2 hover:border-primary/50 transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4 md:flex-col md:text-center">
                      <div className="w-16 h-16 icon-primary-color mask-icon-dog flex-shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-lg font-bold leading-tight">Sporting &amp; Working Dogs</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          Bird dogs, hog dogs, tracking dogs, and other working/sporting dogs
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>

            {/* Hunting & Outfitter Assets */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <Link href="/browse?category=hunting_outfitter_assets">
                <Card className="h-full border-2 hover:border-primary/50 transition-all cursor-pointer group">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4 md:flex-col md:text-center">
                      <div className="w-16 h-16 icon-primary-color mask-icon-hunting-blind flex-shrink-0" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <h3 className="text-lg font-bold leading-tight">Hunting &amp; Outfitter Assets</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          Camera systems, blinds, and water/well systems
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Featured Listings */}
      {!loading && featuredListings.length > 0 && (
        <section className="py-12 md:py-16 bg-background">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8"
            >
              <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                <div>
                  <h2 className="text-3xl md:text-4xl font-bold mb-2 font-founders">Featured Listings</h2>
                  <p className="text-muted-foreground text-base md:text-lg">
                    Hand-picked listings with high visibility. New inventory added daily.
                  </p>
                </div>
                <ViewModeToggle />
              </div>
            </motion.div>

            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className={cn(
                viewMode === 'card'
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8'
                  : 'space-y-4'
              )}
            >
              <AnimatePresence>
                {featuredListings.map((listing) =>
                  viewMode === 'card' ? (
                    <FeaturedListingCard key={listing.id} listing={listing} />
                  ) : (
                    <ListItem key={listing.id} listing={listing} />
                  )
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </section>
      )}

      {/* Most Watched */}
      {!loading && mostWatched.length > 0 && (
        <section className="py-12 md:py-16 bg-background border-t border-border/50">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold mb-2 font-founders">Most Watched</h2>
                <p className="text-muted-foreground text-base md:text-lg">Social proof that drives liquidity.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <ViewModeToggle />
                <Button variant="outline" asChild>
                  <Link href="/browse">Browse</Link>
                </Button>
              </div>
            </div>
            <div
              className={cn(
                viewMode === 'card'
                  ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6'
                  : 'space-y-4'
              )}
            >
              {mostWatched.map((listing) =>
                viewMode === 'card' ? (
                  <ListingCard key={listing.id} listing={listing} />
                ) : (
                  <ListItem key={listing.id} listing={listing} />
                )
              )}
            </div>
          </div>
        </section>
      )}

      {/* Ending Soon */}
      {!loading && endingSoon.length > 0 && (
        <section className="py-12 md:py-16 bg-background border-t border-border/50">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold mb-2 font-founders">Ending Soon</h2>
                <p className="text-muted-foreground text-base md:text-lg">Auctions closing soon—act now.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <ViewModeToggle />
                <Button variant="outline" asChild>
                  <Link href="/browse">View all</Link>
                </Button>
              </div>
            </div>
            <div
              className={cn(
                viewMode === 'card'
                  ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6'
                  : 'space-y-4'
              )}
            >
              {endingSoon.map((listing) =>
                viewMode === 'card' ? (
                  <ListingCard key={listing.id} listing={listing} />
                ) : (
                  <ListItem key={listing.id} listing={listing} />
                )
              )}
            </div>
          </div>
        </section>
      )}

      {/* Recent Listings */}
      <section className="py-12 md:py-16 bg-background border-t border-border/50">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-2 font-founders">
                Recent Listings
              </h2>
              <p className="text-muted-foreground text-base md:text-lg">
                Latest additions to the marketplace
              </p>
            </div>

            {/* View Mode Toggle */}
            <ViewModeToggle />
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-muted-foreground">Loading listings...</p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="text-center py-12">
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
          )}

          {/* Listings Grid/List */}
          {!loading && !error && (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className={cn(
                viewMode === 'card'
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8'
                  : 'space-y-4'
              )}
            >
              <AnimatePresence>
                {recentListings.length > 0 ? (
                  recentListings.map((listing) =>
                    viewMode === 'card' ? (
                      <ListingCard key={listing.id} listing={listing} />
                    ) : (
                      <ListItem key={listing.id} listing={listing} />
                    )
                  )
                ) : (
                  <div className="col-span-full text-center py-12">
                    <p className="text-muted-foreground">No listings available yet.</p>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </section>

      {/* Field Notes (Featured + Editor Picks) */}
      <section className="py-12 md:py-16 border-t border-border/50 bg-card/30">
        <div className="container mx-auto px-4 space-y-8">
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-muted-foreground">
                <BookOpen className="h-4 w-4" />
                Field Notes
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight font-founders">
                Trust-first education for high-ticket deals
              </h2>
              <p className="text-muted-foreground max-w-2xl">
                Guides on payments, compliance, transport, and how to buy/sell with confidence.
              </p>
            </div>
            <Button asChild variant="outline" className="min-h-[44px]">
              <Link href="/field-notes">
                View all <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          {fieldNotesLoading ? (
            <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
              Loading Field Notes…
            </div>
          ) : !fieldNotesFeatured ? (
            <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
              Field Notes is coming alive—check back soon.
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
              <Link href={`/field-notes/${fieldNotesFeatured.slug}`} className="group">
                <Card className="h-full border-2 overflow-hidden hover:border-primary/40 transition-colors">
                  <CardContent className="p-0">
                    <div className="relative h-56 sm:h-72 bg-muted">
                      {fieldNotesFeatured.coverImage ? (
                        <Image src={fieldNotesFeatured.coverImage} alt="" fill className="object-cover transition-transform group-hover:scale-[1.02]" />
                      ) : null}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-5">
                        <div className="flex flex-wrap gap-2 mb-2">
                          <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white">
                            Featured
                          </span>
                          {fieldNotesFeatured.category ? (
                            <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white">
                              {fieldNotesFeatured.category}
                            </span>
                          ) : null}
                          <span className="text-xs px-2.5 py-1 rounded-full bg-white/10 border border-white/20 text-white">
                            {fieldNotesFeatured.readingMinutes} min
                          </span>
                        </div>
                        <div className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                          {fieldNotesFeatured.title}
                        </div>
                        <div className="text-sm text-white/80 mt-1 line-clamp-2">
                          {fieldNotesFeatured.description}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <div className="space-y-3">
                <div className="text-sm font-extrabold tracking-tight">Editor picks</div>
                <div className="space-y-3">
                  {fieldNotesPicks.slice(0, 3).map((p) => (
                    <Link key={p.slug} href={`/field-notes/${p.slug}`} className="group block">
                      <Card className="border-2 hover:border-primary/40 transition-colors">
                        <CardContent className="p-4 space-y-2">
                          <div className="flex flex-wrap gap-2">
                            {p.category ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 border border-primary/15 text-primary">
                                {p.category}
                              </span>
                            ) : null}
                            <span className="text-xs px-2 py-0.5 rounded-full border bg-muted/20">
                              {p.readingMinutes} min
                            </span>
                          </div>
                          <div className="font-extrabold tracking-tight leading-snug group-hover:underline underline-offset-4">
                            {p.title}
                          </div>
                          <div className="text-sm text-muted-foreground line-clamp-2">{p.description}</div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>

                <div className="pt-1 text-sm">
                  <Link href="/field-notes/tags" className="font-semibold text-primary hover:underline underline-offset-4">
                    Browse by tags →
                  </Link>
                  <span className="text-muted-foreground"> · </span>
                  <Link href="/field-notes/authors" className="font-semibold text-primary hover:underline underline-offset-4">
                    Browse by authors →
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 md:py-16 border-t border-border/50 bg-gradient-to-b from-primary/5 via-background to-background">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden rounded-2xl border bg-card/60 backdrop-blur-sm"
          >
            {/* Decorative glows */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
              <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
            </div>

            <div className="relative p-6 sm:p-10 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/15 mb-5">
                <Zap className="h-7 w-7 text-primary" />
              </div>

              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight mb-3 font-founders">
                Ready to buy or sell?
              </h2>
              <p className="text-muted-foreground text-lg mb-6 max-w-2xl mx-auto">
                List whitetail breeder stock, Texas exotics, cattle, and ranch equipment—built for trust and compliance.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2 mb-7">
                <span className="text-xs px-3 py-1 rounded-full border bg-muted/30">
                  Texas-only for animal transactions
                </span>
                <span className="text-xs px-3 py-1 rounded-full border bg-muted/30">
                  Escrow + payout gating
                </span>
                <span className="text-xs px-3 py-1 rounded-full border bg-muted/30">
                  Equipment can be multi-state
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button asChild size="lg" className="min-h-[56px] min-w-[220px] text-base font-semibold">
                  <Link href="/browse">
                    Browse Listings
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>

                {/* IMPORTANT: Don't wrap CreateListingGateButton in another Button (it already renders a Button). */}
                <CreateListingGateButton
                  href="/dashboard/listings/new?fresh=1"
                  variant="outline"
                  size="lg"
                  className="min-h-[56px] min-w-[220px] text-base font-semibold"
                >
                  Create Listing
                </CreateListingGateButton>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
