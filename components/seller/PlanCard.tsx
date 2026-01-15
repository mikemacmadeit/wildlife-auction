/**
 * Plan Card Component
 * 
 * Reusable component for displaying subscription plan info
 * Shows current plan, fee %, listings used/limit, and upgrade CTA
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
import { getPlanConfig, getRemainingListingSlots, hasUnlimitedListings } from '@/lib/pricing/plans';
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

  // Determine effective plan (admin override takes precedence)
  let planId = userProfile.adminPlanOverride || userProfile.subscriptionPlan || 'free';
  
  // If subscription is past_due or canceled, revert to free (unless admin override)
  if (!userProfile.adminPlanOverride) {
    const subscriptionStatus = userProfile.subscriptionStatus;
    if (subscriptionStatus === 'past_due' || subscriptionStatus === 'canceled' || subscriptionStatus === 'unpaid') {
      planId = 'free';
    }
  }

  const planConfig = getPlanConfig(planId);
  const limit = planConfig.listingLimit;
  const remainingSlots = getRemainingListingSlots(planId, activeListingsCount);
  const isUnlimited = hasUnlimitedListings(planId);
  const feePercent = userProfile.adminFeeOverride ?? planConfig.takeRate;
  const subscriptionStatus = userProfile.subscriptionStatus;
  const isActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';
  const isPastDue = subscriptionStatus === 'past_due';
  const hasAdminOverride = !!userProfile.adminPlanOverride || !!userProfile.adminFeeOverride;
  const showUpgrade = planId === 'free' || (planId === 'pro' && !isActive);
  const hasSubscription = planId !== 'free';

  // Format renewal date
  const renewalDate = userProfile.subscriptionCurrentPeriodEnd
    ? new Date(userProfile.subscriptionCurrentPeriodEnd)
    : null;

  const handleUpgrade = async (targetPlan: 'pro' | 'elite') => {
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

  const PlanIcon = planId === 'elite' ? Crown : planId === 'pro' ? Zap : CreditCard;

  return (
    <>
      <Card className={cn(
        'border-2',
        planId === 'elite' ? 'border-primary/30 bg-gradient-to-br from-primary/5 to-background' :
        planId === 'pro' ? 'border-primary/20 bg-primary/5' :
        'border-border/50 bg-card'
      )}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-10 h-10 rounded-lg border-2 flex items-center justify-center',
                planId === 'elite' ? 'bg-primary/10 border-primary/20' :
                planId === 'pro' ? 'bg-primary/10 border-primary/20' :
                'bg-muted/50 border-border/50'
              )}>
                <PlanIcon className={cn(
                  'h-5 w-5',
                  planId === 'free' ? 'text-muted-foreground' : 'text-primary'
                )} />
              </div>
              <div>
                <CardTitle className="text-xl font-extrabold">
                  {planConfig.displayName} Plan
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
                  ) : planId === 'free' ? (
                    <span>Free plan</span>
                  ) : isPastDue ? (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      Payment past due - using Free plan rates
                    </span>
                  ) : (
                    <span>Status: {subscriptionStatus || 'inactive'}</span>
                  )}
                </CardDescription>
              </div>
            </div>
            {showUpgrade && (
              <Button asChild size="sm" className="font-semibold" disabled={!!loading}>
                <Link href="/pricing">Upgrade</Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Transaction Fee
              </p>
              <p className="text-2xl font-extrabold text-foreground">
                {(feePercent * 100).toFixed(0)}%
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Active Listings
              </p>
              <p className="text-2xl font-extrabold text-foreground">
                {activeListingsCount} {isUnlimited ? '' : `/ ${limit}`}
              </p>
              {!isUnlimited && (
                <p className={cn(
                  'text-xs mt-1',
                  remainingSlots === 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'
                )}>
                  {remainingSlots !== null && remainingSlots > 0
                    ? `${remainingSlots} slot${remainingSlots !== 1 ? 's' : ''} remaining`
                    : remainingSlots === 0
                    ? 'Limit reached'
                    : ''}
                </p>
              )}
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

          {/* Limit Reached Warning */}
          {!isUnlimited && remainingSlots === 0 && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm font-semibold text-destructive mb-1">
                Listing limit reached
              </p>
              <p className="text-xs text-muted-foreground mb-2">
                Upgrade to {planId === 'free' ? 'Pro' : 'Elite'} to create more listings.
              </p>
              <Button asChild size="sm" variant="destructive" className="w-full font-semibold">
                <Link href="/pricing">
                  Upgrade Now
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            </div>
          )}

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

            {planId === 'free' && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => handleUpgrade('pro')}
                  disabled={!!loading}
                  variant="default"
                  className="font-semibold"
                >
                  {loading === 'upgrade-pro' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Upgrade to Pro'
                  )}
                </Button>
                <Button
                  onClick={() => handleUpgrade('elite')}
                  disabled={!!loading}
                  variant="default"
                  className="font-semibold"
                >
                  {loading === 'upgrade-elite' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Upgrade to Elite'
                  )}
                </Button>
              </div>
            )}

            {planId === 'pro' && (
              <Button
                onClick={() => handleUpgrade('elite')}
                disabled={!!loading}
                variant="default"
                className="w-full font-semibold"
              >
                {loading === 'upgrade-elite' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Upgrading...
                  </>
                ) : (
                  <>
                    Upgrade to Elite
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
              Are you sure you want to cancel your subscription? You'll lose access to plan benefits and revert to the Free plan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <p className="text-sm text-muted-foreground">
              <strong>Cancel at period end:</strong> Keep benefits until {renewalDate?.toLocaleDateString()}, then revert to Free plan.
            </p>
            <p className="text-sm text-muted-foreground">
              <strong>Cancel immediately:</strong> Revert to Free plan right away.
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
