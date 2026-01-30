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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { OrderDetailSkeleton } from '@/components/skeletons/OrderDetailSkeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, AlertTriangle, ArrowLeft, CheckCircle2, MapPin, Package, User } from 'lucide-react';
import type { ComplianceDocument, Listing, Order, TransactionStatus } from '@/lib/types';
import { getOrderById, subscribeToOrder } from '@/lib/firebase/orders';
import { getListingById } from '@/lib/firebase/listings';
import { getDocuments } from '@/lib/firebase/documents';
import { DocumentUpload } from '@/components/compliance/DocumentUpload';
import { OrderDocumentsPanel } from '@/components/orders/OrderDocumentsPanel';
import { NextActionBanner } from '@/components/orders/NextActionBanner';
import { ComplianceTransferPanel } from '@/components/orders/ComplianceTransferPanel';
import { OrderMilestoneTimeline } from '@/components/orders/OrderMilestoneTimeline';
import { confirmReceipt, disputeOrder } from '@/lib/stripe/api';
import { getOrderIssueState } from '@/lib/orders/getOrderIssueState';
import { getOrderTrustState } from '@/lib/orders/getOrderTrustState';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import { formatDate, isValidNonEpochDate } from '@/lib/utils';

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
  if (!res.ok) {
    const msg = json?.message ?? json?.error ?? (typeof json?.details?.formErrors?.[0] === 'string' ? json.details.formErrors[0] : null) ?? 'Request failed';
    throw new Error(msg);
  }
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
  const [processing, setProcessing] = useState<'confirm' | 'dispute' | 'set_address' | 'location' | null>(null);
  const [setAddressModalOpen, setSetAddressModalOpen] = useState(false);
  const [deliveryAddressForm, setDeliveryAddressForm] = useState({
    line1: '',
    line2: '',
    city: '',
    state: '',
    zip: '',
    deliveryInstructions: '',
    lat: undefined as number | undefined,
    lng: undefined as number | undefined,
    pinLabel: '',
  });

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

  useEffect(() => {
    if (!orderId || !user?.uid) return;
    const unsub = subscribeToOrder(orderId, (next) => {
      if (next && next.buyerId === user.uid) setOrder(next);
    });
    return () => unsub();
  }, [orderId, user?.uid]);

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
  const canConfirmReceipt =
    !!order &&
    (txStatus === 'DELIVERED_PENDING_CONFIRMATION' ||
     txStatus === 'OUT_FOR_DELIVERY' ||
     txStatus === 'DELIVERY_SCHEDULED' ||
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

  // Start at top when opening order detail (no auto-scroll from previous position)
  useEffect(() => {
    const prevRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    const main = document.querySelector('main');
    if (main) main.scrollTo({ top: 0, left: 0 });
    const raf = requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      if (main) main.scrollTo({ top: 0, left: 0 });
    });
    return () => {
      cancelAnimationFrame(raf);
      window.history.scrollRestoration = prevRestoration;
    };
  }, [orderId]);

  useEffect(() => {
    if (!issueParam) return;
    const el = document.getElementById('report-issue');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [issueParam]);

  // When buyer must set delivery address first, open the modal after a short delay so they're prompted immediately
  const hasOpenedAddressModalRef = useRef(false);
  useEffect(() => {
    if (!order?.id || issueParam) return;
    const txStatus = getEffectiveTransactionStatus(order);
    const needsAddress = txStatus === 'FULFILLMENT_REQUIRED' && !order.delivery?.buyerAddress;
    if (!needsAddress || hasOpenedAddressModalRef.current) return;
    hasOpenedAddressModalRef.current = true;
    const t = setTimeout(() => setSetAddressModalOpen(true), 400);
    return () => clearTimeout(t);
  }, [order?.id, order?.delivery?.buyerAddress, order?.transactionStatus, issueParam]);

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
                <Badge variant="outline" className="font-semibold text-xs capitalize">
                  {String(order.status || '').replaceAll('_', ' ')}
                </Badge>
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
                If delivery arrived, mark it delivered (confirm receipt). If something isn’t right, report an issue so we can review. Payments are processed by Stripe; we do not hold or release payouts.
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
                {processing === 'confirm' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Confirm receipt
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Next Action Banner — hidden when only action is "Set delivery address" (that reminder lives in Order Progress footer to avoid duplicate) */}
        {!(txStatus === 'FULFILLMENT_REQUIRED' && !order.delivery?.buyerAddress) && (
          <NextActionBanner
            order={order}
            role="buyer"
            onAction={() => {
              const st = getEffectiveTransactionStatus(order);
              if (st === 'FULFILLMENT_REQUIRED' && !order.delivery?.buyerAddress) {
                setSetAddressModalOpen(true);
              } else if (st === 'DELIVERED_PENDING_CONFIRMATION') {
                const el = document.getElementById('confirm-receipt-section');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              } else if (st === 'DELIVERY_PROPOSED') {
                const el = document.getElementById('agree-delivery');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
          />
        )}

        {/* Compliance Transfer Panel (for regulated whitetail deals) */}
        <ComplianceTransferPanel
          order={order}
          role="buyer"
          onConfirm={() => {
            // Reload order data
            loadOrder();
          }}
        />

        {/* Order Progress — timeline + scheduled window, actions, report issue */}
        <OrderMilestoneTimeline
          order={order}
          role="buyer"
          footer={
            <div id="fulfillment-section" className="space-y-3">
                  {/* Set delivery address — single reminder in Order Progress when needed (no duplicate with banner) */}
                  {txStatus === 'FULFILLMENT_REQUIRED' && !order.delivery?.buyerAddress && (
                    <>
                      <div id="set-delivery-address" className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <div className="font-semibold text-sm">Set delivery address</div>
                          <div className="text-xs text-muted-foreground">Add your delivery address or drop a pin. The seller will use it to propose a delivery date.</div>
                        </div>
                        <Button
                          variant="default"
                          disabled={processing !== null}
                          onClick={() => setSetAddressModalOpen(true)}
                        >
                          Set address
                        </Button>
                      </div>
                      <Separator />
                    </>
                  )}
                  {/* Delivery address — show on Order Progress once buyer has submitted it */}
                  {order.delivery?.buyerAddress && (
                    <div className="text-sm bg-green-50 dark:bg-green-950/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
                      <div className="font-semibold text-green-900 dark:text-green-100">Delivery address</div>
                      <div className="text-xs mt-1 text-green-800 dark:text-green-200 font-mono">
                        {[order.delivery.buyerAddress.line1, order.delivery.buyerAddress.line2, [order.delivery.buyerAddress.city, order.delivery.buyerAddress.state, order.delivery.buyerAddress.zip].filter(Boolean).join(', ')].filter(Boolean).join(', ')}
                        {order.delivery.buyerAddress.deliveryInstructions && ` — ${order.delivery.buyerAddress.deliveryInstructions}`}
                      </div>
                      {(order.delivery.buyerAddress.lat != null && order.delivery.buyerAddress.lng != null) && (
                        <a
                          href={`https://www.google.com/maps?q=${order.delivery.buyerAddress.lat},${order.delivery.buyerAddress.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary underline mt-1 inline-block"
                        >
                          View pin on map
                        </a>
                      )}
                    </div>
                  )}
                  {(order.delivery?.agreedWindow || (order.delivery?.eta && isValidNonEpochDate(new Date(order.delivery.eta)))) && (
                    <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded space-y-1">
                      {order.delivery?.agreedWindow ? (
                        <div><strong>Scheduled window:</strong> {formatDate(order.delivery.agreedWindow.start)} – {formatDate(order.delivery.agreedWindow.end)}</div>
                      ) : order.delivery?.eta && isValidNonEpochDate(new Date(order.delivery.eta)) ? (
                        <div><strong>Scheduled ETA:</strong> {formatDate(new Date(order.delivery.eta))}</div>
                      ) : null}
                      {order.delivery?.transporter?.name && <div><strong>Transporter:</strong> {order.delivery.transporter.name}</div>}
                      {order.delivery?.transporter?.phone && <div><strong>Phone:</strong> {order.delivery.transporter.phone}</div>}
                    </div>
                  )}
                  {(txStatus === 'DELIVERED_PENDING_CONFIRMATION' || txStatus === 'OUT_FOR_DELIVERY' || txStatus === 'DELIVERY_SCHEDULED') && (
                    <>
                      <div id="confirm-receipt-section" className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <div className="font-semibold text-sm">Confirm Receipt</div>
                          <div className="text-xs text-muted-foreground">Confirm you received the order to complete the transaction. Only you can complete it—the seller does not mark delivery.</div>
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
                  {txStatus === 'DELIVERY_PROPOSED' && order.delivery?.windows?.length && (
                    <div id="agree-delivery">
                      <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded space-y-1 mb-2">
                        <div><strong>Seller proposed:</strong> Pick one window that works for you.</div>
                        {order.delivery.transporter?.name && <div><strong>Hauler:</strong> {order.delivery.transporter.name}</div>}
                      </div>
                      <div className="space-y-2">
                        <div className="font-semibold text-sm">Agree to delivery window</div>
                        <div className="space-y-2">
                          {order.delivery.windows.map((w: any, idx: number) => {
                            const start = w?.start?.toDate ? w.start.toDate() : new Date(w?.start);
                            const end = w?.end?.toDate ? w.end.toDate() : new Date(w?.end);
                            return (
                              <Button
                                key={idx}
                                variant="outline"
                                className="w-full justify-start"
                                disabled={processing !== null}
                                onClick={async () => {
                                  try {
                                    setProcessing('confirm');
                                    await postAuthJson(`/api/orders/${order.id}/fulfillment/agree-delivery`, { agreedWindowIndex: idx });
                                    toast({ title: 'Success', description: 'Delivery window agreed. Seller will haul within this timeframe.' });
                                    const refreshed = await getOrderById(order.id);
                                    if (refreshed) setOrder(refreshed);
                                  } catch (e: any) {
                                    toast({ title: 'Error', description: e?.message || 'Failed to agree', variant: 'destructive' });
                                  } finally {
                                    setProcessing(null);
                                  }
                                }}
                              >
                                {start.toLocaleString()} – {end.toLocaleString()}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                      <Separator />
                    </div>
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
            </div>
          }
        />

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

        {/* Set delivery address modal — once saved, "Set delivery address" shows complete on the timeline and address appears in the footer below */}
        <Dialog open={setAddressModalOpen} onOpenChange={setSetAddressModalOpen}>
          <DialogContent
            overlayClassName="max-sm:top-16 max-sm:bottom-16 max-sm:left-0 max-sm:right-0"
            className="flex flex-col w-[calc(100%-1.5rem)] max-w-lg sm:max-w-xl mx-auto pl-5 pr-11 sm:pl-6 sm:pr-6 pt-4 pb-4 sm:pt-6 sm:pb-6 gap-3 sm:gap-4 max-sm:max-h-[calc(100dvh-8rem)] sm:max-h-[90vh]"
          >
            <DialogHeader className="flex-shrink-0 space-y-1.5 text-left">
              <DialogTitle className="text-base sm:text-lg pr-6">Set delivery address</DialogTitle>
              <DialogDescription className="text-left text-xs sm:text-sm">
                Add your delivery address or drop a pin. The seller will use it to propose a delivery date.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-1 px-3 min-w-0">
              <div className="min-w-0">
                <label className="font-medium text-foreground text-sm">Street address *</label>
                <Input
                  value={deliveryAddressForm.line1}
                  onChange={(e) => setDeliveryAddressForm((f) => ({ ...f, line1: e.target.value }))}
                  placeholder="123 Main St"
                  className="mt-1 w-full min-w-0"
                />
              </div>
              <div className="min-w-0">
                <label className="font-medium text-foreground text-sm">Apt, suite, etc. (optional)</label>
                <Input
                  value={deliveryAddressForm.line2}
                  onChange={(e) => setDeliveryAddressForm((f) => ({ ...f, line2: e.target.value }))}
                  placeholder="Unit 4"
                  className="mt-1 w-full min-w-0"
                />
              </div>
              {/* City, State, ZIP on one row — compact and familiar */}
              <div className="flex flex-wrap gap-x-3 gap-y-3 sm:gap-x-2 sm:gap-y-0">
                <div className="flex-1 min-w-0 sm:min-w-[120px]">
                  <label className="font-medium text-foreground text-sm">City *</label>
                  <Input
                    value={deliveryAddressForm.city}
                    onChange={(e) => setDeliveryAddressForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder="City"
                    className="mt-1 w-full min-w-0"
                  />
                </div>
                <div className="w-16 shrink-0">
                  <label className="font-medium text-foreground text-sm">State *</label>
                  <Input
                    value={deliveryAddressForm.state}
                    onChange={(e) => setDeliveryAddressForm((f) => ({ ...f, state: e.target.value.toUpperCase().slice(0, 2) }))}
                    placeholder="TX"
                    className="mt-1 w-full"
                  />
                </div>
                <div className="w-24 shrink-0">
                  <label className="font-medium text-foreground text-sm">ZIP *</label>
                  <Input
                    value={deliveryAddressForm.zip}
                    onChange={(e) => setDeliveryAddressForm((f) => ({ ...f, zip: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                    placeholder="12345"
                    className="mt-1 w-full"
                  />
                </div>
              </div>
              <div className="min-w-0">
                <label className="font-medium text-foreground text-sm">Delivery instructions (optional)</label>
                <Input
                  value={deliveryAddressForm.deliveryInstructions}
                  onChange={(e) => setDeliveryAddressForm((f) => ({ ...f, deliveryInstructions: e.target.value }))}
                  placeholder="Gate code, gate left open, etc."
                  className="mt-1 w-full min-w-0"
                />
              </div>
              <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 min-w-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto shrink-0"
                  disabled={processing === 'set_address' || processing === 'location'}
                  onClick={() => {
                    if (!navigator.geolocation) {
                      toast({ title: 'Not supported', description: 'Location is not available in this browser.', variant: 'destructive' });
                      return;
                    }
                    setProcessing('location');
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setDeliveryAddressForm((f) => ({ ...f, lat: pos.coords.latitude, lng: pos.coords.longitude, pinLabel: 'My location' }));
                        toast({ title: 'Location captured', description: 'Pin set to your current location. Seller will see this on a map.' });
                        setProcessing(null);
                      },
                      () => {
                        toast({ title: 'Could not get location', description: 'Check permissions or enter address manually.', variant: 'destructive' });
                        setProcessing(null);
                      },
                      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
                    );
                  }}
                >
                  {processing === 'location' ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <MapPin className="h-4 w-4 shrink-0" />}
                  <span className="ml-2 truncate">Use my location (add pin for seller)</span>
                </Button>
                {(deliveryAddressForm.lat != null && deliveryAddressForm.lng != null) && (
                  <span className="text-xs text-muted-foreground truncate min-w-0">
                    Pin set: {deliveryAddressForm.pinLabel || `${deliveryAddressForm.lat.toFixed(4)}, ${deliveryAddressForm.lng.toFixed(4)}`}
                  </span>
                )}
              </div>
            </div>
            <DialogFooter className="flex-shrink-0 border-t pt-4 gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setSetAddressModalOpen(false)} className="w-full sm:w-auto">Cancel</Button>
              <Button
                className="w-full sm:w-auto"
                disabled={!deliveryAddressForm.line1.trim() || !deliveryAddressForm.city.trim() || !deliveryAddressForm.state.trim() || !deliveryAddressForm.zip.trim() || processing === 'set_address' || processing === 'location'}
                onClick={async () => {
                  try {
                    setProcessing('set_address');
                    const payload = {
                      line1: String(deliveryAddressForm.line1 ?? '').trim(),
                      city: String(deliveryAddressForm.city ?? '').trim(),
                      state: String(deliveryAddressForm.state ?? '').trim(),
                      zip: String(deliveryAddressForm.zip ?? '').trim(),
                    } as Record<string, unknown>;
                    if (deliveryAddressForm.line2?.trim()) payload.line2 = deliveryAddressForm.line2.trim();
                    if (deliveryAddressForm.deliveryInstructions?.trim()) payload.deliveryInstructions = deliveryAddressForm.deliveryInstructions.trim();
                    if (typeof deliveryAddressForm.lat === 'number' && typeof deliveryAddressForm.lng === 'number') {
                      payload.lat = deliveryAddressForm.lat;
                      payload.lng = deliveryAddressForm.lng;
                    }
                    if (deliveryAddressForm.pinLabel?.trim()) payload.pinLabel = deliveryAddressForm.pinLabel.trim();
                    await postAuthJson(`/api/orders/${order.id}/set-delivery-address`, payload);
                    toast({ title: 'Address saved', description: 'The seller will use it to propose a delivery date.' });
                    const refreshed = await getOrderById(order.id);
                    if (refreshed) setOrder(refreshed);
                    setSetAddressModalOpen(false);
                  } catch (e: any) {
                    toast({ title: 'Error', description: e?.message || 'Failed to save address', variant: 'destructive' });
                  } finally {
                    setProcessing(null);
                  }
                }}
              >
                {processing === 'set_address' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</> : 'Set address'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

