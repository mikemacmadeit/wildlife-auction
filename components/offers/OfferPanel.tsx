'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import Link from 'next/link';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { createOffer, acceptOffer, counterOffer, declineOffer, withdrawOffer, getMyOffers } from '@/lib/offers/api';
import { createCheckoutSession, createWireIntent } from '@/lib/stripe/api';
import type { Listing } from '@/lib/types';
import { Loader2, Handshake, Clock, CheckCircle2, XCircle, RefreshCw, DollarSign } from 'lucide-react';
import { PaymentMethodDialog, type PaymentMethodChoice } from '@/components/payments/PaymentMethodDialog';
import { CheckoutStartErrorDialog } from '@/components/payments/CheckoutStartErrorDialog';
import { WireInstructionsDialog } from '@/components/payments/WireInstructionsDialog';
import { isAnimalCategory } from '@/lib/compliance/requirements';
import { AnimalRiskAcknowledgmentDialog } from '@/components/legal/AnimalRiskAcknowledgmentDialog';

type OfferDTO = {
  offerId: string;
  status: string;
  currentAmount: number;
  acceptedAmount?: number;
  lastActorRole?: 'buyer' | 'seller' | 'system';
  expiresAt?: number | null;
};

const ACTIVE_OFFER_STATUSES = new Set(['open', 'countered', 'accepted']);

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
  const [step, setStep] = useState<'edit' | 'review'>('edit');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [offerLimit, setOfferLimit] = useState<{ limit: number; used: number; left: number } | null>(null);
  const [preferredPaymentMethod, setPreferredPaymentMethod] = useState<PaymentMethodChoice | null>(null);
  const [offerPaymentDialogOpen, setOfferPaymentDialogOpen] = useState(false);
  const [offerSentOpen, setOfferSentOpen] = useState(false);
  const [sentOfferId, setSentOfferId] = useState<string | null>(null);
  const [sentOfferAmount, setSentOfferAmount] = useState<number | null>(null);
  const [retractOpen, setRetractOpen] = useState(false);
  const [retractReason, setRetractReason] = useState<string>('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [pendingCheckoutAmount, setPendingCheckoutAmount] = useState<number | null>(null);
  const [checkoutErrorOpen, setCheckoutErrorOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState<{
    attemptedMethod: PaymentMethodChoice;
    message: string;
    technical?: string;
  } | null>(null);
  const [wireDialogOpen, setWireDialogOpen] = useState(false);
  const [wireData, setWireData] = useState<null | {
    orderId: string;
    paymentIntentId: string;
    instructions: { reference: string; financialAddresses: Array<{ type: string; address: any }> };
  }>(null);
  const [animalAckOpen, setAnimalAckOpen] = useState(false);
  const [animalRiskAcked, setAnimalRiskAcked] = useState(false);

  const isAnimalListing = useMemo(() => isAnimalCategory(listing.category as any), [listing.category]);

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
      const offers = (res?.offers || []) as any[];
      const firstActive = offers.find((o) => ACTIVE_OFFER_STATUSES.has(String(o?.status || '')));
      if (res?.offerLimit && typeof res.offerLimit === 'object') {
        const l = res.offerLimit as any;
        if (typeof l.limit === 'number' && typeof l.used === 'number' && typeof l.left === 'number') {
          setOfferLimit({ limit: l.limit, used: l.used, left: l.left });
        }
      } else {
        setOfferLimit(null);
      }
      if (firstActive) {
        setOffer({
          offerId: firstActive.offerId,
          status: firstActive.status,
          currentAmount: Number(firstActive.currentAmount),
          acceptedAmount: firstActive.acceptedAmount ? Number(firstActive.acceptedAmount) : undefined,
          lastActorRole: firstActive.lastActorRole,
          expiresAt: firstActive.expiresAt,
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
    setNote('');
    setPreferredPaymentMethod(null);
    setStep('edit');
    setModalOpen(true);
  };

  const openCounter = () => {
    setMode('counter');
    setAmount('');
    setNote('');
    setPreferredPaymentMethod(null);
    setStep('edit');
    setModalOpen(true);
  };

  const paymentMethodLabel = (m: PaymentMethodChoice) => {
    if (m === 'card') return 'Card';
    if (m === 'ach_debit') return 'ACH debit';
    return 'Wire';
  };

  const continueToReview = () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast({ title: 'Invalid amount', description: 'Enter a valid amount.', variant: 'destructive' });
      return;
    }
    if (typeof minPrice === 'number' && Number.isFinite(minPrice) && n < minPrice) {
      toast({ title: 'Offer too low', description: `Minimum offer is $${minPrice}.`, variant: 'destructive' });
      return;
    }
    setStep('review');
    if (!preferredPaymentMethod) setOfferPaymentDialogOpen(true);
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
        if (!preferredPaymentMethod) {
          setOfferPaymentDialogOpen(true);
          throw new Error('Select a payment method to continue.');
        }
        const res = await createOffer(
          listing.id,
          n,
          note.trim() ? note.trim() : undefined,
          preferredPaymentMethod
        );
        if ((res as any)?.offerLimit) setOfferLimit((res as any).offerLimit);
        const newOfferId = String((res as any)?.offerId || (res as any)?.id || '');
        setSentOfferId(newOfferId || null);
        setSentOfferAmount(n);
        setOfferSentOpen(true);
        setRetractReason('');
      } else {
        if (!offer) throw new Error('No offer to counter');
        await counterOffer(offer.offerId, n, note.trim() ? note.trim() : undefined);
        toast({ title: 'Counter sent', description: 'Your counter was sent to the seller.' });
      }
      setModalOpen(false);
      setStep('edit');
      await refresh();
    } catch (e: any) {
      if (e?.code === 'OFFER_LIMIT_REACHED') {
        const left = e?.data?.offerLimit?.left;
        toast({
          title: 'Offer limit reached',
          description: typeof left === 'number' ? `You have ${left} offers left for this listing.` : e?.message || 'Offer limit reached for this listing.',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Action failed', description: e?.message || 'Please try again.', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  };

  const retractSentOffer = async () => {
    const id = sentOfferId || offer?.offerId || null;
    if (!id) return;
    if (!retractReason) {
      toast({ title: 'Select a reason', description: 'Please choose a reason for retracting.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      await withdrawOffer(
        id,
        `Retracted offer. Reason: ${retractReason}`
      );
      toast({ title: 'Offer retracted', description: 'Your offer was retracted.' });
      setRetractOpen(false);
      setOfferSentOpen(false);
      setSentOfferId(null);
      setSentOfferAmount(null);
      setRetractReason('');
      await refresh();
    } catch (e: any) {
      toast({ title: 'Retract failed', description: e?.message || 'Please try again.', variant: 'destructive' });
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
      if (isAnimalListing && !animalRiskAcked) setAnimalAckOpen(true);
      else setPaymentDialogOpen(true);
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
      if (method === 'wire') {
        const out = await createWireIntent(listing.id, offer.offerId, { buyerAcksAnimalRisk: isAnimalListing ? animalRiskAcked : undefined });
        setWireData(out);
        setWireDialogOpen(true);
      } else {
        const { url } = await createCheckoutSession(listing.id, offer.offerId, method, {
          buyerAcksAnimalRisk: isAnimalListing ? animalRiskAcked : undefined,
        });
        window.location.href = url;
      }
    } catch (e: any) {
      setCheckoutError({
        attemptedMethod: method,
        message: 'We couldn’t start checkout. You can retry card or switch to ACH debit / wire.',
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

  const status = offer?.status;
  const isActive = !status ? false : ACTIVE_OFFER_STATUSES.has(status);
  const showMake = !offer || !isActive;
  const timeLeft = offer?.expiresAt ? formatTimeLeft(offer.expiresAt) : '—';

  const canWithdraw = status === 'open' || status === 'countered';
  const canBuyerRespondToCounter = status === 'countered' && offer?.lastActorRole === 'seller';
  const accepted = status === 'accepted';
  const offersLeft = typeof offerLimit?.left === 'number' ? offerLimit.left : null;

  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-5 space-y-3">
      <AnimalRiskAcknowledgmentDialog
        open={animalAckOpen}
        onOpenChange={setAnimalAckOpen}
        onConfirm={() => {
          setAnimalRiskAcked(true);
          setAnimalAckOpen(false);
          setPaymentDialogOpen(true);
        }}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Handshake className="h-4 w-4 text-primary" />
            <div className="text-sm font-extrabold tracking-tight">Or Best Offer</div>
          </div>
          <div className="text-xs text-muted-foreground">
            {typeof minPrice === 'number' && Number.isFinite(minPrice) ? `Min $${minPrice} · ` : ''}
            Expires in {expiryHours}h
            {offersLeft !== null ? ` · ${offersLeft} offers left` : ''}
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
          <Button onClick={openMakeOffer} disabled={loading || (offersLeft !== null && offersLeft <= 0)} className="min-h-[44px] font-semibold">
            <DollarSign className="h-4 w-4 mr-2" />
            Make Offer
          </Button>
          <div className="text-xs text-muted-foreground sm:self-center">
            {offersLeft !== null && offersLeft <= 0
              ? 'Offer limit reached for this listing.'
              : 'Buyer and seller identities stay private until payment.'}
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
        isAuthenticated={!!user}
        isEmailVerified={!!user?.emailVerified}
      />

      {/* Offer review payment method picker (used before sending the offer) */}
      <PaymentMethodDialog
        open={offerPaymentDialogOpen}
        onOpenChange={setOfferPaymentDialogOpen}
        amountUsd={Number(amount) || 0}
        onSelect={(m) => {
          setPreferredPaymentMethod(m);
          setOfferPaymentDialogOpen(false);
        }}
        isAuthenticated={!!user}
        isEmailVerified={!!user?.emailVerified}
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
        onSwitchBank={() => handleSelectPaymentMethod('ach_debit')}
        onSwitchWire={() => handleSelectPaymentMethod('wire')}
      />

      <WireInstructionsDialog open={wireDialogOpen} onOpenChange={setWireDialogOpen} data={wireData} />

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Handshake className="h-5 w-5 text-primary" />
              {step === 'review' ? 'Review offer' : mode === 'make' ? 'Make an offer' : 'Send a counter offer'}
            </DialogTitle>
            <DialogDescription>
              {typeof minPrice === 'number' && Number.isFinite(minPrice)
                ? `Minimum offer: $${minPrice}. `
                : ''}
              Offers expire after {expiryHours} hours.
            </DialogDescription>
          </DialogHeader>

          {step === 'edit' ? (
            <>
              <div className="space-y-2">
                <div className="text-sm font-semibold">Your offer (USD)</div>
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
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold">Message (optional)</div>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a message for the seller (optional)…"
                  className="min-h-[90px]"
                  maxLength={250}
                  disabled={loading}
                />
                <div className="text-xs text-muted-foreground">{note.length}/250</div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">Total</div>
                  <div className="text-sm font-extrabold">
                    ${Number(amount || 0).toLocaleString()}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  You will only be charged if the seller accepts your offer.
                </div>
              </div>

              <div className="rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-muted-foreground">Pay with</div>
                    <div className="font-semibold">
                      {preferredPaymentMethod ? paymentMethodLabel(preferredPaymentMethod) : 'Select payment method'}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => setOfferPaymentDialogOpen(true)}
                  >
                    Change
                  </Button>
                </div>
              </div>

              {note.trim() ? (
                <div className="rounded-lg border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Message</div>
                  <div className="text-sm whitespace-pre-line">{note.trim()}</div>
                </div>
              ) : null}

              <div className="text-xs text-muted-foreground">
                By selecting <span className="font-semibold text-foreground">Send offer</span>, you authorize Wildlife Exchange to charge your selected payment method if the seller accepts your offer.
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {step === 'review' ? (
              <>
                <Button variant="outline" onClick={() => setStep('edit')} disabled={loading}>
                  Edit offer
                </Button>
                <Button
                  onClick={submit}
                  disabled={loading || !preferredPaymentMethod}
                  className="font-semibold"
                >
                  {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Send offer
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setModalOpen(false)} disabled={loading}>
                  Cancel
                </Button>
                <Button onClick={continueToReview} disabled={loading} className="font-semibold">
                  Continue
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post-send confirmation (eBay-style) */}
      <Dialog open={offerSentOpen} onOpenChange={setOfferSentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Offer sent!</DialogTitle>
            <DialogDescription>
              We’ll notify you if the seller accepts, declines, or counters before your offer expires.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="font-semibold leading-snug">{listing.title}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Offer total:{' '}
              <span className="font-semibold text-foreground">
                ${Number(sentOfferAmount ?? 0).toLocaleString()}
              </span>
              {' '}· Expires in {expiryHours}h
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Changed your mind? You can{' '}
            <button
              type="button"
              className="underline underline-offset-4 text-foreground/90 hover:text-foreground"
              onClick={() => setRetractOpen(true)}
            >
              retract your offer
            </button>
            .
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/offers">View my offers</Link>
            </Button>
            <Button
              onClick={() => {
                setOfferSentOpen(false);
              }}
              className="font-semibold"
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retract offer dialog */}
      <Dialog open={retractOpen} onOpenChange={setRetractOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Retract offer</DialogTitle>
            <DialogDescription>
              Please remember that every Best Offer is binding. Retracted offers are counted toward your maximum available offers for this listing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/20 p-3">
              <div className="font-semibold leading-snug">{listing.title}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Listing ID: <span className="font-mono">{listing.id}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Your offer:{' '}
                <span className="font-semibold text-foreground">
                  ${Number(sentOfferAmount ?? offer?.currentAmount ?? 0).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              It’s OK to retract if you entered the wrong amount, the listing changed significantly, or you can’t reach the seller.
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">Reason for retraction</div>
              <Select value={retractReason} onValueChange={setRetractReason}>
                <SelectTrigger className="min-h-[48px]">
                  <SelectValue placeholder="Choose one" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Accidentally entered the wrong offer amount">Accidentally entered the wrong offer amount</SelectItem>
                  <SelectItem value="Listing description changed significantly">Listing description changed significantly</SelectItem>
                  <SelectItem value="Cannot get in touch with the seller">Cannot get in touch with the seller</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRetractOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button onClick={retractSentOffer} disabled={loading || !retractReason} className="font-semibold">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Retract offer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

