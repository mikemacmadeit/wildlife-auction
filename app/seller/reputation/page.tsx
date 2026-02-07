'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Award,
  Shield,
  CheckCircle2,
  Clock,
  TrendingUp,
  Star,
  Users,
  Package,
  MessageSquare,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { getUserProfile } from '@/lib/firebase/users';
import { getEffectiveSubscriptionTier, type SubscriptionTier } from '@/lib/pricing/subscriptions';
import { SellerTierBadge } from '@/components/seller/SellerTierBadge';
import { getSellerReputation } from '@/lib/users/getSellerReputation';
import type { UserProfile } from '@/lib/types';
import { BreederPermitCard } from '@/components/seller/BreederPermitCard';
import { getSellerStats } from '@/lib/firebase/sellerStats';

export default function SellerReputationPage() {
  const { user } = useAuth();
  const [tier, setTier] = useState<SubscriptionTier>('standard');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sellerStats, setSellerStats] = useState<{
    completedSalesCount: number;
    completionRate: number;
    totalOrders: number;
    visible: boolean;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [reviewStats, setReviewStats] = useState<{ reviewCount: number; avgRating: number } | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user?.uid) return;
    getUserProfile(user.uid)
      .then((p) => {
        if (cancelled) return;
        setTier(getEffectiveSubscriptionTier(p));
        setProfile(p);
      })
      .catch(() => {
        if (!cancelled) {
          setTier('standard');
          setProfile(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    setStatsLoading(true);
    getSellerStats(user.uid, user.uid)
      .then((stats) => {
        if (cancelled) return;
        setSellerStats(stats);
      })
      .catch(() => {
        if (!cancelled) setSellerStats(null);
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    setReviewsLoading(true);
    setReviewsError(null);
    fetch(`/api/reviews/seller?sellerId=${user.uid}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (!data?.ok) throw new Error(data?.error || 'Failed to load reviews');
        setReviewStats(data.stats || null);
        setReviews(Array.isArray(data.reviews) ? data.reviews : []);
      })
      .catch((e: any) => {
        if (!cancelled) setReviewsError(e?.message || 'Failed to load reviews');
      })
      .finally(() => {
        if (!cancelled) setReviewsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const profileWithStats =
    profile && sellerStats?.visible
      ? {
          ...profile,
          completedSalesCount: sellerStats.completedSalesCount,
          completionRate: sellerStats.completionRate,
        }
      : profile;
  const reputation = getSellerReputation({
    profile: profileWithStats,
    totalTransactionsOverride: sellerStats?.visible ? sellerStats.totalOrders : undefined,
  });
  const completedSales =
    sellerStats?.visible ? sellerStats.completedSalesCount : Number(profile?.completedSalesCount || 0) || 0;
  const totalOrders = sellerStats?.visible ? sellerStats.totalOrders : 0;
  const disputeCount = 0;

  const completionRate =
    sellerStats?.visible && typeof sellerStats.completionRate === 'number'
      ? sellerStats.completionRate
      : typeof profile?.completionRate === 'number'
        ? Math.round(profile.completionRate > 1 ? profile.completionRate : profile.completionRate * 100)
        : null;

  const flags = [
    {
      label: 'Email verified',
      status: typeof profile?.emailVerified === 'boolean' ? (profile.emailVerified ? 'Verified' : 'Not verified yet') : 'Verification data not available yet',
    },
    {
      label: 'Identity verification',
      status:
        typeof (profile as any)?.seller?.credentials?.identityVerified === 'boolean'
          ? ((profile as any).seller.credentials.identityVerified ? 'Verified' : 'Not verified yet')
          : 'Verification data not available yet',
    },
    {
      label: 'Seller verification',
      status:
        typeof (profile as any)?.seller?.verified === 'boolean'
          ? ((profile as any).seller.verified ? 'Verified' : 'Not verified yet')
          : 'Verification data not available yet',
    },
    {
      label: 'Payouts enabled',
      status:
        typeof (profile as any)?.payoutsEnabled === 'boolean'
          ? ((profile as any).payoutsEnabled ? 'Verified' : 'Not verified yet')
          : 'Verification data not available yet',
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-2">
            Reputation & Verification
          </h1>
          <p className="text-base md:text-lg text-muted-foreground">
            Your seller profile and verification status
          </p>
        </div>

        {/* Seller Tier */}
        <Card className="border-2 border-border/50 bg-card">
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-xl font-extrabold">Seller Tier</CardTitle>
                <CardDescription>
                  Optional placement + badge tier (does not indicate compliance approval)
                </CardDescription>
              </div>
              <Button asChild variant="outline" className="font-semibold">
                <Link href="/pricing">View Seller Tiers</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Badge variant="secondary">
              {tier === 'premier' ? 'Premier' : tier === 'priority' ? 'Priority' : 'Standard'}
            </Badge>
            <SellerTierBadge tier={tier} />
            <span className="text-xs text-muted-foreground">
              Seller tier reflects optional placement + styling benefits only.
            </span>
          </CardContent>
        </Card>

        {/* TPWD breeder permit (seller-level compliance) */}
        <BreederPermitCard />

        {/* Verification Status */}
        <Card className="border-2 border-border/50 bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle className="text-xl font-extrabold">Seller Verification</CardTitle>
            </div>
            <CardDescription>
              Your current trust signals (no mock data)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg border-2 border-border/50 bg-background/40 p-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Reputation level</div>
                <div className="mt-1 text-xl font-extrabold capitalize">{reputation.level}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  From account age and order history (completed orders, completion rate).
                </div>
              </div>
              <div className="rounded-lg border-2 border-border/50 bg-background/40 p-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Completed orders</div>
                <div className="mt-1 text-xl font-extrabold">{completedSales.toLocaleString()}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {sellerStats?.visible ? `Of ${totalOrders} total orders` : 'From your order history.'}
                </div>
              </div>
              <div className="rounded-lg border-2 border-border/50 bg-background/40 p-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Delivery success</div>
                <div className="mt-1 text-xl font-extrabold">{Math.round(reputation.deliverySuccessRate * 100)}%</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Same as completion rate: orders finished (delivery checklist done).
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              {flags.map((f) => (
                <div key={f.label} className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 p-3">
                  <div className="text-sm font-semibold">{f.label}</div>
                  <Badge variant={f.status === 'Verified' ? 'secondary' : f.status === 'Not verified yet' ? 'destructive' : 'outline'} className="font-semibold">
                    {f.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Seller stats from orders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          <Card className="border-2 border-border/50 bg-card hover:border-border/70 hover:shadow-warm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Completion rate</CardTitle>
              <div className="w-10 h-10 rounded-lg bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading…</span>
                </div>
              ) : (
                <>
                  <div className="text-2xl md:text-3xl font-extrabold text-foreground mb-1">
                    {completionRate !== null ? `${completionRate}%` : '—'}
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">
                    Completed orders ÷ total orders. Completed = delivery checklist done (PIN, signature, photo).
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-2 border-border/50 bg-card hover:border-border/70 hover:shadow-warm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Badges</CardTitle>
              <div className="w-10 h-10 rounded-lg bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                <Award className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {reputation.badges.length ? (
                  reputation.badges.slice(0, 6).map((b) => (
                    <Badge key={b} variant="outline" className="font-semibold">
                      {b}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="outline" className="font-semibold">No badges yet</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-medium">From verification and order history.</p>
            </CardContent>
          </Card>

          <Card className="border-2 border-border/50 bg-card hover:border-border/70 hover:shadow-warm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Total orders</CardTitle>
              <div className="w-10 h-10 rounded-lg bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading…</span>
                </div>
              ) : (
                <>
                  <div className="text-2xl md:text-3xl font-extrabold text-foreground mb-1">
                    {(sellerStats?.visible ? sellerStats.totalOrders : Math.max(Number(profile?.verifiedTransactionsCount || 0), Number(profile?.completedSalesCount || 0))).toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">Orders where you are the seller (all statuses).</p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Buyer Feedback / Reviews */}
        <Card id="seller-reviews" className="border-2 border-border/50 bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-primary" />
              <CardTitle className="text-xl font-extrabold">Buyer Reviews</CardTitle>
            </div>
            <CardDescription>
              Verified reviews from completed orders.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reviewsLoading ? (
              <div className="py-10 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : reviewsError ? (
              <div className="py-10 text-center">
                <div className="font-semibold text-destructive">Couldn&apos;t load reviews</div>
                <div className="text-sm text-muted-foreground mt-1">{reviewsError}</div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="inline-flex items-center gap-1 text-base font-extrabold">
                    <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                    {reviewStats?.avgRating ? reviewStats.avgRating.toFixed(1) : '—'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {reviewStats?.reviewCount || 0} review{(reviewStats?.reviewCount ?? 0) === 1 ? '' : 's'}
                  </div>
                </div>

                {reviews.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-8 text-center">
                    <div className="font-semibold">No reviews yet</div>
                    <div className="text-sm text-muted-foreground mt-1">Reviews appear after completed purchases.</div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reviews.map((r) => (
                      <div key={r.orderId} className="rounded-xl border border-border/60 p-3">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-0.5">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <Star key={n} className={n <= (r.rating || 0) ? 'h-4 w-4 text-amber-500 fill-amber-500' : 'h-4 w-4 text-muted-foreground/40'} />
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground">Verified purchase</span>
                        </div>
                        {r.text ? <div className="mt-2 text-sm">{r.text}</div> : null}
                        <div className="mt-2 text-xs text-muted-foreground">
                          {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
