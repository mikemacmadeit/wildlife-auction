'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { MessageSquare, Send, AlertTriangle, Flag, Tag, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import type { Message, MessageThread, Listing, MessageAttachment } from '@/lib/types';
import {
  subscribeToThreadMessagesPage,
  fetchOlderThreadMessages,
  sendMessage,
  markThreadAsRead,
  flagThread,
  setThreadTyping,
} from '@/lib/firebase/messages';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { OfferFromMessagesDialog } from '@/components/offers/OfferFromMessagesDialog';
import { extractUrls, linkify } from '@/lib/text/linkify';
import { LinkPreviewCard, type LinkPreview } from '@/components/messaging/LinkPreviewCard';
import { uploadMessageImageAttachment } from '@/lib/firebase/message-attachments';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { db } from '@/lib/firebase/config';
import { doc, onSnapshot } from 'firebase/firestore';

interface MessageThreadProps {
  thread: MessageThread;
  listingTitle: string;
  listing?: Listing | null;
  otherPartyName: string;
  otherPartyAvatar?: string;
  orderStatus?: 'pending' | 'paid' | 'completed';
}

export function MessageThreadComponent({
  thread,
  listingTitle,
  listing,
  otherPartyName,
  otherPartyAvatar,
  orderStatus,
}: MessageThreadProps) {
  const { user, initialized: authInitialized } = useAuth();
  const { toast } = useToast();
  const PAGE_SIZE = 30;
  const [latestMessages, setLatestMessages] = useState<Message[]>([]);
  const [olderMessages, setOlderMessages] = useState<Message[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const oldestCursorRef = useRef<any | null>(null);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [isPaid, setIsPaid] = useState(orderStatus === 'paid' || orderStatus === 'completed');
  const [listenError, setListenError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<'spam' | 'harassment' | 'circumvention' | 'scam' | 'other'>('circumvention');
  const [reportDetails, setReportDetails] = useState('');
  const [offerOpen, setOfferOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<
    Array<{
      id: string;
      localUrl: string;
      uploading: boolean;
      progress: number;
      attachment?: MessageAttachment;
      error?: string;
    }>
  >([]);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [threadLive, setThreadLive] = useState<MessageThread>(thread);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const lastTypingPingAtRef = useRef<number>(0);
  const typingClearTimerRef = useRef<any>(null);
  const previewCacheRef = useRef<Map<string, LinkPreview>>(new Map());
  const [previewByUrl, setPreviewByUrl] = useState<Record<string, LinkPreview>>({});
  const isAtBottomRef = useRef(true);
  const initialScrollForThreadRef = useRef(true);

  const toDateSafe = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
    if (typeof value?.toDate === 'function') {
      try {
        const d = value.toDate();
        if (d instanceof Date && Number.isFinite(d.getTime())) return d;
      } catch {
        // ignore
      }
    }
    if (typeof value?.seconds === 'number') {
      const d = new Date(value.seconds * 1000);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    return null;
  };

  const isBuyer = !!user?.uid && user.uid === thread.buyerId;
  const myLastReadAt = isBuyer ? (threadLive as any)?.buyerLastReadAt : (threadLive as any)?.sellerLastReadAt;
  const otherLastReadAt = isBuyer ? (threadLive as any)?.sellerLastReadAt : (threadLive as any)?.buyerLastReadAt;
  const otherTypingUntil = isBuyer ? (threadLive as any)?.sellerTypingUntil : (threadLive as any)?.buyerTypingUntil;
  const isOtherTyping = (() => {
    const d = toDateSafe(otherTypingUntil);
    if (!d) return false;
    return d.getTime() > nowTick;
  })();

  const messages = useMemo(() => {
    const byId = new Map<string, Message>();
    // Add older messages first
    for (const m of olderMessages) byId.set(m.id, m);
    // Add latest messages (will overwrite older if same ID, which shouldn't happen)
    for (const m of latestMessages) {
      // If we have an optimistic message and a real message with similar content/timestamp from same sender, prefer real one
      const existing = byId.get(m.id);
      if (existing && existing.id.startsWith('optimistic-') && m.senderId === existing.senderId) {
        // Real message arrived - remove optimistic, use real
        byId.delete(existing.id);
      }
      byId.set(m.id, m);
    }
    const out = Array.from(byId.values());
    out.sort((a, b) => (a.createdAt?.getTime?.() || 0) - (b.createdAt?.getTime?.() || 0));
    return out;
  }, [latestMessages, olderMessages]);

  // Live thread fields (typing/read receipts) subscription
  useEffect(() => {
    if (!thread.id) return;
    try {
      const ref = doc(db, 'messageThreads', thread.id);
      const unsub = onSnapshot(
        ref,
        (snap) => {
          const d = snap.data() as any;
          if (!d) return;
          setThreadLive((prev) => ({
            ...(prev || thread),
            ...(d || {}),
            id: thread.id,
            createdAt: d?.createdAt?.toDate?.() || (prev as any)?.createdAt || thread.createdAt,
            updatedAt: d?.updatedAt?.toDate?.() || (prev as any)?.updatedAt || thread.updatedAt,
            lastMessageAt: d?.lastMessageAt?.toDate?.() || (prev as any)?.lastMessageAt,
          } as any));
        },
        () => {
          // ignore
        }
      );
      return () => unsub();
    } catch {
      // ignore
    }
  }, [thread, thread.id]);

  // Tick for typing indicator TTLs / "Seen" rendering
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Subscribe to messages
  useEffect(() => {
    if (!thread.id) return;
    if (!authInitialized) return;
    if (!user?.uid) return;
    setListenError(null);
    setOlderMessages([]);
    setLatestMessages([]);
    oldestCursorRef.current = null;
    setHasMoreOlder(true);

    const unsubscribe = subscribeToThreadMessagesPage(thread.id, PAGE_SIZE, (page) => {
      setLatestMessages(page.messages || []);
      oldestCursorRef.current = page.oldestCursor;
      if (!page.oldestCursor) setHasMoreOlder(false);
      // Mark as read when viewing (best-effort; never crash the listener)
      void markThreadAsRead(thread.id, user.uid).catch(() => {});
    }, {
      onError: (err: any) => {
        const code = String(err?.code || '');
        const msg = String(err?.message || 'Failed to load messages');
        if (code === 'permission-denied') {
          setListenError('You do not have permission to view this conversation.');
        } else {
          setListenError('Failed to load messages. Please refresh and try again.');
        }
        console.error('[MessageThread] subscribeToThreadMessagesPage error', err);
        toast({
          title: 'Messaging error',
          description: code ? `${msg} (${code})` : msg,
          variant: 'destructive',
        });
      },
    });

    return () => unsubscribe();
  }, [authInitialized, thread.id, toast, user?.uid]);

  // Load link previews for visible messages (best-effort; cached in-memory per session).
  useEffect(() => {
    if (!user?.uid) return;
    if (!messages?.length) return;

    const urls = new Set<string>();
    for (const m of messages) {
      const body = String((m as any)?.body || '');
      const first = extractUrls(body, 1)[0];
      if (first) urls.add(first);
    }

    const toFetch = Array.from(urls).filter((u) => !previewCacheRef.current.has(u));
    if (toFetch.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        await Promise.all(
          toFetch.map(async (url) => {
            try {
              const res = await fetch('/api/messages/link-preview', {
                method: 'POST',
                headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
                body: JSON.stringify({ url }),
              });
              const data = await res.json().catch(() => ({}));
              if (!res.ok || !data?.ok || !data?.preview) return;
              const preview = data.preview as LinkPreview;
              previewCacheRef.current.set(url, preview);
              if (!cancelled) setPreviewByUrl((prev) => ({ ...prev, [url]: preview }));
            } catch {
              // ignore
            }
          })
        );
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [messages, user]);

  // Reset scroll behavior when switching threads
  useEffect(() => {
    initialScrollForThreadRef.current = true;
    isAtBottomRef.current = true;
    // Ensure we don't show stale previews from a previous thread
    setPreviewByUrl({});
  }, [thread.id]);

  // Scroll to bottom (smart):
  // - On thread switch: jump to bottom (auto)
  // - On new messages: only auto-scroll if user is already near bottom (smooth)
  useEffect(() => {
    const el = messagesEndRef.current;
    if (!el) return;

    const shouldAutoScroll = initialScrollForThreadRef.current || isAtBottomRef.current;
    if (!shouldAutoScroll) return;

    const behavior = initialScrollForThreadRef.current ? 'auto' : 'smooth';
    el.scrollIntoView({ behavior });
    initialScrollForThreadRef.current = false;
  }, [messages]);

  // Update paid status
  useEffect(() => {
    setIsPaid(orderStatus === 'paid' || orderStatus === 'completed');
  }, [orderStatus]);

  const handleSend = async () => {
    const body = messageInput.trim();
    const uploaded = attachments.map((a) => a.attachment).filter(Boolean) as MessageAttachment[];
    const stillUploading = attachments.some((a) => a.uploading);
    if ((!body && uploaded.length === 0) || !user || sending || stillUploading) return;

    setSending(true);
    
    // Create optimistic message immediately for instant UI feedback
    const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      threadId: thread.id,
      senderId: user.uid,
      recipientId: user.uid === thread.buyerId ? thread.sellerId : thread.buyerId,
      listingId: thread.listingId,
      body: body,
      createdAt: new Date(),
      ...(uploaded.length ? { attachments: uploaded } : {}),
    };
    
    // Add optimistic message to UI immediately
    setLatestMessages((prev) => [...prev, optimisticMessage]);
    setMessageInput('');
    
    // Clear attachments + revoke local URLs
    const attachmentsToClear = [...attachments];
    setAttachments([]);
    for (const a of attachmentsToClear) {
      try {
        URL.revokeObjectURL(a.localUrl);
      } catch {}
    }
    
    try {
      // stop typing indicator
      try {
        await setThreadTyping({
          threadId: thread.id,
          userId: user.uid,
          buyerId: thread.buyerId,
          sellerId: thread.sellerId,
          isTyping: false,
        });
      } catch {}

      await sendMessage(
        thread.id,
        user.uid,
        user.uid === thread.buyerId ? thread.sellerId : thread.buyerId,
        thread.listingId,
        body,
        orderStatus,
        { attachments: uploaded.length ? uploaded : undefined }
      );
      
      // Optimistic message will be automatically replaced when real message arrives via onSnapshot
      // The subscription callback handles matching and removal
    } catch (error: any) {
      // Remove optimistic message on error
      setLatestMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      
      const code = typeof error?.code === 'string' ? error.code : '';
      toast({
        title: 'Error sending message',
        description: code ? `${error.message || 'Failed to send message'} (${code})` : error.message || 'Failed to send message',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  const loadOlder = async () => {
    if (loadingOlder) return;
    if (!hasMoreOlder) return;
    const before = oldestCursorRef.current;
    if (!before) {
      setHasMoreOlder(false);
      return;
    }
    const sc = scrollRef.current;
    const prevHeight = sc?.scrollHeight || 0;
    const prevTop = sc?.scrollTop || 0;

    setLoadingOlder(true);
    try {
      const page = await fetchOlderThreadMessages({ threadId: thread.id, pageSize: PAGE_SIZE, before });
      if (!page?.messages?.length) {
        setHasMoreOlder(false);
      } else {
        setOlderMessages((prev) => {
          const byId = new Map(prev.map((m) => [m.id, m] as const));
          for (const m of page.messages) byId.set(m.id, m);
          const out = Array.from(byId.values());
          out.sort((a, b) => (a.createdAt?.getTime?.() || 0) - (b.createdAt?.getTime?.() || 0));
          return out;
        });
      }
      oldestCursorRef.current = page.oldestCursor;
      if (!page.oldestCursor) setHasMoreOlder(false);
    } catch (e) {
      // ignore (best-effort)
    } finally {
      setLoadingOlder(false);
      // Maintain scroll position when we prepend older messages.
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        const newHeight = el.scrollHeight || 0;
        const delta = newHeight - prevHeight;
        if (delta > 0) el.scrollTop = prevTop + delta;
      });
    }
  };

  const handleTypingPing = () => {
    if (!user?.uid) return;
    const now = Date.now();
    // throttle network writes
    if (now - lastTypingPingAtRef.current < 4000) return;
    lastTypingPingAtRef.current = now;
    void setThreadTyping({
      threadId: thread.id,
      userId: user.uid,
      buyerId: thread.buyerId,
      sellerId: thread.sellerId,
      isTyping: true,
    }).catch(() => {});

    if (typingClearTimerRef.current) clearTimeout(typingClearTimerRef.current);
    typingClearTimerRef.current = setTimeout(() => {
      void setThreadTyping({
        threadId: thread.id,
        userId: user.uid,
        buyerId: thread.buyerId,
        sellerId: thread.sellerId,
        isTyping: false,
      }).catch(() => {});
    }, 10000);
  };

  const handlePickImages = () => {
    try {
      fileInputRef.current?.click();
    } catch {}
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!user?.uid) return;

    const maxPerMessage = 6;
    const existingCount = attachments.length;
    const remaining = Math.max(0, maxPerMessage - existingCount);
    const picked = Array.from(files).slice(0, remaining);

    if (picked.length === 0) {
      toast({ title: 'Too many photos', description: `Max ${maxPerMessage} per message.` });
      return;
    }

    const newRows = picked.map((f) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const localUrl = URL.createObjectURL(f);
      return { id, localUrl, uploading: true, progress: 0 } as const;
    });

    setAttachments((prev) => [...prev, ...newRows]);

    await Promise.all(
      picked.map(async (file, idx) => {
        const row = newRows[idx];
        try {
          const att = await uploadMessageImageAttachment(thread.id, file, (p) => {
            setAttachments((prev) =>
              prev.map((x) => (x.id === row.id ? { ...x, progress: Math.round(p.progress), uploading: p.state !== 'success' } : x))
            );
          });
          setAttachments((prev) => prev.map((x) => (x.id === row.id ? { ...x, uploading: false, progress: 100, attachment: att } : x)));
        } catch (e: any) {
          const msg = String(e?.message || 'Failed to upload');
          setAttachments((prev) => prev.map((x) => (x.id === row.id ? { ...x, uploading: false, error: msg } : x)));
        }
      })
    );

    // reset input value so selecting the same file again works
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFlag = async () => {
    if (!user) return;
    try {
      await flagThread(thread.id, user.uid, {
        reason: reportReason,
        details: reportDetails.trim() ? reportDetails.trim() : undefined,
      });
      toast({
        title: 'Thread flagged',
        description: 'Thanks — our team will review this conversation.',
      });
      setReportOpen(false);
      setReportDetails('');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: 'Failed to flag thread',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex flex-col h-full overscroll-contain">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={otherPartyAvatar} />
            <AvatarFallback>{otherPartyName.substring(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{otherPartyName}</p>
            <p className="text-sm text-muted-foreground">{listingTitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Offers entry point (buyer-only). Shows seller store listings where Best Offer is enabled. */}
          {user?.uid && thread?.buyerId === user.uid ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setOfferOpen(true)}>
                <Tag className="h-4 w-4 mr-2" />
                Offer
              </Button>
              <OfferFromMessagesDialog
                open={offerOpen}
                onOpenChange={setOfferOpen}
                sellerId={thread.sellerId}
                sellerName={otherPartyName}
              />
            </>
          ) : null}

          <AlertDialog open={reportOpen} onOpenChange={setReportOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Flag className="h-4 w-4 mr-2" />
                Report
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Report this conversation</AlertDialogTitle>
              <AlertDialogDescription>
                Tell us what’s going on. Reports are reviewed by admins.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-semibold">Reason</div>
                <RadioGroup value={reportReason} onValueChange={(v) => setReportReason(v as any)} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="r-circumvention" value="circumvention" />
                    <Label htmlFor="r-circumvention">Trying to move payment off-platform / share contact info</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="r-scam" value="scam" />
                    <Label htmlFor="r-scam">Scam / suspicious behavior</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="r-harassment" value="harassment" />
                    <Label htmlFor="r-harassment">Harassment / abusive messages</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="r-spam" value="spam" />
                    <Label htmlFor="r-spam">Spam</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="r-other" value="other" />
                    <Label htmlFor="r-other">Other</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold">Details (optional)</div>
                <Textarea
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder="Add any context that will help our team review…"
                  className="min-h-[90px]"
                />
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleFlag}>Submit report</AlertDialogAction>
            </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Safety Notice */}
      {!isPaid && (
        <Alert className="m-4 border-orange-200 bg-orange-50 text-orange-950 dark:border-orange-900/50 dark:bg-orange-950/25 dark:text-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-700 dark:text-orange-300" />
          <AlertDescription className="text-sm text-orange-950 dark:text-orange-50">
            <strong>For your safety:</strong> Keep communication and payment on Wildlife Exchange. 
            Contact info unlocks after payment is completed.
          </AlertDescription>
        </Alert>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 overscroll-contain touch-pan-y"
        style={{ WebkitOverflowScrolling: 'touch' }}
        onScroll={() => {
          const sc = scrollRef.current;
          if (!sc) return;
          const thresholdPx = 80;
          const remaining = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
          isAtBottomRef.current = remaining <= thresholdPx;

          // Auto-load older messages when near top
          if (sc.scrollTop <= 60 && hasMoreOlder && !loadingOlder) {
            void loadOlder();
          }
        }}
      >
        {hasMoreOlder ? (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={() => void loadOlder()} disabled={loadingOlder}>
              {loadingOlder ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Load earlier
            </Button>
          </div>
        ) : null}
        {listenError ? (
          <Alert className="border-destructive/40 bg-destructive/5 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              {listenError}
            </AlertDescription>
          </Alert>
        ) : null}
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No messages yet. Start the conversation!</p>
          </div>
        ) : (
          messages.map((message) => {
            const isSender = message.senderId === user?.uid;
            const createdAt = toDateSafe((message as any).createdAt);
            const body = String(message.body || '');
            const tokens = linkify(body);
            const firstUrl = extractUrls(body, 1)[0];
            const preview = firstUrl ? (previewByUrl[firstUrl] || previewCacheRef.current.get(firstUrl)) : undefined;
            const atts = Array.isArray((message as any)?.attachments) ? ((message as any).attachments as MessageAttachment[]) : [];
            return (
              <div
                key={message.id}
                className={cn('flex gap-2', isSender ? 'justify-end' : 'justify-start')}
              >
                {!isSender && (
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={otherPartyAvatar} />
                    <AvatarFallback>{otherPartyName.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={cn(
                    'max-w-[75%] rounded-lg p-3',
                    isSender
                      ? 'bg-primary/10 border border-primary/20'
                      : 'bg-muted border border-border'
                  )}
                >
                  {atts.length ? (
                    <div className="mb-2 grid grid-cols-2 gap-2">
                      {atts.slice(0, 6).map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setViewerUrl(a.url)}
                          className="relative overflow-hidden rounded-md border bg-background/30"
                        >
                          <img
                            src={a.url}
                            alt="Attachment"
                            className="block h-[140px] w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {tokens.map((t, idx) =>
                      t.type === 'link' ? (
                        <a
                          key={`${t.href}-${idx}`}
                          href={t.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 text-primary hover:text-primary/80"
                        >
                          {t.value}
                        </a>
                      ) : (
                        <span key={`t-${idx}`}>{t.value}</span>
                      )
                    )}
                  </p>
                  {preview ? <LinkPreviewCard preview={preview} /> : null}
                  {message.wasRedacted && (
                    <Badge variant="outline" className="mt-2 text-xs">
                      Contact details redacted
                    </Badge>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    {createdAt ? formatDistanceToNow(createdAt, { addSuffix: true }) : '—'}
                  </p>
                  {(() => {
                    if (!user?.uid) return null;
                    if (message.senderId !== user.uid) return null;
                    const msgTime = createdAt?.getTime?.() || 0;
                    if (!msgTime) return null;
                    const otherRead = toDateSafe(otherLastReadAt);
                    if (!otherRead) return null;
                    // Only show on the latest outgoing message to avoid noise
                    const lastOutgoing = (() => {
                      for (let i = messages.length - 1; i >= 0; i--) {
                        if (messages[i]?.senderId === user.uid) return messages[i];
                      }
                      return null;
                    })();
                    if (!lastOutgoing || lastOutgoing.id !== message.id) return null;
                    if (otherRead.getTime() < msgTime) return null;
                    return (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Seen {formatDistanceToNow(otherRead, { addSuffix: true })}
                      </p>
                    );
                  })()}
                </div>
                {isSender && (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/20">You</AvatarFallback>
                  </Avatar>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          aria-label="Upload images"
          onChange={(e) => void handleFilesSelected(e.target.files)}
        />

        {attachments.length ? (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {attachments.map((a) => (
              <div key={a.id} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                <img src={a.localUrl} alt="Upload preview" className="h-full w-full object-cover" />
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded-full bg-background/80 p-1 shadow"
                  onClick={() => {
                    setAttachments((prev) => {
                      const next = prev.filter((x) => x.id !== a.id);
                      try {
                        URL.revokeObjectURL(a.localUrl);
                      } catch {}
                      return next;
                    });
                  }}
                  aria-label="Remove attachment"
                >
                  <X className="h-3 w-3" />
                </button>
                {a.uploading ? (
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-background/60">
                    <div className="h-1 bg-primary" style={{ width: `${a.progress}%` }} />
                  </div>
                ) : null}
                {a.error ? (
                  <div className="absolute inset-0 bg-destructive/60 text-[10px] text-white p-1 flex items-center justify-center text-center">
                    Upload failed
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex gap-2 items-end">
          <Button
            type="button"
            variant="outline"
            className="h-[44px] w-[44px] px-0"
            onClick={handlePickImages}
            disabled={sending}
            aria-label="Add photos"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>
          <Textarea
            placeholder="Write a message…"
            value={messageInput}
            onChange={(e) => {
              setMessageInput(e.target.value);
              handleTypingPing();
            }}
            onBlur={() => {
              if (!user?.uid) return;
              void setThreadTyping({
                threadId: thread.id,
                userId: user.uid,
                buyerId: thread.buyerId,
                sellerId: thread.sellerId,
                isTyping: false,
              }).catch(() => {});
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={sending}
            className="min-h-[44px] max-h-[140px] resize-none text-base"
          />
          <Button
            onClick={handleSend}
            disabled={
              sending ||
              (attachments.length > 0 && attachments.some((a) => a.uploading)) ||
              (!messageInput.trim() && attachments.filter((a) => !!a.attachment).length === 0)
            }
            className="h-[44px] w-[44px] px-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {!isPaid && (
          <p className="text-xs text-muted-foreground mt-2">
            Contact details are hidden until payment is completed.
          </p>
        )}
        {isOtherTyping ? (
          <p className="text-xs text-muted-foreground mt-2">
            {otherPartyName} is typing…
          </p>
        ) : null}
      </div>

      <Dialog open={!!viewerUrl} onOpenChange={(o) => (!o ? setViewerUrl(null) : null)}>
        <DialogContent className="max-w-3xl">
          {viewerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={viewerUrl} alt="Attachment" className="w-full max-h-[80vh] object-contain rounded-md" />
          ) : (
            <div />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
