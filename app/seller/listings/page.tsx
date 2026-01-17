'use client';

import { useState, useMemo, memo, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Package,
  PlusCircle,
  Search,
  Eye,
  Users,
  Gavel,
  MapPin,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ListingRowActions } from '@/components/listings/ListingRowActions';
import { useDebounce } from '@/hooks/use-debounce';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { listSellerListings, unpublishListing, deleteListing, publishListing } from '@/lib/firebase/listings';
import { Listing, ListingStatus, ListingType } from '@/lib/types';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { CreateListingGateButton } from '@/components/listings/CreateListingGate';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, Trash2 } from 'lucide-react';

// Helper functions outside component to prevent recreation on every render
const getStatusBadge = (status: string) => {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    draft: { variant: 'outline', label: 'Draft' },
    active: { variant: 'default', label: 'Active' },
    expired: { variant: 'secondary', label: 'Expired' },
    sold: { variant: 'secondary', label: 'Sold' },
    removed: { variant: 'outline', label: 'Removed' },
  };
  const config = variants[status] || { variant: 'outline' as const, label: status };
  return <Badge variant={config.variant} className="font-semibold text-xs">{config.label}</Badge>;
};

const getTypeBadge = (type: string) => {
  const labels: Record<string, string> = {
    auction: 'Auction',
    fixed: 'Fixed Price',
    classified: 'Classified',
  };
  return (
    <Badge variant="outline" className="font-semibold text-xs">
      {labels[type] || type}
    </Badge>
  );
};

const formatTimeRemaining = (date?: Date) => {
  if (!date) return null;
  const minutes = Math.floor((date.getTime() - Date.now()) / (1000 * 60));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

// Memoized Listing Row component for performance
const ListingRow = memo(({ 
  listing, 
  onPublish,
  onPause, 
  onDelete 
}: { 
  listing: Listing;
  onPublish: (listing: Listing) => void;
  onPause: (listing: Listing) => void;
  onDelete: (listing: Listing) => void;
}) => (
  <tr
    key={listing.id}
    className="border-b border-border/30 hover:bg-background/50 group"
  >
    <td className="p-4 align-middle">
      <div className="flex flex-col gap-1">
        <Link
          href={`/listing/${listing.id}`}
          className="font-semibold text-foreground hover:text-primary group-hover:underline"
        >
          {listing.title}
        </Link>
        {listing.endsAt && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>Ends in {formatTimeRemaining(listing.endsAt)}</span>
          </div>
        )}
      </div>
    </td>
    <td className="p-4 align-middle">{getTypeBadge(listing.type)}</td>
    <td className="p-4 align-middle">
      <div className="font-bold text-foreground">
        {listing.type === 'auction'
          ? listing.currentBid
            ? `$${listing.currentBid.toLocaleString()}`
            : 'No bids'
          : listing.price
          ? `$${listing.price.toLocaleString()}`
          : 'Contact'}
      </div>
    </td>
    <td className="p-4 align-middle">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <MapPin className="h-3 w-3 flex-shrink-0" />
        <span>{listing.location?.city || 'Unknown'}, {listing.location?.state || 'Unknown'}</span>
      </div>
    </td>
    <td className="p-4 align-middle">{getStatusBadge(listing.status)}</td>
    <td className="p-4 align-middle">
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Eye className="h-3 w-3" />
          <span>{listing.metrics.views} views</span>
        </div>
        {listing.type === 'auction' && (
          <>
            <div className="flex items-center gap-2">
              <Users className="h-3 w-3" />
              <span>{Math.floor(listing.metrics.favorites * 0.3)} watchers</span>
            </div>
            <div className="flex items-center gap-2">
              <Gavel className="h-3 w-3" />
              <span>{listing.metrics.bidCount} bids</span>
            </div>
          </>
        )}
      </div>
    </td>
    <td className="p-4 align-middle">
      <ListingRowActions
        listingId={listing.id}
        status={listing.status}
        onPromote={() => onPublish(listing)}
        onPause={() => onPause(listing)}
        onDelete={() => onDelete(listing)}
      />
    </td>
  </tr>
));
ListingRow.displayName = 'ListingRow';

