'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, Handshake, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getMyOffers, acceptOffer, counterOffer, declineOffer, withdrawOffer } from '@/lib/offers/api';
import { createCheckoutSession } from '@/lib/stripe/api';

type OfferRow = {
  offerId: string;
  listingId: string;
  listingSnapshot?: { title?: string };
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

export default function MyOffersPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState<'open' | 'countered' | 'accepted' | 'declined' | 'expired'>('open');
  const [loading, setLoading] = useState(false);
  const [offers, setOffers] = useState<OfferRow[]>([]);

  const [counterOfferId, setCounterOfferId] = useState<string | null>(null);
  const [counterAmount, setCounterAmount] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await getMyOffers({ status: tab, limit: 100 });
      setOffers((res?.offers || []) as OfferRow[]);
    } catch (e: any) {
      toast({ title: 'Failed to load offers', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [tab, toast, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    load();
  }, [authLoading, load, user]);

  const emptyCopy = useMemo(() => {
    if (tab === 'open') return 'No open offers right now.';
    if (tab === 'countered') return 'No countered offers right now.';
    if (tab === 'accepted') return 'No accepted offers right now.';
    if (tab === 'declined') return 'No declined offers right now.';
    return 'No expired offers right now.';
  }, [tab]);

  const checkout = async (o: OfferRow) => {
    setActionLoading(true);
    try {
      const { url } = await createCheckoutSession(o.listingId, o.offerId);
      window.location.href = url;
    } catch (e: any) {
      toast({ title: 'Checkout failed', description: e?.message || 'Please try again.', variant: 'destructive' });
      setActionLoading(false);
    }
  };

  const accept = async (offerId: string) => {
    setActionLoading(true);
    try {
      await acceptOffer(offerId);
      toast({ title: 'Accepted', description: 'Offer accepted.' });
      await load();
    } catch (e: any) {
      toast({ title: 'Accept failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const decline = async (offerId: string) => {
    setActionLoading(true);
    try {
      await declineOffer(offerId);
      toast({ title: 'Declined', description: 'You declined the counter.' });
      await load();
    } catch (e: any) {
      toast({ title: 'Decline failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const withdraw = async (offerId: string) => {
    setActionLoading(true);
    try {
      await withdrawOffer(offerId);
      toast({ title: 'Withdrawn', description: 'Offer withdrawn.' });
      await load();
    } catch (e: any) {
      toast({ title: 'Withdraw failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  const submitCounter = async () => {
    if (!counterOfferId) return;
    const n = Number(counterAmount);
    if (!Number.isFinite(n) || n <= 0) {
      toast({ title: 'Invalid amount', description: 'Enter a valid amount.', variant: 'destructive' });
      return;
    }
    setActionLoading(true);
    try {
      await counterOffer(counterOfferId, n);
      toast({ title: 'Counter sent', description: 'Your counter was sent to the seller.' });
      setCounterOfferId(null);
      setCounterAmount('');
      await load();
    } catch (e: any) {
      toast({ title: 'Counter failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setActionLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">You must be signed in to view your offers.</p>
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
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Handshake className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-extrabold tracking-tight">My Offers</h1>
          </div>
          <p className="text-sm text-muted-foreground">Track offers you’ve made and respond to counters.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading || actionLoading} className="min-h-[40px]">
          {(loading || actionLoading) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Refresh
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full sm:w-auto">
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="countered">Countered</TabsTrigger>
          <TabsTrigger value="accepted">Accepted</TabsTrigger>
          <TabsTrigger value="declined">Declined</TabsTrigger>
          <TabsTrigger value="expired">Expired</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card className="border-2">
            <CardContent className="pt-6">
              {loading ? (
                <div className="py-10 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : offers.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">{emptyCopy}</div>
              ) : (
                <div className="divide-y">
                  {offers.map((o) => {
                    const canWithdraw = o.status === 'open' || o.status === 'countered';
                    const canRespondToCounter = o.status === 'countered' && o.lastActorRole === 'seller';
                    const canCheckout = o.status === 'accepted';
                    return (
                      <div
                        key={o.offerId}
                        className="py-4 px-2 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={(e) => {
                          const el = e.target as HTMLElement | null;
                          if (el?.closest('button, a, input, textarea, select')) return;
                          router.push(`/dashboard/offers/${o.offerId}`);
                        }}
                      >
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold truncate">
                              <Link href={`/dashboard/offers/${o.offerId}`} className="hover:underline">
                                {o.listingSnapshot?.title || 'Listing'}
                              </Link>
                            </div>
                            <div className="text-xs text-muted-foreground">Offer #{o.offerId.slice(0, 8)}</div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="text-xs">{o.status}</Badge>
                            <Badge variant="outline" className="text-xs">${Number(o.currentAmount).toLocaleString()}</Badge>
                            <Badge variant="outline" className="text-xs flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatTimeLeft(o.expiresAt)}
                            </Badge>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-col sm:flex-row gap-2">
                          <Button variant="outline" onClick={() => router.push(`/listing/${o.listingId}`)} className="min-h-[40px]">
                            View listing
                          </Button>
                          <Button variant="outline" onClick={() => router.push(`/dashboard/offers/${o.offerId}`)} className="min-h-[40px]">
                            View offer
                          </Button>

                          {canCheckout && (
                            <Button onClick={() => checkout(o)} disabled={actionLoading} className="min-h-[40px] font-semibold">
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Checkout at ${(o.acceptedAmount ?? o.currentAmount).toLocaleString()}
                            </Button>
                          )}

                          {canRespondToCounter && (
                            <>
                              <Button onClick={() => accept(o.offerId)} disabled={actionLoading} className="min-h-[40px] font-semibold">
                                Accept
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  setCounterOfferId(o.offerId);
                                  setCounterAmount(String(o.currentAmount));
                                }}
                                disabled={actionLoading}
                                className="min-h-[40px] font-semibold"
                              >
                                Counter
                              </Button>
                              <Button variant="outline" onClick={() => decline(o.offerId)} disabled={actionLoading} className="min-h-[40px] font-semibold">
                                <XCircle className="h-4 w-4 mr-2" />
                                Decline
                              </Button>
                            </>
                          )}

                          {canWithdraw && (
                            <Button variant="outline" onClick={() => withdraw(o.offerId)} disabled={actionLoading} className="min-h-[40px]">
                              Withdraw
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={counterOfferId !== null} onOpenChange={(v) => !v && setCounterOfferId(null)}>
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
            <Button variant="outline" onClick={() => setCounterOfferId(null)} disabled={actionLoading}>
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

