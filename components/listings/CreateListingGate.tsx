'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { Loader2, Lock, Sparkles, ArrowLeft } from 'lucide-react';
import { checkListingLimit, type ListingLimitResponse } from '@/lib/listings/listing-limit';
import { PlanPicker } from '@/components/pricing/PlanPicker';
import { createSubscription } from '@/lib/stripe/api';

function getNextPlanLabel(planId: string): { nextPlanId: 'pro' | 'elite' | null; label: string } {
  const normalized = (planId || 'free').toLowerCase();
  if (normalized === 'free') return { nextPlanId: 'pro', label: 'Upgrade to Pro' };
  if (normalized === 'pro') return { nextPlanId: 'elite', label: 'Upgrade to Elite' };
  return { nextPlanId: null, label: 'View Plans' };
}

export function CreateListingGateLink(props: {
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { href = '/dashboard/listings/new', className, children } = props;
  const router = useRouter();
  const { user } = useAuth();

  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [limitInfo, setLimitInfo] = useState<ListingLimitResponse | null>(null);
  const [showPlans, setShowPlans] = useState(false);
  const [upgradeLoading, setUpgradeLoading] = useState<'pro' | 'elite' | null>(null);
  const inflight = useRef<Promise<ListingLimitResponse> | null>(null);

  const nextPlan = useMemo(() => getNextPlanLabel(limitInfo?.planId || 'free'), [limitInfo?.planId]);

  const checkAndMaybeNavigate = useCallback(async () => {
    if (!user) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('redirectAfterLogin', href);
      }
      router.push('/login');
      return;
    }

    setChecking(true);
    try {
      const token = await user.getIdToken();
      inflight.current = inflight.current || checkListingLimit(token);
      const info = await inflight.current;
      setLimitInfo(info);

      if (info.canCreate) {
        router.push(href);
        return;
      }

      setOpen(true);
      setShowPlans(false);
    } catch (e) {
      // If we can't verify, fail safe: allow navigation; publish will still enforce limits server-side.
      router.push(href);
    } finally {
      setChecking(false);
      inflight.current = null;
    }
  }, [href, router, user]);

  return (
    <>
      <Link
        href={href}
        className={className}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!checking) {
            checkAndMaybeNavigate();
          }
        }}
        aria-disabled={checking ? true : undefined}
      >
        {children}
      </Link>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setShowPlans(false);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-destructive" />
              {showPlans ? 'Choose a plan' : 'Upgrade required to create more listings'}
            </DialogTitle>
            <DialogDescription>
              {showPlans
                ? 'Compare plans and upgrade without leaving this page.'
                : 'You’ve reached your plan’s active listing limit. Upgrade to unlock more listings.'}
            </DialogDescription>
          </DialogHeader>

          {!showPlans ? (
            <div className="space-y-3">
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Current plan</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary">{limitInfo?.planDisplayName || 'Free'}</Badge>
                      {limitInfo?.isUnlimited ? (
                        <Badge variant="outline">Unlimited</Badge>
                      ) : (
                        <Badge variant="outline">
                          {limitInfo?.activeListingsCount ?? '—'}/{limitInfo?.listingLimit ?? '—'} active
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Remaining slots</div>
                    <div className="text-lg font-extrabold">
                      {limitInfo?.isUnlimited ? '∞' : (limitInfo?.remainingSlots ?? 0)}
                    </div>
                  </div>
                </div>

                {limitInfo?.message && (
                  <p className="text-xs text-muted-foreground mt-3">{limitInfo.message}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <PlanPicker
                currentPlanId={((limitInfo?.planId || 'free').toLowerCase() as any) || 'free'}
                loadingPlanId={upgradeLoading}
                onSelectPaidPlan={async (planId) => {
                  setUpgradeLoading(planId);
                  try {
                    const result = await createSubscription(planId);
                    const url = (result as any)?.hostedInvoiceUrl;
                    if (url) {
                      window.location.href = url;
                      return;
                    }
                    window.location.href = `/pricing?plan=${planId}`;
                  } finally {
                    setUpgradeLoading(null);
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Upgrades are processed securely by Stripe. Your plan updates automatically after payment.
              </p>
            </div>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
            {showPlans ? (
              <Button variant="outline" onClick={() => setShowPlans(false)} disabled={upgradeLoading !== null}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setOpen(false)} disabled={upgradeLoading !== null}>
                Close
              </Button>
            )}

            {!showPlans && (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setShowPlans(true)}>
                  View Plans
                </Button>
                <Button
                  onClick={async () => {
                    const target = nextPlan.nextPlanId;
                    if (!target) {
                      setShowPlans(true);
                      return;
                    }
                    setUpgradeLoading(target);
                    try {
                      const result = await createSubscription(target);
                      const url = (result as any)?.hostedInvoiceUrl;
                      if (url) {
                        window.location.href = url;
                        return;
                      }
                      window.location.href = `/pricing?plan=${target}`;
                    } finally {
                      setUpgradeLoading(null);
                    }
                  }}
                  disabled={upgradeLoading !== null}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {nextPlan.label}
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {checking && (
        <span className="sr-only">
          <Loader2 className="h-4 w-4 animate-spin" />
        </span>
      )}
    </>
  );
}

export function CreateListingGateButton(props: {
  href?: string;
  className?: string;
  children: React.ReactNode;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}) {
  const { href = '/dashboard/listings/new', className, children, variant = 'default', size = 'default' } = props;
  return (
    <Button variant={variant} size={size} className={className} asChild>
      <CreateListingGateLink href={href}>{children}</CreateListingGateLink>
    </Button>
  );
}

