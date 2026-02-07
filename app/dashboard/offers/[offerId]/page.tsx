'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, Handshake, Clock, ArrowLeft, CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { formatUserFacingError } from '@/lib/format-user-facing-error';
import { acceptOffer, counterOffer, declineOffer, getOffer, withdrawOffer } from '@/lib/offers/api';
import { formatOfferHistoryLabel, offerStatusBadgeVariant } from '@/lib/offers/format';
import { OfferAcceptedSuccessModal } from '@/components/offers/OfferAcceptedSuccessModal';
import { cn } from '@/lib/utils';

function formatTimeLeft(expiresAtMs?: number | null): string {
  if (!expiresAtMs) return '—';
  const diff = expiresAtMs - Date.now();
  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / (60 * 1000));
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ${hrs % 24}h`;
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
}

export default function BuyerOfferDetailPage() {
  const router = useRouter();
  const params = useParams<{ offerId: string }>();
  const offerId = params?.offerId;
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [offer, setOffer] = useState<any | null>(null);

  const [counterOpen, setCounterOpen] = useState(false);
  const [counterAmount, setCounterAmount] = useState('');
  const [acceptSuccessOpen, setAcceptSuccessOpen] = useState(false);

  const load = async () => {
    if (!offerId) return;
    setLoading(true);
    try {
      const res = await getOffer(String(offerId));
      setOffer(res?.offer || null);
    } catch (e: any) {
      toast({ title: 'Failed to load offer', description: formatUserFacingError(e, 'Please try again.'), variant: 'destructive' });
      setOffer(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, offerId]);

  const canWithdraw = useMemo(
    () => (offer?.status === 'open' || offer?.status === 'countered') && offer?.status !== 'accepted',
    [offer?.status]
  );
  const canRespondToCounter = useMemo(
    () => offer?.status === 'countered' && offer?.lastActorRole === 'seller' && offer?.status !== 'accepted',
    [offer?.status, offer?.lastActorRole]
  );
  const canCheckout = useMemo(() => offer?.status === 'accepted', [offer?.status]);
  const isExpiredOrDeclined = useMemo(
    () => offer?.status === 'expired' || offer?.status === 'declined',
    [offer?.status]
  );

  const doAccept = async () => {
    if (!offerId) return;
    setActionLoading(true);
    try {
      await acceptOffer(String(offerId));
      await load();
      setAcceptSuccessOpen(true);
    } catch (e: any) {
      toast({ title: 'Action failed', description: formatUserFacingError(e, 'Please try again.'), variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const doDecline = async () => {
    if (!offerId) return;
    setActionLoading(true);
    try {
      await declineOffer(String(offerId));
      toast({ title: 'Offer declined' });
      await load();
    } catch (e: any) {
      toast({ title: 'Action failed', description: formatUserFacingError(e, 'Please try again.'), variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const doWithdraw = async () => {
    if (!offerId) return;
    setActionLoading(true);
    try {
      await withdrawOffer(String(offerId));
      toast({ title: 'Offer withdrawn' });
      await load();
    } catch (e: any) {
      toast({ title: 'Action failed', description: formatUserFacingError(e, 'Please try again.'), variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const submitCounter = async () => {
    if (!offerId) return;
    const amount = Number(counterAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: 'Invalid amount', description: 'Enter a valid counter amount.', variant: 'destructive' });
      return;
    }
    setActionLoading(true);
    try {
      await counterOffer(String(offerId), amount);
      toast({ title: 'Counter sent' });
      setCounterOpen(false);
      await load();
    } catch (e: any) {
      toast({ title: 'Action failed', description: formatUserFacingError(e, 'Please try again.'), variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const checkout = async () => {
    if (!offerId) return;
    if (!offer?.listingId) return;
    try {
      router.push(`/listing/${offer.listingId}`);
    } catch (e: any) {
      toast({ title: 'Checkout failed', description: formatUserFacingError(e, 'Please try again.'), variant: 'destructive' });
    }
  };

  if (!user && !authLoading) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-8 pb-bottom-nav-safe md:pb-8">
        <Card className="border-2 border-border bg-card shadow-warm">
          <CardContent className="py-10 text-center space-y-3">
            <div className="text-lg font-extrabold">Please sign in</div>
            <p className="text-sm text-muted-foreground">You must be signed in to view this offer.</p>
            <Button asChild className="min-h-[44px] font-semibold">
              <Link href="/login">Go to login</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-bottom-nav-safe md:pb-8">
      <div className="container mx-auto px-4 md:px-6 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/dashboard/bids-offers?tab=offers')}
            className="shrink-0 h-10 w-10 rounded-full"
            aria-label="Back to offers"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg sm:text-xl font-semibold truncate">Offer details</h1>
        </div>

        {loading || !offer ? (
          <Card className="border-2 border-border bg-card shadow-warm">
            <CardContent className="py-12 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1.1fr_.9fr]">
            {/* Main card: title, status, view listing, history */}
            <Card className="border-2 border-border bg-card shadow-warm overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Handshake className="h-5 w-5 text-primary shrink-0" />
                  <span className="line-clamp-2">{offer.listingSnapshot?.title || 'Listing'}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={offerStatusBadgeVariant(offer.status)} className="text-xs font-medium">
                    {offer.status === 'expired' ? 'Expired' : offer.status === 'declined' ? 'Declined' : offer.status}
                  </Badge>
                  <Badge variant="outline" className="text-xs font-medium tabular-nums">
                    ${Number(offer.currentAmount).toLocaleString()}
                  </Badge>
                  {offer.expiresAt != null && (
                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTimeLeft(offer.expiresAt)}
                    </Badge>
                  )}
                </div>

                <Button asChild variant="outline" className="w-full sm:w-auto min-h-[44px] border-2 border-primary/40 text-primary hover:bg-primary/10">
                  <Link href={`/listing/${offer.listingId}`}>View listing</Link>
                </Button>

                <div className="rounded-xl border border-border bg-muted/20 p-4">
                  <div className="text-sm font-semibold mb-3">Offer history</div>
                  {(offer.history && offer.history.length > 0) ? (
                    <div className="space-y-3">
                      {offer.history.slice().reverse().map((h: any, idx: number) => (
                        <div key={idx} className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1 sm:gap-3 text-sm">
                          <div className="min-w-0">
                            <span className="font-medium">{formatOfferHistoryLabel(h)}</span>
                            {typeof h.amount === 'number' && (
                              <span className="ml-2 font-semibold tabular-nums">${Number(h.amount).toLocaleString()}</span>
                            )}
                            {h.note ? <div className="text-xs text-muted-foreground mt-0.5">{h.note}</div> : null}
                          </div>
                          <div className="text-xs text-muted-foreground shrink-0">
                            {h.createdAt ? new Date(h.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No offer history yet.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Actions card — prominent on mobile */}
            <Card className={cn('border-2 border-border bg-card shadow-warm lg:max-h-[min(28rem,80vh)]', canCheckout && 'border-primary/30')}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {canCheckout && (
                  <>
                    <Button onClick={checkout} disabled={actionLoading} className="w-full min-h-[48px] font-semibold shadow-md hover:shadow-lg">
                      <CheckCircle2 className="h-5 w-5 mr-2" />
                      Checkout at ${(offer.acceptedAmount ?? offer.currentAmount).toLocaleString()}
                    </Button>
                    <p className="text-xs text-muted-foreground">Complete payment on the listing to secure this price.</p>
                  </>
                )}

                {canRespondToCounter && (
                  <>
                    <Button onClick={doAccept} disabled={actionLoading} className="w-full min-h-[48px] font-semibold">
                      {actionLoading ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
                      Accept
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setCounterAmount(String(offer.currentAmount));
                        setCounterOpen(true);
                      }}
                      disabled={actionLoading}
                      className="w-full min-h-[48px] font-semibold"
                    >
                      Counter
                    </Button>
                    <Button variant="outline" onClick={doDecline} disabled={actionLoading} className="w-full min-h-[48px] font-semibold">
                      <XCircle className="h-5 w-5 mr-2" />
                      Decline
                    </Button>
                  </>
                )}

                {canWithdraw && (
                  <Button variant="outline" onClick={doWithdraw} disabled={actionLoading} className="w-full min-h-[48px] font-semibold">
                    Withdraw offer
                  </Button>
                )}

                {isExpiredOrDeclined && (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {offer.status === 'expired'
                        ? 'This offer has expired. You can make a new offer from the listing if it’s still available.'
                        : 'This offer was declined. You can make a new offer from the listing if you’d like.'}
                    </p>
                    <Button asChild className="w-full min-h-[48px] font-semibold shadow-md hover:shadow-lg" size="default">
                      <Link href={`/listing/${offer.listingId}`}>
                        Make a new offer
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full min-h-[44px]">
                      <Link href={`/listing/${offer.listingId}`}>View listing</Link>
                    </Button>
                  </>
                )}

                {!canCheckout && !canRespondToCounter && !canWithdraw && !isExpiredOrDeclined && (
                  <p className="text-sm text-muted-foreground">No actions available for this offer.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <Dialog open={counterOpen} onOpenChange={setCounterOpen}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Counter offer</DialogTitle>
              <DialogDescription>Send a new amount. Expiry resets on counter.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 py-2">
              <label className="text-sm font-semibold">Amount</label>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="1"
                value={counterAmount}
                onChange={(e) => setCounterAmount(e.target.value)}
                className="min-h-[48px]"
                placeholder={offer ? String(offer.currentAmount) : '0'}
              />
            </div>
            <DialogFooter className="gap-2 flex-col-reverse sm:flex-row">
              <Button variant="outline" onClick={() => setCounterOpen(false)} disabled={actionLoading} className="w-full sm:w-auto min-h-[44px]">
                Cancel
              </Button>
              <Button onClick={submitCounter} disabled={actionLoading} className="w-full sm:w-auto min-h-[44px] font-semibold">
                {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Send counter
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <OfferAcceptedSuccessModal
          open={acceptSuccessOpen}
          onOpenChange={setAcceptSuccessOpen}
          role="buyer"
          listingTitle={offer?.listingSnapshot?.title}
          amount={offer ? Number(offer.acceptedAmount ?? offer.currentAmount) : undefined}
          offerId={offerId ?? undefined}
          listingId={offer?.listingId}
          onCheckout={() => {
            if (offer?.listingId) router.push(`/listing/${offer.listingId}`);
          }}
        />
      </div>
    </div>
  );
}
