'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, ArrowLeft, Archive, Inbox, MoreVertical, Search, CheckCheck } from 'lucide-react';
import { MessageThreadComponent } from '@/components/messaging/MessageThread';
import { getOrCreateThread, markThreadAsRead, setThreadArchived, subscribeToAllUserThreads } from '@/lib/firebase/messages';
import { getListingById } from '@/lib/firebase/listings';
import { getUserProfile } from '@/lib/firebase/users';
import { markNotificationsAsReadByType } from '@/lib/firebase/notifications';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { MessageThread, Listing } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Image from 'next/image';
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function MessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const listingIdParam = searchParams?.get('listingId');
  const sellerIdParam = searchParams?.get('sellerId');
  const threadIdParam = searchParams?.get('threadId');

  const [thread, setThread] = useState<MessageThread | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [otherPartyName, setOtherPartyName] = useState('Seller');
  const [otherPartyAvatar, setOtherPartyAvatar] = useState<string | undefined>(undefined);
  const [orderStatus, setOrderStatus] = useState<'pending' | 'paid' | 'completed' | undefined>();
  const [loading, setLoading] = useState(true);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [inboxTab, setInboxTab] = useState<'all' | 'unread' | 'archived'>('all');
  const [search, setSearch] = useState('');
  const [metaByThreadId, setMetaByThreadId] = useState<
    Record<
      string,
      { otherName: string; otherAvatar?: string; listingTitle: string; listingImageUrl?: string; updatedAtMs: number }
    >
  >({});
  const metaFetchInFlightRef = useRef<Set<string>>(new Set());

  const inboxItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const isBuyerFor = (t: MessageThread) => (user?.uid ? t.buyerId === user.uid : true);

    const rows = threads.map((t) => {
      const isBuyer = user?.uid ? t.buyerId === user.uid : true;
      const unread = isBuyer
        ? (typeof (t as any).buyerUnreadCount === 'number' ? (t as any).buyerUnreadCount : 0)
        : (typeof (t as any).sellerUnreadCount === 'number' ? (t as any).sellerUnreadCount : 0);
      const meta = metaByThreadId[t.id];
      const archived = (t as any)?.archived === true;
      const updatedAtMs = t.updatedAt?.getTime?.() || meta?.updatedAtMs || 0;
      return {
        id: t.id,
        unread,
        archived,
        updatedAtMs,
        otherName: meta?.otherName || 'User',
        otherAvatar: meta?.otherAvatar,
        listingTitle: meta?.listingTitle || `Listing ${t.listingId.slice(-6)}`,
        listingImageUrl: meta?.listingImageUrl,
        lastMessagePreview: t.lastMessagePreview || '',
        thread: t,
      };
    });

    // Tab filters
    let filtered = rows;
    if (inboxTab === 'unread') filtered = filtered.filter((r) => r.unread > 0 && !r.archived);
    if (inboxTab === 'archived') filtered = filtered.filter((r) => r.archived);
    if (inboxTab === 'all') filtered = filtered.filter((r) => !r.archived);

    // Search
    if (q) {
      filtered = filtered.filter((r) => {
        const hay = `${r.otherName} ${r.listingTitle} ${r.lastMessagePreview}`.toLowerCase();
        return hay.includes(q);
      });
    }

    filtered.sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
    return filtered;
  }, [inboxTab, metaByThreadId, search, threads, user?.uid]);

  // Real-time inbox subscription
  useEffect(() => {
    if (!user?.uid) return;
    if (listingIdParam && sellerIdParam) return; // deep-link mode uses initializeThread

    const unsub = subscribeToAllUserThreads(
      user.uid,
      (data) => {
        setThreads(data);
        setLoading(false);
        // If nothing selected yet, keep existing selection or default to first visible thread.
        if (!selectedThreadId && data[0]?.id) setSelectedThreadId(data[0].id);
      },
      {
        onError: (e) => {
          console.error('[dashboard/messages] subscribeToAllUserThreads error', e);
        },
      }
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingIdParam, sellerIdParam, user?.uid]);

  // Best-effort meta hydration for thread list (names + listing title + listing image).
  useEffect(() => {
    if (!user?.uid) return;
    if (!threads.length) return;

    const need = threads.filter((t) => !metaByThreadId[t.id] && !metaFetchInFlightRef.current.has(t.id)).slice(0, 25);
    if (!need.length) return;
    need.forEach((t) => metaFetchInFlightRef.current.add(t.id));

    Promise.allSettled(
      need.map(async (t) => {
        const otherPartyId = user.uid === t.buyerId ? t.sellerId : t.buyerId;
        const [otherProfile, listingData] = await Promise.all([
          getUserProfile(otherPartyId).catch(() => null),
          getListingById(t.listingId).catch(() => null),
        ]);

        const listingImageUrl =
          (listingData as any)?.photos?.find?.((p: any) => p?.photoId && p.photoId === (listingData as any)?.coverPhotoId)?.url ||
          (listingData as any)?.photos?.[0]?.url ||
          (listingData as any)?.images?.[0] ||
          undefined;

        return {
          threadId: t.id,
          otherName: otherProfile?.displayName || otherProfile?.profile?.fullName || otherProfile?.email?.split('@')?.[0] || 'User',
          otherAvatar: otherProfile?.photoURL || undefined,
          listingTitle: listingData?.title || 'Listing',
          listingImageUrl,
          updatedAtMs: t.updatedAt?.getTime?.() || 0,
        };
      })
    ).then((results) => {
      const next: any = {};
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        next[r.value.threadId] = {
          otherName: r.value.otherName,
          otherAvatar: r.value.otherAvatar,
          listingTitle: r.value.listingTitle,
          listingImageUrl: r.value.listingImageUrl,
          updatedAtMs: r.value.updatedAtMs,
        };
      }
      setMetaByThreadId((prev) => ({ ...prev, ...next }));
    });
  }, [metaByThreadId, threads, user?.uid]);

  const initializeThread = useCallback(async () => {
    if (!user) return;
    if (!listingIdParam || !sellerIdParam) return;

    try {
      setLoading(true);

      // Get listing
      const listingData = await getListingById(listingIdParam);
      setListing(listingData);

      // Get or create thread
      const threadId = await getOrCreateThread(listingIdParam, user.uid, sellerIdParam);
      
      // Get thread data
      const threadsRef = collection(db, 'messageThreads');
      const threadQuery = query(threadsRef, where('__name__', '==', threadId));
      const threadSnapshot = await getDocs(threadQuery);
      
      if (!threadSnapshot.empty) {
        const threadData = threadSnapshot.docs[0].data();
        const threadObj = {
          id: threadId,
          ...threadData,
          createdAt: threadData.createdAt?.toDate() || new Date(),
          updatedAt: threadData.updatedAt?.toDate() || new Date(),
          lastMessageAt: threadData.lastMessageAt?.toDate(),
        } as MessageThread;
        setThread(threadObj);
        // Mark thread as read when opening via deep link
        markThreadAsRead(threadId, user.uid).catch(() => {});
        // Clear message notification badge when viewing messages (best-effort)
        markNotificationsAsReadByType(user.uid, 'message_received').catch(() => {});
      }

      // Get other party name
      const otherParty = await getUserProfile(sellerIdParam);
      setOtherPartyName(otherParty?.displayName || otherParty?.email?.split('@')[0] || 'Seller');
      setOtherPartyAvatar(otherParty?.photoURL || undefined);

      // Check order status
      const ordersRef = collection(db, 'orders');
      const orderQuery = query(
        ordersRef,
        where('listingId', '==', listingIdParam),
        where('buyerId', '==', user.uid)
      );
      const orderSnapshot = await getDocs(orderQuery);
      
      if (!orderSnapshot.empty) {
        const orderData = orderSnapshot.docs[0].data();
        setOrderStatus(orderData.status as 'pending' | 'paid' | 'completed');
      }
    } catch (error: any) {
      console.error('Error initializing thread:', error);
      toast({
        title: 'Error',
        description: 'Failed to load messaging. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [listingIdParam, sellerIdParam, toast, user]);

  useEffect(() => {
    if (!authLoading && user) {
      // 1) Listing deep-link => create/open thread
      if (listingIdParam && sellerIdParam) {
        initializeThread();
        return;
      }

      // 2) Inbox mode (optionally with threadId deep link)
      setLoading(false);
      if (threadIdParam) setSelectedThreadId(threadIdParam);
    }
  }, [authLoading, user, listingIdParam, sellerIdParam, initializeThread, threadIdParam]);

  // When selecting a thread from inbox, populate the thread/listing/name for the thread view.
  useEffect(() => {
    if (!user?.uid) return;
    if (listingIdParam && sellerIdParam) return; // handled by initializeThread flow
    if (!selectedThreadId) return;

    const t = threads.find((x) => x.id === selectedThreadId) || null;
    if (!t) return;

    setThread(t);
    // Clear message notification badge when viewing messages (best-effort).
    markNotificationsAsReadByType(user.uid, 'message_received').catch(() => {});
    // Mark thread as read immediately when selected to clear unread badge
    markThreadAsRead(selectedThreadId, user.uid).catch(() => {});
    const meta = metaByThreadId[selectedThreadId];
    setOtherPartyName(meta?.otherName || 'User');
    setOtherPartyAvatar(meta?.otherAvatar || undefined);
    setOrderStatus(undefined);

    Promise.allSettled([
      getListingById(t.listingId),
      getUserProfile(user.uid === t.buyerId ? t.sellerId : t.buyerId),
    ]).then((results) => {
      const listingRes = results[0];
      const otherRes = results[1];
      setListing(listingRes.status === 'fulfilled' ? listingRes.value : null);
      const otherProfile = otherRes.status === 'fulfilled' ? otherRes.value : null;
      setOtherPartyAvatar(otherProfile?.photoURL || undefined);
    });
  }, [listingIdParam, metaByThreadId, sellerIdParam, selectedThreadId, threads, user?.uid]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 flex items-center justify-center">
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-semibold mb-2">Sign in required</h3>
            <p className="text-sm text-muted-foreground mb-4">
              You must be signed in to send messages
            </p>
            <Button asChild>
              <Link href="/login">Sign In</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if ((listingIdParam && sellerIdParam) && (!thread || !listing)) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6">
        <div className="container mx-auto px-4 py-6 md:py-8 max-w-4xl">
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No conversation found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {listingIdParam ? 'Failed to load conversation' : 'Select a listing to start messaging'}
              </p>
              <Button variant="outline" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-6xl">
        <div className="mb-4">
          <Button variant="ghost" onClick={() => router.back()} className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Messages</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 min-h-0">
          {/* Mobile: keep both panes mounted and slide between them for smoothness */}
          <div className="lg:hidden relative overflow-hidden h-[calc(100dvh-220px)] min-h-0">
            {/* Inbox pane */}
            <Card
              className={cn(
                'absolute inset-0 flex flex-col min-h-0 transition-transform duration-200 ease-out will-change-transform',
                selectedThreadId ? '-translate-x-full' : 'translate-x-0'
              )}
            >
              <CardHeader className="pb-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-lg font-bold">Inbox</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {inboxItems.reduce((sum, x) => sum + (x.unread || 0), 0)} unread
                  </Badge>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search people, listings, messages..."
                    className="pl-9"
                  />
                </div>
                <Tabs value={inboxTab} onValueChange={(v) => setInboxTab(v as any)}>
                  <TabsList className="w-full">
                    <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
                    <TabsTrigger value="unread" className="flex-1">Unread</TabsTrigger>
                    <TabsTrigger value="archived" className="flex-1">Archived</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent className="p-0 flex-1 min-h-0">
                {inboxItems.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground">No conversations yet.</div>
                ) : (
                  <ScrollArea className="h-full">
                    <div className="divide-y divide-border/50 pr-3">
                      {inboxItems.map((item) => {
                        const active = selectedThreadId === item.id || thread?.id === item.id;
                        const updatedAt = item.updatedAtMs ? new Date(item.updatedAtMs) : null;
                        return (
                          <div
                            key={item.id}
                            className={cn('group w-full min-w-0 p-3 hover:bg-muted/30 transition-colors', active && 'bg-muted/40')}
                          >
                            <div className="grid grid-cols-[48px_1fr_116px_44px] gap-3 items-start min-w-0">
                              <button
                                onClick={() => {
                                  setSelectedThreadId(item.id);
                                  router.replace(`/dashboard/messages?threadId=${item.id}`);
                                }}
                                className="contents text-left"
                              >
                                <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-muted">
                                  {item.listingImageUrl ? (
                                    <Image src={item.listingImageUrl} alt={item.listingTitle} fill sizes="48px" className="object-cover" />
                                  ) : (
                                    <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                                      <MessageSquare className="h-5 w-5" />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Avatar className="h-6 w-6 shrink-0">
                                      <AvatarImage src={item.otherAvatar} />
                                      <AvatarFallback>{String(item.otherName || 'U').slice(0, 2).toUpperCase()}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1 text-sm font-semibold truncate leading-5">{item.otherName}</div>
                                    {item.archived ? (
                                      <Badge variant="outline" className="text-[10px] shrink-0">
                                        Archived
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate">{item.listingTitle}</div>
                                  {item.lastMessagePreview ? (
                                    <div className="text-xs text-muted-foreground line-clamp-2 mt-2">{item.lastMessagePreview}</div>
                                  ) : null}
                                </div>
                                <div className="min-w-0 text-right">
                                  <div className="text-[11px] text-muted-foreground whitespace-normal leading-tight">
                                    {updatedAt ? formatDistanceToNow(updatedAt, { addSuffix: true }) : ''}
                                  </div>
                                  {item.unread > 0 ? (
                                    <div className="mt-1 flex justify-end">
                                      <Badge variant="destructive" className="h-5 px-2 text-xs font-semibold">
                                        {item.unread}
                                      </Badge>
                                    </div>
                                  ) : null}
                                </div>
                              </button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-11 w-11 opacity-60 hover:opacity-100">
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      if (!user?.uid) return;
                                      try {
                                        await markThreadAsRead(item.id, user.uid);
                                      } catch {}
                                    }}
                                  >
                                    <CheckCheck className="h-4 w-4 mr-2" />
                                    Mark read
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      try {
                                        await setThreadArchived(item.id, !item.archived);
                                      } catch (e: any) {
                                        toast({ title: 'Error', description: e?.message || 'Failed to update thread', variant: 'destructive' });
                                      }
                                    }}
                                  >
                                    {item.archived ? (
                                      <>
                                        <Inbox className="h-4 w-4 mr-2" /> Unarchive
                                      </>
                                    ) : (
                                      <>
                                        <Archive className="h-4 w-4 mr-2" /> Archive
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>

            {/* Thread pane */}
            <Card
              className={cn(
                'absolute inset-0 flex flex-col overflow-hidden min-h-0 transition-transform duration-200 ease-out will-change-transform',
                selectedThreadId ? 'translate-x-0' : 'translate-x-full'
              )}
            >
              <div className="border-b p-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedThreadId(null);
                    router.replace('/dashboard/messages');
                  }}
                >
                  <Inbox className="h-4 w-4 mr-2" />
                  Inbox
                </Button>
              </div>
              {!thread ? (
                <CardContent className="pt-12 pb-12 text-center">
                  <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-50" />
                  <div className="font-semibold">Select a conversation</div>
                  <div className="text-sm text-muted-foreground mt-1">Choose a thread from the inbox.</div>
                </CardContent>
              ) : (
                <div className="flex-1 min-h-0">
                  <MessageThreadComponent
                    // Keep component mounted while sliding; don't key by thread.id on mobile.
                    thread={thread}
                    listingTitle={listing?.title || 'Listing'}
                    listing={listing}
                    otherPartyName={otherPartyName}
                    otherPartyAvatar={otherPartyAvatar}
                    orderStatus={orderStatus}
                  />
                </div>
              )}
            </Card>
          </div>

          {/* Desktop: original two-pane layout */}
          <Card
            className={cn(
              'hidden lg:flex h-[calc(100dvh-220px)] lg:h-[calc(100vh-220px)] flex-col min-h-0'
            )}
          >
            <CardHeader className="pb-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg font-bold">Inbox</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {inboxItems.reduce((sum, x) => sum + (x.unread || 0), 0)} unread
                </Badge>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search people, listings, messages..."
                  className="pl-9"
                />
              </div>
              <Tabs value={inboxTab} onValueChange={(v) => setInboxTab(v as any)}>
                <TabsList className="w-full">
                  <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
                  <TabsTrigger value="unread" className="flex-1">Unread</TabsTrigger>
                  <TabsTrigger value="archived" className="flex-1">Archived</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0">
              {inboxItems.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No conversations yet.</div>
              ) : (
                <ScrollArea className="h-full">
                  {/* Keep a small right padding so the scrollbar never overlays content. */}
                  <div className="divide-y divide-border/50 pr-3">
                    {inboxItems.map((item) => {
                      const active = selectedThreadId === item.id || thread?.id === item.id;
                      const updatedAt = item.updatedAtMs ? new Date(item.updatedAtMs) : null;
                      return (
                        <div
                          key={item.id}
                          className={cn('group w-full min-w-0 p-3 hover:bg-muted/30 transition-colors', active && 'bg-muted/40')}
                        >
                          <div className="grid grid-cols-[48px_1fr_116px_44px] gap-3 items-start min-w-0">
                            <button
                              onClick={() => {
                                setSelectedThreadId(item.id);
                                router.replace(`/dashboard/messages?threadId=${item.id}`);
                              }}
                              className="contents text-left"
                            >
                              {/* Thumb */}
                              <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-muted">
                                {item.listingImageUrl ? (
                                  <Image src={item.listingImageUrl} alt={item.listingTitle} fill sizes="48px" className="object-cover" />
                                ) : (
                                  <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                                    <MessageSquare className="h-5 w-5" />
                                  </div>
                                )}
                              </div>

                              {/* Main content */}
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Avatar className="h-6 w-6 shrink-0">
                                    <AvatarImage src={item.otherAvatar} />
                                    <AvatarFallback>{String(item.otherName || 'U').slice(0, 2).toUpperCase()}</AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0 flex-1 text-sm font-semibold truncate leading-5">{item.otherName}</div>
                                  {item.archived ? (
                                    <Badge variant="outline" className="text-[10px] shrink-0">
                                      Archived
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">{item.listingTitle}</div>
                                {item.lastMessagePreview ? (
                                  <div className="text-xs text-muted-foreground line-clamp-2 mt-2">{item.lastMessagePreview}</div>
                                ) : null}
                              </div>

                              {/* Timestamp + unread (guaranteed visible column) */}
                              <div className="min-w-0 text-right">
                                <div className="text-[11px] text-muted-foreground whitespace-normal leading-tight">
                                  {updatedAt ? formatDistanceToNow(updatedAt, { addSuffix: true }) : ''}
                                </div>
                                {item.unread > 0 ? (
                                  <div className="mt-1 flex justify-end">
                                    <Badge variant="destructive" className="h-5 px-2 text-xs font-semibold">
                                      {item.unread}
                                    </Badge>
                                  </div>
                                ) : null}
                              </div>
                            </button>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-11 w-11 opacity-60 hover:opacity-100">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={async () => {
                                    if (!user?.uid) return;
                                    try {
                                      await markThreadAsRead(item.id, user.uid);
                                    } catch {}
                                  }}
                                >
                                  <CheckCheck className="h-4 w-4 mr-2" />
                                  Mark read
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={async () => {
                                    try {
                                      await setThreadArchived(item.id, !item.archived);
                                    } catch (e: any) {
                                      toast({ title: 'Error', description: e?.message || 'Failed to update thread', variant: 'destructive' });
                                    }
                                  }}
                                >
                                  {item.archived ? (
                                    <>
                                      <Inbox className="h-4 w-4 mr-2" /> Unarchive
                                    </>
                                  ) : (
                                    <>
                                      <Archive className="h-4 w-4 mr-2" /> Archive
                                    </>
                                  )}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <Card
            className={cn(
              'h-[calc(100dvh-220px)] lg:h-[calc(100vh-220px)] flex flex-col overflow-hidden min-h-0',
              selectedThreadId ? 'flex' : 'hidden lg:flex'
            )}
          >
            {!thread ? (
              <CardContent className="pt-12 pb-12 text-center">
                <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-50" />
                <div className="font-semibold">Select a conversation</div>
                <div className="text-sm text-muted-foreground mt-1">Choose a thread from the inbox.</div>
              </CardContent>
            ) : (
              <>
                {/* Mobile: back to inbox */}
                <div className="lg:hidden border-b p-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedThreadId(null);
                      router.replace('/dashboard/messages');
                    }}
                  >
                    <Inbox className="h-4 w-4 mr-2" />
                    Inbox
                  </Button>
                </div>
                <div className="flex-1 min-h-0">
                  <MessageThreadComponent
                    key={thread.id}
                    thread={thread}
                    listingTitle={listing?.title || 'Listing'}
                    listing={listing}
                    otherPartyName={otherPartyName}
                    otherPartyAvatar={otherPartyAvatar}
                    orderStatus={orderStatus}
                  />
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
