'use client';

import { useState, useMemo, memo, useCallback, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
  LayoutGrid,
  List,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ListingRowActions } from '@/components/listings/ListingRowActions';
import { useDebounce } from '@/hooks/use-debounce';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { listSellerListings, unpublishListing, deleteListing, publishListing, resubmitListing, duplicateListing, reconcileListingSold } from '@/lib/firebase/listings';
import { getOrdersForUser } from '@/lib/firebase/orders';
import { Listing, ListingStatus, ListingType } from '@/lib/types';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { CreateListingGateButton } from '@/components/listings/CreateListingGate';
import { SellerListingsSkeleton } from '@/components/skeletons/SellerListingsSkeleton';
import { useRouter } from 'next/navigation';
import { getEffectiveListingStatus, isAuctionEnded } from '@/lib/listings/effectiveStatus';
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
const getStatusBadge = (params: { status: string; type?: string; ended?: boolean }) => {
  const { status, type, ended } = params;
  const variants: Record<
    string,
    {
      label: string;
      className: string;
    }
  > = {
    draft: {
      label: 'Draft',
      className: 'bg-white text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-600',
    },
    pending: {
      label: 'Pending approval',
      className: 'bg-amber-500/10 text-amber-700 border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40',
    },
    active: {
      label: 'Active',
      className: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40',
    },
    ended: {
      label: 'Ended',
      className: 'bg-slate-500/10 text-slate-700 border-slate-500/30 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/40',
    },
    expired: {
      label: type === 'auction' && ended ? 'Ended' : 'Expired',
      className: 'bg-slate-500/10 text-slate-700 border-slate-500/30 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/40',
    },
    sold: {
      label: 'Sold',
      className: 'bg-sky-500/10 text-sky-700 border-sky-500/30 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-500/40',
    },
    removed: {
      label: 'Rejected',
      className: 'bg-red-500/10 text-red-700 border-red-500/30 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/40',
    },
  };

  const config = variants[status] || {
    label: status,
    className: 'bg-muted/40 text-muted-foreground border-border/60',
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        'font-semibold text-xs whitespace-nowrap',
        config.className
      )}
    >
      {config.label}
    </Badge>
  );
};

const getTypeBadge = (type: string) => {
  const labels: Record<string, string> = {
    auction: 'Auction',
    fixed: 'Fixed',
    classified: 'Classified',
  };
  return (
    <Badge variant="outline" className="font-semibold text-xs whitespace-nowrap">
      {labels[type] || type}
    </Badge>
  );
};

