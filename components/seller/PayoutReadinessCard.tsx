'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, XCircle, Loader2, CreditCard, ArrowRight } from 'lucide-react';
import { UserProfile } from '@/lib/types';
import { createStripeAccount, createAccountLink, checkStripeAccountStatus } from '@/lib/stripe/api';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { ToastAction } from '@/components/ui/toast';

interface PayoutReadinessCardProps {
  userProfile: UserProfile | null;
  onRefresh?: () => void;
}

export function PayoutReadinessCard({ userProfile, onRefresh }: PayoutReadinessCardProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const hasConnectedAccount = !!userProfile?.stripeAccountId;
  const chargesEnabled = userProfile?.chargesEnabled ?? false;
  const payoutsEnabled = userProfile?.payoutsEnabled ?? false;
  const detailsSubmitted = userProfile?.stripeDetailsSubmitted ?? false;
  const onboardingStatus = userProfile?.stripeOnboardingStatus || 'not_started';

  // Determine overall status
  const isReady = hasConnectedAccount && chargesEnabled && payoutsEnabled && detailsSubmitted && onboardingStatus === 'complete';
  const needsAction = hasConnectedAccount && (onboardingStatus === 'pending' || !chargesEnabled || !payoutsEnabled || !detailsSubmitted);
  const notConnected = !hasConnectedAccount;

  const handleFixPayoutSetup = async () => {
    try {
      if (!hasConnectedAccount) {
        // Create account first
        setIsCreatingAccount(true);
        const accountResult = await createStripeAccount();
        
        if (accountResult.stripeAccountId) {
          toast({
            title: 'Account created',
            description: 'Redirecting to complete setup...',
          });
          
          // Create account link and redirect
          setIsCreatingLink(true);
          const linkResult = await createAccountLink();
          
          if (linkResult.url) {
            window.location.href = linkResult.url;
          }
        }
      } else {
        // Account exists, create link to complete onboarding
        setIsCreatingLink(true);
        const linkResult = await createAccountLink();
        
        if (linkResult.url) {
          window.location.href = linkResult.url;
        } else {
          throw new Error('Failed to create onboarding link');
        }
      }
    } catch (error: any) {
      console.error('Error setting up payout:', error);

      const msg = String(error?.message || 'Failed to set up payout. Please try again.');
      const actionUrl = (error as any)?.actionUrl as string | undefined;
      const isPlatformNotActivated = (error as any)?.code === 'STRIPE_PLATFORM_NOT_ACTIVATED' || msg.toLowerCase().includes('account must be activated');

      toast({
        title: isPlatformNotActivated ? 'Stripe activation required' : 'Error',
        description: isPlatformNotActivated
          ? 'Wildlife.Exchange must activate its Stripe account before we can create seller payout accounts. Open Stripe onboarding, complete activation, then retry.'
          : msg,
        variant: 'destructive',
        ...(actionUrl
          ? {
              action: (
                <ToastAction altText="Open Stripe onboarding" onClick={() => window.open(actionUrl, '_blank', 'noopener,noreferrer')}>
                  Open Stripe
                </ToastAction>
              ),
            }
          : {}),
      });
    } finally {
      setIsCreatingAccount(false);
      setIsCreatingLink(false);
    }
  };

  const handleRefreshStatus = async () => {
    try {
      setIsCheckingStatus(true);
      await checkStripeAccountStatus();
      toast({
        title: 'Status updated',
        description: 'Payout status has been refreshed.',
      });
      if (onRefresh) {
        onRefresh();
      }
    } catch (error: any) {
      console.error('Error checking status:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to check status. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payout Readiness
            </CardTitle>
            <CardDescription>
              Your Stripe Connect account status for receiving payouts
            </CardDescription>
          </div>
          {hasConnectedAccount && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefreshStatus}
              disabled={isCheckingStatus}
            >
              {isCheckingStatus ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Refresh'
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Badge */}
        <div className="flex items-center gap-2">
          {isReady ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              <Badge variant="outline" className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300">
                ✅ Ready to receive payouts
              </Badge>
            </>
          ) : needsAction ? (
            <>
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              <Badge variant="outline" className="bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300">
                ⚠️ Action required
              </Badge>
            </>
          ) : (
            <>
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              <Badge variant="outline" className="bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
                ⛔ Not connected
              </Badge>
            </>
          )}
        </div>

        {/* Status Details */}
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Connected Account:</span>
            <span className={hasConnectedAccount ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}>
              {hasConnectedAccount ? 'Yes' : 'No'}
            </span>
          </div>
          {hasConnectedAccount && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Charges Enabled:</span>
                <span className={chargesEnabled ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}>
                  {chargesEnabled ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Payouts Enabled:</span>
                <span className={payoutsEnabled ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}>
                  {payoutsEnabled ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Details Submitted:</span>
                <span className={detailsSubmitted ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}>
                  {detailsSubmitted ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Onboarding Status:</span>
                <Badge variant="outline" className="capitalize">
                  {onboardingStatus === 'complete' ? 'Complete' : 
                   onboardingStatus === 'pending' ? 'Pending' : 'Not Started'}
                </Badge>
              </div>
            </>
          )}
        </div>

        {/* Action Button */}
        {!isReady && (
          <Button
            onClick={handleFixPayoutSetup}
            disabled={isCreatingAccount || isCreatingLink}
            className="w-full"
          >
            {isCreatingAccount || isCreatingLink ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isCreatingAccount ? 'Creating account...' : 'Redirecting...'}
              </>
            ) : (
              <>
                Fix Payout Setup
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        )}

        {isReady && (
          <p className="text-sm text-muted-foreground">
            Your account is fully set up and ready to receive payouts from completed sales.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
