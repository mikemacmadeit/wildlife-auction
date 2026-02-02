'use client';

import { useCallback, useEffect, memo, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CreditCard,
  DollarSign,
  Clock,
  CheckCircle2,
  TrendingUp,
  Package,
  Calendar,
  ArrowRight,
  Info,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatUserFacingError } from '@/lib/format-user-facing-error';
import { useAuth } from '@/hooks/use-auth';
import { getUserProfile } from '@/lib/firebase/users';
import { UserProfile, type Order, type OrderStatus } from '@/lib/types';
import { createStripeAccount, createAccountLink, checkStripeAccountStatus, createConnectLoginLink } from '@/lib/stripe/api';
import { useToast } from '@/hooks/use-toast';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { getListingById } from '@/lib/firebase/listings';

type PayoutRowStatus = 'available' | 'pending' | 'completed';
type PayoutRow = {
  id: string; // orderId
  orderId: string;
  listingId: string;
  listingTitle: string;
  amount: number;
  platformFee: number;
  sellerAmount: number;
  status: PayoutRowStatus;
  paidAt?: Date;
  releaseEligibleAt?: Date;
  releasedAt?: Date;
  stripeTransferId?: string;
  orderStatus?: OrderStatus;
};

export default function SellerPayoutsPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [isOpeningStripeDashboard, setIsOpeningStripeDashboard] = useState(false);
  const [payoutRows, setPayoutRows] = useState<PayoutRow[]>([]);
  const [loadingPayouts, setLoadingPayouts] = useState(false);
  /** When returning from Stripe with ?onboarding=complete, we may get status from API before Firestore read; use it so UI shows "connected" immediately */
  const [stripeStatusFromReturn, setStripeStatusFromReturn] = useState<{
    payoutsEnabled: boolean;
    detailsSubmitted?: boolean;
    onboardingStatus?: string;
  } | null>(null);
  const [onboardingReturnProcessed, setOnboardingReturnProcessed] = useState(false);

  const loadUserProfile = useCallback(async () => {
    if (!user) return;
    try {
      setLoadingProfile(true);
      const profile = await getUserProfile(user.uid);
      setUserProfile(profile);
    } catch (error) {
      console.error('Error loading user profile:', error);
      toast({
        title: 'Error',
        description: 'Failed to load profile information.',
        variant: 'destructive',
      });
    } finally {
      setLoadingProfile(false);
    }
  }, [toast, user]);

  // Check for onboarding completion when returning from Stripe
  useEffect(() => {
    const onboardingComplete = searchParams?.get('onboarding');
    if (onboardingComplete !== 'complete' || !user || onboardingReturnProcessed) return;

    let cancelled = false;
    const processReturn = async () => {
      try {
        // First check: sync from Stripe and update Firestore
        let result = await checkStripeAccountStatus();
        if (cancelled) return;

        // Use API response so UI shows "connected" immediately (Stripe can lag before Firestore read)
        setStripeStatusFromReturn({
          payoutsEnabled: result.status.payoutsEnabled,
          detailsSubmitted: result.status.detailsSubmitted,
          onboardingStatus: result.status.onboardingStatus,
        });

        // Stripe sometimes returns details_submitted but payouts_enabled not yet true; retry once after a short delay
        if (result.status.detailsSubmitted && !result.status.payoutsEnabled) {
          await new Promise((r) => setTimeout(r, 2500));
          if (cancelled) return;
          result = await checkStripeAccountStatus();
          if (cancelled) return;
          setStripeStatusFromReturn({
            payoutsEnabled: result.status.payoutsEnabled,
            detailsSubmitted: result.status.detailsSubmitted,
            onboardingStatus: result.status.onboardingStatus,
          });
        }

        await loadUserProfile();
        if (cancelled) return;

        setOnboardingReturnProcessed(true);
        router.replace('/seller/payouts', { scroll: false });

        if (result.status.payoutsEnabled) {
          toast({
            title: 'Payouts enabled',
            description: 'Your Stripe account is set up. You can receive payouts.',
          });
        } else if (result.status.detailsSubmitted) {
          toast({
            title: 'Onboarding complete',
            description: 'Verification may take a moment. If payouts don’t show as enabled, use "Refresh Status" or try again shortly.',
          });
        }
      } catch (error: any) {
        if (cancelled) return;
        console.error('Error checking account status:', error);
        await loadUserProfile();
        setOnboardingReturnProcessed(true);
        router.replace('/seller/payouts', { scroll: false });
        toast({
          title: 'Onboarding complete',
          description: 'Refresh the page to see your payout status.',
        });
      }
    };

    processReturn();
    return () => {
      cancelled = true;
    };
  }, [searchParams?.get('onboarding'), user, onboardingReturnProcessed, router, toast, loadUserProfile]);

  // Load user profile
  useEffect(() => {
    if (user && !authLoading) {
      loadUserProfile();
    }
  }, [user, authLoading, loadUserProfile]);

  // Check Stripe account status after profile loads
  useEffect(() => {
    if (userProfile?.stripeAccountId && !userProfile?.payoutsEnabled) {
      // Automatically check status if user has account but payouts aren't enabled
      const checkStatus = async () => {
        try {
          await checkStripeAccountStatus();
          await loadUserProfile(); // Reload to get updated status
        } catch (error) {
          // Silently fail - status check is optional
          console.error('Error checking account status:', error);
        }
      };
      // Small delay to avoid race conditions
      const timer = setTimeout(checkStatus, 500);
      return () => clearTimeout(timer);
    }
  }, [userProfile?.stripeAccountId, userProfile?.payoutsEnabled, loadUserProfile]);

  const handleEnablePayouts = async () => {
    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'Please sign in to enable payouts.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsCreatingAccount(true);

      // Create Stripe account if it doesn't exist
      let stripeAccountId = userProfile?.stripeAccountId;
      if (!stripeAccountId) {
        const result = await createStripeAccount();
        stripeAccountId = result.stripeAccountId;
        // Reload profile to get updated stripeAccountId
        await loadUserProfile();
      }

      // Create onboarding link
      setIsCreatingAccount(false);
      setIsCreatingLink(true);
      const { url } = await createAccountLink();

      // Redirect to Stripe onboarding
      window.location.href = url;
    } catch (error: any) {
      // Check if it's a Stripe configuration error
      const errorMessage = error?.message || String(error) || 'Failed to enable payouts. Please try again.';
      const isStripeNotConfigured = 
        errorMessage.includes('Stripe is not configured') || 
        errorMessage.includes('STRIPE_SECRET_KEY') ||
        errorMessage.includes('stripe') && errorMessage.includes('not configured');
      
      // Only log unexpected errors, not configuration issues
      if (!isStripeNotConfigured) {
        console.error('Error enabling payouts:', error);
      } else {
        // Silently handle expected configuration errors
        // No console logging for expected Stripe configuration issues
      }
      
      toast({
        title: isStripeNotConfigured ? 'Stripe Not Configured' : 'Error',
        description: isStripeNotConfigured 
          ? 'Payment processing is currently unavailable. Please contact support or try again later.'
          : errorMessage,
        variant: 'destructive',
      });
      setIsCreatingAccount(false);
      setIsCreatingLink(false);
    }
  };

  const getOnboardingStatus = () => {
    if (!userProfile) return 'not_started';
    return userProfile.stripeOnboardingStatus || 'not_started';
  };

  const isPayoutsEnabled =
    userProfile?.payoutsEnabled === true || stripeStatusFromReturn?.payoutsEnabled === true;
  const onboardingStatus =
    stripeStatusFromReturn?.onboardingStatus ?? getOnboardingStatus();

  const availablePayouts = useMemo(() => payoutRows.filter((p) => p.status === 'available'), [payoutRows]);
  const pendingPayouts = useMemo(() => payoutRows.filter((p) => p.status === 'pending'), [payoutRows]);
  const completedPayouts = useMemo(() => payoutRows.filter((p) => p.status === 'completed'), [payoutRows]);

  const totalAvailable = useMemo(() => 
    availablePayouts.reduce((sum, p) => sum + p.sellerAmount, 0),
    [availablePayouts]
  );
  const totalPending = useMemo(() => 
    pendingPayouts.reduce((sum, p) => sum + p.sellerAmount, 0),
    [pendingPayouts]
  );

  const formatDate = (date?: Date) => {
    if (!date) return 'N/A';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Load real payouts (derived from orders for this seller)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (authLoading) return;
      if (!user?.uid) {
        setPayoutRows([]);
        return;
      }
      setLoadingPayouts(true);
      try {
        const ordersRef = collection(db, 'orders');
        const sellerId = user.uid;

        let docs: any[] = [];
        try {
          const q = query(ordersRef, where('sellerId', '==', sellerId), orderBy('updatedAt', 'desc'), limit(200));
          const snap = await getDocs(q);
          docs = snap.docs;
        } catch (e: any) {
          const code = String(e?.code || '');
          const msg = String(e?.message || '');
          const isMissingIndex =
            code === 'failed-precondition' ||
            msg.toLowerCase().includes('requires an index') ||
            msg.toLowerCase().includes('failed-precondition');
          if (!isMissingIndex) throw e;
          // Fallback: no orderBy
          const q = query(ordersRef, where('sellerId', '==', sellerId), limit(200));
          const snap = await getDocs(q);
          docs = snap.docs;
        }

        // Best-effort hydrate listing titles
        const listingTitleById: Record<string, string> = {};
        const listingIds = Array.from(new Set(docs.map((d) => String(d.data()?.listingId || '')).filter(Boolean))).slice(0, 80);
        const listingResults = await Promise.allSettled(listingIds.map((id) => getListingById(id)));
        listingResults.forEach((r, idx) => {
          if (r.status !== 'fulfilled') return;
          const listing = r.value as any;
          const id = listingIds[idx];
          if (listing?.title) listingTitleById[id] = String(listing.title);
        });

        const toDateSafe = (v: any): Date | undefined => {
          if (!v) return undefined;
          if (v instanceof Date) return v;
          if (typeof v?.toDate === 'function') {
            try {
              const d = v.toDate();
              if (d instanceof Date) return d;
            } catch {
              // ignore
            }
          }
          if (typeof v?.seconds === 'number') {
            const d = new Date(v.seconds * 1000);
            return Number.isFinite(d.getTime()) ? d : undefined;
          }
          if (typeof v === 'string' || typeof v === 'number') {
            const d = new Date(v);
            return Number.isFinite(d.getTime()) ? d : undefined;
          }
          return undefined;
        };

        const rows: PayoutRow[] = docs
          .map((docSnap) => {
            const data = docSnap.data() as any;
            const orderId = docSnap.id;
            const listingId = String(data?.listingId || '');
            const amount = Number(data?.amount || 0);
            const platformFee = Number(data?.platformFee || 0);
            const sellerAmount = Number(data?.sellerAmount || Math.max(0, amount - platformFee));
            const stripeTransferId = typeof data?.stripeTransferId === 'string' ? data.stripeTransferId : undefined;
            const statusRaw = String(data?.status || '') as OrderStatus;

            // Payout semantics: we use destination charges — seller is paid at payment time.
            // "Pending" = only orders still awaiting payment. Everything post-payment is "completed".
            const AWAITING_PAYMENT: OrderStatus[] = ['pending', 'awaiting_bank_transfer', 'awaiting_wire'];
            const PAID_OR_TERMINAL: OrderStatus[] = [
              'completed', 'paid', 'paid_held', 'in_transit', 'delivered',
              'buyer_confirmed', 'accepted', 'ready_to_release', 'refunded', 'cancelled', 'disputed',
            ];
            const isPending = AWAITING_PAYMENT.includes(statusRaw as OrderStatus);
            const isCompleted = !!stripeTransferId || PAID_OR_TERMINAL.includes(statusRaw as OrderStatus);
            const isAvailable = !isCompleted && !isPending && statusRaw === 'ready_to_release'; // legacy; usually false

            const status: PayoutRowStatus = isPending ? 'pending' : isCompleted ? 'completed' : isAvailable ? 'available' : 'pending';

            const paidAtDate = toDateSafe(data?.paidAt);
            return {
              id: orderId,
              orderId,
              listingId,
              listingTitle: listingTitleById[listingId] || 'Listing',
              amount,
              platformFee,
              sellerAmount,
              status,
              orderStatus: statusRaw,
              paidAt: paidAtDate,
              releaseEligibleAt: toDateSafe(data?.releaseEligibleAt),
              releasedAt: toDateSafe(data?.releasedAt),
              stripeTransferId,
            } satisfies PayoutRow;
          })
          // keep only orders that represent a real money flow; hide abandoned checkouts (cancelled, never paid)
          .filter((r) => r.listingId && r.amount > 0 && r.sellerAmount >= 0 && !(r.orderStatus === 'cancelled' && !r.paidAt));

        rows.sort((a, b) => {
          const aMs = (a.releasedAt || a.releaseEligibleAt || a.paidAt)?.getTime?.() || 0;
          const bMs = (b.releasedAt || b.releaseEligibleAt || b.paidAt)?.getTime?.() || 0;
          return bMs - aMs;
        });

        if (!cancelled) setPayoutRows(rows);
      } catch (e: any) {
        if (!cancelled) {
          console.error('[seller/payouts] Failed to load payouts', e);
          toast({
            title: 'Error',
            description: 'Failed to load payout history. Please try again.',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setLoadingPayouts(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, toast, user?.uid]);

  const PayoutCard = memo(({ payout }: { payout: PayoutRow }) => {
    const getStatusBadge = () => {
      switch (payout.status) {
        case 'available':
          return <Badge variant="secondary" className="font-semibold text-xs">Available</Badge>;
        case 'pending':
          return <Badge variant="destructive" className="font-semibold text-xs">Pending</Badge>;
        case 'completed':
          return <Badge variant="outline" className="font-semibold text-xs">Completed</Badge>;
        default:
          return null;
      }
    };

    return (
          <Card className="border-2 border-border/50 bg-card hover:border-border/70 hover:shadow-warm">
        <CardContent className="pt-6 pb-6 px-4 md:px-6">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <Link
                      href={`/listing/${payout.listingId}`}
                      className="font-semibold text-foreground hover:text-primary"
                    >
                      {payout.listingTitle}
                    </Link>
                  </div>
                  {getStatusBadge()}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-extrabold text-foreground mb-1">
                    {formatCurrency(payout.sellerAmount)}
                  </div>
                  <div className="text-xs text-muted-foreground font-medium">
                    from {formatCurrency(payout.amount)} sale
                  </div>
                </div>
              </div>

              {/* Fee Breakdown */}
              <div className="pt-2 border-t border-border/50 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Transaction Fee:</span>
                  <span className="font-semibold text-foreground">{formatCurrency(payout.platformFee)}</span>
                </div>
                <div className="flex items-center justify-between text-xs pt-2 border-t border-border/50">
                  <span className="font-semibold text-foreground">Total Fees:</span>
                  <span className="font-bold text-foreground">{formatCurrency(payout.platformFee)}</span>
                </div>
              </div>

              {/* Schedule Info */}
              {payout.status === 'available' && (payout.releaseEligibleAt || payout.paidAt) && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                  <Calendar className="h-3 w-3" />
                  <span>
                    Eligible: {formatDate(payout.releaseEligibleAt || payout.paidAt)}
                  </span>
                </div>
              )}
              {payout.status === 'completed' && payout.releasedAt && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Released: {formatDate(payout.releasedAt)}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  });
  PayoutCard.displayName = 'PayoutCard';

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-2">
            Payouts
          </h1>
          <p className="text-base md:text-lg text-muted-foreground">
            Manage your earnings and payout schedule
          </p>
        </div>

        {/* Stripe Connect Onboarding Status */}
        {!authLoading && !loadingProfile && (
          <Card className={cn(
            'border-2',
            isPayoutsEnabled 
              ? 'border-green-500/50 bg-green-500/5' 
              : 'border-yellow-500/50 bg-yellow-500/5'
          )}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isPayoutsEnabled ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  ) : (
                    <AlertCircle className="h-6 w-6 text-yellow-500" />
                  )}
                  <div>
                    <CardTitle className="text-xl font-extrabold">
                      {isPayoutsEnabled ? 'Payouts Enabled' : 'Enable Payouts'}
                    </CardTitle>
                    <CardDescription>
                      {isPayoutsEnabled
                        ? 'Your Stripe account is set up and ready to receive payouts.'
                        : onboardingStatus === 'pending'
                        ? 'Complete your Stripe onboarding to receive payouts.'
                        : 'Set up Stripe Connect to receive payouts from your sales.'}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {userProfile?.stripeAccountId ? (
                    <Button
                      variant="outline"
                      className="min-h-[48px]"
                      disabled={isOpeningStripeDashboard}
                      onClick={async () => {
                        try {
                          setIsOpeningStripeDashboard(true);
                          const { url } = await createConnectLoginLink();
                          window.location.href = url;
                        } catch (error: any) {
                          toast({
                            title: 'Unable to open payout settings',
                            description:
                              error?.message ||
                              'Failed to open Stripe payout settings. Please try again.',
                            variant: 'destructive',
                          });
                        } finally {
                          setIsOpeningStripeDashboard(false);
                        }
                      }}
                    >
                      {isOpeningStripeDashboard ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Opening…
                        </>
                      ) : (
                        'Manage payout method'
                      )}
                    </Button>
                  ) : null}

                  {!isPayoutsEnabled ? (
                    <>
                      {userProfile?.stripeAccountId && (
                      <Button
                        onClick={async () => {
                          try {
                            setIsCreatingLink(true);
                            const result = await checkStripeAccountStatus();
                            await loadUserProfile();
                            
                            // Show detailed status
                            if (result.status.payoutsEnabled) {
                              toast({
                                title: 'Payouts Enabled!',
                                description: 'Your Stripe account is ready to receive payouts.',
                              });
                            } else {
                              let description = `Account status: ${result.status.onboardingStatus}. `;
                              
                              // Log full status for debugging
                              console.log('Stripe Account Status:', {
                                payoutsEnabled: result.status.payoutsEnabled,
                                chargesEnabled: result.status.chargesEnabled,
                                detailsSubmitted: result.status.detailsSubmitted,
                                requirementsDue: result.status.requirementsDue,
                                requirementsPending: result.status.requirementsPending,
                                capabilities: result.status.capabilities,
                                debug: result.debug,
                              });
                              
                              if (result.status.hasPendingRequirements) {
                                const requirements = result.status.requirementsDue || [];
                                const pending = result.status.requirementsPending || [];
                                if (requirements.length > 0) {
                                  description += `Missing: ${requirements.slice(0, 3).join(', ')}. `;
                                }
                                if (pending.length > 0) {
                                  description += `Pending verification: ${pending.slice(0, 2).join(', ')}. `;
                                }
                                description += 'Check Stripe Dashboard for details.';
                              } else if (result.status.detailsSubmitted) {
                                description += `Details submitted. Charges: ${result.status.chargesEnabled ? 'enabled' : 'disabled'}, Payouts: ${result.status.payoutsEnabled ? 'enabled' : 'disabled'}. `;
                                if (!result.status.payoutsEnabled) {
                                  description += 'Payouts may need manual activation in Stripe Dashboard.';
                                }
                              } else {
                                description += 'Please complete all onboarding steps.';
                              }
                              
                              toast({
                                title: 'Status Checked',
                                description,
                                variant: result.status.detailsSubmitted ? 'default' : 'destructive',
                                duration: 10000, // Show longer for important info
                              });
                            }
                          } catch (error: any) {
                            console.error('Error checking account status:', error);
                            toast({
                              title: 'Error',
                              description: formatUserFacingError(error, 'Failed to check account status. Please try again.'),
                              variant: 'destructive',
                            });
                          } finally {
                            setIsCreatingLink(false);
                          }
                        }}
                        variant="outline"
                        disabled={isCreatingLink}
                        className="min-h-[48px]"
                      >
                        {isCreatingLink ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Checking...
                          </>
                        ) : (
                          'Refresh Status'
                        )}
                      </Button>
                    )}
                    <Button
                      onClick={handleEnablePayouts}
                      disabled={isCreatingAccount || isCreatingLink}
                      className="min-h-[48px] min-w-[180px]"
                    >
                      {isCreatingAccount || isCreatingLink ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {isCreatingAccount ? 'Creating Account...' : 'Redirecting...'}
                        </>
                      ) : onboardingStatus === 'pending' ? (
                        'Complete Onboarding'
                      ) : (
                        'Enable Payouts'
                      )}
                    </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            {!isPayoutsEnabled && (
              <CardContent>
                <div className="space-y-4 text-sm">
                  <div className="space-y-2 text-muted-foreground">
                    <p>To receive payouts, you need to:</p>
                    <ul className="list-disc list-inside space-y-1 ml-2">
                      <li>Create a Stripe Connect Express account</li>
                      <li>Complete the onboarding process (takes ~5 minutes)</li>
                      <li>Provide business information and bank details</li>
                    </ul>
                  </div>
                  
                  {userProfile?.stripeAccountId && userProfile?.stripeDetailsSubmitted && !userProfile?.payoutsEnabled && (
                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md">
                      <p className="font-semibold text-foreground mb-2">Additional Information Required</p>
                      <p className="text-xs text-muted-foreground mb-2">
                        Your account needs additional verification to enable payouts. Common missing items:
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground ml-2 mb-3">
                        <li>Individual ID Number (SSN in US, or equivalent)</li>
                        <li>Bank account information</li>
                        <li>Business verification (if applicable)</li>
                      </ul>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleEnablePayouts}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                        >
                          Complete Onboarding
                        </Button>
                        <Button
                          onClick={async () => {
                            try {
                              setIsCreatingLink(true);
                              const { url } = await createAccountLink();
                              window.location.href = url;
                            } catch (error: any) {
                              toast({
                                title: 'Error',
                                description: formatUserFacingError(error, 'Failed to create onboarding link.'),
                                variant: 'destructive',
                              });
                            } finally {
                              setIsCreatingLink(false);
                            }
                          }}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          disabled={isCreatingLink}
                        >
                          {isCreatingLink ? 'Loading...' : 'Continue Onboarding'}
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  <p className="pt-2 text-xs text-muted-foreground">
                    Agchange takes a 10% platform fee on each sale. The remaining 90% is transferred directly to your Stripe account when the buyer pays.
                  </p>
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Balance Cards - same line on mobile */}
        <div className="grid grid-cols-2 gap-3 md:gap-6">
          <Card className="border-2 border-border/50 bg-card hover:border-border/70 hover:shadow-warm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 md:pb-3 md:px-6">
              <CardTitle className="text-xs md:text-base font-bold uppercase tracking-wide text-muted-foreground leading-tight">
                Total Paid Out
              </CardTitle>
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-green-500/10 border-2 border-green-500/20 flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-4 w-4 md:h-5 md:w-5 text-green-500" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              <div className="text-xl md:text-4xl font-extrabold text-foreground mb-0.5 md:mb-1">
                {formatCurrency(completedPayouts.reduce((sum, p) => sum + p.sellerAmount, 0))}
              </div>
              <p className="text-[10px] md:text-xs text-muted-foreground font-medium">
                {completedPayouts.length} sale{completedPayouts.length !== 1 ? 's' : ''} completed
              </p>
            </CardContent>
          </Card>

          <Card className="border-2 border-border/50 bg-card hover:border-border/70 hover:shadow-warm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 md:pb-3 md:px-6">
              <CardTitle className="text-xs md:text-base font-bold uppercase tracking-wide text-muted-foreground leading-tight">
                Awaiting Payment
              </CardTitle>
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg bg-yellow-500/10 border-2 border-yellow-500/20 flex items-center justify-center shrink-0">
                <Clock className="h-4 w-4 md:h-5 md:w-5 text-yellow-500" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
              <div className="text-xl md:text-4xl font-extrabold text-foreground mb-0.5 md:mb-1">
                {formatCurrency(totalPending)}
              </div>
              <p className="text-[10px] md:text-xs text-muted-foreground font-medium">
                {pendingPayouts.length} buyer{pendingPayouts.length !== 1 ? 's' : ''} completing checkout
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Fee Information */}
        <Card className="border-2 border-border/50 bg-card">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              <CardTitle className="text-xl font-extrabold">Fee Structure</CardTitle>
            </div>
            <CardDescription>
              Transparent breakdown of marketplace fees
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border border-border/50 bg-background/50">
                <p className="text-sm font-semibold text-foreground mb-1">Transaction Fee</p>
                <p className="text-2xl font-extrabold text-primary mb-1">10%</p>
                <p className="text-xs text-muted-foreground">Flat marketplace fee on all sales</p>
              </div>
              <div className="p-4 rounded-lg border border-border/50 bg-background/50">
                <p className="text-sm font-semibold text-foreground mb-1">Listing Fee</p>
                <p className="text-2xl font-extrabold text-primary mb-1">$0</p>
                <p className="text-xs text-muted-foreground">Free to list, only pay when you sell</p>
              </div>
              <div className="p-4 rounded-lg border border-border/50 bg-background/50">
                <p className="text-sm font-semibold text-foreground mb-1">Payout Timing</p>
                <p className="text-2xl font-extrabold text-primary mb-1">Instant</p>
                <p className="text-xs text-muted-foreground">Paid when buyer completes checkout</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payouts Tabs */}
        <Tabs defaultValue="available" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 h-auto bg-card border border-border/50 p-1">
            <TabsTrigger value="available" className="min-h-[44px] font-semibold data-[state=active]:bg-background">
              <DollarSign className="h-4 w-4 mr-2" />
              Available ({availablePayouts.length})
            </TabsTrigger>
            <TabsTrigger value="pending" className="min-h-[44px] font-semibold data-[state=active]:bg-background">
              <Clock className="h-4 w-4 mr-2" />
              Pending ({pendingPayouts.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="min-h-[44px] font-semibold data-[state=active]:bg-background">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Completed ({completedPayouts.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="space-y-4">
            {availablePayouts.length === 0 ? (
              <Card className="border-2 border-border/50 bg-card">
                <CardContent className="pt-12 pb-12 px-6 text-center">
                  <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No available payouts</h3>
                  <p className="text-sm text-muted-foreground">
                    Available payouts will appear here when sales are completed
                  </p>
                </CardContent>
              </Card>
            ) : (
              availablePayouts.map((payout) => (
                <PayoutCard key={payout.id} payout={payout} />
              ))
            )}
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            {pendingPayouts.length === 0 ? (
              <Card className="border-2 border-border/50 bg-card">
                <CardContent className="pt-12 pb-12 px-6 text-center">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No pending payouts</h3>
                  <p className="text-sm text-muted-foreground">
                    Pending payouts will appear here while processing
                  </p>
                </CardContent>
              </Card>
            ) : (
              pendingPayouts.map((payout) => (
                <PayoutCard key={payout.id} payout={payout} />
              ))
            )}
          </TabsContent>

          <TabsContent value="completed" className="space-y-4">
            {completedPayouts.length === 0 ? (
              <Card className="border-2 border-border/50 bg-card">
                <CardContent className="pt-12 pb-12 px-6 text-center">
                  <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No completed payouts</h3>
                  <p className="text-sm text-muted-foreground">
                    Completed payouts will appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              completedPayouts.map((payout) => (
                <PayoutCard key={payout.id} payout={payout} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
