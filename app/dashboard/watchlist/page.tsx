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
import { useAuth } from '@/hooks/use-auth';
import { useFavorites } from '@/hooks/use-favorites';
import { getListingsByIds, subscribeToListing } from '@/lib/firebase/listings';
import { Listing, ListingStatus, ListingType } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SavedSearchesPanel } from '@/components/saved-searches/SavedSearchesPanel';
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
  MapPin,
  Calendar,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { formatDistanceToNow, format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { cn, formatCurrency } from '@/lib/utils';
import { CountdownTimer } from '@/components/auction/CountdownTimer';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type TabType = 'active' | 'ended' | 'sold';
type SortOption = 'newest' | 'oldest' | 'ending-soon' | 'price-low' | 'price-high' | 'title';
type ViewMode = 'grid' | 'list';
type SuperTab = 'watchlist' | 'saved-searches';

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false);
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
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(listingId);
        return next;
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

  const handleBulkRemove = async () => {
    try {
      const ids = Array.from(selectedIds);
      await Promise.all(ids.map((id) => removeFavorite(id)));
      toast({
        title: 'Removed from watchlist',
        description: `${ids.length} listing${ids.length === 1 ? '' : 's'} removed.`,
      });
      setSelectedIds(new Set());
      setBulkRemoveOpen(false);
    } catch (error) {
      console.error('Error bulk removing:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove listings. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const toggleSelect = (listingId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(listingId)) {
        next.delete(listingId);
      } else {
        next.add(listingId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(filteredAndSorted.map((l) => l.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
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
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
      <Tabs value={superTab} onValueChange={(v) => setSuperTab(v as SuperTab)} className="w-full">
        <div className="mb-6 flex items-center justify-end">
          <TabsList className="grid grid-cols-2 w-full max-w-sm">
            <TabsTrigger value="watchlist" className="font-semibold">
              Watchlist
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

        <TabsContent value="watchlist">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
              <Heart className="h-8 w-8 text-primary fill-current" />
              My Watchlist
            </h1>
            <p className="text-muted-foreground">
              {totalCount === 0
                ? 'No listings saved yet'
                : `${totalCount} ${totalCount === 1 ? 'listing' : 'listings'} saved`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {selectedIds.size > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={deselectAll}>
                  Deselect All
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setBulkRemoveOpen(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove {selectedIds.size}
                </Button>
              </>
            )}
            {selectedIds.size === 0 && filteredAndSorted.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={selectAll}>
                  Select All
                </Button>
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
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onRemove={handleRemove}
                removingId={removingId}
                StatusBadge={StatusBadge}
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
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onRemove={handleRemove}
                removingId={removingId}
                StatusBadge={StatusBadge}
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
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onRemove={handleRemove}
                removingId={removingId}
                StatusBadge={StatusBadge}
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

      {/* Bulk Remove Dialog */}
      <AlertDialog open={bulkRemoveOpen} onOpenChange={setBulkRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from watchlist?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {selectedIds.size} listing{selectedIds.size === 1 ? '' : 's'} from your watchlist? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Watchlist Grid Component
function WatchlistGrid({
  listings,
  viewMode,
  selectedIds,
  onToggleSelect,
  onRemove,
  removingId,
  StatusBadge,
}: {
  listings: ListingWithStatus[];
  viewMode: ViewMode;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onRemove: (id: string) => void;
  removingId: string | null;
  StatusBadge: ({ listing }: { listing: ListingWithStatus }) => JSX.Element | null;
}) {
  if (viewMode === 'list') {
    return (
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {listings.map((listing, index) => (
            <WatchlistListItem
              key={listing.id}
              listing={listing}
              index={index}
              isSelected={selectedIds.has(listing.id)}
              onToggleSelect={() => onToggleSelect(listing.id)}
              onRemove={() => onRemove(listing.id)}
              isRemoving={removingId === listing.id}
              StatusBadge={StatusBadge}
            />
          ))}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
      <AnimatePresence mode="popLayout">
        {listings.map((listing, index) => (
          <WatchlistCard
            key={listing.id}
            listing={listing}
            index={index}
            isSelected={selectedIds.has(listing.id)}
            onToggleSelect={() => onToggleSelect(listing.id)}
            onRemove={() => onRemove(listing.id)}
            isRemoving={removingId === listing.id}
            StatusBadge={StatusBadge}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

// Watchlist Card Component (Grid View)
function WatchlistCard({
  listing,
  index,
  isSelected,
  onToggleSelect,
  onRemove,
  isRemoving,
  StatusBadge,
}: {
  listing: ListingWithStatus;
  index: number;
  isSelected: boolean;
  onToggleSelect: () => void;
  onRemove: () => void;
  isRemoving: boolean;
  StatusBadge: ({ listing }: { listing: ListingWithStatus }) => JSX.Element | null;
}) {
  const getCategoryName = (category: string) => {
    switch (category) {
      case 'wildlife_exotics':
        return 'Wildlife & Exotics';
      case 'cattle_livestock':
        return 'Cattle & Livestock';
      case 'ranch_equipment':
        return 'Ranch Equipment';
      default:
        return category;
    }
  };

  const priceDisplay =
    listing.type === 'auction'
      ? listing.currentBid
        ? formatCurrency(listing.currentBid)
        : `Starting: ${formatCurrency(listing.startingBid || 0)}`
      : formatCurrency(listing.price || 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Card
        className={cn(
          'group hover:shadow-lg transition-all duration-200 border-2 h-full flex flex-col',
          isSelected && 'border-primary ring-2 ring-primary/20',
          listing.statusBadge === 'ended' || listing.statusBadge === 'expired' || listing.statusBadge === 'sold'
            ? 'opacity-75'
            : 'hover:border-primary/50'
        )}
      >
        {/* Checkbox overlay */}
        <div className="absolute top-2 left-2 z-10">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelect}
            className="bg-background/90 backdrop-blur-sm"
          />
        </div>

        <Link href={`/listing/${listing.id}`} className="block flex-1">
          <div className="relative aspect-square overflow-hidden rounded-t-lg bg-muted">
            {listing.images && listing.images.length > 0 ? (
              <Image
                src={listing.images[0]}
                alt={listing.title}
                fill
                className={cn(
                  'object-cover transition-transform duration-200',
                  listing.statusBadge === 'ended' || listing.statusBadge === 'expired' || listing.statusBadge === 'sold'
                    ? 'grayscale'
                    : 'group-hover:scale-105'
                )}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Package className="h-12 w-12 text-muted-foreground" />
              </div>
            )}

            {/* Status badges */}
            <div className="absolute top-2 right-2 flex flex-col gap-2 items-end z-10">
              <StatusBadge listing={listing} />
              {listing.featured && (
                <Badge variant="default" className="text-xs bg-gradient-to-r from-yellow-400 to-orange-500">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Featured
                </Badge>
              )}
              <Badge variant="outline" className="text-xs capitalize bg-background/90 backdrop-blur-sm">
                {listing.type}
              </Badge>
            </div>

            {/* Countdown timer for active auctions */}
            {listing.type === 'auction' && listing.endsAt && !listing.isEnded && (
              <div className="absolute bottom-2 left-2 right-2 z-10">
                <CountdownTimer
                  endsAt={listing.endsAt}
                  variant="badge"
                  showIcon={true}
                  pulseWhenEndingSoon={true}
                  className="text-xs bg-background/90 backdrop-blur-sm"
                />
              </div>
            )}

            {/* Subtle treatment for ended/sold listings (no big X overlay) */}
            {(listing.statusBadge === 'ended' || listing.statusBadge === 'expired' || listing.statusBadge === 'sold') && (
              <div className="absolute inset-0 z-10 pointer-events-none">
                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background/70 to-transparent" />
                <div className="absolute bottom-2 left-2">
                  {listing.statusBadge === 'sold' ? (
                    <Badge className="bg-destructive text-destructive-foreground font-extrabold tracking-wide">
                      SOLD
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-background/85 backdrop-blur-sm font-extrabold tracking-wide">
                      ENDED
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        </Link>

        <CardContent className="p-4 flex-1 flex flex-col">
          <div className="space-y-3 flex-1">
            <div>
              <Link href={`/listing/${listing.id}`}>
                <h3 className="font-semibold text-base mb-1 line-clamp-2 hover:text-primary transition-colors">
                  {listing.title}
                </h3>
              </Link>
              <p className="text-xs text-muted-foreground">{getCategoryName(listing.category)}</p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold">{priceDisplay}</div>
                {listing.type === 'auction' && listing.endsAt && listing.isEnded && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ended {format(listing.endsAt, 'MMM d, yyyy')}
                  </p>
                )}
                {listing.type === 'auction' && listing.endsAt && !listing.isEnded && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ends {formatDistanceToNow(listing.endsAt, { addSuffix: true })}
                  </p>
                )}
              </div>
            </div>

            {/* Location */}
            {listing.location && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span>
                  {listing.location.city}, {listing.location.state}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-3 border-t mt-3">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={(e) => {
                e.preventDefault();
                onRemove();
              }}
              disabled={isRemoving}
            >
              {isRemoving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Heart className="h-4 w-4 mr-2 fill-current text-destructive" />
                  Remove
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" asChild className="flex-1">
              <Link href={`/listing/${listing.id}`}>
                <ExternalLink className="h-4 w-4 mr-2" />
                View
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Watchlist List Item Component (List View)
function WatchlistListItem({
  listing,
  index,
  isSelected,
  onToggleSelect,
  onRemove,
  isRemoving,
  StatusBadge,
}: {
  listing: ListingWithStatus;
  index: number;
  isSelected: boolean;
  onToggleSelect: () => void;
  onRemove: () => void;
  isRemoving: boolean;
  StatusBadge: ({ listing }: { listing: ListingWithStatus }) => JSX.Element | null;
}) {
  const getCategoryName = (category: string) => {
    switch (category) {
      case 'wildlife_exotics':
        return 'Wildlife & Exotics';
      case 'cattle_livestock':
        return 'Cattle & Livestock';
      case 'ranch_equipment':
        return 'Ranch Equipment';
      default:
        return category;
    }
  };

  const priceDisplay =
    listing.type === 'auction'
      ? listing.currentBid
        ? formatCurrency(listing.currentBid)
        : `Starting: ${formatCurrency(listing.startingBid || 0)}`
      : formatCurrency(listing.price || 0);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3, delay: index * 0.02 }}
    >
      <Card
        className={cn(
          'group hover:shadow-md transition-all duration-200 border',
          isSelected && 'border-primary ring-2 ring-primary/20 bg-primary/5',
          listing.statusBadge === 'ended' || listing.statusBadge === 'expired' || listing.statusBadge === 'sold'
            ? 'opacity-75'
            : ''
        )}
      >
        <CardContent className="p-4">
          <div className="flex gap-4">
            {/* Checkbox */}
            <div className="flex items-start pt-1">
              <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} />
            </div>

            {/* Image */}
            <Link href={`/listing/${listing.id}`} className="flex-shrink-0">
              <div className="relative w-24 h-24 md:w-32 md:h-32 rounded-lg overflow-hidden bg-muted">
                {listing.images && listing.images.length > 0 ? (
                  <Image
                    src={listing.images[0]}
                    alt={listing.title}
                    fill
                    className={cn(
                      'object-cover transition-transform duration-200',
                      listing.statusBadge === 'ended' || listing.statusBadge === 'expired' || listing.statusBadge === 'sold'
                        ? 'grayscale'
                        : 'group-hover:scale-105'
                    )}
                    sizes="128px"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                {(listing.statusBadge === 'ended' || listing.statusBadge === 'expired' || listing.statusBadge === 'sold') ? (
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-background/70 to-transparent" />
                    <div className="absolute bottom-2 left-2">
                      {listing.statusBadge === 'sold' ? (
                        <Badge className="bg-destructive text-destructive-foreground font-extrabold tracking-wide">
                          SOLD
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-background/85 backdrop-blur-sm font-extrabold tracking-wide">
                          ENDED
                        </Badge>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </Link>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4 mb-2">
                <div className="flex-1 min-w-0">
                  <Link href={`/listing/${listing.id}`}>
                    <h3 className="font-semibold text-lg mb-1 line-clamp-1 hover:text-primary transition-colors">
                      {listing.title}
                    </h3>
                  </Link>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm text-muted-foreground">{getCategoryName(listing.category)}</p>
                    <span className="text-muted-foreground">•</span>
                    <Badge variant="outline" className="text-xs capitalize">
                      {listing.type}
                    </Badge>
                    {listing.featured && (
                      <>
                        <span className="text-muted-foreground">•</span>
                        <Badge variant="default" className="text-xs bg-gradient-to-r from-yellow-400 to-orange-500">
                          <Sparkles className="h-3 w-3 mr-1" />
                          Featured
                        </Badge>
                      </>
                    )}
                    <StatusBadge listing={listing} />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-xl font-bold">{priceDisplay}</div>
                  {listing.type === 'auction' && listing.endsAt && (
                    <div className="mt-1">
                      {listing.isEnded ? (
                        <p className="text-xs text-muted-foreground">
                          Ended {format(listing.endsAt, 'MMM d, yyyy')}
                        </p>
                      ) : (
                        <CountdownTimer
                          endsAt={listing.endsAt}
                          variant="compact"
                          showIcon={false}
                          pulseWhenEndingSoon={true}
                          className="text-xs"
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {listing.location && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
                  <MapPin className="h-3 w-3" />
                  <span>
                    {listing.location.city}, {listing.location.state}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    onRemove();
                  }}
                  disabled={isRemoving}
                >
                  {isRemoving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Heart className="h-4 w-4 mr-2 fill-current text-destructive" />
                      Remove
                    </>
                  )}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/listing/${listing.id}`}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Details
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
