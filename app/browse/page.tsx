'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Sparkles, ArrowUp, ArrowDown, LayoutGrid, List, X, Gavel, Tag, MessageSquare, Loader2, ArrowLeft, Heart, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ListingCard } from '@/components/listings/ListingCard';
import { FeaturedListingCard } from '@/components/listings/FeaturedListingCard';
import { ListItem } from '@/components/listings/ListItem';
import { SkeletonListingGrid, SkeletonListingList } from '@/components/skeletons/SkeletonCard';
import { EmptyState } from '@/components/ui/empty-state';
import { Spinner } from '@/components/ui/spinner';
import { FilterDialog } from '@/components/navigation/FilterDialog';
import { FilterBottomSheet } from '@/components/navigation/FilterBottomSheet';
import { MobileBrowseFilterSheet } from '@/components/navigation/MobileBrowseFilterSheet';
import { Badge } from '@/components/ui/badge';
import { queryListingsForBrowse, getDistinctListingStates, BrowseCursor, BrowseFilters, BrowseSort } from '@/lib/firebase/listings';
import { FilterState, ListingType, Listing } from '@/lib/types';
import { FLAGS } from '@/lib/featureFlags';
import { getBrowseCacheEntry, setBrowseCache } from '@/lib/browseCache';
import { stableStringify } from '@/lib/stableStringify';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { useToast } from '@/hooks/use-toast';
import { useMinLoading } from '@/hooks/use-min-loading';
import { cn } from '@/lib/utils';
import { formatUserFacingError } from '@/lib/format-user-facing-error';
import { useAuth } from '@/hooks/use-auth';
import { getSavedSearch } from '@/lib/firebase/savedSearches';
import { BrowseFiltersSidebar } from '@/components/browse/BrowseFiltersSidebar';
import { BROWSE_EQUIPMENT_CONDITION_OPTIONS, BROWSE_STATES, DELIVERY_TIMEFRAME_OPTIONS } from '@/components/browse/filters/constants';
import { buildSavedSearchKeys, upsertSavedSearch } from '@/lib/firebase/savedSearches';
import { normalizeCategory } from '@/lib/listings/normalizeCategory';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';

type SortOption = 'newest' | 'oldest' | 'price-low' | 'price-high' | 'ending-soon' | 'featured';

type ViewMode = 'card' | 'list';

function getSortChipLabel(sortBy: SortOption, listingStatus: 'active' | 'completed' | 'sold'): string {
  switch (sortBy) {
    case 'newest': return listingStatus === 'sold' ? 'Recently sold' : 'Newest';
    case 'oldest': return listingStatus === 'sold' ? 'Oldest sold' : 'Oldest';
    case 'price-low': return 'Price: Low';
    case 'price-high': return 'Price: High';
    case 'ending-soon': return 'Ending soon';
    case 'featured': return 'Featured';
    default: return 'Newest';
  }
}

function toMillisSafe(value: any): number | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value?.toDate === 'function') {
    try {
      const d = value.toDate();
      if (d instanceof Date && Number.isFinite(d.getTime())) return d.getTime();
    } catch {
      // ignore
    }
  }
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
  }
  return null;
}

function isDogListing(l: Listing): boolean {
  const cat = (l?.category ?? '').toString().toLowerCase();
  if (/dog/i.test(cat)) return true;
  const species = (l as any)?.species ?? (l as any)?.attributes?.speciesId ?? '';
  if (String(species).toLowerCase() === 'dog') return true;
  const breed = ((l as any)?.attributes?.breed ?? (l as any)?.breed ?? '').toString().toLowerCase();
  const dogBreedTerms = ['golden', 'retriever', 'labrador', 'lab ', 'lab,', 'pointer', 'setter', 'hound', 'shepherd', 'doodle', 'beagle', 'terrier', 'dachshund'];
  if (dogBreedTerms.some((t) => breed.includes(t))) return true;
  if (/dog/i.test((l?.title ?? '').toString())) return true;
  return false;
}

function isHorseListing(l: Listing): boolean {
  const cat = (l?.category ?? '').toString().toLowerCase();
  if (/horse|equestrian/i.test(cat)) return true;
  const species = (l as any)?.species ?? (l as any)?.attributes?.speciesId ?? '';
  if (String(species).toLowerCase() === 'horse') return true;
  return false;
}

function isRanchEquipmentOrVehiclesListing(l: Listing): boolean {
  const cat = (l?.category ?? '').toString().toLowerCase();
  return cat === 'ranch_equipment' || cat === 'ranch_vehicles';
}

function isHuntingOutfitterListing(l: Listing): boolean {
  const cat = (l?.category ?? '').toString().toLowerCase();
  return cat === 'hunting_outfitter_assets';
}

function isHiddenCategoryListing(l: Listing): boolean {
  return isDogListing(l) || isHorseListing(l) || isRanchEquipmentOrVehiclesListing(l) || isHuntingOutfitterListing(l);
}

