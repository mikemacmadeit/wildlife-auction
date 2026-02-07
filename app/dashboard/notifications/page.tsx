/**
 * /dashboard/notifications
 * User Notification Center (in-app)
 *
 * Red "Needs action" = notifications that require a response (Pay now, Accept delivery date,
 * Outbid, Offer countered/accepted). Each user sees only their own notifications from Firestore.
 * If you don't see red items another user sees, you're on a different account or have different
 * notifications. To rule out caching: hard refresh (Ctrl+Shift+R / Cmd+Shift+R) or check "Synced"
 * at the bottom — it updates when Firestore sends new data.
 */

'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, doc, onSnapshot, orderBy, query, limit, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardContentSkeleton } from '@/components/skeletons/DashboardContentSkeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  Bell,
  CheckCheck,
  ExternalLink,
  Gavel,
  ShoppingBag,
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  DollarSign,
  Handshake,
  Star,
  User,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import Image from 'next/image';
import { getListingsByIds } from '@/lib/firebase/listings';
import type { Listing } from '@/lib/types';

type UiFilter = 'all' | 'important' | 'buying' | 'selling' | 'recommended' | 'account';

type UserNotification = {
  id: string;
  title: string;
  body: string;
  type?: string;
  category?: string;
  deepLinkUrl?: string;
  linkLabel?: string;
  read?: boolean;
  createdAt?: any;
  /** Set when the user completed the action (e.g. paid, accepted date); notification then drops from Needs action. */
  actionCompletedAt?: any;
  entityType?: string;
  entityId?: string;
  eventType?: string;
  metadata?: Record<string, any>;
};

function toMillisSafe(v: any): number {
  if (!v) return 0;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : 0;
  if (typeof v?.toDate === 'function') {
    try {
      const d = v.toDate();
      if (d instanceof Date && Number.isFinite(d.getTime())) return d.getTime();
    } catch {
      // ignore
    }
  }
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  }
  return 0;
}

function timeAgo(n: UserNotification): string | null {
  const ms = toMillisSafe(n.createdAt);
  if (!ms) return null;
  try {
    return formatDistanceToNow(new Date(ms), { addSuffix: true });
  } catch {
    return null;
  }
}

function normalizeType(n: UserNotification): string {
  const t = String(n.type || '').trim();
  if (t) return t.toLowerCase();
  const ev = String(n.eventType || '').trim();
  if (!ev) return '';
  return ev.toLowerCase().replaceAll('.', '_');
}

/** True if this notification's action was completed (so it should not show as "needs action"). */
function hasActionCompleted(n: UserNotification): boolean {
  const v = (n as UserNotification).actionCompletedAt;
  if (v == null) return false;
  if (typeof v === 'object' && v !== null && ('toDate' in v || 'seconds' in v)) return true; // Firestore Timestamp
  if (typeof v === 'string' || typeof v === 'number') return true;
  return Boolean(v);
}

/** True if this action-required notification is for the current user (recipient). Seller-only actions only count when link is to seller order page. */
function isActionForCurrentUser(n: UserNotification): boolean {
  const t = normalizeType(n);
  const ev = String(n.eventType || '').trim();
  const url = String(n.deepLinkUrl || '');
  // Seller-only actions: only count when link is to seller order page (notification was sent to seller)
  if (t === 'order_created' && ev === 'Order.Received') return url.includes('/seller/');
  if (t === 'order_delivery_address_set') return url.includes('/seller/');
  return true;
}

