'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  CheckCircle2,
  AlertCircle,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Gavel,
  MessageSquare,
  Truck,
  ShieldAlert,
  DollarSign,
  Clock,
  ListTodo,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { listSellerListings } from '@/lib/firebase/listings';
import { getOrdersForUser, filterSellerRelevantOrders } from '@/lib/firebase/orders';
import { getUserProfile } from '@/lib/firebase/users';
import { getStripeBalance } from '@/lib/stripe/api';
import {
  filterActionItems,
  type ActionItemNotification,
} from '@/lib/notifications/actionItems';
import {
  buildKeyDateEvents,
  getCalendarGrid,
  toDateKey,
  WEEKDAY_LABELS,
  type KeyDateEvent,
  type KeyDateEventType,
  type KeyDateEventStatus,
  type BuildKeyDateEventsInput,
} from '@/lib/seller/keyDateEvents';
import type { Listing, Order } from '@/lib/types';
import type { SellerDashboardData } from '@/lib/seller/getSellerDashboardData';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { SellerOverviewSkeleton } from '@/components/skeletons/SellerOverviewSkeleton';

function toAppPath(url: string): string {
  const raw = String(url || '').trim();
  if (!raw) return '/seller/todo';
  if (raw.startsWith('/')) return raw;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const u = new URL(raw);
      return `${u.pathname}${u.search}${u.hash}` || '/seller/todo';
    } catch {
      return '/seller/todo';
    }
  }
  return '/seller/todo';
}

function getKeyDateEventIcon(type: KeyDateEventType) {
  switch (type) {
    case 'auction_ends':
      return Gavel;
    case 'offer_expires':
      return MessageSquare;
    case 'fulfillment_sla':
    case 'needs_action':
      return AlertCircle;
    case 'delivery_scheduled':
      return Truck;
    case 'dispute_window_closes':
      return ShieldAlert;
    case 'protection_ends':
    case 'payout_expected':
      return DollarSign;
    default:
      return Clock;
  }
}

function getKeyDateEventStyle(type: KeyDateEventType, status: KeyDateEventStatus): string {
  if (status === 'completed') return 'bg-muted/60 border-muted text-muted-foreground';
  if (status === 'overdue') return 'bg-destructive/10 border-destructive/40 text-destructive';
  if (status === 'needs_action') return 'bg-amber-500/15 border-amber-500/40 text-amber-800 dark:text-amber-300';
  switch (type) {
    case 'auction_ends':
      return 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400';
    case 'offer_expires':
      return 'bg-violet-500/10 border-violet-500/30 text-violet-700 dark:text-violet-400';
    case 'fulfillment_sla':
      return 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400';
    case 'needs_action':
      return 'bg-amber-500/15 border-amber-500/40 text-amber-800 dark:text-amber-300';
    case 'delivery_scheduled':
      return 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400';
    case 'dispute_window_closes':
      return 'bg-muted border-border text-muted-foreground';
    case 'protection_ends':
    case 'payout_expected':
      return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400';
    default:
      return 'bg-muted border-border text-muted-foreground';
  }
}

const MODAL_CLOSE_DELAY_MS = 250;
const DUE_SOON_DAYS = 7;

