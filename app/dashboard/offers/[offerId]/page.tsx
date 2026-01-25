'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, Handshake, Clock, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { acceptOffer, counterOffer, declineOffer, getOffer, withdrawOffer } from '@/lib/offers/api';
import { createCheckoutSession } from '@/lib/stripe/api';

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

  const load = async () => {
    if (!offerId) return;
    setLoading(true);
    try {
      const res = await getOffer(String(offerId));
      setOffer(res?.offer || null);
    } catch (e: any) {
      toast({ title: 'Failed to load offer', description: e?.message || 'Please try again.', variant: 'destructive' });
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

  // Only allow withdrawal for open or countered offers (not accepted)
  const canWithdraw = useMemo(
    () => (offer?.status === 'open' || offer?.status === 'countered') && offer?.status !== 'accepted',
    [offer?.status]
  );
  // Only allow responding to counter if offer is countered (not accepted)
  const canRespondToCounter = useMemo(
    () => offer?.status === 'countered' && offer?.lastActorRole === 'seller' && offer?.status !== 'accepted',
    [offer?.status, offer?.lastActorRole]
  );
  // Checkout is available when offer is accepted
  const canCheckout = useMemo(() => offer?.status === 'accepted', [offer?.status]);

  const doAccept = async () => {
    if (!offerId) return;
    setActionLoading(true);
    try {
      await acceptOffer(String(offerId));
      toast({ title: 'Offer accepted', description: 'You accepted the counter offer.' });
      await load();
    } catch (e: any) {
      toast({ title: 'Action failed', description: e?.message || 'Please try again.', variant: 'destructive' });
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
      toast({ title: 'Action failed', description: e?.message || 'Please try again.', variant: 'destructive' });
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
      toast({ title: 'Action failed', description: e?.message || 'Please try again.', variant: 'destructive' });
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
      toast({ title: 'Action failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const checkout = async () => {
    if (!offerId) return;
    if (!offer?.listingId) return;
    try {
      // Checkout requires a buyer acknowledgment for animal categories (server-enforced).
      // Use the listing page flow to present the acknowledgment and start checkout safely.
      router.push(`/listing/${offer.listingId}`);
    } catch (e: any) {
      toast({ title: 'Checkout failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    }
  };

  if (!user && !authLoading) {
    return (
      <div className="container mx-auto px-4 md:px-6 py-8">
        <Card className="border-2">
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
    <div className="container mx-auto px-4 md:px-6 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={() => router.push('/dashboard/offers')} className="min-h-[40px]">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      {loading || !offer ? (
        <Card className="border-2">
          <CardContent className="py-10 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Handshake className="h-5 w-5 text-primary" />
                Offer on {offer.listingSnapshot?.title || 'Listing'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-xs">Status: {offer.status}</Badge>
                <Badge variant="outline" className="text-xs">Current: ${Number(offer.currentAmount).toLocaleString()}</Badge>
                <Badge variant="outline" className="text-xs flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatTimeLeft(offer.expiresAt)}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" className="min-h-[40px]">
                  <Link href={`/listing/${offer.listingId}`}>View listing</Link>
                </Button>
              </div>

              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="text-sm font-semibold mb-2">Offer history</div>
                <div className="space-y-2">
                  {(offer.history || []).slice().reverse().map((h: any, idx: number) => (
                    <div key={idx} className="text-sm flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-semibold capitalize">{h.type}</span>{' '}
                        <span className="text-muted-foreground">by {h.actorRole}</span>
                        {typeof h.amount === 'number' && (
                          <span className="ml-2 font-semibold">${Number(h.amount).toLocaleString()}</span>
                        )}
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
                  <Button variant="outline" onClick={doDecline} disabled={actionLoading} className="w-full min-h-[44px] font-semibold">
                    <XCircle className="h-4 w-4 mr-2" />
                    Decline
                  </Button>
                </>
              ) : null}

              {canWithdraw ? (
                <Button variant="outline" onClick={doWithdraw} disabled={actionLoading} className="w-full min-h-[44px] font-semibold">
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
              placeholder={offer ? String(offer.currentAmount) : '0'}
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
    </div>
  );
}

