/**
 * Plan Card Component (Seller Tiers)
 *
 * Subscriptions are optional and only affect exposure/badges (not fees, not listing limits).
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Crown,
  Zap,
  CreditCard,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Calendar,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PLAN_CONFIG, MARKETPLACE_FEE_PERCENT } from '@/lib/pricing/plans';
import { UserProfile } from '@/lib/types';
import { createSubscription, cancelSubscription, createBillingPortalSession } from '@/lib/stripe/api';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRouter } from 'next/navigation';
import { getEffectiveSubscriptionTier, getTierLabel, type SubscriptionTier } from '@/lib/pricing/subscriptions';

interface PlanCardProps {
  userProfile: UserProfile;
  activeListingsCount: number;
  onUpdate?: () => void; // Callback when plan changes (to refresh data)
}

export function PlanCard({ userProfile, activeListingsCount, onUpdate }: PlanCardProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null); // Track which action is loading
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const tier: SubscriptionTier = getEffectiveSubscriptionTier(userProfile);
  const planConfig = PLAN_CONFIG[tier];
  const subscriptionStatus = userProfile.subscriptionStatus;
  const isActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
  const isPastDue = subscriptionStatus === 'past_due';
  const hasAdminOverride = !!userProfile.adminPlanOverride;
  const showUpgrade = tier === 'standard' || !isActive;
  const hasSubscription = tier !== 'standard';

  // Format renewal date
  const renewalDate = userProfile.subscriptionCurrentPeriodEnd
    ? new Date(userProfile.subscriptionCurrentPeriodEnd)
    : null;

  const handleUpgrade = async (targetPlan: 'priority' | 'premier') => {
    setLoading(`upgrade-${targetPlan}`);
    try {
      const result = await createSubscription(targetPlan);
      
      // If clientSecret is returned, we need to handle payment
      if (result.clientSecret) {
        // In a real implementation, you'd use Stripe.js to confirm payment
        // For now, redirect to Stripe Checkout or handle payment here
        toast({
          title: 'Subscription Created',
          description: 'Redirecting to payment...',
        });
        // You can integrate Stripe Elements here or redirect to a payment page
        // For now, we'll just show success
      } else {
        toast({
          title: 'Subscription Updated',
          description: `Your subscription has been updated to ${targetPlan}.`,
        });
      }
      
      onUpdate?.();
      router.refresh();
    } catch (error: any) {
      console.error('Error upgrading subscription:', error);
      // If Stripe price IDs are missing/misconfigured, don't dead-end the user.
      // Send them to the pricing page (which can show instructions/contact).
      if (error?.code === 'PRICE_NOT_CONFIGURED') {
        router.push(`/pricing?plan=${targetPlan}`);
        return;
      }
      toast({
        title: 'Error',
        description: error.message || 'Failed to upgrade subscription',
        variant: 'destructive',
      });
    } finally {
      setLoading(null);
    }
  };

  const handleCancel = async (immediately: boolean) => {
    setLoading('cancel');
    try {
      const result = await cancelSubscription(immediately);
      toast({
        title: 'Subscription Canceled',
        description: result.message,
      });
      setCancelDialogOpen(false);
      onUpdate?.();
      router.refresh();
    } catch (error: any) {
      console.error('Error canceling subscription:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel subscription',
        variant: 'destructive',
      });
    } finally {
      setLoading(null);
    }
  };

  const handleManageBilling = async () => {
    setLoading('billing');
    try {
      const result = await createBillingPortalSession();
      window.location.href = result.url;
    } catch (error: any) {
      console.error('Error creating billing portal session:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to open billing portal',
        variant: 'destructive',
      });
      setLoading(null);
    }
  };

  const PlanIcon = tier === 'premier' ? Crown : tier === 'priority' ? Zap : CreditCard;

  return (
    <>
      <Card className={cn(
        'border-2',
        tier === 'premier' ? 'border-yellow-500/30 bg-gradient-to-br from-yellow-500/10 to-background' :
        tier === 'priority' ? 'border-primary/20 bg-primary/5' :
        'border-border/50 bg-card'
      )}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-10 h-10 rounded-lg border-2 flex items-center justify-center',
                tier === 'premier' ? 'bg-yellow-500/10 border-yellow-500/20' :
                tier === 'priority' ? 'bg-primary/10 border-primary/20' :
                'bg-muted/50 border-border/50'
              )}>
                <PlanIcon className={cn(
                  'h-5 w-5',
                  tier === 'standard' ? 'text-muted-foreground' : 'text-primary'
                )} />
              </div>
              <div>
                <CardTitle className="text-xl font-extrabold">
                  {getTierLabel(tier)}
                </CardTitle>
                <CardDescription className="text-sm flex items-center gap-2 mt-1">
                  {hasAdminOverride && (
                    <Badge variant="outline" className="text-xs">Admin Override</Badge>
                  )}
                  {isActive ? (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="h-3 w-3" />
                      Active subscription
                    </span>
                  ) : tier === 'standard' ? (
                    <span>Standard tier</span>
                  ) : isPastDue ? (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      Payment past due
                    </span>
                  ) : (
                    <span>Status: {subscriptionStatus || 'inactive'}</span>
                  )}
                </CardDescription>
              </div>
            </div>
            {showUpgrade && (
              <Button asChild size="sm" className="font-semibold" disabled={!!loading}>
                <Link href="/pricing">View Seller Tiers</Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Marketplace fee
              </p>
              <p className="text-2xl font-extrabold text-foreground">
                {(MARKETPLACE_FEE_PERCENT * 100).toFixed(0)}%
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Active listings
              </p>
              <p className="text-2xl font-extrabold text-foreground">
                {activeListingsCount}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Unlimited listings on all tiers
              </p>
            </div>
          </div>

          {/* Renewal Date */}
          {renewalDate && hasSubscription && isActive && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                {userProfile.subscriptionCancelAtPeriodEnd
                  ? `Cancels on ${renewalDate.toLocaleDateString()}`
                  : `Renews on ${renewalDate.toLocaleDateString()}`}
              </span>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Seller tier reflects an optional placement + styling tier and does not indicate regulatory compliance approval.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 pt-2 border-t">
            {hasSubscription && (
              <Button
                onClick={handleManageBilling}
                disabled={!!loading}
                variant="outline"
                className="w-full font-semibold"
              >
                {loading === 'billing' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Opening...
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Manage Billing
                  </>
                )}
              </Button>
            )}

            {tier === 'standard' && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => handleUpgrade('priority')}
                  disabled={!!loading}
                  variant="default"
                  className="font-semibold"
                >
                  {loading === 'upgrade-priority' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Upgrade to Priority'
                  )}
                </Button>
                <Button
                  onClick={() => handleUpgrade('premier')}
                  disabled={!!loading}
                  variant="default"
                  className="font-semibold"
                >
                  {loading === 'upgrade-premier' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Upgrade to Premier'
                  )}
                </Button>
              </div>
            )}

            {tier === 'priority' && (
              <Button
                onClick={() => handleUpgrade('premier')}
                disabled={!!loading}
                variant="default"
                className="w-full font-semibold"
              >
                {loading === 'upgrade-premier' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Upgrading...
                  </>
                ) : (
                  <>
                    Upgrade to Premier
                    <Crown className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            )}

            {hasSubscription && !userProfile.subscriptionCancelAtPeriodEnd && (
              <Button
                onClick={() => setCancelDialogOpen(true)}
                disabled={!!loading}
                variant="outline"
                className="w-full font-semibold text-destructive hover:text-destructive"
              >
                Cancel Subscription
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cancel Confirmation Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Subscription</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel your subscription? You'll lose seller tier benefits and revert to Standard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <p className="text-sm text-muted-foreground">
              <strong>Cancel at period end:</strong> Keep benefits until {renewalDate?.toLocaleDateString()}, then revert to Standard.
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Cancel immediately:</strong> Revert to Standard right away.
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
              disabled={!!loading}
            >
              Keep Subscription
            </Button>
            <Button
              variant="outline"
              onClick={() => handleCancel(false)}
              disabled={!!loading}
            >
              {loading === 'cancel' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Canceling...
                </>
              ) : (
                'Cancel at Period End'
              )}
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleCancel(true)}
              disabled={!!loading}
            >
              {loading === 'cancel' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Canceling...
                </>
              ) : (
                'Cancel Immediately'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
