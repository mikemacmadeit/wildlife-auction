'use client';

import Link from 'next/link';
import { useCallback, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, CheckCircle, Clock, XCircle, Loader2, AlertTriangle, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getOrderByCheckoutSessionId, getOrdersForUser } from '@/lib/firebase/orders';
import { getListingById } from '@/lib/firebase/listings';
import { Order, OrderStatus } from '@/lib/types';
import { confirmReceipt, disputeOrder } from '@/lib/stripe/api';
import { TransactionTimeline } from '@/components/orders/TransactionTimeline';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface OrderWithListing extends Order {
  listingTitle?: string;
  listingType?: string;
}

type CheckoutReturnBanner =
  | { tone: 'success'; title: string; body: string }
  | { tone: 'info'; title: string; body: string }
  | { tone: 'warning'; title: string; body: string };

type PendingCheckout = {
  sessionId: string;
  listingId?: string | null;
  paymentStatus?: string | null;
  isProcessing?: boolean;
  createdAtMs: number;
};

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<OrderWithListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disputeDialogOpen, setDisputeDialogOpen] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeNotes, setDisputeNotes] = useState('');
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);
  const [checkoutBanner, setCheckoutBanner] = useState<CheckoutReturnBanner | null>(null);
  const [pendingCheckout, setPendingCheckout] = useState<PendingCheckout | null>(null);
  const [pendingCheckoutListingTitle, setPendingCheckoutListingTitle] = useState<string | null>(null);
  const [highlightOrderId, setHighlightOrderId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const userOrders = await getOrdersForUser(user.uid, 'buyer');

      const ordersWithListings = await Promise.all(
        userOrders.map(async (order) => {
          try {
            const listing = await getListingById(order.listingId);
            return {
              ...order,
              listingTitle: listing?.title || 'Listing not found',
              listingType: listing?.type || 'unknown',
            };
          } catch (err) {
            console.error(`Error fetching listing ${order.listingId}:`, err);
            return {
              ...order,
              listingTitle: 'Listing not found',
              listingType: 'unknown',
            };
          }
        })
      );

      setOrders(ordersWithListings);
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Stripe checkout redirect safety: verify session_id via server endpoint (never crash page).
  // Also: clean URL after showing the banner once (persist banner through the replace).
  useEffect(() => {
    if (!searchParams) return;
    const sessionId = (searchParams.get('session_id') || '').trim();
    const storageKey = 'we:checkout-return-banner:v1';

    // If we've already cleaned the URL, resurrect the banner for a short time.
    if (!sessionId) {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (!raw) return;
        const parsed = JSON.parse(raw) as any;
        if (!parsed?.banner || typeof parsed?.ts !== 'number') return;
        const ageMs = Date.now() - parsed.ts;
        if (ageMs > 60_000) {
          sessionStorage.removeItem(storageKey);
          return;
        }
        setCheckoutBanner(parsed.banner as CheckoutReturnBanner);
        sessionStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
      return;
    }

    let cancelled = false;
    async function run() {
      try {
        const res = await fetch(`/api/stripe/checkout/verify-session?session_id=${encodeURIComponent(sessionId)}`, {
          method: 'GET',
          headers: { 'content-type': 'application/json' },
        });
        const data = await res.json().catch(() => ({} as any));

        let banner: CheckoutReturnBanner;
        if (res.status === 400) {
          banner = {
            tone: 'warning',
            title: 'Checkout verification failed',
            body: 'The redirect contained an invalid session reference. You can safely refresh and your orders will load normally.',
          };
        } else if (data?.ok === true) {
          const paymentStatus = String(data?.session?.payment_status || '');
          const isProcessing = data?.isProcessing === true || paymentStatus === 'unpaid';
          banner = isProcessing
            ? {
                tone: 'info',
                title: 'Bank payment processing',
                body: 'Your bank payment is processing. Your order may take a little time to confirm. Check back shortly.',
              }
            : {
                tone: 'success',
                title: 'Payment confirmed',
                body: 'Payment confirmed. Your order will appear below shortly.',
              };

          // Track this session so we can poll for the corresponding Firestore order.
          const listingIdFromMeta = data?.session?.metadata?.listingId ? String(data.session.metadata.listingId) : null;
          setPendingCheckout({
            sessionId,
            listingId: listingIdFromMeta,
            paymentStatus,
            isProcessing,
            createdAtMs: Date.now(),
          });
        } else {
          const reason = String(data?.reason || '');
          banner =
            reason === 'mode_mismatch'
              ? {
                  tone: 'warning',
                  title: 'Checkout environment mismatch',
                  body: 'We could not verify this checkout session (test vs live mismatch). If needed, retry the purchase in the correct environment.',
                }
              : {
                  tone: 'warning',
                  title: 'Couldn’t verify checkout session',
                  body: 'We could not verify this checkout session. Your orders will still load normally. If the payment succeeded, it will appear shortly.',
                };
        }

        if (cancelled) return;
        setCheckoutBanner(banner);
        try {
          sessionStorage.setItem(storageKey, JSON.stringify({ ts: Date.now(), banner }));
        } catch {
          // ignore
        }
      } catch {
        if (cancelled) return;
        const banner: CheckoutReturnBanner = {
          tone: 'warning',
          title: 'Checkout verification unavailable',
          body: 'We could not verify your checkout session right now. Your orders will still load normally.',
        };
        setCheckoutBanner(banner);
        try {
          sessionStorage.setItem(storageKey, JSON.stringify({ ts: Date.now(), banner }));
        } catch {
          // ignore
        }
      } finally {
        // Clean URL after we’ve captured a banner state.
        if (!cancelled) router.replace('/dashboard/orders');
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  // Fetch orders when user is loaded
  useEffect(() => {
    if (!authLoading) {
      void loadOrders();
    }
  }, [authLoading, loadOrders]);

  // If we have a pending checkout session, try to resolve it into a real order (webhook-driven).
  // This prevents the “I paid and nothing showed up” moment.
  useEffect(() => {
    let cancelled = false;
    if (!user?.uid) return;
    if (!pendingCheckout?.sessionId) return;

    // Best-effort: fetch listing title for the pending row.
    async function hydrateListingTitle() {
      const lid = pendingCheckout?.listingId;
      if (!lid) return;
      try {
        const listing = await getListingById(lid);
        if (!cancelled) setPendingCheckoutListingTitle(listing?.title || 'Recent purchase');
      } catch {
        // ignore
      }
    }
    void hydrateListingTitle();

    const startedAt = Date.now();
    const maxMs = 90_000;
    const intervalMs = 3000;
    const sessionId = pendingCheckout.sessionId;

    async function tick() {
      try {
        const order = await getOrderByCheckoutSessionId(sessionId);
        if (cancelled) return;
        if (order?.id) {
          // Found it. Refresh list and highlight the new order.
          await loadOrders();
          setHighlightOrderId(order.id);
          setPendingCheckout(null);
          setPendingCheckoutListingTitle(null);
          try {
            window.setTimeout(() => setHighlightOrderId(null), 12_000);
          } catch {
            // ignore
          }
          return;
        }
      } catch {
        // If this query fails (rules/transient), still keep polling loadOrders; it may show up anyway.
      }
      await loadOrders();
    }

    const handle = window.setInterval(() => {
      if (Date.now() - startedAt > maxMs) {
        window.clearInterval(handle);
        return;
      }
      void tick();
    }, intervalMs);

    // Run once immediately.
    void tick();

    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [loadOrders, pendingCheckout, user?.uid]);

  const handleConfirmReceipt = async (orderId: string) => {
    if (!user) return;
    
    try {
      setProcessingOrderId(orderId);
      await confirmReceipt(orderId);
      toast({
        title: 'Receipt confirmed',
        description: 'Confirm only after you have received the animal/equipment. Funds remain held until admin release.',
      });
      // Refresh orders
      const userOrders = await getOrdersForUser(user.uid, 'buyer');
      const ordersWithListings = await Promise.all(
        userOrders.map(async (order) => {
          try {
            const listing = await getListingById(order.listingId);
            return {
              ...order,
              listingTitle: listing?.title || 'Listing not found',
              listingType: listing?.type || 'unknown',
            };
          } catch (err) {
            return {
              ...order,
              listingTitle: 'Listing not found',
              listingType: 'unknown',
            };
          }
        })
      );
      setOrders(ordersWithListings);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to accept order',
        variant: 'destructive',
      });
    } finally {
      setProcessingOrderId(null);
    }
  };

  const handleOpenDispute = (orderId: string) => {
    setDisputeDialogOpen(orderId);
    setDisputeReason('');
    setDisputeNotes('');
  };

  const handleSubmitDispute = async () => {
    if (!disputeDialogOpen || !disputeReason.trim() || !user) return;

    try {
      setProcessingOrderId(disputeDialogOpen);
      await disputeOrder(disputeDialogOpen, disputeReason.trim(), disputeNotes.trim() || undefined);
      toast({
        title: 'Dispute opened',
        description: 'Your dispute has been submitted. Admin will review and resolve.',
      });
      setDisputeDialogOpen(null);
      setDisputeReason('');
      setDisputeNotes('');
      // Refresh orders
      const userOrders = await getOrdersForUser(user.uid, 'buyer');
      const ordersWithListings = await Promise.all(
        userOrders.map(async (order) => {
          try {
            const listing = await getListingById(order.listingId);
            return {
              ...order,
              listingTitle: listing?.title || 'Listing not found',
              listingType: listing?.type || 'unknown',
            };
          } catch (err) {
            return {
              ...order,
              listingTitle: 'Listing not found',
              listingType: 'unknown',
            };
          }
        })
      );
      setOrders(ordersWithListings);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to open dispute',
        variant: 'destructive',
      });
    } finally {
      setProcessingOrderId(null);
    }
  };

  const canAcceptOrDispute = (order: Order): boolean => {
    const status = order.status as OrderStatus;
    return ['paid', 'paid_held', 'in_transit', 'delivered'].includes(status) && !order.stripeTransferId;
  };

  const isDisputeDeadlinePassed = (order: Order): boolean => {
    if (!order.disputeDeadlineAt) return false;
    const d: any = (order as any).disputeDeadlineAt;
    const ms =
      d?.getTime?.() ? d.getTime() : typeof d?.toDate === 'function' ? d.toDate().getTime() : typeof d?.seconds === 'number' ? d.seconds * 1000 : null;
    return typeof ms === 'number' ? ms < Date.now() : false;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-accent" />;
      case 'accepted':
      case 'buyer_confirmed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'delivered':
        return <Package className="h-5 w-5 text-blue-600" />;
      case 'in_transit':
        return <Clock className="h-5 w-5 text-blue-500" />;
      case 'paid':
      case 'paid_held':
        return <Clock className="h-5 w-5 text-orange-500" />;
      case 'awaiting_bank_transfer':
      case 'awaiting_wire':
        return <Clock className="h-5 w-5 text-orange-500" />;
      case 'disputed':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-muted-foreground" />;
      case 'cancelled':
      case 'refunded':
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <Package className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-accent text-accent-foreground">Completed</Badge>;
      case 'accepted':
      case 'buyer_confirmed':
        return <Badge variant="default" className="bg-green-600 text-white">Buyer Confirmed</Badge>;
      case 'delivered':
        return <Badge variant="default" className="bg-blue-600 text-white">Delivered</Badge>;
      case 'in_transit':
        return <Badge variant="default" className="bg-blue-500 text-white">In Transit</Badge>;
      case 'paid':
      case 'paid_held':
        return <Badge variant="default" className="bg-orange-500 text-white">Paid (Held)</Badge>;
      case 'awaiting_bank_transfer':
        return <Badge variant="default" className="bg-orange-500 text-white">Awaiting Bank Transfer</Badge>;
      case 'awaiting_wire':
        return <Badge variant="default" className="bg-orange-500 text-white">Awaiting Wire</Badge>;
      case 'disputed':
        return <Badge variant="destructive">Disputed</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'cancelled':
      case 'refunded':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">Loading orders...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6">
        <div className="container mx-auto px-4 py-6">
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <XCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
              <h3 className="text-lg font-semibold mb-2">Error loading orders</h3>
              <p className="text-sm text-muted-foreground">{error}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6">
        <div className="container mx-auto px-4 py-6">
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Please sign in</h3>
              <p className="text-sm text-muted-foreground">You must be signed in to view your orders</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 space-y-6 max-w-6xl">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">My Purchases</h1>
          <p className="text-muted-foreground">View your purchase history</p>
        </div>

        {checkoutBanner ? (
          <Card
            className={
              checkoutBanner.tone === 'success'
                ? 'border-green-500/30 bg-green-500/5'
                : checkoutBanner.tone === 'info'
                  ? 'border-blue-500/30 bg-blue-500/5'
                  : 'border-orange-500/30 bg-orange-500/5'
            }
          >
            <CardContent className="p-4">
              <div className="font-semibold">{checkoutBanner.title}</div>
              <div className="text-sm text-muted-foreground mt-1">{checkoutBanner.body}</div>
            </CardContent>
          </Card>
        ) : null}

        {pendingCheckout ? (
          <Card className="border-border/60 bg-gradient-to-br from-card via-card to-muted/20">
            <CardContent className="p-4 md:p-5 space-y-2">
              <div className="font-extrabold text-base md:text-lg leading-tight">
                {pendingCheckoutListingTitle || 'Recent purchase'}
              </div>
              <div className="text-sm text-muted-foreground">
                {pendingCheckout.isProcessing
                  ? 'Bank payment processing — your order will appear as soon as it’s confirmed.'
                  : 'Finalizing your order — it will appear as soon as we receive confirmation.'}
              </div>
              <div className="text-xs text-muted-foreground">
                Session: <span className="font-mono">{pendingCheckout.sessionId.slice(0, 18)}…</span>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Unified: Polished order tiles (timeline always visible) - stacked list */}
        <div className="flex flex-col gap-4" data-tour="orders-list">
          {orders.map((order) => (
            <Card
              key={order.id}
              className={order.id === highlightOrderId
                ? 'border-primary/50 ring-2 ring-primary/30 bg-gradient-to-br from-card via-card to-muted/20'
                : 'border-border/60 bg-gradient-to-br from-card via-card to-muted/20'}
            >
              <CardContent className="p-4 md:p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/dashboard/orders/${order.id}`}
                        className="font-extrabold text-base md:text-lg leading-tight hover:underline truncate"
                        title={order.listingTitle || 'Order'}
                      >
                        {order.listingTitle || 'Unknown listing'}
                      </Link>
                      {getStatusBadge(order.status)}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                      <span className="capitalize">{order.listingType || 'unknown'}</span>
                      <span className="text-muted-foreground/60">•</span>
                      <span>{order.createdAt.toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="shrink-0">{getStatusIcon(order.status)}</div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/50 bg-background/40 p-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</div>
                    <div className="text-lg font-extrabold mt-1">${order.amount.toLocaleString()}</div>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-background/40 p-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Order</div>
                    <div className="text-sm font-semibold mt-1 truncate" title={order.id}>
                      #{order.id.slice(0, 8)}
                    </div>
                  </div>
                </div>

                {order.status === 'disputed' && order.disputeReason && (
                  <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded-xl">
                    <div className="font-semibold">Dispute opened</div>
                    <div className="text-xs mt-1">Reason: {order.disputeReason}</div>
                  </div>
                )}

                <TransactionTimeline
                  order={order}
                  role="buyer"
                  dense
                  showTitle={false}
                  variant="rail"
                  className="border border-border/50 bg-background/40"
                />

                <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
                  <div className="flex gap-2">
                    {canAcceptOrDispute(order) && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleConfirmReceipt(order.id)}
                          disabled={processingOrderId === order.id}
                          className="font-semibold"
                        >
                          {processingOrderId === order.id ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4 mr-2" />
                          )}
                          Accept
                        </Button>
                        {!isDisputeDeadlinePassed(order) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenDispute(order.id)}
                            disabled={processingOrderId === order.id}
                            className="font-semibold"
                          >
                            <AlertTriangle className="h-4 w-4 mr-2" />
                            Dispute
                          </Button>
                        )}
                      </>
                    )}
                  </div>

                  <Button asChild size="sm" variant="ghost" className="font-semibold">
                    <Link href={`/dashboard/orders/${order.id}`}>
                      View order <ArrowRight className="h-4 w-4 ml-1" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {orders.length === 0 && (
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
              <p className="text-sm text-muted-foreground">
                Start browsing to find your perfect listing
              </p>
            </CardContent>
          </Card>
        )}

        {/* Dispute Dialog */}
        <Dialog open={!!disputeDialogOpen} onOpenChange={(open) => !open && setDisputeDialogOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Open Dispute</DialogTitle>
              <DialogDescription>
                Report a problem with this order. Admin will review and resolve the dispute.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="dispute-reason">Reason *</Label>
                <Input
                  id="dispute-reason"
                  placeholder="e.g., Item not received, Item damaged, Wrong item"
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="dispute-notes">Additional Details (Optional)</Label>
                <Textarea
                  id="dispute-notes"
                  placeholder="Provide more information about the issue..."
                  value={disputeNotes}
                  onChange={(e) => setDisputeNotes(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDisputeDialogOpen(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitDispute}
                disabled={!disputeReason.trim() || processingOrderId !== null}
              >
                {processingOrderId ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Dispute'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
