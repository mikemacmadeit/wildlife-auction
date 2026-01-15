'use client';

import { 
  Star, 
  CheckCircle2, 
  Clock, 
  TrendingUp, 
  Package, 
  Award,
  MapPin,
  Calendar,
  MessageSquare
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Listing } from '@/lib/types';
import { useEffect, useState } from 'react';
import { getSellerStats } from '@/lib/firebase/sellerStats';
import { getUserProfile } from '@/lib/firebase/users';
import { getEffectiveSubscriptionTier, type SubscriptionTier } from '@/lib/pricing/subscriptions';
import { SellerTierBadge } from '@/components/seller/SellerTierBadge';

interface EnhancedSellerProfileProps {
  listing: Listing;
  className?: string;
}

export function EnhancedSellerProfile({ 
  listing, 
  className 
}: EnhancedSellerProfileProps) {
  // Derive seller info from listing (using sellerSnapshot or legacy seller field)
  const sellerName = listing.sellerSnapshot?.displayName || listing.seller?.name || 'Unknown Seller';
  const sellerVerified = listing.sellerSnapshot?.verified || listing.seller?.verified || false;
  const sellerId = listing.sellerId;
  
  const [sellerStats, setSellerStats] = useState<{
    completedSalesCount: number;
    completionRate: number;
  }>({
    completedSalesCount: 0,
    completionRate: 0,
  });

  const [sellerTier, setSellerTier] = useState<SubscriptionTier>('standard');

  useEffect(() => {
    if (sellerId) {
      getSellerStats(sellerId).then((stats) => {
        setSellerStats({
          completedSalesCount: stats.completedSalesCount,
          completionRate: stats.completionRate,
        });
      }).catch((error) => {
        console.error('Error fetching seller stats:', error);
      });
    }
  }, [sellerId]);

  useEffect(() => {
    let cancelled = false;
    if (!sellerId) return;
    getUserProfile(sellerId)
      .then((profile) => {
        if (cancelled) return;
        setSellerTier(getEffectiveSubscriptionTier(profile));
      })
      .catch(() => {
        if (!cancelled) setSellerTier('standard');
      });
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  return (
    <Card className={cn(
      'shadow-warm',
      sellerTier === 'premier'
        ? 'border-2 border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 to-background'
        : sellerTier === 'priority'
        ? 'border-2 border-primary/25 bg-gradient-to-br from-primary/10 to-background'
        : 'border border-border/50 bg-card',
      className
    )}>
      <CardHeader className="pb-4 border-b border-border/50">
        {/* Seller Avatar & Name Row */}
        <div className="flex items-start gap-3">
          <div className={cn(
            'relative w-14 h-14 rounded-full flex-shrink-0',
            'bg-primary/10 border border-primary/30',
            'flex items-center justify-center'
          )}>
            <div className="text-xl font-bold text-primary">
              {sellerName.charAt(0).toUpperCase()}
            </div>
            {sellerVerified && (
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary border-2 border-background flex items-center justify-center shadow-sm">
                <CheckCircle2 className="h-3 w-3 text-primary-foreground fill-primary-foreground" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <h3 className="text-base font-bold text-foreground truncate">
                {sellerName}
              </h3>
              <SellerTierBadge tier={sellerTier} />
              {sellerVerified && (
                <Badge 
                  variant="default" 
                  className="bg-primary/15 text-primary border-primary/30 text-[10px] px-1.5 py-0.5 h-auto font-semibold flex items-center gap-1"
                >
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  Verified Seller
                </Badge>
              )}
            </div>
            
            {/* Rating & Response Time - Compact Row */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                <span className="text-sm font-bold text-foreground">5.0</span>
                <span className="text-[11px] text-muted-foreground">
                  ({sellerStats.completedSalesCount} completed {sellerStats.completedSalesCount === 1 ? 'sale' : 'sales'})
                </span>
              </div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span>{listing.location?.city || 'Unknown'}, {listing.location?.state || 'Unknown'}</span>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-5 space-y-4">
        {/* Message Button - Prominent but Compact */}
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 h-9 text-sm font-semibold border-primary/30 hover:border-primary/50 hover:bg-primary/5"
        >
          <MessageSquare className="h-4 w-4" />
          Message Seller
        </Button>

        {/* Key Metrics - Elegant Compact Grid */}
        {/* TODO: Fetch seller stats from Firestore users collection in Phase 2 */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="text-center p-2.5 rounded-lg bg-primary/10 border border-primary/30">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Star className="h-3.5 w-3.5 text-primary fill-primary" />
              <span className="text-base font-bold text-foreground">5.0</span>
            </div>
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Rating</div>
          </div>

          <div className="text-center p-2.5 rounded-lg bg-accent/10 border border-accent/30">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Package className="h-3.5 w-3.5 text-accent" />
              <span className="text-base font-bold text-foreground">0</span>
            </div>
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Listings</div>
          </div>

          <div className="text-center p-2.5 rounded-lg bg-secondary/10 border border-secondary/30">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-secondary" />
              <span className="text-base font-bold text-foreground">0</span>
            </div>
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Sales</div>
          </div>
        </div>
        
        {/* Member Since & Location - Compact Elegant Row */}
        <div className="space-y-1.5">
          {sellerStats.completedSalesCount > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-1.5 rounded-md bg-muted/30 border border-border/40">
              <TrendingUp className="h-3 w-3 text-primary flex-shrink-0" />
              <span className="leading-tight">
                <span className="font-semibold text-foreground">{sellerStats.completionRate}%</span> completion rate
              </span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-2 py-1.5 rounded-md bg-muted/30 border border-border/40">
            <MapPin className="h-3 w-3 text-primary flex-shrink-0" />
            <span className="leading-tight">
              Based in <span className="font-semibold text-foreground">{listing.location?.city || 'Unknown'}, {listing.location?.state || 'Unknown'}</span>
            </span>
          </div>
        </div>

        {/* Seller Credentials - Compact List */}
        <div className="pt-4 border-t border-border/50 space-y-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Award className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Credentials</span>
          </div>
          <div className="space-y-1.5">
            {sellerVerified && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0" />
                <span>Identity verified</span>
              </div>
            )}
            {sellerStats.completedSalesCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 text-accent flex-shrink-0" />
                <span>{sellerStats.completedSalesCount} verified {sellerStats.completedSalesCount === 1 ? 'transaction' : 'transactions'}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
