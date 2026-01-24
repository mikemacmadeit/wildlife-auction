'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, PlusCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { listSellerListings } from '@/lib/firebase/listings';
import { Listing } from '@/lib/types';
import { CreateListingGateButton } from '@/components/listings/CreateListingGate';

export default function DashboardListingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchListings() {
      if (!user?.uid) {
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const data = await listSellerListings(user.uid);
        setListings(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load listings');
        toast({
          title: 'Error loading listings',
          description: err instanceof Error ? err.message : 'Please try again.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    }
    fetchListings();
  }, [user?.uid, toast]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto">
          <Card className="border-2">
            <CardContent className="pt-12 pb-12 px-6 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-muted-foreground">Loading listings...</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto">
          <Card className="border-2">
            <CardContent className="pt-12 pb-12 px-6 text-center">
              <p className="text-destructive mb-4">{error}</p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold">My Listings</h1>
            <p className="text-muted-foreground mt-1">Manage your listings</p>
          </div>
          <CreateListingGateButton href="/dashboard/listings/new" className="min-h-[44px] font-semibold gap-2">
            <PlusCircle className="h-4 w-4" />
            Create Listing
          </CreateListingGateButton>
        </div>

        {listings.length === 0 ? (
          <Card className="border-2">
            <CardContent className="pt-12 pb-12 px-6 text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No listings yet</h3>
              <p className="text-sm text-muted-foreground mb-6">Create your first listing to get started</p>
              <CreateListingGateButton href="/dashboard/listings/new" className="min-h-[44px] font-semibold gap-2">
                <PlusCircle className="h-4 w-4" />
                Create Listing
              </CreateListingGateButton>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {listings.map((listing) => (
              <Card key={listing.id} className="border-2 hover:border-primary/40 transition-colors">
                <CardContent className="p-4">
                  <div className="space-y-2">
                    <Link href={`/listing/${listing.id}`} className="font-semibold text-lg hover:text-primary">
                      {listing.title}
                    </Link>
                    <p className="text-sm text-muted-foreground line-clamp-2">{listing.description}</p>
                    <div className="flex items-center justify-between pt-2">
                      <span className="font-bold text-lg">
                        {listing.type === 'auction' 
                          ? `Starting: $${listing.startingBid?.toLocaleString() || '0'}`
                          : `$${listing.price?.toLocaleString() || '0'}`
                        }
                      </span>
                      <span className={`text-xs px-2 py-1 rounded font-semibold ${
                        listing.status === 'active' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' :
                        listing.status === 'draft' ? 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300' :
                        listing.status === 'pending' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {listing.status}
                      </span>
                    </div>
                    <div className="pt-2">
                      <Button asChild variant="outline" size="sm" className="w-full">
                        <Link href={`/seller/listings/${listing.id}/edit`}>Edit</Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
