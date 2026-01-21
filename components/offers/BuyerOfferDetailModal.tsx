'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { acceptOffer, counterOffer, declineOffer, getOffer, withdrawOffer } from '@/lib/offers/api';
import { Loader2, Handshake, Clock, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import Image from 'next/image';

type OfferDTO = {
  offerId: string;
  listingId: string;
  listingSnapshot?: { title?: string };
  listingImageUrl?: string;
  status: string;
  currentAmount: number;
  acceptedAmount?: number;
  lastActorRole?: 'buyer' | 'seller' | 'system';
  expiresAt?: number | null;
  history?: Array<{ type: string; actorRole: string; amount?: number; note?: string; createdAt?: number | null }>;
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

export function BuyerOfferDetailModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offerId: string | null;
  onDidMutate?: () => void;
}) {
  const { open, onOpenChange, offerId, onDidMutate } = props;
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [offer, setOffer] = useState<OfferDTO | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [counterOpen, setCounterOpen] = useState(false);
  const [counterAmount, setCounterAmount] = useState('');

  const load = useCallback(async () => {
    if (!user?.uid) return;
    if (!offerId) return;
    setLoading(true);
    try {
      const res = await getOffer(String(offerId));
      setOffer(res?.offer as OfferDTO);
    } catch (e: any) {
      toast({ title: 'Failed to load offer', description: e?.message || 'Please try again.', variant: 'destructive' });
      setOffer(null);
    } finally {
      setLoading(false);
    }
  }, [offerId, toast, user?.uid]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    setOffer(null);
    setCounterOpen(false);
    setCounterAmount('');
  }, [offerId]);

  const canWithdraw = useMemo(() => offer?.status === 'open' || offer?.status === 'countered', [offer?.status]);
  const canRespondToCounter = useMemo(
    () => offer?.status === 'countered' && offer?.lastActorRole === 'seller',
    [offer?.status, offer?.lastActorRole]
  );
  const canCheckout = useMemo(() => offer?.status === 'accepted', [offer?.status]);

  const checkout = async () => {
    if (!offer?.listingId) return;
    // Listing page owns buyer-ack flow (animal categories) and then routes into checkout.
    router.push(`/listing/${offer.listingId}`);
  };

  const doWithdraw = async () => {
    if (!offer?.offerId) return;
    setActionLoading(true);
    try {
      await withdrawOffer(String(offer.offerId));
      toast({ title: 'Offer withdrawn' });
      await load();
      onDidMutate?.();
    } catch (e: any) {
      toast({ title: 'Action failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const doAccept = async () => {
    if (!offer?.offerId) return;
    setActionLoading(true);
    try {
      await acceptOffer(String(offer.offerId));
      toast({ title: 'Accepted', description: 'You accepted the counter offer.' });
      await load();
      onDidMutate?.();
    } catch (e: any) {
      toast({ title: 'Action failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const doDecline = async () => {
    if (!offer?.offerId) return;
    setActionLoading(true);
    try {
      await declineOffer(String(offer.offerId));
      toast({ title: 'Declined', description: 'Offer declined.' });
      await load();
      onDidMutate?.();
    } catch (e: any) {
      toast({ title: 'Action failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const submitCounter = async () => {
    if (!offer?.offerId) return;
    const amount = Number(counterAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: 'Invalid amount', description: 'Enter a valid counter amount.', variant: 'destructive' });
      return;
    }
    setActionLoading(true);
    try {
      await counterOffer(String(offer.offerId), amount);
      toast({ title: 'Counter sent' });
      setCounterOpen(false);
      setCounterAmount('');
      await load();
      onDidMutate?.();
    } catch (e: any) {
      toast({ title: 'Action failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Handshake className="h-5 w-5 text-primary" />
              Offer details
            </DialogTitle>
            <DialogDescription>Review and respond without leaving your offers inbox.</DialogDescription>
          </DialogHeader>

          {loading || !offer ? (
            <div className="py-10 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading offer…
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
              <Card className="border-2">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative h-10 w-10 overflow-hidden rounded-md border bg-muted/20 shrink-0">
                        {offer.listingImageUrl ? <Image src={offer.listingImageUrl} alt="" fill className="object-cover" /> : null}
                      </div>
                      <span className="min-w-0 truncate">Offer on {offer.listingSnapshot?.title || 'Listing'}</span>
                    </div>
                    <Button asChild variant="outline" size="sm" className="shrink-0">
                      <Link href={`/listing/${offer.listingId}`}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Listing
                      </Link>
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      Status: {offer.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      Current: ${Number(offer.currentAmount).toLocaleString()}
                    </Badge>
                    <Badge variant="outline" className="text-xs flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTimeLeft(offer.expiresAt)}
                    </Badge>
                  </div>

                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="text-sm font-semibold mb-2">Offer history</div>
                    <div className="space-y-2">
                      {(offer.history || [])
                        .slice()
                        .reverse()
                        .map((h, idx) => (
                          <div key={idx} className="text-sm flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <span className="font-semibold capitalize">{h.type}</span>{' '}
                              <span className="text-muted-foreground">by {h.actorRole}</span>
                              {typeof h.amount === 'number' ? (
                                <span className="ml-2 font-semibold">${Number(h.amount).toLocaleString()}</span>
                              ) : null}
                              {h.note ? <div className="text-xs text-muted-foreground mt-0.5">{h.note}</div> : null}
                            </div>
                            <div className="text-xs text-muted-foreground shrink-0">
                              {h.createdAt ? new Date(h.createdAt).toLocaleString() : ''}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2">
                <CardHeader>
                  <CardTitle>Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {canCheckout ? (
                    <Button onClick={checkout} disabled={actionLoading} className="w-full min-h-[44px] font-semibold">
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Checkout at ${(offer.acceptedAmount ?? offer.currentAmount).toLocaleString()}
                    </Button>
                  ) : null}

                  {canRespondToCounter ? (
                    <>
                      <Button onClick={doAccept} disabled={actionLoading} className="w-full min-h-[44px] font-semibold">
                        {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Accept
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setCounterAmount(String(offer.currentAmount));
                          setCounterOpen(true);
                        }}
                        disabled={actionLoading}
                        className="w-full min-h-[44px] font-semibold"
                      >
                        Counter
                      </Button>
                      <Button
                        variant="outline"
                        onClick={doDecline}
                        disabled={actionLoading}
                        className="w-full min-h-[44px] font-semibold"
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Decline
                      </Button>
                    </>
                  ) : null}

                  {canWithdraw ? (
                    <Button variant="outline" onClick={doWithdraw} disabled={actionLoading} className="w-full min-h-[44px]">
                      Withdraw
                    </Button>
                  ) : null}

                  {!canCheckout && !canRespondToCounter && !canWithdraw ? (
                    <div className="text-sm text-muted-foreground">No actions available for this offer.</div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={counterOpen} onOpenChange={setCounterOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Counter offer</DialogTitle>
            <DialogDescription>Send a new amount. Expiry resets on counter.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div className="text-sm font-semibold">Amount</div>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              value={counterAmount}
              onChange={(e) => setCounterAmount(e.target.value)}
              className="min-h-[48px]"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCounterOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button onClick={submitCounter} disabled={actionLoading} className="font-semibold">
              {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Send counter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

