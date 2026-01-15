'use client';

import { useMemo, memo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CountdownTimer } from '@/components/auction/CountdownTimer';
import {
  DollarSign,
  Gavel,
  Clock,
  CheckCircle2,
  User,
  MapPin,
  Truck,
  ArrowRight,
  TrendingUp,
  Eye,
  Heart,
} from 'lucide-react';
import { mockSales, Sale } from '@/lib/seller-mock-data';
import { mockSellerListings, SellerListing } from '@/lib/seller-mock-data';
import { cn } from '@/lib/utils';

// Helper functions outside component
const getStatusBadge = (status: string) => {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    pending_payment: { variant: 'destructive', label: 'Awaiting Payment' },
    pending_verification: { variant: 'outline', label: 'Pending Verification' },
    in_transit: { variant: 'default', label: 'In Transit' },
    completed: { variant: 'secondary', label: 'Completed' },
  };
  const config = variants[status] || { variant: 'outline' as const, label: status };
  return <Badge variant={config.variant} className="font-semibold text-xs">{config.label}</Badge>;
};

const getPaymentBadge = (status: string) => {
  if (status === 'completed') {
    return <Badge variant="secondary" className="font-semibold text-xs">Paid</Badge>;
  }
  return <Badge variant="destructive" className="font-semibold text-xs">Pending</Badge>;
};

const getTransportBadge = (status: string) => {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    quote_requested: { variant: 'destructive', label: 'Quote Requested' },
    scheduled: { variant: 'default', label: 'Scheduled' },
    complete: { variant: 'secondary', label: 'Complete' },
    not_requested: { variant: 'outline', label: 'Not Requested' },
  };
  const config = variants[status] || { variant: 'outline' as const, label: status };
  return <Badge variant={config.variant} className="font-semibold text-xs">{config.label}</Badge>;
};

const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