// Memoized Mobile Listing Card
const MobileListingCard = memo(({ 
  listing, 
  onPublish,
  onPause, 
  onDelete 
}: { 
  listing: Listing;
  onPublish: (listing: Listing) => void;
  onPause: (listing: Listing) => void;
  onDelete: (listing: Listing) => void;
}) => (
  <div key={listing.id} className="p-4 space-y-3">
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1 min-w-0">
        <Link
          href={`/listing/${listing.id}`}
          className="font-semibold text-foreground hover:text-primary block mb-1"
        >
          {listing.title}
        </Link>
        <div className="flex items-center gap-2 mb-2">
          {getTypeBadge(listing.type)}
          {getStatusBadge(listing.status)}
        </div>
      </div>
      <ListingRowActions
        listingId={listing.id}
        status={listing.status}
        onPromote={() => onPublish(listing)}
        onPause={() => onPause(listing)}
        onDelete={() => onDelete(listing)}
      />
    </div>

    <div className="flex items-center gap-4 text-sm">
      <div>
        <span className="text-muted-foreground font-medium">Price: </span>
        <span className="font-bold text-foreground">
          {listing.type === 'auction'
            ? listing.currentBid
              ? `$${listing.currentBid.toLocaleString()}`
              : 'No bids'
            : listing.price
            ? `$${listing.price.toLocaleString()}`
            : 'Contact'}
        </span>
      </div>
      {listing.endsAt && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>Ends in {formatTimeRemaining(listing.endsAt)}</span>
        </div>
      )}
    </div>

    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <div className="flex items-center gap-1">
        <MapPin className="h-3 w-3" />
        <span>{listing.location?.city || 'Unknown'}, {listing.location?.state || 'Unknown'}</span>
      </div>
      <div className="flex items-center gap-1">
        <Eye className="h-3 w-3" />
        <span>{listing.metrics.views} views</span>
      </div>
      {listing.type === 'auction' && (
        <>
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            <span>{Math.floor(listing.metrics.favorites * 0.3)} watchers</span>
          </div>
          <div className="flex items-center gap-1">
            <Gavel className="h-3 w-3" />
            <span>{listing.metrics.bidCount} bids</span>
          </div>
        </>
      )}
    </div>
  </div>
));
MobileListingCard.displayName = 'MobileListingCard';

function SellerListingsPageContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [statusFilter, setStatusFilter] = useState<ListingStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<ListingType | 'all'>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Fetch listings from Firestore
  useEffect(() => {
    async function fetchListings() {
      if (!user?.uid) return;
      try {
        setLoading(true);
        setError(null);
        const status = statusFilter === 'all' ? undefined : statusFilter;
        const data = await listSellerListings(user.uid, status);
        setListings(data);
      } catch (err) {
        console.error('Error fetching listings:', err);
        setError(err instanceof Error ? err.message : 'Failed to load listings');
      } finally {
        setLoading(false);
      }
    }
    fetchListings();
  }, [user?.uid, statusFilter]);

  const filteredListings = useMemo(() => {
    const query = debouncedSearchQuery.toLowerCase();
    return listings.filter((listing) => {
      const matchesSearch = !query || listing.title.toLowerCase().includes(query);
      const matchesType = typeFilter === 'all' || listing.type === typeFilter;
      const matchesLocation = locationFilter === 'all' || 
        `${listing.location?.city || 'Unknown'}, ${listing.location?.state || 'Unknown'}` === locationFilter;

      return matchesSearch && matchesType && matchesLocation;
    });
  }, [listings, debouncedSearchQuery, typeFilter, locationFilter]);

  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value as ListingStatus | 'all');
  }, []);

  const handleTypeChange = useCallback((value: string) => {
    setTypeFilter(value as ListingType | 'all');
  }, []);

  const handleLocationChange = useCallback((value: string) => {
    setLocationFilter(value);
  }, []);

  const uniqueLocations = useMemo(() => {
    const locations = new Set(
      listings.map((l) => `${l.location.city}, ${l.location.state}`)
    );
    return Array.from(locations);
  }, [listings]);

  // Refresh listings after actions
  const refreshListings = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const status = statusFilter === 'all' ? undefined : statusFilter;
      const data = await listSellerListings(user.uid, status);
      setListings(data);
    } catch (err) {
      console.error('Error refreshing listings:', err);
    }
  }, [user?.uid, statusFilter]);

  // Action handlers
  const handlePause = useCallback(async (listing: Listing) => {
    if (!user?.uid) return;
    
    setSelectedListing(listing);
    setPauseDialogOpen(true);
  }, [user?.uid]);

  const confirmPause = useCallback(async () => {
    if (!user?.uid || !selectedListing) return;

    try {
      setActionLoading(selectedListing.id);
      await unpublishListing(user.uid, selectedListing.id);
      toast({
        title: 'Listing paused',
        description: `${selectedListing.title} has been unpublished and moved to drafts.`,
      });
      setPauseDialogOpen(false);
      setSelectedListing(null);
      await refreshListings();
    } catch (err: any) {
      toast({
        title: 'Error pausing listing',
        description: err.message || 'Failed to pause listing. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  }, [user?.uid, selectedListing, toast, refreshListings]);


  const handleDelete = useCallback(async (listing: Listing) => {
    if (!user?.uid) return;
    
    setSelectedListing(listing);
    setDeleteDialogOpen(true);
  }, [user?.uid]);

  const confirmDelete = useCallback(async () => {
    if (!user?.uid || !selectedListing) return;

    try {
      setActionLoading(selectedListing.id);
      await deleteListing(user.uid, selectedListing.id);
      toast({
        title: 'Listing deleted',
        description: `${selectedListing.title} has been permanently deleted.`,
      });
      setDeleteDialogOpen(false);
      setSelectedListing(null);
      await refreshListings();
    } catch (err: any) {
      toast({
        title: 'Error deleting listing',
        description: err.message || 'Failed to delete listing. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setActionLoading(null);
    }
  }, [user?.uid, selectedListing, toast, refreshListings]);

  const handlePublish = useCallback(
    async (listing: Listing) => {
      if (!user?.uid) return;
      if (listing.status !== 'draft') {
        toast({
          title: 'Publish not available',
          description: `This listing is ${listing.status}.`,
          variant: 'destructive',
        });
        return;
      }

      try {
        setActionLoading(listing.id);
        const result = await publishListing(user.uid, listing.id);

        // If they were filtering to Draft only, switch to All so they can see the new status.
        if (statusFilter === 'draft') {
          setStatusFilter('all');
        }

        toast({
          title: result?.pendingReview ? 'Submitted for review' : 'Listing published',
          description: result?.pendingReview
            ? 'Your listing is now pending compliance review.'
            : 'Your listing is now live.',
        });

        await refreshListings();
      } catch (err: any) {
        toast({
          title: 'Error publishing listing',
          description: err?.message || 'Failed to publish listing. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setActionLoading(null);
      }
    },
    [user?.uid, toast, refreshListings, statusFilter]
  );

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-2">
              Listings
            </h1>
            <p className="text-base md:text-lg text-muted-foreground">
              Manage your listings and track performance
            </p>
          </div>
          <CreateListingGateButton href="/dashboard/listings/new" className="min-h-[44px] font-semibold gap-2">
            <PlusCircle className="h-4 w-4" />
            Create Listing
          </CreateListingGateButton>
        </div>

        {/* Filters */}
        <Card className="border-2 border-border/50 bg-card">
          <CardContent className="pt-6 pb-6 px-4 md:px-6">
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search listings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 h-11 bg-background"
                />
              </div>

              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-full md:w-[180px] h-11 bg-background">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="removed">Removed</SelectItem>
                </SelectContent>
              </Select>

              {/* Type Filter */}
              <Select value={typeFilter} onValueChange={handleTypeChange}>
                <SelectTrigger className="w-full md:w-[180px] h-11 bg-background">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="auction">Auction</SelectItem>
                  <SelectItem value="fixed">Fixed Price</SelectItem>
                  <SelectItem value="classified">Classified</SelectItem>
                </SelectContent>
              </Select>

              {/* Location Filter */}
              <Select value={locationFilter} onValueChange={handleLocationChange}>
                <SelectTrigger className="w-full md:w-[180px] h-11 bg-background">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {uniqueLocations.map((location) => (
                    <SelectItem key={location} value={location}>
                      {location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Loading State */}
        {loading && (
          <Card className="border-2 border-border/50 bg-card">
            <CardContent className="pt-12 pb-12 px-6 text-center">
              <div className="inline-block h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-muted-foreground">Loading listings...</p>
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {error && !loading && (
          <Card className="border-2 border-border/50 bg-card">
            <CardContent className="pt-12 pb-12 px-6 text-center">
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </CardContent>
          </Card>
        )}

        {/* Listings Table/Grid */}
        {!loading && !error && filteredListings.length === 0 && (
          <Card className="border-2 border-border/50 bg-card">
            <CardContent className="pt-12 pb-12 px-6 text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No listings found</h3>
              <p className="text-sm text-muted-foreground mb-6">
                {searchQuery || statusFilter !== 'all' || typeFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Create your first listing to get started'}
              </p>
              <CreateListingGateButton href="/dashboard/listings/new" className="min-h-[44px] font-semibold gap-2">
                <PlusCircle className="h-4 w-4" />
                Create Listing
              </CreateListingGateButton>
            </CardContent>
          </Card>
        )}

        {!loading && !error && filteredListings.length > 0 && (
          <Card className="border-2 border-border/50 bg-card">
            <CardContent className="p-0">
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-border/50 bg-background/50">
                      <th className="h-14 px-6 text-left align-middle font-bold text-sm uppercase tracking-wide text-muted-foreground">
                        Listing
                      </th>
                      <th className="h-14 px-6 text-left align-middle font-bold text-sm uppercase tracking-wide text-muted-foreground">
                        Type
                      </th>
                      <th className="h-14 px-6 text-left align-middle font-bold text-sm uppercase tracking-wide text-muted-foreground">
                        Price/Bid
                      </th>
                      <th className="h-14 px-6 text-left align-middle font-bold text-sm uppercase tracking-wide text-muted-foreground">
                        Location
                      </th>
                      <th className="h-14 px-6 text-left align-middle font-bold text-sm uppercase tracking-wide text-muted-foreground">
                        Status
                      </th>
                      <th className="h-14 px-6 text-left align-middle font-bold text-sm uppercase tracking-wide text-muted-foreground">
                        Metrics
                      </th>
                      <th className="h-14 px-6 text-left align-middle font-bold text-sm uppercase tracking-wide text-muted-foreground">
                        Actions
                      </th>
                    </tr>
                  </thead>
              <tbody>
                {filteredListings.map((listing) => (
                  <ListingRow
                    key={listing.id}
                    listing={listing}
                    onPublish={handlePublish}
                    onPause={handlePause}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden divide-y divide-border/30">
                {filteredListings.map((listing) => (
                  <MobileListingCard 
                    key={listing.id} 
                    listing={listing}
                    onPublish={handlePublish}
                    onPause={handlePause}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Delete Listing?
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to permanently delete <strong>{selectedListing?.title}</strong>? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false);
                  setSelectedListing(null);
                }}
                disabled={actionLoading === selectedListing?.id}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDelete}
                disabled={actionLoading === selectedListing?.id}
              >
                {actionLoading === selectedListing?.id ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Permanently
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Pause Confirmation Dialog */}
        <Dialog open={pauseDialogOpen} onOpenChange={setPauseDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pause Listing?</DialogTitle>
              <DialogDescription>
                Are you sure you want to unpublish <strong>{selectedListing?.title}</strong>? It will be moved to drafts and will no longer be visible to buyers.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setPauseDialogOpen(false);
                  setSelectedListing(null);
                }}
                disabled={actionLoading === selectedListing?.id}
              >
                Cancel
              </Button>
              <Button
                onClick={confirmPause}
                disabled={actionLoading === selectedListing?.id}
              >
                {actionLoading === selectedListing?.id ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Pausing...
                  </>
                ) : (
                  'Pause Listing'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}

export default function SellerListingsPage() {
  return (
    <RequireAuth>
      <SellerListingsPageContent />
    </RequireAuth>
  );
}
