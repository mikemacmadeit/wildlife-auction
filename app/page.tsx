'use client';

import React, { useMemo, useRef, useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Search, Shield, TrendingUp, Users, ArrowRight, Gavel, Zap, FileCheck, BookOpen, ChevronLeft, ChevronRight, Star, Store, MessageCircle, MessageSquare, Heart, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { FeaturedListingCard } from '@/components/listings/FeaturedListingCard';
import { CreateListingGateButton } from '@/components/listings/CreateListingGate';
import { ListingCard } from '@/components/listings/ListingCard';
import { collection, getCountFromServer, onSnapshot, orderBy, query, where, limit as fsLimit, getDocs } from 'firebase/firestore';
import { listActiveListings, listEndingSoonAuctions, listMostWatchedListings, getListingsByIds, filterOutEndedAuctions, filterListingsForDiscovery, toListing } from '@/lib/firebase/listings';
import { db } from '@/lib/firebase/config';
import type { Listing, SavedSellerDoc } from '@/lib/types';
import { cn } from '@/lib/utils';
import { BrandLogoText } from '@/components/navigation/BrandLogoText';
import { User } from 'firebase/auth';
import { useAuth } from '@/hooks/use-auth';
// Removed useFavorites import - homepage doesn't need it
// import { useFavorites } from '@/hooks/use-favorites';
import { useRecentlyViewed } from '@/hooks/use-recently-viewed';
import { toast as globalToast } from '@/hooks/use-toast';
import { getUserProfile } from '@/lib/firebase/users';

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

// Hero uses BrandLogoText; same two-tone (Ag = primary, change = beige) and font as navbar.

/** Inline filter: hide dog-related listings from UI for Stripe review (no backend change). */
function isDogListing(l: Listing): boolean {
  const cat = (l?.category ?? '').toString().toLowerCase();
  const slug = cat;
  const label = cat;
  if (/dog/i.test(cat) || /dog/i.test(slug) || /dog/i.test(label)) return true;
  const species = (l as any)?.species ?? (l as any)?.attributes?.speciesId ?? '';
  if (String(species).toLowerCase() === 'dog') return true;
  const breed = ((l as any)?.attributes?.breed ?? (l as any)?.breed ?? '').toString().toLowerCase();
  const dogBreedTerms = ['golden', 'retriever', 'labrador', 'lab ', 'lab,', 'pointer', 'setter', 'hound', 'shepherd', 'doodle', 'beagle', 'terrier', 'dachshund'];
  if (dogBreedTerms.some((t) => breed.includes(t))) return true;
  const title = (l?.title ?? '').toString().toLowerCase();
  if (/dog/i.test(title)) return true;
  return false;
}

/** Inline filter: hide horse/equestrian listings from UI until category is re-enabled (no backend change). */
function isHorseListing(l: Listing): boolean {
  const cat = (l?.category ?? '').toString().toLowerCase();
  if (/horse|equestrian/i.test(cat)) return true;
  const species = (l as any)?.species ?? (l as any)?.attributes?.speciesId ?? '';
  if (String(species).toLowerCase() === 'horse') return true;
  return false;
}

/** Inline filter: hide ranch_equipment / ranch_vehicles until re-enabled (no backend change). */
function isRanchEquipmentOrVehiclesListing(l: Listing): boolean {
  const cat = (l?.category ?? '').toString().toLowerCase();
  return cat === 'ranch_equipment' || cat === 'ranch_vehicles';
}

/** Inline filter: hide hunting_outfitter_assets until re-enabled (no backend change). */
function isHuntingOutfitterListing(l: Listing): boolean {
  const cat = (l?.category ?? '').toString().toLowerCase();
  return cat === 'hunting_outfitter_assets';
}

function isHiddenCategoryListing(l: Listing): boolean {
  return isDogListing(l) || isHorseListing(l) || isRanchEquipmentOrVehiclesListing(l) || isHuntingOutfitterListing(l);
}

export default function HomePage() {
  const { user, loading: authLoading, initialized } = useAuth();
  const { recentIds } = useRecentlyViewed();
  // CRITICAL FIX: Don't call useFavorites() in the homepage at all
  // Calling useFavorites() subscribes to state, which causes the homepage to re-render
  // when favoriteIds changes, leading to the glitching issue.
  // Instead, we'll handle the watchlist in a separate component that can subscribe to state.
  // The homepage itself doesn't need to know about favoriteIds - it just displays listings.
  
  const router = useRouter();
  // Use global toast function instead of useToast() hook to prevent re-renders when toast state changes
  const toast = globalToast;
  // Uncontrolled search input: ref avoids re-renders on every keystroke so listings don't glitch
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [listings, setListings] = useState<Listing[]>([]);
  const [mostWatched, setMostWatched] = useState<Listing[]>([]);
  const [endingSoon, setEndingSoon] = useState<Listing[]>([]);

  // Memoize listings arrays AND individual listing objects to prevent recreation
  // Create a stable map of listings by ID to reuse object references
  const listingsMapRef = useRef<Map<string, Listing>>(new Map());
  
  const stableListings = useMemo(() => {
    const currentMap = listingsMapRef.current;
    const newMap = new Map<string, Listing>();
    
    // Reuse existing listing objects if IDs match, otherwise use new ones
    listings.forEach(listing => {
      const existing = currentMap.get(listing.id);
      // Only reuse if the listing ID matches (content might have changed, but we'll let React.memo handle that)
      if (existing && existing.id === listing.id) {
        newMap.set(listing.id, existing);
      } else {
        newMap.set(listing.id, listing);
      }
    });
    
    listingsMapRef.current = newMap;
    return listings.map(l => newMap.get(l.id) || l);
  }, [listings.length, listings.map(l => l.id).sort().join(',')]);
  
  const stableMostWatched = useMemo(() => {
    const currentMap = listingsMapRef.current;
    const newMap = new Map<string, Listing>();
    
    mostWatched.forEach(listing => {
      const existing = currentMap.get(listing.id);
      if (existing && existing.id === listing.id) {
        newMap.set(listing.id, existing);
      } else {
        newMap.set(listing.id, listing);
      }
    });
    
    return mostWatched.map(l => newMap.get(l.id) || l);
  }, [mostWatched.length, mostWatched.map(l => l.id).sort().join(',')]);
  
  const stableEndingSoon = useMemo(() => {
    const currentMap = listingsMapRef.current;
    const newMap = new Map<string, Listing>();
    
    endingSoon.forEach(listing => {
      const existing = currentMap.get(listing.id);
      if (existing && existing.id === listing.id) {
        newMap.set(listing.id, existing);
      } else {
        newMap.set(listing.id, listing);
      }
    });
    
    return endingSoon.map(l => newMap.get(l.id) || l);
  }, [endingSoon.length, endingSoon.map(l => l.id).sort().join(',')]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fieldNotesLoading, setFieldNotesLoading] = useState(true);
  const [fieldNotesFeatured, setFieldNotesFeatured] = useState<any | null>(null);
  const [fieldNotesPicks, setFieldNotesPicks] = useState<any[]>([]);

  // Personalized modules (signed-in home)
  const [recentlyViewedListings, setRecentlyViewedListings] = useState<Listing[]>([]);
  const [watchlistListings, setWatchlistListings] = useState<Listing[]>([]);
  const [savedSellers, setSavedSellers] = useState<SavedSellerDoc[]>([]);
  const [activeCountBySellerId, setActiveCountBySellerId] = useState<Record<string, number | null>>({});
  const activeCountBySellerIdRef = useRef<Record<string, number | null>>({});
  const [messagingSellerId, setMessagingSellerId] = useState<string | null>(null);
  const [newFromSavedSellers, setNewFromSavedSellers] = useState<Listing[]>([]);
  const [userProfile, setUserProfile] = useState<any | null>(null);

  // Keep a ref in sync so effects can read the latest cache without depending on it.
  useEffect(() => {
    activeCountBySellerIdRef.current = activeCountBySellerId;
  }, [activeCountBySellerId]);

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
        setRecentlyViewedListings(filterListingsForDiscovery(valid));
      } catch {
        if (!cancelled) setRecentlyViewedListings([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [recentIds, user?.uid]);

  // Signed-in: Watchlist preview
  // REMOVED: This effect was causing re-renders. The watchlist will be handled
  // by a separate component that can safely subscribe to useFavorites().
  // For now, we'll just set an empty array to prevent errors.
  useEffect(() => {
    if (!user?.uid) {
      setWatchlistListings([]);
      return;
    }
    // Watchlist will be handled by a separate component
    setWatchlistListings([]);
  }, [user?.uid]);

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
    const cache = activeCountBySellerIdRef.current || {};
    const missing = sellerIds.filter((id) => !(id in cache));
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
    // NOTE: Do NOT depend on activeCountBySellerId here; we mark items as "loading" (null),
    // which triggers a re-render. If this effect re-runs due to that state change, it will
    // clean up and cancel the in-flight async fetch, leaving "Loading…" stuck forever.
  }, [savedSellers, user?.uid]);

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

  // Memoize derived listings to prevent recreation on each render. Dog and horse listings filtered until re-enabled.
  const featuredListings = useMemo(() => stableListings.filter((l) => l.featured && !isHiddenCategoryListing(l)), [stableListings]);
  const recentListings = useMemo(() => stableListings.filter((l) => !isHiddenCategoryListing(l)).slice(0, 6), [stableListings]);

  const signedInDiscoveryListings = useMemo(() => {
    if (!user?.uid) return [];
    if (mostWatched?.length) return mostWatched.filter((l) => !isHiddenCategoryListing(l)).slice(0, 12);
    return recentListings.slice(0, 12);
  }, [mostWatched, recentListings, user?.uid]);

  const showRecentlyViewed = user?.uid ? recentlyViewedListings.length > 0 : false;
  const showWatchlist =
    user?.uid ? watchlistListings.length > 0 : false;
  const showSavedSellers = user?.uid ? savedSellers.length > 0 : false;
  const showNewFromSavedSellers = user?.uid ? newFromSavedSellers.length > 0 : false;

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

  // Keep “Trending” cards at the front of each rail (stable within groups).
  // Match the badge logic used by `components/listings/ListingCard.tsx`.
  const isTrendingListing = (l: Listing): boolean => {
    const watchers = typeof (l as any).watcherCount === 'number' ? (l as any).watcherCount : (l as any)?.metrics?.favorites || 0;
    const bidCount = (l as any)?.metrics?.bidCount || 0;
    const isSold = (l as any)?.status === 'sold';
    return !isSold && (watchers >= 10 || bidCount >= 8);
  };

  const sortTrendingFirst = (list: Listing[]): Listing[] => {
    const arr = Array.isArray(list) ? list : [];
    if (arr.length <= 1) return arr;
    return arr
      .map((l, idx) => ({ l, idx, t: isTrendingListing(l) }))
      .sort((a, b) => Number(b.t) - Number(a.t) || a.idx - b.idx)
      .map((x) => x.l);
  };

  const ListingRail = React.memo(function ListingRail(props: { listings: Listing[]; emptyText: string }) {
    // Memoize sorted listings to prevent re-renders when favoriteIds changes
    // Create a stable key based on listing IDs to detect real changes
    const listingsKey = useMemo(() => props.listings.map(l => l.id).sort().join(','), [props.listings.map(l => l.id).sort().join(',')]);
    const railListings = useMemo(() => {
      return sortTrendingFirst(props.listings);
    }, [listingsKey]);
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const [canScroll, setCanScroll] = useState(false);
    const dragRef = useRef<{
      active: boolean;
      startX: number;
      startY: number;
      startScrollLeft: number;
      dragged: boolean;
      lastDragAtMs: number;
      rafId: number | null;
      pendingScrollLeft: number | null;
    }>({
      active: false,
      startX: 0,
      startY: 0,
      startScrollLeft: 0,
      dragged: false,
      lastDragAtMs: 0,
      rafId: null,
      pendingScrollLeft: null,
    });
    const [isDragging, setIsDragging] = useState(false);

    // If the row doesn't overflow horizontally (e.g. only 1–2 items),
    // remove the desktop side gutters and hide arrows so the row aligns flush-left like others.
    useEffect(() => {
      if (!railListings.length) {
        setCanScroll(false);
        return;
      }
      const el = scrollerRef.current;
      if (!el) return;

      const compute = () => {
        try {
          setCanScroll(el.scrollWidth > el.clientWidth + 2);
        } catch {
          setCanScroll(false);
        }
      };

      compute();
      const t = window.setTimeout(compute, 250);
      window.addEventListener('resize', compute);
      return () => {
        window.clearTimeout(t);
        window.removeEventListener('resize', compute);
      };
    }, [railListings.length]);

    if (!railListings.length) {
      return (
        <Card className="border-2 border-border/50">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{props.emptyText}</CardContent>
        </Card>
      );
    }

    // Homepage: enforce consistent card size/height (eBay-style rails).
    // This avoids “some huge, some small” cards when different variants render.
    const itemClass = 'w-[200px] h-[300px] sm:w-[320px] sm:h-[420px] lg:w-[340px] lg:h-[420px]';

    const startRafLoop = () => {
      const el = scrollerRef.current;
      if (!el) return;
      if (dragRef.current.rafId != null) return;

      const tick = () => {
        dragRef.current.rafId = null;
        if (!dragRef.current.active) return;
        if (dragRef.current.pendingScrollLeft != null) {
          el.scrollLeft = dragRef.current.pendingScrollLeft;
        }
        // Keep ticking while active so the scroll updates feel continuous.
        dragRef.current.rafId = window.requestAnimationFrame(tick);
      };

      dragRef.current.rafId = window.requestAnimationFrame(tick);
    };

    const beginDrag = (clientX: number, clientY: number) => {
      const el = scrollerRef.current;
      if (!el) return;
      dragRef.current.active = true;
      dragRef.current.dragged = false;
      dragRef.current.lastDragAtMs = 0;
      dragRef.current.startX = clientX;
      dragRef.current.startY = clientY;
      dragRef.current.startScrollLeft = el.scrollLeft;
      dragRef.current.pendingScrollLeft = null;
      setIsDragging(true);
    };

    const onPointerDown = (e: React.PointerEvent) => {
      // Ignore non-primary buttons.
      if (e.button !== 0) return;
      // IMPORTANT: do NOT setPointerCapture on pointerdown.
      // Capturing here can cause the eventual click to target the scroller instead of the <Link>,
      // making listings "unclickable". We only capture once we've crossed the drag threshold.
      beginDrag(e.clientX, e.clientY);
    };

    const moveDrag = (e: { clientX: number; clientY: number; preventDefault?: () => void; pointerId?: number }) => {
      const el = scrollerRef.current;
      if (!el) return;
      if (!dragRef.current.active) return;

      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;

      // If user is mostly scrolling vertically, don't hijack.
      if (!dragRef.current.dragged) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 6) {
          dragRef.current.active = false;
          setIsDragging(false);
          return;
        }
      }

      // Require a deliberate horizontal drag before we enter "dragging" mode
      // so normal clicks don't get blocked by tiny pointer jitter.
      if (Math.abs(dx) > 12) {
        if (!dragRef.current.dragged) dragRef.current.lastDragAtMs = Date.now();
        dragRef.current.dragged = true;
        // Once we're truly dragging, capture the pointer so drag stays active outside the element.
        try {
          if (typeof e.pointerId === 'number') {
            (el as any)?.setPointerCapture?.(e.pointerId);
          }
        } catch {
          // ignore
        }
      }
      if (!dragRef.current.dragged) return;

      // Prevent selecting text/images while dragging.
      e.preventDefault?.();

      const nextLeft = dragRef.current.startScrollLeft - dx;
      dragRef.current.pendingScrollLeft = nextLeft;
      startRafLoop();
    };

    const onPointerMove = (e: React.PointerEvent) => {
      moveDrag({ clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId, preventDefault: () => e.preventDefault() });
    };

    const endDrag = (e?: { pointerId?: number; currentTarget?: any }) => {
      // Release capture and end drag state.
      dragRef.current.active = false;
      setIsDragging(false);
      try {
        if (e?.currentTarget && typeof e?.pointerId === 'number') {
          (e.currentTarget as any)?.releasePointerCapture?.(e.pointerId);
        }
      } catch {
        // ignore
      }

      // Stop RAF loop if running.
      if (dragRef.current.rafId != null) {
        try {
          window.cancelAnimationFrame(dragRef.current.rafId);
        } catch {
          // ignore
        }
        dragRef.current.rafId = null;
      }
      dragRef.current.pendingScrollLeft = null;

      // Mark the end of a drag so we can suppress the synthetic click that follows a drag.
      if (dragRef.current.dragged) {
        dragRef.current.lastDragAtMs = Date.now();
        window.setTimeout(() => {
          dragRef.current.dragged = false;
        }, 220);
      } else {
        dragRef.current.lastDragAtMs = 0;
      }
    };

    return (
      <div className="group/rail relative [--rail-card-w:200px] sm:[--rail-card-w:320px] lg:[--rail-card-w:340px]">
        {/* Arrows: sit in the rail gutters (ends of the section), not on top of card images */}
        <div
          className={cn(
            canScroll ? 'hidden md:block absolute left-0 right-0 z-30' : 'hidden',
            // Fade in only when hovering this rail
            'opacity-0 group-hover/rail:opacity-100 transition-opacity duration-200',
            // Do not block clicks on cards; only the buttons should be clickable.
            'pointer-events-none'
          )}
          style={{ top: 'calc(var(--rail-card-w)*3/8)' }}
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              // Anchor to the rail edge (gutter), not over the first card.
              'pointer-events-auto absolute left-0 -translate-y-1/2 -translate-x-1/2',
              'h-10 w-10 rounded-full shadow-lg',
              // High contrast on images: dark in light mode, light in dark mode.
              'bg-black/70 text-white border-white/20 hover:bg-black/80',
              'dark:bg-white/80 dark:text-black dark:border-black/20 dark:hover:bg-white/90'
            )}
            onClick={() =>
              scrollerRef.current?.scrollBy({
                left: -Math.round((scrollerRef.current?.clientWidth || 800) * 0.9),
                behavior: 'smooth',
              })
            }
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              'pointer-events-auto absolute right-0 -translate-y-1/2 translate-x-1/2',
              'h-10 w-10 rounded-full shadow-lg',
              'bg-black/70 text-white border-white/20 hover:bg-black/80',
              'dark:bg-white/80 dark:text-black dark:border-black/20 dark:hover:bg-white/90'
            )}
            onClick={() =>
              scrollerRef.current?.scrollBy({
                left: Math.round((scrollerRef.current?.clientWidth || 800) * 0.9),
                behavior: 'smooth',
              })
            }
            aria-label="Scroll right"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        <div
          ref={scrollerRef}
          className={cn(
            // NOTE: no scroll-smooth here; it makes drag-scrolling feel like it "catches up" after release.
            // Add side gutters on desktop so the arrow buttons don't overlap card images.
            // On desktop, remove the negative margins so cards don't slide under the edge arrows.
            'overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 we-scrollbar-hover snap-x snap-proximity',
            canScroll ? 'md:px-12' : 'md:px-0',
            // Desktop UX: grab cursor for draggable rails.
            'md:cursor-grab',
            isDragging && 'md:cursor-grabbing select-none'
          )}
          style={isDragging ? ({ scrollBehavior: 'auto' } as any) : undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endDrag(e)}
          onPointerCancel={(e) => endDrag(e)}
          onPointerLeave={(e) => {
            if (dragRef.current.active) endDrag(e);
          }}
          // Fallback for environments where pointer events are flaky:
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            beginDrag(e.clientX, e.clientY);
          }}
          onMouseMove={(e) => {
            if (!dragRef.current.active) return;
            moveDrag(e);
          }}
          onMouseUp={() => endDrag()}
          // Prevent native link/image drag from taking over (common cause of "not draggable").
          onDragStartCapture={(e) => {
            e.preventDefault();
          }}
          onClickCapture={(e) => {
            // If a drag just happened, suppress the click so we don't open a listing while scrolling.
            const ms = dragRef.current.lastDragAtMs;
            if (ms && Date.now() - ms < 300) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <div className="flex gap-4 min-w-max">
            {railListings.map((listing) => (
              <div key={listing.id} className={cn('snap-start flex-shrink-0 overflow-hidden', itemClass)}>
                <ListingCard listing={listing} className="h-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }, (prevProps, nextProps) => {
    // Only re-render if the listing IDs actually changed OR if listing object references changed
    const prevIds = prevProps.listings.map(l => l.id).sort().join(',');
    const nextIds = nextProps.listings.map(l => l.id).sort().join(',');
    const idsChanged = prevIds !== nextIds;
    const emptyTextChanged = prevProps.emptyText !== nextProps.emptyText;
    
    // Also check if listing object references changed (even if IDs are the same)
    // This prevents re-renders when new objects are created with the same IDs
    const refsChanged = prevProps.listings.length !== nextProps.listings.length ||
      prevProps.listings.some((prevListing, idx) => {
        const nextListing = nextProps.listings[idx];
        return !nextListing || prevListing !== nextListing;
      });
    
    
    // Return true if props are the same (skip render), false if they changed (re-render)
    return !idsChanged && !emptyTextChanged && !refsChanged;
  });

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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchInputRef.current?.value?.trim() ?? '';
    if (q) {
      router.push(`/browse?search=${encodeURIComponent(q)}`);
    } else {
      router.push('/browse');
    }
  };

  // Only show hero if user is definitely not signed in (initialized and no user)
  // Don't show hero if still loading or if user exists
  const showHero = initialized && !authLoading && !user;
  
  // Use a ref to remember the last known user state to prevent flickering during navigation
  const lastUserRef = useRef<User | null>(null);
  useEffect(() => {
    if (user) {
      lastUserRef.current = user;
    } else if (initialized && !authLoading) {
      // Only clear if auth is fully initialized and confirmed no user
      lastUserRef.current = null;
    }
  }, [user, initialized, authLoading]);
  
  // Use the current user if available, otherwise fall back to last known user during loading
  const effectiveUser = user || (authLoading ? lastUserRef.current : null);
  
  // Fetch user profile to get displayNamePreference and businessName
  useEffect(() => {
    if (!effectiveUser?.uid) {
      setUserProfile(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const profile = await getUserProfile(effectiveUser.uid);
        if (!cancelled) {
          setUserProfile(profile);
        }
      } catch {
        if (!cancelled) setUserProfile(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveUser?.uid]);
  
  // Get user display name for welcome section
  // - If business name preference is enabled, show business name
  // - Otherwise, show first name only
  const userDisplayName = useMemo(() => {
    if (!effectiveUser) return 'User';
    
    const displayNamePreference = userProfile?.profile?.preferences?.displayNamePreference || 'personal';
    const businessName = userProfile?.profile?.businessName?.trim();
    
    if (displayNamePreference === 'business' && businessName) {
      return businessName;
    }
    
    // Extract first name from full name or display name
    const fullName = userProfile?.profile?.fullName || effectiveUser.displayName || '';
    const firstName = fullName.split(' ')[0] || effectiveUser.email?.split('@')[0] || 'User';
    return firstName;
  }, [effectiveUser, userProfile]);

  return (
    <div className="min-h-screen bg-background">
      {/* Wait for auth to initialize on initial load */}
      {!initialized && authLoading && !lastUserRef.current ? (
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      ) : effectiveUser ? (
        <>
          {/* Signed-in: Search bar */}
          {/* Search Bar - Full width on desktop */}
          <section className="border-b border-border/50 bg-card/50 py-4 md:py-6">
            <div className="container mx-auto px-4">
              <form onSubmit={handleSearchSubmit} className="relative w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  type="text"
                  name="search"
                  placeholder="Search listings, species, breeds, and locations…"
                  defaultValue=""
                  className="pl-11 min-h-[52px] text-base rounded-xl bg-background w-full"
                />
              </form>
            </div>
          </section>
        </>
      ) : showHero ? (
        <>
          {/* Hero Section - Only for non-signed-in users */}
          <section className="relative overflow-hidden min-h-[50vh] md:min-h-[60vh] flex items-center justify-center">
        {/* Background Image with Dark Overlay */}
        <div className="absolute inset-0 z-0">
          <Image
            src="/images/Buck_1.webp"
            alt="Agchange Hero Background"
            fill
            className="object-cover object-[50%_20%]"
            priority
            quality={75}
            sizes="100vw"
            placeholder="blur"
            blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRkqGx0f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyJckliyjqTzSlT54b6bk+h0R//9k="
            fetchPriority="high"
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
            <div className="flex items-center justify-center gap-3 sm:gap-4 md:gap-5 lg:gap-6 mb-4 sm:mb-6 flex-wrap sm:flex-nowrap px-4">
              <div className="hidden md:block relative h-12 w-12 sm:h-16 sm:w-16 md:h-24 md:w-24 lg:h-32 lg:w-32 flex-shrink-0">
                <div className="h-full w-full mask-kudu bg-[hsl(37_27%_70%)]" />
              </div>
              {/* Lighter green (primary) for "Ag", beige for "change". */}
              <div className="dark">
                <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-8xl font-extrabold tracking-tight font-barletta-inline text-[hsl(37,27%,70%)] whitespace-nowrap">
                  <BrandLogoText className="text-inherit" />
                </h1>
              </div>
            </div>
            <p className="text-lg sm:text-xl md:text-2xl mb-6 sm:mb-8 text-white/90 font-medium px-4">
              Texas-only marketplace for whitetail breeders, registered livestock &amp; cattle
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

      {/* Trust Indicators - Only for non-signed-in users */}
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
        </>
      ) : null}

      {/* Signed-in only: Personalized home */}
      {effectiveUser ? (
        <section className="py-10 md:py-12 border-b border-border/50 bg-background">
          <div className="container mx-auto px-4 space-y-8">
            {/* Welcome Section - Above trending listings */}
            <div className="space-y-4">
              <div className="space-y-4">
                <div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h2 className="text-xl md:text-2xl font-bold">Welcome back</h2>
                    <p className="text-lg md:text-xl font-semibold text-foreground">{userDisplayName}</p>
                  </div>
                  <p className="text-sm md:text-base text-muted-foreground mt-1">Pick up where you left off.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button asChild variant="outline" className="min-h-[44px]">
                    <Link href="/browse" className="flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      Browse
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="min-h-[44px]">
                    <Link href="/dashboard/watchlist" className="flex items-center gap-2">
                      <Heart className="h-4 w-4" />
                      Watchlist
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="min-h-[44px]">
                    <Link href="/dashboard/messages" className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Messages
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <div className="space-y-4">
                <SectionHeader
                  title={mostWatched?.length ? "Trending now" : "Explore listings"}
                  subtitle={mostWatched?.length ? "What people are watching right now." : "Fresh listings to start browsing."}
                  href="/browse"
                  actionLabel="Browse all"
                />
                <ListingRail listings={signedInDiscoveryListings} emptyText="Browse listings to get started." />
              </div>

            {showRecentlyViewed ? (
              <div className="space-y-4">
                <SectionHeader
                  title="Recently viewed"
                  subtitle="Your latest clicks — fast way back in."
                  href="/dashboard/recently-viewed"
                />
                <ListingRail listings={recentlyViewedListings.filter((l) => !isHiddenCategoryListing(l))} emptyText="No recently viewed listings yet." />
              </div>
            ) : null}

            {showWatchlist ? (
              <div className="space-y-4">
                <SectionHeader
                  title="Watched items"
                  subtitle="Listings you’re keeping an eye on."
                  href="/dashboard/watchlist"
                  right={
                    <span className="text-xs text-muted-foreground">{watchlistListings.length} watched</span>
                  }
                />
                <ListingRail listings={watchlistListings.filter((l) => !isHiddenCategoryListing(l))} emptyText="No watched items yet. Tap the heart on any listing." />
              </div>
            ) : null}

            {showSavedSellers ? (
              <div className="space-y-4">
                <SectionHeader
                  title="Saved sellers"
                  subtitle="Sellers you follow — with their active inventory."
                  href="/dashboard/watchlist"
                  actionLabel="Manage"
                />
                <div className="overflow-x-auto pb-2 -mx-4 px-4 we-scrollbar-hover">
                  <div className="flex gap-4 min-w-max">
                    {savedSellers.slice(0, 12).map((s) => {
                      const activeCount = activeCountBySellerId[s.sellerId];
                      const href = `/sellers/${s.sellerId}`;
                      const usernameLabel = s.sellerUsername ? `${s.sellerUsername}` : `${s.sellerId.slice(0, 8)}`;
                      const ratingCount = Number(s.ratingCount || 0) || 0;
                      const ratingAvg = Number(s.ratingAverage || 0) || 0;
                      const itemsSold = Number(s.itemsSold || 0) || 0;
                      const positivePercent = Number(s.positivePercent || 0) || 0;
                      const hasRating = ratingCount > 0 && ratingAvg > 0;
                      return (
                        <div
                          key={s.sellerId}
                          className={cn(
                            'group relative min-w-[300px] sm:min-w-[360px] max-w-[360px] h-[236px]',
                            'rounded-2xl border-2 border-border/50 hover:border-primary/40 transition-all',
                            'bg-card/80 shadow-warm hover:shadow-lifted overflow-hidden'
                          )}
                        >
                          {/* Premium background */}
                          <div className="absolute inset-0 bg-gradient-to-br from-primary/18 via-card/60 to-card/80" />
                          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                            <div className="absolute -inset-x-10 -inset-y-6 animate-shimmer bg-gradient-to-r from-transparent via-parchment/10 to-transparent" />
                          </div>

                          <div className="relative h-full p-4 flex flex-col">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="relative h-14 w-14 rounded-2xl overflow-hidden bg-muted border border-border/60 shadow-sm shrink-0">
                                  {s.sellerPhotoURL ? (
                                    <Image src={s.sellerPhotoURL} alt="" fill className="object-cover" sizes="56px" unoptimized />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center text-base font-extrabold text-muted-foreground">
                                      {String(s.sellerDisplayName || 'S').trim().charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <div className="absolute inset-0 ring-2 ring-primary/25" />
                                </div>

                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="font-extrabold leading-tight truncate text-base">
                                      {s.sellerDisplayName}
                                    </div>
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate">{usernameLabel}</div>
                                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                                    <Star className={cn('h-4 w-4', hasRating ? 'text-amber-500' : 'text-muted-foreground/60')} />
                                    <span className="font-semibold text-foreground/90">
                                      {hasRating ? ratingAvg.toFixed(1) : '—'}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {hasRating ? `(${ratingCount})` : 'No ratings yet'}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <Badge
                                variant="outline"
                                className={cn(
                                  'shrink-0 font-extrabold text-[10px] px-2.5 py-1 rounded-full',
                                  'bg-background/35 border-border/60'
                                )}
                                title="Active listings"
                              >
                                {activeCount === null ? '…' : `${activeCount ?? 0}`} active
                              </Badge>
                            </div>

                            <div className="mt-3 grid grid-cols-3 gap-2">
                              <div className="rounded-xl border border-border/50 bg-background/25 px-2.5 py-2">
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sales</div>
                                <div className="text-sm font-extrabold">{itemsSold}</div>
                              </div>
                              <div className="rounded-xl border border-border/50 bg-background/25 px-2.5 py-2">
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Positive</div>
                                <div className="text-sm font-extrabold">{positivePercent > 0 ? `${Math.round(positivePercent)}%` : '—'}</div>
                              </div>
                              <div className="rounded-xl border border-border/50 bg-background/25 px-2.5 py-2">
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Response</div>
                                <div className="text-sm font-extrabold">Fast</div>
                              </div>
                            </div>

                            <div className="mt-auto pt-3 grid grid-cols-2 gap-2">
                              <Button asChild className="w-full h-10 rounded-xl font-extrabold">
                                <Link href={href} className="inline-flex items-center justify-center gap-2">
                                  <Store className="h-4 w-4" />
                                  View store
                                </Link>
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="w-full h-10 rounded-xl font-extrabold"
                                disabled={
                                  messagingSellerId === s.sellerId || (typeof activeCount === 'number' && activeCount <= 0)
                                }
                                onClick={async () => {
                                  if (!user?.uid) return;
                                  try {
                                    setMessagingSellerId(s.sellerId);
                                    const listingsRef = collection(db, 'listings');
                                    const q = query(
                                      listingsRef,
                                      where('sellerId', '==', s.sellerId),
                                      where('status', '==', 'active'),
                                      fsLimit(1)
                                    );
                                    const snap = await getDocs(q);
                                    const listingId = snap.docs[0]?.id;
                                    if (!listingId) {
                                      toast({
                                        title: 'No active listings',
                                        description: 'This seller has no active listings to message about yet.',
                                      });
                                      return;
                                    }
                                    router.push(`/dashboard/messages?listingId=${listingId}&sellerId=${s.sellerId}`);
                                  } catch {
                                    toast({
                                      title: 'Error',
                                      description: 'Failed to start a message',
                                      variant: 'destructive',
                                    });
                                  } finally {
                                    setMessagingSellerId(null);
                                  }
                                }}
                              >
                                <MessageCircle className="h-4 w-4 mr-2" />
                                Message
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {showNewFromSavedSellers ? (
              <div className="space-y-4">
                <SectionHeader
                  title="New from saved sellers"
                  subtitle="Fresh inventory from people you follow."
                  href="/dashboard/watchlist"
                  actionLabel="See sellers"
                />
                <ListingRail listings={newFromSavedSellers.filter((l) => !isHiddenCategoryListing(l))} emptyText="No active listings from your saved sellers yet." />
              </div>
            ) : null}
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

          {/* Mobile-only: 3 animal categories. Compact stacked layout so long labels fit. */}
          <div className="flex justify-center md:hidden">
            <div className="grid grid-cols-3 gap-2 w-full max-w-2xl">
            {[
              { href: '/browse?category=whitetail_breeder', label: 'Whitetail Breeder', icon: <div className="w-8 h-8 icon-primary-color mask-icon-whitetail-breeder" /> },
              { href: '/browse?category=wildlife_exotics', label: 'Registered & Specialty Livestock', icon: <div className="w-8 h-8 icon-primary-color mask-icon-fallow" /> },
              { href: '/browse?category=cattle_livestock', label: 'Cattle & Livestock', icon: <div className="w-8 h-8 icon-primary-color mask-icon-bull" /> },
              {
                href: '/browse?category=horse_equestrian',
                label: 'Horse & Equestrian',
                icon: (
                  <div
                    className="w-8 h-8"
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
              { href: '/browse?category=sporting_working_dogs', label: 'Sporting Dogs', icon: <div className="w-8 h-8 icon-primary-color mask-icon-dog" /> },
              { href: '/browse?category=hunting_outfitter_assets', label: 'Hunting Assets', icon: <div className="w-8 h-8 icon-primary-color mask-icon-hunting-blind" /> },
              { href: '/browse?category=ranch_equipment', label: 'Ranch Equipment', icon: <div className="w-8 h-8 icon-primary-color mask-icon-tractor" /> },
              { href: '/browse?category=ranch_vehicles', label: 'Vehicles & Trailers', icon: <div className="w-8 h-8 icon-primary-color mask-icon-top-drive" /> },
            ].filter((c) => !/dog|horse|equestrian|ranch_equipment|ranch_vehicles|hunting_outfitter/i.test((c.label || '') + (c.href || ''))).map((c) => (
              <Link key={c.href} href={c.href} className="group">
                <Card className="border-2 border-border/60 hover:border-primary/40 transition-colors h-full">
                  <CardContent className="p-2 flex flex-col items-center text-center gap-1.5 min-h-0">
                    <div className="flex-shrink-0">{c.icon}</div>
                    <div className="text-[11px] font-extrabold leading-tight line-clamp-2 min-h-[2.5rem] flex items-center justify-center">
                      {c.label}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
            </div>
          </div>

          {/* Desktop/tablet: 3 animal categories on one line */}
          <div className="hidden md:flex md:justify-center">
            <div className="grid grid-cols-3 gap-6 max-w-4xl w-full">
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

            {/* Registered & Specialty Livestock */}
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
                        <h3 className="text-lg font-bold leading-tight">Registered &amp; Specialty Livestock</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          Axis deer, blackbuck, fallow deer, and other registered ranch species
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

            {/* Ranch Equipment & Attachments — hidden until re-enabled (category not deleted, filter at render) */}
            {!['ranch_equipment'].some((x) => /ranch_equipment/i.test(x)) && (
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
            )}

            {/* Ranch Vehicles & Trailers — hidden until re-enabled (category not deleted, filter at render) */}
            {!['ranch_vehicles'].some((x) => /ranch_vehicles/i.test(x)) && (
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
            )}

            {/* Horse & Equestrian — hidden until re-enabled (category not deleted, filter at render) */}
            {!['horse_equestrian', 'horse'].some((x) => /horse|equestrian/i.test(x)) && (
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
            )}

            {/* Sporting & Working Dogs — hidden for Stripe review (category not deleted, filter at render) */}
            {!['sporting_working_dogs', 'dog'].some((x) => /dog/i.test(x)) && (
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
            )}

            {/* Hunting & Outfitter Assets — hidden until re-enabled (only 3 animal categories for now) */}
            {!['hunting_outfitter_assets'].some((x) => /hunting_outfitter/i.test(x)) && (
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
            )}
            </div>
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
              </div>
            </motion.div>

            <ListingRail listings={featuredListings} emptyText="No featured listings right now." />
          </div>
        </section>
      )}

      {/* Most Watched */}
      {!loading && mostWatched.filter((l) => !isHiddenCategoryListing(l)).length > 0 && (
        <section className="py-12 md:py-16 bg-background border-t border-border/50">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold mb-2 font-founders">Most Watched</h2>
                <p className="text-muted-foreground text-base md:text-lg">Social proof that drives liquidity.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Button variant="outline" asChild>
                  <Link href="/browse">Browse</Link>
                </Button>
              </div>
            </div>
            <ListingRail listings={mostWatched.filter((l) => !isHiddenCategoryListing(l))} emptyText="No watched listings yet." />
          </div>
        </section>
      )}

      {/* Ending Soon */}
      {!loading && endingSoon.filter((l) => !isHiddenCategoryListing(l)).length > 0 && (
        <section className="py-12 md:py-16 bg-background border-t border-border/50">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold mb-2 font-founders">Ending Soon</h2>
                <p className="text-muted-foreground text-base md:text-lg">Auctions closing soon—act now.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Button variant="outline" asChild>
                  <Link href="/browse">View all</Link>
                </Button>
              </div>
            </div>
                <ListingRail listings={stableEndingSoon.filter((l) => !isHiddenCategoryListing(l))} emptyText="No auctions ending soon." />
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
            recentListings.length > 0 ? (
              <ListingRail listings={recentListings} emptyText="No listings available yet." />
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No listings available yet.</p>
              </div>
            )
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
                        <Image src={fieldNotesFeatured.coverImage} alt="" fill className="object-cover transition-transform group-hover:scale-[1.02]" sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" />
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
                  Texas-only animal listings (equipment may be multi-state)
                </span>
                <span className="text-xs px-3 py-1 rounded-full border bg-muted/30">
                  Pre-listing verification + seller eligibility
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
