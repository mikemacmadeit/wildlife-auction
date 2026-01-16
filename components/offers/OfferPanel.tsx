'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { createOffer, acceptOffer, counterOffer, declineOffer, withdrawOffer, getMyOffers } from '@/lib/offers/api';
import { createCheckoutSession } from '@/lib/stripe/api';
import type { Listing } from '@/lib/types';
import { Loader2, Handshake, Clock, CheckCircle2, XCircle, RefreshCw, DollarSign } from 'lucide-react';
import { PaymentMethodDialog, type PaymentMethodChoice } from '@/components/payments/PaymentMethodDialog';
import { CheckoutStartErrorDialog } from '@/components/payments/CheckoutStartErrorDialog';

type OfferDTO = {
  offerId: string;
  status: string;
  currentAmount: number;
  acceptedAmount?: number;
  lastActorRole?: 'buyer' | 'seller' | 'system';
  expiresAt?: number | null;
};

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

export function OfferPanel(props: { listing: Listing }) {
  const { listing } = props;
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [offer, setOffer] = useState<OfferDTO | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [mode, setMode] = useState<'make' | 'counter'>('make');
  const [amount, setAmount] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [pendingCheckoutAmount, setPendingCheckoutAmount] = useState<number | null>(null);
  const [checkoutErrorOpen, setCheckoutErrorOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState<{
    attemptedMethod: PaymentMethodChoice;
    message: string;
    technical?: string;
  } | null>(null);

  const eligible = useMemo(() => {
    const enabled = !!(listing.bestOfferSettings?.enabled ?? listing.bestOfferEnabled);
    const isTypeOk = listing.type === 'fixed' || listing.type === 'classified';
    const isActive = listing.status === 'active';
    return enabled && isTypeOk && isActive;
  }, [listing.bestOfferEnabled, listing.bestOfferSettings?.enabled, listing.status, listing.type]);

  const minPrice = listing.bestOfferSettings?.minPrice ?? listing.bestOfferMinPrice;
  const expiryHours = listing.bestOfferSettings?.offerExpiryHours ?? 48;

  const refresh = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await getMyOffers({ listingId: listing.id, limit: 10 });
      const first = (res?.offers || [])[0] as any;
      if (first) {
        setOffer({
          offerId: first.offerId,
          status: first.status,
          currentAmount: Number(first.currentAmount),
          acceptedAmount: first.acceptedAmount ? Number(first.acceptedAmount) : undefined,
          lastActorRole: first.lastActorRole,
          expiresAt: first.expiresAt,
        });
      } else {
        setOffer(null);
      }
      setLoadError(null);
    } catch {
      setLoadError('Unable to load your offer status right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [listing.id, user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openMakeOffer = () => {
    setMode('make');
    setAmount('');
    setModalOpen(true);
  };

  const openCounter = () => {
    setMode('counter');
    setAmount('');
    setModalOpen(true);
  };

  const submit = async () => {
    if (!user) {
      toast({ title: 'Sign in required', description: 'You must be signed in to make an offer.', variant: 'destructive' });
      return;
    }
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast({ title: 'Invalid amount', description: 'Enter a valid amount.', variant: 'destructive' });
      return;
    }
    if (typeof minPrice === 'number' && Number.isFinite(minPrice) && n < minPrice) {
      toast({ title: 'Offer too low', description: `Minimum offer is $${minPrice}.`, variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      if (mode === 'make') {
        await createOffer(listing.id, n);
        toast({ title: 'Offer sent', description: 'Your offer was sent to the seller.' });
      } else {
        if (!offer) throw new Error('No offer to counter');
        await counterOffer(offer.offerId, n);
        toast({ title: 'Counter sent', description: 'Your counter was sent to the seller.' });
      }
      setModalOpen(false);
      await refresh();
    } catch (e: any) {
      toast({ title: 'Action failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const accept = async () => {
    if (!offer) return;
    setLoading(true);
    try {
      await acceptOffer(offer.offerId);
      toast({ title: 'Accepted', description: 'Offer accepted. You can now checkout at the agreed price.' });
      await refresh();
    } catch (e: any) {
      toast({ title: 'Accept failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const decline = async () => {
    if (!offer) return;
    setLoading(true);
    try {
      await declineOffer(offer.offerId);
      toast({ title: 'Declined', description: 'You declined the counter.' });
      await refresh();
    } catch (e: any) {
      toast({ title: 'Decline failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const withdraw = async () => {
    if (!offer) return;
    setLoading(true);
    try {
      await withdrawOffer(offer.offerId);
      toast({ title: 'Withdrawn', description: 'Your offer was withdrawn.' });
      await refresh();
    } catch (e: any) {
      toast({ title: 'Withdraw failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const checkout = async () => {
    if (!offer) return;
    setLoading(true);
    try {
      const purchaseAmount = Number(offer.acceptedAmount ?? offer.currentAmount);
      setPendingCheckoutAmount(Number.isFinite(purchaseAmount) ? purchaseAmount : 0);
      setPaymentDialogOpen(true);
      setLoading(false);
      return;
    } catch (e: any) {
      toast({ title: 'Checkout failed', description: e?.message || 'Please try again.', variant: 'destructive' });
      setLoading(false);
    }
  };

  const handleSelectPaymentMethod = async (method: PaymentMethodChoice) => {
    if (!offer) return;
    setPaymentDialogOpen(false);
    setLoading(true);
    try {
      const { url } = await createCheckoutSession(listing.id, offer.offerId, method);
      window.location.href = url;
    } catch (e: any) {
      setCheckoutError({
        attemptedMethod: method,
        message: 'We couldn’t start checkout. You can retry card or switch to bank transfer / wire.',
        technical: e?.message ? String(e.message) : String(e),
      });
      setCheckoutErrorOpen(true);
      setLoading(false);
    } finally {
      setPendingCheckoutAmount(null);
    }
  };

  if (!eligible) return null;
  if (user?.uid === listing.sellerId) return null;

  const showMake = !offer;
  const status = offer?.status;
  const timeLeft = offer?.expiresAt ? formatTimeLeft(offer.expiresAt) : '—';

  const canWithdraw = status === 'open' || status === 'countered';
  const canBuyerRespondToCounter = status === 'countered' && offer?.lastActorRole === 'seller';
  const accepted = status === 'accepted';

  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Handshake className="h-4 w-4 text-primary" />
            <div className="text-sm font-extrabold tracking-tight">Or Best Offer</div>
          </div>
          <div className="text-xs text-muted-foreground">
            {typeof minPrice === 'number' && Number.isFinite(minPrice) ? `Min $${minPrice} · ` : ''}
            Expires in {expiryHours}h
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refresh()}
          disabled={loading || !user}
          className="h-9"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          {loadError}
        </div>
      ) : null}

      {showMake ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={openMakeOffer} disabled={loading} className="min-h-[44px] font-semibold">
            <DollarSign className="h-4 w-4 mr-2" />
            Make Offer
          </Button>
          <div className="text-xs text-muted-foreground sm:self-center">
            Buyer and seller identities stay private until payment.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              Status: {status}
            </Badge>
            <Badge variant="outline" className="text-xs">
              Current: ${offer!.currentAmount.toLocaleString()}
            </Badge>
            <Badge variant="outline" className="text-xs flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeLeft}
            </Badge>
          </div>

          {accepted ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={checkout} disabled={loading} className="min-h-[44px] font-semibold">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Buy at ${(offer!.acceptedAmount ?? offer!.currentAmount).toLocaleString()}
              </Button>
              <div className="text-xs text-muted-foreground sm:self-center">
                This listing is reserved for your accepted offer.
              </div>
            </div>
          ) : canBuyerRespondToCounter ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={accept} disabled={loading} className="min-h-[44px] font-semibold">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Accept
              </Button>
              <Button onClick={openCounter} disabled={loading} variant="secondary" className="min-h-[44px] font-semibold">
                Counter
              </Button>
              <Button onClick={decline} disabled={loading} variant="outline" className="min-h-[44px] font-semibold">
                <XCircle className="h-4 w-4 mr-2" />
                Decline
              </Button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              {canWithdraw && (
                <Button onClick={withdraw} disabled={loading} variant="outline" className="min-h-[44px] font-semibold">
                  Withdraw
                </Button>
              )}
              <div className="text-xs text-muted-foreground sm:self-center">
                {status === 'open' ? 'Waiting for seller response.' : 'Waiting for response.'}
              </div>
            </div>
          )}
        </div>
      )}

      <PaymentMethodDialog
        open={paymentDialogOpen}
        onOpenChange={(open) => {
          setPaymentDialogOpen(open);
          if (!open) setPendingCheckoutAmount(null);
        }}
        amountUsd={pendingCheckoutAmount || 0}
        onSelect={handleSelectPaymentMethod}
      />

      <CheckoutStartErrorDialog
        open={checkoutErrorOpen}
        onOpenChange={(open) => {
          setCheckoutErrorOpen(open);
          if (!open) setCheckoutError(null);
        }}
        attemptedMethod={checkoutError?.attemptedMethod || 'card'}
        errorMessage={checkoutError?.message || 'Checkout could not be started.'}
        technicalDetails={checkoutError?.technical}
        onRetryCard={() => handleSelectPaymentMethod('card')}
        onSwitchBank={() => handleSelectPaymentMethod('bank_transfer')}
        onSwitchWire={() => handleSelectPaymentMethod('wire')}
      />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Handshake className="h-5 w-5 text-primary" />
              {mode === 'make' ? 'Make an offer' : 'Send a counter offer'}
            </DialogTitle>
            <DialogDescription>
              {typeof minPrice === 'number' && Number.isFinite(minPrice)
                ? `Minimum offer: $${minPrice}. `
                : ''}
              Offers expire after {expiryHours} hours.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <div className="text-sm font-semibold">Amount</div>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              placeholder={typeof minPrice === 'number' ? String(minPrice) : '0'}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="min-h-[48px]"
            />
            <div className="text-xs text-muted-foreground">
              Buyer and seller identities stay private until payment.
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={loading} className="font-semibold">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

