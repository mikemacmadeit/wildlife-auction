/**
 * Seller Order Detail (read-only + seller delivery actions)
 *
 * Phase 2A: Shared TransactionTimeline for seller view.
 * Phase 2C: Seller will be able to mark in-transit (route added separately) and delivered (existing).
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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
import { Loader2, AlertTriangle, ArrowLeft, Truck, Package, PackageCheck, Calendar, MapPin, Clock, CheckCircle2 } from 'lucide-react';
import type { ComplianceDocument, Listing, Order, TransactionStatus } from '@/lib/types';
import { getOrderById } from '@/lib/firebase/orders';
import { getListingById } from '@/lib/firebase/listings';
import { getDocuments } from '@/lib/firebase/documents';
import { DocumentUpload } from '@/components/compliance/DocumentUpload';
import { OrderDocumentsPanel } from '@/components/orders/OrderDocumentsPanel';
import { TransactionTimeline } from '@/components/orders/TransactionTimeline';
import { NextActionBanner } from '@/components/orders/NextActionBanner';
import { MilestoneProgress } from '@/components/orders/MilestoneProgress';
import { ComplianceTransferPanel } from '@/components/orders/ComplianceTransferPanel';
import { OrderMilestoneTimeline } from '@/components/orders/OrderMilestoneTimeline';
import { getNextRequiredAction } from '@/lib/orders/progress';
import { getOrderIssueState } from '@/lib/orders/getOrderIssueState';
import { getOrderTrustState } from '@/lib/orders/getOrderTrustState';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import { formatDate } from '@/lib/utils';

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
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const orderId = params?.orderId;
  const [order, setOrder] = useState<Order | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [billOfSaleDocs, setBillOfSaleDocs] = useState<ComplianceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<'preparing' | 'in_transit' | 'delivered' | null>(null);

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
      setError(e?.message || 'Failed to load order');
    } finally {
      setLoading(false);
    }
  }, [user?.uid, orderId]);

  useEffect(() => {
    if (!authLoading) void loadOrder();
  }, [authLoading, loadOrder]);

  const issueState = useMemo(() => (order ? getOrderIssueState(order) : 'none'), [order]);
  const trustState = useMemo(() => (order ? getOrderTrustState(order) : null), [order]);
  
  const txStatus = order ? getEffectiveTransactionStatus(order) : null;
  const transportOption = order?.transportOption || 'SELLER_TRANSPORT';

  // Dialog states for fulfillment forms
  const [scheduleDeliveryOpen, setScheduleDeliveryOpen] = useState(false);
  const [deliveryEta, setDeliveryEta] = useState('');
  const [transporterName, setTransporterName] = useState('');
  const [transporterPhone, setTransporterPhone] = useState('');
  const [transporterPlate, setTransporterPlate] = useState('');
  
  const [setPickupInfoOpen, setSetPickupInfoOpen] = useState(false);
  const [pickupLocation, setPickupLocation] = useState('');
  const [pickupWindows, setPickupWindows] = useState<Array<{start: string, end: string}>>([{start: '', end: ''}]);
  
  const [markOutForDeliveryOpen, setMarkOutForDeliveryOpen] = useState(false);

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

        {/* SELLER_TRANSPORT Panel */}
        {transportOption === 'SELLER_TRANSPORT' ? (
          <>
            {/* Delivery Info Display */}
            {order.delivery?.eta && (
              <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded space-y-1 mb-3">
                <div><strong>Scheduled ETA:</strong> {new Date(order.delivery.eta).toLocaleString()}</div>
                {order.delivery.transporter?.name && <div><strong>Transporter:</strong> {order.delivery.transporter.name}</div>}
                {order.delivery.transporter?.phone && <div><strong>Phone:</strong> {order.delivery.transporter.phone}</div>}
                {order.delivery.transporter?.plate && <div><strong>License Plate/Tracking:</strong> {order.delivery.transporter.plate}</div>}
              </div>
            )}

            {/* Actions based on status */}
            {txStatus && ['FULFILLMENT_REQUIRED', 'PAID'].includes(txStatus) && (
              <>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-semibold text-sm">Schedule Delivery</div>
                    <div className="text-xs text-muted-foreground">Set delivery ETA and transporter information.</div>
                  </div>
                  <Button
                    variant="default"
                    disabled={processing !== null}
                    onClick={() => setScheduleDeliveryOpen(true)}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Schedule Delivery
                  </Button>
                </div>
                <Separator />
              </>
            )}

            {txStatus === 'DELIVERY_SCHEDULED' && (
              <>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-semibold text-sm">Mark Out for Delivery</div>
                    <div className="text-xs text-muted-foreground">Confirm the order is on the way to the buyer.</div>
                  </div>
                  <Button
                    variant="default"
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
              <>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-semibold text-sm">Mark Delivered</div>
                    <div className="text-xs text-muted-foreground">Mark the order as delivered (buyer can also confirm receipt).</div>
                  </div>
                  <Button
                    variant="default"
                    disabled={processing !== null}
                    onClick={async () => {
                      try {
                        setProcessing('delivered');
                        await postAuthJson(`/api/orders/${order.id}/mark-delivered`, {});
                        toast({ title: 'Updated', description: 'Marked delivered.' });
                        const refreshed = await getOrderById(order.id);
                        if (refreshed) setOrder(refreshed);
                      } catch (e: any) {
                        toast({ title: 'Error', description: e?.message || 'Failed to mark delivered', variant: 'destructive' });
                      } finally {
                        setProcessing(null);
                      }
                    }}
                  >
                    {processing === 'delivered' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PackageCheck className="h-4 w-4 mr-2" />}
                    Mark Delivered
                  </Button>
                </div>
                <Separator />
              </>
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
        ) : (
          /* BUYER_TRANSPORT Panel */
          <>
            {/* Pickup Info Display */}
            {order.pickup?.location && (
              <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded space-y-1 mb-3">
                <div><strong>Pickup Location:</strong> {order.pickup.location}</div>
                {order.pickup.pickupCode && (
                  <div className="font-mono font-semibold text-sm text-foreground mt-2">
                    <strong>Pickup Code:</strong> {order.pickup.pickupCode}
                  </div>
                )}
                {order.pickup.windows && order.pickup.windows.length > 0 && (
                  <div className="mt-2">
                    <strong>Available Windows:</strong>
                    {order.pickup.windows.map((window: any, idx: number) => {
                      const start = window.start?.toDate ? window.start.toDate() : new Date(window.start);
                      const end = window.end?.toDate ? window.end.toDate() : new Date(window.end);
                      return (
                        <div key={idx} className="text-xs mt-1">
                          {start.toLocaleString()} - {end.toLocaleString()}
                        </div>
                      );
                    })}
                  </div>
                )}
                {order.pickup.selectedWindow && (
                  <div className="mt-2">
                    <strong>Selected Window:</strong>
                    <div className="text-xs">
                      {new Date(order.pickup.selectedWindow.start).toLocaleString()} - {new Date(order.pickup.selectedWindow.end).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Actions based on status */}
            {txStatus && ['FULFILLMENT_REQUIRED', 'PAID'].includes(txStatus) && (
              <>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-semibold text-sm">Set Pickup Info</div>
                    <div className="text-xs text-muted-foreground">Set pickup location and available time windows. A pickup code will be generated.</div>
                  </div>
                  <Button
                    variant="default"
                    disabled={processing !== null}
                    onClick={() => setSetPickupInfoOpen(true)}
                  >
                    <MapPin className="h-4 w-4 mr-2" />
                    Set Pickup Info
                  </Button>
                </div>
                <Separator />
              </>
            )}

            {txStatus === 'READY_FOR_PICKUP' && (
              <div className="text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950/20 p-3 rounded border border-blue-200 dark:border-blue-800">
                <div className="font-semibold text-blue-900 dark:text-blue-100">Waiting for buyer to schedule pickup</div>
                <div className="text-xs mt-1">Buyer will select a pickup window.</div>
              </div>
            )}

            {txStatus === 'PICKUP_SCHEDULED' && (
              <div className="text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950/20 p-3 rounded border border-blue-200 dark:border-blue-800">
                <div className="font-semibold text-blue-900 dark:text-blue-100">Waiting for pickup confirmation</div>
                <div className="text-xs mt-1">Buyer will confirm pickup with the code.</div>
              </div>
            )}

            {(txStatus === 'PICKED_UP' || txStatus === 'COMPLETED') && (
              <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20 p-3 rounded border border-green-200 dark:border-green-800">
                <div className="font-semibold">Transaction Complete</div>
                <div className="text-xs mt-1">Pickup confirmed. Seller was paid immediately upon successful payment.</div>
              </div>
            )}
          </>
        )}
      </>
    );
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
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
            <Link href="/seller/overview">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to seller dashboard
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
                  <Link href="/seller/overview">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to seller dashboard
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
                    <div className="text-sm text-muted-foreground">{nextAction.description}</div>
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
                    variant={nextAction.severity === 'danger' ? 'destructive' : nextAction.severity === 'warning' ? 'default' : 'outline'}
                    disabled={!!nextAction.blockedReason}
                    onClick={() => {
                      if (nextAction.ctaAction.startsWith('/')) {
                        window.location.href = nextAction.ctaAction;
                      } else if (nextAction.ctaAction.includes('schedule-delivery')) {
                        setScheduleDeliveryOpen(true);
                      } else if (nextAction.ctaAction.includes('set-pickup')) {
                        setSetPickupInfoOpen(true);
                      } else if (nextAction.ctaAction.includes('mark-out')) {
                        setMarkOutForDeliveryOpen(true);
                      } else if (nextAction.ctaAction.includes('mark-delivered')) {
                        // Trigger mark delivered flow
                        window.location.href = `/seller/orders/${order.id}#mark-delivered`;
                      }
                    }}
                  >
                    {nextAction.ctaLabel}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Next Action Banner */}
        <NextActionBanner
          order={order}
          role="seller"
          onAction={() => {
            const txStatus = getEffectiveTransactionStatus(order);
            const transportOption = order.transportOption || 'SELLER_TRANSPORT';
            if (txStatus === 'FULFILLMENT_REQUIRED') {
              if (transportOption === 'SELLER_TRANSPORT') {
                setScheduleDeliveryOpen(true);
              } else {
                setSetPickupInfoOpen(true);
              }
            } else if (txStatus === 'DELIVERY_SCHEDULED') {
              setMarkOutForDeliveryOpen(true);
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

        {/* Order Milestone Timeline (shared truth) */}
        <OrderMilestoneTimeline order={order} role="seller" />

        {/* Legacy TransactionTimeline (keeping for backward compatibility) */}
        <TransactionTimeline order={order} role="seller" />

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {transportOption === 'SELLER_TRANSPORT' ? 'Delivery Fulfillment' : 'Pickup Fulfillment'}
              </CardTitle>
              <CardDescription>
                {transportOption === 'SELLER_TRANSPORT' 
                  ? 'Schedule and track delivery progress.' 
                  : 'Set pickup location and time windows for buyer.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Milestone Progress */}
              <div className="mb-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Progress</div>
                <MilestoneProgress order={order} role="seller" />
              </div>
              <Separator />
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
                  variant="outline"
                  disabled={Boolean(order.billOfSaleSellerSignedAt)}
                  onClick={async () => {
                    try {
                      await postAuthJson(`/api/orders/${order.id}/bill-of-sale/confirm-signed`);
                      toast({ title: 'Confirmed', description: 'Seller signature confirmation recorded.' });
                      const refreshed = await getOrderById(order.id);
                      if (refreshed) setOrder(refreshed);
                    } catch (e: any) {
                      toast({ title: 'Error', description: e?.message || 'Failed to confirm', variant: 'destructive' });
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

        {/* Schedule Delivery Dialog */}
        <Dialog open={scheduleDeliveryOpen} onOpenChange={setScheduleDeliveryOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Delivery</DialogTitle>
              <DialogDescription>Set delivery ETA and optional transporter information.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Delivery ETA *</Label>
                <Input
                  type="datetime-local"
                  value={deliveryEta}
                  onChange={(e) => setDeliveryEta(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Transporter Name (optional)</Label>
                <Input value={transporterName} onChange={(e) => setTransporterName(e.target.value)} placeholder="e.g., FedEx, UPS" />
              </div>
              <div>
                <Label>Transporter Phone (optional)</Label>
                <Input value={transporterPhone} onChange={(e) => setTransporterPhone(e.target.value)} placeholder="Phone number" />
              </div>
              <div>
                <Label>License Plate / Tracking (optional)</Label>
                <Input value={transporterPlate} onChange={(e) => setTransporterPlate(e.target.value)} placeholder="License plate or tracking number" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setScheduleDeliveryOpen(false)}>Cancel</Button>
              <Button
                disabled={!deliveryEta || processing !== null}
                onClick={async () => {
                  try {
                    setProcessing('delivered');
                    const body: any = { eta: new Date(deliveryEta).toISOString() };
                    if (transporterName || transporterPhone || transporterPlate) {
                      body.transporter = {
                        ...(transporterName ? { name: transporterName } : {}),
                        ...(transporterPhone ? { phone: transporterPhone } : {}),
                        ...(transporterPlate ? { plate: transporterPlate } : {}),
                      };
                    }
                    await postAuthJson(`/api/orders/${order.id}/fulfillment/schedule-delivery`, body);
                    toast({ title: 'Success', description: 'Delivery scheduled successfully.' });
                    setScheduleDeliveryOpen(false);
                    setDeliveryEta('');
                    setTransporterName('');
                    setTransporterPhone('');
                    setTransporterPlate('');
                    const refreshed = await getOrderById(order.id);
                    if (refreshed) setOrder(refreshed);
                  } catch (e: any) {
                    toast({ title: 'Error', description: e?.message || 'Failed to schedule delivery', variant: 'destructive' });
                  } finally {
                    setProcessing(null);
                  }
                }}
              >
                {processing !== null ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Schedule Delivery
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
                    toast({ title: 'Error', description: e?.message || 'Failed to mark out for delivery', variant: 'destructive' });
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

        {/* Set Pickup Info Dialog */}
        <Dialog open={setPickupInfoOpen} onOpenChange={setSetPickupInfoOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Set Pickup Information</DialogTitle>
              <DialogDescription>Set pickup location and available time windows. A pickup code will be generated automatically.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Pickup Location *</Label>
                <Textarea
                  value={pickupLocation}
                  onChange={(e) => setPickupLocation(e.target.value)}
                  placeholder="Full address or detailed location instructions"
                  required
                  rows={3}
                />
              </div>
              <div>
                <Label>Available Pickup Windows *</Label>
                <div className="space-y-2">
                  {pickupWindows.map((window, idx) => (
                    <div key={idx} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Label className="text-xs">Start</Label>
                        <Input
                          type="datetime-local"
                          value={window.start}
                          onChange={(e) => {
                            const newWindows = [...pickupWindows];
                            newWindows[idx].start = e.target.value;
                            setPickupWindows(newWindows);
                          }}
                          required
                        />
                      </div>
                      <div className="flex-1">
                        <Label className="text-xs">End</Label>
                        <Input
                          type="datetime-local"
                          value={window.end}
                          onChange={(e) => {
                            const newWindows = [...pickupWindows];
                            newWindows[idx].end = e.target.value;
                            setPickupWindows(newWindows);
                          }}
                          required
                        />
                      </div>
                      {pickupWindows.length > 1 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setPickupWindows(pickupWindows.filter((_, i) => i !== idx));
                          }}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPickupWindows([...pickupWindows, { start: '', end: '' }])}
                  >
                    Add Window
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSetPickupInfoOpen(false)}>Cancel</Button>
              <Button
                disabled={!pickupLocation.trim() || pickupWindows.some(w => !w.start || !w.end) || processing !== null}
                onClick={async () => {
                  try {
                    setProcessing('delivered');
                    await postAuthJson(`/api/orders/${order.id}/fulfillment/set-pickup-info`, {
                      location: pickupLocation.trim(),
                      windows: pickupWindows.filter(w => w.start && w.end),
                    });
                    toast({ title: 'Success', description: 'Pickup information set. Share the pickup code with the buyer.' });
                    setSetPickupInfoOpen(false);
                    setPickupLocation('');
                    setPickupWindows([{ start: '', end: '' }]);
                    const refreshed = await getOrderById(order.id);
                    if (refreshed) {
                      setOrder(refreshed);
                      // Show pickup code in a toast or alert
                      if (refreshed.pickup?.pickupCode) {
                        toast({
                          title: 'Pickup Code Generated',
                          description: `Share this code with the buyer: ${refreshed.pickup.pickupCode}`,
                          duration: 10000,
                        });
                      }
                    }
                  } catch (e: any) {
                    toast({ title: 'Error', description: e?.message || 'Failed to set pickup info', variant: 'destructive' });
                  } finally {
                    setProcessing(null);
                  }
                }}
              >
                {processing !== null ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save Pickup Info
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

