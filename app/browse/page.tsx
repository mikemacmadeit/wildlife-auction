'use client';

import { useState, useMemo, useEffect } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Sparkles, ArrowUp, ArrowDown, LayoutGrid, List, X, Gavel, Tag, MessageSquare, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import { SkeletonListingGrid } from '@/components/skeletons/SkeletonCard';
import { FilterDialog } from '@/components/navigation/FilterDialog';
import { FilterBottomSheet } from '@/components/navigation/FilterBottomSheet';
import { BottomNav } from '@/components/navigation/BottomNav';
import { Badge } from '@/components/ui/badge';
import { queryListingsForBrowse, BrowseCursor, BrowseFilters, BrowseSort } from '@/lib/firebase/listings';
import { FilterState, ListingType, Listing } from '@/lib/types';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { getSavedSearch } from '@/lib/firebase/savedSearches';
import { BrowseFiltersSidebar } from '@/components/browse/BrowseFiltersSidebar';
import { BROWSE_HEALTH_STATUS_OPTIONS, BROWSE_STATES } from '@/components/browse/filters/constants';
import { buildSavedSearchKeys, upsertSavedSearch } from '@/lib/firebase/savedSearches';

type SortOption = 'newest' | 'oldest' | 'price-low' | 'price-high' | 'ending-soon' | 'featured';

type ViewMode = 'card' | 'list';

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

