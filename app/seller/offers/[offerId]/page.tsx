'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SellerContentSkeleton } from '@/components/skeletons/SellerContentSkeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, ArrowLeft, CheckCircle2, XCircle, Handshake, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getOffer, acceptOffer, counterOffer, declineOffer } from '@/lib/offers/api';
import { OfferAcceptedSuccessModal } from '@/components/offers/OfferAcceptedSuccessModal';

type OfferDTO = {
  offerId: string;
  listingId: string;
  listingSnapshot?: { title?: string; type?: string; category?: string };
  status: string;
  currentAmount: number;
  acceptedAmount?: number;
  lastActorRole?: string;
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

export default function SellerOfferDetailPage() {
  const params = useParams<{ offerId: string }>();
  const router = useRouter();
  const offerId = typeof params?.offerId === 'string' ? params.offerId : '';
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [offer, setOffer] = useState<OfferDTO | null>(null);
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterAmount, setCounterAmount] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [acceptSuccessOpen, setAcceptSuccessOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await getOffer(offerId);
      setOffer(res?.offer as OfferDTO);
    } catch (e: any) {
      toast({ title: 'Failed to load offer', description: e?.message || 'Please try again.', variant: 'destructive' });
      setOffer(null);
    } finally {
      setLoading(false);
    }
  }, [offerId, toast, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    load();
  }, [authLoading, load, user]);

  const canAct = useMemo(() => offer?.status === 'open' || offer?.status === 'countered', [offer?.status]);

  const accept = async () => {
    if (!offer) return;
    setActionLoading(true);
    try {
      await acceptOffer(offer.offerId);
      await load();
      setAcceptSuccessOpen(true);
    } catch (e: any) {
      toast({ title: 'Accept failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const decline = async () => {
    if (!offer) return;
    setActionLoading(true);
    try {
      await declineOffer(offer.offerId);
      toast({ title: 'Declined', description: 'Offer declined.' });
      await load();
    } catch (e: any) {
      toast({ title: 'Decline failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const submitCounter = async () => {
    if (!offer) return;
    const n = Number(counterAmount);
    if (!Number.isFinite(n) || n <= 0) {
      toast({ title: 'Invalid amount', description: 'Enter a valid amount.', variant: 'destructive' });
      return;
    }
    setActionLoading(true);
    try {
      await counterOffer(offer.offerId, n);
      toast({ title: 'Counter sent', description: 'Your counter offer was sent to the buyer.' });
      setCounterOpen(false);
      setCounterAmount('');
      await load();
    } catch (e: any) {
      toast({ title: 'Counter failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  if (authLoading) {
    return <SellerContentSkeleton className="min-h-[60vh]" />;
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">You must be signed in to view this offer.</p>
            <Button asChild className="w-full">
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
        <Button variant="outline" onClick={() => router.push('/dashboard/bids-offers?tab=offers')} className="min-h-[40px]">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      {loading || !offer ? (
        <Card>
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

              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="text-sm font-semibold mb-2">Offer history</div>
                <div className="space-y-2">
                  {(offer.history || []).slice().reverse().map((h, idx) => (
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
              {!canAct ? (
                <div className="text-sm text-muted-foreground">No actions available for this offer.</div>
              ) : (
                <>
                  <Button onClick={accept} disabled={actionLoading} className="w-full min-h-[44px] font-semibold">
                    {actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    Accept
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setCounterOpen(true)}
                    disabled={actionLoading}
                    className="w-full min-h-[44px] font-semibold"
                  >
                    Counter
                  </Button>
                  <Button
                    variant="outline"
                    onClick={decline}
                    disabled={actionLoading}
                    className="w-full min-h-[44px] font-semibold"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Decline
                  </Button>
                  <div className="text-xs text-muted-foreground">
                    Buyer identity stays private until payment.
                  </div>
                </>
              )}
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

      <OfferAcceptedSuccessModal
        open={acceptSuccessOpen}
        onOpenChange={setAcceptSuccessOpen}
        role="seller"
        listingTitle={offer?.listingSnapshot?.title}
        amount={offer?.currentAmount ?? offer?.acceptedAmount}
        offerId={offer?.offerId}
        listingId={offer?.listingId}
      />
    </div>
  );
}