// Active Bid Card component
const ActiveBidCard = memo(({ listing }: { listing: SellerListing }) => (
  <Card className="border-2 border-border/50 bg-card hover:border-border/70 hover:shadow-warm">
    <CardContent className="pt-6 pb-6 px-4 md:px-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <Link
                href={`/listing/${listing.id}`}
                className="text-lg font-bold text-foreground hover:text-primary block mb-2"
              >
                {listing.title}
              </Link>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge variant="outline" className="font-semibold text-xs">
                  {listing.type === 'auction' ? 'Auction' : listing.type}
                </Badge>
                {listing.status === 'ending_soon' && (
                  <Badge variant="destructive" className="font-semibold text-xs">Ending Soon</Badge>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-extrabold text-foreground mb-1">
                ${listing.currentBid?.toLocaleString() || listing.startingBid?.toLocaleString() || '0'}
              </div>
              <div className="text-xs text-muted-foreground font-medium">
                {listing.startingBid && listing.currentBid && (
                  <>Starting: ${listing.startingBid.toLocaleString()}</>
                )}
                {listing.reservePrice && (
                  <div className="mt-1">Reserve: ${listing.reservePrice.toLocaleString()}</div>
                )}
              </div>
            </div>
          </div>

          {/* Auction Info */}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              <span className="font-medium">{listing.bids} bid{listing.bids !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Eye className="h-4 w-4" />
              <span>{listing.views} views</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Heart className="h-4 w-4" />
              <span>{listing.watchers} watching</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>{listing.location?.city || 'Unknown'}, {listing.location?.state || 'Unknown'}</span>
            </div>
          </div>

          {/* Countdown Timer */}
          {listing.endsAt && (
            <div className="pt-2 border-t border-border/50">
              <CountdownTimer endsAt={listing.endsAt} variant="compact" />
            </div>
          )}
        </div>

        <div className="flex md:flex-col gap-2 md:w-32 flex-shrink-0">
          <Link href={`/listing/${listing.id}`}>
            <Button variant="outline" className="w-full min-h-[36px] font-semibold text-xs gap-2">
              View Listing
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </div>
    </CardContent>
  </Card>
));
ActiveBidCard.displayName = 'ActiveBidCard';

// SaleCard component outside main component - memoized for performance
const SaleCard = memo(({ sale }: { sale: Sale }) => (
  <Card className="border-2 border-border/50 bg-card hover:border-border/70 hover:shadow-warm">
    <CardContent className="pt-6 pb-6 px-4 md:px-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <Link
                href={`/listing/${sale.listingId}`}
                className="text-lg font-bold text-foreground hover:text-primary block mb-1"
              >
                {sale.listingTitle}
              </Link>
              <div className="flex items-center gap-2 mb-2">
                {getStatusBadge(sale.status)}
                {getPaymentBadge(sale.paymentStatus)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-extrabold text-foreground mb-1">
                ${sale.price.toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground font-medium">
                {formatDate(sale.createdAt)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-4 w-4" />
              <span className="font-medium">{sale.buyer.name}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>{sale.buyer.location}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/50">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground font-medium">Transport:</span>
              {getTransportBadge(sale.transportStatus)}
            </div>
          </div>
        </div>

        <div className="flex md:flex-col gap-2 md:w-32 flex-shrink-0">
          <Link href={`/seller/logistics?listing=${sale.listingId}`}>
            <Button variant="outline" className="w-full min-h-[36px] font-semibold text-xs gap-2">
              Manage
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      </div>
    </CardContent>
  </Card>
));
SaleCard.displayName = 'SaleCard';

export default function SellerSalesPage() {
  // Get active auctions (listings with type 'auction' that are active or ending_soon)
  const activeBids = useMemo(() => 
    mockSellerListings.filter((listing) => 
      listing.type === 'auction' && 
      (listing.status === 'active' || listing.status === 'ending_soon') &&
      listing.bids > 0
    ),
    []
  );

  const pendingSales = useMemo(() => 
    mockSales.filter((sale) => sale.status === 'pending_verification' || sale.status === 'pending_payment'),
    []
  );

  const completedSales = useMemo(() => 
    mockSales.filter((sale) => sale.status === 'completed'),
    []
  );

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-2">
            Sales & Bids
          </h1>
          <p className="text-base md:text-lg text-muted-foreground">
            Track your sales pipeline and active auction bids
          </p>
        </div>

        <Tabs defaultValue="bids" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 h-auto bg-card border border-border/50 p-1">
            <TabsTrigger value="bids" className="min-h-[44px] font-semibold data-[state=active]:bg-background">
              <Gavel className="h-4 w-4 mr-2" />
              Active Bids ({activeBids.length})
            </TabsTrigger>
            <TabsTrigger value="pending" className="min-h-[44px] font-semibold data-[state=active]:bg-background">
              <Clock className="h-4 w-4 mr-2" />
              Pending Sales ({pendingSales.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="min-h-[44px] font-semibold data-[state=active]:bg-background">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Completed ({completedSales.length})
            </TabsTrigger>
          </TabsList>

          {/* Active Bids */}
          <TabsContent value="bids" className="space-y-4">
            {activeBids.length === 0 ? (
              <Card className="border-2 border-border/50 bg-card">
                <CardContent className="pt-12 pb-12 px-6 text-center">
                  <Gavel className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No active bids</h3>
                  <p className="text-sm text-muted-foreground">
                    Active auctions with bids will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              activeBids.map((listing) => (
                <ActiveBidCard key={listing.id} listing={listing} />
              ))
            )}
          </TabsContent>

          {/* Pending Sales */}
          <TabsContent value="pending" className="space-y-4">
            {pendingSales.length === 0 ? (
              <Card className="border-2 border-border/50 bg-card">
                <CardContent className="pt-12 pb-12 px-6 text-center">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No pending sales</h3>
                  <p className="text-sm text-muted-foreground">
                    Sales awaiting payment or verification will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              pendingSales.map((sale) => (
                <SaleCard key={sale.id} sale={sale} />
              ))
            )}
          </TabsContent>

          {/* Completed Sales */}
          <TabsContent value="completed" className="space-y-4">
            {completedSales.length === 0 ? (
              <Card className="border-2 border-border/50 bg-card">
                <CardContent className="pt-12 pb-12 px-6 text-center">
                  <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No completed sales</h3>
                  <p className="text-sm text-muted-foreground">
                    Completed sales will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              completedSales.map((sale) => (
                <SaleCard key={sale.id} sale={sale} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
