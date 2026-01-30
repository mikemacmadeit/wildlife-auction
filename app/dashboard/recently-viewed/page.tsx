'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useRecentlyViewed } from '@/hooks/use-recently-viewed';
import { getListingsByIds, filterListingsForDiscovery } from '@/lib/firebase/listings';
import type { Listing } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ListingCard } from '@/components/listings/ListingCard';
import { ListItem } from '@/components/listings/ListItem';
import { cn } from '@/lib/utils';
import { DashboardContentSkeleton } from '@/components/skeletons/DashboardContentSkeleton';
import { LayoutGrid, List, Trash2 } from 'lucide-react';

type ViewMode = 'card' | 'list';

export default function RecentlyViewedPage() {
  const { user, loading: authLoading } = useAuth();
  const { recentIds, clearRecent } = useRecentlyViewed();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('card');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem('recently-viewed-view-mode');
    if (saved === 'card' || saved === 'list') setViewMode(saved);
  }, []);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (typeof window !== 'undefined') localStorage.setItem('recently-viewed-view-mode', mode);
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setListings([]);
      setLoading(false);
      return;
    }

    if (!recentIds.length) {
      setListings([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const fetched = await getListingsByIds(recentIds);
        if (cancelled) return;
        const valid = fetched.filter((x) => x !== null) as Listing[];
        setListings(filterListingsForDiscovery(valid));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, recentIds, user]);

  const hasItems = listings.length > 0;

  const topBar = useMemo(() => {
    return (
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold font-founders">Recently viewed</h1>
          <div className="text-sm text-muted-foreground">Your last {listings.length} listings</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className={cn('flex items-center gap-2 border border-border rounded-lg p-1 bg-card')}>
            <Button
              variant={viewMode === 'card' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleViewModeChange('card')}
              className="h-8 px-3"
            >
              <LayoutGrid className="h-4 w-4 mr-2" />
              Gallery
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleViewModeChange('list')}
              className="h-8 px-3"
            >
              <List className="h-4 w-4 mr-2" />
              List
            </Button>
          </div>
          <Button
            variant="outline"
            className="min-h-[40px] font-semibold"
            onClick={() => clearRecent()}
            disabled={!hasItems}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear
          </Button>
          <Button asChild className="min-h-[40px] font-semibold">
            <Link href="/browse">Browse</Link>
          </Button>
        </div>
      </div>
    );
  }, [clearRecent, hasItems, listings.length, viewMode]);

  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-10">
        <DashboardContentSkeleton />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-10">
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="text-lg font-extrabold">Sign in required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">Sign in to view your recently viewed listings.</div>
            <Button asChild className="min-h-[44px] font-semibold">
              <Link href="/login">Go to login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10 space-y-6">
      {topBar}

      {loading ? (
        <Card className="border-2">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">Loading listings…</CardContent>
        </Card>
      ) : !hasItems ? (
        <Card className="border-2">
          <CardContent className="py-12 text-center space-y-2">
            <div className="text-lg font-extrabold">No recently viewed</div>
            <div className="text-sm text-muted-foreground">Browse listings and they’ll show up here.</div>
            <Button asChild className="min-h-[44px] font-semibold">
              <Link href="/browse">Browse listings</Link>
            </Button>
          </CardContent>
        </Card>
      ) : viewMode === 'list' ? (
        <div className="space-y-3">
          {listings.map((l) => (
            <ListItem key={l.id} listing={l} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {listings.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </div>
  );
}

