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
import { mockSellerStats } from '@/lib/seller-mock-data';
import { useAuth } from '@/hooks/use-auth';
import { getUserProfile } from '@/lib/firebase/users';
import { getEffectiveSubscriptionTier, type SubscriptionTier } from '@/lib/pricing/subscriptions';
import { SellerTierBadge } from '@/components/seller/SellerTierBadge';

export default function SellerReputationPage() {
  const { user } = useAuth();
  const [tier, setTier] = useState<SubscriptionTier>('standard');

  useEffect(() => {
    let cancelled = false;
    if (!user?.uid) return;
    getUserProfile(user.uid)
      .then((p) => {
        if (cancelled) return;
        setTier(getEffectiveSubscriptionTier(p));
      })
      .catch(() => {
        if (!cancelled) setTier('standard');
      });
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const verificationSteps = [
    { id: 1, label: 'Identity Verification', completed: true },
    { id: 2, label: 'Business License', completed: true },
    { id: 3, label: 'Animal Registration', completed: true },
    { id: 4, label: 'Background Check', completed: false },
    { id: 5, label: 'References', completed: false },
  ];

  const completedSteps = verificationSteps.filter((s) => s.completed).length;
  const progress = (completedSteps / verificationSteps.length) * 100;

  const stats = [
    {
      label: 'Completion Rate',
      value: `${mockSellerStats.completionRate}%`,
      icon: CheckCircle2,
      color: 'text-primary',
      description: 'Sales completed successfully',
    },
    {
      label: 'Response Time',
      value: mockSellerStats.responseTime,
      icon: Clock,
      color: 'text-primary',
      description: 'Average response to messages',
    },
    {
      label: 'Verified Animals',
      value: mockSellerStats.verifiedAnimals.toString(),
      icon: Shield,
      color: 'text-primary',
      description: 'Animals with verification',
    },
    {
      label: 'Total Sales',
      value: '12',
      icon: TrendingUp,
      color: 'text-primary',
      description: 'Completed transactions',
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
              Complete verification steps to build buyer trust
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Verification Progress</span>
                <span className="text-sm font-extrabold text-primary">{completedSteps}/{verificationSteps.length}</span>
              </div>
              <div className="h-3 bg-background/50 rounded-full overflow-hidden border border-border/50">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Verification Steps */}
            <div className="space-y-3">
              {verificationSteps.map((step, index) => (
                <div
                  key={step.id}
                  className={cn(
                    'flex items-center gap-3 p-4 rounded-lg border-2',
                    step.completed
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border/50 bg-background/50'
                  )}
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                      step.completed
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'bg-background border-border/50 text-muted-foreground'
                    )}
                  >
                    {step.completed ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <span className="text-sm font-extrabold">{step.id}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={cn(
                      'font-semibold',
                      step.completed ? 'text-foreground' : 'text-muted-foreground'
                    )}>
                      {step.label}
                    </p>
                    {step.completed && (
                      <p className="text-xs text-muted-foreground mt-0.5">Verified</p>
                    )}
                  </div>
                  {!step.completed && (
                    <Button variant="outline" size="sm" className="min-h-[36px] font-semibold text-xs">
                      Complete
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card
                key={stat.label}
                className="border-2 border-border/50 bg-card hover:border-border/70 hover:shadow-warm"
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                  <div className="w-10 h-10 rounded-lg bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
                    <Icon className={cn('h-5 w-5', stat.color)} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl md:text-3xl font-extrabold text-foreground mb-1">
                    {stat.value}
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
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
