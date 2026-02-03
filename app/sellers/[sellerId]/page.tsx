/**
 * Buyer-facing Seller Profile (Phase 2E)
 *
 * NOTE: This is intentionally derived-only (no fake reviews/ratings).
 * Firestore rules in this repo require authentication for reading `/users/{uid}`.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DashboardContentSkeleton } from '@/components/skeletons/DashboardContentSkeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ListingCard } from '@/components/listings/ListingCard';
import { cn } from '@/lib/utils';
import { Loader2, ArrowLeft, CheckCircle2, MapPin, Sparkles, ShieldCheck, Store, TrendingUp, MessageSquare, Star } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getPublicSellerTrust, getUserProfile } from '@/lib/firebase/users';
import type { PublicSellerTrust, UserProfile } from '@/lib/types';
import { getSellerReputation } from '@/lib/users/getSellerReputation';
import { SellerTierBadge } from '@/components/seller/SellerTierBadge';
import { getEffectiveSubscriptionTier } from '@/lib/pricing/subscriptions';
import type { Listing } from '@/lib/types';
import { listSellerListings } from '@/lib/firebase/listings';
import { SellerTrustBadges } from '@/components/seller/SellerTrustBadges';
import { SaveSellerButton } from '@/components/seller/SaveSellerButton';
import { useToast } from '@/hooks/use-toast';
import { getOrCreateThread } from '@/lib/firebase/messages';

export default function SellerProfilePage() {
  const params = useParams<{ sellerId: string }>();
  const sellerId = params?.sellerId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [publicTrust, setPublicTrust] = useState<PublicSellerTrust | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeListings, setActiveListings] = useState<Listing[]>([]);
  const [soldListings, setSoldListings] = useState<Listing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const [creatingMessage, setCreatingMessage] = useState(false);
  const [reviewStats, setReviewStats] = useState<any | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState<string | null>(null);

  const fromParam = useMemo(() => {
    const raw = searchParams?.get('from');
    if (!raw) return null;
    // Only allow relative app paths to avoid open redirects.
    if (!raw.startsWith('/')) return null;
    return raw;
  }, [searchParams]);

  const handleBack = useMemo(() => {
    return () => {
      try {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          router.back();
          return;
        }
      } catch {
        // ignore
      }
      router.push(fromParam || '/browse');
    };
  }, [fromParam, router]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!sellerId) return;
      setLoading(true);
      setError(null);
      try {
        const p = await getUserProfile(sellerId);
        if (!p) throw new Error('Seller not found');
        if (cancelled) return;
        setProfile(p);
        // Load public trust signals (badges). Public read, server-authored.
        const t = await getPublicSellerTrust(sellerId);
        if (!cancelled) setPublicTrust(t);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load seller profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (!authLoading) void load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, sellerId]);

  // Use publicTrust.completedSalesCount when profile lacks it (profile from publicProfiles omits these)
  const effectiveCompletedSales = useMemo(() => {
    const fromProfile = Math.max(Number(profile?.verifiedTransactionsCount || 0), Number(profile?.completedSalesCount || 0));
    const fromTrust = Number(publicTrust?.completedSalesCount ?? 0);
    const fromSold = soldListings.length;
    return Math.max(fromProfile, fromTrust, fromSold > 0 ? fromSold : 0);
  }, [profile, publicTrust, soldListings.length]);

  const effectiveProfile = useMemo(() => {
    if (!profile) return null;
    const merged = { ...profile } as any;
    const profileSales = Math.max(Number(merged.verifiedTransactionsCount || 0), Number(merged.completedSalesCount || 0));
    if (effectiveCompletedSales > profileSales) {
      merged.completedSalesCount = effectiveCompletedSales;
      merged.verifiedTransactionsCount = effectiveCompletedSales;
      merged.completionRate = 1;
    }
    return merged;
  }, [profile, effectiveCompletedSales]);

  const reputation = useMemo(() => getSellerReputation({ profile: effectiveProfile, totalTransactionsOverride: effectiveCompletedSales }), [effectiveProfile, effectiveCompletedSales]);
  const sellerTier = profile ? getEffectiveSubscriptionTier(profile) : 'standard';
  const txCount = effectiveCompletedSales;
  const isSelf = !!user?.uid && !!sellerId && user.uid === sellerId;

  const displayName = useMemo(() => {
    return (
      profile?.displayName ||
      profile?.profile?.businessName ||
      profile?.profile?.fullName ||
      'Seller'
    );
  }, [profile]);

  const locationLabel = useMemo(() => {
    const city = String(profile?.profile?.location?.city || '').trim();
    const state = String(profile?.profile?.location?.state || '').trim();
    if (!city && !state) return null;
    if (city && state) return `${city}, ${state}`;
    return city || state;
  }, [profile]);

  const initials = useMemo(() => {
    const n = String(displayName || 'S').trim();
    const parts = n.split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] || 'S';
    const b = parts[1]?.[0] || '';
    return (a + b).toUpperCase();
  }, [displayName]);

  const joinedLabel = useMemo(() => {
    const d = profile?.createdAt instanceof Date ? profile.createdAt : null;
    if (!d) return null;
    // Avoid showing nonsense for placeholder dates (publicProfiles fallback can be epoch).
    if (d.getFullYear() < 2018) return null;
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }, [profile]);

  // Public-facing seller listings (active + sold). No drafts, no PII.
  useEffect(() => {
    let cancelled = false;
    async function loadListings() {
      if (!sellerId) return;
      if (!user) return; // keep aligned with page gating
      setListingsLoading(true);
      setListingsError(null);
      try {
        const [active, sold] = await Promise.all([
          listSellerListings(sellerId, 'active'),
          listSellerListings(sellerId, 'sold'),
        ]);

        const soldSorted = [...sold].sort((a, b) => {
          const at = a.soldAt?.getTime?.() ? a.soldAt.getTime() : 0;
          const bt = b.soldAt?.getTime?.() ? b.soldAt.getTime() : 0;
          return bt - at;
        });

        if (cancelled) return;
        setActiveListings(active);
        setSoldListings(soldSorted);
      } catch (e: any) {
        if (!cancelled) setListingsError(e?.message || 'Failed to load seller listings');
      } finally {
        if (!cancelled) setListingsLoading(false);
      }
    }

    // Only load after auth has resolved to avoid flashing sign-in gating.
    if (!authLoading) void loadListings();

    return () => {
      cancelled = true;
    };
  }, [authLoading, sellerId, user]);

  // Reviews (public)
  useEffect(() => {
    if (!sellerId) return;
    let cancelled = false;
    setReviewsLoading(true);
    setReviewsError(null);
    fetch(`/api/reviews/seller?sellerId=${sellerId}`)
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
  }, [sellerId]);

  if (authLoading || loading) {
    return <DashboardContentSkeleton />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6">
        <div className="container mx-auto px-4 py-8 max-w-3xl space-y-4">
          <Button variant="outline" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Card>
            <CardContent className="pt-6">
              <div className="font-extrabold text-lg">Sign in to view seller profiles</div>
              <div className="text-sm text-muted-foreground mt-1">
                Seller trust details and inventory are available to signed-in users.
              </div>
              <div className="mt-4">
                <Button asChild className="font-semibold">
                  <Link href="/login">Sign in</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6">
        <div className="container mx-auto px-4 py-8 max-w-3xl space-y-4">
          <Button variant="outline" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Card>
            <CardContent className="pt-6">
              <div className="font-semibold text-destructive">Couldn’t load seller profile</div>
              <div className="text-sm text-muted-foreground mt-1">{error || 'Not found.'}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-6xl space-y-6 md:space-y-8">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm" className="font-semibold">
              <Link href="/browse">Browse listings</Link>
            </Button>
            {!isSelf && sellerId ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="font-semibold"
                  disabled={creatingMessage || listingsLoading || activeListings.length === 0}
                  onClick={async () => {
                    try {
                      if (!user?.uid) return;
                      if (!sellerId) return;
                      if (activeListings.length === 0) {
                        toast({
                          title: 'No listings to message about',
                          description: 'This seller has no active listings right now.',
                          variant: 'destructive',
                        });
                        return;
                      }
                      setCreatingMessage(true);
                      const listingId = activeListings[0].id;
                      const threadId = await getOrCreateThread(listingId, user.uid, sellerId);
                      router.push(`/dashboard/messages?listingId=${encodeURIComponent(listingId)}&sellerId=${encodeURIComponent(sellerId)}&threadId=${encodeURIComponent(threadId)}`);
                    } catch (e: any) {
                      toast({
                        title: 'Could not start message',
                        description: e?.message || 'Please try again.',
                        variant: 'destructive',
                      });
                    } finally {
                      setCreatingMessage(false);
                    }
                  }}
                >
                  {creatingMessage ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <MessageSquare className="h-4 w-4 mr-2" />}
                  Message
                </Button>
                <SaveSellerButton sellerId={sellerId} size="sm" />
              </>
            ) : null}
            <Button
              type="button"
              size="sm"
              className="font-semibold"
              onClick={() => {
                const el = document.getElementById('seller-listings');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              View inventory
            </Button>
          </div>
        </div>

        {/* Hero */}
        <Card className="relative overflow-hidden border-border/60">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-background to-amber-500/10" />
          <div className="absolute -top-24 -right-24 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />

          <CardContent className="relative p-5 sm:p-7 md:p-8">
            <div className="flex items-start gap-4 sm:gap-6 flex-col sm:flex-row">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="relative h-16 w-16 sm:h-20 sm:w-20 rounded-2xl border-2 border-border/60 bg-background/70 backdrop-blur overflow-hidden shadow-sm">
                  {profile.photoURL ? (
                    <Image src={profile.photoURL} alt={displayName} fill className="object-cover" sizes="96px" unoptimized />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-lg sm:text-xl font-extrabold text-primary">
                      {initials}
                    </div>
                  )}
                </div>
                <div className="sm:hidden">
                  <div className="text-2xl font-extrabold leading-tight">{displayName}</div>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <SellerTierBadge tier={sellerTier} />
                    <Badge
                      variant={reputation.level === 'trusted' ? 'default' : 'secondary'}
                      className="font-semibold text-xs capitalize"
                    >
                      {reputation.level.replaceAll('_', ' ')}
                    </Badge>
                  </div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <SellerTrustBadges badgeIds={publicTrust?.badgeIds} />
                      {!isSelf && sellerId ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            className="font-semibold"
                            disabled={creatingMessage || listingsLoading || activeListings.length === 0}
                            onClick={async () => {
                              try {
                                if (!user?.uid) return;
                                if (!sellerId) return;
                                if (activeListings.length === 0) {
                                  toast({
                                    title: 'No listings to message about',
                                    description: 'This seller has no active listings right now.',
                                    variant: 'destructive',
                                  });
                                  return;
                                }
                                setCreatingMessage(true);
                                const listingId = activeListings[0].id;
                                const threadId = await getOrCreateThread(listingId, user.uid, sellerId);
                                router.push(
                                  `/dashboard/messages?listingId=${encodeURIComponent(listingId)}&sellerId=${encodeURIComponent(
                                    sellerId
                                  )}&threadId=${encodeURIComponent(threadId)}`
                                );
                              } catch (e: any) {
                                toast({
                                  title: 'Could not start message',
                                  description: e?.message || 'Please try again.',
                                  variant: 'destructive',
                                });
                              } finally {
                                setCreatingMessage(false);
                              }
                            }}
                          >
                            {creatingMessage ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <MessageSquare className="h-4 w-4 mr-2" />
                            )}
                            Message
                          </Button>
                          <SaveSellerButton sellerId={sellerId} size="sm" />
                        </>
                      ) : null}
                    </div>
                </div>
              </div>

              {/* Title + meta */}
              <div className="flex-1 min-w-0 space-y-3">
                <div className="hidden sm:block">
                  <div className="text-3xl md:text-4xl font-extrabold tracking-tight truncate">{displayName}</div>
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    <SellerTierBadge tier={sellerTier} />
                    <Badge
                      variant={reputation.level === 'trusted' ? 'default' : 'secondary'}
                      className="font-semibold text-xs capitalize"
                    >
                      {reputation.level.replaceAll('_', ' ')}
                    </Badge>
                  </div>
                  <div className="mt-3">
                    <SellerTrustBadges badgeIds={publicTrust?.badgeIds} />
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
                  {locationLabel && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" />
                      <span className="font-semibold text-foreground/80">{locationLabel}</span>
                    </div>
                  )}
                  {joinedLabel && (
                    <div className="flex items-center gap-1.5">
                      <Store className="h-4 w-4" />
                      <span>Member since <span className="font-semibold text-foreground/80">{joinedLabel}</span></span>
                    </div>
                  )}
                </div>

                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <ShieldCheck className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <div className="font-semibold text-foreground">Trust signals you can verify</div>
                    <div className="text-sm text-muted-foreground">
                      No fake reviews. Reputation is derived from on-platform actions (transactions, delivery signals, and verified status).
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border/60 bg-background/60 backdrop-blur p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Active listings
                </div>
                <div className="text-2xl font-extrabold mt-1">{activeListings.length}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/60 backdrop-blur p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Sold listings
                </div>
                <div className="text-2xl font-extrabold mt-1">{soldListings.length}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/60 backdrop-blur p-4">
                <div className="text-xs text-muted-foreground">Successful transactions</div>
                <div className="text-2xl font-extrabold mt-1">{txCount}</div>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/60 backdrop-blur p-4">
                <div className="text-xs text-muted-foreground">Delivery success</div>
                <div className="text-2xl font-extrabold mt-1">{Math.round(reputation.deliverySuccessRate * 100)}%</div>
              </div>
            </div>

            {/* Badges */}
            <div className="mt-6 flex flex-wrap gap-2">
              {reputation.badges.map((b) => (
                <Badge key={b} variant="outline" className="font-semibold text-xs bg-background/50">
                  {b}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Listings */}
        <Card id="seller-listings" className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl font-extrabold">Listings</CardTitle>
            <CardDescription>Inventory currently available and historical sold results.</CardDescription>
          </CardHeader>
          <CardContent>
            {listingsLoading ? (
              <div className="py-10 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : listingsError ? (
              <div className="py-10 text-center">
                <div className="font-semibold text-destructive">Couldn’t load listings</div>
                <div className="text-sm text-muted-foreground mt-1">{listingsError}</div>
              </div>
            ) : (
              <Tabs defaultValue="active" className="w-full">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <TabsList>
                    <TabsTrigger value="active" className="font-semibold">
                      Active ({activeListings.length})
                    </TabsTrigger>
                    <TabsTrigger value="sold" className="font-semibold">
                      Sold ({soldListings.length})
                    </TabsTrigger>
                  </TabsList>
                  <div className="text-xs text-muted-foreground">
                    Sold listings are read-only and shown as market history.
                  </div>
                </div>

                <TabsContent value="active" className="mt-4">
                  {activeListings.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center">
                      <div className="font-semibold">No active listings</div>
                      <div className="text-sm text-muted-foreground mt-1">Check back soon.</div>
                    </div>
                  ) : (
                    <div className={cn('grid gap-6', 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3')}>
                      {activeListings.map((l) => (
                        <ListingCard key={l.id} listing={l} />
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="sold" className="mt-4">
                  {soldListings.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-8 text-center">
                      <div className="font-semibold">No sold listings yet</div>
                      <div className="text-sm text-muted-foreground mt-1">When items sell, they’ll appear here as market data.</div>
                    </div>
                  ) : (
                    <div className={cn('grid gap-6', 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3')}>
                      {soldListings.map((l) => (
                        <ListingCard key={l.id} listing={l} />
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        {/* Reviews */}
        <Card id="seller-reviews" className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl font-extrabold">Buyer Reviews</CardTitle>
            <CardDescription>Verified reviews from completed orders.</CardDescription>
          </CardHeader>
          <CardContent>
            {reviewsLoading ? (
              <div className="py-10 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : reviewsError ? (
              <div className="py-10 text-center">
                <div className="font-semibold text-destructive">Couldn’t load reviews</div>
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
                    {reviewStats?.reviewCount || 0} review{reviewStats?.reviewCount === 1 ? '' : 's'}
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

