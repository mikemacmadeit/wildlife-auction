/**
 * /dashboard/notifications
 * User Notification Center (in-app)
 */

'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, doc, onSnapshot, orderBy, query, limit, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

function listingIdFromUrl(url: string): string | null {
  try {
    const m = String(url || '').match(/\/listing\/([^/?#]+)/i);
    return m?.[1] ? String(m[1]) : null;
  } catch {
    return null;
  }
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

  if (c === 'marketing' || t.startsWith('marketing_')) return 'recommended';
  if (c === 'onboarding' || t === 'user_welcome' || t === 'profile_incomplete') return 'account';
  if (c === 'admin' || t.startsWith('admin_') || t.startsWith('listing_') || t.startsWith('compliance_')) return 'account';

  // Selling-side signals
  if (t === 'bid_received') return 'selling';
  if (t === 'offer_received') return 'selling';
  if (t === 'order_received' || t === 'payout_released') return 'selling';

  // Buying-side signals
  if (t.startsWith('auction_') || t.startsWith('bid_')) return 'buying';
  if (t.startsWith('offer_')) return 'buying';
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

function tagForNotification(n: UserNotification): { label: string; className: string } | null {
  const t = normalizeType(n);

  // eBay-style tags
  if (t === 'auction_lost') {
    return { label: 'GOT AWAY', className: 'bg-red-600 text-white border-red-700' };
  }
  if (t === 'auction_won') {
    return { label: 'WON', className: 'bg-emerald-600 text-white border-emerald-700' };
  }
  if (t === 'auction_ending_soon') {
    return { label: 'Watched item reminder', className: 'bg-sky-600 text-white border-sky-700' };
  }
  if (t === 'bid_outbid') {
    return { label: 'Outbid', className: 'bg-amber-600 text-white border-amber-700' };
  }
  if (t === 'offer_received') {
    return { label: 'Seller offer', className: 'bg-sky-600 text-white border-sky-700' };
  }
  if (t === 'offer_countered') {
    return { label: 'Counter offer', className: 'bg-sky-600 text-white border-sky-700' };
  }
  if (t.startsWith('offer_')) {
    return { label: 'Offer update', className: 'bg-sky-600 text-white border-sky-700' };
  }
  if (t.startsWith('order_')) {
    return { label: 'Order update', className: 'bg-indigo-600 text-white border-indigo-700' };
  }
  if (t === 'payout_released') {
    return { label: 'Payout released', className: 'bg-emerald-600 text-white border-emerald-700' };
  }
  if (t === 'message_received') {
    return { label: 'Message', className: 'bg-violet-600 text-white border-violet-700' };
  }

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
  const autoMarkedReadRef = useRef(false);
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
        setLoading(false);

        // UX: once user is on the notifications page, clear the sidebar "new" badge by
        // marking the currently loaded unread notifications as read (one-time per visit).
        // This mirrors how inbox pages clear their unread badges.
        if (!autoMarkedReadRef.current) {
          autoMarkedReadRef.current = true;
          const unread = next.filter((n) => n.read !== true);
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

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    if (filter === 'important') {
      // Important = unread OR high-signal transactional types
      return items.filter((n) => {
        if (n.read !== true) return true;
        const t = normalizeType(n);
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
    }
    return items.filter((n) => filterFor(n) === filter);
  }, [items, filter]);

  const unreadCount = useMemo(() => items.filter((n) => n.read !== true).length, [items]);
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
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex items-center justify-center min-h-[360px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <div className="text-sm text-muted-foreground">Loading notifications…</div>
          </div>
        </div>
      </div>
    );
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
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
      <Card className="border-2 border-border/60 overflow-hidden">
        <CardContent className="p-5 md:p-6">
          <div className="flex items-start md:items-center justify-between gap-4 flex-wrap">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center">
                  <Bell className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
                    Notifications
                    {unreadCount > 0 ? (
                      <Badge variant="secondary" className="font-semibold">
                        {unreadCount} unread
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="font-semibold text-muted-foreground">
                        All caught up
                      </Badge>
                    )}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Auction signals, order updates, messages, and trust alerts—built for speed.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap text-xs">
                <Badge variant="secondary" className="font-semibold">
                  {filterCounts.all} total
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={markAllRead} disabled={unreadCount === 0} className="font-semibold min-h-[44px]">
                <CheckCheck className="h-4 w-4 mr-2" />
                Mark all read
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-2 border-border/60 overflow-hidden">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Inbox</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 we-scrollbar-hover">
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'important', label: 'Important' },
                  { key: 'buying', label: 'Buying' },
                  { key: 'selling', label: 'Selling' },
                  { key: 'recommended', label: 'Recommended' },
                  { key: 'account', label: 'Account' },
                ] as const
              ).map((f) => {
                const Icon = iconForFilter(f.key);
                const isActive = filter === f.key;
                const unread = (filterUnreadCounts as any)[f.key] as number;
                return (
                  <Button
                    key={f.key}
                    type="button"
                    variant={isActive ? 'default' : 'outline'}
                    onClick={() => setFilter(f.key)}
                    className="min-h-[40px] rounded-full font-semibold whitespace-nowrap"
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {f.label}
                    {unread > 0 ? (
                      <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
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
                    const tag = tagForNotification(n);
                    const s = styleForNotification(n);
                    const Icon = s.Icon || AlertTriangle;
                    const href = n.deepLinkUrl || '';
                    const label = n.linkLabel || 'Open';
                    const ago = timeAgo(n);
                    const listingId = listingIdFor(n);
                    const listing = listingId ? listingById[listingId] : null;
                    const coverUrl =
                      listing?.photos?.[0]?.url || listing?.images?.[0] || '';
                    return (
                      <div
                        key={n.id}
                        className={cn(
                          'relative p-5 flex items-start gap-3 transition-colors group hover:bg-muted/30',
                          isUnread && s.unreadRowClass,
                          isUnread && 'before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-primary/50'
                        )}
                      >
                        <div className="h-12 w-12 rounded-xl overflow-hidden border border-border/60 bg-muted shrink-0">
                          {coverUrl ? (
                            <Image
                              src={coverUrl}
                              alt=""
                              width={48}
                              height={48}
                              className="h-12 w-12 object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className={cn('h-12 w-12 flex items-center justify-center', isUnread ? s.chipClass : 'bg-muted/30')}>
                              <Icon className={cn('h-5 w-5', isUnread ? undefined : 'text-muted-foreground')} />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          {href ? (
                            <Link
                              href={href}
                              onClick={() => void markClicked(n.id)}
                              className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {tag ? (
                                      <Badge variant="outline" className={cn('font-extrabold border', tag.className)}>
                                        {tag.label}
                                      </Badge>
                                    ) : null}
                                    {listingId ? (
                                      <span className="text-xs text-muted-foreground truncate">
                                        {listing?.title ? listing.title : null}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className={cn('text-sm font-semibold', isUnread ? 'text-foreground' : 'text-foreground/90')}>
                                    {n.title}
                                  </div>
                                  <div className={cn('text-sm mt-0.5 line-clamp-2', isUnread ? 'text-muted-foreground' : 'text-muted-foreground/90')}>
                                    {n.body}
                                  </div>
                                  {ago ? <div className="text-xs text-muted-foreground mt-2">{ago}</div> : null}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {isUnread && (
                                    <Badge variant="outline" className={cn('font-semibold', s.newBadgeClass)}>
                                      New
                                    </Badge>
                                  )}
                                  <Badge variant="outline" className="hidden sm:inline-flex">
                                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                    {label}
                                  </Badge>
                                </div>
                              </div>
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void markClicked(n.id)}
                              className="w-full text-left rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {tag ? (
                                      <Badge variant="outline" className={cn('font-extrabold border', tag.className)}>
                                        {tag.label}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <div className={cn('text-sm font-semibold', isUnread ? 'text-foreground' : 'text-foreground/90')}>
                                    {n.title}
                                  </div>
                                  <div className={cn('text-sm mt-0.5 line-clamp-2', isUnread ? 'text-muted-foreground' : 'text-muted-foreground/90')}>
                                    {n.body}
                                  </div>
                                  {ago ? <div className="text-xs text-muted-foreground mt-2">{ago}</div> : null}
                                </div>
                                {isUnread && (
                                  <Badge variant="outline" className={cn('shrink-0 font-semibold', s.newBadgeClass)}>
                                    New
                                  </Badge>
                                )}
                              </div>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

