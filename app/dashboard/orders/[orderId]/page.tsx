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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, AlertTriangle, ArrowLeft, Camera, CheckCircle2, MapPin, Package, User } from 'lucide-react';
import type { ComplianceDocument, Listing, Order, TransactionStatus } from '@/lib/types';
import { getOrderById, subscribeToOrder } from '@/lib/firebase/orders';
import { getListingById } from '@/lib/firebase/listings';
import { getDocuments } from '@/lib/firebase/documents';
import { DocumentUpload } from '@/components/compliance/DocumentUpload';
import { OrderDocumentsPanel } from '@/components/orders/OrderDocumentsPanel';
import { ComplianceTransferPanel } from '@/components/orders/ComplianceTransferPanel';
import { OrderMilestoneTimeline } from '@/components/orders/OrderMilestoneTimeline';
import { DeliveryTrackingCard } from '@/components/orders/DeliveryTrackingCard';
import { confirmReceipt, disputeOrder } from '@/lib/stripe/api';
import { getOrderIssueState } from '@/lib/orders/getOrderIssueState';
import { getOrderTrustState } from '@/lib/orders/getOrderTrustState';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import { ORDER_COPY, getStatusLabel } from '@/lib/orders/copy';
import { formatDate, isValidNonEpochDate } from '@/lib/utils';
import { formatUserFacingError } from '@/lib/format-user-facing-error';
import { AddressPickerModal, type SetDeliveryAddressPayload } from '@/components/address/AddressPickerModal';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const useAddressPicker =
  typeof process !== 'undefined' &&
  !!(process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY?.trim() || process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim());

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
  const [processing, setProcessing] = useState<'confirm' | 'dispute' | null>(null);
  const [setAddressModalOpen, setSetAddressModalOpen] = useState(false);
  const [confirmReceivedChecked, setConfirmReceivedChecked] = useState(false);
  const [checkinDialogConfirmReceived, setCheckinDialogConfirmReceived] = useState(false);
  const [sendPhotosPromptOpen, setSendPhotosPromptOpen] = useState(false);
  const [sendPhotosModalOpen, setSendPhotosModalOpen] = useState(false);
  const [outForDeliveryExpanded, setOutForDeliveryExpanded] = useState(true);

  const SEND_PHOTOS_PROMPT_KEY = 'we:send-photos-prompted:v1';

  const handleConfirmReceiptSuccess = useCallback((ordId: string, fromCheckin?: boolean) => {
    toast({
      title: 'Receipt confirmed',
      description: order?.protectedTransactionDaysSnapshot ? 'Delivery confirmed. Your post-delivery review window is now active.' : 'This sale is final.',
    });
    getOrderById(ordId).then((o) => { if (o) setOrder(o); });
    if (fromCheckin) {
      setCheckinDialogConfirmReceived(false);
      router.replace(`/dashboard/orders/${ordId}`);
    }
    try {
      if (!localStorage.getItem(`${SEND_PHOTOS_PROMPT_KEY}:${ordId}`)) {
        setSendPhotosPromptOpen(true);
      }
    } catch { /* ignore */ }
  }, [toast, router, order?.protectedTransactionDaysSnapshot]);

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
      if (!cancelledRef?.current) setError(formatUserFacingError(e, 'Failed to load order'));
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

  const setAddressParamHandledRef = useRef(false);
  // When arriving with ?setAddress=1 (e.g. from congrats modal "Set delivery address"), open the modal once order is ready
  useEffect(() => {
    if (!order || setAddressParamHandledRef.current) return;
    const wantSetAddress = searchParams?.get('setAddress') === '1';
    if (!wantSetAddress) return;
    const status = getEffectiveTransactionStatus(order);
    const canSet = ['FULFILLMENT_REQUIRED', 'AWAITING_TRANSFER_COMPLIANCE'].includes(status);
    const needsAddress = !order.delivery?.buyerAddress;
    if (canSet && needsAddress) {
      setAddressParamHandledRef.current = true;
      setSetAddressModalOpen(true);
      // Remove param from URL so refresh doesn't reopen
      const url = new URL(window.location.href);
      url.searchParams.delete('setAddress');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, [order, searchParams]);

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
                <Badge variant="outline" className="font-semibold text-xs">
                  {getStatusLabel(txStatus ?? '')}
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
            if (!open) {
              router.replace(`/dashboard/orders/${order.id}`);
              setCheckinDialogConfirmReceived(false);
            }
          }}
        >
          <DialogContent className="max-w-lg" aria-describedby="checkin-desc">
            <DialogHeader>
              <DialogTitle>Delivery check-in</DialogTitle>
              <DialogDescription id="checkin-desc">
                If delivery arrived, confirm receipt to complete the transaction. If something isn’t right, report an issue so we can review.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="checkin-confirm-received"
                  checked={checkinDialogConfirmReceived}
                  onCheckedChange={(c) => setCheckinDialogConfirmReceived(!!c)}
                />
                <Label htmlFor="checkin-confirm-received" className="cursor-pointer text-sm font-medium leading-tight">
                  I confirm the animal was received.
                </Label>
              </div>
              {!order.protectedTransactionDaysSnapshot && (
                <p className="text-xs text-muted-foreground">
                  This listing does not include a post-delivery review window. Confirming delivery makes the sale final.
                </p>
              )}
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
                disabled={!canConfirmReceipt || !checkinDialogConfirmReceived || processing !== null}
                onClick={async () => {
                  try {
                    setProcessing('confirm');
                    await confirmReceipt(order.id);
                    handleConfirmReceiptSuccess(order.id, true);
                  } catch (e: any) {
                    toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to confirm receipt'), variant: 'destructive' });
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

        {/* Post-confirm receipt: prompt to send photos (shown once per order) */}
        <Dialog
          open={sendPhotosPromptOpen}
          onOpenChange={(open) => {
            setSendPhotosPromptOpen(open);
            if (!open && order?.id) {
              try { localStorage.setItem(`${SEND_PHOTOS_PROMPT_KEY}:${order.id}`, '1'); } catch { /* ignore */ }
            }
          }}
        >
          <DialogContent className="max-w-md" aria-describedby="send-photos-prompt-desc">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Receipt confirmed
              </DialogTitle>
              <DialogDescription id="send-photos-prompt-desc">
                Would you like to add photos of the delivery? Optional — helps document the transaction.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => {
                  setSendPhotosPromptOpen(false);
                  if (order?.id) {
                    try { localStorage.setItem(`${SEND_PHOTOS_PROMPT_KEY}:${order.id}`, '1'); } catch { /* ignore */ }
                  }
                }}
              >
                Skip
              </Button>
              <Button
                onClick={() => {
                  setSendPhotosPromptOpen(false);
                  if (order?.id) {
                    try { localStorage.setItem(`${SEND_PHOTOS_PROMPT_KEY}:${order.id}`, '1'); } catch { /* ignore */ }
                  }
                  setSendPhotosModalOpen(true);
                }}
              >
                <Camera className="h-4 w-4 mr-2" />
                Add photos
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Send photos modal — DocumentUpload for OTHER (receipt photos) */}
        <Dialog open={sendPhotosModalOpen} onOpenChange={setSendPhotosModalOpen}>
          <DialogContent className="flex flex-col max-h-[90dvh] sm:max-h-[90vh] overflow-hidden max-w-lg">
            <DialogHeader>
              <DialogTitle>Add photos of delivery</DialogTitle>
              <DialogDescription>
                Optional photos of the animal or item at delivery. These help document the transaction.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto py-2">
              {order && (
                <DocumentUpload
                  entityType="order"
                  entityId={order.id}
                  documentType="OTHER"
                  onUploadComplete={() => {
                    toast({ title: 'Photos added', description: 'Your photos have been uploaded.' });
                    setSendPhotosModalOpen(false);
                  }}
                  required={false}
                  uploadTrigger
                />
              )}
            </div>
            <DialogFooter className="border-t pt-3">
              <Button variant="outline" onClick={() => setSendPhotosModalOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Compliance Transfer Panel (for regulated whitetail deals) */}
        <ComplianceTransferPanel
          order={order}
          role="buyer"
          onConfirm={() => {
            // Reload order data
            loadOrder();
          }}
        />

        {/* Order Progress — unified timeline with step-specific info under each milestone */}
        <OrderMilestoneTimeline
          order={order}
          role="buyer"
          renderMilestoneDetail={(milestone, o) => {
            if (milestone.key === 'set_delivery_address') {
              if (milestone.isComplete && o.delivery?.buyerAddress) {
                return (
                  <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3 sm:p-4 text-sm">
                    <div className="font-medium text-foreground/90">Delivery address</div>
                    <div className="mt-0.5 text-muted-foreground text-xs font-mono break-words">
                      {[o.delivery.buyerAddress.line1, o.delivery.buyerAddress.line2, [o.delivery.buyerAddress.city, o.delivery.buyerAddress.state, o.delivery.buyerAddress.zip].filter(Boolean).join(', ')].filter(Boolean).join(', ')}
                      {o.delivery.buyerAddress.deliveryInstructions && ` · ${o.delivery.buyerAddress.deliveryInstructions}`}
                    </div>
                    {(o.delivery.buyerAddress.lat != null && o.delivery.buyerAddress.lng != null) && (
                      <a href={`https://www.google.com/maps?q=${o.delivery.buyerAddress.lat},${o.delivery.buyerAddress.lng}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline mt-1 inline-block">View on map</a>
                    )}
                  </div>
                );
              }
              if (milestone.isCurrent && txStatus === 'FULFILLMENT_REQUIRED' && !o.delivery?.buyerAddress) {
                return (
                  <div id="set-delivery-address" className="mt-3 rounded-lg border-2 border-primary/30 bg-primary/5 p-4 sm:p-5 scroll-mt-24">
                    <p className="text-sm text-muted-foreground leading-relaxed">Add your address or drop a pin so the seller can propose a delivery date.</p>
                    <Button className="mt-3 w-full sm:w-auto min-h-[44px] touch-manipulation" disabled={!!processing} onClick={() => setSetAddressModalOpen(true)}>
                      Set address
                    </Button>
                  </div>
                );
              }
            }
            if (milestone.key === 'agree_delivery') {
              if (milestone.isComplete && (o.delivery?.agreedWindow || (o.delivery?.eta && isValidNonEpochDate(new Date(o.delivery.eta))))) {
                return (
                  <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground break-words">
                    <strong className="text-foreground/80">Scheduled:</strong>{' '}
                    {o.delivery?.agreedWindow ? `${formatDate(o.delivery.agreedWindow.start)} – ${formatDate(o.delivery.agreedWindow.end)}` : formatDate(new Date(o.delivery!.eta!))}
                    {(o.delivery as any)?.notes && <> · <strong>Notes:</strong> {(o.delivery as any).notes}</>}
                  </div>
                );
              }
              if (milestone.isCurrent && txStatus === 'DELIVERY_PROPOSED' && o.delivery?.windows?.length) {
                return (
                  <div id="choose-delivery-date" className="mt-3 scroll-mt-24 rounded-lg border-2 border-primary/30 bg-primary/5 p-4 sm:p-5">
                    <p className="text-sm text-muted-foreground leading-relaxed">{ORDER_COPY.chooseDeliveryDate.description}</p>
                    {(o.delivery as any)?.notes && (
                      <div className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground/80">Notes from seller:</span> {(o.delivery as any).notes}
                      </div>
                    )}
                    <div className="mt-4 space-y-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Available times</p>
                      {o.delivery.windows.map((w: any, idx: number) => {
                        const start = w?.start?.toDate ? w.start.toDate() : new Date(w?.start);
                        const end = w?.end?.toDate ? w.end.toDate() : new Date(w?.end);
                        return (
                          <button
                            key={idx}
                            type="button"
                            disabled={!!processing}
                            className="flex w-full flex-col items-stretch gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/30 disabled:opacity-60 disabled:pointer-events-none sm:flex-row sm:items-center sm:justify-between sm:gap-4 min-h-[56px] touch-manipulation"
                            onClick={async () => {
                              try {
                                setProcessing('confirm');
                                await postAuthJson(`/api/orders/${o.id}/fulfillment/agree-delivery`, { agreedWindowIndex: idx });
                                toast({ title: 'Date chosen', description: 'Seller will deliver within this timeframe.' });
                                const refreshed = await getOrderById(o.id);
                                if (refreshed) setOrder(refreshed);
                              } catch (e: any) {
                                toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to save'), variant: 'destructive' });
                              } finally {
                                setProcessing(null);
                              }
                            }}
                          >
                            <div className="min-w-0">
                              <div className="font-medium text-foreground">{start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
                              <div className="text-sm text-muted-foreground mt-0.5">{start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} – {end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</div>
                            </div>
                            <div className="shrink-0">
                              {processing ? (
                                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Choosing…</span>
                              ) : (
                                <span className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{ORDER_COPY.chooseDeliveryDate.chooseThisDate}</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }
            }
            if (milestone.key === 'out_for_delivery') {
              if (milestone.isCurrent && txStatus === 'DELIVERY_SCHEDULED') {
                return (
                  <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
                    The seller will start delivery during the scheduled window. You can confirm receipt once it arrives.
                  </div>
                );
              }
              if ((milestone.isCurrent || milestone.isComplete) && txStatus === 'OUT_FOR_DELIVERY') {
                const qrSignedAt = (o.delivery as any)?.confirmedMethod === 'qr_public' && (o.delivery as any)?.confirmedAt;
                return (
                  <Collapsible open={outForDeliveryExpanded} onOpenChange={setOutForDeliveryExpanded} className="mt-3">
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground w-full justify-start rounded px-2 py-1 -mx-2 -my-1">
                      <MapPin className="h-4 w-4" />
                      {outForDeliveryExpanded ? 'Hide' : 'Show'} live tracking & delivery info
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <DeliveryTrackingCard order={o} role="buyer" currentUserUid={user?.uid ?? null} onStartTracking={async () => {}} onStopTracking={async () => {}} onMarkDelivered={async () => {}} />
                      {!order?.deliveryTracking?.enabled && (
                        <p className="mt-3 text-sm text-muted-foreground">
                          Live tracking will appear when the seller starts delivery. The driver may share a QR for you to sign at delivery.
                        </p>
                      )}
                      {qrSignedAt && (
                        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm">
                          <span className="font-medium text-primary">You signed for delivery</span>
                          <span className="text-muted-foreground">
                            {' '}at {formatDate((o.delivery as any).confirmedAt)}
                          </span>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                );
              }
            }
            if (milestone.key === 'confirm_receipt') {
              if (milestone.isCurrent && (txStatus === 'DELIVERED_PENDING_CONFIRMATION' || txStatus === 'OUT_FOR_DELIVERY')) {
                return (
                  <div id="confirm-receipt-section" className="mt-3 rounded-lg border-2 border-primary/30 bg-primary/5 p-4 sm:p-5 scroll-mt-24">
                    <p className="text-sm text-muted-foreground leading-relaxed">Only you can complete the transaction. The seller does not mark delivery.</p>
                    <div className="mt-3 flex items-start gap-3 min-h-[44px]">
                      <Checkbox id="confirm-received" checked={confirmReceivedChecked} onCheckedChange={(c) => setConfirmReceivedChecked(!!c)} className="mt-0.5 shrink-0" />
                      <Label htmlFor="confirm-received" className="cursor-pointer text-sm font-medium leading-tight flex-1 py-2 touch-manipulation">I confirm the animal was received.</Label>
                    </div>
                    {!o.protectedTransactionDaysSnapshot && <p className="text-xs text-muted-foreground mt-2">Confirming makes the sale final.</p>}
                    <Button className="mt-3 w-full sm:w-auto min-h-[44px] touch-manipulation" disabled={!canConfirmReceipt || !confirmReceivedChecked || !!processing} onClick={async () => {
                      try {
                        setProcessing('confirm');
                        await confirmReceipt(o.id);
                        handleConfirmReceiptSuccess(o.id);
                      } catch (e: any) {
                        toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to confirm receipt'), variant: 'destructive' });
                      } finally {
                        setProcessing(null);
                      }
                    }}>
                      {processing === 'confirm' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />} Confirm receipt
                    </Button>
                  </div>
                );
              }
              if (milestone.isComplete && txStatus === 'COMPLETED') {
                if (o.protectedTransactionDaysSnapshot && (o.buyerConfirmedAt ?? o.buyerAcceptedAt ?? o.acceptedAt)) {
                  const confirmedAt = o.buyerConfirmedAt ?? o.buyerAcceptedAt ?? o.acceptedAt;
                  const windowEnd = new Date(confirmedAt!.getTime() + o.protectedTransactionDaysSnapshot! * 24 * 60 * 60 * 1000);
                  const withinWindow = Date.now() < windowEnd.getTime();
                  const hoursLeft = (windowEnd.getTime() - Date.now()) / (1000 * 60 * 60);
                  const daysLeft = Math.floor(hoursLeft / 24);
                  const hrs = Math.floor(hoursLeft % 24);
                  const endsInLabel = daysLeft > 0 ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''} ${hrs}h` : `${Math.max(0, Math.floor(hoursLeft))} hours`;
                  return withinWindow ? (
                    <div id="report-issue" className="mt-3 space-y-3 scroll-mt-24">
                      <div className="text-sm text-muted-foreground">Post-delivery review window active — ends in {endsInLabel}</div>
                      <Button variant="outline" className="w-full sm:w-auto min-h-[44px] touch-manipulation" disabled={processing !== null} onClick={async () => {
                        try {
                          setProcessing('dispute');
                          await disputeOrder(o.id, 'Delivery-related issue', 'Report a delivery-related issue');
                          toast({ title: 'Issue reported', description: 'We’ll review and follow up. Claims require proof.' });
                          const refreshed = await getOrderById(o.id);
                          if (refreshed) setOrder(refreshed);
                        } catch (e: any) {
                          toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to report issue'), variant: 'destructive' });
                        } finally {
                          setProcessing(null);
                        }
                      }}>
                        {processing === 'dispute' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        Report a delivery-related issue
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">This sale is final.</p>
                  );
                }
                return <p className="mt-3 text-sm text-muted-foreground">This sale is final.</p>;
              }
            }
            return null;
          }}
          footer={
            txStatus !== 'COMPLETED' ? (
              <div id="report-issue" className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 scroll-mt-24 pt-2">
                <div>
                  <div className="font-semibold text-sm">Report an issue</div>
                  <div className="text-xs text-muted-foreground">If something isn’t right, report it for review.</div>
                </div>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto min-h-[44px] touch-manipulation shrink-0"
                  disabled={!canDispute || processing !== null}
                  onClick={async () => {
                    try {
                      setProcessing('dispute');
                      await disputeOrder(order.id, 'Issue reported', 'Opened from order page');
                      toast({ title: 'Issue reported', description: 'We’ll review and follow up.' });
                      const refreshed = await getOrderById(order.id);
                      if (refreshed) setOrder(refreshed);
                    } catch (e: any) {
                      toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to report issue'), variant: 'destructive' });
                    } finally {
                      setProcessing(null);
                    }
                  }}
                >
                  {processing === 'dispute' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Report an issue
                </Button>
              </div>
            ) : null
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

        {/* Set delivery address: single HEB-style modal (saved addresses + Places/map when key set, or manual form when not) */}
        {user?.uid && order && (
          <AddressPickerModal
            open={setAddressModalOpen}
            onOpenChange={setSetAddressModalOpen}
            orderId={order.id}
            userId={user.uid}
            existingDeliveryAddress={order.delivery?.buyerAddress ?? undefined}
            manualOnly={!useAddressPicker}
            onSetDeliveryAddress={async (ordId, payload: SetDeliveryAddressPayload) => {
              await postAuthJson(`/api/orders/${ordId}/set-delivery-address`, payload);
              toast({ title: 'Address saved', description: 'The seller will use it to propose a delivery date.' });
              const refreshed = await getOrderById(ordId);
              if (refreshed) setOrder(refreshed);
            }}
            onSuccess={() => setSetAddressModalOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

