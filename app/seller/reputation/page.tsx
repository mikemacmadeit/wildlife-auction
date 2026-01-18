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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { getUserProfile } from '@/lib/firebase/users';
import { getEffectiveSubscriptionTier, type SubscriptionTier } from '@/lib/pricing/subscriptions';
import { SellerTierBadge } from '@/components/seller/SellerTierBadge';
import { getSellerReputation } from '@/lib/users/getSellerReputation';
import type { UserProfile } from '@/lib/types';

export default function SellerReputationPage() {
  const { user } = useAuth();
  const [tier, setTier] = useState<SubscriptionTier>('standard');
  const [profile, setProfile] = useState<UserProfile | null>(null);

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

  const reputation = getSellerReputation({ profile });
  const completedSales = Number(profile?.completedSalesCount || 0) || 0;
  const disputeCount = 0; // Not available in current data model; keep honest.

  const completionRate =
    typeof profile?.completionRate === 'number'
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
                <div className="mt-1 text-xs text-muted-foreground">Derived from account age + transaction history (when available).</div>
              </div>
              <div className="rounded-lg border-2 border-border/50 bg-background/40 p-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Completed sales</div>
                <div className="mt-1 text-xl font-extrabold">{completedSales.toLocaleString()}</div>
                <div className="mt-1 text-xs text-muted-foreground">On-platform transactions (if tracked).</div>
              </div>
              <div className="rounded-lg border-2 border-border/50 bg-background/40 p-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Disputes</div>
                <div className="mt-1 text-xl font-extrabold">{disputeCount.toLocaleString()}</div>
                <div className="mt-1 text-xs text-muted-foreground">Dispute data not available yet.</div>
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

        {/* Seller stats (real, when available) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          <Card className="border-2 border-border/50 bg-card hover:border-border/70 hover:shadow-warm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Completion rate</CardTitle>
              <div className="w-10 h-10 rounded-lg bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl md:text-3xl font-extrabold text-foreground mb-1">
                {completionRate !== null ? `${completionRate}%` : 'Not available yet'}
              </div>
              <p className="text-xs text-muted-foreground font-medium">Based on on-platform transactions (if tracked).</p>
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
              <p className="text-xs text-muted-foreground font-medium">Badges are derived from existing profile fields.</p>
            </CardContent>
          </Card>

          <Card className="border-2 border-border/50 bg-card hover:border-border/70 hover:shadow-warm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Transactions</CardTitle>
              <div className="w-10 h-10 rounded-lg bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl md:text-3xl font-extrabold text-foreground mb-1">
                {Math.max(Number(profile?.verifiedTransactionsCount || 0), Number(profile?.completedSalesCount || 0)).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground font-medium">Verified transactions count (if tracked).</p>
            </CardContent>
          </Card>
        </div>

        {/* Buyer Feedback (Placeholder) */}
        <Card className="border-2 border-border/50 bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-primary" />
              <CardTitle className="text-xl font-extrabold">Buyer Feedback</CardTitle>
            </div>
            <CardDescription>
              Reviews and ratings from buyers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="py-12 text-center">
              <Star className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold text-foreground mb-2">No feedback yet</h3>
              <p className="text-sm text-muted-foreground">
                Buyer feedback will appear here after completed sales
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
