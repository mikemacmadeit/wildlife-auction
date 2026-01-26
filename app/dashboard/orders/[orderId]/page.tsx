/**
 * Buyer Order Detail
 *
 * Phase 2A: Provides a canonical per-order page used by:
 * - notification deep links (`/dashboard/orders/${orderId}`)
 * - post-checkout reassurance
 *
 * This page does NOT change payout logic. It only renders backend-truth state.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, AlertTriangle, ArrowLeft, CheckCircle2, MapPin, Package, User } from 'lucide-react';
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
import { confirmReceipt, disputeOrder } from '@/lib/stripe/api';
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

export default function BuyerOrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const orderId = params?.orderId;
  const [order, setOrder] = useState<Order | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [billOfSaleDocs, setBillOfSaleDocs] = useState<ComplianceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<'confirm' | 'dispute' | 'select_window' | 'confirm_pickup' | null>(null);
  const [pickupCodeInput, setPickupCodeInput] = useState('');

  const loadOrder = useCallback(async (cancelledRef?: { current: boolean }) => {
    // Allow calling without cancelledRef for manual reloads
    if (!user?.uid || !orderId) return;
    setLoading(true);
    setError(null);
    try {
      const o = await getOrderById(orderId);
      if (!o) throw new Error('Order not found');
      if (o.buyerId !== user.uid) throw new Error('You can only view your own orders.');

      const l = await getListingById(o.listingId);
      const bos = await getDocuments('order', o.id, 'BILL_OF_SALE').catch(() => []);

      if (cancelledRef?.current) return;
      setOrder(o);
      setListing(l || null);
      setBillOfSaleDocs(bos);
    } catch (e: any) {
      if (!cancelledRef?.current) setError(e?.message || 'Failed to load order');
    } finally {
      if (!cancelledRef?.current) setLoading(false);
    }
  }, [user?.uid, orderId]);

  useEffect(() => {
    let cancelled = false;
    const cancelledRef = { current: false };
    if (!authLoading) {
      loadOrder(cancelledRef);
    }
    return () => {
      cancelledRef.current = true;
    };
  }, [authLoading, loadOrder]);

  const issueState = useMemo(() => (order ? getOrderIssueState(order) : 'none'), [order]);
  const trustState = useMemo(() => (order ? getOrderTrustState(order) : null), [order]);

  const listingCoverPhotoURL = useMemo(() => {
    if (!listing) return null;
    const photos = Array.isArray((listing as any).photos) ? (listing as any).photos : [];
    if (photos.length) {
      const sorted = [...photos].sort((a, b) => Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0));
      const url = sorted.find((p) => typeof p?.url === 'string' && p.url.trim())?.url;
      if (url) return String(url);
    }
    const images = Array.isArray((listing as any).images) ? (listing as any).images : [];
    const url2 = images.find((u: any) => typeof u === 'string' && u.trim());
    return url2 ? String(url2) : null;
  }, [listing]);

  const listingLocationLabel = useMemo(() => {
    const city = (listing as any)?.location?.city ? String((listing as any).location.city) : '';
    const state = (listing as any)?.location?.state ? String((listing as any).location.state) : '';
    if (city && state) return `${city}, ${state}`;
    if (state) return state;
    return null;
  }, [listing]);

  const sellerDisplayName = useMemo(() => {
    const name = String((listing as any)?.sellerSnapshot?.displayName || '').trim();
    return name || 'Seller';
  }, [listing]);

  // Use transactionStatus - seller already paid immediately, no transfer ID check needed
  const txStatus: TransactionStatus | null = order ? getEffectiveTransactionStatus(order) : null;
  const transportOption = order?.transportOption || 'SELLER_TRANSPORT';
  
  const canConfirmReceipt =
    !!order &&
    transportOption === 'SELLER_TRANSPORT' &&
    (txStatus === 'DELIVERED_PENDING_CONFIRMATION' ||
     txStatus === 'OUT_FOR_DELIVERY' ||
     !!order.deliveredAt ||
     !!order.deliveryConfirmedAt);
     
  const canDispute =
    !!order &&
    (txStatus === 'DELIVERED_PENDING_CONFIRMATION' ||
     txStatus === 'OUT_FOR_DELIVERY' ||
     txStatus === 'DELIVERY_SCHEDULED' ||
     !!order.deliveredAt ||
     !!order.deliveryConfirmedAt);

  const checkin = searchParams?.get('checkin') === '1';
  const issueParam = searchParams?.get('issue') === '1';

  useEffect(() => {
    if (!issueParam) return;
    const el = document.getElementById('report-issue');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [issueParam]);

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
              <div className="text-sm text-muted-foreground mt-1">Please sign in to view your order.</div>
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
            <Link href="/dashboard/orders">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to orders
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
              <div className="space-y-3 min-w-[260px]">
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/orders">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to orders
                  </Link>
                </Button>

                <div className="flex items-start gap-4">
                  <div className="relative h-28 w-28 md:h-36 md:w-36 rounded-2xl overflow-hidden border bg-muted shrink-0">
                    {listingCoverPhotoURL ? (
                      <Image
                        src={listingCoverPhotoURL}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="(min-width: 768px) 144px, 112px"
                        unoptimized
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        <Package className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Order</h1>
                    <p className="text-sm text-muted-foreground break-words mt-1">
                      {listing?.title || 'Listing'} · <span className="font-mono">{order.id}</span>
                    </p>
                    <div className="mt-2 flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {sellerDisplayName}
                      </span>
                      {listingLocationLabel ? (
                        <>
                          <span className="text-muted-foreground/60">•</span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {listingLocationLabel}
                          </span>
                        </>
                      ) : null}
                    </div>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      {listing?.id ? (
                        <Button asChild size="sm" variant="outline" className="font-semibold">
                          <Link href={`/listing/${listing.id}`}>View listing</Link>
                        </Button>
                      ) : null}
                      {order?.sellerId ? (
                        <Button asChild size="sm" variant="outline" className="font-semibold">
                          <Link href={`/sellers/${order.sellerId}`}>View seller</Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
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

        <Dialog
          open={checkin}
          onOpenChange={(open) => {
            if (!open) router.replace(`/dashboard/orders/${order.id}`);
          }}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Delivery check-in</DialogTitle>
              <DialogDescription>
                If delivery arrived, mark it delivered (confirm receipt). If something isn’t right, report an issue so we can review before payout is released.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
              <div className="text-sm text-muted-foreground">
                Seller was paid immediately upon successful payment. Confirm receipt to complete the transaction.
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => router.replace(`/dashboard/orders/${order.id}`)}
                disabled={processing !== null}
              >
                Not now
              </Button>
              <Button
                variant="outline"
                disabled={!canDispute || processing !== null}
                onClick={() => router.replace(`/dashboard/orders/${order.id}?issue=1`)}
              >
                I have an issue
              </Button>
              <Button
                disabled={!canConfirmReceipt || processing !== null}
                onClick={async () => {
                  try {
                    setProcessing('confirm');
                    await confirmReceipt(order.id);
                    toast({
                      title: 'Receipt confirmed',
                      description: 'Transaction complete. Seller was paid immediately upon successful payment.',
                    });
                    const refreshed = await getOrderById(order.id);
                    if (refreshed) setOrder(refreshed);
                    router.replace(`/dashboard/orders/${order.id}`);
                  } catch (e: any) {
                    toast({ title: 'Error', description: e?.message || 'Failed to confirm receipt', variant: 'destructive' });
                  } finally {
                    setProcessing(null);
                  }
                }}
              >
                {processing === 'confirm' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Mark delivered
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Next Step Card */}
        {(() => {
          const nextAction = getNextRequiredAction(order, 'buyer');
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
                  </div>
                  <Button
                    variant={nextAction.severity === 'danger' ? 'destructive' : nextAction.severity === 'warning' ? 'default' : 'outline'}
                    onClick={() => {
                      if (nextAction.ctaAction.startsWith('/')) {
                        window.location.href = nextAction.ctaAction;
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
          role="buyer"
          onAction={() => {
            const txStatus: string = getEffectiveTransactionStatus(order);
            const transportOption = order.transportOption || 'SELLER_TRANSPORT';
            if (txStatus === 'DELIVERED_PENDING_CONFIRMATION' && transportOption === 'SELLER_TRANSPORT') {
              // Scroll to confirm receipt button
              const el = document.getElementById('confirm-receipt-section');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else if (txStatus === 'READY_FOR_PICKUP' || txStatus === 'PICKUP_SCHEDULED') {
              // Scroll to pickup section
              const el = document.getElementById('fulfillment-section');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }}
        />

        {/* Compliance Transfer Panel (for regulated whitetail deals) */}
        <ComplianceTransferPanel
          order={order}
          role="buyer"
          onConfirm={() => {
            // Reload order data
            loadOrder();
          }}
        />

        {/* Order Milestone Timeline (shared truth) */}
        <OrderMilestoneTimeline order={order} role="buyer" />

        {/* Legacy TransactionTimeline (keeping for backward compatibility) */}
        <TransactionTimeline order={order} role="buyer" />

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-border/60" id="fulfillment-section">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Fulfillment Status</CardTitle>
              <CardDescription>{transportOption === 'SELLER_TRANSPORT' ? 'Track delivery progress and confirm receipt.' : 'Schedule pickup and confirm pickup with code.'}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Milestone Progress */}
              <div className="mb-4">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Progress</div>
                <MilestoneProgress order={order} role="buyer" />
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold text-sm">Fulfillment Actions</div>
                  <div className="text-xs text-muted-foreground">Complete fulfillment steps based on transport type.</div>
                </div>
              </div>
              {transportOption === 'SELLER_TRANSPORT' ? (
                <>
                  {order.delivery?.eta && (
                    <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded space-y-1">
                      <div><strong>Scheduled ETA:</strong> {new Date(order.delivery.eta).toLocaleString()}</div>
                      {order.delivery.transporter?.name && <div><strong>Transporter:</strong> {order.delivery.transporter.name}</div>}
                      {order.delivery.transporter?.phone && <div><strong>Phone:</strong> {order.delivery.transporter.phone}</div>}
                    </div>
                  )}
                  {txStatus === 'DELIVERED_PENDING_CONFIRMATION' && (
                    <>
                      <div id="confirm-receipt-section" className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <div className="font-semibold text-sm">Confirm Receipt</div>
                          <div className="text-xs text-muted-foreground">Confirm you received the order to complete the transaction.</div>
                        </div>
                        <Button
                          variant="default"
                          disabled={!canConfirmReceipt || processing !== null}
                          onClick={async () => {
                            try {
                              setProcessing('confirm');
                              await confirmReceipt(order.id);
                              toast({ title: 'Receipt confirmed', description: 'Transaction complete. Seller was paid immediately upon successful payment.' });
                              const refreshed = await getOrderById(order.id);
                              if (refreshed) setOrder(refreshed);
                            } catch (e: any) {
                              toast({ title: 'Error', description: e?.message || 'Failed to confirm receipt', variant: 'destructive' });
                            } finally {
                              setProcessing(null);
                            }
                          }}
                        >
                          {processing === 'confirm' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                          Confirm Receipt
                        </Button>
                      </div>
                      <Separator />
                    </>
                  )}
                  {(txStatus === 'DELIVERY_SCHEDULED' || txStatus === 'OUT_FOR_DELIVERY') && (
                    <div className="text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950/20 p-3 rounded border border-blue-200 dark:border-blue-800">
                      <div className="font-semibold text-blue-900 dark:text-blue-100">
                        {txStatus === 'OUT_FOR_DELIVERY' ? 'Out for Delivery' : 'Delivery Scheduled'}
                      </div>
                      <div className="text-xs mt-1">Waiting for delivery to arrive.</div>
                    </div>
                  )}
                  {txStatus === 'FULFILLMENT_REQUIRED' && (
                    <div className="text-sm text-muted-foreground bg-orange-50 dark:bg-orange-950/20 p-3 rounded border border-orange-200 dark:border-orange-800">
                      <div className="font-semibold text-orange-900 dark:text-orange-100">Waiting for Seller to Start Fulfillment</div>
                      <div className="text-xs mt-1">Seller needs to schedule delivery.</div>
                    </div>
                  )}
                  {txStatus === 'COMPLETED' && (
                    <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20 p-3 rounded border border-green-200 dark:border-green-800">
                      <div className="font-semibold">Transaction Complete</div>
                      <div className="text-xs mt-1">Receipt confirmed. Seller was paid immediately upon successful payment.</div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Block pickup actions if compliance gate is active */}
                  {txStatus === 'AWAITING_TRANSFER_COMPLIANCE' && (
                    <div className="text-sm text-amber-900 dark:text-amber-100 bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold">TPWD Transfer Compliance Required</div>
                          <div className="text-xs mt-1 text-amber-800 dark:text-amber-200">
                            Pickup scheduling is blocked until both buyer and seller confirm TPWD transfer permit compliance.
                            Complete the compliance confirmation above to unlock pickup scheduling.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {(txStatus as string) === 'READY_FOR_PICKUP' && order.pickup?.location && order.pickup?.windows && (txStatus as string) !== 'AWAITING_TRANSFER_COMPLIANCE' && (
                    <>
                      <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded space-y-1">
                        <div><strong>Pickup Location:</strong> {order.pickup.location}</div>
                        {order.pickup.pickupCode && (
                          <div className="font-mono font-semibold text-sm text-foreground">
                            Pickup Code: {order.pickup.pickupCode}
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="font-semibold text-sm">Select Pickup Window</div>
                        <div className="space-y-2">
                          {order.pickup.windows.map((window: any, idx: number) => {
                            const start = (window.start && typeof window.start === 'object' && typeof window.start.toDate === 'function') 
                              ? window.start.toDate() 
                              : new Date(window.start || 0);
                            const end = (window.end && typeof window.end === 'object' && typeof window.end.toDate === 'function')
                              ? window.end.toDate()
                              : new Date(window.end || 0);
                            return (
                              <Button
                                key={idx}
                                variant="outline"
                                className="w-full justify-start"
                                disabled={processing !== null}
                                onClick={async () => {
                                  try {
                                    setProcessing('select_window');
                                    await postAuthJson(`/api/orders/${order.id}/fulfillment/select-pickup-window`, {
                                      windowIndex: idx,
                                    });
                                    toast({ title: 'Success', description: 'Pickup window selected.' });
                                    const refreshed = await getOrderById(order.id);
                                    if (refreshed) setOrder(refreshed);
                                  } catch (e: any) {
                                    toast({ title: 'Error', description: e?.message || 'Failed to select window', variant: 'destructive' });
                                  } finally {
                                    setProcessing(null);
                                  }
                                }}
                              >
                                {start.toLocaleString()} - {end.toLocaleString()}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                      <Separator />
                    </>
                  )}
                  {txStatus === 'PICKUP_SCHEDULED' && order.pickup?.selectedWindow && (
                    <>
                      <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded space-y-1">
                        <div><strong>Scheduled Window:</strong></div>
                        <div>
                          {new Date(order.pickup.selectedWindow.start).toLocaleString()} - {new Date(order.pickup.selectedWindow.end).toLocaleString()}
                        </div>
                        {order.pickup.pickupCode && (
                          <div className="font-mono font-semibold text-sm text-foreground mt-2">
                            Pickup Code: {order.pickup.pickupCode}
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="font-semibold text-sm">Confirm Pickup</div>
                        <div className="text-xs text-muted-foreground">Enter the pickup code provided by the seller.</div>
                        <Input
                          id="pickup-code"
                          placeholder="Enter 6-digit pickup code"
                          maxLength={6}
                          disabled={processing !== null}
                          onChange={(e) => {
                            const code = e.target.value.replace(/\D/g, '').slice(0, 6);
                            (e.target as HTMLInputElement).value = code;
                            setPickupCodeInput(code);
                          }}
                        />
                        <Button
                          variant="default"
                          className="w-full"
                          disabled={!pickupCodeInput || pickupCodeInput.length !== 6 || processing !== null}
                          onClick={async () => {
                            try {
                              setProcessing('confirm_pickup');
                              await postAuthJson(`/api/orders/${order.id}/fulfillment/confirm-pickup`, {
                                pickupCode: pickupCodeInput,
                              });
                              toast({ title: 'Pickup confirmed', description: 'Transaction complete. Seller was paid immediately upon successful payment.' });
                              const refreshed = await getOrderById(order.id);
                              if (refreshed) setOrder(refreshed);
                              setPickupCodeInput('');
                            } catch (e: any) {
                              toast({ title: 'Error', description: e?.message || 'Failed to confirm pickup', variant: 'destructive' });
                            } finally {
                              setProcessing(null);
                            }
                          }}
                        >
                          {processing === 'confirm_pickup' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                          Confirm Pickup
                        </Button>
                      </div>
                      <Separator />
                    </>
                  )}
                  {txStatus === 'FULFILLMENT_REQUIRED' && (
                    <div className="text-sm text-muted-foreground bg-orange-50 dark:bg-orange-950/20 p-3 rounded border border-orange-200 dark:border-orange-800">
                      <div className="font-semibold text-orange-900 dark:text-orange-100">Waiting for Seller to Set Pickup Info</div>
                      <div className="text-xs mt-1">Seller needs to set pickup location and windows.</div>
                    </div>
                  )}
                  {txStatus === 'COMPLETED' && (
                    <div className="text-sm text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20 p-3 rounded border border-green-200 dark:border-green-800">
                      <div className="font-semibold">Transaction Complete</div>
                      <div className="text-xs mt-1">Pickup confirmed. Seller was paid immediately upon successful payment.</div>
                    </div>
                  )}
                </>
              )}
              <Separator />
              <div id="report-issue" className="flex items-center justify-between gap-3 flex-wrap scroll-mt-24">
                <div>
                  <div className="font-semibold text-sm">Report an issue</div>
                  <div className="text-xs text-muted-foreground">If something isn’t right, report it for review.</div>
                </div>
                <Button
                  variant="outline"
                  disabled={!canDispute || processing !== null}
                  onClick={async () => {
                    try {
                      setProcessing('dispute');
                      await disputeOrder(order.id, 'Issue reported', 'Opened from order page');
                      toast({ title: 'Issue reported', description: 'We’ll review and follow up.' });
                      const refreshed = await getOrderById(order.id);
                      if (refreshed) setOrder(refreshed);
                    } catch (e: any) {
                      toast({ title: 'Error', description: e?.message || 'Failed to report issue', variant: 'destructive' });
                    } finally {
                      setProcessing(null);
                    }
                  }}
                >
                  {processing === 'dispute' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Report an issue
                </Button>
              </div>
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
                  <div className="font-semibold text-sm">Buyer signature confirmation</div>
                  <div className="text-xs text-muted-foreground">
                    {order.billOfSaleBuyerSignedAt ? `Signed at ${order.billOfSaleBuyerSignedAt.toLocaleString()}` : 'Not confirmed yet.'}
                  </div>
                </div>
                <Button
                  variant="outline"
                  disabled={Boolean(order.billOfSaleBuyerSignedAt)}
                  onClick={async () => {
                    try {
                      await postAuthJson(`/api/orders/${order.id}/bill-of-sale/confirm-signed`);
                      const refreshed = await getOrderById(order.id);
                      if (refreshed) setOrder(refreshed);
                      toast({ title: 'Confirmed', description: 'Buyer signature confirmation recorded.' });
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
      </div>
    </div>
  );
}

