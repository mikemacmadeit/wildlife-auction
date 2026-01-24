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

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import React from 'react';
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
import { DashboardPageShell } from '@/components/dashboard/DashboardPageShell';
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

// Force this to be a client component that doesn't suspend
export default function WatchlistPage() {
  const { user, loading: authLoading } = useAuth();
  const { favoriteIds, isLoading: favoritesLoading, removeFavorite, toggleFavorite } = useFavorites();
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

  const toMillisSafe = useCallback((value: any): number => {
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
  }, []);

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
  }, [toMillisSafe]);

  // Guard against re-fetching and re-subscribing
  const isFetchingRef = useRef<string | null>(null);
  const favoriteIdsStringRef = useRef<string>('');

  // Fetch listings when favorite IDs change
  useEffect(() => {
    // Wait for auth and favorites to load
    if (authLoading || favoritesLoading) {
      // Ensure loading state is set while waiting
      setLoading(true);
      return;
    }

    if (!user) {
      setLoading(false);
      setListings([]);
      setError('Please sign in to view your watchlist');
      // Clean up subscriptions
      subscriptionsRef.current.forEach((unsubscribe) => unsubscribe());
      subscriptionsRef.current.clear();
      isFetchingRef.current = null;
      return;
    }

    // Create stable string key from favoriteIds array
    const favoriteIdsKey = favoriteIds.sort().join(',');
    
    // If we're already fetching/subscribed for these IDs, skip
    if (isFetchingRef.current === favoriteIdsKey && favoriteIdsStringRef.current === favoriteIdsKey) {
      return;
    }

    // If favoriteIds is empty, clear everything
    if (favoriteIds.length === 0) {
      setListings([]);
      setLoading(false);
      setError(null);
      // Clean up subscriptions
      subscriptionsRef.current.forEach((unsubscribe) => unsubscribe());
      subscriptionsRef.current.clear();
      isFetchingRef.current = null;
      favoriteIdsStringRef.current = '';
      return;
    }

    // Mark as fetching
    isFetchingRef.current = favoriteIdsKey;
    favoriteIdsStringRef.current = favoriteIdsKey;
    let mounted = true;

    const fetchListings = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const fetchedListings = await getListingsByIds(favoriteIds);
        
        if (!mounted) return; // Component unmounted
        
        const validListings = fetchedListings.filter((listing) => listing !== null) as Listing[];
        const enriched = validListings.map(enrichListing);
        
        if (!mounted) return; // Component unmounted
        
        setListings(enriched);

        // Clean up old subscriptions for listings no longer in favorites
        const currentListingIds = new Set(enriched.map(l => l.id));
        subscriptionsRef.current.forEach((unsubscribe, listingId) => {
          if (!currentListingIds.has(listingId)) {
            unsubscribe();
            subscriptionsRef.current.delete(listingId);
          }
        });

        // Subscribe to real-time updates for each listing (only if not already subscribed)
        enriched.forEach((listing) => {
          if (!subscriptionsRef.current.has(listing.id)) {
            const unsubscribe = subscribeToListing(listing.id, (updatedListing) => {
              if (!mounted) return; // Component unmounted
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
        console.error('[WatchlistPage] Error fetching watchlist listings:', err);
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load watchlist');
        setListings([]); // Set safe default
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchListings();

    // Cleanup subscriptions on unmount or when dependencies change
    return () => {
      mounted = false;
      // Only cleanup if this is no longer the active fetch
      if (isFetchingRef.current !== favoriteIdsKey) {
        subscriptionsRef.current.forEach((unsubscribe) => unsubscribe());
        subscriptionsRef.current.clear();
      }
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
  }, [categorizedListings, activeTab, searchQuery, sortBy, toMillisSafe]);

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

  // Use DashboardPageShell to ensure never blank
  const isLoading = authLoading || favoritesLoading || loading;
  const isEmpty = !isLoading && !error && !user;
  const totalCount = listings.length;
  const activeCount = categorizedListings.active.length;
  const endedCount = categorizedListings.ended.length;
  const soldCount = categorizedListings.sold.length;

  // Compute empty state
  const emptyState = isEmpty
    ? {
        icon: Heart,
        title: 'Sign in to view your watchlist',
        description: "Save listings you're interested in and view them all in one place.",
        action: {
          label: 'Sign In',
          href: '/login',
        },
      }
    : !isLoading && !error && user && totalCount === 0
    ? {
        icon: Heart,
        title: 'Your watchlist is empty',
        description: "Start saving listings you're interested in by clicking the heart icon on any listing.",
        action: {
          label: 'Browse Listings',
          href: '/browse',
        },
      }
    : undefined;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6 w-full">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
        <DashboardPageShell
          loading={isLoading}
          error={error}
          empty={emptyState}
        >
          <Tabs value={superTab} onValueChange={(v) => setSuperTab(v as SuperTab)} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
              <TabsTrigger value="saved-sellers">Saved Sellers</TabsTrigger>
              <TabsTrigger value="saved-searches">Saved Searches</TabsTrigger>
            </TabsList>

            <TabsContent value="watchlist" className="space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl md:text-3xl font-extrabold">My Watchlist</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {totalCount} {totalCount === 1 ? 'listing' : 'listings'} saved
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                  >
                    {viewMode === 'grid' ? <ListIcon className="h-4 w-4" /> : <Grid3x3 className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Filters and Search */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search listings..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                      <SelectTrigger className="w-full sm:w-[200px]">
                        <SelectValue placeholder="Sort by" />
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowFilters(!showFilters)}
                    >
                      <Filter className="h-4 w-4 mr-2" />
                      Filters
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Tabs for Active/Ended/Sold */}
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
                <TabsList>
                  <TabsTrigger value="active">
                    Active ({activeCount})
                  </TabsTrigger>
                  <TabsTrigger value="ended">
                    Ended ({endedCount})
                  </TabsTrigger>
                  <TabsTrigger value="sold">
                    Sold ({soldCount})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="active" className="mt-6">
                  {filteredAndSorted.length > 0 ? (
                    <WatchlistGrid listings={filteredAndSorted} viewMode={viewMode} />
                  ) : (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Heart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-lg font-semibold">No active listings</p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Your active watchlist items will appear here.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="ended" className="mt-6">
                  {filteredAndSorted.length > 0 ? (
                    <WatchlistGrid listings={filteredAndSorted} viewMode={viewMode} />
                  ) : (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-lg font-semibold">No ended listings</p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Ended listings will appear here.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="sold" className="mt-6">
                  {filteredAndSorted.length > 0 ? (
                    <WatchlistGrid listings={filteredAndSorted} viewMode={viewMode} />
                  ) : (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <CheckCircle2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-lg font-semibold">No sold listings</p>
                        <p className="text-sm text-muted-foreground mt-2">
                          Sold listings will appear here.
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="saved-sellers">
              <SavedSellersList />
            </TabsContent>

            <TabsContent value="saved-searches">
              <SavedSearchesPanel />
            </TabsContent>
          </Tabs>
        </DashboardPageShell>
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
