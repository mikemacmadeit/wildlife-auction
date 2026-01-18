/**
 * /dashboard/notifications
 * User Notification Center (in-app)
 */

'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, doc, onSnapshot, orderBy, query, limit, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Bell, CheckCheck, ExternalLink, Gavel, Package, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';

type UiTab = 'all' | 'auctions' | 'orders';

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
};

function categoryFor(n: UserNotification): UiTab {
  const c = String(n.category || '').toLowerCase();
  if (c === 'auctions') return 'auctions';
  if (c === 'orders') return 'orders';
  // fallback based on type
  const t = String(n.type || '');
  if (t.startsWith('auction_') || t.startsWith('bid_')) return 'auctions';
  if (t.startsWith('order_') || t.startsWith('payout_')) return 'orders';
  return 'all';
}

function iconFor(tab: UiTab) {
  if (tab === 'auctions') return Gavel;
  if (tab === 'orders') return ShoppingBag;
  return Bell;
}

export default function NotificationsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<UiTab>('all');
  const [items, setItems] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);

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
      },
      () => {
        setItems([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user?.uid, authLoading]);

  const filtered = useMemo(() => {
    if (tab === 'all') return items;
    return items.filter((n) => categoryFor(n) === tab);
  }, [items, tab]);

  const unreadCount = useMemo(() => items.filter((n) => n.read !== true).length, [items]);

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
    <div className="container mx-auto px-4 py-6 md:py-8 max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            Notifications
            {unreadCount > 0 && <Badge variant="secondary">{unreadCount} unread</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground">
            Fast auction signals. Trust-first order updates. All in one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={markAllRead} disabled={unreadCount === 0}>
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark all read
          </Button>
        </div>
      </div>

      <Card className="border-border/60 overflow-hidden">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Inbox</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs value={tab} onValueChange={(v) => setTab(v as UiTab)} className="w-full">
            <div className="px-5 pb-4">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="auctions">Auctions</TabsTrigger>
                <TabsTrigger value="orders">Orders</TabsTrigger>
              </TabsList>
            </div>

            <Separator />

            <TabsContent value={tab} className="m-0">
              {filtered.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No notifications here yet.
                </div>
              ) : (
                <div className="divide-y">
                  {filtered.map((n) => {
                    const isUnread = n.read !== true;
                    const t = categoryFor(n);
                    const Icon = iconFor(t);
                    const href = n.deepLinkUrl || '';
                    const label = n.linkLabel || 'Open';
                    return (
                      <div
                        key={n.id}
                        className={cn(
                          'p-5 flex items-start gap-3',
                          isUnread && 'bg-primary/5'
                        )}
                      >
                        <div className={cn('h-10 w-10 rounded-xl border flex items-center justify-center', isUnread ? 'bg-primary/15 border-primary/20' : 'bg-muted/30 border-border/60')}>
                          <Icon className={cn('h-5 w-5', isUnread ? 'text-primary' : 'text-muted-foreground')} />
                        </div>
                        <div className="flex-1 min-w-0">
                          {href ? (
                            <Link
                              href={href}
                              onClick={() => void markClicked(n.id)}
                              className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className={cn('text-sm font-semibold', isUnread ? 'text-foreground' : 'text-muted-foreground')}>
                                    {n.title}
                                  </div>
                                  <div className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                                    {n.body}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {isUnread && <Badge variant="secondary">New</Badge>}
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
                              className="w-full text-left rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className={cn('text-sm font-semibold', isUnread ? 'text-foreground' : 'text-muted-foreground')}>
                                    {n.title}
                                  </div>
                                  <div className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
                                    {n.body}
                                  </div>
                                </div>
                                {isUnread && <Badge variant="secondary" className="shrink-0">New</Badge>}
                              </div>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