export default function BrowsePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300); // Debounce search
  const [filters, setFilters] = useState<FilterState>({});
  const [selectedType, setSelectedType] = useState<ListingType | 'all'>('all');
  const [listingStatus, setListingStatus] = useState<'active' | 'sold' | 'ended'>('active');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<BrowseCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  
  // View mode with localStorage persistence
  // Initialize to 'card' to ensure server/client consistency
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [savingSearch, setSavingSearch] = useState(false);

  // Load from localStorage after hydration (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('browse-view-mode');
      if (saved === 'card' || saved === 'list') {
        setViewMode(saved);
      }
    }
  }, []);

  // Deep link: /browse?savedSearchId=... loads criteria for the signed-in user.
  useEffect(() => {
    const savedSearchId = searchParams.get('savedSearchId');
    if (!savedSearchId) return;
    if (!user?.uid) return;

    (async () => {
      try {
        const ss = await getSavedSearch(user.uid, savedSearchId);
        if (!ss) return;
        const criteria = ss.criteria || {};
        const nextType = (criteria as any).type || 'all';
        setSelectedType(nextType);
        const { type, ...rest } = criteria as any;
        setFilters(rest);
        toast({ title: 'Saved search loaded', description: ss.name || 'Criteria applied to Browse.' });
      } catch (e) {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user?.uid]);

  // Public deep links (used by sold listing pages): /browse?status=active&category=...&state=...&type=...&speciesId=...
  useEffect(() => {
    const savedSearchId = searchParams.get('savedSearchId');
    if (savedSearchId) return; // Saved search should take precedence.

    const status = searchParams.get('status');
    if (status === 'active' || status === 'sold' || status === 'ended') {
      setListingStatus(status as any);
    }

    const type = searchParams.get('type');
    if (type === 'auction' || type === 'fixed' || type === 'classified' || type === 'all') {
      setSelectedType(type as any);
    }

    const category = searchParams.get('category');
    const state = searchParams.get('state');
    const speciesId = searchParams.get('speciesId');

    setFilters((prev) => {
      const next: any = { ...(prev || {}) };
      if (category) next.category = category;
      if (state) next.location = { ...(next.location || {}), state };
      if (speciesId) next.species = [speciesId];
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('browse-view-mode', mode);
    }
  };

  const handleSaveThisSearch = async () => {
    if (!user?.uid) {
      toast({ title: 'Sign in required', description: 'Sign in to save searches and get alerts.' });
      return;
    }
    setSavingSearch(true);
    try {
      const criteria: FilterState = {
        ...(filters || {}),
        ...(selectedType !== 'all' ? { type: selectedType as any } : {}),
      };
      const id = await upsertSavedSearch(user.uid, {
        data: {
          name: searchQuery?.trim()
            ? `Saved search: ${searchQuery.trim().slice(0, 60)}`
            : `Saved search: ${selectedType === 'all' ? 'All listings' : String(selectedType)}`,
          criteria,
          alertFrequency: 'instant',
          channels: { inApp: true, email: true, push: false },
          lastNotifiedAt: null,
          keys: buildSavedSearchKeys(criteria),
        },
      });
      toast({ title: 'Saved', description: 'Search saved. You can manage it in Saved Searches.' });
      // Optionally deep-link to edit/manage
      // router.push(`/dashboard/saved-searches?highlight=${id}`);
      void id;
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || 'Could not save this search.', variant: 'destructive' });
    } finally {
      setSavingSearch(false);
    }
  };

  // Convert UI filters to Firestore query filters
  const getBrowseFilters = (): BrowseFilters => {
    const browseFilters: BrowseFilters = {
      status: listingStatus === 'ended' ? 'expired' : listingStatus,
    };
    
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
  
  // Load initial page (resets pagination)
  const loadInitial = async () => {
    try {
      setLoading(true);
      setError(null);
      setListings([]);
      setNextCursor(null);
      setHasMore(false);
      
      const browseFilters = getBrowseFilters();
      const browseSort = getBrowseSort();
      
      const result = await queryListingsForBrowse({
        limit: 20,
        filters: browseFilters,
        sort: browseSort,
      });
      
      setListings(result.items);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch (err) {
      console.error('Error fetching listings:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to load listings';
      setError(errorMessage);
      toast({
        title: 'Failed to load listings',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };
  
  // Load more (pagination)
  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    
    try {
      setLoadingMore(true);
      
      const browseFilters = getBrowseFilters();
      const browseSort = getBrowseSort();
      
      const result = await queryListingsForBrowse({
        limit: 20,
        cursor: nextCursor,
        filters: browseFilters,
        sort: browseSort,
      });
      
      setListings((prev) => [...prev, ...result.items]);
      setNextCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch (err) {
      console.error('Error loading more listings:', err);
      toast({
        title: 'Failed to load more listings',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setLoadingMore(false);
    }
  };
  
  // Load initial page when filters/sort change
  useEffect(() => {
    // Sold listings don't have an "ending soon" concept.
    if (listingStatus === 'sold' && sortBy === 'ending-soon') {
      setSortBy('newest');
      return;
    }
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType, filters, sortBy, listingStatus]);

  // Client-side filtering for fields not supported by Firestore
  // (Full-text search, city-level location, metadata fields, etc.)
  const filteredListings = useMemo(() => {
    let result = [...listings];

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

    // Health status filter (client-side - attributes not indexed)
    if (filters.healthStatus && filters.healthStatus.length > 0) {
      result = result.filter((listing) =>
        filters.healthStatus!.some((status) => {
          if (listing.attributes) {
            const attrs = listing.attributes as any;
            return attrs.healthNotes?.toLowerCase().includes(status.toLowerCase());
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
    setFilters(next);
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
    if (filters.endingSoon) count++;
    if (filters.newlyListed) count++;
    if (filters.featured) count++;
    return count;
  }, [filters, selectedType, searchQuery]);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-4">
      <ScrollToTop />
      
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="container mx-auto px-4 py-4">
          <div className="rounded-2xl border border-border/60 bg-card/70 shadow-sm backdrop-blur-md p-3 sm:p-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                <div className="flex-1 w-full md:max-w-2xl">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search listings, species, breeds, and locations…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className={cn(
                        'pl-11 min-h-[52px] text-base md:text-sm rounded-xl',
                        'bg-background/70 border-border/60',
                        'focus-visible:ring-primary/30 focus-visible:ring-2'
                      )}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                  <div className="md:hidden">
                    <FilterBottomSheet
                      filters={{
                        ...(filters || {}),
                        type: selectedType === 'all' ? undefined : (selectedType as any),
                      }}
                      onFiltersChange={handleFilterChange}
                    />
                  </div>
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
                    className="min-h-[48px] px-4 font-semibold"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Clear
                  </Button>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
                {/* Type Tabs */}
                <Tabs
                  value={selectedType}
                  onValueChange={(value) => setSelectedType(value as ListingType | 'all')}
                  className="w-full md:w-auto"
                >
                  {/* No scroll bar needed: 4 tabs always fit */}
                  <TabsList className="w-full md:w-auto grid grid-cols-4 bg-muted/40 rounded-xl p-1 border border-border/50">
                    <TabsTrigger value="all" className="rounded-lg font-semibold min-w-0">
                      All
                    </TabsTrigger>
                    <TabsTrigger value="auction" className="rounded-lg font-semibold min-w-0">
                      <span className="hidden sm:inline-flex items-center gap-2">
                        <Gavel className="h-4 w-4" />
                        Auctions
                      </span>
                      <span className="sm:hidden">Auction</span>
                    </TabsTrigger>
                    <TabsTrigger value="fixed" className="rounded-lg font-semibold min-w-0">
                      <span className="hidden sm:inline-flex items-center gap-2">
                        <Tag className="h-4 w-4" />
                        Fixed Price
                      </span>
                      <span className="sm:hidden">Buy Now</span>
                    </TabsTrigger>
                    <TabsTrigger value="classified" className="rounded-lg font-semibold min-w-0">
                      <span className="hidden sm:inline-flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Classified
                      </span>
                      <span className="sm:hidden">Classified</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Quick filters (eBay-style “Refine”) */}
                <div className="flex items-center gap-2 flex-wrap justify-start md:justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 px-3 font-semibold rounded-full"
                    onClick={handleSaveThisSearch}
                    disabled={savingSearch}
                  >
                    {savingSearch ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Save this search
                  </Button>
                  <Button
                    type="button"
                    variant={filters.endingSoon ? 'default' : 'outline'}
                    size="sm"
                    className="h-10 px-3 font-semibold rounded-full"
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, endingSoon: prev.endingSoon ? undefined : true }))
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
                      setFilters((prev) => ({ ...prev, newlyListed: prev.newlyListed ? undefined : true }))
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
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="lg:grid lg:grid-cols-[280px_1fr] lg:gap-8">
          {/* Desktop filter rail */}
          <aside className="hidden lg:block">
            <div className="sticky top-[104px]">
              <BrowseFiltersSidebar value={filters} onChange={handleFilterChange} onClearAll={clearFilters} />
            </div>
          </aside>

          <div>
            {/* Results Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold mb-1 break-words">
              {loading
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
                onClick={handleSaveThisSearch}
                disabled={savingSearch}
              >
                {savingSearch ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save this search
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* eBay-ish toolbar: Status, Condition, Location, Sort, View */}
            <Select value={listingStatus} onValueChange={(v) => setListingStatus(v as any)}>
              <SelectTrigger className="w-[150px] min-h-[48px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">All (Active)</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
                <SelectItem value="ended">Ended</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={(filters.healthStatus && filters.healthStatus.length ? filters.healthStatus[0] : '__any__') as any}
              onValueChange={(v) => setFilters((p) => ({ ...p, healthStatus: v === '__any__' ? undefined : [v] }))}
            >
              <SelectTrigger className="w-[170px] min-h-[48px]">
                <SelectValue placeholder="Condition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">Condition</SelectItem>
                {BROWSE_HEALTH_STATUS_OPTIONS.map((h) => (
                  <SelectItem key={h.value} value={h.value}>
                    {h.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={filters.location?.state || '__any__'}
              onValueChange={(v) => setFilters((p) => ({ ...p, location: { ...(p.location || {}), state: v === '__any__' ? undefined : v } }))}
            >
              <SelectTrigger className="w-[170px] min-h-[48px]">
                <SelectValue placeholder="Item Location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">Item Location</SelectItem>
                {BROWSE_STATES.map((s) => (
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

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 border border-border rounded-lg p-1 bg-card">
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

            {/* Loading State */}
            {loading && (
              <div className="py-12">
                <SkeletonListingGrid count={12} />
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
            {!loading && !error && sortedListings.length === 0 && (
              <Card className="p-12 text-center">
                <CardContent>
                  <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-semibold mb-2">No listings found</h3>
                  <p className="text-muted-foreground mb-4">
                    {activeFilterCount > 0
                      ? 'Try adjusting your filters or search query.'
                      : 'Check back soon for new listings.'}
                  </p>
                  {activeFilterCount > 0 && (
                    <Button variant="outline" onClick={clearFilters}>
                      Clear Filters
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Listings Grid/List */}
            {!loading && !error && sortedListings.length > 0 && (
              <>
                <div
                  className={cn(
                    viewMode === 'card'
                      ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                      : 'space-y-4'
                  )}
                >
                  <AnimatePresence>
                    {sortedListings.map((listing) =>
                      viewMode === 'card' ? (
                        listing.featured ? (
                          <FeaturedListingCard key={listing.id} listing={listing} />
                        ) : (
                          <ListingCard key={listing.id} listing={listing} />
                        )
                      ) : (
                        <ListItem key={listing.id} listing={listing} />
                      )
                    )}
                  </AnimatePresence>
                </div>
                
                {/* Load More Button */}
                {hasMore && (
                  <div className="flex justify-center mt-8">
                    <Button
                      onClick={loadMore}
                      disabled={loadingMore}
                      variant="outline"
                      size="lg"
                      className="min-w-[200px]"
                    >
                      {loadingMore ? (
                        <>
                          <div className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                          Loading...
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

      <BottomNav />
    </div>
  );
}
