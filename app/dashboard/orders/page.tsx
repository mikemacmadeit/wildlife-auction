'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { DashboardContentSkeleton } from '@/components/skeletons/DashboardContentSkeleton';
import { Package, CheckCircle, Clock, XCircle, Loader2, AlertTriangle, ArrowRight, MapPin, User, MoreVertical, Search, Truck, Filter, PartyPopper } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getOrderByCheckoutSessionId, getOrdersForUser } from '@/lib/firebase/orders';
import { getListingById } from '@/lib/firebase/listings';
import { Order, OrderStatus, TransactionStatus } from '@/lib/types';
import { confirmReceipt, disputeOrder } from '@/lib/stripe/api';
import { TransactionTimeline } from '@/components/orders/TransactionTimeline';
import { deriveOrderUIState, type PurchasesStatusKey } from '@/lib/orders/deriveOrderUIState';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import { getNextRequiredAction, getUXBadge } from '@/lib/orders/progress';
import { cn } from '@/lib/utils';
import { formatUserFacingError } from '@/lib/format-user-facing-error';
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
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface OrderWithListing extends Order {
  listingTitle?: string;
  listingType?: string;
  listingPhotoURL?: string;
  listingLocationLabel?: string;
  sellerDisplayName?: string;
  sellerPhotoURL?: string;
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
  const [showCongratsModal, setShowCongratsModal] = useState(false);
  const reconcileAttemptedRef = useRef<Record<string, boolean>>({});

  // eBay-style controls (client-side filtering; avoids extra Firestore reads)
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<PurchasesStatusKey | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'30' | '90' | '365' | 'all'>('90');
  const [needsActionOnly, setNeedsActionOnly] = useState(false);

  // Detail drawer
  const [drawerOrderId, setDrawerOrderId] = useState<string | null>(null);

  const getListingCoverPhotoURL = (listing: any): string | null => {
    // Prefer `photos` snapshot; fall back to legacy `images`.
    const photos = Array.isArray(listing?.photos) ? listing.photos : [];
    if (photos.length) {
      const sorted = [...photos].sort((a, b) => Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0));
      const url = sorted.find((p) => typeof p?.url === 'string' && p.url.trim())?.url;
      if (url) return String(url);
    }
    const images = Array.isArray(listing?.images) ? listing.images : [];
    const url2 = images.find((u: any) => typeof u === 'string' && u.trim());
    return url2 ? String(url2) : null;
  };

  const enrichSnapshotsBestEffort = useCallback(
    async (orderIds: string[]) => {
      if (!user) return;
      const unique = Array.from(new Set(orderIds.map((x) => String(x).trim()).filter(Boolean))).slice(0, 20);
      if (unique.length === 0) return;
      try {
        const token = await user.getIdToken();
        await fetch('/api/orders/enrich-snapshots', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ orderIds: unique }),
        }).catch(() => null);
      } catch {
        // best-effort: never block UI
      }
    },
    [user]
  );

  const loadOrders = useCallback(async (opts?: { silent?: boolean }): Promise<OrderWithListing[] | void> => {
    if (!user) {
      if (!opts?.silent) setLoading(false);
      return;
    }
    try {
      if (!opts?.silent) setLoading(true);
      if (!opts?.silent) setError(null);
      // getOrdersForUser(..., 'buyer') excludes awaiting-payment orders (pending / awaiting_bank_transfer /
      // awaiting_wire), so "My purchases" only shows orders created after payment.
      const userOrders = await getOrdersForUser(user.uid, 'buyer');
      const missingSnapshotOrderIds: string[] = [];

      const ordersWithListings = await Promise.all(
        userOrders.map(async (order) => {
          try {
            // Fast path: use server-authored snapshots (no listing read).
            if (order.listingSnapshot?.title) {
              return {
                ...order,
                listingTitle: order.listingSnapshot.title,
                listingType: (order.listingSnapshot.type as any) || 'unknown',
                listingPhotoURL: order.listingSnapshot.coverPhotoUrl || undefined,
                listingLocationLabel: order.listingSnapshot.locationLabel || undefined,
                sellerDisplayName: order.sellerSnapshot?.displayName || 'Seller',
                sellerPhotoURL: order.sellerSnapshot?.photoURL || undefined,
              };
            }

            // Legacy fallback: fetch listing only if snapshot missing (avoids N+1 for new orders).
            const listing = await getListingById(order.listingId);
            const listingPhotoURL = listing ? getListingCoverPhotoURL(listing) : null;
            if (order?.id) missingSnapshotOrderIds.push(order.id);
            const locationLabel =
              listing?.location?.city && listing?.location?.state
                ? `${listing.location.city}, ${listing.location.state}`
                : listing?.location?.state
                  ? String(listing.location.state)
                  : null;

            const sellerDisplayName =
              String(listing?.sellerSnapshot?.displayName || '').trim() ||
              String((listing as any)?.seller?.name || '').trim() ||
              'Seller';
            const sellerPhotoURL = listing?.sellerSnapshot?.photoURL ? String(listing.sellerSnapshot.photoURL) : undefined;

            return {
              ...order,
              listingTitle: listing?.title || 'Listing not found',
              listingType: listing?.type || 'unknown',
              listingPhotoURL: listingPhotoURL || undefined,
              listingLocationLabel: locationLabel || undefined,
              sellerDisplayName,
              sellerPhotoURL,
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
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/dashboard/orders/page.tsx:loadOrders',message:'loadOrders completed',data:{ordersLength:ordersWithListings.length,orderIds:ordersWithListings.slice(0,5).map((o:OrderWithListing)=>o.id)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H5,H2'})}).catch(()=>{});
      // #endregion

      // Best-effort: backfill snapshots for legacy orders so future loads are fast.
      // NOTE: We intentionally do this AFTER setting UI state so it never blocks page load.
      if (missingSnapshotOrderIds.length > 0) {
        void enrichSnapshotsBestEffort(missingSnapshotOrderIds);
      }
      return ordersWithListings;
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError(formatUserFacingError(err, 'Failed to load orders'));
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [enrichSnapshotsBestEffort, user]);

  // Persist pending checkout state across navigation (prevents “it disappeared when I clicked away”).
  useEffect(() => {
    const key = 'we:pending-checkout:v1';
    if (pendingCheckout) {
      try {
        sessionStorage.setItem(key, JSON.stringify(pendingCheckout));
      } catch {
        // ignore
      }
      return;
    }
    // Restore once if present and still fresh.
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PendingCheckout;
      if (!parsed?.sessionId || typeof parsed?.createdAtMs !== 'number') return;
      const ageMs = Date.now() - parsed.createdAtMs;
      if (ageMs > 2 * 60_000) {
        sessionStorage.removeItem(key);
        return;
      }
      setPendingCheckout(parsed);
    } catch {
      // ignore
    }
  }, [pendingCheckout]);

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
          // `/api/stripe/checkout/verify-session` returns `{ ok: true, session: {...}, isProcessing }`.
          const session = (data?.session && typeof data.session === 'object') ? data.session : {};
          const paymentStatus = String((session as any)?.payment_status || '');
          const isProcessing =
            data?.isProcessing === true ||
            paymentStatus === 'processing' ||
            paymentStatus === 'unpaid' ||
            paymentStatus === 'requires_action';
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

          if (!isProcessing) setShowCongratsModal(true);

          // Track this session so we can poll for the corresponding Firestore order.
          const listingIdFromMeta =
            (session as any)?.metadata?.listingId ? String((session as any).metadata.listingId) : null;
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/dashboard/orders/page.tsx:setPendingCheckout',message:'pendingCheckout set after verify-session',data:{sessionIdPrefix:sessionId.slice(0,18),isProcessing,listingId:listingIdFromMeta||null},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H4'})}).catch(()=>{});
          // #endregion
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

  // Start at top when opening Purchases; prevent any auto-scroll (restoration, dialog focus, layout)
  const scrollToTop = useCallback(() => {
    window.scrollTo(0, 0);
    document.querySelector('main')?.scrollTo({ top: 0, left: 0 });
  }, []);
  useEffect(() => {
    const prevRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    scrollToTop();
    const raf = requestAnimationFrame(() => scrollToTop());
    const t0 = setTimeout(scrollToTop, 0);
    const t1 = setTimeout(scrollToTop, 50);
    const t2 = setTimeout(scrollToTop, 150);
    const t3 = setTimeout(scrollToTop, 400);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.history.scrollRestoration = prevRestoration;
    };
  }, [scrollToTop]);
  // When congrats modal opens (e.g. after Stripe redirect), force top again so dialog focus doesn't scroll the page
  useEffect(() => {
    if (!showCongratsModal) return;
    scrollToTop();
    const raf = requestAnimationFrame(() => scrollToTop());
    const t = setTimeout(scrollToTop, 100);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [showCongratsModal, scrollToTop]);

  // Fetch orders when user is loaded
  useEffect(() => {
    if (!authLoading) {
      void loadOrders();
    }
  }, [authLoading, loadOrders]);

  // Fail-safe: if an order exists but is still pending (common when create-session pre-created the order
  // and webhook delivery was delayed), attempt a one-time reconcile using the stored checkout session id.
  useEffect(() => {
    let cancelled = false;
    if (!user?.uid) return;
    if (!orders.length) return;

    const candidates = orders
      .filter((o) => o.status === 'pending' && typeof (o as any).stripeCheckoutSessionId === 'string')
      .slice(0, 3);
    if (!candidates.length) return;

    (async () => {
      try {
        const token = await user.getIdToken();
        for (const o of candidates) {
          const sid = String((o as any).stripeCheckoutSessionId || '').trim();
          if (!sid || !sid.startsWith('cs_')) continue;
          if (reconcileAttemptedRef.current[sid]) continue;
          reconcileAttemptedRef.current[sid] = true;
          await fetch('/api/stripe/checkout/reconcile-session', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ session_id: sid }),
          }).catch(() => null);
        }
        if (cancelled) return;
        // Refresh silently after reconcile attempts (gives Firestore a moment to update).
        await loadOrders({ silent: true });
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally key off `orders` so it runs after initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, user?.uid]);

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
    const intervalMs = 5000;
    const sessionId = pendingCheckout.sessionId;

    async function tick() {
      // If the webhook pipeline is delayed/misconfigured, attempt a safe, authenticated reconcile once.
      // IMPORTANT: do this even if the order already exists, because create-session pre-creates an order skeleton.
      if (!reconcileAttemptedRef.current[sessionId] && user?.getIdToken) {
        reconcileAttemptedRef.current[sessionId] = true;
        try {
          const token = await user.getIdToken();
          const reconcileRes = await fetch('/api/stripe/checkout/reconcile-session', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ session_id: sessionId }),
          });
          const reconcileData = await reconcileRes.json().catch(() => ({}));
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/dashboard/orders/page.tsx:reconcileResponse',message:'reconcile-session response',data:{ok:reconcileData?.ok,reason:reconcileData?.reason||null,orderId:reconcileData?.orderId||null,orderStatus:reconcileData?.orderStatus||null,status:reconcileRes.status},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1,H2,H3'})}).catch(()=>{});
          // #endregion
        } catch (e) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/dashboard/orders/page.tsx:reconcileCatch',message:'reconcile-session threw',data:{err:String((e as Error)?.message||'')},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H3'})}).catch(()=>{});
          // #endregion
          // Non-blocking: polling continues; user can still see the “finalizing” row.
        }
        // Give Firestore a moment to make the order visible after reconcile (avoids "order not found" on first tick).
        await new Promise((r) => setTimeout(r, 800));
        if (cancelled) return;
      }

      try {
        const order = await getOrderByCheckoutSessionId(sessionId);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/dashboard/orders/page.tsx:getOrderByCheckoutSessionId',message:'getOrderByCheckoutSessionId result',data:{found:!!order?.id,orderId:order?.id||null,orderStatus:order?.status||null},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2,H3'})}).catch(()=>{});
        // #endregion
        if (cancelled) return;
        if (order?.id) {
          // My Purchases now includes pending/awaiting_* from checkout (getOrdersForUser), so order appears immediately.
          // Clear the card when the order is in the list (any status).
          // #region agent log
          const hiddenStatuses = ['pending', 'awaiting_bank_transfer', 'awaiting_wire', 'cancelled'];
          const wasHidden = hiddenStatuses.includes(order.status ?? '');
          if (wasHidden) fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/dashboard/orders/page.tsx:orderFoundHidden',message:'order found, was hidden status (now shown in list)',data:{orderId:order.id,orderStatus:order.status},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
          // #endregion
          let list = await loadOrders({ silent: true });
          if (!Array.isArray(list) || !list.some((o: OrderWithListing) => o.id === order.id)) {
            await new Promise((r) => setTimeout(r, 1500));
            list = await loadOrders({ silent: true });
          }
          if (cancelled) return;
          if (Array.isArray(list) && list.some((o: OrderWithListing) => o.id === order.id)) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/dashboard/orders/page.tsx:clearPending',message:'clearing pendingCheckout because order in list',data:{orderId:order.id,orderStatus:order.status},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H2'})}).catch(()=>{});
            // #endregion
            setHighlightOrderId(order.id);
            setPendingCheckout(null);
            setPendingCheckoutListingTitle(null);
            try {
              sessionStorage.removeItem('we:pending-checkout:v1');
            } catch {
              // ignore
            }
            // If buyer chose "Set delivery address" in congrats modal, take them to order detail (set-address modal opens there)
            try {
              const raw = sessionStorage.getItem('we:congrats-set-address:v1');
              if (raw) {
                const parsed = JSON.parse(raw) as { sessionId?: string; ts?: number };
                if (parsed?.sessionId === sessionId && typeof parsed?.ts === 'number' && Date.now() - parsed.ts < 120_000) {
                  sessionStorage.removeItem('we:congrats-set-address:v1');
                  router.push(`/dashboard/orders/${order.id}`);
                }
              }
            } catch {
              // ignore
            }
            try {
              window.setTimeout(() => setHighlightOrderId(null), 12_000);
            } catch {
              // ignore
            }
          }
          return;
        }
      } catch {
        // If this query fails (rules/transient), still keep polling loadOrders; it may show up anyway.
      }

      // IMPORTANT: do not flip the whole page into a loading spinner during background polling.
      await loadOrders({ silent: true });
    }

    const handle = window.setInterval(() => {
      if (Date.now() - startedAt > maxMs) {
        window.clearInterval(handle);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/dashboard/orders/page.tsx:90sTimeout',message:'clearing pendingCheckout after 90s timeout',data:{sessionIdPrefix:sessionId.slice(0,18)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H1'})}).catch(()=>{});
        // #endregion
        // Stop polling and clear the pending row after the time budget.
        setPendingCheckout(null);
        setPendingCheckoutListingTitle(null);
        try {
          sessionStorage.removeItem('we:pending-checkout:v1');
        } catch {
          // ignore
        }
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
  }, [loadOrders, pendingCheckout, user?.uid, router]);

  const handleConfirmReceipt = async (orderId: string) => {
    if (!user) return;
    
    try {
      setProcessingOrderId(orderId);
      await confirmReceipt(orderId);
      toast({
        title: 'Receipt confirmed',
        description: 'Transaction complete. Seller was paid immediately upon successful payment.',
      });
      // Refresh orders (fast path: uses snapshots; avoids N+1 listing reads)
      await loadOrders({ silent: true });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: formatUserFacingError(error, 'Failed to confirm receipt'),
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
      // Refresh orders (fast path: uses snapshots; avoids N+1 listing reads)
      await loadOrders({ silent: true });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: formatUserFacingError(error, 'Failed to open dispute'),
        variant: 'destructive',
      });
    } finally {
      setProcessingOrderId(null);
    }
  };

  const canAcceptOrDispute = (order: Order): boolean => {
    const txStatus = getEffectiveTransactionStatus(order);
    return txStatus === 'DELIVERED_PENDING_CONFIRMATION' || txStatus === 'OUT_FOR_DELIVERY';
  };

  const isDisputeDeadlinePassed = (order: Order): boolean => {
    if (!order.disputeDeadlineAt) return false;
    const d: any = (order as any).disputeDeadlineAt;
    const ms =
      d?.getTime?.() ? d.getTime() : typeof d?.toDate === 'function' ? d.toDate().getTime() : typeof d?.seconds === 'number' ? d.seconds * 1000 : null;
    return typeof ms === 'number' ? ms < Date.now() : false;
  };

  const getStatusIconFromTransactionStatus = (txStatus: TransactionStatus) => {
    switch (txStatus) {
      case 'COMPLETED':
        return <CheckCircle className="h-5 w-5 text-accent" />;
      case 'DELIVERED_PENDING_CONFIRMATION':
        return <Package className="h-5 w-5 text-blue-600" />;
      case 'OUT_FOR_DELIVERY':
      case 'DELIVERY_SCHEDULED':
        return <Truck className="h-5 w-5 text-blue-500" />;
      case 'PICKUP_SCHEDULED':
      case 'READY_FOR_PICKUP':
        return <Clock className="h-5 w-5 text-blue-500" />;
      case 'PICKED_UP':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'FULFILLMENT_REQUIRED':
        return <Clock className="h-5 w-5 text-orange-500" />;
      case 'PENDING_PAYMENT':
        return <Clock className="h-5 w-5 text-orange-500" />;
      case 'DISPUTE_OPENED':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'SELLER_NONCOMPLIANT':
        return <AlertTriangle className="h-5 w-5 text-destructive" />;
      case 'REFUNDED':
      case 'CANCELLED':
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <Package className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadgeFromTransactionStatus = (txStatus: TransactionStatus) => {
    switch (txStatus) {
      case 'COMPLETED':
        return <Badge variant="default" className="bg-accent text-accent-foreground">Completed</Badge>;
      case 'DELIVERED_PENDING_CONFIRMATION':
        return <Badge variant="default" className="bg-blue-600 text-white">Delivered</Badge>;
      case 'OUT_FOR_DELIVERY':
        return <Badge variant="default" className="bg-blue-500 text-white">Out for Delivery</Badge>;
      case 'DELIVERY_SCHEDULED':
        return <Badge variant="default" className="bg-blue-500 text-white">Delivery Scheduled</Badge>;
      case 'PICKUP_SCHEDULED':
        return <Badge variant="default" className="bg-blue-500 text-white">Pickup Scheduled</Badge>;
      case 'READY_FOR_PICKUP':
        return <Badge variant="default" className="bg-blue-500 text-white">Ready for Pickup</Badge>;
      case 'PICKED_UP':
        return <Badge variant="default" className="bg-green-600 text-white">Picked Up</Badge>;
      case 'FULFILLMENT_REQUIRED':
        return <Badge variant="default" className="bg-orange-500 text-white">Fulfillment Required</Badge>;
      case 'PENDING_PAYMENT':
        return <Badge variant="default" className="bg-orange-500 text-white">Pending Payment</Badge>;
      case 'DISPUTE_OPENED':
        return <Badge variant="destructive">Disputed</Badge>;
      case 'SELLER_NONCOMPLIANT':
        return <Badge variant="destructive">Non-Compliant</Badge>;
      case 'REFUNDED':
        return <Badge variant="destructive">Refunded</Badge>;
      case 'CANCELLED':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{txStatus}</Badge>;
    }
  };

  // Legacy functions for backward compatibility (use transactionStatus when available)
  const getStatusIcon = (status: string, order?: Order) => {
    if (order) {
      const txStatus = getEffectiveTransactionStatus(order);
      return getStatusIconFromTransactionStatus(txStatus);
    }
    // Fallback to legacy status
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

  const getStatusBadge = (status: string, order?: Order) => {
    if (order) {
      const txStatus = getEffectiveTransactionStatus(order);
      return getStatusBadgeFromTransactionStatus(txStatus);
    }
    // Fallback to legacy status
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
        return <Badge variant="default" className="bg-orange-500 text-white">Fulfillment in progress</Badge>;
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

  // Loading state — skeleton so content loads in place (smooth like seller overview)
  if (authLoading || loading) {
    return <DashboardContentSkeleton />;
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

  const selectedOrder = drawerOrderId ? orders.find((o) => o.id === drawerOrderId) || null : null;

  const uniqueCategories = (() => {
    const set = new Set<string>();
    for (const o of orders) {
      const c = o.listingSnapshot?.category ? String(o.listingSnapshot.category) : '';
      if (c) set.add(c);
    }
    return Array.from(set.values()).sort();
  })();

  const filteredOrders = (() => {
    const q = searchText.trim().toLowerCase();
    const now = Date.now();
    const cutoffMs =
      dateRange === '30' ? now - 30 * 24 * 60 * 60_000 :
      dateRange === '90' ? now - 90 * 24 * 60 * 60_000 :
      dateRange === '365' ? now - 365 * 24 * 60 * 60_000 :
      null;

    return orders.filter((o) => {
      if (cutoffMs && o.createdAt?.getTime?.() && o.createdAt.getTime() < cutoffMs) return false;

      const ui = deriveOrderUIState(o);
      if (needsActionOnly && ui.needsAction !== true) return false;
      if (statusFilter !== 'all' && ui.statusKey !== statusFilter) return false;

      if (categoryFilter !== 'all') {
        const c = o.listingSnapshot?.category ? String(o.listingSnapshot.category) : '';
        if (!c || c !== categoryFilter) return false;
      }

      if (q) {
        const title = String(o.listingTitle || o.listingSnapshot?.title || '').toLowerCase();
        const seller = String(o.sellerDisplayName || o.sellerSnapshot?.displayName || '').toLowerCase();
        const shortId = String(o.id || '').slice(0, 8).toLowerCase();
        if (!title.includes(q) && !seller.includes(q) && !shortId.includes(q)) return false;
      }

      return true;
    });
  })();

  const statusCounts = (() => {
    const counts: Record<string, number> = {
      all: orders.length,
      held: 0,
      awaiting_permit: 0,
      in_transit: 0,
      delivered: 0,
      completed: 0,
      disputed: 0,
      processing: 0,
    };
    for (const o of orders) {
      const k = deriveOrderUIState(o).statusKey;
      counts[k] = (counts[k] || 0) + 1;
    }
    return counts as Record<PurchasesStatusKey | 'all', number>;
  })();

  const statusChipDefs: Array<{ key: PurchasesStatusKey | 'all'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'held', label: 'Fulfillment in progress' }, // Changed from "Held" - seller already paid
    { key: 'awaiting_permit', label: 'Awaiting permit' },
    { key: 'in_transit', label: 'In transit' },
    { key: 'delivered', label: 'Delivered' },
    { key: 'completed', label: 'Completed' },
    { key: 'disputed', label: 'Disputed' },
  ];

  const getUIStatusBadge = (statusKey: PurchasesStatusKey) => {
    switch (statusKey) {
      case 'held':
        return <Badge className="bg-blue-500 text-white">Fulfillment in progress</Badge>;
      case 'awaiting_permit':
        return <Badge className="bg-purple-600 text-white">Awaiting permit</Badge>;
      case 'in_transit':
        return <Badge className="bg-blue-500 text-white">In transit</Badge>;
      case 'delivered':
        return <Badge className="bg-blue-700 text-white">Delivered</Badge>;
      case 'completed':
        return <Badge className="bg-emerald-600 text-white">Completed</Badge>;
      case 'disputed':
        return <Badge variant="destructive">Disputed</Badge>;
      case 'processing':
      default:
        return <Badge variant="secondary">Processing</Badge>;
    }
  };

  const StatusBadgeWithTooltip = ({ statusKey, order }: { statusKey: PurchasesStatusKey; order?: Order }) => {
    // Use new shared model if order provided
    if (order) {
      const badge = getUXBadge(order, 'buyer');
      const badgeEl = <Badge variant={badge.variant}>{badge.label}</Badge>;
      // Show tooltip for "Action needed" or "Waiting on seller"
      if (badge.label.includes('Action needed') || badge.label.includes('Waiting')) {
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex" data-no-drawer="1">
                  {badgeEl}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                {badge.label === 'Action needed' ? 'Action required from you' : 'Seller paid immediately. Waiting for seller action.'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }
      return <span className="inline-flex" data-no-drawer="1">{badgeEl}</span>;
    }
    // Fallback for legacy usage
    const badge = getUIStatusBadge(statusKey);
    if (statusKey !== 'held') return badge;

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex" data-no-drawer="1">
              {badge}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            Seller was paid immediately upon successful payment. Waiting on fulfillment (delivery/pickup) to complete.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      {/* Post-purchase congratulations modal */}
      <Dialog open={showCongratsModal} onOpenChange={setShowCongratsModal}>
        <DialogContent
          className="sm:max-w-md border-2 border-primary/20 bg-card shadow-xl"
          aria-describedby="congrats-desc"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            // Focus the primary action without scrolling the page
            requestAnimationFrame(() => {
              const btn = document.querySelector('[data-congrats-view-purchase]');
              if (btn instanceof HTMLElement) btn.focus({ preventScroll: true });
            });
          }}
        >
          <DialogHeader>
            <div className="flex items-center justify-center gap-2 text-primary mb-2">
              <PartyPopper className="h-10 w-10" aria-hidden />
            </div>
            <DialogTitle className="text-center text-2xl font-bold">
              Congratulations!
            </DialogTitle>
            <DialogDescription id="congrats-desc" asChild>
              <div className="text-center space-y-4 pt-2">
                <p className="text-base text-foreground font-medium">
                  You’ve purchased <span className="font-semibold text-primary">{pendingCheckoutListingTitle || 'your item'}</span>.
                </p>
                <p className="text-sm text-muted-foreground">
                  Your payment is confirmed. <strong>Next step:</strong> set your delivery address so the seller can propose a delivery date. Your purchase appears in <strong>My Purchases</strong> below.
                </p>
                <p className="text-xs text-muted-foreground">
                  You can track progress and message the seller from your order at any time.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              data-congrats-view-purchase
              onClick={async () => {
                const sessionId = pendingCheckout?.sessionId;
                setShowCongratsModal(false);
                scrollToTop();
                if (!sessionId) return;
                try {
                  sessionStorage.setItem(
                    'we:congrats-set-address:v1',
                    JSON.stringify({ sessionId, ts: Date.now() })
                  );
                } catch {
                  // ignore
                }
                // Try to open the order immediately (order may already exist from webhook/reconcile)
                try {
                  let order = await getOrderByCheckoutSessionId(sessionId);
                  if (order?.id) {
                    router.push(`/dashboard/orders/${order.id}`);
                    return;
                  }
                  // Order not ready yet; retry once after a short delay
                  await new Promise((r) => setTimeout(r, 2000));
                  order = await getOrderByCheckoutSessionId(sessionId);
                  if (order?.id) {
                    router.push(`/dashboard/orders/${order.id}`);
                  } else {
                    toast({
                      title: 'Order still finalizing',
                      description: 'Your order will appear below in a moment. Click it to set your delivery address.',
                    });
                  }
                } catch {
                  toast({
                    title: 'Order still finalizing',
                    description: 'Your order will appear below in a moment. Click it to set your delivery address.',
                  });
                }
              }}
              className="w-full font-semibold"
              size="lg"
            >
              Set delivery address
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">My Purchases</h1>
          <p className="text-muted-foreground mt-1">
            Track fulfillment progress, compliance milestones, and delivery—exactly who we’re waiting on.
          </p>
        </div>

        {/* Controls (eBay-style): mobile = scrollable row of filters; desktop = stacked layout */}
        <Card className="border-border/60 bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/50 sticky top-0 z-10">
          <CardContent className="p-4 space-y-4">
            {/* Search: full width on mobile, constrained on desktop */}
            <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <div className="relative w-full md:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search title, seller, or order #…"
                  className="pl-9"
                />
              </div>

              {/* Desktop: Date, Category, Needs action */}
              <div className="hidden md:flex items-center gap-2 flex-wrap justify-end">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-semibold">Needs action</span>
                  <Switch checked={needsActionOnly} onCheckedChange={setNeedsActionOnly} />
                </div>
                <Select value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
                  <SelectTrigger className="min-w-[150px]">
                    <SelectValue placeholder="Date range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                    <SelectItem value="365">Last 365 days</SelectItem>
                    <SelectItem value="all">All time</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="min-w-[180px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {uniqueCategories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.replaceAll('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Mobile: single scrollable row of filter chips (status + Date + Category + Needs action + Clear) */}
            <div className="md:hidden overflow-x-auto overflow-y-hidden pt-1 pb-2 -mx-1 px-1 we-scrollbar-hover">
              <div className="flex items-center gap-2 flex-nowrap min-w-0">
                {statusChipDefs.map((d) => {
                  const active = statusFilter === d.key;
                  const count = statusCounts[d.key] || 0;
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => setStatusFilter(d.key)}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition flex-shrink-0 whitespace-nowrap',
                        active
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border/60 bg-background/40 text-foreground hover:bg-muted/40'
                      )}
                    >
                      <span>{d.label}</span>
                      <span className={cn('text-xs rounded-full px-2 py-0.5', active ? 'bg-primary/15' : 'bg-muted')}>
                        {count}
                      </span>
                    </button>
                  );
                })}
                <Select value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
                  <SelectTrigger className="h-8 rounded-full min-w-0 w-auto px-3 text-xs font-semibold border-border/60 bg-background/40 flex-shrink-0 [&>span]:max-w-[100px] [&>span]:truncate">
                    <SelectValue placeholder="Date" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                    <SelectItem value="365">Last 365 days</SelectItem>
                    <SelectItem value="all">All time</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-8 rounded-full min-w-0 w-auto px-3 text-xs font-semibold border-border/60 bg-background/40 flex-shrink-0 [&>span]:max-w-[90px] [&>span]:truncate">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {uniqueCategories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.replaceAll('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => setNeedsActionOnly((v) => !v)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition flex-shrink-0 whitespace-nowrap',
                    needsActionOnly
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border/60 bg-background/40 text-foreground hover:bg-muted/40'
                  )}
                >
                  Needs action
                </button>
                {(searchText || statusFilter !== 'all' || categoryFilter !== 'all' || dateRange !== '90' || needsActionOnly) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-full h-8 px-3 text-xs font-semibold flex-shrink-0"
                    onClick={() => {
                      setSearchText('');
                      setStatusFilter('all');
                      setCategoryFilter('all');
                      setDateRange('90');
                      setNeedsActionOnly(false);
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Desktop: Status chips (wrap as before) */}
            <div className="hidden md:flex items-center gap-2 flex-wrap">
              {statusChipDefs.map((d) => {
                const active = statusFilter === d.key;
                const count = statusCounts[d.key] || 0;
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setStatusFilter(d.key)}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition',
                      active
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border/60 bg-background/40 text-foreground hover:bg-muted/40'
                    )}
                  >
                    <span>{d.label}</span>
                    <span className={cn('text-xs rounded-full px-2 py-0.5', active ? 'bg-primary/15' : 'bg-muted')}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="text-xs text-muted-foreground flex items-center justify-between gap-3 flex-wrap">
              <div>
                Showing <span className="font-semibold">{filteredOrders.length}</span> of{' '}
                <span className="font-semibold">{orders.length}</span>
              </div>
              <div className="hidden md:block">
                {searchText || statusFilter !== 'all' || categoryFilter !== 'all' || dateRange !== '90' || needsActionOnly ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="font-semibold"
                    onClick={() => {
                      setSearchText('');
                      setStatusFilter('all');
                      setCategoryFilter('all');
                      setDateRange('90');
                      setNeedsActionOnly(false);
                    }}
                  >
                    Clear filters
                  </Button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

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

        {/* Orders list */}
        <div id="orders-list" className="flex flex-col gap-4" data-tour="orders-list">
          {filteredOrders.map((order) => {
            const ui = deriveOrderUIState(order);
            const canAct = canAcceptOrDispute(order);

            const onPrimary = async () => {
              if (ui.primaryAction.kind === 'confirm_receipt') {
                await handleConfirmReceipt(order.id);
                return;
              }
              if (ui.primaryAction.kind === 'open_dispute') {
                handleOpenDispute(order.id);
                return;
              }
              // complete_transfer / view_details / agree_delivery / set_address -> open drawer or detail
              setDrawerOrderId(order.id);
            };

            return (
              <Card
                key={order.id}
                className={cn(
                  'border-border/60 bg-gradient-to-br from-card via-card to-muted/10 transition hover:shadow-md hover:shadow-black/5',
                  order.id === highlightOrderId && 'border-primary/50 ring-2 ring-primary/30'
                )}
              >
                <CardContent
                  className="p-3 md:p-5 space-y-3 md:space-y-4 cursor-pointer"
                  onClick={(e) => {
                    const el = e.target as HTMLElement | null;
                    if (el?.closest?.('a,button,input,textarea,select,[data-no-drawer="1"]')) return;
                    setDrawerOrderId(order.id);
                  }}
                >
                {/* Mobile: compact card — image + title row, then status, meta, amount, timeline, actions */}
                <div className="flex gap-3 min-w-0">
                  <div className="relative h-16 w-16 md:h-28 md:w-28 rounded-xl md:rounded-2xl overflow-hidden border bg-muted shrink-0 shadow-sm">
                    {order.listingPhotoURL ? (
                      <Image
                        src={order.listingPhotoURL}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="(min-width: 768px) 112px, 64px"
                        unoptimized
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                        <Package className="h-5 w-5 md:h-6 md:w-6" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 flex flex-col justify-center">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/dashboard/orders/${order.id}`}
                        className="font-semibold md:font-extrabold text-sm md:text-lg leading-tight hover:underline line-clamp-2 md:truncate"
                        title={order.listingTitle || 'Order'}
                        onClick={(e) => {
                          e.preventDefault();
                          setDrawerOrderId(order.id);
                        }}
                      >
                        {order.listingTitle || 'Unknown listing'}
                      </Link>
                      <div className="shrink-0 flex items-center gap-1.5 md:gap-2">
                        <div className="h-8 w-8 md:h-10 md:w-10 rounded-full border border-border/60 bg-background/60 flex items-center justify-center">
                          {getStatusIcon(order.status, order)}
                        </div>
                        <div className="hidden sm:block">
                          <StatusBadgeWithTooltip statusKey={ui.statusKey} order={order} />
                        </div>
                      </div>
                    </div>
                    {/* One clear status line — single line on mobile, full on desktop */}
                    <div className="mt-0.5 md:mt-1 text-xs md:text-sm text-muted-foreground line-clamp-1 md:line-clamp-none">
                      {(() => {
                        const nextAction = getNextRequiredAction(order, 'buyer');
                        if (nextAction) {
                          return <span>{nextAction.title}{nextAction.description ? ` · ${nextAction.description}` : ''}</span>;
                        }
                        return (
                          <span>
                            {ui.currentStepLabel}
                            {ui.waitingOn ? ` · ${ui.waitingOn}` : ''}
                          </span>
                        );
                      })()}
                    </div>
                    {/* Meta: seller · location · date — single line on mobile */}
                    <div className="mt-1 md:mt-2 flex items-center gap-1.5 flex-wrap text-[11px] md:text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 truncate max-w-[140px] md:max-w-none">
                        <Avatar className="h-4 w-4 md:h-6 md:w-6 shrink-0">
                          {order.sellerPhotoURL ? <AvatarImage src={order.sellerPhotoURL} alt="" /> : null}
                          <AvatarFallback className="text-[8px] md:text-[10px] font-bold">
                            {(order.sellerDisplayName || 'S').slice(0, 1).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate">{order.sellerDisplayName || 'Seller'}</span>
                      </span>
                      <span className="text-muted-foreground/60 shrink-0">·</span>
                      <span className="capitalize shrink-0">{order.listingType || 'unknown'}</span>
                      {order.listingLocationLabel ? (
                        <>
                          <span className="text-muted-foreground/60 shrink-0">·</span>
                          <span className="inline-flex items-center gap-0.5 shrink-0">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-[80px] md:max-w-none">{order.listingLocationLabel}</span>
                          </span>
                        </>
                      ) : null}
                      <span className="text-muted-foreground/60 shrink-0">·</span>
                      <span className="shrink-0">{(order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt || 0)).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                {/* Amount + Order: one line on mobile, box on desktop */}
                <div className="md:hidden flex items-baseline gap-2 text-muted-foreground/80">
                  <span className="text-lg font-extrabold text-foreground">${order.amount.toLocaleString()}</span>
                  <span className="text-[11px] font-mono">#{order.id.slice(0, 8)}</span>
                </div>
                <div className="hidden md:block rounded-2xl border border-border/60 bg-background/40 p-3 md:p-4">
                  <div className="flex items-end justify-between gap-3 flex-wrap">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</div>
                      <div className="text-2xl font-extrabold mt-1">${order.amount.toLocaleString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Order</div>
                      <div className="text-sm font-semibold mt-1 font-mono" title={order.id}>
                        #{order.id.slice(0, 8)}
                      </div>
                    </div>
                  </div>
                </div>

                {order.status === 'disputed' && order.disputeReason && (
                  <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded-xl">
                    <div className="font-semibold">Dispute opened</div>
                    <div className="text-xs mt-1">Reason: {order.disputeReason}</div>
                  </div>
                )}

                {/* Timeline: compact on mobile */}
                <TransactionTimeline
                  order={order}
                  role="buyer"
                  dense
                  showTitle={false}
                  variant="rail"
                  embedded
                  className="rounded-xl border border-border/50 bg-background/40 px-2 py-1.5 md:px-3 md:py-2"
                />

                <div className="flex items-center gap-2 flex-wrap pt-0 md:pt-1">
                  <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    {(() => {
                      const nextAction = getNextRequiredAction(order, 'buyer');
                      if (!nextAction) return null;
                      
                      const txStatus = getEffectiveTransactionStatus(order);
                      const canHandleDirectly = 
                        txStatus === 'DELIVERED_PENDING_CONFIRMATION' && 
                        nextAction.ctaLabel.toLowerCase().includes('confirm');
                      
                      const isOutline = nextAction.severity !== 'danger' && nextAction.severity !== 'warning';
                      return (
                        <Button
                          size="sm"
                          className={cn(
                            'font-semibold w-full sm:w-auto',
                            isOutline && 'border-primary text-primary hover:bg-primary/10 hover:text-primary'
                          )}
                          variant={nextAction.severity === 'danger' ? 'destructive' : nextAction.severity === 'warning' ? 'default' : 'outline'}
                          disabled={processingOrderId === order.id || (nextAction.ctaLabel.toLowerCase().includes('confirm') && !canAct)}
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (canHandleDirectly && txStatus === 'DELIVERED_PENDING_CONFIRMATION') {
                              await handleConfirmReceipt(order.id);
                              return;
                            }
                            if (nextAction.ctaAction.startsWith('/')) {
                              window.location.href = nextAction.ctaAction;
                            } else {
                              window.location.href = `/dashboard/orders/${order.id}`;
                            }
                          }}
                        >
                          {processingOrderId === order.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin shrink-0" /> : null}
                          {nextAction.ctaLabel}
                        </Button>
                      );
                    })()}

                    {!getNextRequiredAction(order, 'buyer') ? (
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="font-semibold w-full sm:w-auto border-primary text-primary hover:bg-primary/10 hover:text-primary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link href={`/dashboard/orders/${order.id}`} className="flex items-center justify-center gap-2">
                          View order
                          <ArrowRight className="h-4 w-4 shrink-0" />
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="shrink-0 h-8 w-8 p-0 md:h-9 md:px-3" data-no-drawer="1">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">More actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[200px]">
                        <DropdownMenuItem asChild>
                          <Link href={`/listing/${order.listingId}`}>View listing</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link href={`/sellers/${order.sellerId}`}>View seller</Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {canAct ? (
                          <DropdownMenuItem
                            onClick={() => {
                              void handleConfirmReceipt(order.id);
                            }}
                          >
                            Confirm receipt
                          </DropdownMenuItem>
                        ) : null}
                        {canAct && !isDisputeDeadlinePassed(order) ? (
                          <DropdownMenuItem onClick={() => handleOpenDispute(order.id)}>Report an issue</DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {orders.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No orders yet"
            description="Start browsing to find your first purchase."
            action={{ label: 'Browse listings', href: '/browse' }}
            className="py-12"
          />
        ) : filteredOrders.length === 0 ? (
          <EmptyState
            icon={Filter}
            title="No matches"
            description="Try adjusting your filters."
            action={{
              label: 'Clear filters',
              onClick: () => {
                setSearchText('');
                setStatusFilter('all');
                setCategoryFilter('all');
                setDateRange('90');
                setNeedsActionOnly(false);
              },
            }}
            className="py-12"
          />
        ) : null}

        {/* Order detail drawer */}
        <Sheet
          open={!!selectedOrder}
          onOpenChange={(o) => {
            if (!o) setDrawerOrderId(null);
          }}
        >
          <SheetContent side="right" className="sm:max-w-lg md:max-w-2xl">
            {selectedOrder ? (
              <div className="space-y-4">
                <SheetHeader>
                  <SheetTitle className="font-extrabold">Order details</SheetTitle>
                  <SheetDescription>
                    #{selectedOrder.id.slice(0, 8)} · {selectedOrder.listingTitle || selectedOrder.listingSnapshot?.title || 'Listing'}
                  </SheetDescription>
                </SheetHeader>

                <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
                  {(() => {
                    const ui = deriveOrderUIState(selectedOrder);
                    return (
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {(() => {
                              const nextAction = getNextRequiredAction(selectedOrder, 'buyer');
                              const badge = getUXBadge(selectedOrder, 'buyer');
                              return (
                                <>
                                  <div className="font-extrabold">{nextAction?.title || ui.currentStepLabel}</div>
                                  <Badge variant={badge.variant}>{badge.label}</Badge>
                                </>
                              );
                            })()}
                          </div>
                          {(() => {
                            const nextAction = getNextRequiredAction(selectedOrder, 'buyer');
                            return nextAction ? (
                              <div className="text-sm text-muted-foreground mt-1">{nextAction.description}</div>
                            ) : ui.waitingOn ? (
                              <div className="text-sm text-muted-foreground mt-1">{ui.waitingOn}</div>
                            ) : null;
                          })()}
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total</div>
                          <div className="text-xl font-extrabold">${selectedOrder.amount.toLocaleString()}</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex items-start gap-4">
                  <div className="relative h-24 w-24 rounded-2xl overflow-hidden border bg-muted shrink-0">
                    {selectedOrder.listingPhotoURL ? (
                      <Image src={selectedOrder.listingPhotoURL} alt="" fill className="object-cover" sizes="96px" unoptimized />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="font-extrabold text-lg truncate">{selectedOrder.listingTitle || 'Listing'}</div>
                    <div className="mt-1 text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {selectedOrder.sellerDisplayName || 'Seller'}
                      </span>
                      {selectedOrder.listingLocationLabel ? (
                        <>
                          <span className="text-muted-foreground/60">•</span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {selectedOrder.listingLocationLabel}
                          </span>
                        </>
                      ) : null}
                    </div>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <Button asChild variant="outline" size="sm" className="font-semibold">
                        <Link href={`/listing/${selectedOrder.listingId}`}>View listing</Link>
                      </Button>
                      <Button asChild variant="outline" size="sm" className="font-semibold">
                        <Link href={`/sellers/${selectedOrder.sellerId}`}>View seller</Link>
                      </Button>
                      <Button asChild variant="outline" size="sm" className="font-semibold">
                        <Link href={`/dashboard/orders/${selectedOrder.id}`}>Open order page</Link>
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/60 p-3 bg-background/40">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</div>
                    <div className="text-lg font-extrabold mt-1">${selectedOrder.amount.toLocaleString()}</div>
                  </div>
                  <div className="rounded-xl border border-border/60 p-3 bg-background/40">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</div>
                    <div className="text-sm font-semibold mt-1">
                      {(() => {
                        const badge = getUXBadge(selectedOrder, 'buyer');
                        return <Badge variant={badge.variant}>{badge.label}</Badge>;
                      })()}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-extrabold">Timeline</div>
                  {Array.isArray(selectedOrder.timeline) && selectedOrder.timeline.length ? (
                    <div className="max-h-[40vh] overflow-auto pr-1">
                      {[...selectedOrder.timeline]
                        .map((ev: any) => {
                          // Safely convert timestamp to Date if needed
                          let timestamp: Date;
                          const ts = ev.timestamp;
                          if (ts instanceof Date) {
                            timestamp = ts;
                          } else if (ts && typeof ts === 'object' && typeof ts.toDate === 'function') {
                            timestamp = ts.toDate();
                          } else if (ts && typeof ts === 'object' && typeof ts.seconds === 'number') {
                            timestamp = new Date(ts.seconds * 1000 + (ts.nanoseconds || 0) / 1_000_000);
                          } else if (typeof ts === 'string' || typeof ts === 'number') {
                            timestamp = new Date(ts);
                          } else {
                            timestamp = new Date(0);
                          }
                          return { ...ev, timestamp };
                        })
                        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
                        .map((ev) => (
                          <div key={ev.id} className="relative pl-6 py-2">
                            <div className="absolute left-2 top-0 bottom-0 w-px bg-border/60" />
                            <div className="absolute left-[7px] top-3 h-2.5 w-2.5 rounded-full bg-primary/50 ring-2 ring-background" />

                            <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-semibold text-sm leading-tight">{ev.label}</div>
                                  <div className="text-[11px] text-muted-foreground mt-0.5">
                                    {ev.type.replaceAll('_', ' ')} · {ev.actor}
                                  </div>
                                </div>
                                <div className="text-[11px] text-muted-foreground shrink-0">
                                  {ev.timestamp.toLocaleDateString()} {ev.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
                      <TransactionTimeline order={selectedOrder} role="buyer" dense showTitle={false} variant="rail" embedded />
                    </div>
                  )}
                </div>

                {selectedOrder.transferPermitRequired ? (
                  <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                    <div className="font-extrabold text-sm">Compliance</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Transfer permit: <span className="font-semibold">{String(selectedOrder.transferPermitStatus || 'none').replaceAll('_', ' ')}</span>
                    </div>
                    <div className="mt-3">
                      <Button asChild className="font-semibold">
                        <Link href={`/dashboard/orders/${selectedOrder.id}`}>Complete transfer steps</Link>
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </SheetContent>
        </Sheet>

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