export default function SellerTodoPage() {
  const { user, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<ActionItemNotification[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [dashboardData, setDashboardData] = useState<SellerDashboardData | null>(null);
  const [stripeBalance, setStripeBalance] = useState<{
    nextPayoutArrivalDate: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [keyDateFilter, setKeyDateFilter] = useState<'all' | 'selling' | 'actions'>('all');
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<KeyDateEvent | null>(null);
  const [dayModalOpen, setDayModalOpen] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);

  const actionItems = useMemo(
    () => filterActionItems(notifications, 20),
    [notifications]
  );

  useEffect(() => {
    if (!user?.uid) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    const ref = collection(db, 'users', user.uid, 'notifications');
    const q = query(ref, orderBy('createdAt', 'desc'), limit(100));
    const unsub = onSnapshot(q, (snap) => {
      const next = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })) as ActionItemNotification[];
      setNotifications(next);
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.uid) {
      setListings([]);
      setOrders([]);
      setDashboardData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      listSellerListings(user.uid),
      getOrdersForUser(user.uid, 'seller'),
      user.getIdToken().then((token) =>
        fetch('/api/seller/dashboard', { headers: { authorization: `Bearer ${token}` } }).then((r) =>
          r.ok ? r.json().then((j: { data?: SellerDashboardData }) => j?.data ?? null) : null
        )
      ),
      getUserProfile(user.uid).then((p) => (p?.stripeAccountId ? getStripeBalance() : null)),
    ])
      .then(([listingsRes, sellerOrdersRes, dashboardRes, stripeRes]) => {
        if (cancelled) return;
        setListings(listingsRes ?? []);
        setOrders(filterSellerRelevantOrders(sellerOrdersRes ?? []));
        setDashboardData(dashboardRes ?? null);
        setStripeBalance(
          stripeRes
            ? { nextPayoutArrivalDate: stripeRes.nextPayoutArrivalDate ?? null }
            : null
        );
      })
      .catch(() => {
        if (!cancelled) setDashboardData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const keyDateEvents = useMemo(
    () =>
      buildKeyDateEvents({
        listings,
        orders: orders as BuildKeyDateEventsInput['orders'],
        offers: dashboardData?.offers ?? [],
        nextPayoutArrivalDate: stripeBalance?.nextPayoutArrivalDate ?? null,
      }),
    [listings, orders, dashboardData?.offers, stripeBalance?.nextPayoutArrivalDate]
  );

  const filteredKeyDateEvents =
    keyDateFilter === 'all'
      ? keyDateEvents
      : keyDateEvents.filter((e) => e.category === keyDateFilter);

  const dueSoonEvents = useMemo(() => {
    const now = Date.now();
    const endMs = now + DUE_SOON_DAYS * 24 * 60 * 60 * 1000;
    const todayKey = toDateKey(new Date());
    return filteredKeyDateEvents
      .filter((e) => e.sortMs >= now && e.sortMs <= endMs)
      .slice(0, 14);
  }, [filteredKeyDateEvents]);

  const monthStartKey = toDateKey(calendarMonth);
  const monthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
  const monthEndKey = toDateKey(monthEnd);
  const eventsThisMonth = filteredKeyDateEvents.filter(
    (e) => e.dateKey >= monthStartKey && e.dateKey <= monthEndKey
  );
  const grid = getCalendarGrid(calendarMonth, eventsThisMonth);
  const monthLabel = calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  if (authLoading || (user && loading && listings.length === 0 && orders.length === 0)) {
    return <SellerOverviewSkeleton className="min-h-screen pb-bottom-nav-safe md:pb-8" />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-bottom-nav-safe md:pb-8 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Sign in to see your To-Do list.</p>
            <Button asChild className="w-full mt-4">
              <Link href="/login">Sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-bottom-nav-safe md:pb-8 overflow-x-hidden w-full touch-manipulation">
      <div className="container mx-auto w-full max-w-7xl px-4 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8 space-y-4 sm:space-y-6 md:space-y-8 min-w-0">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold flex items-center gap-3">
            <span className="flex h-11 w-11 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0">
              <ListTodo className="h-5 w-5 text-primary" />
            </span>
            To-Do
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Tasks and key dates in one place. Do what’s next, then plan ahead.
          </p>
        </div>

        {/* Do next — actionable tasks from notifications */}
        <Card className="rounded-xl border border-border/50 bg-card overflow-hidden min-w-0">
          <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <CardTitle className="text-lg sm:text-xl font-extrabold flex items-center gap-2 min-w-0">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                Do next
                {actionItems.length > 0 && (
                  <Badge variant="destructive" className="shrink-0">
                    {actionItems.length}
                  </Badge>
                )}
              </CardTitle>
            </div>
            <CardDescription className="text-sm sm:text-base mt-1">
              Pay, respond to offers, set delivery address, or place a bid.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6 pt-0">
            {actionItems.length === 0 ? (
              <p className="text-sm sm:text-base text-muted-foreground py-6 sm:py-8 text-center rounded-lg bg-muted/30 px-4">
                You’re all caught up. Nothing needs your response right now.
              </p>
            ) : (
              <ul className="space-y-3 sm:space-y-4">
                {actionItems.map((n) => {
                  const href = toAppPath(n.deepLinkUrl || '');
                  const label = n.linkLabel || 'Open';
                  const hasLink = (n.deepLinkUrl || '').trim().length > 0;
                  return (
                    <li
                      key={n.id}
                      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 py-4 sm:py-4 px-4 sm:px-4 rounded-lg border border-destructive/30 bg-destructive/10 dark:bg-destructive/20 min-h-[60px] sm:min-h-[56px]"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-sm sm:text-base font-medium block">{n.title}</span>
                        {n.body && (
                          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 line-clamp-2 break-words">
                            {n.body}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 w-full sm:w-auto">
                        {hasLink ? (
                          <Button asChild size="sm" variant="destructive" className="min-h-[44px] h-11 w-full sm:w-auto px-4 touch-manipulation">
                            <Link href={href}>{label}</Link>
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Key dates — calendar (second) */}
        <Card className="rounded-xl border border-border/50 bg-card overflow-hidden min-w-0">
          <CardHeader className="px-4 sm:px-6 md:px-8 pt-4 sm:pt-6 pb-3 sm:pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <CalendarIcon className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                <CardTitle className="text-lg sm:text-xl font-extrabold truncate">Key dates</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                {(['all', 'selling', 'actions'] as const).map((f) => (
                  <Button
                    key={f}
                    variant={keyDateFilter === f ? 'secondary' : 'ghost'}
                    size="sm"
                    className="min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-0 touch-manipulation capitalize px-4 sm:px-4"
                    onClick={() => setKeyDateFilter(f)}
                  >
                    {f === 'all' ? 'All' : f === 'selling' ? 'Selling' : 'Actions'}
                  </Button>
                ))}
              </div>
            </div>
            <CardDescription className="text-sm sm:text-base mt-1">
              Tap a day to see events. Use Today to jump back. On mobile, scroll the calendar horizontally for wider days.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6 md:px-8 pb-6 sm:pb-8 md:pb-10 pt-0">
            <div className="space-y-4 sm:space-y-5 md:space-y-6 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 px-0 sm:px-2">
                <div className="flex items-center justify-between gap-1 sm:gap-4 sm:flex-1 min-w-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-12 w-12 sm:h-12 sm:w-12 shrink-0 touch-manipulation rounded-full min-h-[48px] min-w-[48px]"
                    onClick={() =>
                      setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
                    }
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
                  </Button>
                  <span className="text-base sm:text-lg md:text-xl font-semibold text-foreground tabular-nums truncate min-w-0 px-1">
                    {monthLabel}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-12 w-12 sm:h-12 sm:w-12 shrink-0 touch-manipulation rounded-full min-h-[48px] min-w-[48px]"
                    onClick={() =>
                      setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
                    }
                    aria-label="Next month"
                  >
                    <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
                  </Button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 min-h-[44px] h-11 touch-manipulation px-4"
                  onClick={() => {
                    const d = new Date();
                    setCalendarMonth(new Date(d.getFullYear(), d.getMonth(), 1));
                  }}
                >
                  Today
                </Button>
              </div>
              {/* Mobile: horizontal scroll so day cells stay wide enough; desktop: normal grid */}
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 overflow-y-visible we-scrollbar-hover">
                <div className="grid grid-cols-7 gap-1 sm:gap-2 md:gap-2.5 bg-border/40 rounded-xl p-2 sm:p-3 md:p-4 min-w-[364px] sm:min-w-0 w-max sm:w-full">
                  {WEEKDAY_LABELS.map((label, i) => (
                    <div
                      key={i}
                      className="text-center text-xs sm:text-sm font-semibold text-muted-foreground py-2.5 sm:py-3 md:py-4 min-w-[48px] sm:min-w-0"
                    >
                      {label}
                    </div>
                  ))}
                  {grid.map((cell, i) => {
                    if (cell.empty) {
                      return (
                        <div
                          key={`e-${i}`}
                          className="bg-muted/20 rounded-lg min-h-[72px] sm:min-h-[88px] md:min-h-[100px] min-w-[48px] sm:min-w-0"
                        />
                      );
                    }
                    const dayEvents = cell.events ?? [];
                    return (
                      <button
                        key={cell.dateKey}
                        type="button"
                        onClick={() => {
                          setSelectedDateKey(cell.dateKey);
                          setDayModalOpen(true);
                        }}
                        className={cn(
                          'min-h-[72px] sm:min-h-[88px] md:min-h-[100px] min-w-[48px] sm:min-w-0 flex flex-col items-stretch p-1.5 sm:p-2.5 md:p-3 rounded-lg text-left touch-manipulation transition-colors active:scale-[0.98]',
                          'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-inset',
                          cell.isToday && 'ring-2 ring-primary bg-primary/15',
                          !cell.isToday && 'bg-background/80'
                        )}
                      >
                      <span
                        className={cn(
                          'text-sm sm:text-base font-medium shrink-0',
                          cell.isToday ? 'text-primary' : 'text-foreground'
                        )}
                      >
                        {cell.day}
                      </span>
                      <div className="flex-1 min-h-0 flex flex-col gap-1 sm:gap-1.5 mt-1 sm:mt-2 overflow-hidden">
                        {dayEvents.slice(0, 3).map((ev) => {
                          const Icon =
                            ev.status === 'completed' ? CheckCircle2 : getKeyDateEventIcon(ev.type);
                          const style = getKeyDateEventStyle(ev.type, ev.status);
                          const openEvent = (e: React.MouseEvent | React.KeyboardEvent) => {
                            e.stopPropagation();
                            setSelectedEvent(ev);
                            setSelectedDateKey(null);
                            setDayModalOpen(false);
                            setEventModalOpen(true);
                          };
                          return (
                            <div
                              key={ev.id}
                              role="button"
                              tabIndex={0}
                              onClick={openEvent}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  openEvent(e);
                                }
                              }}
                              className={cn(
                                'w-full flex items-center gap-1.5 rounded-md px-2 py-1.5 sm:py-1.5 text-xs truncate min-h-[28px] sm:min-h-[22px] text-left touch-manipulation cursor-pointer active:opacity-90',
                                style,
                                'border border-current/20 hover:opacity-90 focus:outline-none focus:ring-1 focus:ring-primary/50'
                              )}
                              title={`${ev.label}${ev.subtitle ? ` — ${ev.subtitle}` : ''} — Tap for details`}
                            >
                              <Icon className="h-3.5 w-3.5 sm:h-3.5 sm:w-3.5 shrink-0" />
                              <span className="truncate">{ev.label}</span>
                            </div>
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <span className="text-xs text-muted-foreground px-2 pt-0.5">
                            +{dayEvents.length - 3} more
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 pt-4 sm:pt-5 border-t border-border/60 mt-4">
                <span className="text-xs font-medium text-muted-foreground">Legend:</span>
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded-sm bg-muted border border-muted shrink-0"
                    aria-hidden
                  />
                  <span className="text-xs text-muted-foreground">Done</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded-sm bg-destructive/20 border border-destructive/40 shrink-0"
                    aria-hidden
                  />
                  <span className="text-xs text-muted-foreground">Overdue</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded-sm bg-amber-500/15 border border-amber-500/40 shrink-0"
                    aria-hidden
                  />
                  <span className="text-xs text-muted-foreground">Needs action</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-3 w-3 rounded-sm bg-blue-500/10 border border-blue-500/30 shrink-0"
                    aria-hidden
                  />
                  <span className="text-xs text-muted-foreground">Upcoming</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Due soon — next 7 days (third) */}
        {dueSoonEvents.length > 0 && (
          <Card className="rounded-xl border border-border/50 bg-card overflow-hidden min-w-0">
            <CardHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-3 sm:pb-4">
              <CardTitle className="text-lg sm:text-xl font-extrabold flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-primary shrink-0" />
                Due soon
              </CardTitle>
              <CardDescription className="text-sm sm:text-base mt-1">
                Next {DUE_SOON_DAYS} days. Tap to open details.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 sm:px-6 pb-4 sm:pb-6 pt-0">
              <ul className="space-y-3 sm:space-y-4">
                {dueSoonEvents.map((ev) => {
                  const Icon = ev.status === 'completed' ? CheckCircle2 : getKeyDateEventIcon(ev.type);
                  const style = getKeyDateEventStyle(ev.type, ev.status);
                  const dateStr =
                    ev.dateKey === toDateKey(new Date())
                      ? 'Today'
                      : ev.date.toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        });
                  return (
                    <li key={ev.id}>
                      <Link
                        href={ev.href}
                        className={cn(
                          'flex items-center gap-3 sm:gap-4 p-4 sm:p-4 rounded-lg border-2 transition-shadow min-h-[56px] sm:min-h-[56px] touch-manipulation active:scale-[0.99]',
                          style,
                          'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2'
                        )}
                      >
                        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg border border-current/30 flex items-center justify-center flex-shrink-0">
                          <Icon className="h-5 w-5 sm:h-5 sm:w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm sm:text-base font-semibold text-foreground">{ev.label}</p>
                          {ev.subtitle && (
                            <p className="text-xs sm:text-sm text-muted-foreground truncate mt-0.5">
                              {ev.subtitle}
                            </p>
                          )}
                        </div>
                        <span className="text-xs sm:text-sm font-medium text-muted-foreground shrink-0">
                          {dateStr}
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Day detail modal */}
      <Dialog
        open={dayModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDayModalOpen(false);
            setTimeout(() => setSelectedDateKey(null), MODAL_CLOSE_DELAY_MS);
          }
        }}
      >
        <DialogContent className="max-w-md flex flex-col h-[min(85vh,calc(100svh-2rem))] max-h-[min(85vh,calc(100svh-2rem))] overflow-hidden p-4 sm:p-6 w-[calc(100vw-2rem)] sm:w-full">
          <DialogHeader className="shrink-0 space-y-2 pb-3 pr-12 sm:pr-10">
            <DialogTitle className="text-xl sm:text-2xl pr-2">
              {selectedDateKey
                ? selectedDateKey === toDateKey(new Date())
                  ? 'Today'
                  : new Date(selectedDateKey + 'T12:00:00').toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })
                : 'Events'}
            </DialogTitle>
            <DialogDescription>
              {selectedDateKey &&
                (() => {
                  const dayEvents = filteredKeyDateEvents.filter((e) => e.dateKey === selectedDateKey);
                  return dayEvents.length === 0
                    ? 'No events this day.'
                    : `${dayEvents.length} event${dayEvents.length !== 1 ? 's' : ''}`;
                })()}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden -mx-1 px-1 space-y-3 sm:space-y-4">
            {selectedDateKey &&
              (() => {
                const dayEvents = filteredKeyDateEvents.filter((e) => e.dateKey === selectedDateKey);
                if (dayEvents.length === 0) {
                  return (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No events on this day.
                    </p>
                  );
                }
                const dateOpts: Intl.DateTimeFormatOptions = {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                };
                return dayEvents.map((event) => {
                  const Icon =
                    event.status === 'completed' ? CheckCircle2 : getKeyDateEventIcon(event.type);
                  const style = getKeyDateEventStyle(event.type, event.status);
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => {
                        setSelectedEvent(event);
                        setSelectedDateKey(null);
                        setDayModalOpen(false);
                        setEventModalOpen(true);
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 sm:p-4 rounded-lg border-2 transition-shadow min-h-[48px] sm:min-h-[52px] touch-manipulation text-left',
                        style,
                        'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2'
                      )}
                    >
                      <div className="w-9 h-9 rounded-lg border border-current/30 flex items-center justify-center flex-shrink-0">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{event.label}</p>
                        {event.subtitle && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {event.subtitle}
                          </p>
                        )}
                        {event.status === 'overdue' && (
                          <p className="text-xs font-medium text-destructive mt-0.5">Overdue</p>
                        )}
                      </div>
                      <span className="text-xs font-medium text-muted-foreground shrink-0">
                        {event.dateKey === toDateKey(new Date())
                          ? 'Today'
                          : event.date.toLocaleDateString(undefined, dateOpts)}
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  );
                });
              })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Single-event modal */}
      <Dialog
        open={eventModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEventModalOpen(false);
            setTimeout(() => setSelectedEvent(null), MODAL_CLOSE_DELAY_MS);
          }
        }}
      >
        <DialogContent className="max-w-md max-h-[min(85vh,calc(100svh-2rem))] overflow-y-auto overflow-x-hidden p-4 sm:p-6 w-[calc(100vw-2rem)] sm:w-full">
          {selectedEvent &&
            (() => {
              const ev = selectedEvent;
              const Icon = ev.status === 'completed' ? CheckCircle2 : getKeyDateEventIcon(ev.type);
              const style = getKeyDateEventStyle(ev.type, ev.status);
              const dateOpts: Intl.DateTimeFormatOptions = {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              };
              const dateStr =
                ev.dateKey === toDateKey(new Date())
                  ? 'Today'
                  : ev.date.toLocaleDateString(undefined, dateOpts);

              const primaryAction = (() => {
                switch (ev.type) {
                  case 'auction_ends':
                    return { label: 'View listing', href: ev.href };
                  case 'offer_expires':
                    return {
                      label: ev.status === 'completed' ? 'View offer' : 'Respond to offer',
                      href: ev.href,
                    };
                  case 'fulfillment_sla':
                    return {
                      label: ev.status === 'completed' ? 'View order' : 'Update delivery',
                      href: ev.href,
                    };
                  case 'delivery_scheduled':
                    return { label: 'View order', href: ev.href };
                  case 'needs_action':
                    return { label: 'View sales needing action', href: ev.href };
                  case 'dispute_window_closes':
                  case 'protection_ends':
                    return { label: 'View order', href: ev.href };
                  case 'payout_expected':
                    return { label: 'View payouts', href: ev.href };
                  default:
                    return { label: 'View', href: ev.href };
                }
              })();

              const statusBadge =
                ev.status === 'completed'
                  ? 'Done'
                  : ev.status === 'overdue'
                    ? 'Overdue'
                    : ev.status === 'needs_action'
                      ? 'Needs action'
                      : null;

              return (
                <>
                  <DialogHeader className="space-y-2 pb-4">
                    <div className={cn('flex items-center gap-3 p-3 rounded-lg border-2', style)}>
                      <div className="w-10 h-10 rounded-lg border border-current/30 flex items-center justify-center flex-shrink-0">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <DialogTitle className="text-lg font-semibold truncate">{ev.label}</DialogTitle>
                        {ev.subtitle && (
                          <p className="text-sm text-muted-foreground truncate mt-0.5">
                            {ev.subtitle}
                          </p>
                        )}
                      </div>
                      {statusBadge && (
                        <Badge
                          variant={
                            ev.status === 'overdue'
                              ? 'destructive'
                              : ev.status === 'needs_action'
                                ? 'secondary'
                                : 'outline'
                          }
                          className="shrink-0"
                        >
                          {statusBadge}
                        </Badge>
                      )}
                    </div>
                    <DialogDescription className="sr-only">
                      {ev.label}. {ev.subtitle ?? ''} {dateStr}.
                    </DialogDescription>
                    <p className="text-sm text-muted-foreground">{dateStr}</p>
                  </DialogHeader>
                  <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setEventModalOpen(false)}
                      className="min-h-[44px] touch-manipulation"
                    >
                      Close
                    </Button>
                    {primaryAction.href ? (
                      <Button asChild className="min-h-[44px] touch-manipulation">
                        <Link href={primaryAction.href} onClick={() => setEventModalOpen(false)}>
                          {primaryAction.label}
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Link>
                      </Button>
                    ) : (
                      <Button disabled className="min-h-[44px] touch-manipulation">
                        {primaryAction.label}
                      </Button>
                    )}
                  </DialogFooter>
                </>
              );
            })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