const formatTimeRemaining = (date?: any) => {
  if (!date) return null;
  const d: Date | null =
    date instanceof Date
      ? date
      : typeof date?.toDate === 'function'
      ? (() => {
          try {
            const dd = date.toDate();
            return dd instanceof Date && Number.isFinite(dd.getTime()) ? dd : null;
          } catch {
            return null;
          }
        })()
      : typeof date?.seconds === 'number'
      ? new Date(date.seconds * 1000)
      : typeof date === 'string' || typeof date === 'number'
      ? new Date(date)
      : null;

  if (!d || !Number.isFinite(d.getTime())) return null;

  const minutes = Math.floor((d.getTime() - Date.now()) / (1000 * 60));
  if (minutes <= 0) return 'Ended';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

const getPrimaryListingImageUrl = (listing: Listing): string | null => {
  const coverId = (listing as any)?.coverPhotoId as string | undefined;
  const photos = Array.isArray((listing as any)?.photos) ? ((listing as any).photos as any[]) : [];
  if (coverId && photos.length) {
    const cover = photos.find((p) => String(p?.photoId) === String(coverId));
    if (cover?.url) return String(cover.url);
  }
  if (photos.length && photos[0]?.url) return String(photos[0].url);
  const images = Array.isArray((listing as any)?.images) ? ((listing as any).images as any[]) : [];
  if (images.length && images[0]) return String(images[0]);
  return null;
};

// Memoized Listing Row component for performance
const ListingRow = memo(({ 
  listing, 
  effectiveStatus,
  onPublish,
  onResubmit,
  canResubmit,
  onDuplicate,
  onPause, 
  onDelete,
  onReconcileSold,
  actionLoading,
  orderId,
}: { 
  listing: Listing;
  effectiveStatus: ListingStatus;
  onPublish: (listing: Listing) => void;
  onResubmit: (listing: Listing) => void;
  canResubmit: (listing: Listing) => boolean;
  onDuplicate: (listing: Listing) => void;
  onPause: (listing: Listing) => void;
  onDelete: (listing: Listing) => void;
  onReconcileSold?: (listing: Listing) => void;
  actionLoading?: string | null;
  /** When sold, order ID for "Manage sale" link */
  orderId?: string;
}) => (
  <tr
    key={listing.id}
    className="border-b border-border/30 hover:bg-background/50 group"
  >
    <td className="p-4 align-middle">
      <div className="flex items-center gap-4">
        <Link
          href={`/listing/${listing.id}`}
          className="h-32 w-48 sm:h-36 sm:w-56 rounded-xl overflow-hidden bg-muted flex-shrink-0 relative block"
        >
          {getPrimaryListingImageUrl(listing) ? (
            <Image src={getPrimaryListingImageUrl(listing) as string} alt="" fill className="object-cover" sizes="224px" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <Package className="h-10 w-10 opacity-40" />
            </div>
          )}
        </Link>
        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
          <Link
            href={`/listing/${listing.id}`}
            className="font-semibold text-base sm:text-lg text-foreground hover:text-primary group-hover:underline line-clamp-2 leading-snug"
          >
            {listing.title}
          </Link>
          {listing.endsAt && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{effectiveStatus === 'active' ? `Ends in ${formatTimeRemaining(listing.endsAt)}` : 'Ended'}</span>
            </div>
          )}
        </div>
      </div>
    </td>
    <td className="p-4 align-middle">
      <div className="flex justify-start">
        {getTypeBadge(listing.type)}
      </div>
    </td>
    <td className="p-4 align-middle">
      <div className="font-bold text-lg text-foreground whitespace-nowrap">
        {listing.type === 'auction'
          ? listing.currentBid
            ? `$${listing.currentBid.toLocaleString()}`
            : 'No bids'
          : listing.price
          ? `$${listing.price.toLocaleString()}`
          : 'Contact'}
      </div>
    </td>
    <td className="p-3 align-middle">
      <div className="flex items-center gap-1 text-sm text-muted-foreground min-w-0">
        <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="truncate">{listing.location?.city || 'Unknown'}, {listing.location?.state || 'Unknown'}</span>
      </div>
    </td>
    <td className="p-3 align-middle">
      <div className="flex justify-start">
        {getStatusBadge({
          status: effectiveStatus,
          type: listing.type,
          ended: isAuctionEnded(listing),
        })}
      </div>
    </td>
    <td className="p-3 align-middle">
      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          <Eye className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{listing.metrics.views}</span>
        </div>
        {listing.type === 'auction' && (
          <>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <Users className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{listing.metrics.favorites}</span>
            </div>
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <Gavel className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{listing.metrics.bidCount}</span>
            </div>
          </>
        )}
      </div>
    </td>
    <td className="p-3 align-middle">
      <div className="flex justify-start">
        <ListingRowActions
          listingId={listing.id}
          status={effectiveStatus}
          orderId={orderId}
          onPromote={() => onPublish(listing)}
          onResubmit={() => onResubmit(listing)}
          resubmitDisabled={effectiveStatus === 'removed' ? !canResubmit(listing) : undefined}
          onDuplicate={() => onDuplicate(listing)}
          onPause={() => onPause(listing)}
          onDelete={() => onDelete(listing)}
          onReconcileSold={onReconcileSold ? () => onReconcileSold(listing) : undefined}
          reconcilingSold={actionLoading === listing.id}
        />
      </div>
    </td>
  </tr>
));
ListingRow.displayName = 'ListingRow';

