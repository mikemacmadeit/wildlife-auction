/**
 * Enhanced Watchlist Page - Best in Class
 * 
 * Features:
 * - Tabs for Active, Ended, Sold listings
 * - Real-time countdown timers
 * - Status badges and indicators
 * - Filtering and sorting
 * - Bulk actions
 * - Smart handling of ended listings
 * - Beautiful, responsive design
 */

'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useFavorites } from '@/hooks/use-favorites';
import { getListingsByIds, subscribeToListing } from '@/lib/firebase/listings';
import { Listing, ListingStatus, ListingType } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SavedSearchesPanel } from '@/components/saved-searches/SavedSearchesPanel';
import { SavedSellersList } from '@/components/watchlist/SavedSellersList';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Heart,
  Loader2,
  Package,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  Gavel,
  ShoppingCart,
  FileDown,
  FileText,
  Filter,
  Search,
  SortAsc,
  SortDesc,
  Bell,
  BellOff,
  Trash2,
  Grid3x3,
  List as ListIcon,
  Sparkles,
  AlertCircle,
  TrendingUp,
  Zap,
  MapPin,
  Calendar,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { formatDistanceToNow, format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { cn, formatCurrency } from '@/lib/utils';
import { CountdownTimer } from '@/components/auction/CountdownTimer';
import { TrustBadges } from '@/components/trust/StatusBadge';
import { getSoldSummary } from '@/lib/listings/sold';
import type { WildlifeAttributes, CattleAttributes, EquipmentAttributes, HorseAttributes } from '@/lib/types';
import { ListItem } from '@/components/listings/ListItem';
import { ListingCard } from '@/components/listings/ListingCard';
import { FeaturedListingCard } from '@/components/listings/FeaturedListingCard';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';

type TabType = 'active' | 'ended' | 'sold';
type SortOption = 'newest' | 'oldest' | 'ending-soon' | 'price-low' | 'price-high' | 'title';
type ViewMode = 'grid' | 'list';
type SuperTab = 'watchlist' | 'saved-sellers' | 'saved-searches';

interface FilterState {
  category: string;
  type: string;
  priceMin: string;
  priceMax: string;
  location: string;
}

interface ListingWithStatus extends Listing {
  isEnded: boolean;
  isSold: boolean;
  isExpired: boolean;
  timeUntilEnd?: number; // milliseconds
  statusBadge: 'active' | 'ending-soon' | 'ended' | 'sold' | 'expired';
}

export default function WatchlistPage() {
  const { user, loading: authLoading } = useAuth();
  const { favoriteIdsRef, isLoading: favoritesLoading, removeFavorite, toggleFavorite } = useFavorites();
  // Use ref instead of state to avoid re-renders - poll for changes
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  
  // Poll favoriteIdsRef to update local state (doesn't cause re-renders in other components)
  useEffect(() => {
    const updateIds = () => {
      const ids = Array.from(favoriteIdsRef.current).sort();
      setFavoriteIds(prev => {
        if (prev.length !== ids.length || prev.some((id, i) => id !== ids[i])) {
          return ids;
        }
        return prev;
      });
    };
    
    updateIds();
    const interval = setInterval(updateIds, 200);
    return () => clearInterval(interval);
  }, [favoriteIdsRef]);
  const { toast } = useToast();
  const [listings, setListings] = useState<ListingWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [superTab, setSuperTab] = useState<SuperTab>('watchlist');
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    category: 'all',
    type: 'all',
    priceMin: '',
    priceMax: '',
    location: '',
  });

  // Real-time subscriptions
  const subscriptionsRef = useRef<Map<string, () => void>>(new Map());

  function toMillisSafe(value: any): number {
    if (!value) return 0;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
    if (typeof value?.toDate === 'function') {
      try {
        const d = value.toDate();
        if (d instanceof Date && Number.isFinite(d.getTime())) return d.getTime();
      } catch {
        // ignore
      }
    }
    if (typeof value?.seconds === 'number') {
      const d = new Date(value.seconds * 1000);
      return Number.isFinite(d.getTime()) ? d.getTime() : 0;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      return Number.isFinite(d.getTime()) ? d.getTime() : 0;
    }
    return 0;
  }

  // Calculate listing statuses
  const enrichListing = useCallback((listing: Listing): ListingWithStatus => {
    const now = Date.now();
    const endsAt = listing.endsAt ? toMillisSafe(listing.endsAt) : null;
    const isEnded = endsAt ? now > endsAt : false;
    const isSold = listing.status === 'sold';
    const isExpired = listing.status === 'expired';
    const timeUntilEnd = endsAt ? endsAt - now : undefined;

    let statusBadge: ListingWithStatus['statusBadge'] = 'active';
    if (isSold) {
      statusBadge = 'sold';
    } else if (isExpired) {
      statusBadge = 'expired';
    } else if (isEnded) {
      statusBadge = 'ended';
    } else if (timeUntilEnd && timeUntilEnd < 24 * 60 * 60 * 1000) {
      // Less than 24 hours
      statusBadge = 'ending-soon';
    }

    return {
      ...listing,
      isEnded,
      isSold,
      isExpired,
      timeUntilEnd,
      statusBadge,
    };
  }, []);

  // Fetch listings when favorite IDs change
  useEffect(() => {
    const fetchListings = async () => {
      if (authLoading || favoritesLoading) {
        return;
      }

      if (!user) {
        setLoading(false);
        setError('Please sign in to view your watchlist');
        return;
      }

      if (favoriteIds.length === 0) {
        setListings([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const fetchedListings = await getListingsByIds(favoriteIds);
        const validListings = fetchedListings.filter((listing) => listing !== null) as Listing[];
        const enriched = validListings.map(enrichListing);
        setListings(enriched);

        // Subscribe to real-time updates for each listing
        enriched.forEach((listing) => {
          if (!subscriptionsRef.current.has(listing.id)) {
            const unsubscribe = subscribeToListing(listing.id, (updatedListing) => {
              if (updatedListing) {
                setListings((prev) => {
                  const index = prev.findIndex((l) => l.id === updatedListing.id);
                  if (index >= 0) {
                    const newList = [...prev];
                    newList[index] = enrichListing(updatedListing);
                    return newList;
                  }
                  return prev;
                });
              }
            });
            subscriptionsRef.current.set(listing.id, unsubscribe);
          }
        });
      } catch (err) {
        console.error('Error fetching watchlist listings:', err);
        setError(err instanceof Error ? err.message : 'Failed to load watchlist');
      } finally {
        setLoading(false);
      }
    };

    fetchListings();

    // Cleanup subscriptions on unmount
    const subs = subscriptionsRef.current;
    return () => {
      subs.forEach((unsubscribe) => unsubscribe());
      subs.clear();
    };
  }, [favoriteIds, user, authLoading, favoritesLoading, enrichListing]);

  // Categorize listings by tab
  const categorizedListings = useMemo(() => {
    const active: ListingWithStatus[] = [];
    const ended: ListingWithStatus[] = [];
    const sold: ListingWithStatus[] = [];

    listings.forEach((listing) => {
      if (listing.isSold) {
        sold.push(listing);
      } else if (listing.isEnded || listing.isExpired) {
        ended.push(listing);
      } else {
        active.push(listing);
      }
    });

    return { active, ended, sold };
  }, [listings]);

  // Filter and sort listings for current tab
  const filteredAndSorted = useMemo(() => {
    let result = categorizedListings[activeTab];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (listing) =>
          listing.title.toLowerCase().includes(query) ||
          listing.description?.toLowerCase().includes(query) ||
          listing.category.toLowerCase().includes(query)
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt);
        case 'oldest':
          return toMillisSafe(a.createdAt) - toMillisSafe(b.createdAt);
        case 'ending-soon':
          if (!a.endsAt && !b.endsAt) return 0;
          if (!a.endsAt) return 1;
          if (!b.endsAt) return -1;
          return toMillisSafe(a.endsAt) - toMillisSafe(b.endsAt);
        case 'price-low':
          const priceA = a.type === 'auction' ? (a.currentBid || a.startingBid || 0) : (a.price || 0);
          const priceB = b.type === 'auction' ? (b.currentBid || b.startingBid || 0) : (b.price || 0);
          return priceA - priceB;
        case 'price-high':
          const priceA2 = a.type === 'auction' ? (a.currentBid || a.startingBid || 0) : (a.price || 0);
          const priceB2 = b.type === 'auction' ? (b.currentBid || b.startingBid || 0) : (b.price || 0);
          return priceB2 - priceA2;
        case 'title':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    return result;
  }, [categorizedListings, activeTab, searchQuery, sortBy]);

  const handleRemove = async (listingId: string) => {
    try {
      setRemovingId(listingId);
      await removeFavorite(listingId);
      toast({
        title: 'Removed from watchlist',
        description: 'This listing has been removed from your watchlist.',
      });
    } catch (error) {
      console.error('Error removing from watchlist:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove listing from watchlist. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRemovingId(null);
    }
  };

  // Status badge component
  const StatusBadge = ({ listing }: { listing: ListingWithStatus }) => {
    switch (listing.statusBadge) {
      case 'sold':
        return (
          <Badge variant="default" className="bg-green-600 text-white">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Sold
          </Badge>
        );
      case 'expired':
        return (
          <Badge variant="outline" className="bg-background/80 backdrop-blur-sm">
            <Clock className="h-3 w-3 mr-1" />
            Ended
          </Badge>
        );
      case 'ended':
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Ended
          </Badge>
        );
      case 'ending-soon':
        return (
          <Badge variant="default" className="bg-orange-500 text-white animate-pulse">
            <AlertCircle className="h-3 w-3 mr-1" />
            Ending Soon
          </Badge>
        );
      default:
        return null;
    }
  };

  if (authLoading || favoritesLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading your watchlist...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Heart className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-2xl font-bold mb-2">Sign in to view your watchlist</h2>
              <p className="text-muted-foreground mb-6">
                Save listings you're interested in and view them all in one place.
              </p>
              <div className="flex gap-3 justify-center">
                <Button asChild>
                  <Link href="/login">Sign In</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/register">Sign Up</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalCount = listings.length;
  const activeCount = categorizedListings.active.length;
  const endedCount = categorizedListings.ended.length;
  const soldCount = categorizedListings.sold.length;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container pl-4 pr-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
      <Tabs value={superTab} onValueChange={(v) => setSuperTab(v as SuperTab)} className="w-full">
        <div className="mb-6 flex items-center justify-start">
          <TabsList className="grid grid-cols-3 w-full max-w-xl">
            <TabsTrigger value="watchlist" className="font-semibold">
              Saved listings
            </TabsTrigger>
            <TabsTrigger value="saved-sellers" className="font-semibold">
              Saved sellers
            </TabsTrigger>
            <TabsTrigger value="saved-searches" className="font-semibold">
              Saved searches
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="saved-searches">
          <Card className="border-2 border-border/50 bg-card">
            <CardContent className="p-4 sm:p-6">
              <SavedSearchesPanel variant="tab" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="saved-sellers">
          <SavedSellersList />
        </TabsContent>

        <TabsContent value="watchlist">
      {/* Header */}
      <div className="mb-4 md:mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
              <Heart className="h-8 w-8 text-primary fill-current" />
              Saved Listings
            </h1>
            <p className="text-muted-foreground">
              {totalCount === 0
                ? 'No listings saved yet'
                : `${totalCount} ${totalCount === 1 ? 'listing' : 'listings'} saved`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {filteredAndSorted.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Export to CSV
                    const csv = [
                      ['Title', 'Category', 'Type', 'Price', 'Status', 'Location', 'Ends At'].join(','),
                      ...filteredAndSorted.map((listing) => {
                        const price = listing.type === 'auction'
                          ? (listing.currentBid || listing.startingBid || 0)
                          : (listing.price || 0);
                        return [
                          `"${listing.title}"`,
                          listing.category,
                          listing.type,
                          price,
                          listing.statusBadge,
                          `"${listing.location.city}, ${listing.location.state}"`,
                          listing.endsAt ? format(listing.endsAt, 'yyyy-MM-dd HH:mm') : '',
                        ].join(',');
                      }),
                    ].join('\n');
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `watchlist-${format(new Date(), 'yyyy-MM-dd')}.csv`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                    toast({
                      title: 'Exported',
                      description: 'Watchlist exported to CSV',
                    });
                  }}
                >
                  <FileDown className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Search and Filters */}
        {totalCount > 0 && (
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search watchlist..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SortAsc className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="ending-soon">Ending Soon</SelectItem>
                <SelectItem value="price-low">Price: Low to High</SelectItem>
                <SelectItem value="price-high">Price: High to Low</SelectItem>
                <SelectItem value="title">Title A-Z</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <ListIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      {totalCount > 0 ? (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="active" className="relative">
              Active
              {activeCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 min-w-[20px] px-1.5 text-xs">
                  {activeCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="ended" className="relative">
              Ended
              {endedCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 min-w-[20px] px-1.5 text-xs">
                  {endedCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="sold" className="relative">
              Sold
              {soldCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 min-w-[20px] px-1.5 text-xs">
                  {soldCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-6">
            {filteredAndSorted.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12">
                    <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <h2 className="text-xl font-semibold mb-2">
                      {searchQuery ? 'No matching listings' : 'No active listings'}
                    </h2>
                    <p className="text-muted-foreground">
                      {searchQuery
                        ? 'Try adjusting your search query.'
                        : 'All your watched listings have ended or been sold.'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <WatchlistGrid
                listings={filteredAndSorted}
                viewMode={viewMode}
              />
            )}
          </TabsContent>

          <TabsContent value="ended" className="mt-6">
            {filteredAndSorted.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12">
                    <Clock className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <h2 className="text-xl font-semibold mb-2">No ended listings</h2>
                    <p className="text-muted-foreground">
                      {searchQuery
                        ? 'Try adjusting your search query.'
                        : 'Listings that have ended will appear here.'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <WatchlistGrid
                listings={filteredAndSorted}
                viewMode={viewMode}
              />
            )}
          </TabsContent>

          <TabsContent value="sold" className="mt-6">
            {filteredAndSorted.length === 0 ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center py-12">
                    <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <h2 className="text-xl font-semibold mb-2">No sold listings</h2>
                    <p className="text-muted-foreground">
                      {searchQuery
                        ? 'Try adjusting your search query.'
                        : 'Listings that have been sold will appear here.'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <WatchlistGrid
                listings={filteredAndSorted}
                viewMode={viewMode}
              />
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Heart className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h2 className="text-xl font-semibold mb-2">Your watchlist is empty</h2>
              <p className="text-muted-foreground mb-6">
                Start saving listings you're interested in by clicking the heart icon on any listing.
              </p>
              <Button asChild>
                <Link href="/browse">Browse Listings</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}

// Watchlist Grid Component
function WatchlistGrid({
  listings,
  viewMode,
}: {
  listings: ListingWithStatus[];
  viewMode: ViewMode;
}) {
  if (viewMode === 'list') {
    return (
      <div className="space-y-3 md:space-y-4 pb-4">
        <AnimatePresence mode="popLayout">
          {listings.map((listing, index) => (
            <motion.div
              key={listing.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3, delay: index * 0.02 }}
              className="relative"
            >
              {/* Reuse browse list-view card 1:1 */}
              <ListItem listing={listing as any} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-6 auto-rows-fr pb-4">
      <AnimatePresence mode="popLayout">
        {listings.map((listing) =>
          listing.featured ? (
            <div key={listing.id} className="min-w-0">
              <FeaturedListingCard listing={listing as any} />
            </div>
          ) : (
            <div key={listing.id} className="min-w-0">
              <ListingCard listing={listing as any} />
            </div>
          )
        )}
      </AnimatePresence>
    </div>
  );
}

// Watchlist list view now reuses `ListItem` (browse list view) for perfect visual parity.
// Watchlist grid view now uses `ListingCard` and `FeaturedListingCard` (same as browse) for perfect visual parity.
