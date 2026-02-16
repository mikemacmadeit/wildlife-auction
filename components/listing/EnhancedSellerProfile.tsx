'use client';

import { 
  CheckCircle2, 
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
import { getPublicSellerTrust, getUserProfile } from '@/lib/firebase/users';
import { getEffectiveSubscriptionTier, type SubscriptionTier } from '@/lib/pricing/subscriptions';
import { SellerTierBadge } from '@/components/seller/SellerTierBadge';
import { useAuth } from '@/hooks/use-auth';
import type { UserProfile } from '@/lib/types';
import { getSellerReputation } from '@/lib/users/getSellerReputation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { SaveSellerButton } from '@/components/seller/SaveSellerButton';
import { SellerTrustBadges } from '@/components/seller/SellerTrustBadges';
import { StarRatingReviewCount } from '@/components/seller/StarRatingReviewCount';
import type { PublicSellerTrust } from '@/lib/types';
import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface EnhancedSellerProfileProps {
  listing: Listing;
  className?: string;
}

export function EnhancedSellerProfile({ 
  listing, 
  className 
}: EnhancedSellerProfileProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const viewerId = user?.uid || null;
  // Derive seller info from listing (using sellerSnapshot or legacy seller field)
  const sellerName = listing.sellerSnapshot?.displayName || listing.seller?.name || 'Unknown Seller';
  const sellerVerified = listing.sellerSnapshot?.verified || listing.seller?.verified || false;
  const sellerId = listing.sellerId;
  const sellerProfileHref = sellerId
    ? `/sellers/${sellerId}?from=${encodeURIComponent(`/listing/${listing.id}`)}`
    : '/browse';
  
  const [sellerStats, setSellerStats] = useState<{
    completedSalesCount: number;
    completionRate: number;
    visible: boolean;
  }>({
    completedSalesCount: 0,
    completionRate: 0,
    visible: false,
  });

  const [sellerTier, setSellerTier] = useState<SubscriptionTier>('standard');
  const [sellerProfile, setSellerProfile] = useState<UserProfile | null>(null);
  const [publicTrust, setPublicTrust] = useState<PublicSellerTrust | null>(null);
  const [activeListingsCount, setActiveListingsCount] = useState<number | null>(null);
  const [reviewStats, setReviewStats] = useState<{ avgRating: number; reviewCount: number } | null>(null);

  const sellerPhotoUrl =
    sellerProfile?.photoURL ||
    listing.sellerSnapshot?.photoURL ||
    (listing as any)?.seller?.photoURL ||
    null;

  useEffect(() => {
    if (sellerId) {
      getSellerStats(sellerId, viewerId).then((stats) => {
        setSellerStats({
          completedSalesCount: stats.completedSalesCount,
          completionRate: stats.completionRate,
          visible: stats.visible,
        });
      }).catch(() => {
        // Treat as not available; don't spam console on public pages.
        setSellerStats({ completedSalesCount: 0, completionRate: 0, visible: false });
      });
    }
  }, [sellerId, viewerId]);

  // Public seller trust badges (Stripe Verified, TPWD permit, etc.). Safe to load even when logged out.
  useEffect(() => {
    let cancelled = false;
    if (!sellerId) {
      setPublicTrust(null);
      return;
    }
    getPublicSellerTrust(sellerId)
      .then((t) => {
        if (!cancelled) setPublicTrust(t);
      })
      .catch(() => {
        if (!cancelled) setPublicTrust(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  useEffect(() => {
    let cancelled = false;
    if (!sellerId) return;
    // Firestore rules allow reading `/users/{uid}` only when authenticated.
    // Avoid noisy permission errors on public pages.
    if (!viewerId) {
      setSellerProfile(null);
      setSellerTier('standard');
      return;
    }

    getUserProfile(sellerId)
      .then((profile) => {
        if (cancelled) return;
        setSellerProfile(profile);
        setSellerTier(getEffectiveSubscriptionTier(profile));
      })
      .catch(() => {
        if (!cancelled) {
          setSellerProfile(null);
          setSellerTier('standard');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sellerId, viewerId]);

  // Active listings count (public inventory signal). This must be correct even if user doc stats are stale.
  useEffect(() => {
    let cancelled = false;
    if (!sellerId) {
      setActiveListingsCount(null);
      return;
    }
    (async () => {
      try {
        const listingsRef = collection(db, 'listings');
        const q = query(listingsRef, where('sellerId', '==', sellerId), where('status', '==', 'active'));
        const snap = await getCountFromServer(q);
        const count = Number(snap.data().count || 0);
        if (!cancelled) setActiveListingsCount(Number.isFinite(count) ? count : 0);
      } catch {
        if (!cancelled) setActiveListingsCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  // Seller review stats (star rating + review count)
  useEffect(() => {
    let cancelled = false;
    if (!sellerId) {
      setReviewStats(null);
      return;
    }
    fetch(`/api/reviews/seller?sellerId=${encodeURIComponent(sellerId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.ok && data?.stats) {
          const s = data.stats;
          setReviewStats({
            avgRating: Number(s.avgRating ?? 0),
            reviewCount: Number(s.reviewCount ?? 0),
          });
        } else {
          setReviewStats(null);
        }
      })
      .catch(() => {
        if (!cancelled) setReviewStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  const reputation = getSellerReputation({ profile: sellerProfile });
  const publicTxCount = sellerProfile
    ? Math.max(Number(sellerProfile.verifiedTransactionsCount || 0), Number(sellerProfile.completedSalesCount || 0))
    : null;

  const sellerHomeLabel = (() => {
    const city = String((sellerProfile as any)?.profile?.location?.city || '').trim();
    const state = String((sellerProfile as any)?.profile?.location?.state || '').trim();
    if (city && state) return `${city}, ${state}`;
    return city || state || null;
  })();

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
            {sellerPhotoUrl ? (
              <Image
                src={sellerPhotoUrl}
                alt={`${sellerName} profile`}
                fill
                className="object-cover rounded-full"
                sizes="56px"
                unoptimized
              />
            ) : (
              <div className="text-xl font-bold text-primary">
                {sellerName.charAt(0).toUpperCase()}
              </div>
            )}
            {sellerVerified && (
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-primary border-2 border-background flex items-center justify-center shadow-sm">
                <CheckCircle2 className="h-3 w-3 text-primary-foreground fill-primary-foreground" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <h3 className="text-base font-bold text-foreground truncate">
                {sellerId ? (
                  <Link href={sellerProfileHref} className="hover:underline">
                    {sellerName}
                  </Link>
                ) : (
                  sellerName
                )}
              </h3>
              <SellerTierBadge tier={sellerTier} />
              <SellerTrustBadges badgeIds={publicTrust?.badgeIds} />
              {sellerProfile && reputation.level === 'trusted' && (
                <Badge
                  variant="default"
                  className="bg-primary/15 text-primary border-primary/30 text-[10px] px-1.5 py-0.5 h-auto font-semibold"
                >
                  Trusted Seller
                </Badge>
              )}
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
            
            {/* Star rating + review count, location + reputation */}
            <div className="flex items-center gap-3 flex-wrap">
              {reviewStats && (reviewStats.reviewCount ?? 0) > 0 ? (
                <Link
                  href={`${sellerProfileHref}#seller-reviews`}
                  className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-primary transition-colors"
                  aria-label="See seller reviews"
                >
                  <StarRatingReviewCount
                    avgRating={reviewStats.avgRating}
                    reviewCount={reviewStats.reviewCount}
                    size="sm"
                  />
                  <span className="text-xs font-medium underline underline-offset-2">See reviews</span>
                </Link>
              ) : (
                <StarRatingReviewCount
                  avgRating={reviewStats?.avgRating ?? 0}
                  reviewCount={reviewStats?.reviewCount ?? 0}
                  size="sm"
                />
              )}
              {publicTxCount !== null && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <TrendingUp className="h-3 w-3" />
                  <span>
                    <span className="font-semibold text-foreground">{publicTxCount}</span> successful transaction{publicTxCount === 1 ? '' : 's'}
                  </span>
                </div>
              )}
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
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 h-9 text-sm font-semibold border-primary/30 hover:border-primary/50 hover:bg-primary/5"
            onClick={() => {
              if (!viewerId) {
                toast({
                  title: 'Sign in required',
                  description: 'You must be signed in to message the seller.',
                  variant: 'destructive',
                });
                router.push(`/login?next=${encodeURIComponent(`/listing/${listing.id}`)}`);
                return;
              }
              if (!sellerId) return;
              if (viewerId === sellerId) {
                toast({
                  title: 'Cannot message yourself',
                  description: 'You cannot message yourself about your own listing.',
                  variant: 'destructive',
                });
                return;
              }
              router.push(`/dashboard/messages?listingId=${listing.id}&sellerId=${sellerId}`);
            }}
          >
            <MessageSquare className="h-4 w-4" />
            Message Seller
          </Button>
          <SaveSellerButton sellerId={sellerId} size="sm" className="w-full h-9 text-sm" />
        </div>

        <Button asChild variant="outline" size="sm" className="w-full h-9 text-sm font-semibold">
          <Link href={sellerProfileHref}>View profile</Link>
        </Button>

        {/* Key Metrics - Elegant Compact Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <div className="text-center p-2.5 rounded-lg bg-accent/10 border border-accent/30">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Package className="h-3.5 w-3.5 text-accent" />
              <span className="text-base font-bold text-foreground">
                {typeof activeListingsCount === 'number'
                  ? activeListingsCount
                  : typeof sellerProfile?.totalListingsCount === 'number'
                    ? sellerProfile.totalListingsCount
                    : '—'}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Listings</div>
          </div>

          <div className="text-center p-2.5 rounded-lg bg-secondary/10 border border-secondary/30">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp className="h-3.5 w-3.5 text-secondary" />
              <span className="text-base font-bold text-foreground">{publicTxCount !== null ? publicTxCount : '—'}</span>
            </div>
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Sales</div>
          </div>

          <div className="text-center p-2.5 rounded-lg bg-primary/10 border border-primary/30">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              <span className="text-base font-bold text-foreground">
                {sellerProfile?.createdAt ? new Date(sellerProfile.createdAt).getFullYear() : '—'}
              </span>
            </div>
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Member since</div>
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
              Based in{' '}
              <span className="font-semibold text-foreground">
                {sellerHomeLabel || `${listing.location?.city || 'Unknown'}, ${listing.location?.state || 'Unknown'}`}
              </span>
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
                <span>Verified seller</span>
              </div>
            )}
            {sellerProfile?.seller?.credentials?.identityVerified && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 text-primary flex-shrink-0" />
                <span>Identity verified</span>
              </div>
            )}
            {publicTxCount !== null && publicTxCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 text-accent flex-shrink-0" />
                <span>{publicTxCount} successful {publicTxCount === 1 ? 'transaction' : 'transactions'}</span>
              </div>
            )}
            {!viewerId && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MessageSquare className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <span>Sign in to see seller trust details</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