// Memoized Mobile Listing Card — vertical card: image on top (aspect ratio), then content
const MobileListingCard = memo(({ 
  listing, 
  effectiveStatus,
  onPublish,
  onResubmit,
  canResubmit,
  onDuplicate,
  onPause, 
  onDelete,
  onReconcileSold,
  actionLoading,
  orderId,
}: { 
  listing: Listing;
  effectiveStatus: ListingStatus;
  onPublish: (listing: Listing) => void;
  onResubmit: (listing: Listing) => void;
  canResubmit: (listing: Listing) => boolean;
  onDuplicate: (listing: Listing) => void;
  onPause: (listing: Listing) => void;
  onDelete: (listing: Listing) => void;
  onReconcileSold?: (listing: Listing) => void;
  actionLoading?: string | null;
  orderId?: string;
}) => (
  <div
    key={listing.id}
    className="rounded-xl border border-border/60 bg-card overflow-hidden transition-colors hover:bg-muted/30"
  >
    <Link href={`/listing/${listing.id}`} className="block w-full">
      <div className="relative w-full aspect-[4/3] bg-muted">
        {getPrimaryListingImageUrl(listing) ? (
          <Image
            src={getPrimaryListingImageUrl(listing) as string}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 400px"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <Package className="h-10 w-10 opacity-40" />
          </div>
        )}
      </div>
    </Link>
    <div className="p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2 min-w-0">
        <Link
          href={`/listing/${listing.id}`}
          className="font-semibold text-sm text-foreground hover:text-primary line-clamp-2 min-w-0 flex-1"
        >
          {listing.title}
        </Link>
        <div className="shrink-0">
          <ListingRowActions
            listingId={listing.id}
            status={effectiveStatus}
            orderId={orderId}
            onPromote={() => onPublish(listing)}
            onResubmit={() => onResubmit(listing)}
            resubmitDisabled={effectiveStatus === 'removed' ? !canResubmit(listing) : undefined}
            onDuplicate={() => onDuplicate(listing)}
            onPause={() => onPause(listing)}
            onDelete={() => onDelete(listing)}
            onReconcileSold={onReconcileSold ? () => onReconcileSold(listing) : undefined}
            reconcilingSold={actionLoading === listing.id}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {getTypeBadge(listing.type)}
        {getStatusBadge({
          status: effectiveStatus,
          type: listing.type,
          ended: isAuctionEnded(listing),
        })}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-bold text-foreground tabular-nums">
          {listing.type === 'auction'
            ? listing.currentBid
              ? `$${listing.currentBid.toLocaleString()}`
              : 'No bids'
            : listing.price
            ? `$${listing.price.toLocaleString()}`
            : 'Contact'}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">
          {listing.location?.city || '—'}, {listing.location?.state || '—'}
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{listing.metrics.views} views</span>
        {listing.type === 'auction' && (
          <>
            <span>{listing.metrics.favorites} watchers</span>
            <span>{listing.metrics.bidCount} bids</span>
          </>
        )}
        {listing.endsAt && (
          <span className="ml-auto">
            {effectiveStatus === 'active' ? `Ends ${formatTimeRemaining(listing.endsAt)}` : 'Ended'}
          </span>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        {effectiveStatus === 'sold' && orderId ? (
          <>
            <Button variant="default" size="sm" asChild className="min-h-9 flex-1 text-sm">
              <Link href={`/seller/orders/${orderId}`}>Manage sale</Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="min-h-9 flex-1 text-sm">
              <Link href={`/listing/${listing.id}`}>View</Link>
            </Button>
          </>
        ) : (
          <>
            <Button variant="default" size="sm" asChild className="min-h-9 flex-1 text-sm">
              <Link href={`/listing/${listing.id}`}>View</Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="min-h-9 flex-1 text-sm border-primary text-primary hover:bg-primary/10 hover:text-primary">
              <Link href={`/seller/listings/${listing.id}/edit`}>Edit</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  </div>
));
MobileListingCard.displayName = 'MobileListingCard';

// Compact list row for list view (mobile and optionally desktop)
const ListingListRow = memo(({
  listing,
  effectiveStatus,
  onPublish,
  onResubmit,
  canResubmit,
  onDuplicate,
  onPause,
  onDelete,
  onReconcileSold,
  actionLoading,
  orderId,
}: {
  listing: Listing;
  effectiveStatus: ListingStatus;
  onPublish: (listing: Listing) => void;
  onResubmit: (listing: Listing) => void;
  canResubmit: (listing: Listing) => boolean;
  onDuplicate: (listing: Listing) => void;
  onPause: (listing: Listing) => void;
  onDelete: (listing: Listing) => void;
  onReconcileSold?: (listing: Listing) => void;
  actionLoading?: string | null;
  orderId?: string;
}) => (
  <div
    key={listing.id}
    className="flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4 sm:p-5 transition-colors hover:bg-muted/30"
  >
    <Link
      href={`/listing/${listing.id}`}
      className="h-24 w-32 sm:h-28 sm:w-40 rounded-lg overflow-hidden bg-muted flex-shrink-0 relative block"
    >
      {getPrimaryListingImageUrl(listing) ? (
        <Image
          src={getPrimaryListingImageUrl(listing) as string}
          alt=""
          fill
          className="object-cover"
          sizes="160px"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <Package className="h-6 w-6 opacity-40" />
        </div>
      )}
    </Link>
    <div className="flex-1 min-w-0 flex flex-col gap-2 sm:gap-2.5">
      <Link
        href={`/listing/${listing.id}`}
        className="font-semibold text-sm sm:text-base text-foreground hover:text-primary line-clamp-2 leading-snug"
      >
        {listing.title}
      </Link>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {getTypeBadge(listing.type)}
        {getStatusBadge({
          status: effectiveStatus,
          type: listing.type,
          ended: isAuctionEnded(listing),
        })}
      </div>
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-4 gap-0.5 text-sm">
        <span className="font-bold text-foreground tabular-nums">
          {listing.type === 'auction'
            ? listing.currentBid
              ? `$${listing.currentBid.toLocaleString()}`
              : 'No bids'
            : listing.price
            ? `$${listing.price.toLocaleString()}`
            : 'Contact'}
        </span>
        <span className="text-muted-foreground truncate">
          {listing.location?.city || '—'}, {listing.location?.state || '—'}
        </span>
      </div>
    </div>
    <div className="flex-shrink-0">
      <ListingRowActions
        listingId={listing.id}
        status={effectiveStatus}
        orderId={orderId}
        onPromote={() => onPublish(listing)}
        onResubmit={() => onResubmit(listing)}
        resubmitDisabled={effectiveStatus === 'removed' ? !canResubmit(listing) : undefined}
        onDuplicate={() => onDuplicate(listing)}
        onPause={() => onPause(listing)}
        onDelete={() => onDelete(listing)}
        onReconcileSold={onReconcileSold ? () => onReconcileSold(listing) : undefined}
        reconcilingSold={actionLoading === listing.id}
      />
    </div>
  </div>
));
ListingListRow.displayName = 'ListingListRow';

function SellerListingsPageContent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [statusFilter, setStatusFilter] = useState<ListingStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<ListingType | 'all'>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'gallery' | 'list'>('gallery');
  const [listings, setListings] = useState<Listing[]>([]);
  const [soldListingIdsFromOrders, setSoldListingIdsFromOrders] = useState<Set<string>>(new Set());
  /** listingId → orderId for sold listings so seller can open "Manage sale" */
  const [soldListingToOrderId, setSoldListingToOrderId] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pauseDialogOpen, setPauseDialogOpen] = useState(false);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Helper: effective status for a listing, including "sold" when an order exists (webhook may not have updated listing doc)
  const getEffectiveStatusForListing = useCallback(
    (listing: Listing, nowMs: number = Date.now()): ListingStatus => {
      if (soldListingIdsFromOrders.has(listing.id)) return 'sold';
      return getEffectiveListingStatus(listing, nowMs);
    },
    [soldListingIdsFromOrders]
  );

  // Fetch listings and sold-by-order listing IDs (fallback when webhook didn't mark listing sold)
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;

    async function fetchListingsAndSoldIds() {
      try {
        setLoading(true);
        setError(null);
        const [data, sellerOrders] = await Promise.all([
          listSellerListings(user!.uid),
          getOrdersForUser(user!.uid, 'seller'),
        ]);
        if (cancelled) return;
        setListings(data);

        // Any order that has been paid and not refunded/cancelled counts as sold for this listing
        const soldOrderStatuses = [
          'paid_held',
          'paid', // legacy
          'in_transit',
          'delivered',
          'buyer_confirmed',
          'accepted', // legacy
          'ready_to_release',
          'disputed',
          'completed',
        ];
        const soldIds = new Set<string>();
        const listingToOrder: Record<string, string> = {};
        sellerOrders.forEach((o) => {
          const lid = String(o.listingId ?? '').trim();
          if (lid && (soldOrderStatuses as string[]).includes(o.status ?? '')) {
            soldIds.add(lid);
            if (!listingToOrder[lid]) listingToOrder[lid] = o.id;
          }
        });
        setSoldListingIdsFromOrders(soldIds);
        setSoldListingToOrderId(listingToOrder);

        // Reconcile: (1) listings with a paid order but doc not marked sold, or (2) ended/expired listings not sold
        // (2) catches auctions like Caleb Williams where the order's listingId may not have been in our set yet
        const nowMs = Date.now();
        const toReconcile = data.filter((l) => {
          if (l.status === 'sold' || l.soldAt) return false;
          if (soldIds.has(l.id)) return true;
          const effective = getEffectiveListingStatus(l, nowMs);
          return effective === 'ended' || effective === 'expired';
        });
        if (toReconcile.length > 0 && user) {
          try {
            await Promise.all(
              toReconcile.map((l) =>
                reconcileListingSold(l.id).catch(() => {})
              )
            );
            const fresh = await listSellerListings(user.uid);
            if (!cancelled) setListings(fresh);
          } catch {
            // Non-fatal: UI still shows Sold via soldIds; reconciliation is best-effort
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error fetching listings:', err);
          setError(err instanceof Error ? err.message : 'Failed to load listings');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchListingsAndSoldIds();
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const filteredListings = useMemo(() => {
    const query = debouncedSearchQuery.toLowerCase();
    const nowMs = Date.now();
    return listings.filter((listing) => {
      const effectiveStatus = getEffectiveStatusForListing(listing, nowMs);
      const matchesSearch = !query || listing.title.toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'all' || effectiveStatus === statusFilter;
      const matchesType = typeFilter === 'all' || listing.type === typeFilter;
      const matchesLocation = locationFilter === 'all' || 
        `${listing.location?.city || 'Unknown'}, ${listing.location?.state || 'Unknown'}` === locationFilter;

      return matchesSearch && matchesStatus && matchesType && matchesLocation;
    });
  }, [listings, debouncedSearchQuery, statusFilter, typeFilter, locationFilter, getEffectiveStatusForListing]);

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
      listings.map((l) => `${l.location?.city || 'Unknown'}, ${l.location?.state || 'Unknown'}`)
    );
    return Array.from(locations);
  }, [listings]);

  const nowMs = Date.now();
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: listings.length };
    listings.forEach((l) => {
      const s = getEffectiveStatusForListing(l, nowMs);
      counts[s] = (counts[s] ?? 0) + 1;
    });
    return counts;
  }, [listings, getEffectiveStatusForListing]);
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: listings.length };
    listings.forEach((l) => {
      const t = l.type || 'fixed';
      counts[t] = (counts[t] ?? 0) + 1;
    });
    return counts;
  }, [listings]);

  const statusChipDefs: { key: ListingStatus | 'all'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Draft' },
    { key: 'active', label: 'Active' },
    { key: 'sold', label: 'Sold' },
    { key: 'expired', label: 'Ended' },
    { key: 'removed', label: 'Removed' },
  ];
  const typeChipDefs: { key: ListingType | 'all'; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'auction', label: 'Auction' },
    { key: 'fixed', label: 'Fixed' },
    { key: 'classified', label: 'Classified' },
  ];
  const hasActiveFilters = searchQuery.trim() !== '' || statusFilter !== 'all' || typeFilter !== 'all' || locationFilter !== 'all';
  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('all');
    setTypeFilter('all');
    setLocationFilter('all');
  }, []);

  // Refresh listings (and sold-order map) after actions so "Manage sale" is available
  const refreshListings = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const [data, sellerOrders] = await Promise.all([
        listSellerListings(user.uid),
        getOrdersForUser(user.uid, 'seller'),
      ]);
      setListings(data);
      const soldOrderStatuses = ['paid_held', 'paid', 'in_transit', 'delivered', 'buyer_confirmed', 'accepted', 'ready_to_release', 'disputed', 'completed'];
      const soldIds = new Set<string>();
      const listingToOrder: Record<string, string> = {};
      sellerOrders.forEach((o) => {
        const lid = String(o.listingId ?? '').trim();
        if (lid && (soldOrderStatuses as string[]).includes(o.status ?? '')) {
          soldIds.add(lid);
          if (!listingToOrder[lid]) listingToOrder[lid] = o.id;
        }
      });
      setSoldListingIdsFromOrders(soldIds);
      setSoldListingToOrderId(listingToOrder);
    } catch (err) {
      console.error('Error refreshing listings:', err);
    }
  }, [user?.uid]);

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

  const handleReconcileSold = useCallback(
    async (listing: Listing) => {
      if (!user?.uid) return;
      try {
        setActionLoading(listing.id);
        await reconcileListingSold(listing.id);
        toast({
          title: 'Listing marked as sold',
          description: `${listing.title} is now shown as Sold.`,
        });
        await refreshListings();
      } catch (err: any) {
        toast({
          title: 'Could not mark as sold',
          description: err?.message ?? 'No paid order found for this listing, or the listing is already sold.',
          variant: 'destructive',
        });
      } finally {
        setActionLoading(null);
      }
    },
    [user?.uid, toast, refreshListings]
  );

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
            ? result?.pendingReason === 'admin_approval'
              ? 'Your listing is pending admin approval.'
              : 'Your listing is pending compliance review.'
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

  const canResubmit = useCallback(
    (listing: Listing) => {
      if (listing.status !== 'removed') return false;
      const rejectedAt = listing.rejectedAt instanceof Date ? listing.rejectedAt : null;
      const resubmittedForRejectionAt =
        listing.resubmittedForRejectionAt instanceof Date ? listing.resubmittedForRejectionAt : null;
      if (!rejectedAt) return false;
      if (resubmittedForRejectionAt && resubmittedForRejectionAt.getTime() === rejectedAt.getTime()) return false;
      if (!(listing.updatedAt instanceof Date)) return false;
      if (listing.updatedAt.getTime() <= rejectedAt.getTime()) return false;
      if (listing.updatedBy !== user?.uid) return false;
      return true;
    },
    [user?.uid]
  );

  const handleResubmit = useCallback(
    async (listing: Listing) => {
      if (!user?.uid) return;
      try {
        setActionLoading(listing.id);
        await resubmitListing(user.uid, listing.id);
        toast({
          title: 'Resubmitted',
          description: 'Your listing was resubmitted for admin approval.',
        });
        await refreshListings();
      } catch (e: any) {
        toast({
          title: 'Couldn’t resubmit yet',
          description:
            e?.code === 'MUST_EDIT_BEFORE_RESUBMIT'
              ? 'Edit and save the listing first, then resubmit.'
              : e?.message || 'Failed to resubmit listing.',
          variant: 'destructive',
        });
      } finally {
        setActionLoading(null);
      }
    },
    [refreshListings, toast, user?.uid]
  );

  const handleDuplicate = useCallback(
    async (listing: Listing) => {
      if (!user?.uid) return;
      try {
        setActionLoading(listing.id);
        const newId = await duplicateListing(user.uid, listing.id);
        toast({
          title: 'Duplicated',
          description: 'A copy was created as a draft. You can edit and publish it when ready.',
        });
        // Best UX: take them straight to the copy.
        router.push(`/seller/listings/${newId}/edit`);
      } catch (e: any) {
        toast({
          title: 'Error duplicating listing',
          description: e?.message || 'Failed to duplicate listing. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setActionLoading(null);
      }
    },
    [router, toast, user?.uid]
  );

  // Loading state — layout-matched skeleton so content loads in place (no flash)
  if (loading && !error) {
    return <SellerListingsSkeleton />;
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-4 sm:py-6 md:py-8 max-w-7xl space-y-4 sm:space-y-6 md:space-y-8">
        {/* Header — compact on mobile */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl md:text-4xl font-extrabold text-foreground mb-0.5 sm:mb-2">
              Listings
            </h1>
            <p className="text-xs sm:text-base md:text-lg text-muted-foreground">
              Manage listings and track performance
            </p>
          </div>
          <CreateListingGateButton href="/dashboard/listings/new" className="min-h-[44px] font-semibold gap-2 shrink-0">
            <PlusCircle className="h-4 w-4" />
            Create Listing
          </CreateListingGateButton>
        </div>

        {/* Search + filters (My Purchases / Bids & Offers style) */}
        <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20">
          <CardContent className="p-4 space-y-4">
            {/* Search: full width on mobile, constrained on desktop */}
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <div className="relative w-full md:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search listings by title…"
                  className="pl-9"
                />
              </div>
              {/* Desktop: Location select only in top row */}
              <div className="hidden md:flex items-center gap-2 flex-wrap justify-end">
                <Select value={locationFilter} onValueChange={handleLocationChange}>
                  <SelectTrigger className="min-w-[180px]">
                    <SelectValue placeholder="Location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locations</SelectItem>
                    {uniqueLocations.map((location) => (
                      <SelectItem key={location} value={location}>
                        {location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Status + Type chips (mobile: scroll; desktop: wrap) */}
            <div className="overflow-x-auto overflow-y-hidden -mx-1 px-1 we-scrollbar-hover">
              <div className="flex items-center gap-2 flex-nowrap md:flex-wrap min-w-0">
                {statusChipDefs.map((d) => {
                  const active = statusFilter === d.key;
                  const count = statusCounts[d.key] ?? 0;
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => setStatusFilter(d.key)}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition flex-shrink-0 whitespace-nowrap',
                        active
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border/60 bg-background/40 text-foreground hover:bg-muted/40'
                      )}
                    >
                      <span>{d.label}</span>
                      <span className={cn('text-xs rounded-full px-2 py-0.5', active ? 'bg-primary/15' : 'bg-muted')}>
                        {count}
                      </span>
                    </button>
                  );
                })}
                {typeChipDefs.map((d) => {
                  const active = typeFilter === d.key;
                  const count = typeCounts[d.key] ?? 0;
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => setTypeFilter(d.key)}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition flex-shrink-0 whitespace-nowrap',
                        active
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border/60 bg-background/40 text-foreground hover:bg-muted/40'
                      )}
                    >
                      <span>{d.label}</span>
                      <span className={cn('text-xs rounded-full px-2 py-0.5', active ? 'bg-primary/15' : 'bg-muted')}>
                        {count}
                      </span>
                    </button>
                  );
                })}
                <Select value={locationFilter} onValueChange={handleLocationChange}>
                  <SelectTrigger className="h-8 rounded-full min-w-0 w-auto px-3 text-xs font-semibold border-border/60 bg-background/40 flex-shrink-0 md:hidden [&>span]:max-w-[100px] [&>span]:truncate">
                    <SelectValue placeholder="Location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locations</SelectItem>
                    {uniqueLocations.map((location) => (
                      <SelectItem key={location} value={location}>
                        {location}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {hasActiveFilters && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-full h-8 px-3 text-xs font-semibold flex-shrink-0"
                    onClick={clearFilters}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Desktop: Clear filters link */}
            {hasActiveFilters && (
              <div className="hidden md:block text-right">
                <Button type="button" variant="ghost" size="sm" className="font-semibold" onClick={clearFilters}>
                  Clear filters
                </Button>
              </div>
            )}

            {/* Gallery / List view toggle */}
            <div className="flex items-center gap-2 border-t border-border/40 mt-2 pt-3">
              <span className="text-sm font-semibold text-muted-foreground">View:</span>
              <div className="flex rounded-lg border border-border/60 bg-background/40 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('gallery')}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition',
                    viewMode === 'gallery'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-foreground hover:bg-muted/60'
                  )}
                >
                  <LayoutGrid className="h-4 w-4" />
                  Gallery
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold transition',
                    viewMode === 'list'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-foreground hover:bg-muted/60'
                  )}
                >
                  <List className="h-4 w-4" />
                  List
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error State */}
        {error && !loading && (
          <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20">
            <CardContent className="pt-12 pb-12 px-6 text-center">
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </CardContent>
          </Card>
        )}

        {/* Listings Table/Grid */}
        {!loading && !error && filteredListings.length === 0 && (
          <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20">
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
          <Card className="rounded-xl border-0 bg-transparent md:border md:border-border/60 md:bg-muted/30 md:dark:bg-muted/20">
            <CardContent className="p-0">
              {/* Gallery view: cards in grid (mobile = single column, desktop = multi-column) */}
              {viewMode === 'gallery' && (
                <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredListings.map((listing) => (
                    <MobileListingCard
                      key={listing.id}
                      listing={listing}
                      effectiveStatus={getEffectiveStatusForListing(listing)}
                      onPublish={handlePublish}
                      onResubmit={handleResubmit}
                      canResubmit={canResubmit}
                      onDuplicate={handleDuplicate}
                      onPause={handlePause}
                      onDelete={handleDelete}
                      onReconcileSold={handleReconcileSold}
                      actionLoading={actionLoading}
                      orderId={soldListingToOrderId[listing.id]}
                    />
                  ))}
                </div>
              )}

              {/* List view: desktop = table, mobile = compact rows */}
              {viewMode === 'list' && (
                <>
                  <div className="hidden md:block overflow-hidden">
                    <table className="w-full table-fixed">
                      <colgroup>
                        <col className="w-[34%]" />
                        <col className="w-[9%]" />
                        <col className="w-[11%]" />
                        <col className="w-[14%]" />
                        <col className="w-[10%]" />
                        <col className="w-[12%]" />
                        <col className="w-[10%]" />
                      </colgroup>
                      <thead>
                        <tr className="border-b-2 border-border/50 bg-background/50">
                          <th className="h-16 px-4 text-left align-middle font-bold text-sm uppercase tracking-wide text-muted-foreground">
                            Listing
                          </th>
                          <th className="h-16 px-4 text-left align-middle font-bold text-sm uppercase tracking-wide text-muted-foreground">
                            Type
                          </th>
                          <th className="h-16 px-4 text-left align-middle font-bold text-sm uppercase tracking-wide text-muted-foreground">
                            Price/Bid
                          </th>
                          <th className="h-16 px-4 text-left align-middle font-bold text-sm uppercase tracking-wide text-muted-foreground">
                            Location
                          </th>
                          <th className="h-16 px-4 text-left align-middle font-bold text-sm uppercase tracking-wide text-muted-foreground">
                            Status
                          </th>
                          <th className="h-16 px-4 text-left align-middle font-bold text-sm uppercase tracking-wide text-muted-foreground">
                            Metrics
                          </th>
                          <th className="h-16 px-4 text-left align-middle font-bold text-sm uppercase tracking-wide text-muted-foreground">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredListings.map((listing) => (
                          <ListingRow
                            key={listing.id}
                            listing={listing}
                            effectiveStatus={getEffectiveStatusForListing(listing)}
                            onPublish={handlePublish}
                            onResubmit={handleResubmit}
                            canResubmit={canResubmit}
                            onDuplicate={handleDuplicate}
                            onPause={handlePause}
                            onDelete={handleDelete}
                            onReconcileSold={handleReconcileSold}
                            actionLoading={actionLoading}
                            orderId={soldListingToOrderId[listing.id]}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="md:hidden p-3 space-y-3">
                    {filteredListings.map((listing) => (
                      <ListingListRow
                        key={listing.id}
                        listing={listing}
                        effectiveStatus={getEffectiveStatusForListing(listing)}
                        onPublish={handlePublish}
                        onResubmit={handleResubmit}
                        canResubmit={canResubmit}
                        onDuplicate={handleDuplicate}
                        onPause={handlePause}
                        onDelete={handleDelete}
                        onReconcileSold={handleReconcileSold}
                        actionLoading={actionLoading}
                        orderId={soldListingToOrderId[listing.id]}
                      />
                    ))}
                  </div>
                </>
              )}
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
