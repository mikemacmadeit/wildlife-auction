'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Truck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ListingCard } from '@/components/listings/ListingCard';
import { FeaturedListingCard } from '@/components/listings/FeaturedListingCard';
import { ListItem } from '@/components/listings/ListItem';
import { SkeletonListingGrid } from '@/components/skeletons/SkeletonCard';
import { BottomNav } from '@/components/navigation/BottomNav';
import { queryListingsForBrowse, BrowseCursor, BrowseFilters, BrowseSort } from '@/lib/firebase/listings';
import { FilterState, ListingType, Listing } from '@/lib/types';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type SortOption = 'newest' | 'oldest' | 'price-low' | 'price-high' | 'ending-soon' | 'featured';
type ViewMode = 'card' | 'list';

export default function RanchVehiclesBrowsePage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [filters, setFilters] = useState<FilterState>({});
  const [selectedType, setSelectedType] = useState<ListingType | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<BrowseCursor | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('card');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('browse-view-mode');
      if (saved === 'card' || saved === 'list') setViewMode(saved);
    }
  }, []);

  const getBrowseFilters = useCallback((): BrowseFilters => {
    const browseFilters: BrowseFilters = {
      status: 'active',
      category: 'ranch_vehicles',
    };
    if (selectedType !== 'all') browseFilters.type = selectedType;
    return browseFilters;
  }, [selectedType]);

  const getSortOption = useCallback((): BrowseSort => {
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
        return 'newest';
      default:
        return 'newest';
    }
  }, [sortBy]);

  const fetchListings = useCallback(
    async (reset = false) => {
      try {
        if (reset) {
          setLoading(true);
          setListings([]);
          setNextCursor(null);
        } else {
          setLoadingMore(true);
        }

        const result = await queryListingsForBrowse({
          limit: 20,
          cursor: reset ? undefined : nextCursor || undefined,
          filters: getBrowseFilters(),
          sort: getSortOption(),
        });

        setListings((prev) => (reset ? result.items : [...prev, ...result.items]));
        setNextCursor(result.nextCursor || null);
        setHasMore(result.hasMore);
        setError(null);
      } catch (err: any) {
        console.error('Error fetching listings:', err);
        setError(err.message || 'Failed to load listings');
        toast({ title: 'Error', description: err.message || 'Failed to load listings', variant: 'destructive' });
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [getBrowseFilters, getSortOption, nextCursor, toast]
  );

  useEffect(() => {
    fetchListings(true);
  }, [fetchListings]);

  const filteredListings = useMemo(() => {
    let result = listings;
    if (debouncedSearchQuery.trim()) {
      const q = debouncedSearchQuery.toLowerCase();
      result = result.filter((listing) => {
        const titleMatch = listing.title.toLowerCase().includes(q);
        const descMatch = listing.description.toLowerCase().includes(q);
        const makeModelMatch =
          listing.attributes && 'make' in (listing.attributes as any)
            ? `${String((listing.attributes as any)?.make || '')} ${String((listing.attributes as any)?.model || '')}`
                .toLowerCase()
                .includes(q)
            : false;
        return titleMatch || descMatch || makeModelMatch;
      });
    }
    return result;
  }, [listings, debouncedSearchQuery]);

  if (loading && listings.length === 0) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6">
        <div className="container mx-auto px-4 py-6 md:py-8">
          <SkeletonListingGrid count={12} />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8">
        <div className="mb-6 md:mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Truck className="h-8 w-8 text-primary" />
            <h1 className="text-3xl md:text-4xl font-extrabold text-foreground">Ranch Vehicles &amp; Trailers</h1>
          </div>
          <p className="text-base md:text-lg text-muted-foreground">
            Ranch-use vehicles and transport equipment, including trucks, UTVs, stock trailers, goosenecks, flatbeds, and utility trailers.
          </p>
        </div>

        <Card className="mb-6 border-2">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search by type, make, model, or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={selectedType} onValueChange={(value) => setSelectedType(value as ListingType | 'all')}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder="Listing Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="auction">Auction</SelectItem>
                  <SelectItem value="fixed">Fixed Price</SelectItem>
                  <SelectItem value="classified">Classified</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
                <SelectTrigger className="w-full md:w-[180px]">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="price-low">Price: Low to High</SelectItem>
                  <SelectItem value="price-high">Price: High to Low</SelectItem>
                  <SelectItem value="ending-soon">Ending Soon</SelectItem>
                  <SelectItem value="featured">Featured</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : filteredListings.length === 0 ? (
          <Card className="border border-border/60">
            <CardContent className="pt-6 text-center text-muted-foreground">
              No listings found. Try adjusting your search or filters.
            </CardContent>
          </Card>
        ) : (
          <>
            {viewMode === 'list' ? (
              <div className="space-y-3">
                {filteredListings.map((listing) => (
                  <ListItem key={listing.id} listing={listing} />
                ))}
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={cn('grid gap-6', 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')}
              >
                <AnimatePresence>
                  {filteredListings.map((listing) =>
                    listing.featured ? (
                      <FeaturedListingCard key={listing.id} listing={listing} />
                    ) : (
                      <ListingCard key={listing.id} listing={listing} />
                    )
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {hasMore ? (
              <div className="flex justify-center mt-8">
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
                  disabled={loadingMore}
                  onClick={() => fetchListings(false)}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            ) : null}
          </>
        )}

        <ScrollToTop />
      </div>
      <BottomNav />
    </div>
  );
}

