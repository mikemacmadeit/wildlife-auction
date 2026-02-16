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
import { StarRatingReviewCount } from '@/components/seller/StarRatingReviewCount';
import { useToast } from '@/hooks/use-toast';
import { getOrCreateThread } from '@/lib/firebase/messages';
import { formatUserFacingError } from '@/lib/format-user-facing-error';

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
  const [responseTimeHours, setResponseTimeHours] = useState<number | null>(null);

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
        if (!cancelled) setError(formatUserFacingError(e, 'Failed to load seller profile'));
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
        if (!cancelled) setListingsError(formatUserFacingError(e, 'Failed to load seller listings'));
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
        if (!cancelled) setReviewsError(formatUserFacingError(e, 'Failed to load reviews'));
      })
      .finally(() => {
        if (!cancelled) setReviewsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  // Response time (public, from message data)
  useEffect(() => {
    if (!sellerId) return;
    let cancelled = false;
    fetch(`/api/sellers/${encodeURIComponent(sellerId)}/response-time`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.ok && typeof data.medianHours === 'number' && data.medianHours >= 0) {
          setResponseTimeHours(data.medianHours);
        } else {
          setResponseTimeHours(null);
        }
      })
      .catch(() => {
        if (!cancelled) setResponseTimeHours(null);
      });
    return () => { cancelled = true; };
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
    <div className="min-h-screen bg-background pb-20 md:pb-6 overflow-x-hidden">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8 max-w-6xl space-y-4 sm:space-y-6 md:space-y-8">
        {/* Top bar: stack on mobile so buttons fit */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <Button variant="outline" size="sm" onClick={handleBack} className="w-fit shrink-0">
            <ArrowLeft className="h-4 w-4 mr-2 shrink-0" />
            Back
          </Button>
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Button asChild variant="outline" size="sm" className="font-semibold shrink-0">
              <Link href="/browse">Browse</Link>
            </Button>
            {!isSelf && sellerId ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="font-semibold shrink-0"
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
                        description: formatUserFacingError(e, 'Please try again.'),
                        variant: 'destructive',
                      });
                    } finally {
                      setCreatingMessage(false);
                    }
                  }}
                >
                  {creatingMessage ? <Loader2 className="h-4 w-4 mr-2 animate-spin shrink-0" /> : <MessageSquare className="h-4 w-4 mr-2 shrink-0" />}
                  Message
                </Button>
                <SaveSellerButton sellerId={sellerId} size="sm" />
              </>
            ) : null}
            <Button
              type="button"
              size="sm"
              className="font-semibold shrink-0"
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

          <CardContent className="relative p-4 sm:p-7 md:p-8">
            <div className="flex items-start gap-3 sm:gap-6 flex-col sm:flex-row min-w-0">
              {/* Avatar */}
              <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-shrink-0">
                <div className="relative h-14 w-14 sm:h-20 sm:w-20 rounded-xl sm:rounded-2xl border-2 border-border/60 bg-background/70 backdrop-blur overflow-hidden shadow-sm flex-shrink-0">
                  {profile.photoURL ? (
                    <Image src={profile.photoURL} alt={displayName} fill className="object-cover" sizes="96px" unoptimized />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-base sm:text-xl font-extrabold text-primary">
                      {initials}
                    </div>
                  )}
                </div>
                <div className="sm:hidden min-w-0 flex-1">
                  <div className="text-xl font-extrabold leading-tight break-words">{displayName}</div>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <SellerTierBadge tier={sellerTier} />
                    <Badge
                      variant={reputation.level === 'trusted' ? 'default' : 'secondary'}
                      className="font-semibold text-xs capitalize shrink-0"
                    >
                      {reputation.level.replaceAll('_', ' ')}
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <SellerTrustBadges badgeIds={publicTrust?.badgeIds} />
                    {!isSelf && sellerId ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          className="font-semibold shrink-0"
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
                                description: formatUserFacingError(e, 'Please try again.'),
                                variant: 'destructive',
                              });
                            } finally {
                              setCreatingMessage(false);
                            }
                          }}
                        >
                          {creatingMessage ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin shrink-0" />
                          ) : (
                            <MessageSquare className="h-4 w-4 mr-2 shrink-0" />
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
              <div className="flex-1 min-w-0 space-y-2 sm:space-y-3">
                <div className="hidden sm:block min-w-0">
                  <div className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight break-words">{displayName}</div>
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

                <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground min-w-0">
                  <StarRatingReviewCount
                    avgRating={reviewStats?.avgRating ?? 0}
                    reviewCount={reviewStats?.reviewCount ?? 0}
                    size="md"
                  />
                  {responseTimeHours !== null && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                      <span className="whitespace-nowrap">
                        Usually responds in {responseTimeHours < 1 ? '<1h' : responseTimeHours < 24 ? `${Math.round(responseTimeHours)}h` : `${Math.round(responseTimeHours / 24)}d`}
                      </span>
                    </div>
                  )}
                  {locationLabel && (
                    <div className="flex items-center gap-1.5 min-w-0 shrink-0">
                      <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                      <span className="font-semibold text-foreground/80 truncate">{locationLabel}</span>
                    </div>
                  )}
                  {joinedLabel && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Store className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                      <span className="whitespace-nowrap">Since <span className="font-semibold text-foreground/80">{joinedLabel}</span></span>
                    </div>
                  )}
                </div>

                <div className="flex items-start gap-2 text-xs sm:text-sm text-muted-foreground min-w-0">
                  <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5 text-primary mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground">Trust signals you can verify</div>
                    <div className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                      No fake reviews. Reputation from on-platform actions (transactions, delivery, verified status).
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats: compact on mobile */}
            <div className="mt-4 sm:mt-6 grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
              <div className="rounded-lg sm:rounded-xl border border-border/60 bg-background/60 backdrop-blur p-3 sm:p-4 min-w-0">
                <div className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1 truncate">
                  <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                  Active
                </div>
                <div className="text-xl sm:text-2xl font-extrabold mt-0.5 sm:mt-1">{activeListings.length}</div>
              </div>
              <div className="rounded-lg sm:rounded-xl border border-border/60 bg-background/60 backdrop-blur p-3 sm:p-4 min-w-0">
                <div className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1 truncate">
                  <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                  Sold
                </div>
                <div className="text-xl sm:text-2xl font-extrabold mt-0.5 sm:mt-1">{soldListings.length}</div>
              </div>
              <div className="rounded-lg sm:rounded-xl border border-border/60 bg-background/60 backdrop-blur p-3 sm:p-4 min-w-0">
                <div className="text-[10px] sm:text-xs text-muted-foreground truncate">Transactions</div>
                <div className="text-xl sm:text-2xl font-extrabold mt-0.5 sm:mt-1">{txCount}</div>
              </div>
              <div className="rounded-lg sm:rounded-xl border border-border/60 bg-background/60 backdrop-blur p-3 sm:p-4 min-w-0">
                <div className="text-[10px] sm:text-xs text-muted-foreground truncate">Delivery %</div>
                <div className="text-xl sm:text-2xl font-extrabold mt-0.5 sm:mt-1">{Math.round(reputation.deliverySuccessRate * 100)}%</div>
              </div>
            </div>

            {/* Badges */}
            <div className="mt-4 sm:mt-6 flex flex-wrap gap-2">
              {reputation.badges.map((b) => (
                <Badge key={b} variant="outline" className="font-semibold text-xs bg-background/50">
                  {b}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Listings */}
        <Card id="seller-listings" className="border-border/60 overflow-hidden">
          <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-4 sm:pt-6">
            <CardTitle className="text-lg sm:text-xl font-extrabold">Listings</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Inventory available and sold history.</CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-4 sm:pb-6">
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
              <Tabs defaultValue="active" className="w-full min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                  <TabsList className="w-full sm:w-auto grid grid-cols-2 h-10 p-1 min-w-0">
                    <TabsTrigger value="active" className="font-semibold text-xs sm:text-sm truncate px-2 sm:px-4">
                      Active ({activeListings.length})
                    </TabsTrigger>
                    <TabsTrigger value="sold" className="font-semibold text-xs sm:text-sm truncate px-2 sm:px-4">
                      Sold ({soldListings.length})
                    </TabsTrigger>
                  </TabsList>
                  <div className="text-[10px] sm:text-xs text-muted-foreground hidden sm:block">
                    Sold listings are read-only and shown as market history.
                  </div>
                </div>

                <TabsContent value="active" className="mt-3 sm:mt-4">
                  {activeListings.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 sm:p-8 text-center">
                      <div className="font-semibold text-sm sm:text-base">No active listings</div>
                      <div className="text-xs sm:text-sm text-muted-foreground mt-1">Check back soon.</div>
                    </div>
                  ) : (
                    <div className={cn('grid gap-3 sm:gap-6', 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3')}>
                      {activeListings.map((l) => (
                        <ListingCard key={l.id} listing={l} />
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="sold" className="mt-3 sm:mt-4">
                  {soldListings.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-6 sm:p-8 text-center">
                      <div className="font-semibold text-sm sm:text-base">No sold listings yet</div>
                      <div className="text-xs sm:text-sm text-muted-foreground mt-1">When items sell, they’ll appear here as market data.</div>
                    </div>
                  ) : (
                    <div className={cn('grid gap-3 sm:gap-6', 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3')}>
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
        <Card id="seller-reviews" className="border-border/60 overflow-hidden">
          <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6 pt-4 sm:pt-6">
            <CardTitle className="text-lg sm:text-xl font-extrabold">Buyer Reviews</CardTitle>
            <CardDescription className="text-xs sm:text-sm">Verified reviews from completed orders.</CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-4 sm:pb-6">
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
              <div className="space-y-3 sm:space-y-4">
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                  <div className="inline-flex items-center gap-1 text-sm sm:text-base font-extrabold">
                    <Star className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500 fill-amber-500 shrink-0" />
                    {reviewStats?.avgRating ? reviewStats.avgRating.toFixed(1) : '—'}
                  </div>
                  <div className="text-xs sm:text-sm text-muted-foreground">
                    {reviewStats?.reviewCount || 0} review{reviewStats?.reviewCount === 1 ? '' : 's'}
                  </div>
                </div>

                {reviews.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 sm:p-8 text-center">
                    <div className="font-semibold text-sm sm:text-base">No reviews yet</div>
                    <div className="text-xs sm:text-sm text-muted-foreground mt-1">Reviews appear after completed purchases.</div>
                  </div>
                ) : (
                  <div className="space-y-2 sm:space-y-3">
                    {reviews.map((r) => (
                      <div key={r.orderId} className="rounded-lg sm:rounded-xl border border-border/60 p-2.5 sm:p-3 min-w-0">
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

