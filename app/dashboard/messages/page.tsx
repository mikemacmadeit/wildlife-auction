'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, ArrowLeft } from 'lucide-react';
import { MessageThreadComponent } from '@/components/messaging/MessageThread';
import { getOrCreateThread, getAllUserThreads } from '@/lib/firebase/messages';
import { getListingById } from '@/lib/firebase/listings';
import { getUserProfile } from '@/lib/firebase/users';
import { markNotificationsAsReadByType } from '@/lib/firebase/notifications';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { MessageThread, Listing } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { cn } from '@/lib/utils';

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
  const [metaByThreadId, setMetaByThreadId] = useState<Record<string, { sellerName: string; listingTitle: string }>>(
    {}
  );

  const inboxItems = useMemo(() => {
    return threads.map((t) => {
      const isBuyer = user?.uid ? t.buyerId === user.uid : true;
      const unread = isBuyer
        ? (typeof (t as any).buyerUnreadCount === 'number' ? (t as any).buyerUnreadCount : 0)
        : (typeof (t as any).sellerUnreadCount === 'number' ? (t as any).sellerUnreadCount : 0);
      const meta = metaByThreadId[t.id];
      return {
        id: t.id,
        unread,
        sellerName: meta?.sellerName || 'User',
        listingTitle: meta?.listingTitle || `Listing ${t.listingId.slice(-6)}`,
        lastMessagePreview: t.lastMessagePreview || '',
      };
    });
  }, [metaByThreadId, threads, user?.uid]);

  const loadInbox = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const data = await getAllUserThreads(user.uid);
      setThreads(data);
      if (!selectedThreadId && data[0]?.id) setSelectedThreadId(data[0].id);

      Promise.allSettled(
        data.map(async (t) => {
          const otherPartyId = user.uid === t.buyerId ? t.sellerId : t.buyerId;
          const [otherProfile, listingData] = await Promise.all([
            getUserProfile(otherPartyId).catch(() => null),
            getListingById(t.listingId).catch(() => null),
          ]);
          return {
            threadId: t.id,
            sellerName: otherProfile?.displayName || otherProfile?.profile?.fullName || 'User',
            listingTitle: listingData?.title || 'Listing',
          };
        })
      ).then((results) => {
        const next: Record<string, { sellerName: string; listingTitle: string }> = {};
        for (const r of results) {
          if (r.status !== 'fulfilled') continue;
          next[r.value.threadId] = { sellerName: r.value.sellerName, listingTitle: r.value.listingTitle };
        }
        setMetaByThreadId((prev) => ({ ...prev, ...next }));
      });
    } catch (e: any) {
      console.error('[dashboard/messages] Failed to load inbox', e);
    }
  }, [selectedThreadId, user?.uid]);

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
        setThread({
          id: threadId,
          ...threadData,
          createdAt: threadData.createdAt?.toDate() || new Date(),
          updatedAt: threadData.updatedAt?.toDate() || new Date(),
          lastMessageAt: threadData.lastMessageAt?.toDate(),
        } as MessageThread);
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
      void loadInbox();
      if (threadIdParam) setSelectedThreadId(threadIdParam);
    }
  }, [authLoading, user, listingIdParam, sellerIdParam, initializeThread, loadInbox, threadIdParam]);

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
    const meta = metaByThreadId[selectedThreadId];
    setOtherPartyName(meta?.sellerName || 'User');
    setOtherPartyAvatar(undefined);
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
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-4xl">
        <div className="mb-4">
          <Button variant="ghost" onClick={() => router.back()} className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Messages</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-bold">Inbox</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {inboxItems.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No conversations yet.</div>
              ) : (
                <div className="divide-y divide-border/50">
                  {inboxItems.map((item) => {
                    const active = selectedThreadId === item.id || thread?.id === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setSelectedThreadId(item.id);
                          router.replace(`/dashboard/messages?threadId=${item.id}`);
                        }}
                        className={cn(
                          'w-full p-4 text-left hover:bg-muted/30 transition-colors',
                          active && 'bg-muted/40'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{item.sellerName}</div>
                            <div className="text-xs text-muted-foreground truncate">{item.listingTitle}</div>
                          </div>
                          {item.unread > 0 ? (
                            <Badge variant="destructive" className="h-5 px-2 text-xs font-semibold">
                              {item.unread}
                            </Badge>
                          ) : null}
                        </div>
                        {item.lastMessagePreview ? (
                          <div className="text-xs text-muted-foreground truncate mt-2">{item.lastMessagePreview}</div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-2 h-[600px] flex flex-col">
            {!thread ? (
              <CardContent className="pt-12 pb-12 text-center">
                <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-50" />
                <div className="font-semibold">Select a conversation</div>
                <div className="text-sm text-muted-foreground mt-1">Choose a thread from the inbox.</div>
              </CardContent>
            ) : (
              <MessageThreadComponent
                thread={thread}
                listingTitle={listing?.title || 'Listing'}
                listing={listing}
                otherPartyName={otherPartyName}
                otherPartyAvatar={otherPartyAvatar}
                orderStatus={orderStatus}
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
