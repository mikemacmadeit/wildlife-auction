'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, ArrowLeft, Archive, Inbox, MoreVertical, Search, CheckCheck } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { MessageThreadComponent } from '@/components/messaging/MessageThread';
import { getOrCreateThread, getThreadById, markThreadAsRead, setThreadArchived, subscribeToAllUserThreads } from '@/lib/firebase/messages';
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
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const listingIdParam = searchParams?.get('listingId') || null;
  const sellerIdParam = searchParams?.get('sellerId') || null;
  const threadIdFromParams = searchParams?.get('threadId') || null;
  const [threadIdFromUrlFallback, setThreadIdFromUrlFallback] = useState<string | null>(null);
  const threadIdParam = threadIdFromParams || threadIdFromUrlFallback;

  const [thread, setThread] = useState<MessageThread | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [otherPartyName, setOtherPartyName] = useState('Seller');
  const [otherPartyAvatar, setOtherPartyAvatar] = useState<string | undefined>(undefined);
  const [orderStatus, setOrderStatus] = useState<'pending' | 'paid' | 'completed' | undefined>();
  const [loading, setLoading] = useState(true);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [optimisticReadThreads, setOptimisticReadThreads] = useState<Set<string>>(new Set());
  const [inboxTab, setInboxTab] = useState<'all' | 'unread' | 'archived'>('all');
  const [search, setSearch] = useState('');
  const [metaByThreadId, setMetaByThreadId] = useState<
    Record<
      string,
      { otherName: string; otherAvatar?: string; listingTitle: string; listingImageUrl?: string; updatedAtMs: number }
    >
  >({});
  const metaFetchInFlightRef = useRef<Set<string>>(new Set());
  const selectedThreadIdRef = useRef<string | null>(null);
  const pathnameRef = useRef<string | null>(null);
  const isNavigatingAwayRef = useRef<boolean>(false);
  const subscriptionCallbackThrottleRef = useRef<number | null>(null);
  const deepLinkFetchAttemptedRef = useRef<string | null>(null);

  // Track pathname changes and detect navigation away
  useEffect(() => {
    pathnameRef.current = pathname;
    // If pathname changes away from messages, mark as navigating away
    if (pathname !== '/dashboard/messages') {
      isNavigatingAwayRef.current = true;
    } else {
      isNavigatingAwayRef.current = false;
    }
  }, [pathname]);

  // Keep refs in sync with state
  useEffect(() => {
    selectedThreadIdRef.current = selectedThreadId;
  }, [selectedThreadId]);
  
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  // Reset state when navigating away from messages page
  useEffect(() => {
    if (typeof window !== 'undefined' && pathname && pathname !== '/dashboard/messages') {
      setSelectedThreadId(null);
      setThread(null);
      setListing(null);
      setThreadIdFromUrlFallback(null);
      deepLinkFetchAttemptedRef.current = null;
    }
  }, [pathname]);

  // Notification deep-link: searchParams can lag on client-side nav. Fallback to window.location.search.
  useEffect(() => {
    if (typeof window === 'undefined' || pathname !== '/dashboard/messages') return;
    if (threadIdFromParams) {
      setThreadIdFromUrlFallback(null);
      return;
    }
    const q = new URLSearchParams(window.location.search);
    const tid = q.get('threadId')?.trim() || null;
    setThreadIdFromUrlFallback(tid);
  }, [pathname, threadIdFromParams]);

  // Emergency escape: keyboard shortcut to leave messages
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        router.push('/seller/overview');
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [router]);

  const inboxItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    const rows = threads.map((t) => {
      const isBuyer = user?.uid ? t.buyerId === user.uid : true;
      // Optimistically clear unread count if thread was marked as read
      const isOptimisticallyRead = optimisticReadThreads.has(t.id);
      const unread = isOptimisticallyRead
        ? 0
        : isBuyer
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
  }, [inboxTab, metaByThreadId, optimisticReadThreads, search, threads, user?.uid]);

  // Real-time inbox subscription
  useEffect(() => {
    if (!user?.uid) return;
    if (listingIdParam && sellerIdParam) return; // deep-link mode uses initializeThread

    const unsub = subscribeToAllUserThreads(
      user.uid,
      (data) => {
        // Throttle subscription callbacks to prevent excessive re-renders
        if (subscriptionCallbackThrottleRef.current) {
          return;
        }
        subscriptionCallbackThrottleRef.current = window.setTimeout(() => {
          subscriptionCallbackThrottleRef.current = null;
        }, 100); // Throttle to max once per 100ms
        
        // Check if we're navigating away or not on messages page
        const currentPathname = typeof window !== 'undefined' ? window.location.pathname : pathnameRef.current;
        const isOnMessagesPage = currentPathname === '/dashboard/messages';
        
        // Skip all processing if navigating away or not on messages page
        if (isNavigatingAwayRef.current || !isOnMessagesPage) {
          return;
        }
        
        setThreads(data);
        setLoading(false);
        // Clear optimistic reads for threads that are now confirmed as read (unreadCount = 0)
        setOptimisticReadThreads((prev) => {
          const next = new Set(prev);
          data.forEach((t) => {
            const isBuyer = user.uid === t.buyerId;
            const unread = isBuyer
              ? (typeof (t as any).buyerUnreadCount === 'number' ? (t as any).buyerUnreadCount : 0)
              : (typeof (t as any).sellerUnreadCount === 'number' ? (t as any).sellerUnreadCount : 0);
            if (unread === 0) {
              next.delete(t.id);
            }
          });
          return next;
        });
        // Don't auto-select on mobile - let user choose
        // Only auto-select on desktop if nothing is selected AND we're still on the messages page
        // (use refs to avoid stale closure and pathname check to prevent redirects when navigating away)
        const currentSelectedId = selectedThreadIdRef.current;
        if (!currentSelectedId && data[0]?.id && typeof window !== 'undefined' && window.innerWidth >= 1024 && isOnMessagesPage) {
          setSelectedThreadId(data[0].id);
        }
      },
      {
        onError: (e) => {
          console.error('[dashboard/messages] subscribeToAllUserThreads error', e);
          setLoading(false);
          toast({
            title: 'Connection error',
            description: 'Unable to load messages. Please refresh the page.',
            variant: 'destructive',
          });
        },
      }
    );

    return () => {
      if (subscriptionCallbackThrottleRef.current) {
        clearTimeout(subscriptionCallbackThrottleRef.current);
        subscriptionCallbackThrottleRef.current = null;
      }
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingIdParam, sellerIdParam, user?.uid]); // Note: pathname intentionally excluded - we use pathnameRef to avoid re-subscription

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
    }).catch(() => {});
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
        // Set selectedThreadId so mobile view shows the thread pane
        setSelectedThreadId(threadId);
        // Update URL to include threadId for proper deep linking and refresh support
        router.replace(`/dashboard/messages?threadId=${encodeURIComponent(threadId)}`);
        // Optimistically mark as read for immediate UI update
        setOptimisticReadThreads((prev) => new Set(prev).add(threadId));
        // Mark thread as read when opening via deep link
        markThreadAsRead(threadId, user.uid).catch(() => {
          // On error, remove from optimistic set so it can retry
          setOptimisticReadThreads((prev) => {
            const next = new Set(prev);
            next.delete(threadId);
            return next;
          });
        });
        // Clear message notification badge when viewing messages (best-effort)
        markNotificationsAsReadByType(user.uid, 'message_received').catch(() => {});
      } else {
        // Thread was created but not found in query - still set selectedThreadId
        // This can happen if the thread was just created and hasn't propagated yet
        setSelectedThreadId(threadId);
        // Update URL to include threadId
        router.replace(`/dashboard/messages?threadId=${encodeURIComponent(threadId)}`);
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
      if (threadIdParam) {
        // Sync URL param to state (only if different to avoid unnecessary updates)
        const currentId = selectedThreadIdRef.current;
        if (currentId !== threadIdParam) {
          setSelectedThreadId(threadIdParam);
        }
      }
      // Don't clear selectedThreadId when threadIdParam is null - let user selections persist
      // Only clear on explicit navigation away from messages page (handled by pathname effect)
    }
  }, [authLoading, user, listingIdParam, sellerIdParam, initializeThread, threadIdParam]); // Use ref for comparison to prevent effect loop

  // When selecting a thread from inbox, populate the thread/listing/name for the thread view.
  useEffect(() => {
    if (!user?.uid) return;
    if (listingIdParam && sellerIdParam) return; // handled by initializeThread flow
    if (!selectedThreadId) {
      setThread(null);
      setListing(null);
      return;
    }

    // Clear thread immediately if it doesn't match selectedThreadId to prevent showing stale data
    if (thread && thread.id !== selectedThreadId) {
      setThread(null);
      setListing(null);
    }

    const t = threads.find((x) => x.id === selectedThreadId) || null;
    if (!t) {
      // Thread not found yet - might still be loading
      // Don't clear thread state, just wait for it to appear in threads array
      return;
    }

    // Set thread immediately when found
    setThread(t);
    // Optimistically mark as read for immediate UI update
    setOptimisticReadThreads((prev) => new Set(prev).add(selectedThreadId));
    // Clear message notification badge when viewing messages (best-effort).
    markNotificationsAsReadByType(user.uid, 'message_received').catch(() => {});
    // Mark thread as read immediately when selected to clear unread badge
    markThreadAsRead(selectedThreadId, user.uid).catch(() => {
      // On error, remove from optimistic set so it can retry
      setOptimisticReadThreads((prev) => {
        const next = new Set(prev);
        next.delete(selectedThreadId);
        return next;
      });
    });
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
    }).catch(() => {});
  }, [listingIdParam, metaByThreadId, sellerIdParam, selectedThreadId, threads, user?.uid]);

  // Notification deep-link: threadId in URL but thread not in subscription yet (race or limit).
  // Fetch thread by ID so the conversation shows without needing to wait for / rely on subscription.
  useEffect(() => {
    if (!user?.uid || !threadIdParam || listingIdParam || sellerIdParam) return;
    const inThreads = threads.some((x) => x.id === threadIdParam);
    if (inThreads) {
      deepLinkFetchAttemptedRef.current = null;
      return;
    }
    if (deepLinkFetchAttemptedRef.current === threadIdParam) return;

    const tm = setTimeout(async () => {
      if (threads.some((x) => x.id === threadIdParam)) return;
      deepLinkFetchAttemptedRef.current = threadIdParam;
      try {
        const t = await getThreadById(threadIdParam, user.uid);
        if (!t) return;
        setThread(t);
        setSelectedThreadId(threadIdParam);
        setThreads((prev) => (prev.some((x) => x.id === t.id) ? prev : [t, ...prev]));
        setOptimisticReadThreads((prev) => new Set(prev).add(threadIdParam));
        markNotificationsAsReadByType(user.uid, 'message_received').catch(() => {});
        markThreadAsRead(threadIdParam, user.uid).catch(() => {
          setOptimisticReadThreads((prev) => {
            const next = new Set(prev);
            next.delete(threadIdParam);
            return next;
          });
        });
        router.replace(`/dashboard/messages?threadId=${encodeURIComponent(threadIdParam)}`);
        const [listingRes, otherRes] = await Promise.allSettled([
          getListingById(t.listingId),
          getUserProfile(user.uid === t.buyerId ? t.sellerId : t.buyerId),
        ]);
        setListing(listingRes.status === 'fulfilled' ? listingRes.value : null);
        const otherProfile = otherRes.status === 'fulfilled' ? otherRes.value : null;
        setOtherPartyName(otherProfile?.displayName || otherProfile?.email?.split('@')[0] || 'User');
        setOtherPartyAvatar(otherProfile?.photoURL || undefined);
        setOrderStatus(undefined);
      } catch {
        deepLinkFetchAttemptedRef.current = null;
      }
    }, 400);

    return () => clearTimeout(tm);
  }, [listingIdParam, router, sellerIdParam, threadIdParam, threads, user?.uid]);

  // Fix: Ensure sidebar clicks work - prevent messages page from blocking sidebar navigation
  useEffect(() => {
    // Ensure mobile container doesn't block clicks on desktop
    const ensureMobileContainerNotBlocking = () => {
      const mobileContainer = document.querySelector('[data-mobile-container]');
      if (mobileContainer instanceof HTMLElement) {
        const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
        if (isDesktop) {
          mobileContainer.style.pointerEvents = 'none';
          mobileContainer.style.display = 'none';
        } else {
          mobileContainer.style.pointerEvents = 'auto';
          mobileContainer.style.display = '';
        }
      }
    };
    
    // Ensure messages container doesn't create a blocking layer
    // The sidebar is fixed with zIndex: 10000, so it should be above everything
    const ensureMessagesContainerNotBlocking = () => {
      const messagesContainer = document.querySelector('[data-messages-container]');
      if (messagesContainer instanceof HTMLElement) {
        // Don't create a new stacking context that might interfere
        messagesContainer.style.isolation = 'auto';
      }
    };
    
    // Set immediately and on resize
    ensureMobileContainerNotBlocking();
    ensureMessagesContainerNotBlocking();
    
    const handleResize = () => {
      ensureMobileContainerNotBlocking();
      ensureMessagesContainerNotBlocking();
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [selectedThreadId]);


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
    <div className="bg-background pb-20 md:pb-6 min-h-screen" data-messages-container>
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
        <div className="mb-4 lg:mb-6">
          <Button 
            variant="ghost" 
            onClick={() => {
              // On mobile, if a thread is selected, go back to inbox first
              if (selectedThreadId && typeof window !== 'undefined' && window.innerWidth < 1024) {
                setSelectedThreadId(null);
                router.push('/dashboard/messages');
              } else {
                // Navigate away from messages page entirely
                router.push('/seller/overview');
              }
            }} 
            className="mb-2"
            aria-label="Go back to dashboard"
          >
            <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Messages</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 min-h-0">
          {/* Mobile: keep both panes mounted and slide between them for smoothness */}
          <div 
            className="lg:hidden relative overflow-hidden" 
            style={{ 
              height: 'calc(100dvh - 280px)', 
              minHeight: '400px', 
              maxHeight: 'calc(100dvh - 280px)'
            }}
            data-mobile-container
          >
            {/* Inbox pane */}
            <Card
              className={cn(
                'absolute inset-0 flex flex-col transition-transform duration-300 ease-in-out',
                'will-change-transform transform-gpu',
                selectedThreadId ? '-translate-x-full' : 'translate-x-0'
              )}
              style={{ 
                pointerEvents: selectedThreadId ? 'none' : 'auto',
                zIndex: selectedThreadId ? 1 : 2
              }}
            >
              <CardHeader className="pb-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-lg font-bold">Inbox</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {inboxItems.reduce((sum, x) => sum + (x.unread || 0), 0)} unread
                  </Badge>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search people, listings, messages..."
                    className="pl-9"
                    aria-label="Search conversations"
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
              <CardContent className="p-0 flex-1 min-h-0 overflow-hidden">
                {inboxItems.length === 0 ? (
                  <EmptyState
                    icon={MessageSquare}
                    title="No messages yet"
                    description="Start a conversation with a seller from a listing."
                    action={{ label: 'Browse listings', href: '/browse' }}
                    className="m-4 py-8"
                  />
                ) : (
                  <ScrollArea className="h-full" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}>
                    <div className="divide-y divide-border/50 px-3">
                      {inboxItems.map((item, index) => {
                        const active = selectedThreadId === item.id || thread?.id === item.id;
                        const updatedAt = item.updatedAtMs ? new Date(item.updatedAtMs) : null;
                        const isFirst = index === 0;
                        return (
                          <div
                            key={item.id}
                            role="button"
                            tabIndex={0}
                            aria-label={`Open conversation with ${item.otherName} about ${item.listingTitle}`}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!user?.uid) return;
                              // Optimistically mark as read for immediate UI update
                              setOptimisticReadThreads((prev) => new Set(prev).add(item.id));
                              setSelectedThreadId(item.id);
                              router.replace(`/dashboard/messages?threadId=${item.id}`);
                              // Mark thread as read in Firestore
                              markThreadAsRead(item.id, user.uid).catch(() => {
                                // On error, remove from optimistic set so it can retry
                                setOptimisticReadThreads((prev) => {
                                  const next = new Set(prev);
                                  next.delete(item.id);
                                  return next;
                                });
                              });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                (e.currentTarget as HTMLElement).click();
                              }
                            }}
                            className={cn(
                              'group w-full min-w-0 p-3 hover:bg-muted/30 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-lg',
                              isFirst && 'pt-4',
                              active && 'glass bg-card/70 backdrop-blur-xl border border-primary/20 shadow-lifted'
                            )}
                            style={{ pointerEvents: 'auto', position: 'relative', zIndex: 10 }}
                          >
                            <div className="grid grid-cols-[48px_1fr_116px_44px] gap-3 items-start min-w-0">
                              <div className="contents">
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
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-11 w-11 opacity-60 hover:opacity-100"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={async () => {
                                      if (!user?.uid) return;
                                      try {
                                        await markThreadAsRead(item.id, user.uid);
                                        setOptimisticReadThreads((prev) => new Set(prev).add(item.id));
                                      } catch (e: any) {
                                        toast({
                                          title: 'Error',
                                          description: e?.message || 'Failed to mark thread as read',
                                          variant: 'destructive',
                                        });
                                      }
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
                'absolute inset-0 flex flex-col overflow-hidden transition-transform duration-300 ease-in-out',
                'will-change-transform transform-gpu',
                selectedThreadId ? 'translate-x-0' : 'translate-x-full'
              )}
              style={{ 
                pointerEvents: selectedThreadId ? 'auto' : 'none',
                zIndex: selectedThreadId ? 2 : 1
              }}
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
                  aria-label="Return to inbox"
                >
                  <Inbox className="h-4 w-4 mr-2" aria-hidden="true" />
                  Inbox
                </Button>
              </div>
              {!thread && !selectedThreadId ? (
                <CardContent className="pt-12 pb-12 text-center">
                  <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-50" />
                  <div className="font-semibold">Select a conversation</div>
                  <div className="text-sm text-muted-foreground mt-1">Choose a thread from the inbox.</div>
                </CardContent>
              ) : !thread && selectedThreadId ? (
                <CardContent className="pt-12 pb-12 text-center">
                  <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-50 animate-pulse" />
                  <div className="font-semibold">Loading conversation...</div>
                </CardContent>
              ) : thread ? (
                <div className="flex-1 min-h-0 overflow-hidden" style={{ touchAction: 'pan-y' }}>
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
              ) : null}
            </Card>
          </div>

          {/* Desktop: original two-pane layout */}
          <Card
            className={cn(
              'hidden lg:flex flex-col min-h-0 overflow-hidden'
            )}
            style={{ height: 'calc(100vh - 300px)', maxHeight: 'calc(100vh - 300px)' }}
          >
            <CardHeader className="pb-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-lg font-bold">Inbox</CardTitle>
                <Badge variant="secondary" className="text-xs">
                  {inboxItems.reduce((sum, x) => sum + (x.unread || 0), 0)} unread
                </Badge>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search people, listings, messages..."
                  className="pl-9"
                  aria-label="Search conversations"
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
                <EmptyState
                  icon={MessageSquare}
                  title="No messages yet"
                  description="Start a conversation with a seller from a listing."
                  action={{ label: 'Browse listings', href: '/browse' }}
                  className="m-4 py-8"
                />
              ) : (
                <ScrollArea className="h-full">
                  {/* Keep a small right padding so the scrollbar never overlays content. */}
                  <div className="divide-y divide-border/50 px-3">
                    {inboxItems.map((item, index) => {
                      const active = selectedThreadId === item.id || thread?.id === item.id;
                      const updatedAt = item.updatedAtMs ? new Date(item.updatedAtMs) : null;
                      const isFirst = index === 0;
                      return (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Open conversation with ${item.otherName} about ${item.listingTitle}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!user?.uid) return;
                            // Optimistically mark as read for immediate UI update
                            setOptimisticReadThreads((prev) => new Set(prev).add(item.id));
                            setSelectedThreadId(item.id);
                            router.replace(`/dashboard/messages?threadId=${item.id}`);
                            // Mark thread as read in Firestore
                            markThreadAsRead(item.id, user.uid).catch(() => {
                              // On error, remove from optimistic set so it can retry
                              setOptimisticReadThreads((prev) => {
                                const next = new Set(prev);
                                next.delete(item.id);
                                return next;
                              });
                            });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              (e.currentTarget as HTMLElement).click();
                            }
                          }}
                          className={cn(
                            'group w-full min-w-0 p-3 hover:bg-muted/30 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-lg',
                            isFirst && 'pt-4',
                            active && 'glass bg-card/70 backdrop-blur-xl border border-primary/20 shadow-lifted'
                          )}
                          style={{ pointerEvents: 'auto', position: 'relative', zIndex: 10 }}
                        >
                          <div className="grid grid-cols-[48px_1fr_116px_44px] gap-3 items-start min-w-0">
                            <div className="contents">
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
                            </div>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-11 w-11 opacity-60 hover:opacity-100"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={async () => {
                                    if (!user?.uid) return;
                                    try {
                                      await markThreadAsRead(item.id, user.uid);
                                      setOptimisticReadThreads((prev) => new Set(prev).add(item.id));
                                    } catch (e: any) {
                                      toast({
                                        title: 'Error',
                                        description: e?.message || 'Failed to mark thread as read',
                                        variant: 'destructive',
                                      });
                                    }
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

          {/* Desktop thread view - hidden on mobile (mobile uses sliding panes above) */}
          <Card
            className={cn(
              'hidden lg:flex flex-col overflow-hidden min-h-0'
            )}
            style={{ height: 'calc(100vh - 300px)', maxHeight: 'calc(100vh - 300px)' }}
          >
            {!thread && !selectedThreadId ? (
              <CardContent className="pt-12 pb-12 text-center">
                <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-50" />
                <div className="font-semibold">Select a conversation</div>
                <div className="text-sm text-muted-foreground mt-1">Choose a thread from the inbox.</div>
              </CardContent>
            ) : !thread && selectedThreadId ? (
              <CardContent className="pt-12 pb-12 text-center">
                <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-50 animate-pulse" />
                <div className="font-semibold">Loading conversation...</div>
              </CardContent>
            ) : thread ? (
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
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}
