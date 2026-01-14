'use client';

import { useState, useMemo, useEffect } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter, Beef } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import { BottomNav } from '@/components/navigation/BottomNav';
import { Badge } from '@/components/ui/badge';
import { queryListingsForBrowse, BrowseCursor, BrowseFilters, BrowseSort } from '@/lib/firebase/listings';
import { FilterState, ListingType, Listing } from '@/lib/types';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type SortOption = 'newest' | 'oldest' | 'price-low' | 'price-high' | 'ending-soon' | 'featured';
type ViewMode = 'card' | 'list';

export default function CattleLivestockBrowsePage() {
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
      if (saved === 'card' || saved === 'list') {
        setViewMode(saved);
      }
    }
  }, []);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('browse-view-mode', mode);
    }
  };

  const getBrowseFilters = (): BrowseFilters => {
    const browseFilters: BrowseFilters = {
      status: 'active',
      category: 'cattle_livestock', // Always filter by this category
    };
    
    if (selectedType !== 'all') {
      browseFilters.type = selectedType;
    }
    
    return browseFilters;
  };

  const getSortOption = (): BrowseSort => {
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
        return 'newest'; // Featured not supported in BrowseSort, default to newest
      default:
        return 'newest';
    }
  };

  const fetchListings = async (reset = false) => {
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

      if (reset) {
        setListings(result.items);
      } else {
        setListings((prev) => [...prev, ...result.items]);
      }

      setNextCursor(result.nextCursor || null);
      setHasMore(result.hasMore);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching listings:', err);
      setError(err.message || 'Failed to load listings');
      toast({
        title: 'Error',
        description: err.message || 'Failed to load listings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchListings(true);
  }, [selectedType, sortBy, debouncedSearchQuery]);

  const filteredListings = useMemo(() => {
    let result = listings;

    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      result = result.filter((listing) => {
        const titleMatch = listing.title.toLowerCase().includes(query);
        const descMatch = listing.description.toLowerCase().includes(query);
        const breedMatch = listing.attributes && 'breed' in listing.attributes 
          ? (listing.attributes as any).breed?.toLowerCase().includes(query)
          : false;
        return titleMatch || descMatch || breedMatch;
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
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Beef className="h-8 w-8 text-primary" />
            <h1 className="text-3xl md:text-4xl font-extrabold text-foreground">
              Cattle & Livestock
            </h1>
          </div>
          <p className="text-base md:text-lg text-muted-foreground">
            Browse cattle, bulls, cows, heifers, and registered livestock
          </p>
        </div>

        {/* Filters and Search */}
        <Card className="mb-6 border-2">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search by breed, title, or description..."
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

        {/* Results */}
        {error && (
          <Card className="mb-6 border-destructive">
            <CardContent className="pt-6">
              <p className="text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {filteredListings.length === 0 && !loading ? (
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <Beef className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No listings found</h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery ? 'Try adjusting your search query.' : 'No cattle & livestock listings available at this time.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-4 text-sm text-muted-foreground">
              {filteredListings.length} {filteredListings.length === 1 ? 'listing' : 'listings'} found
            </div>
            <div className={cn(
              'grid gap-6',
              viewMode === 'card' 
                ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                : 'grid-cols-1'
            )}>
              <AnimatePresence mode="popLayout">
                {filteredListings.map((listing, index) => (
                  <motion.div
                    key={listing.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                  >
                    {viewMode === 'card' ? (
                      <ListingCard listing={listing} />
                    ) : (
                      <ListItem listing={listing} />
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {hasMore && (
              <div className="mt-8 text-center">
                <Button
                  onClick={() => fetchListings(false)}
                  disabled={loadingMore}
                  variant="outline"
                  size="lg"
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      <ScrollToTop />
      <BottomNav />
    </div>
  );
}
