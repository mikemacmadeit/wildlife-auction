/**
 * Buyer-facing Seller Profile (Phase 2E)
 *
 * NOTE: This is intentionally derived-only (no fake reviews/ratings).
 * Firestore rules in this repo require authentication for reading `/users/{uid}`.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getUserProfile } from '@/lib/firebase/users';
import type { UserProfile } from '@/lib/types';
import { getSellerReputation } from '@/lib/users/getSellerReputation';
import { SellerTierBadge } from '@/components/seller/SellerTierBadge';
import { getEffectiveSubscriptionTier } from '@/lib/pricing/subscriptions';

export default function SellerProfilePage() {
  const params = useParams<{ sellerId: string }>();
  const sellerId = params?.sellerId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const reputation = useMemo(() => getSellerReputation({ profile }), [profile]);
  const sellerTier = profile ? getEffectiveSubscriptionTier(profile) : 'standard';
  const txCount = profile ? Math.max(Number(profile.verifiedTransactionsCount || 0), Number(profile.completedSalesCount || 0)) : 0;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
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
              <div className="font-semibold">Sign in required</div>
              <div className="text-sm text-muted-foreground mt-1">Sign in to view seller trust details.</div>
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
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-3xl space-y-6">
        <Button variant="outline" size="sm" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-2xl font-extrabold">
              {profile.displayName || profile.profile?.businessName || profile.profile?.fullName || 'Seller'}
            </CardTitle>
            <CardDescription>Trust signals derived from verified on-platform data (no reviews yet).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <SellerTierBadge tier={sellerTier} />
              <Badge variant={reputation.level === 'trusted' ? 'default' : 'secondary'} className="font-semibold text-xs capitalize">
                {reputation.level.replaceAll('_', ' ')}
              </Badge>
              {profile.seller?.verified && (
                <Badge variant="secondary" className="font-semibold text-xs">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Verified seller
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg border border-border/50 bg-muted/20">
                <div className="text-xs text-muted-foreground">Successful transactions</div>
                <div className="text-lg font-extrabold">{txCount}</div>
              </div>
              <div className="p-3 rounded-lg border border-border/50 bg-muted/20">
                <div className="text-xs text-muted-foreground">Delivery success rate</div>
                <div className="text-lg font-extrabold">{Math.round(reputation.deliverySuccessRate * 100)}%</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">Badges</div>
              <div className="flex flex-wrap gap-2">
                {reputation.badges.map((b) => (
                  <Badge key={b} variant="outline" className="font-semibold text-xs">
                    {b}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