function listingIdFromUrl(url: string): string | null {
  try {
    const m = String(url || '').match(/\/listing\/([^/?#]+)/i);
    return m?.[1] ? String(m[1]) : null;
  } catch {
    return null;
  }
}

/** Convert deepLinkUrl to app path so we always navigate within current origin (fixes localhost in prod). */
function toAppPath(url: string): string {
  const raw = String(url || '').trim();
  if (!raw) return '/dashboard/notifications';
  if (raw.startsWith('/')) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const u = new URL(raw);
      return `${u.pathname}${u.search}${u.hash}` || '/dashboard/notifications';
    } catch {
      return '/dashboard/notifications';
    }
  }
  return '/dashboard/notifications';
}

function listingIdFor(n: UserNotification): string | null {
  const meta = n.metadata || {};
  const metaListingId = typeof (meta as any)?.listingId === 'string' ? String((meta as any).listingId) : null;
  if (metaListingId) return metaListingId;
  if (String(n.entityType || '').toLowerCase() === 'listing' && n.entityId) return String(n.entityId);
  const urlId = n.deepLinkUrl ? listingIdFromUrl(n.deepLinkUrl) : null;
  return urlId;
}

function filterFor(n: UserNotification): UiFilter {
  const c = String(n.category || '').toLowerCase();
  const t = normalizeType(n);
  const ev = String(n.eventType || '').trim();

  if (c === 'marketing' || t.startsWith('marketing_')) return 'recommended';
  if (c === 'onboarding' || t === 'user_welcome' || t === 'profile_incomplete') return 'account';
  if (c === 'admin' || t.startsWith('admin_') || t.startsWith('listing_') || t.startsWith('compliance_')) return 'account';

  // Selling-side signals (seller actions: propose delivery, new sale, etc.)
  if (t === 'bid_received') return 'selling';
  if (t === 'offer_received') return 'selling';
  if (t === 'order_received' || t === 'payout_released') return 'selling';
  if (t === 'order_created' && ev === 'Order.Received') return 'selling'; // New sale – propose delivery (seller)
  if (t === 'order_delivery_address_set') return 'selling'; // Buyer set address – seller propose delivery

  // Buying-side signals
  if (t.startsWith('auction_') || t.startsWith('bid_')) return 'buying';
  if (t.startsWith('offer_')) return 'buying';
  if (t === 'order_created' && ev === 'Order.Confirmed') return 'buying'; // Set delivery address (buyer)
  if (t.startsWith('order_')) return 'buying';

  // Messages: show under Important (and All)
  if (t === 'message_received' || c === 'messages') return 'important';

  return 'all';
}

function iconForFilter(tab: UiFilter) {
  if (tab === 'buying') return Gavel;
  if (tab === 'selling') return ShoppingBag;
  if (tab === 'recommended') return Star;
  if (tab === 'account') return User;
  if (tab === 'important') return AlertTriangle;
  return Bell;
}

/** Semantic Badge variant for notification tags (design-system: success, warning, info, destructive, secondary, default). */
type NotificationTagVariant = 'destructive' | 'success' | 'warning' | 'info' | 'secondary' | 'default';

function tagForNotification(n: UserNotification): { label: string; variant: NotificationTagVariant } | null {
  const t = normalizeType(n);

  // Best practice: map to semantic states (critical, success, warning, info) per Carbon/design-system
  if (t === 'auction_lost') return { label: 'Got away', variant: 'destructive' };
  if (t === 'auction_won') return { label: 'Won', variant: 'success' };
  if (t === 'auction_ending_soon') return { label: 'Ending soon', variant: 'warning' };
  if (t === 'bid_outbid') return { label: 'Outbid', variant: 'destructive' };
  if (t === 'offer_received') return { label: 'New offer', variant: 'info' };
  if (t === 'offer_countered') return { label: 'Counter offer', variant: 'warning' };
  if (t === 'offer_accepted') return { label: 'Accepted', variant: 'success' };
  if (t.startsWith('offer_')) return { label: 'Offer', variant: 'info' };
  if (t === 'order_delivery_scheduled') return { label: 'Accept delivery date', variant: 'warning' };
  if (t === 'order_final_payment_due') return { label: 'Pay now', variant: 'destructive' };
  if (t === 'order_final_payment_confirmed') return { label: 'Final payment', variant: 'success' };
  // Seller-only actions: show "Your sale" so it's clear the action is for the viewer (seller)
  const ev = String(n.eventType || '').trim();
  if (t === 'order_created' && ev === 'Order.Received') return { label: 'Your sale', variant: 'warning' };
  if (t === 'order_delivery_address_set') return { label: 'Your sale', variant: 'warning' };
  if (t.startsWith('order_')) return { label: 'Order', variant: 'info' };
  if (t === 'payout_released') return { label: 'Payout', variant: 'success' };
  if (t === 'message_received') return { label: 'Message', variant: 'default' };

  return null;
}

function styleForNotification(n: UserNotification): {
  Icon: any;
  chipClass: string;
  unreadRowClass: string;
  newBadgeClass: string;
} {
  const type = normalizeType(n);
  const category = String(n.category || '').toLowerCase();

  // Messages
  if (type === 'message_received' || category === 'messages') {
    return {
      Icon: MessageSquare,
      chipClass:
        'bg-primary/15 border-primary/25 text-primary dark:bg-primary/20 dark:border-primary/30 dark:text-primary',
      unreadRowClass: 'bg-primary/5',
      newBadgeClass: 'bg-primary/15 text-primary border-primary/25',
    };
  }

  // Offers (Best Offer / eBay-style)
  if (type.startsWith('offer_') || category === 'offers') {
    return {
      Icon: Handshake,
      chipClass:
        'bg-fuchsia-500/15 border-fuchsia-500/25 text-fuchsia-800 dark:bg-fuchsia-400/15 dark:border-fuchsia-400/25 dark:text-fuchsia-300',
      unreadRowClass: 'bg-fuchsia-500/5 dark:bg-fuchsia-400/10',
      newBadgeClass:
        'bg-fuchsia-500/15 text-fuchsia-800 border-fuchsia-500/25 dark:bg-fuchsia-400/15 dark:text-fuchsia-200 dark:border-fuchsia-400/25',
    };
  }

  // Listings moderation
  if (type === 'listing_approved') {
    return {
      Icon: CheckCircle2,
      chipClass:
        'bg-emerald-500/15 border-emerald-500/25 text-emerald-700 dark:bg-emerald-400/15 dark:border-emerald-400/25 dark:text-emerald-300',
      unreadRowClass: 'bg-emerald-500/5 dark:bg-emerald-400/10',
      newBadgeClass: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/25 dark:bg-emerald-400/15 dark:text-emerald-200 dark:border-emerald-400/25',
    };
  }
  if (type === 'listing_rejected') {
    return {
      Icon: XCircle,
      chipClass:
        'bg-destructive/15 border-destructive/25 text-destructive dark:bg-destructive/20 dark:border-destructive/30',
      unreadRowClass: 'bg-destructive/5',
      newBadgeClass: 'bg-destructive/15 text-destructive border-destructive/25',
    };
  }

  // Orders / payouts
  if (type.startsWith('order_') || type.startsWith('payout_') || category === 'orders') {
    const Icon = type.startsWith('payout_') ? DollarSign : ShoppingBag;
    return {
      Icon,
      chipClass:
        'bg-sky-500/15 border-sky-500/25 text-sky-700 dark:bg-sky-400/15 dark:border-sky-400/25 dark:text-sky-300',
      unreadRowClass: 'bg-sky-500/5 dark:bg-sky-400/10',
      newBadgeClass: 'bg-sky-500/15 text-sky-700 border-sky-500/25 dark:bg-sky-400/15 dark:text-sky-200 dark:border-sky-400/25',
    };
  }

  // Auctions
  if (type.startsWith('auction_') || type.startsWith('bid_') || category === 'auctions') {
    return {
      Icon: Gavel,
      chipClass:
        'bg-amber-500/15 border-amber-500/25 text-amber-800 dark:bg-amber-400/15 dark:border-amber-400/25 dark:text-amber-300',
      unreadRowClass: 'bg-amber-500/5 dark:bg-amber-400/10',
      newBadgeClass: 'bg-amber-500/15 text-amber-800 border-amber-500/25 dark:bg-amber-400/15 dark:text-amber-200 dark:border-amber-400/25',
    };
  }

  // Compliance / safety
  if (type.startsWith('compliance_')) {
    return {
      Icon: ShieldAlert,
      chipClass:
        'bg-violet-500/15 border-violet-500/25 text-violet-800 dark:bg-violet-400/15 dark:border-violet-400/25 dark:text-violet-300',
      unreadRowClass: 'bg-violet-500/5 dark:bg-violet-400/10',
      newBadgeClass: 'bg-violet-500/15 text-violet-800 border-violet-500/25 dark:bg-violet-400/15 dark:text-violet-200 dark:border-violet-400/25',
    };
  }

  // Default
  return {
    Icon: AlertTriangle,
    chipClass: 'bg-muted/40 border-border/60 text-foreground/70',
    unreadRowClass: 'bg-primary/5',
    newBadgeClass: 'bg-primary/15 text-primary border-primary/25',
  };
}

export default function NotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [filter, setFilter] = useState<UiFilter>('all');
  const [items, setItems] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const autoMarkedReadRef = useRef(false);
  const syncStaleCalledRef = useRef(false);
  const [listingById, setListingById] = useState<Record<string, Listing | null>>({});

  useEffect(() => {
    if (authLoading) return;
    if (!user?.uid) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = collection(db, 'users', user.uid, 'notifications');
    const q = query(ref, orderBy('createdAt', 'desc'), limit(100));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as UserNotification[];
        setItems(next);
        setLastSyncedAt(new Date());
        setLoading(false);

        // UX: once user is on the notifications page, mark non–action-required unread as read (one-time per visit).
        // Do NOT mark action-required types — they stay until user completes the action or dismisses.
        if (!autoMarkedReadRef.current) {
          autoMarkedReadRef.current = true;
          const actionRequiredTypes = new Set(['bid_outbid', 'auction_outbid', 'offer_countered', 'offer_accepted', 'order_created', 'order_delivery_address_set', 'order_delivery_scheduled', 'order_final_payment_due']);
          const unread = next.filter((n) => {
            if (n.read === true) return false;
            const t = normalizeType(n);
            return !actionRequiredTypes.has(t);
          });
          if (unread.length) {
            Promise.all(
              unread.map((n) =>
                updateDoc(doc(db, 'users', user.uid, 'notifications', n.id), {
                  read: true,
                  readAt: serverTimestamp(),
                })
              )
            ).catch(() => {
              // best-effort; ignore failures
            });
          }
        }
      },
      () => {
        setItems([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user?.uid, authLoading]);

  // Sync stale action-required notifications (mark completed when order/offer/listing is already past that step).
  // Run on mount and when user returns to the tab so "Pay now" etc. clear after they complete the action elsewhere.
  const runSyncStale = useCallback(() => {
    if (!user?.uid) return;
    user
      .getIdToken()
      .then((token) =>
        fetch('/api/notifications/sync-stale', {
          method: 'GET',
          headers: { authorization: `Bearer ${token}` },
        })
      )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.updated && data.updated > 0) {
          // Firestore onSnapshot will pick up the updated docs
        }
      })
      .catch(() => {});
  }, [user?.uid]);

  useEffect(() => {
    if (authLoading || !user?.uid || loading) return;
    runSyncStale();
  }, [user?.uid, authLoading, loading, runSyncStale]);

  // When user returns to this tab (e.g. after paying in another tab), re-run sync-stale so "Pay now" etc. clear
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && user?.uid) runSyncStale();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.uid, runSyncStale]);

  // Action-required: don't mark as read on click; stay until the action is completed (e.g. accept delivery date until buyer agrees).
  const actionRequiredTypes = useMemo(
    () => new Set([
      'bid_outbid',
      'auction_outbid',
      'offer_countered',
      'offer_accepted',
      'order_created', // New sale – propose delivery date (seller To do)
      'order_delivery_address_set', // Buyer set address – propose delivery date (seller To do)
      'order_delivery_scheduled', // Accept delivery date – stays until buyer completes agree-delivery
      'order_final_payment_due', // Pay remaining balance – stays until buyer pays (To Do "Pay now")
    ]),
    []
  );

  const filtered = useMemo(() => {
    let list: UserNotification[];
    if (filter === 'all') list = items;
    else if (filter === 'important') {
      // Needs action = unread OR high-signal types; exclude action-required that are already resolved (actionCompletedAt)
      list = items.filter((n) => {
        const t = normalizeType(n);
        if (actionRequiredTypes.has(t) && hasActionCompleted(n)) return false;
        if (n.read !== true) return true;
        return (
          t === 'message_received' ||
          t === 'bid_outbid' ||
          t === 'auction_won' ||
          t === 'auction_ending_soon' ||
          t.startsWith('order_') ||
          t.startsWith('offer_') ||
          t === 'payout_released' ||
          t === 'listing_rejected' ||
          t === 'compliance_rejected'
        );
      });
      // Sort: action-required (for current user) first, then by createdAt desc
      list = [...list].sort((a, b) => {
        const ta = normalizeType(a);
        const tb = normalizeType(b);
        const aAction = actionRequiredTypes.has(ta) && isActionForCurrentUser(a) ? 1 : 0;
        const bAction = actionRequiredTypes.has(tb) && isActionForCurrentUser(b) ? 1 : 0;
        if (bAction !== aAction) return bAction - aAction;
        return toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt);
      });
    } else list = items.filter((n) => filterFor(n) === filter);
    return list;
  }, [items, filter, actionRequiredTypes]);

  const unreadCount = useMemo(() => items.filter((n) => n.read !== true).length, [items]);

  // To-do list: action-required notifications that are not yet resolved and are for the current user's role
  const actionItems = useMemo(() => {
    return items
      .filter((n) => {
        if (!actionRequiredTypes.has(normalizeType(n))) return false;
        if (hasActionCompleted(n)) return false; // resolved – user completed the action
        if (!isActionForCurrentUser(n)) return false; // seller-only action in wrong feed (e.g. buyer seeing "Propose delivery date")
        return true;
      })
      .sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt))
      .slice(0, 10);
  }, [items, actionRequiredTypes]);

  const filterCounts = useMemo(() => {
    const all = items.length;
    const important = items.filter((n) => {
      if (n.read !== true) return true;
      const t = normalizeType(n);
      return t.startsWith('order_') || t.startsWith('offer_') || t === 'bid_outbid' || t === 'auction_won' || t === 'message_received';
    }).length;
    const buying = items.filter((n) => filterFor(n) === 'buying').length;
    const selling = items.filter((n) => filterFor(n) === 'selling').length;
    const recommended = items.filter((n) => filterFor(n) === 'recommended').length;
    const account = items.filter((n) => filterFor(n) === 'account').length;
    return { all, important, buying, selling, recommended, account };
  }, [items]);

  const filterUnreadCounts = useMemo(() => {
    const all = unreadCount;
    const important = items.filter((n) => n.read !== true).length; // important badge tracks unread, like eBay
    const buying = items.filter((n) => n.read !== true && filterFor(n) === 'buying').length;
    const selling = items.filter((n) => n.read !== true && filterFor(n) === 'selling').length;
    const recommended = items.filter((n) => n.read !== true && filterFor(n) === 'recommended').length;
    const account = items.filter((n) => n.read !== true && filterFor(n) === 'account').length;
    return { all, important, buying, selling, recommended, account };
  }, [items, unreadCount]);

  // Fetch listing thumbnails for the current feed (best-effort).
  useEffect(() => {
    if (!user?.uid) {
      setListingById({});
      return;
    }
    const ids = Array.from(
      new Set(
        (items || [])
          .map((n) => listingIdFor(n))
          .filter(Boolean)
          .slice(0, 60) as string[]
      )
    );
    const missing = ids.filter((id) => !(id in listingById));
    if (!missing.length) return;

    let cancelled = false;
    (async () => {
      try {
        const fetched = await getListingsByIds(missing);
        if (cancelled) return;
        const next: Record<string, Listing | null> = {};
        for (let i = 0; i < missing.length; i++) {
          next[missing[i]] = fetched[i] as any;
        }
        setListingById((prev) => ({ ...prev, ...next }));
      } catch {
        // ignore; keep placeholders
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [items, listingById, user?.uid]);

  const markAllRead = useCallback(async () => {
    if (!user?.uid) return;
    const unread = items.filter((n) => n.read !== true);
    await Promise.all(
      unread.map((n) =>
        updateDoc(doc(db, 'users', user.uid, 'notifications', n.id), {
          read: true,
          readAt: serverTimestamp(),
        })
      )
    );
  }, [items, user?.uid]);

  const markClicked = useCallback(
    async (id: string) => {
      if (!user?.uid) return;
      // Optimistic UI (feels instant; snapshot will reconcile)
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      await updateDoc(doc(db, 'users', user.uid, 'notifications', id), {
        clickedAt: serverTimestamp(),
        read: true,
        readAt: serverTimestamp(),
      });
    },
    [user?.uid]
  );

  if (authLoading || loading) {
    return <DashboardContentSkeleton className="min-h-[360px]" />;
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Card className="border-border/60">
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Bell className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-2xl font-bold mb-2">Sign in to see notifications</h2>
              <p className="text-muted-foreground mb-6">Auction updates, order status, and important account alerts.</p>
              <Button asChild>
                <Link href="/login">Sign In</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6 max-md:pb-[max(5rem,calc(env(safe-area-inset-bottom)+4rem))]">
      <div className="container mx-auto px-3 py-4 sm:px-4 md:py-8 max-w-7xl space-y-4 md:space-y-8">
      <Card className="border border-border/60 overflow-hidden shadow-warm">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="we-h3 flex flex-wrap items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Bell className="h-5 w-5 text-primary" />
                </span>
                Notifications
                {unreadCount > 0 ? (
                  <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-sm font-semibold text-primary">
                    {unreadCount} unread
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-sm font-medium text-muted-foreground">
                    All caught up
                  </span>
                )}
              </h1>
              <p className="text-sm text-muted-foreground mt-1.5">
                Auction signals, order updates, messages, and trust alerts.
              </p>
            </div>
            <div className="flex flex-row items-center justify-between gap-3 pt-3 border-t border-border/50 min-h-[44px]">
              <span className="text-xs text-muted-foreground font-medium">
                {filterCounts.all} total
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={markAllRead}
                disabled={unreadCount === 0}
                className="shrink-0 min-h-[44px]"
              >
                <CheckCheck className="h-4 w-4 mr-2" />
                Mark all read
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-border/60 overflow-hidden">
        <CardHeader className="px-3 pt-3 pb-2 sm:px-4 md:px-6 md:pt-6 md:pb-4">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            To do
            {actionItems.length > 0 ? (
              <Badge variant="destructive" className="ml-0 sm:ml-1 shrink-0">
                {actionItems.length}
              </Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-4 sm:px-4 md:px-6 md:pb-6 pt-0">
          {actionItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">You&apos;re all caught up. Nothing needs your response right now.</p>
          ) : (
            <ul className="space-y-2 sm:space-y-2">
              {actionItems.map((n) => {
                const typeNorm = normalizeType(n);
                const tag = tagForNotification(n);
                const href = toAppPath(n.deepLinkUrl || '');
                const hasLink = (n.deepLinkUrl || '').trim().length > 0;
                const label = n.linkLabel || 'Open';
                return (
                  <li
                    key={n.id}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 py-3 px-3 sm:py-2 rounded-lg border border-destructive/30 bg-destructive/10 dark:bg-destructive/20"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium block">{n.title}</span>
                      {n.body ? (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 sm:line-clamp-1 sm:truncate break-words">{n.body}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {hasLink ? (
                        <Button asChild size="sm" variant="destructive" className="min-h-[40px] w-full sm:w-auto sm:min-w-0">
                          <Link href={href}>{label}</Link>
                        </Button>
                      ) : null}
                      {tag ? <Badge variant={tag.variant} className="shrink-0">{tag.label}</Badge> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-2 border-border/60 overflow-hidden">
        <CardHeader className="px-4 pt-4 pb-2 md:px-6 md:pt-6 md:pb-4">
          <CardTitle className="text-base">Inbox</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-3 py-3 sm:px-4 md:px-6 md:py-4 -mx-1 sm:mx-0">
            <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto we-scrollbar-hover pb-1 min-h-[44px] snap-x snap-mandatory scroll-px-3">
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'important', label: 'Needs action' },
                  { key: 'buying', label: 'Buying' },
                  { key: 'selling', label: 'Selling' },
                  { key: 'recommended', label: 'Recommended' },
                  { key: 'account', label: 'Account' },
                ] as const
              ).map((f) => {
                const Icon = iconForFilter(f.key);
                const isActive = filter === f.key;
                const unread = (filterUnreadCounts as any)[f.key] as number;
                // Single neutral style: all tabs look the same; only active uses primary
                const tabClass = cn(
                  'border border-border bg-muted/40 text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  isActive && 'bg-primary text-primary-foreground border-primary hover:bg-primary hover:text-primary-foreground'
                );
                const badgeClass = isActive ? 'bg-primary-foreground/20 text-primary-foreground border-0' : undefined;
                return (
                  <Button
                    key={f.key}
                    type="button"
                    variant="outline"
                    onClick={() => setFilter(f.key)}
                    className={cn('min-h-[44px] shrink-0 rounded-full font-semibold whitespace-nowrap px-3 sm:px-4 transition-colors snap-start touch-manipulation', tabClass)}
                  >
                    <Icon className="h-4 w-4 mr-1.5 sm:mr-2 shrink-0" />
                    {f.label}
                    {unread > 0 ? (
                      <Badge variant="secondary" className={cn('ml-2 h-5 px-1.5 text-xs shrink-0', badgeClass)}>
                        {unread}
                      </Badge>
                    ) : null}
                  </Button>
                );
              })}
            </div>
          </div>

          <Separator />

          <div className="m-0">
              {filtered.length === 0 ? (
                <div className="p-10 text-center">
                  <div className="mx-auto h-12 w-12 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center mb-3">
                    <Bell className="h-6 w-6 text-primary" />
                  </div>
                  <div className="text-base font-extrabold">Nothing here yet</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    When something important happens, it’ll show up here instantly.
                  </div>
                </div>
              ) : (
                <div className="divide-y">
                  {filtered.map((n) => {
                    const isUnread = n.read !== true;
                    const typeNorm = normalizeType(n);
                    const isResolved = hasActionCompleted(n);
                    const isActionRequired = actionRequiredTypes.has(typeNorm) && !isResolved && isActionForCurrentUser(n);
                    const tag = tagForNotification(n);
                    const s = styleForNotification(n);
                    const Icon = s.Icon || AlertTriangle;
                    const href = toAppPath(n.deepLinkUrl || '');
                    const hasLink = (n.deepLinkUrl || '').trim().length > 0;
                    const label = n.linkLabel || 'Open';
                    const ago = timeAgo(n);
                    const listingId = listingIdFor(n);
                    const listing = listingId ? listingById[listingId] : null;
                    const coverUrl =
                      listing?.photos?.[0]?.url || listing?.images?.[0] || '';
                    return (
                      <div
                        key={n.id}
                        data-action-required={isActionRequired ? 'true' : undefined}
                        className={cn(
                          'relative flex flex-col transition-colors group',
                          isActionRequired && 'mx-2 mt-2 mb-3 rounded-xl border-2 border-destructive bg-destructive/20 dark:bg-destructive/30 shadow-md shadow-destructive/20 hover:bg-destructive/25 dark:hover:bg-destructive/40',
                          !isActionRequired && 'hover:bg-muted/30',
                          isUnread && !isActionRequired && s.unreadRowClass,
                          isUnread && !isActionRequired && 'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-primary/50'
                        )}
                      >
                        {isActionRequired && (
                          <div className="flex items-center justify-center gap-2 rounded-t-xl bg-destructive px-3 py-2 sm:px-4 sm:py-2.5 text-destructive-foreground text-xs sm:text-sm font-bold uppercase tracking-wider">
                            <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" aria-hidden />
                            <span>Action required</span>
                          </div>
                        )}
                        <div className={cn('flex items-start gap-3', 'p-3 sm:p-4 md:p-5')}>
                        <div className={cn(
                          'h-11 w-11 sm:h-12 sm:w-12 md:h-20 md:w-20 rounded-lg sm:rounded-xl overflow-hidden border bg-muted shrink-0',
                          isActionRequired && !coverUrl ? 'border-destructive/50 bg-destructive/20 dark:bg-destructive/25 ring-2 ring-destructive/30' : 'border-border/60'
                        )}>
                          {coverUrl ? (
                            <Image
                              src={coverUrl}
                              alt=""
                              width={80}
                              height={80}
                              className="h-11 w-11 sm:h-12 sm:w-12 md:h-20 md:w-20 object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className={cn('h-11 w-11 sm:h-12 sm:w-12 md:h-20 md:w-20 flex items-center justify-center', isActionRequired ? 'bg-destructive/20 dark:bg-destructive/25' : isUnread ? s.chipClass : 'bg-muted/30')}>
                              <Icon className={cn('h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6', isActionRequired ? 'text-destructive' : isUnread ? undefined : 'text-muted-foreground')} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          {hasLink ? (
                            <Link
                              href={href}
                              onClick={() => { if (!isActionRequired) void markClicked(n.id); }}
                              className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40"
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {tag ? (
                                      <Badge variant={tag.variant} className="font-semibold shrink-0 text-xs">
                                        {tag.label}
                                      </Badge>
                                    ) : null}
                                    {listingId ? (
                                      <span className="text-xs text-muted-foreground truncate">
                                        {listing?.title ? listing.title : null}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className={cn('mt-0.5', isActionRequired ? 'text-sm sm:text-base font-bold text-foreground' : cn('text-sm font-semibold', isUnread ? 'text-foreground' : 'text-foreground/90'))}>
                                    {n.title}
                                  </div>
                                  <div className={cn('text-xs sm:text-sm mt-0.5 line-clamp-2', isUnread ? 'text-muted-foreground' : 'text-muted-foreground/90')}>
                                    {n.body}
                                  </div>
                                  {ago ? <div className="text-xs text-muted-foreground mt-1.5 sm:mt-2">{ago}</div> : null}
                                  {/* Mobile: show CTA below content for needs-action; desktop keeps it inline */}
                                  {isActionRequired && hasLink ? (
                                    <span className="mt-3 flex sm:hidden w-full min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
                                      <ExternalLink className="h-4 w-4 shrink-0" />
                                      {label}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                  {isUnread && !isActionRequired && (
                                    <Badge variant="outline" className={cn('font-semibold text-xs', s.newBadgeClass)}>
                                      New
                                    </Badge>
                                  )}
                                  {isActionRequired && hasLink ? (
                                    <span className="hidden sm:inline-flex shrink-0 items-center rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground min-h-[40px]">
                                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                      {label}
                                    </span>
                                  ) : (
                                    <Badge variant="outline" className="hidden sm:inline-flex">
                                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                      {label}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={() => { if (!isActionRequired) void markClicked(n.id); }}
                              className="w-full text-left rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40"
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {tag ? (
                                      <Badge variant={tag.variant} className="font-semibold shrink-0">
                                        {tag.label}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <div className={cn('mt-0.5', isActionRequired ? 'text-base font-bold text-foreground' : cn('text-sm font-semibold', isUnread ? 'text-foreground' : 'text-foreground/90'))}>
                                    {n.title}
                                  </div>
                                  <div className={cn('text-sm mt-0.5 line-clamp-2', isUnread ? 'text-muted-foreground' : 'text-muted-foreground/90')}>
                                    {n.body}
                                  </div>
                                  {ago ? <div className="text-xs text-muted-foreground mt-2">{ago}</div> : null}
                                </div>
                                {isUnread && !isActionRequired && (
                                  <Badge variant="outline" className={cn('shrink-0 font-semibold', s.newBadgeClass)}>
                                    New
                                  </Badge>
                                )}
                              </div>
                            </button>
                          )}
                        </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
          {user && (
            <div className="px-4 py-2 md:px-6 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
              <span title="Notifications load live from the server. If something looks wrong, try a hard refresh (Ctrl+Shift+R or Cmd+Shift+R).">
                {lastSyncedAt ? `Synced ${formatDistanceToNow(lastSyncedAt, { addSuffix: true })}` : 'Syncing…'}
              </span>
              <span className="hidden sm:inline">Red = action required (Pay now, Accept date, etc.)</span>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

