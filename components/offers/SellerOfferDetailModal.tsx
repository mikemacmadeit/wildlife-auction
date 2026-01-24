'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, XCircle, Handshake, Clock, ExternalLink } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getOffer, acceptOffer, counterOffer, declineOffer } from '@/lib/offers/api';
import { SafeImage } from '@/components/shared/SafeImage';

type OfferDTO = {
  offerId: string;
  listingId: string;
  listingSnapshot?: { title?: string; type?: string; category?: string };
  listingImageUrl?: string;
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

export function SellerOfferDetailModal(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offerId: string | null;
}) {
  const { open, onOpenChange, offerId } = props;
  const { user } = useAuth();
  const { toast } = useToast();

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

  // Reset state when switching offers
  useEffect(() => {
    setOffer(null);
    setCounterOpen(false);
    setCounterAmount('');
  }, [offerId]);

  const canAct = useMemo(() => offer?.status === 'open' || offer?.status === 'countered', [offer?.status]);

  const accept = async () => {
    if (!offer) return;
    setActionLoading(true);
    try {
      await acceptOffer(offer.offerId);
      toast({ title: 'Accepted', description: 'Offer accepted and listing reserved.' });
      await load();
      // Close modal after accepting on mobile for better UX
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setTimeout(() => {
          onOpenChange(false);
        }, 500);
      }
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Handshake className="h-5 w-5 text-primary" />
              Offer details
            </DialogTitle>
            <DialogDescription>Review and respond to this offer without leaving the inbox.</DialogDescription>
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
                        {offer.listingImageUrl ? <SafeImage src={offer.listingImageUrl} alt="" fill className="object-cover" /> : null}
                      </div>
                      <span className="min-w-0 truncate">Offer on {offer.listingSnapshot?.title || 'Listing'}</span>
                    </div>
                    <Button asChild variant="outline" size="sm" className="shrink-0">
                      <Link href={`/seller/offers/${offer.offerId}`}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open page
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
                        {actionLoading ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                        )}
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
                      <div className="text-xs text-muted-foreground">Buyer identity stays private until payment.</div>
                    </>
                  )}
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

      {/* Counter modal (nested) */}
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
    </>
  );
}

