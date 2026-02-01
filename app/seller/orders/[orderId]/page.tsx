/**
 * Seller Order Detail (read-only + seller delivery actions)
 *
 * Phase 2A: Shared TransactionTimeline for seller view.
 * Phase 2C: Seller will be able to mark in-transit (route added separately) and delivered (existing).
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, AlertTriangle, ArrowLeft, Truck, Package, Calendar, MapPin, Clock, CheckCircle2 } from 'lucide-react';
import type { ComplianceDocument, Listing, Order, TransactionStatus } from '@/lib/types';
import { getOrderById, subscribeToOrder } from '@/lib/firebase/orders';
import { getListingById } from '@/lib/firebase/listings';
import { getDocuments } from '@/lib/firebase/documents';
import { DocumentUpload } from '@/components/compliance/DocumentUpload';
import { OrderDocumentsPanel } from '@/components/orders/OrderDocumentsPanel';
import { NextActionBanner } from '@/components/orders/NextActionBanner';
import { DeliveryTrackingCard } from '@/components/orders/DeliveryTrackingCard';
import { ComplianceTransferPanel } from '@/components/orders/ComplianceTransferPanel';
import { OrderMilestoneTimeline } from '@/components/orders/OrderMilestoneTimeline';
import { getNextRequiredAction } from '@/lib/orders/progress';
import { getOrderIssueState } from '@/lib/orders/getOrderIssueState';
import { getOrderTrustState } from '@/lib/orders/getOrderTrustState';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import { ORDER_COPY } from '@/lib/orders/copy';
import { formatDate } from '@/lib/utils';
import { formatUserFacingError } from '@/lib/format-user-facing-error';
import { OrderDetailSkeleton } from '@/components/skeletons/OrderDetailSkeleton';

async function postAuthJson(path: string, body?: any): Promise<any> {
  const { auth } = await import('@/lib/firebase/config');
  const user = auth.currentUser;
  if (!user) throw new Error('Authentication required');
  const token = await user.getIdToken();
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || json?.error || 'Request failed');
  return json;
}

export default function SellerOrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const orderId = params?.orderId;
  const fromSales = searchParams?.get('from') === 'sales';
  const backHref = fromSales ? '/seller/sales' : '/seller/overview';
  const backLabel = fromSales ? 'Back to sold' : 'Back to seller dashboard';
  const [order, setOrder] = useState<Order | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [billOfSaleDocs, setBillOfSaleDocs] = useState<ComplianceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<'preparing' | 'in_transit' | 'delivered' | null>(null);
  const [scheduleDeliveryOpen, setScheduleDeliveryOpen] = useState(false);
  const [deliveryWindows, setDeliveryWindows] = useState<Array<{ start: string; end: string }>>([{ start: '', end: '' }]);
  const [deliveryProposalNotes, setDeliveryProposalNotes] = useState('');
  const [markOutForDeliveryOpen, setMarkOutForDeliveryOpen] = useState(false);
  const [markDeliveredOpen, setMarkDeliveredOpen] = useState(false);
  const [hasDeliveryProof, setHasDeliveryProof] = useState(false);
  const [trackingProcessing, setTrackingProcessing] = useState<'start' | 'stop' | 'delivered' | null>(null);

  const loadOrder = useCallback(async () => {
    if (!user?.uid || !orderId) return;
    setLoading(true);
    setError(null);
    try {
      const o = await getOrderById(orderId);
      if (!o) throw new Error('Order not found');
      if (o.sellerId !== user.uid) throw new Error('You can only view your own sales.');
      const l = await getListingById(o.listingId);
      const bos = await getDocuments('order', o.id, 'BILL_OF_SALE').catch(() => []);
      setOrder(o);
      setListing(l || null);
      setBillOfSaleDocs(bos);
    } catch (e: any) {
      setError(formatUserFacingError(e, 'Failed to load order'));
    } finally {
      setLoading(false);
    }
  }, [user?.uid, orderId]);

  useEffect(() => {
    if (!authLoading) void loadOrder();
  }, [authLoading, loadOrder]);

  useEffect(() => {
    if (!orderId || !user?.uid) return;
    const unsub = subscribeToOrder(orderId, (next) => {
      if (next && next.sellerId === user.uid) setOrder(next);
    });
    return () => unsub();
  }, [orderId, user?.uid]);

  useEffect(() => {
    if (!markDeliveredOpen || !order?.id) return;
    getDocuments('order', order.id, 'DELIVERY_PROOF').then((docs) => setHasDeliveryProof(docs.length > 0));
  }, [markDeliveredOpen, order?.id]);

  const issueState = useMemo(() => (order ? getOrderIssueState(order) : 'none'), [order]);
  const trustState = useMemo(() => (order ? getOrderTrustState(order) : null), [order]);
  
  const txStatus = order ? getEffectiveTransactionStatus(order) : null;

  // FulfillmentPanel component (inline in same file)
  function FulfillmentPanel() {
    // Block all fulfillment actions if compliance gate is active
    if (txStatus === 'AWAITING_TRANSFER_COMPLIANCE') {
      return (
        <div className="text-sm text-amber-900 dark:text-amber-100 bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">TPWD Transfer Compliance Required</div>
              <div className="text-xs mt-1 text-amber-800 dark:text-amber-200">
                Delivery and pickup actions are blocked until both buyer and seller confirm TPWD transfer permit compliance.
                Complete the compliance confirmation above to unlock fulfillment.
              </div>
            </div>
          </div>
        </div>
      );
    }
    if (!order || !txStatus) return null;

    return (
      <>
        {/* Status Badge */}
        <div className="mb-3">
          <Badge variant={
            txStatus === 'COMPLETED' ? 'default' : 
            txStatus === 'DISPUTE_OPENED' ? 'destructive' : 
            'secondary'
          }>
            {txStatus.replaceAll('_', ' ')}
          </Badge>
        </div>

        {/* Seller delivery panel only */}
        <>
            {/* Buyer delivery address — seller uses this to schedule delivery */}
            {order.delivery?.buyerAddress && (
              <div className="text-sm bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1 mb-3">
                <div className="font-semibold text-foreground flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  Delivery address (from buyer)
                </div>
                <div className="text-foreground font-mono text-xs leading-relaxed">
                  {[order.delivery.buyerAddress.line1, order.delivery.buyerAddress.line2, [order.delivery.buyerAddress.city, order.delivery.buyerAddress.state, order.delivery.buyerAddress.zip].filter(Boolean).join(', ')].filter(Boolean).join(', ')}
                </div>
                {order.delivery.buyerAddress.deliveryInstructions && (
                  <div className="text-muted-foreground text-xs pt-1">Instructions: {order.delivery.buyerAddress.deliveryInstructions}</div>
                )}
                {(order.delivery.buyerAddress.lat != null && order.delivery.buyerAddress.lng != null) && (
                  <a
                    href={`https://www.google.com/maps?q=${order.delivery.buyerAddress.lat},${order.delivery.buyerAddress.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                  >
                    <MapPin className="h-3 w-3" />
                    {order.delivery.buyerAddress.pinLabel || 'View pin on map'}
                  </a>
                )}
              </div>
            )}

            {/* Delivery Info Display — windows, ETA, hauler */}
            {(order.delivery?.windows?.length || order.delivery?.agreedWindow || order.delivery?.eta) && (
              <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded space-y-1 mb-3">
                {order.delivery?.agreedWindow && (
                  <div><strong>Agreed window:</strong> {new Date(order.delivery.agreedWindow.start).toLocaleString()} – {new Date(order.delivery.agreedWindow.end).toLocaleString()}</div>
                )}
                {!order.delivery?.agreedWindow && order.delivery?.eta && (
                  <div><strong>Scheduled ETA:</strong> {new Date(order.delivery.eta).toLocaleString()}</div>
                )}
                {!order.delivery?.agreedWindow && !order.delivery?.eta && order.delivery?.windows?.length && (
                  <div><strong>Proposed windows:</strong>{' '}
                    {order.delivery.windows.map((w: any, i: number) => {
                      const s = w?.start?.toDate ? w.start.toDate() : new Date(w?.start);
                      const e = w?.end?.toDate ? w.end.toDate() : new Date(w?.end);
                      return <span key={i}>{i ? '; ' : ''}{s.toLocaleString()} – {e.toLocaleString()}</span>;
                    })}
                  </div>
                )}
                {(order.delivery as any)?.notes && (
                  <div className="pt-1 border-t border-border/50 mt-1"><strong>Notes:</strong> {(order.delivery as any).notes}</div>
                )}
              </div>
            )}

            {txStatus && ['FULFILLMENT_REQUIRED', 'PAID'].includes(txStatus) && !order.delivery?.buyerAddress && (
              <div className="text-sm text-amber-900 dark:text-amber-100 bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800 mb-3">
                <div className="font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Waiting for buyer to set delivery address
                </div>
                <div className="text-xs mt-1 text-amber-800 dark:text-amber-200">
                  The buyer must add their delivery address (or drop a pin) first. Once they do, you’ll see it here and can propose a delivery date. They’ll confirm the date, then confirm receipt when it arrives.
                </div>
              </div>
            )}

            {txStatus && ['FULFILLMENT_REQUIRED', 'PAID'].includes(txStatus) && order.delivery?.buyerAddress && (
              <>
                <div className="text-sm text-foreground/90">
                  Use the <strong>Propose delivery date</strong> button above to offer date and time windows. The buyer will pick one, then you coordinate the delivery.
                </div>
                <Separator />
              </>
            )}

            {txStatus === 'DELIVERY_PROPOSED' && (
              <div className="text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950/20 p-3 rounded border border-blue-200 dark:border-blue-800">
                <div className="font-semibold text-blue-900 dark:text-blue-100">{ORDER_COPY.chooseDeliveryDate.waitingForBuyer}</div>
                <div className="text-xs mt-1">{ORDER_COPY.chooseDeliveryDate.waitingForBuyerDescription}</div>
              </div>
            )}

            {txStatus === 'DELIVERY_SCHEDULED' && (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm">Mark Out for Delivery</div>
                    <div className="text-xs text-muted-foreground">Confirm the order is on the way to the buyer.</div>
                  </div>
                  <Button
                    variant="default"
                    size="lg"
                    className="w-full shrink-0 sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md ring-2 ring-emerald-500/30 justify-center"
                    disabled={processing !== null}
                    onClick={() => setMarkOutForDeliveryOpen(true)}
                  >
                    <Truck className="h-4 w-4 mr-2" />
                    Mark Out for Delivery
                  </Button>
                </div>
                <Separator />
              </>
            )}

            {(txStatus === 'OUT_FOR_DELIVERY' || txStatus === 'DELIVERY_SCHEDULED') && (
              <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded border border-border/50">
                <div className="font-semibold text-foreground">Waiting on buyer to confirm receipt</div>
                <div className="text-xs mt-1">Only the buyer confirms receipt to complete the transaction. Once they receive the order, they will confirm in their order page.</div>
              </div>
            )}

            {txStatus === 'DELIVERED_PENDING_CONFIRMATION' && (
              <div className="text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950/20 p-3 rounded border border-blue-200 dark:border-blue-800">
                <div className="font-semibold text-blue-900 dark:text-blue-100">Waiting on buyer confirmation</div>
                <div className="text-xs mt-1">Buyer will confirm receipt to complete the transaction.</div>
              </div>
            )}

            {txStatus === 'DISPUTE_OPENED' && (
              <div className="text-sm text-muted-foreground bg-orange-50 dark:bg-orange-950/20 p-3 rounded border border-orange-200 dark:border-orange-800">
                <div className="font-semibold text-orange-900 dark:text-orange-100">Dispute Opened</div>
                <div className="text-xs mt-1">
                  <Button
                    variant="link"
                    className="p-0 h-auto text-orange-900 dark:text-orange-100 underline"
                    onClick={() => {
                      const el = document.getElementById('report-issue');
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                  >
                    View dispute details
                  </Button>
                </div>
              </div>
            )}
          </>
      </>
    );
  }

  if (authLoading || loading) {
    return <OrderDetailSkeleton />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Card>
            <CardContent className="pt-6 text-center">
              <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <div className="font-semibold">Sign in required</div>
              <div className="text-sm text-muted-foreground mt-1">Please sign in to view this sale.</div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6">
        <div className="container mx-auto px-4 py-8 max-w-4xl space-y-4">
          <Button asChild variant="outline" size="sm">
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {backLabel}
            </Link>
          </Button>
          <Card>
            <CardContent className="pt-6">
              <div className="font-semibold text-destructive">Couldn’t load order</div>
              <div className="text-sm text-muted-foreground mt-1">{error || 'Order not found.'}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-5xl space-y-6">
        <Card className="border-border/60 bg-gradient-to-br from-card via-card to-muted/25">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-2 min-w-[260px]">
                <Button asChild variant="outline" size="sm">
                  <Link href={backHref}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {backLabel}
                  </Link>
                </Button>
                <div>
                  <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Sale</h1>
                  <p className="text-sm text-muted-foreground break-words mt-1">
                    {listing?.title || 'Listing'} · <span className="font-mono">{order.id}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {typeof order.amount === 'number' ? (
                  <Badge variant="secondary" className="font-semibold text-xs">
                    Total ${order.amount.toLocaleString()}
                  </Badge>
                ) : null}
                {trustState ? (
                  <Badge variant="secondary" className="font-semibold text-xs capitalize">
                    {trustState.replaceAll('_', ' ')}
                  </Badge>
                ) : null}
                {issueState !== 'none' && (
                  <Badge variant="destructive" className="font-semibold text-xs">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Issue under review
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Next Step Card */}
        {(() => {
          const nextAction = getNextRequiredAction(order, 'seller');
          if (!nextAction) return null;
          
          return (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="font-semibold text-base mb-1">{nextAction.title}</div>
                    <div className="text-sm text-foreground/90">{nextAction.description}</div>
                    {nextAction.dueAt && (
                      <div className="text-xs text-muted-foreground mt-2">
                        Due: {formatDate(nextAction.dueAt)}
                      </div>
                    )}
                    {nextAction.blockedReason && (
                      <div className="text-xs text-destructive mt-2 bg-destructive/10 border border-destructive/20 rounded p-2">
                        {nextAction.blockedReason}
                      </div>
                    )}
                  </div>
                  <Button
                    size="lg"
                    className={
                      nextAction.severity === 'danger'
                        ? 'font-semibold'
                        : nextAction.ctaAction.includes('schedule-delivery') ||
                            nextAction.ctaAction.includes('mark-out') ||
                            nextAction.ctaAction.includes('mark-delivered')
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md ring-2 ring-emerald-500/30'
                          : 'shadow-warm ring-2 ring-primary/25 font-semibold'
                    }
                    variant={
                      nextAction.severity === 'danger'
                        ? 'destructive'
                        : nextAction.ctaAction.includes('schedule-delivery') ||
                            nextAction.ctaAction.includes('mark-out') ||
                            nextAction.ctaAction.includes('mark-delivered')
                          ? 'default'
                          : nextAction.severity === 'warning'
                            ? 'default'
                            : 'outline'
                    }
                    disabled={!!nextAction.blockedReason || (nextAction.ctaAction.includes('mark-delivered') && processing === 'delivered')}
                    onClick={async () => {
                      if (nextAction.ctaAction.includes('schedule-delivery')) {
                        setScheduleDeliveryOpen(true);
                      } else if (nextAction.ctaAction.includes('mark-out')) {
                        setMarkOutForDeliveryOpen(true);
                      } else if (nextAction.ctaAction.includes('mark-delivered')) {
                        setMarkDeliveredOpen(true);
                      } else if (nextAction.ctaAction.startsWith('/')) {
                        window.location.href = nextAction.ctaAction;
                      }
                    }}
                  >
                    {nextAction.ctaAction.includes('mark-delivered') && processing === 'delivered' ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    {nextAction.ctaLabel}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Next Action Banner — hidden when Next Step Card already shows the same action to avoid duplicates */}
        {!getNextRequiredAction(order, 'seller') && (
          <NextActionBanner
            order={order}
            role="seller"
            onAction={() => {
              const txStatus = getEffectiveTransactionStatus(order);
              if (txStatus === 'FULFILLMENT_REQUIRED') setScheduleDeliveryOpen(true);
              else if (txStatus === 'DELIVERY_SCHEDULED') setMarkOutForDeliveryOpen(true);
              else if (txStatus === 'OUT_FOR_DELIVERY') setMarkDeliveredOpen(true);
            }}
          />
        )}

        {/* Live delivery tracking (seller: Start delivery / Stop tracking / Mark delivered) */}
        <DeliveryTrackingCard
          order={order}
          role="seller"
          currentUserUid={user?.uid ?? null}
          processing={trackingProcessing}
          onStartTracking={async () => {
            setTrackingProcessing('start');
            try {
              await postAuthJson(`/api/orders/${order.id}/start-delivery-tracking`);
              toast({ title: 'Live tracking started', description: 'Buyer can now see your location on the map.' });
              await loadOrder();
            } catch (e: any) {
              toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to start tracking'), variant: 'destructive' });
            } finally {
              setTrackingProcessing(null);
            }
          }}
          onStopTracking={async () => {
            setTrackingProcessing('stop');
            try {
              await postAuthJson(`/api/orders/${order.id}/stop-delivery-tracking`, { mode: 'STOP_ONLY' });
              toast({ title: 'Tracking stopped', description: 'Buyer will no longer see live location.' });
              await loadOrder();
            } catch (e: any) {
              toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to stop tracking'), variant: 'destructive' });
            } finally {
              setTrackingProcessing(null);
            }
          }}
          onMarkDelivered={async () => {
            setTrackingProcessing('delivered');
            try {
              await postAuthJson(`/api/orders/${order.id}/stop-delivery-tracking`, { mode: 'DELIVERED' });
              toast({ title: 'Marked as delivered', description: 'Buyer can confirm receipt on their order page.' });
              await loadOrder();
            } catch (e: any) {
              toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to mark delivered'), variant: 'destructive' });
            } finally {
              setTrackingProcessing(null);
            }
          }}
        />

        {/* Compliance Transfer Panel (for regulated whitetail deals) */}
        <ComplianceTransferPanel
          order={order}
          role="seller"
          onConfirm={() => {
            // Reload order data
            loadOrder();
          }}
        />

        {/* Order Progress — single canonical timeline */}
        <OrderMilestoneTimeline order={order} role="seller" />

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Delivery</CardTitle>
              <CardDescription className="text-foreground/85">
                You propose date and time windows; the buyer picks one that works. Only the buyer confirms receipt to complete the transaction.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <FulfillmentPanel />
            </CardContent>
          </Card>


          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Order details</CardTitle>
              <CardDescription>Quick reference links and metadata.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold text-sm">Listing</div>
                  <div className="text-xs text-muted-foreground">{listing?.title || 'Listing'}</div>
                </div>
                {listing?.id ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/listing/${listing.id}`}>View listing</Link>
                  </Button>
                ) : null}
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/60 p-3 bg-background/40">
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div className="text-sm font-semibold mt-0.5">{String(order.status).replaceAll('_', ' ')}</div>
                </div>
                <div className="rounded-lg border border-border/60 p-3 bg-background/40">
                  <div className="text-xs text-muted-foreground">Payment</div>
                  <div className="text-sm font-semibold mt-0.5">
                    {String((order as any).paymentMethod || '—').replaceAll('_', ' ')}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Bill of Sale</CardTitle>
              <CardDescription>View/download the written transfer. You can also upload a signed copy.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {billOfSaleDocs.length > 0 ? (
                <div className="space-y-2">
                  {billOfSaleDocs.slice(0, 3).map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="text-sm">
                        <div className="font-semibold">Bill of Sale</div>
                        <div className="text-xs text-muted-foreground break-all">{d.documentUrl}</div>
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <a href={d.documentUrl} target="_blank" rel="noreferrer">
                          View / Download
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Not available yet. If this order requires a Bill of Sale, it will be generated when checkout is initiated.
                </div>
              )}

              <Separator />

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold text-sm">Seller signature confirmation</div>
                  <div className="text-xs text-muted-foreground">
                    {order.billOfSaleSellerSignedAt ? `Signed at ${order.billOfSaleSellerSignedAt.toLocaleString()}` : 'Not confirmed yet.'}
                  </div>
                </div>
                <Button
                  variant="default"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md ring-2 ring-emerald-500/30"
                  disabled={Boolean(order.billOfSaleSellerSignedAt)}
                  onClick={async () => {
                    try {
                      await postAuthJson(`/api/orders/${order.id}/bill-of-sale/confirm-signed`);
                      toast({ title: 'Confirmed', description: 'Seller signature confirmation recorded.' });
                      const refreshed = await getOrderById(order.id);
                      if (refreshed) setOrder(refreshed);
                    } catch (e: any) {
                      toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to confirm'), variant: 'destructive' });
                    }
                  }}
                >
                  I have signed
                </Button>
              </div>

              <Separator />

              <div className="space-y-2">
                <div className="font-semibold text-sm">Upload signed copy (optional)</div>
                <DocumentUpload
                  entityType="order"
                  entityId={order.id}
                  documentType="BILL_OF_SALE"
                  onUploadComplete={async () => {
                    const bos = await getDocuments('order', order.id, 'BILL_OF_SALE').catch(() => []);
                    setBillOfSaleDocs(bos);
                  }}
                  required={false}
                />
              </div>
            </CardContent>
          </Card>

          <OrderDocumentsPanel orderId={order.id} listing={listing} excludeDocumentTypes={['BILL_OF_SALE']} />
        </div>

        {/* Propose Delivery Dialog (hauling – windows + hauler) */}
        <Dialog open={scheduleDeliveryOpen} onOpenChange={setScheduleDeliveryOpen}>
          <DialogContent className="flex flex-col max-h-[90dvh] sm:max-h-[90vh] overflow-hidden w-[calc(100vw-2rem)] sm:w-full max-w-2xl p-3 sm:p-4 md:p-6">
            <DialogHeader className="shrink-0 pb-2 pr-8">
              <DialogTitle className="text-base sm:text-lg">Propose delivery date</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm mt-0.5 text-foreground/90">Offer one or more date and time windows. The buyer will pick one that works.</DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-4 -mx-1 px-1">
              <div>
                <Label className="text-sm">Delivery windows *</Label>
                <div className="space-y-3 mt-1">
                  {deliveryWindows.map((w, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row gap-2 sm:items-end">
                      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
                        <div className="min-w-0">
                          <Label className="text-xs">Start</Label>
                          <Input type="datetime-local" className="w-full min-w-0" value={w.start} onChange={(e) => {
                            const n = [...deliveryWindows];
                            n[idx] = { ...n[idx], start: e.target.value };
                            setDeliveryWindows(n);
                          }} />
                        </div>
                        <div className="min-w-0">
                          <Label className="text-xs">End</Label>
                          <Input type="datetime-local" className="w-full min-w-0" value={w.end} onChange={(e) => {
                            const n = [...deliveryWindows];
                            n[idx] = { ...n[idx], end: e.target.value };
                            setDeliveryWindows(n);
                          }} />
                        </div>
                      </div>
                      {deliveryWindows.length > 1 && (
                        <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto shrink-0" onClick={() => setDeliveryWindows(deliveryWindows.filter((_, i) => i !== idx))}>
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setDeliveryWindows([...deliveryWindows, { start: '', end: '' }])}>
                    Add window
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-sm">Notes (optional)</Label>
                <Textarea
                  value={deliveryProposalNotes}
                  onChange={(e) => setDeliveryProposalNotes(e.target.value)}
                  placeholder="Any details for the buyer (e.g. hauling info, special instructions)"
                  className="mt-1 min-h-[80px] resize-y"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className="shrink-0 pt-3 border-t mt-2">
              <Button variant="outline" onClick={() => setScheduleDeliveryOpen(false)}>Cancel</Button>
              <Button
                disabled={processing !== null || deliveryWindows.some(w => !w.start || !w.end)}
                onClick={async () => {
                  try {
                    setProcessing('delivered');
                    const body = {
                      windows: deliveryWindows.filter(w => w.start && w.end).map(w => ({ start: new Date(w.start).toISOString(), end: new Date(w.end).toISOString() })),
                      ...(deliveryProposalNotes.trim() ? { notes: deliveryProposalNotes.trim() } : {}),
                    };
                    await postAuthJson(`/api/orders/${order.id}/fulfillment/schedule-delivery`, body);
                    toast({ title: 'Success', description: 'Delivery windows proposed. Buyer will agree to one.' });
                    setScheduleDeliveryOpen(false);
                    setDeliveryWindows([{ start: '', end: '' }]);
                    setDeliveryProposalNotes('');
                    const refreshed = await getOrderById(order.id);
                    if (refreshed) setOrder(refreshed);
                  } catch (e: any) {
                    toast({ title: 'Error', description: e?.message || 'Failed to propose delivery', variant: 'destructive' });
                  } finally {
                    setProcessing(null);
                  }
                }}
              >
                {processing !== null ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Propose delivery date
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Mark Out for Delivery Dialog */}
        <Dialog open={markOutForDeliveryOpen} onOpenChange={setMarkOutForDeliveryOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark Out for Delivery</DialogTitle>
              <DialogDescription>Confirm the order is on the way to the buyer.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMarkOutForDeliveryOpen(false)}>Cancel</Button>
              <Button
                disabled={processing !== null}
                onClick={async () => {
                  try {
                    setProcessing('in_transit');
                    await postAuthJson(`/api/orders/${order.id}/fulfillment/mark-out-for-delivery`, {});
                    toast({ title: 'Success', description: 'Order marked as out for delivery.' });
                    setMarkOutForDeliveryOpen(false);
                    const refreshed = await getOrderById(order.id);
                    if (refreshed) setOrder(refreshed);
                  } catch (e: any) {
                    toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to mark out for delivery'), variant: 'destructive' });
                  } finally {
                    setProcessing(null);
                  }
                }}
              >
                {processing !== null ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Mark Out for Delivery
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Mark Delivered Dialog — requires delivery photo before marking delivered */}
        <Dialog
          open={markDeliveredOpen}
          onOpenChange={(open) => {
            setMarkDeliveredOpen(open);
            if (!open) setHasDeliveryProof(false);
          }}
        >
          <DialogContent className="flex flex-col max-h-[90dvh] sm:max-h-[90vh] overflow-hidden max-w-lg">
            <DialogHeader>
              <DialogTitle>Mark delivered</DialogTitle>
              <DialogDescription>
                Upload a photo of the animal delivered. This is required before you can mark the order as delivered.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 py-2">
              <div>
                <Label className="text-sm">Delivery photo (required)</Label>
                <p className="text-xs text-muted-foreground mb-2">Photo of the animal at delivery.</p>
                {order && (
                  <DocumentUpload
                    entityType="order"
                    entityId={order.id}
                    documentType="DELIVERY_PROOF"
                    onUploadComplete={() => setHasDeliveryProof(true)}
                    required
                    uploadTrigger
                  />
                )}
              </div>
            </div>
            <DialogFooter className="border-t pt-3">
              <Button variant="outline" onClick={() => { setMarkDeliveredOpen(false); setHasDeliveryProof(false); }}>
                Cancel
              </Button>
              <Button
                disabled={!hasDeliveryProof || processing === 'delivered'}
                onClick={async () => {
                  if (!order?.id) return;
                  try {
                    setProcessing('delivered');
                    await postAuthJson(`/api/orders/${order.id}/mark-delivered`, {});
                    toast({ title: 'Success', description: 'Order marked as delivered. Buyer can confirm receipt.' });
                    setMarkDeliveredOpen(false);
                    setHasDeliveryProof(false);
                    const refreshed = await getOrderById(order.id);
                    if (refreshed) setOrder(refreshed);
                  } catch (e: any) {
                    toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to mark delivered'), variant: 'destructive' });
                  } finally {
                    setProcessing(null);
                  }
                }}
              >
                {processing === 'delivered' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Mark delivered
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}

