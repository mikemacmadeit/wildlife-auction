'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getUserThreads } from '@/lib/firebase/messages';
import { getListingById } from '@/lib/firebase/listings';
import { getUserProfile } from '@/lib/firebase/users';
import type { Listing, MessageThread } from '@/lib/types';
import { MessageThreadComponent } from '@/components/messaging/MessageThread';

type ThreadViewModel = {
  thread: MessageThread;
  unread: number;
  otherPartyName: string;
  listingTitle: string;
  listingId: string;
};

export default function SellerMessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const threadIdParam = searchParams.get('threadId');

  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [metaByThreadId, setMetaByThreadId] = useState<
    Record<string, { buyerName: string; listingTitle: string }>
  >({});

  const [thread, setThread] = useState<MessageThread | null>(null);
  const [listing, setListing] = useState<Listing | null>(null);
  const [otherPartyName, setOtherPartyName] = useState('Buyer');

  const loadThreads = useCallback(async () => {
    if (!user?.uid) return;
    setLoadingThreads(true);
    try {
      const data = await getUserThreads(user.uid, 'seller');
      setThreads(data);
      if (!selectedThreadId && data[0]?.id) setSelectedThreadId(data[0].id);

      // Best-effort hydrate list rows with real names/titles (no mock data)
      Promise.allSettled(
        data.map(async (t) => {
          const [buyerProfile, listingData] = await Promise.all([
            getUserProfile(t.buyerId).catch(() => null),
            getListingById(t.listingId).catch(() => null),
          ]);
          const buyerName = buyerProfile?.displayName || buyerProfile?.profile?.fullName || 'Buyer';
          const listingTitle = listingData?.title || 'Listing';
          return { threadId: t.id, buyerName, listingTitle };
        })
      ).then((results) => {
        const next: Record<string, { buyerName: string; listingTitle: string }> = {};
        for (const r of results) {
          if (r.status !== 'fulfilled') continue;
          next[r.value.threadId] = { buyerName: r.value.buyerName, listingTitle: r.value.listingTitle };
        }
        setMetaByThreadId((prev) => ({ ...prev, ...next }));
      });
    } catch (e: any) {
      console.error('[seller/messages] Failed to load threads', e);
      toast({
        title: 'Error',
        description: 'Failed to load messages. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoadingThreads(false);
    }
  }, [selectedThreadId, toast, user?.uid]);

  // Initial thread list load
  useEffect(() => {
    if (!authLoading && user?.uid) void loadThreads();
  }, [authLoading, loadThreads, user?.uid]);

  // Deep-link support
  useEffect(() => {
    if (!user?.uid) return;
    if (threadIdParam) setSelectedThreadId(threadIdParam);
  }, [threadIdParam, user?.uid]);

  // Load selected thread metadata (listing + other party)
  useEffect(() => {
    let cancelled = false;
    async function loadSelected() {
      if (!user?.uid || !selectedThreadId) {
        setThread(null);
        setListing(null);
        setOtherPartyName('Buyer');
        return;
      }

      const t = threads.find((x) => x.id === selectedThreadId) || null;
      if (!t) {
        // Deep link may arrive before list is loaded; try reloading once.
        await loadThreads();
        return;
      }

      setThread(t);

      try {
        const [listingData, buyerProfile] = await Promise.all([
          getListingById(t.listingId).catch(() => null),
          getUserProfile(t.buyerId).catch(() => null),
        ]);
        if (cancelled) return;
        setListing(listingData);
        setOtherPartyName(buyerProfile?.displayName || buyerProfile?.profile?.fullName || 'Buyer');
      } catch {
        // best-effort
      }
    }
    void loadSelected();
    return () => {
      cancelled = true;
    };
  }, [loadThreads, selectedThreadId, threads, user?.uid]);

  const threadVMs: ThreadViewModel[] = useMemo(() => {
    return threads.map((t) => {
      const unread = typeof (t as any).sellerUnreadCount === 'number' ? (t as any).sellerUnreadCount : 0;
      const meta = metaByThreadId[t.id];
      return {
        thread: t,
        unread,
        otherPartyName: meta?.buyerName || 'Buyer',
        listingTitle: meta?.listingTitle || 'Listing',
        listingId: t.listingId,
      };
    });
  }, [metaByThreadId, threads]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 flex items-center justify-center">
        <Card>
          <CardContent className="pt-10 pb-10 text-center">
            <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground mb-3 opacity-50" />
            <div className="font-semibold">Sign in required</div>
            <div className="text-sm text-muted-foreground mt-1">You must be signed in to view messages.</div>
            <Button className="mt-4" onClick={() => router.push('/login')}>
              Sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-foreground">Messages</h1>
            <p className="text-base md:text-lg text-muted-foreground">Conversations with buyers</p>
          </div>
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <Card className="lg:col-span-1 border-2 border-border/50 bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-bold">Inbox</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loadingThreads ? (
                <div className="p-6 text-sm text-muted-foreground">Loading…</div>
              ) : threadVMs.length === 0 ? (
                <div className="p-8 text-center">
                  <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                  <p className="text-sm text-muted-foreground font-medium mb-1">No conversations yet</p>
                  <p className="text-xs text-muted-foreground">When buyers message you, threads will appear here.</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {threadVMs.map(({ thread: t, unread }) => {
                    const active = selectedThreadId === t.id;
                    const meta = metaByThreadId[t.id];
                    return (
                      <button
                        key={t.id}
                        onClick={() => {
                          setSelectedThreadId(t.id);
                          router.replace(`/seller/messages?threadId=${t.id}`);
                        }}
                        className={cn(
                          'w-full p-4 text-left hover:bg-muted/30 transition-colors',
                          active && 'bg-muted/40'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar className="h-8 w-8 flex-shrink-0">
                              <AvatarFallback className="text-xs font-semibold">BY</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">
                                {meta?.buyerName || 'Buyer'}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {meta?.listingTitle || `Listing ${t.listingId.slice(-6)}`}
                              </p>
                            </div>
                          </div>
                          {unread > 0 && (
                            <Badge variant="destructive" className="h-5 px-2 text-xs font-semibold">
                              {unread}
                            </Badge>
                          )}
                        </div>
                        {t.lastMessagePreview && (
                          <p className="text-xs text-muted-foreground truncate mt-2">{t.lastMessagePreview}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 border-2 border-border/50 bg-card h-[650px] flex flex-col">
            {!thread ? (
              <CardContent className="pt-12 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-semibold mb-2">Select a conversation</h3>
                <p className="text-sm text-muted-foreground">Choose a thread from the inbox to view messages.</p>
              </CardContent>
            ) : (
              <MessageThreadComponent
                thread={thread}
                listingTitle={listing?.title || 'Listing'}
                otherPartyName={otherPartyName}
                orderStatus={undefined}
              />
            )}

            {listing?.id ? (
              <div className="border-t p-3 flex items-center justify-between">
                <div className="text-xs text-muted-foreground truncate">About: {listing.title}</div>
                <Button asChild variant="outline" size="sm">
                  <a href={`/listing/${listing.id}`} target="_blank" rel="noreferrer">
                    View listing
                  </a>
                </Button>
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}

