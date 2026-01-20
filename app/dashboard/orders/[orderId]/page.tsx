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

import { useEffect, useMemo, useState } from 'react';
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
import { Loader2, AlertTriangle, ArrowLeft, CheckCircle2, MapPin, Package, User } from 'lucide-react';
import type { ComplianceDocument, Listing, Order } from '@/lib/types';
import { getOrderById } from '@/lib/firebase/orders';
import { getListingById } from '@/lib/firebase/listings';
import { getDocuments } from '@/lib/firebase/documents';
import { DocumentUpload } from '@/components/compliance/DocumentUpload';
import { TransactionTimeline } from '@/components/orders/TransactionTimeline';
import { confirmReceipt, disputeOrder } from '@/lib/stripe/api';
import { getOrderIssueState } from '@/lib/orders/getOrderIssueState';
import { getOrderTrustState } from '@/lib/orders/getOrderTrustState';

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
  const [processing, setProcessing] = useState<'confirm' | 'dispute' | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!user?.uid || !orderId) return;
      setLoading(true);
      setError(null);
      try {
        const o = await getOrderById(orderId);
        if (!o) throw new Error('Order not found');
        if (o.buyerId !== user.uid) throw new Error('You can only view your own orders.');

        const l = await getListingById(o.listingId);
        const bos = await getDocuments('order', o.id, 'BILL_OF_SALE').catch(() => []);

        if (cancelled) return;
        setOrder(o);
        setListing(l || null);
        setBillOfSaleDocs(bos);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load order');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (!authLoading) void load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, orderId, user?.uid]);

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

  const canConfirmReceipt = !!order && ['paid', 'paid_held', 'in_transit', 'delivered'].includes(order.status) && !order.stripeTransferId;
  const canDispute = !!order && ['paid', 'paid_held', 'in_transit', 'delivered'].includes(order.status) && !order.stripeTransferId;

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
                Confirm receipt if delivery arrived, or report an issue so we can review before payout is released.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
              <div className="text-sm text-muted-foreground">
                Funds are held securely until delivery and issue windows are complete.
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
                      description: 'Thanks—your confirmation helps us release funds safely.',
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
                Yes, delivery arrived
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <TransactionTimeline order={order} role="buyer" />

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Next actions</CardTitle>
              <CardDescription>These actions reflect the current backend-truth state of this order.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold text-sm">Confirm receipt</div>
                  <div className="text-xs text-muted-foreground">Only confirm after delivery is complete.</div>
                </div>
                <Button
                  disabled={!canConfirmReceipt || processing !== null}
                  onClick={async () => {
                    try {
                      setProcessing('confirm');
                      await confirmReceipt(order.id);
                      toast({ title: 'Receipt confirmed', description: 'Funds remain held until admin release.' });
                      const refreshed = await getOrderById(order.id);
                      if (refreshed) setOrder(refreshed);
                    } catch (e: any) {
                      toast({ title: 'Error', description: e?.message || 'Failed to confirm receipt', variant: 'destructive' });
                    } finally {
                      setProcessing(null);
                    }
                  }}
                >
                  {processing === 'confirm' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Confirm receipt
                </Button>
              </div>
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
        </div>
      </div>
    </div>
  );
}

