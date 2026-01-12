'use client';

import { useState, useMemo, useEffect } from 'react';
import { useDebounce } from '@/hooks/use-debounce';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter, Sparkles, ArrowUpDown, ArrowUp, ArrowDown, LayoutGrid, List } from 'lucide-react';
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
import { BottomNav } from '@/components/navigation/BottomNav';
import { Badge } from '@/components/ui/badge';
import { listActiveListings } from '@/lib/firebase/listings';
import { FilterState, ListingType, Listing } from '@/lib/types';
import { ScrollToTop } from '@/components/ui/scroll-to-top';
import { cn } from '@/lib/utils';

type SortOption = 'newest' | 'oldest' | 'price-low' | 'price-high' | 'ending-soon' | 'featured';

type ViewMode = 'card' | 'list';

export default function BrowsePage() {
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300); // Debounce search
  const [filters, setFilters] = useState<FilterState>({});
  const [selectedType, setSelectedType] = useState<ListingType | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // View mode with localStorage persistence
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('browse-view-mode');
      return (saved === 'card' || saved === 'list') ? saved : 'card';
    }
    return 'card';
  });

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('browse-view-mode', mode);
    }
  };

  // Fetch listings from Firestore
  useEffect(() => {
    async function fetchListings() {
      try {
        setLoading(true);
        setError(null);
        const data = await listActiveListings({ limitCount: 50 });
        setListings(data);
      } catch (err) {
        console.error('Error fetching listings:', err);
        setError(err instanceof Error ? err.message : 'Failed to load listings');
      } finally {
        setLoading(false);
      }
    }
    fetchListings();
  }, []);

  // Filter listings based on search and filters (client-side filtering)
  const filteredListings = useMemo(() => {
    let result = [...listings];

    // Type filter
    if (selectedType !== 'all') {
      result = result.filter((listing) => listing.type === selectedType);
    }

    // Search filter (using debounced query and enhanced metadata search)
    if (debouncedSearchQuery) {
      const query = debouncedSearchQuery.toLowerCase();
      result = result.filter((listing) => {
        // Search in title, description, location
        const basicMatch = 
          listing.title.toLowerCase().includes(query) ||
          listing.description.toLowerCase().includes(query) ||
          listing.location?.city?.toLowerCase().includes(query) ||
          listing.location?.state?.toLowerCase().includes(query);
        
        // Search in metadata (breed, age, species, category)
        const metadataMatch = listing.metadata
          ? (
              listing.metadata.breed?.toLowerCase().includes(query) ||
              listing.metadata.age?.toLowerCase().includes(query) ||
              listing.category.toLowerCase().includes(query)
            )
          : false;
        
        return basicMatch || metadataMatch;
      });
    }

    // Category filter
    if (filters.category) {
      result = result.filter((listing) => listing.category === filters.category);
    }

    // Type filter (from filters)
    if (filters.type) {
      result = result.filter((listing) => listing.type === filters.type);
    }

    // Location filter
    if (filters.location?.state) {
      result = result.filter((listing) => listing.location?.state === filters.location?.state);
    }
    if (filters.location?.city) {
      result = result.filter((listing) => listing.location?.city === filters.location?.city);
    }

    // Price filter
    if (filters.minPrice !== undefined) {
      result = result.filter((listing) => {
        const price = listing.price || listing.currentBid || listing.startingBid || 0;
        return price >= filters.minPrice!;
      });
    }
    if (filters.maxPrice !== undefined) {
      result = result.filter((listing) => {
        const price = listing.price || listing.currentBid || listing.startingBid || 0;
        return price <= filters.maxPrice!;
      });
    }

    // Species/Breed filter
    if (filters.species && filters.species.length > 0) {
      result = result.filter((listing) =>
        filters.species!.some((species) =>
          listing.metadata?.breed?.toLowerCase().includes(species.toLowerCase())
        )
      );
    }

    // Quantity filter
    if (filters.quantity) {
      result = result.filter((listing) => {
        const qty = listing.metadata?.quantity || 1;
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

    // Health status filter
    if (filters.healthStatus && filters.healthStatus.length > 0) {
      result = result.filter((listing) =>
        filters.healthStatus!.some((status) =>
          listing.metadata?.healthStatus?.toLowerCase().includes(status.toLowerCase())
        )
      );
    }

    // Papers filter
    if (filters.papers !== undefined) {
      result = result.filter((listing) => listing.metadata?.papers === filters.papers);
    }

    // Verified seller filter
    if (filters.verifiedSeller) {
      result = result.filter((listing) => listing.sellerSnapshot?.verified || listing.trust?.verified);
    }

    // Transport ready filter
    if (filters.transportReady) {
      result = result.filter((listing) => listing.trust?.transportReady);
    }

    // Insurance available filter
    if (filters.insuranceAvailable) {
      result = result.filter((listing) => listing.trust?.insuranceAvailable);
    }

    // Ending soon filter (auctions ending within 24 hours)
    if (filters.endingSoon) {
      const now = Date.now();
      const dayInMs = 24 * 60 * 60 * 1000;
      result = result.filter((listing) => {
        if (listing.type !== 'auction' || !listing.endsAt) return false;
        const timeLeft = listing.endsAt.getTime() - now;
        return timeLeft > 0 && timeLeft <= dayInMs;
      });
    }

    // Newly listed filter (listed within 7 days)
    if (filters.newlyListed) {
      const now = Date.now();
      const weekInMs = 7 * 24 * 60 * 60 * 1000;
      result = result.filter((listing) => {
        const listedTime = listing.createdAt.getTime();
        const timeSinceListing = now - listedTime;
        return timeSinceListing <= weekInMs;
      });
    }

    // Featured filter
    if (filters.featured) {
      result = result.filter((listing) => listing.featured === true);
    }

    return result;
  }, [listings, selectedType, debouncedSearchQuery, filters]);

  // Sort listings
  const sortedListings = useMemo(() => {
    const sorted = [...filteredListings];

    switch (sortBy) {
      case 'newest':
        return sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      case 'oldest':
        return sorted.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      case 'price-low':
        return sorted.sort((a, b) => {
          const priceA = a.price || a.currentBid || a.startingBid || 0;
          const priceB = b.price || b.currentBid || b.startingBid || 0;
          return priceA - priceB;
        });
      case 'price-high':
        return sorted.sort((a, b) => {
          const priceA = a.price || a.currentBid || a.startingBid || 0;
          const priceB = b.price || b.currentBid || b.startingBid || 0;
          return priceB - priceA;
        });
      case 'ending-soon':
        return sorted.sort((a, b) => {
          if (a.type !== 'auction' || !a.endsAt) return 1;
          if (b.type !== 'auction' || !b.endsAt) return -1;
          return a.endsAt.getTime() - b.endsAt.getTime();
        });
      case 'featured':
        return sorted.sort((a, b) => {
          if (a.featured && !b.featured) return -1;
          if (!a.featured && b.featured) return 1;
          return b.createdAt.getTime() - a.createdAt.getTime();
        });
      default:
        return sorted;
    }
  }, [filteredListings, sortBy]);

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
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
    if (filters.insuranceAvailable) count++;
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
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex-1 w-full md:max-w-2xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search listings, breeds, locations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 min-h-[48px] text-base md:text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <FilterDialog
                filters={filters}
                onFiltersChange={handleFilterChange}
                activeFilterCount={activeFilterCount}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                disabled={activeFilterCount === 0}
                className="min-h-[48px] px-4"
              >
                Clear
              </Button>
            </div>
          </div>

          {/* Type Tabs */}
          <Tabs value={selectedType} onValueChange={(value) => setSelectedType(value as ListingType | 'all')} className="mt-4">
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="auction">Auctions</TabsTrigger>
              <TabsTrigger value="fixed">Fixed Price</TabsTrigger>
              <TabsTrigger value="classified">Classified</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        {/* Results Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold mb-1">
              {loading ? 'Loading...' : `${sortedListings.length} ${sortedListings.length === 1 ? 'Listing' : 'Listings'}`}
            </h1>
            {activeFilterCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {activeFilterCount} {activeFilterCount === 1 ? 'filter' : 'filters'} active
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Sort Dropdown */}
            <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
              <SelectTrigger className="w-full md:w-[180px] min-h-[48px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">
                  <div className="flex items-center gap-2">
                    <ArrowDown className="h-4 w-4" />
                    Newest
                  </div>
                </SelectItem>
                <SelectItem value="oldest">
                  <div className="flex items-center gap-2">
                    <ArrowUp className="h-4 w-4" />
                    Oldest
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
                <SelectItem value="ending-soon">Ending Soon</SelectItem>
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
        )}
      </div>

      <BottomNav />
    </div>
  );
}