export default function BrowsePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlReadRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300); // Debounce search
  const [filters, setFilters] = useState<FilterState>({});
  const [selectedType, setSelectedType] = useState<ListingType | 'all'>('all');
  const [listingStatus, setListingStatus] = useState<'active' | 'completed' | 'sold'>('active');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [priceDialogOpen, setPriceDialogOpen] = useState(false);
  const [priceMinInput, setPriceMinInput] = useState<string>('');
  const [priceMaxInput, setPriceMaxInput] = useState<string>('');
  const [saveSearchDialogOpen, setSaveSearchDialogOpen] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');
  const [saveSearchPreview, setSaveSearchPreview] = useState<{
    hasCriteria: boolean;
    criteria: FilterState;
    summary: Array<{ label: string; value: string }>;
    defaultName: string;
  } | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showSkeleton = useMinLoading(!loading, 300);
  const [nextCursor, setNextCursor] = useState<BrowseCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const isInitialLoadRef = useRef(true);
  const lastRevalidatedKeyRef = useRef<string | null>(null);
  const STALE_REVALIDATE_MS = 12_000;

  // View mode with localStorage persistence — read on first client render so skeleton and content match (no flash)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'card';
    const saved = localStorage.getItem('browse-view-mode');
    return saved === 'list' || saved === 'card' ? saved : 'card';
  });
  const [savingSearch, setSavingSearch] = useState(false);
  const [savedSearchConfirmOpen, setSavedSearchConfirmOpen] = useState(false);
  const [savedSearchConfirmEmail, setSavedSearchConfirmEmail] = useState(true);
  const [savedSearchConfirmPush, setSavedSearchConfirmPush] = useState(false);
  const [savedSearchConfirmId, setSavedSearchConfirmId] = useState<string | null>(null);
  const [savedSearchConfirmDraft, setSavedSearchConfirmDraft] = useState<FilterState | null>(null);
  const [savedSearchConfirmName, setSavedSearchConfirmName] = useState<string>('');
  const [listingStates, setListingStates] = useState<{ value: string; label: string }[] | null>(null);

  // Item Location: only states that have at least one active listing (desktop + mobile)
  useEffect(() => {
    let cancelled = false;
    getDistinctListingStates()
      .then((codes) => {
        if (cancelled) return;
        const mapped = codes
          .map((code) => {
            const entry = BROWSE_STATES.find((s) => s.value === code);
            return entry ? { value: entry.value, label: entry.label } : null;
          })
          .filter((x): x is { value: string; label: string } => x !== null);
        setListingStates(mapped.length ? mapped : null);
      })
      .catch(() => {
        if (!cancelled) setListingStates(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Deep link: /browse?savedSearchId=... loads criteria for the signed-in user.
  useEffect(() => {
    const savedSearchId = searchParams?.get('savedSearchId');
    if (!savedSearchId) return;
    if (!user?.uid) return;

    (async () => {
      try {
        const ss = await getSavedSearch(user.uid, savedSearchId);
        if (!ss) return;
        const criteria = ss.criteria || {};
        const nextType = (criteria as any).type || 'all';
        setSelectedType(nextType);
        const { type, query, ...rest } = criteria as any;
        setFilters(rest);
        setSearchQuery(typeof query === 'string' ? query : '');
        toast({ title: 'Saved search loaded', description: ss.name || 'Criteria applied to Browse.' });
      } catch (e) {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user?.uid]);

  // Public deep links: /browse?status=active|completed|sold&category=...&state=...&type=...&speciesId=...
  useEffect(() => {
    const savedSearchId = searchParams?.get('savedSearchId');
    if (savedSearchId) return; // Saved search should take precedence.

    const status = searchParams?.get('status');
    // Back-compat: `ended` deep links map to Completed.
    if (status === 'active' || status === 'sold' || status === 'completed') setListingStatus(status as any);
    if (status === 'ended') setListingStatus('completed');

    const type = searchParams?.get('type');
    // Back-compat: ignore legacy `classified` deep links.
    if (type === 'auction' || type === 'fixed' || type === 'all') {
      setSelectedType(type as any);
    }

    const category = searchParams?.get('category');
    const state = searchParams?.get('state');
    const speciesId = searchParams?.get('speciesId');
    const searchParam = searchParams?.get('search');

    // Set search query from URL parameter
    if (searchParam) {
      setSearchQuery(searchParam);
    }

    setFilters((prev) => {
      const next: any = { ...(prev || {}) };
      if (category) {
        try {
          next.category = normalizeCategory(category);
        } catch {
          // Ignore invalid category deep links (fail closed).
        }
      }
      if (state) next.location = { ...(next.location || {}), state };
      if (speciesId) next.species = [speciesId];
      return next;
    });
    urlReadRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Phase 2B: deterministic cache key — must change when any input that affects results changes
  const cacheKey = useMemo(() => {
    if (!FLAGS.browseCache) return '';
    const q = debouncedSearchQuery?.trim() || '';
    const limit = q ? 120 : 20;
    return 'browse:' + stableStringify({
      listingStatus,
      selectedType,
      filters,
      sortBy,
      searchQuery: q,
      limit,
    });
  }, [listingStatus, selectedType, filters, sortBy, debouncedSearchQuery]);

  // eBay-style: sync browse state to URL so back/forward and sharing work
  useEffect(() => {
    if (!urlReadRef.current) return;
    const q = searchQuery?.trim() || '';
    const params = new URLSearchParams();
    if (q) params.set('search', q);
    if (selectedType !== 'all') params.set('type', selectedType);
    if (listingStatus !== 'active') params.set('status', listingStatus);
    if (filters.category) params.set('category', filters.category);
    if (filters.location?.state) params.set('state', filters.location.state);
    if (filters.species?.[0]) params.set('speciesId', filters.species[0]);
    const query = params.toString();
    const url = query ? `${pathname ?? '/browse'}?${query}` : (pathname ?? '/browse');
    router.replace(url, { scroll: false });
  }, [pathname, router, searchQuery, selectedType, listingStatus, filters]);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('browse-view-mode', mode);
    }
  };

  // Keep the price dialog inputs in sync with applied filters (when closed)
  useEffect(() => {
    if (priceDialogOpen) return;
    setPriceMinInput(filters.minPrice !== undefined ? String(filters.minPrice) : '');
    setPriceMaxInput(filters.maxPrice !== undefined ? String(filters.maxPrice) : '');
  }, [filters.minPrice, filters.maxPrice, priceDialogOpen]);

  function buildSaveSearchPreview(): {
    hasCriteria: boolean;
    criteria: FilterState;
    summary: Array<{ label: string; value: string }>;
    defaultName: string;
  } {
    const q = searchQuery?.trim() || '';
    const criteria: FilterState = {
      ...(filters || {}),
      ...(selectedType !== 'all' ? { type: selectedType as any } : {}),
      ...(q ? { query: q } : {}),
    };

    const summary: Array<{ label: string; value: string }> = [];
    if (q) summary.push({ label: 'Query', value: q });
    if (selectedType !== 'all') summary.push({ label: 'Type', value: String(selectedType) });
    if (filters.category) summary.push({ label: 'Category', value: String(filters.category) });
    if (filters.location?.state) summary.push({ label: 'State', value: String(filters.location.state) });
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      const min = filters.minPrice !== undefined ? `$${Number(filters.minPrice).toLocaleString()}` : 'Any';
      const max = filters.maxPrice !== undefined ? `$${Number(filters.maxPrice).toLocaleString()}` : 'Any';
      summary.push({ label: 'Price', value: `${min} – ${max}` });
    }
    if (
      (filters.category === 'ranch_equipment' ||
        filters.category === 'ranch_vehicles' ||
        filters.category === 'hunting_outfitter_assets') &&
      filters.healthStatus &&
      filters.healthStatus.length
    ) {
      const opt = BROWSE_EQUIPMENT_CONDITION_OPTIONS.find((o) => o.value === filters.healthStatus![0]);
      summary.push({ label: 'Condition', value: opt?.label || String(filters.healthStatus[0]) });
    }
    if (filters.verifiedSeller) summary.push({ label: 'Verified seller', value: 'Yes' });
    if (filters.transportReady) summary.push({ label: 'Transport ready', value: 'Yes' });
    if (filters.deliveryTimeframe) {
      const label = DELIVERY_TIMEFRAME_OPTIONS.find((o) => o.value === filters.deliveryTimeframe)?.label ?? filters.deliveryTimeframe;
      summary.push({ label: 'Delivery timeframe', value: label });
    }
    if (filters.endingSoon) summary.push({ label: 'Ending soon', value: 'Within 24h' });
    if (filters.newlyListed) summary.push({ label: 'Newly listed', value: 'Within 7d' });
    if (filters.featured) summary.push({ label: 'Featured', value: 'Yes' });

    const hasCriteria =
      Boolean(q) ||
      selectedType !== 'all' ||
      Object.entries(filters || {}).some(([k, v]) => {
        if (v === undefined || v === null) return false;
        if (Array.isArray(v)) return v.length > 0;
        if (typeof v === 'object') return Object.values(v).some(Boolean);
        if (typeof v === 'boolean') return v === true;
        return true;
      });

    const defaultName = q
      ? `Saved search: ${q.slice(0, 60)}`
      : `Saved search: ${selectedType === 'all' ? 'All listings' : String(selectedType)}`;

    return { hasCriteria, criteria, summary, defaultName };
  }

  const openSaveSearchDialog = () => {
    if (!user?.uid) {
      toast({ title: 'Sign in required', description: 'Sign in to save searches and get alerts.' });
      return;
    }
    const preview = buildSaveSearchPreview();
    setSaveSearchPreview(preview);
    setSaveSearchName(preview.defaultName);
    setSaveSearchDialogOpen(true);
  };

  const quickSaveSearchMobile = async () => {
    if (!user?.uid) {
      toast({ title: 'Sign in required', description: 'Sign in to save searches and get alerts.' });
      return;
    }
    const preview = buildSaveSearchPreview();
    setSavingSearch(true);
    try {
      const criteria = preview.criteria;
      const name = preview.defaultName;
      const id = await upsertSavedSearch(user.uid, {
        data: {
          name,
          criteria,
          alertFrequency: 'instant',
          channels: { inApp: true, email: true, push: false },
          lastNotifiedAt: null,
          keys: buildSavedSearchKeys(criteria),
        },
      });
      setSavedSearchConfirmId(id);
      setSavedSearchConfirmDraft(criteria);
      setSavedSearchConfirmName(name);
      setSavedSearchConfirmEmail(true);
      setSavedSearchConfirmPush(false);
      setSavedSearchConfirmOpen(true);
    } catch (e: any) {
      toast({ title: 'Save failed', description: formatUserFacingError(e, 'Could not save this search.'), variant: 'destructive' });
    } finally {
      setSavingSearch(false);
    }
  };

  const handleConfirmSaveSearch = async () => {
    if (!user?.uid || !saveSearchPreview) return;
    if (!saveSearchPreview.hasCriteria) return;
    setSavingSearch(true);
    try {
      const criteria = saveSearchPreview.criteria;
      const id = await upsertSavedSearch(user.uid, {
        data: {
          name: saveSearchName?.trim() || saveSearchPreview.defaultName,
          criteria,
          alertFrequency: 'instant',
          channels: { inApp: true, email: true, push: false },
          lastNotifiedAt: null,
          keys: buildSavedSearchKeys(criteria),
        },
      });
      toast({ title: 'Saved', description: 'Search saved. You can manage it in Saved Searches.' });
      setSaveSearchDialogOpen(false);
      void id;
    } catch (e: any) {
      toast({ title: 'Save failed', description: formatUserFacingError(e, 'Could not save this search.'), variant: 'destructive' });
    } finally {
      setSavingSearch(false);
    }
  };

  // Convert UI filters to Firestore query filters
  const getBrowseFilters = (): BrowseFilters => {
    const browseFilters: BrowseFilters = { lifecycle: listingStatus };
    
    // Active feed: always query only status=active. Ended auctions appear only when
    // user explicitly filters for "Completed" (or similar).
    if (selectedType !== 'all') {
      browseFilters.type = selectedType;
    }
    
    if (filters.category) {
      browseFilters.category = filters.category;
    }
    
    if (filters.location?.state) {
      browseFilters.location = { state: filters.location.state };
    }
    
    if (filters.featured) {
      browseFilters.featured = true;
    }
    if (filters.deliveryTimeframe) {
      browseFilters.deliveryTimeframe = filters.deliveryTimeframe;
    }
    
    // Price filters (Firestore limitation: can only use range on one field)
    if (filters.maxPrice !== undefined) {
      browseFilters.maxPrice = filters.maxPrice;
    }
    if (filters.minPrice !== undefined && (sortBy === 'price-low' || sortBy === 'price-high')) {
      browseFilters.minPrice = filters.minPrice;
    }
    
    return browseFilters;
  };
  
  // Convert UI sort to Firestore sort
  const getBrowseSort = (): BrowseSort => {
    switch (sortBy) {
      case 'newest':
        return 'newest';
      case 'oldest':
        return 'oldest';
      case 'price-low':
        return 'priceAsc';
      case 'price-high':
        return 'priceDesc';
      case 'ending-soon':
        return 'endingSoon';
      case 'featured':
        // Featured is handled as a filter, sort by newest
        return 'newest';
      default:
        return 'newest';
    }
  };
  
  // Load initial page (resets pagination).
  // When isRefetch (we already have listings): keep them visible, don't clear — avoids glitchy swap to skeleton.
  // When cacheKey is provided and FLAGS.browseCache, updates cache on success (for revalidate or cold load).
  const loadInitial = async (isRefetch?: boolean, cacheKeyForUpdate?: string) => {
    try {
      if (!isRefetch) setLoading(true);
      setError(null);
      if (!isRefetch) {
        setListings([]);
        setNextCursor(null);
        setHasMore(false);
      }

      const browseFilters = getBrowseFilters();
      const browseSort = getBrowseSort();

      const q = debouncedSearchQuery?.trim() || '';
      const limitCount = q ? 120 : 20;

      const result = await queryListingsForBrowse({
        limit: limitCount,
        filters: browseFilters,
        sort: browseSort,
      });

      setListings(result.items);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
      if (FLAGS.browseCache && cacheKeyForUpdate) {
        setBrowseCache(cacheKeyForUpdate, {
          listings: result.items,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
        });
        if (process.env.NODE_ENV === 'development') {
          console.log('[BROWSE_CACHE] set', cacheKeyForUpdate.slice(0, 80));
        }
      }
    } catch (err) {
      console.error('Error fetching listings:', err);
      const errorMessage = formatUserFacingError(err, 'Failed to load listings');
      setError(errorMessage);
      toast({
        title: 'Failed to load listings',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      isInitialLoadRef.current = false;
    }
  };
  
  // Load more (pagination)
  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;

    try {
      setLoadingMore(true);

      const browseFilters = getBrowseFilters();
      const browseSort = getBrowseSort();
      const q = debouncedSearchQuery?.trim() || '';
      const limitCount = q ? 120 : 20;

      const result = await queryListingsForBrowse({
        limit: limitCount,
        cursor: nextCursor,
        filters: browseFilters,
        sort: browseSort,
      });

      const combined = [...listings, ...result.items];
      setListings(combined);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
      if (FLAGS.browseCache && cacheKey) {
        setBrowseCache(cacheKey, {
          listings: combined,
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
        });
      }
    } catch (err) {
      console.error('Error loading more listings:', err);
      toast({
        title: 'Failed to load more listings',
        description: formatUserFacingError(err, 'Please try again'),
        variant: 'destructive',
      });
    } finally {
      setLoadingMore(false);
    }
  };

  // eBay-style real-time: when user clicks a filter/sort/type, listings update immediately.
  // Phase 2B: when FLAGS.browseCache, try cache first; revalidate once if stale (>= 12s).
  useEffect(() => {
    if (listingStatus !== 'active' && sortBy === 'ending-soon') {
      setSortBy('newest');
      return;
    }
    if (FLAGS.browseCache && cacheKey) {
      const entry = getBrowseCacheEntry(cacheKey);
      if (entry) {
        setListings(entry.data.listings);
        setNextCursor(entry.data.nextCursor);
        setHasMore(entry.data.hasMore);
        setLoading(false);
        setError(null);
        isInitialLoadRef.current = false;
        if (process.env.NODE_ENV === 'development') {
          console.log('[BROWSE_CACHE] hit', cacheKey.slice(0, 80));
        }
        const age = Date.now() - entry.ts;
        if (age >= STALE_REVALIDATE_MS && lastRevalidatedKeyRef.current !== cacheKey) {
          lastRevalidatedKeyRef.current = cacheKey;
          loadInitial(true, cacheKey);
        }
        return;
      }
      if (process.env.NODE_ENV === 'development') {
        console.log('[BROWSE_CACHE] miss', cacheKey.slice(0, 80));
      }
      loadInitial(false, cacheKey);
      return;
    }
    loadInitial(listings.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType, filters, sortBy, listingStatus, debouncedSearchQuery, cacheKey]);

  // Animals don't use "condition" on Browse; only equipment-like categories do.
  // If the user switches away, clear any stale condition selection so results don't look broken.
  useEffect(() => {
    if (
      filters.category === 'ranch_equipment' ||
      filters.category === 'ranch_vehicles' ||
      filters.category === 'hunting_outfitter_assets'
    )
      return;
    if (!filters.healthStatus || filters.healthStatus.length === 0) return;
    setFilters((p) => ({ ...(p || {}), healthStatus: undefined }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.category]);

  // Client-side filtering for fields not supported by Firestore
  // (Full-text search, city-level location, metadata fields, etc.)
  const filteredListings = useMemo(() => {
    let result = [...listings];

    // Hide dog and horse/equestrian listings until those categories are re-enabled (inline filter, no backend change)
    result = result.filter((l) => !isHiddenCategoryListing(l));

    // Exclude ended auctions from active feed; they appear only when user filters for "Completed"
    if (listingStatus === 'active') {
      result = result.filter((listing) => {
        if (listing.status === 'ended' || listing.status === 'expired') return false;
        const endMs =
          listing.endAt?.getTime?.() && Number.isFinite(listing.endAt.getTime())
            ? listing.endAt.getTime()
            : listing.endsAt?.getTime?.() && Number.isFinite(listing.endsAt.getTime())
              ? listing.endsAt.getTime()
              : null;
        if (endMs && endMs <= Date.now() && !listing.soldAt) return false;
        return true;
      });
    }

    // Full-text search (client-side only - Firestore doesn't support full-text search)
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      result = result.filter((listing) => {
        // Search in title, description, location
        const basicMatch = 
          listing.title.toLowerCase().includes(query) ||
          listing.description.toLowerCase().includes(query) ||
          listing.location?.city?.toLowerCase().includes(query) ||
          listing.location?.state?.toLowerCase().includes(query);
        
        // Search in attributes (species, breed, equipmentType, etc.)
        const attributesMatch = listing.attributes
          ? (
              String((listing.attributes as any).speciesId || '').toLowerCase().includes(query) ||
              (listing.attributes as any).breed?.toLowerCase().includes(query) ||
              (listing.attributes as any).equipmentType?.toLowerCase().includes(query) ||
              (listing.attributes as any).make?.toLowerCase().includes(query) ||
              (listing.attributes as any).model?.toLowerCase().includes(query) ||
              listing.category.toLowerCase().includes(query)
            )
          : false;
        
        return basicMatch || attributesMatch;
      });
    }

    // City-level location filter (client-side - Firestore only supports state)
    if (filters.location?.city) {
      result = result.filter((listing) => listing.location?.city === filters.location?.city);
    }

    // Client-side minPrice filter (when not using price sort)
    if (filters.minPrice !== undefined && sortBy !== 'price-low' && sortBy !== 'price-high') {
      result = result.filter((listing) => {
        const price = listing.price || listing.currentBid || listing.startingBid || 0;
        return price >= filters.minPrice!;
      });
    }

    // Species/Breed filter (client-side - attributes not indexed)
    if (filters.species && filters.species.length > 0) {
      result = result.filter((listing) =>
        filters.species!.some((species) => {
          if (listing.attributes) {
            const attrs = listing.attributes as any;
            const token = species.toLowerCase();
            const speciesId = String(attrs.speciesId || '').toLowerCase();
            const breed = String(attrs.breed || '').toLowerCase();
            const equipmentType = String(attrs.equipmentType || '').toLowerCase();
            return speciesId === token || speciesId.includes(token) || breed.includes(token) || equipmentType.includes(token);
          }
          return false;
        })
      );
    }

    // Quantity filter (client-side - attributes not indexed)
    if (filters.quantity) {
      result = result.filter((listing) => {
        const qty = listing.attributes && 'quantity' in listing.attributes 
          ? (listing.attributes as any).quantity || 1
          : 1;
        switch (filters.quantity) {
          case 'single':
            return qty === 1;
          case 'pair':
            return qty >= 2 && qty <= 5;
          case 'small-group':
            return qty >= 6 && qty <= 10;
          case 'large-group':
            return qty >= 11;
          case 'lot':
            return qty > 20;
          default:
            return true;
        }
      });
    }

    // Condition / health status filter (client-side - attributes not indexed)
    if (filters.healthStatus && filters.healthStatus.length > 0) {
      result = result.filter((listing) =>
        filters.healthStatus!.some((status) => {
          if (listing.attributes) {
            const attrs = listing.attributes as any;
            // Equipment-like categories use `attributes.condition` (enum).
            if (
              listing.category === 'ranch_equipment' ||
              listing.category === 'ranch_vehicles' ||
              listing.category === 'hunting_outfitter_assets'
            ) {
              return String(attrs.condition || '').toLowerCase() === String(status || '').toLowerCase();
            }
            // Animals: legacy "health notes include" matching (but UI no longer exposes this on Browse).
            return attrs.healthNotes?.toLowerCase().includes(String(status).toLowerCase());
          }
          return false;
        })
      );
    }

    // Papers filter (client-side - attributes not indexed)
    if (filters.papers !== undefined) {
      result = result.filter((listing) => {
        if (listing.attributes && 'registered' in listing.attributes) {
          return (listing.attributes as any).registered === filters.papers;
        }
        return false;
      });
    }

    // Verified seller filter (client-side - nested field not indexed)
    if (filters.verifiedSeller) {
      result = result.filter((listing) => listing.sellerSnapshot?.verified || listing.trust?.verified);
    }

    // Transport ready filter (client-side - nested field not indexed)
    if (filters.transportReady) {
      result = result.filter((listing) => listing.trust?.transportReady);
    }

    // Ending soon filter (client-side - time-based calculation)
    if (filters.endingSoon) {
      const now = Date.now();
      const dayInMs = 24 * 60 * 60 * 1000;
      result = result.filter((listing) => {
        if (listing.type !== 'auction' || !listing.endsAt) return false;
        const endsAtMs = toMillisSafe((listing as any).endsAt);
        if (!endsAtMs) return false;
        const timeLeft = endsAtMs - now;
        return timeLeft > 0 && timeLeft <= dayInMs;
      });
    }

    // Newly listed filter (client-side - time-based calculation)
    if (filters.newlyListed) {
      const now = Date.now();
      const weekInMs = 7 * 24 * 60 * 60 * 1000;
      result = result.filter((listing) => {
        const listedTime = toMillisSafe((listing as any).createdAt) || 0;
        const timeSinceListing = now - listedTime;
        return timeSinceListing <= weekInMs;
      });
    }

    return result;
  }, [listings, debouncedSearchQuery, filters, sortBy]);

  // Client-side sorting only for 'featured' (server handles others)
  const sortedListings = useMemo(() => {
    if (sortBy === 'featured') {
      const sorted = [...filteredListings];
      return sorted.sort((a, b) => {
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        const bt = toMillisSafe((b as any).createdAt) || 0;
        const at = toMillisSafe((a as any).createdAt) || 0;
        return bt - at;
      });
    }
    // All other sorts are handled server-side
    return filteredListings;
  }, [filteredListings, sortBy]);

  const handleFilterChange = (newFilters: FilterState) => {
    // If user chose a type inside the dialog, sync the browse tabs and remove it from the filter blob.
    const next = { ...newFilters } as any;
    // IMPORTANT: `type` lives in the top tabs (`selectedType`) but some filter UIs (dialogs)
    // also allow setting/clearing it. Treat presence of the key as authoritative (including `undefined`).
    if (Object.prototype.hasOwnProperty.call(next, 'type')) {
      const t = next.type;
      setSelectedType(t === 'auction' || t === 'fixed' || t === 'classified' ? t : 'all');
      delete next.type;
    }
    setFilters((prev) => {
      const out: any = { ...next };

      // Mutual exclusivity: allow only one of (endingSoon, newlyListed) at a time.
      if (out.endingSoon && out.newlyListed) {
        const prevEnding = Boolean((prev as any)?.endingSoon);
        const prevNew = Boolean((prev as any)?.newlyListed);

        // Prefer the one the user likely just toggled on (difference from previous state).
        const endingChanged = prevEnding !== Boolean(out.endingSoon);
        const newChanged = prevNew !== Boolean(out.newlyListed);

        if (newChanged && !endingChanged) {
          out.endingSoon = undefined;
        } else {
          out.newlyListed = undefined;
        }
      }

      return out;
    });
  };

  const clearFilters = () => {
    setFilters({});
    setSelectedType('all');
    setSearchQuery('');
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedType !== 'all') count++;
    if (searchQuery) count++;
    if (filters.category) count++;
    if (filters.location?.state || filters.location?.city) count++;
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) count++;
    if (filters.species && filters.species.length > 0) count++;
    if (filters.quantity) count++;
    if (filters.healthStatus && filters.healthStatus.length > 0) count++;
    if (filters.papers !== undefined) count++;
    if (filters.verifiedSeller) count++;
    if (filters.transportReady) count++;
    if (filters.deliveryTimeframe) count++;
    if (filters.endingSoon) count++;
    if (filters.newlyListed) count++;
    if (filters.featured) count++;
    return count;
  }, [filters, selectedType, searchQuery]);

  const headerRef = useRef<HTMLDivElement | null>(null);
  const [mobileHeaderH, setMobileHeaderH] = useState(0);

  // Mobile sticky header can be unreliable inside transformed/scroll containers on some devices.
  // We use a fixed header on mobile and measure its height to offset the page content.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const update = () => {
      const h = Math.ceil(el.getBoundingClientRect().height || 0);
      if (Number.isFinite(h)) setMobileHeaderH(h);
    };

    update();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => update());
      ro.observe(el);
      return () => ro.disconnect();
    }

    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div
      className="min-h-screen bg-background pb-bottom-nav-safe md:pb-4 pt-[var(--browse-header-h)] md:pt-0"
      style={{ ['--browse-header-h' as any]: `${mobileHeaderH}px` }}
    >
      <ScrollToTop />
      
      {/* Header */}
      <div
        ref={headerRef}
        // Mobile: keep the browse header fixed, but position it *below* the global navbar (h-20),
        // otherwise the search bar appears "missing" because it's hidden behind the navbar.
        className="fixed top-20 left-0 right-0 z-40 md:sticky md:top-0 bg-background/95 backdrop-blur-sm border-b border-border/50"
      >
        <div className="container mx-auto px-3 py-2 md:px-4 md:py-4">
          <div className="rounded-xl md:rounded-2xl border border-border bg-card text-foreground shadow-sm backdrop-blur-md p-2 md:p-4 dark:border-background/20 dark:bg-foreground/92 dark:text-background">
            <div className="flex flex-col gap-2 md:gap-3">
              {/* Row 1: Mobile = search full width; Desktop = search + Clear */}
              <div className="flex flex-col md:flex-row gap-2 md:gap-3 md:items-center md:justify-between">
                {/* Mobile: search bar full width on its own row */}
                <div className="w-full min-w-0 md:flex-1 md:max-w-2xl">
                  <div className="md:hidden w-full">
                    <div className="relative w-full">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground dark:text-white/70" />
                      <Input
                        type="text"
                        placeholder="Search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={cn(
                          'w-full pl-9 pr-10 min-h-[44px] text-sm rounded-full',
                          'bg-background text-foreground border-border placeholder:text-muted-foreground caret-foreground',
                          'focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-ring/40',
                          'dark:bg-white/15 dark:border-white/25 dark:text-white dark:placeholder:text-white/60 dark:caret-white',
                          'dark:focus-visible:ring-white/40 dark:focus-visible:border-white/40'
                        )}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={quickSaveSearchMobile}
                        disabled={savingSearch}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full text-foreground hover:bg-muted dark:text-white/90 dark:hover:bg-white/20 dark:hover:text-white"
                        aria-label="Save search"
                      >
                        <Heart className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Desktop: search + theme toggle */}
                  <div className="hidden md:flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Search listings, species, breeds, and locations…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={cn(
                          'pl-11 min-h-[52px] text-base md:text-sm rounded-xl',
                          'bg-background text-foreground caret-foreground',
                          'border-border/70 placeholder:text-muted-foreground',
                          'focus-visible:ring-ring/40 focus-visible:ring-2'
                        )}
                      />
                    </div>
                    <ThemeToggle className="border border-border text-foreground hover:bg-muted rounded-xl dark:border-background/30 dark:text-background dark:hover:bg-background/10" />
                  </div>
                </div>

                <div className="hidden md:flex items-center gap-2 w-full md:w-auto flex-shrink-0">
                  <div className="hidden md:block lg:hidden">
                    <FilterDialog
                      filters={{
                        ...(filters || {}),
                        type: selectedType === 'all' ? undefined : (selectedType as any),
                      }}
                      onFiltersChange={handleFilterChange}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearFilters}
                    disabled={activeFilterCount === 0}
                    className="h-9 px-3 md:min-h-[48px] md:px-4 text-xs md:text-base font-semibold rounded-full border-border text-foreground hover:bg-muted flex-shrink-0 dark:border-background/30 dark:text-background dark:hover:bg-background/10"
                  >
                    <X className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1.5 md:mr-2" />
                    Clear
                  </Button>
                </div>
              </div>

              {/* Row 2: Desktop only – type tabs + quick filters. Mobile: buying format is in Filter sheet. */}
              <div className="hidden md:flex flex-col md:flex-row gap-0 md:gap-2 md:items-center md:justify-between md:px-0 md:pb-0">
                <Tabs
                  value={selectedType}
                  onValueChange={(value) => setSelectedType(value as ListingType | 'all')}
                  className="w-full md:w-auto"
                >
                  <TabsList className="w-full md:w-auto grid grid-cols-4 bg-muted/50 rounded-xl p-1 border border-border h-auto dark:bg-background/10 dark:border-background/20">
                    <TabsTrigger value="all" className="rounded-lg font-semibold min-w-0 text-base py-2">
                      All
                    </TabsTrigger>
                    <TabsTrigger value="auction" className="rounded-lg font-semibold min-w-0 text-base py-2">
                      <span className="inline-flex items-center gap-2">
                        <Gavel className="h-4 w-4" />
                        Auctions
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="fixed" className="rounded-lg font-semibold min-w-0 text-base py-2">
                      <span className="inline-flex items-center gap-2">
                        <Tag className="h-4 w-4" />
                        Fixed Price
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value="classified" className="rounded-lg font-semibold min-w-0 text-base py-2">
                      <span className="inline-flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Classified
                      </span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Desktop quick filters */}
                <div className="hidden md:flex items-center gap-2 flex-wrap justify-start md:justify-end">
                  <Button
                    type="button"
                    variant={filters.endingSoon ? 'default' : 'outline'}
                    size="sm"
                    className="h-10 px-3 font-semibold rounded-full"
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        endingSoon: prev.endingSoon ? undefined : true,
                        ...(prev.endingSoon ? {} : { newlyListed: undefined }),
                      }))
                    }
                  >
                    Ending soon
                  </Button>
                  <Button
                    type="button"
                    variant={filters.newlyListed ? 'default' : 'outline'}
                    size="sm"
                    className="h-10 px-3 font-semibold rounded-full"
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        newlyListed: prev.newlyListed ? undefined : true,
                        ...(prev.newlyListed ? {} : { endingSoon: undefined }),
                      }))
                    }
                  >
                    Newly listed
                  </Button>
                  <Button
                    type="button"
                    variant={filters.verifiedSeller ? 'default' : 'outline'}
                    size="sm"
                    className="h-10 px-3 font-semibold rounded-full"
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, verifiedSeller: prev.verifiedSeller ? undefined : true }))
                    }
                  >
                    Verified
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="hidden md:inline-flex h-10 px-3 font-semibold rounded-full"
                    onClick={openSaveSearchDialog}
                    disabled={savingSearch}
                  >
                    {savingSearch ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Save this search
                  </Button>
                </div>
              </div>

              {/* Mobile: eBay-style – search bar, then one scrollable row (Filter, Buying format, Sort, Price, Location, List); scrollbar on hover */}
              <div className="md:hidden pt-1">
                <div
                  className={cn(
                    'flex items-center gap-2 min-w-0',
                    'overflow-x-auto overflow-y-hidden pt-1 pb-2 we-scrollbar-hover-inverted'
                  )}
                >
                  <MobileBrowseFilterSheet
                    filters={{
                      ...(filters || {}),
                      type: selectedType === 'all' ? undefined : (selectedType as any),
                    }}
                    onFiltersChange={handleFilterChange}
                    listingStates={listingStates}
                    className="flex-shrink-0 h-8 px-2.5 rounded-full text-xs font-semibold gap-1.5 bg-muted border-border text-foreground hover:bg-muted/80 dark:bg-white/15 dark:border-white/30 dark:text-white dark:hover:bg-white/25"
                  />

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          'h-8 px-2.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 bg-muted border-border text-foreground hover:bg-muted/80 dark:bg-white/15 dark:border-white/30 dark:text-white dark:hover:bg-white/25',
                          listingStatus !== 'active' && 'dark:bg-white/25 dark:border-white/40'
                        )}
                      >
                        {listingStatus === 'active' ? 'Active' : listingStatus === 'completed' ? 'Completed' : 'Sold'}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={8} className="w-52">
                      <DropdownMenuItem onSelect={() => setListingStatus('active')}>Active</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setListingStatus('completed')}>Completed</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setListingStatus('sold')}>Sold</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                    variant={filters.location?.state ? 'default' : 'outline'}
                    className="h-8 px-2.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 bg-muted border-border text-foreground hover:bg-muted/80 dark:bg-white/15 dark:border-white/30 dark:text-white dark:hover:bg-white/25"
                  >
                    Item Location
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={8} className="w-64 max-h-[360px] overflow-y-auto">
                      <DropdownMenuItem
                        onSelect={() => setFilters((p) => ({ ...p, location: { ...(p.location || {}), state: undefined } }))}
                      >
                        Any state
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {(listingStates ?? BROWSE_STATES).map((s) => (
                        <DropdownMenuItem
                          key={s.value}
                          onSelect={() => setFilters((p) => ({ ...p, location: { ...(p.location || {}), state: s.value } }))}
                        >
                          {s.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                    variant="outline"
                    className="h-8 px-2.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 bg-muted border-border text-foreground hover:bg-muted/80 dark:bg-white/15 dark:border-white/30 dark:text-white dark:hover:bg-white/25"
                      >
                        {getSortChipLabel(sortBy, listingStatus)}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={8} className="w-56">
                      <DropdownMenuItem onSelect={() => setSortBy('newest')}>Newest</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setSortBy('oldest')}>Oldest</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setSortBy('price-low')}>Price: Low to High</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setSortBy('price-high')}>Price: High to Low</DropdownMenuItem>
                      {listingStatus !== 'sold' ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => setSortBy('ending-soon')}>Ending soon</DropdownMenuItem>
                        </>
                      ) : null}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setSortBy('featured')}>Featured</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn(
                          'h-8 px-2.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 bg-muted border-border text-foreground hover:bg-muted/80 dark:bg-white/15 dark:border-white/30 dark:text-white dark:hover:bg-white/25',
                          selectedType !== 'all' && 'dark:bg-white/25 dark:border-white/40'
                        )}
                      >
                        {selectedType === 'all'
                          ? 'Buying format'
                          : selectedType === 'fixed'
                            ? 'Buy Now'
                            : selectedType === 'auction'
                              ? 'Auction'
                              : 'Classified'}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={8} className="w-52">
                      <DropdownMenuItem onSelect={() => setSelectedType('all')}>All</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setSelectedType('auction')}>Auction</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setSelectedType('fixed')}>Buy Now</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setSelectedType('classified')}>Classified</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    type="button"
                    variant={filters.minPrice !== undefined || filters.maxPrice !== undefined ? 'default' : 'outline'}
                    className="h-8 px-2.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 bg-muted border-border text-foreground hover:bg-muted/80 dark:bg-white/15 dark:border-white/30 dark:text-white dark:hover:bg-white/25"
                    onClick={() => setPriceDialogOpen(true)}
                  >
                    Price
                  </Button>

                  {filters.category === 'ranch_equipment' ||
                  filters.category === 'ranch_vehicles' ||
                  filters.category === 'hunting_outfitter_assets' ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant={(filters.healthStatus && filters.healthStatus.length > 0) ? 'default' : 'outline'}
                          className="h-8 px-2.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 bg-muted border-border text-foreground hover:bg-muted/80 dark:bg-white/15 dark:border-white/30 dark:text-white dark:hover:bg-white/25"
                        >
                          Condition
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" sideOffset={8} className="w-56">
                        <DropdownMenuItem
                          onSelect={() => setFilters((p) => ({ ...p, healthStatus: undefined }))}
                        >
                          Any condition
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {BROWSE_EQUIPMENT_CONDITION_OPTIONS.map((o) => (
                          <DropdownMenuItem
                            key={o.value}
                            onSelect={() => setFilters((p) => ({ ...p, healthStatus: [o.value] }))}
                          >
                            {o.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                    variant="outline"
                    className="h-8 px-2.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 bg-muted border-border text-foreground hover:bg-muted/80 dark:bg-white/15 dark:border-white/30 dark:text-white dark:hover:bg-white/25"
                      >
                        {viewMode === 'list' ? 'List' : 'Gallery'}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" sideOffset={8} className="w-44">
                      <DropdownMenuItem onSelect={() => handleViewModeChange('card')}>Gallery</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleViewModeChange('list')}>List</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearFilters}
                    disabled={activeFilterCount === 0}
                    className="h-8 px-2.5 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 bg-muted border-border text-foreground hover:bg-muted/80 dark:bg-white/15 dark:border-white/30 dark:text-white dark:hover:bg-white/25 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5 mr-1.5" />
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile: Price dialog (quick chip control) */}
      <Dialog open={priceDialogOpen} onOpenChange={setPriceDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
          <DialogHeader>
            <DialogTitle>Price</DialogTitle>
            <DialogDescription>Set a min/max price range.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="browse-price-min" className="text-sm font-semibold">
                Min
              </Label>
              <Input
                id="browse-price-min"
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={priceMinInput}
                onChange={(e) => setPriceMinInput(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="browse-price-max" className="text-sm font-semibold">
                Max
              </Label>
              <Input
                id="browse-price-max"
                type="number"
                inputMode="numeric"
                placeholder="No limit"
                value={priceMaxInput}
                onChange={(e) => setPriceMaxInput(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 min-h-[44px]"
              onClick={() => {
                setFilters((p) => ({ ...p, minPrice: undefined, maxPrice: undefined }));
                setPriceDialogOpen(false);
              }}
            >
              Clear
            </Button>
            <Button
              type="button"
              className="flex-1 min-h-[44px]"
              onClick={() => {
                const min = priceMinInput.trim() ? Number(priceMinInput) : undefined;
                const max = priceMaxInput.trim() ? Number(priceMaxInput) : undefined;
                setFilters((p) => ({
                  ...p,
                  minPrice: Number.isFinite(min as any) && (min as any) > 0 ? (min as any) : undefined,
                  maxPrice: Number.isFinite(max as any) && (max as any) > 0 ? (max as any) : undefined,
                }));
                setPriceDialogOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save search confirmation */}
      <Dialog
        open={saveSearchDialogOpen}
        onOpenChange={(open) => {
          setSaveSearchDialogOpen(open);
          if (!open) {
            setSaveSearchPreview(null);
            setSaveSearchName('');
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
          <DialogHeader>
            <DialogTitle>Save this search</DialogTitle>
            <DialogDescription>
              {saveSearchPreview?.hasCriteria
                ? 'Review what will be saved, then confirm.'
                : 'Pick at least one filter or enter a search term before saving.'}
            </DialogDescription>
          </DialogHeader>

          {saveSearchPreview?.hasCriteria ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="save-search-name" className="text-sm font-semibold">
                  Name
                </Label>
                <Input
                  id="save-search-name"
                  value={saveSearchName}
                  onChange={(e) => setSaveSearchName(e.target.value)}
                  placeholder="Saved search name"
                  className="min-h-[44px]"
                />
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <div className="text-sm font-semibold mb-2">This will save:</div>
                <ul className="space-y-1.5 text-sm">
                  {(saveSearchPreview.summary.length ? saveSearchPreview.summary : [{ label: 'All', value: 'All listings' }]).map((s) => (
                    <li key={`${s.label}:${s.value}`} className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">{s.label}</span>
                      <span className="font-medium text-right">{s.value}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 min-h-[44px]"
                  onClick={() => setSaveSearchDialogOpen(false)}
                  disabled={savingSearch}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="flex-1 min-h-[44px]"
                  onClick={handleConfirmSaveSearch}
                  disabled={savingSearch}
                >
                  {savingSearch ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    'Save search'
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
                Nothing to save yet. Try selecting a Category, Location, Type, or entering a search term in the search bar.
              </div>
              <Button type="button" className="w-full min-h-[44px]" onClick={() => setSaveSearchDialogOpen(false)}>
                Got it
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-2 md:py-6">
        <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-8">
          {/* Desktop filter rail: scrollable when tall; overscroll-contain prevents scroll chaining to page */}
          <aside className="hidden lg:block self-start">
            <div className="sticky top-[104px] max-h-[calc(100vh-104px)] overflow-y-auto overflow-x-hidden overscroll-contain min-h-0 pr-1 -mr-1 we-scrollbar-hover [scrollbar-gutter:stable]">
              <BrowseFiltersSidebar value={filters} onChange={handleFilterChange} onClearAll={clearFilters} listingStates={listingStates} />
            </div>
          </aside>

          <div>
            {/* Results Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-3 md:mb-6 gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold mb-1 break-words">
              {showSkeleton
                ? 'Loading...'
                : searchQuery.trim()
                  ? `${sortedListings.length.toLocaleString()}+ results for ${searchQuery.trim()}`
                  : `${sortedListings.length} ${listingStatus === 'sold' ? 'Sold ' : ''}${
                      sortedListings.length === 1 ? 'Listing' : 'Listings'
                    }`}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              {activeFilterCount > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {activeFilterCount} {activeFilterCount === 1 ? 'filter' : 'filters'} active
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Refine results with filters, location, and sort.</p>
              )}
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 text-sm font-semibold"
                onClick={openSaveSearchDialog}
                disabled={savingSearch}
              >
                {savingSearch ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save this search
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* eBay-ish toolbar: Status, (Condition for equipment), Location, Sort, View */}
            <Select value={listingStatus} onValueChange={(v) => setListingStatus(v as any)}>
              <SelectTrigger className="w-[150px] min-h-[48px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
              </SelectContent>
            </Select>

            {filters.category === 'ranch_equipment' ||
            filters.category === 'ranch_vehicles' ||
            filters.category === 'hunting_outfitter_assets' ? (
              <Select
                value={(filters.healthStatus && filters.healthStatus.length ? filters.healthStatus[0] : '__any__') as any}
                onValueChange={(v) => setFilters((p) => ({ ...p, healthStatus: v === '__any__' ? undefined : [v] }))}
              >
                <SelectTrigger className="w-[170px] min-h-[48px]">
                  <SelectValue placeholder="Condition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">Condition</SelectItem>
                  {BROWSE_EQUIPMENT_CONDITION_OPTIONS.map((h) => (
                    <SelectItem key={h.value} value={h.value}>
                      {h.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <Select
              value={filters.location?.state || '__any__'}
              onValueChange={(v) => setFilters((p) => ({ ...p, location: { ...(p.location || {}), state: v === '__any__' ? undefined : v } }))}
            >
              <SelectTrigger className="w-[170px] min-h-[48px]">
                <SelectValue placeholder="Item Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">Item Location</SelectItem>
                {(listingStates ?? BROWSE_STATES).map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort Dropdown */}
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
              <SelectTrigger className="w-full md:w-[180px] min-h-[48px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">
                  <div className="flex items-center gap-2">
                    <ArrowDown className="h-4 w-4" />
                    {listingStatus === 'sold' ? 'Recently sold' : 'Newest'}
                  </div>
                </SelectItem>
                <SelectItem value="oldest">
                  <div className="flex items-center gap-2">
                    <ArrowUp className="h-4 w-4" />
                    {listingStatus === 'sold' ? 'Oldest sold' : 'Oldest'}
                  </div>
                </SelectItem>
                <SelectItem value="price-low">
                  <div className="flex items-center gap-2">
                    <ArrowUp className="h-4 w-4" />
                    Price: Low to High
                  </div>
                </SelectItem>
                <SelectItem value="price-high">
                  <div className="flex items-center gap-2">
                    <ArrowDown className="h-4 w-4" />
                    Price: High to Low
                  </div>
                </SelectItem>
                {listingStatus !== 'sold' ? <SelectItem value="ending-soon">Ending Soon</SelectItem> : null}
                <SelectItem value="featured">Featured First</SelectItem>
              </SelectContent>
            </Select>

            {/* View Mode Toggle (desktop/tablet only; mobile is always list) */}
            <div className="hidden md:flex items-center gap-1 border border-border rounded-lg p-1 bg-card">
              <Button
                variant={viewMode === 'card' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewModeChange('card')}
                className="h-10 px-3"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewModeChange('list')}
                className="h-10 px-3"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
            </div>

            {/* Full skeleton only on initial load (no listings yet). Match viewMode so grid/list transition is smooth. Mobile always list. */}
            {(loading || showSkeleton) && !error && listings.length === 0 && isInitialLoadRef.current && (
              <div className="animate-in fade-in-0 duration-200">
                <div className="md:hidden">
                  <SkeletonListingList count={8} variant="browseMobile" />
                </div>
                {viewMode === 'card' ? (
                  <div className="hidden md:block">
                    <SkeletonListingGrid count={12} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6" />
                  </div>
                ) : (
                  <div className="hidden md:block">
                    <SkeletonListingList count={8} />
                  </div>
                )}
              </div>
            )}

            {/* Error State */}
            {error && !loading && (
              <div className="text-center py-12">
                <p className="text-destructive mb-4">{error}</p>
                <Button onClick={() => window.location.reload()}>Retry</Button>
              </div>
            )}

            {/* Empty State */}
            {!error && sortedListings.length === 0 && !((loading || showSkeleton) && listings.length === 0 && isInitialLoadRef.current) && (
              <EmptyState
                icon={activeFilterCount > 0 ? Filter : Sparkles}
                title={activeFilterCount > 0 ? 'No results match your filters' : 'No listings yet'}
                description={
                  activeFilterCount > 0
                    ? 'Clear filters or broaden your search.'
                    : 'Check back soon or browse all categories.'
                }
                action={
                  activeFilterCount > 0
                    ? { label: 'Clear filters', onClick: clearFilters }
                    : { label: 'Browse all categories', href: '/browse' }
                }
                className="py-12"
              />
            )}

            {/* Listings Grid/List — show when we have results; during refetch keep previous results + "Updating" indicator */}
            {!error && sortedListings.length > 0 && !((loading || showSkeleton) && listings.length === 0 && isInitialLoadRef.current) && (
              <>
                {/* Subtle "Updating…" bar when refetching (filters changed); dim grid slightly */}
                {loading && listings.length > 0 && (
                  <div className="flex items-center gap-2 py-2 px-3 mb-2 rounded-lg bg-muted/50 text-muted-foreground text-sm animate-in fade-in-0 duration-150">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    <span>Updating…</span>
                  </div>
                )}
                <div className={cn('transition-opacity duration-150', loading && listings.length > 0 && 'opacity-85')}>
                  {/* Mobile: always list view (eBay-style) */}
                  <div className="md:hidden space-y-3">
                    <AnimatePresence>
                      {sortedListings.map((listing) => (
                        <ListItem key={listing.id} listing={listing} variant="browseMobile" />
                      ))}
                    </AnimatePresence>
                  </div>

                  {/* Desktop/tablet: respect view mode */}
                  {viewMode === 'card' ? (
                    <div className="hidden md:block w-full">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                        <AnimatePresence>
                          {sortedListings.map((listing) =>
                            listing.featured ? (
                              <div key={listing.id} className="w-full">
                                <FeaturedListingCard listing={listing} className="h-full" />
                              </div>
                            ) : (
                              <div key={listing.id} className="w-full">
                                <ListingCard listing={listing} className="h-full" />
                              </div>
                            )
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  ) : (
                    <div className="hidden md:block w-full space-y-4">
                      <AnimatePresence>
                        {sortedListings.map((listing) => (
                          <ListItem key={listing.id} listing={listing} />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
                
                {/* Load More Button */}
                {hasMore && (
                  <div className="flex justify-center mt-8">
                    <Button
                      onClick={loadMore}
                      disabled={loadingMore || loading}
                      variant="outline"
                      size="lg"
                      className="min-w-[200px]"
                    >
                      {loadingMore ? (
                        <>
                          <Spinner size="sm" className="mr-2 shrink-0" />
                          Loading…
                        </>
                      ) : (
                        'Load More'
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: "Search saved!" confirmation sheet (eBay-style) */}
      <Sheet open={savedSearchConfirmOpen} onOpenChange={setSavedSearchConfirmOpen}>
        <SheetContent side="bottom" className="p-0">
          <div className="px-4 pt-5 pb-4 border-b border-border/50">
            <SheetHeader>
              <SheetTitle>Search saved!</SheetTitle>
              <SheetDescription>Get alert emails and push notifications for new matches.</SheetDescription>
            </SheetHeader>
          </div>

          <div className="px-4 py-4 space-y-4">
            <div className="rounded-xl border border-border/60 bg-background/40 p-3">
              <div className="text-sm font-semibold">{savedSearchConfirmName || 'Saved search'}</div>
              {savedSearchConfirmId ? <div className="text-xs text-muted-foreground mt-0.5">ID: {savedSearchConfirmId}</div> : null}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/40 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">Email alerts</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Recommended so you never miss a match.</div>
                </div>
                <Switch checked={savedSearchConfirmEmail} onCheckedChange={setSavedSearchConfirmEmail} />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/40 p-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">Push notifications</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Fastest alerts (requires permission).</div>
                </div>
                <Switch checked={savedSearchConfirmPush} onCheckedChange={setSavedSearchConfirmPush} />
              </div>
            </div>
          </div>

          <div className="px-4 pb-5 pt-3 border-t border-border/50 bg-background">
            <Button
              className="w-full min-h-[48px] font-semibold"
              onClick={async () => {
                if (!user?.uid || !savedSearchConfirmDraft || !savedSearchConfirmId) {
                  setSavedSearchConfirmOpen(false);
                  return;
                }
                setSavingSearch(true);
                try {
                  await upsertSavedSearch(user.uid, {
                    id: savedSearchConfirmId,
                    data: {
                      name: savedSearchConfirmName || 'Saved search',
                      criteria: savedSearchConfirmDraft,
                      alertFrequency: 'instant',
                      channels: { inApp: true, email: savedSearchConfirmEmail, push: savedSearchConfirmPush },
                      lastNotifiedAt: null,
                      keys: buildSavedSearchKeys(savedSearchConfirmDraft),
                    },
                  });
                  toast({ title: 'Saved', description: 'Search saved and alerts updated.' });
                } catch (e: any) {
                  toast({ title: 'Update failed', description: formatUserFacingError(e, 'Could not update alerts.'), variant: 'destructive' });
                } finally {
                  setSavingSearch(false);
                  setSavedSearchConfirmOpen(false);
                }
              }}
              disabled={savingSearch}
            >
              {savingSearch ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirm
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
