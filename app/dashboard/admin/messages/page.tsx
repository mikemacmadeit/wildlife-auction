'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Flag, AlertTriangle, MessageSquare, Search, ShieldAlert, UserX, CheckCircle2, XCircle } from 'lucide-react';
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Message, MessageThread } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

export default function AdminMessagesPage() {
  const MISSING_INDEX_FLAG_KEY = 'we:admin:missing_index:messageThreads_flagged_updatedAt:v1';

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

  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeThread, setActiveThread] = useState<MessageThread | null>(null);
  const [activeMessages, setActiveMessages] = useState<Message[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [disableReason, setDisableReason] = useState('');
  const [disableTargetUid, setDisableTargetUid] = useState<string | null>(null);
  const [disableOpen, setDisableOpen] = useState(false);

  useEffect(() => {
    if (!adminLoading && isAdmin) {
      loadFlaggedThreads();
    }
  }, [adminLoading, isAdmin]);

  const loadFlaggedThreads = async () => {
    try {
      setLoading(true);
      const threadsRef = collection(db, 'messageThreads');

      // Preferred query (requires composite index: flagged ASC + updatedAt DESC).
      // Fallback below keeps moderation usable while indexes build.
      let snapshot: any;
      try {
        // If we already detected a missing index in this session, skip the indexed query to avoid spam.
        const skipIndexed =
          typeof window !== 'undefined' && window.sessionStorage?.getItem(MISSING_INDEX_FLAG_KEY) === '1';
        if (skipIndexed) throw Object.assign(new Error('SKIP_INDEXED_QUERY'), { code: 'failed-precondition' });
        const flaggedQuery = query(threadsRef, where('flagged', '==', true), orderBy('updatedAt', 'desc'), limit(50));
        snapshot = await getDocs(flaggedQuery);
      } catch (e: any) {
        const code = String(e?.code || '');
        const msg = String(e?.message || '');
        const isMissingIndex =
          code === 'failed-precondition' ||
          msg.toLowerCase().includes('requires an index') ||
          msg.toLowerCase().includes('failed-precondition');
        if (!isMissingIndex) throw e;
        try {
          if (typeof window !== 'undefined' && window.sessionStorage) {
            window.sessionStorage.setItem(MISSING_INDEX_FLAG_KEY, '1');
          }
        } catch {
          // ignore
        }
        // Warn once per session (so prod console isn't flooded).
        try {
          const warnedKey = `${MISSING_INDEX_FLAG_KEY}:warned`;
          const alreadyWarned = typeof window !== 'undefined' && window.sessionStorage?.getItem(warnedKey) === '1';
          if (!alreadyWarned) {
            console.warn('[admin/messages] Missing index for flagged threads query; using fallback', { code });
            window.sessionStorage?.setItem(warnedKey, '1');
          }
        } catch {
          // ignore
        }
        snapshot = await getDocs(query(threadsRef, where('flagged', '==', true), limit(250)));
      }

      const flaggedThreads = snapshot.docs
        .map((docSnap: any) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            ...data,
            createdAt: toDateSafe(data.createdAt) || new Date(),
            updatedAt: toDateSafe(data.updatedAt) || new Date(),
            lastMessageAt: toDateSafe(data.lastMessageAt),
            flaggedAt: toDateSafe(data.flaggedAt),
            adminReviewedAt: toDateSafe(data.adminReviewedAt),
            moderationNotes: Array.isArray(data.moderationNotes)
              ? data.moderationNotes.map((n: any) => ({
                  by: String(n?.by || ''),
                  at: toDateSafe(n?.at) || new Date(),
                  text: String(n?.text || ''),
                }))
              : undefined,
          } as MessageThread;
        })
        .sort((a: any, b: any) => (b.updatedAt?.getTime?.() || 0) - (a.updatedAt?.getTime?.() || 0))
        .slice(0, 50);

      setThreads(flaggedThreads);
    } catch (error) {
      console.error('Error loading flagged threads:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredThreads = threads.filter((thread) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      thread.id.toLowerCase().includes(query) ||
      thread.listingId.toLowerCase().includes(query) ||
      thread.buyerId.toLowerCase().includes(query) ||
      thread.sellerId.toLowerCase().includes(query)
    );
  });

  const counts = useMemo(() => {
    const open = filteredThreads.filter((t) => (t.moderationStatus || 'open') === 'open').length;
    const reviewing = filteredThreads.filter((t) => t.moderationStatus === 'reviewing').length;
    return { total: filteredThreads.length, open, reviewing };
  }, [filteredThreads]);

  const openThread = async (threadId: string) => {
    setDetailOpen(true);
    setLoadingDetail(true);
    setActiveThread(null);
    setActiveMessages([]);
    setAdminNote('');

    try {
      const threadRef = doc(db, 'messageThreads', threadId);
      const threadSnap = await getDoc(threadRef);
      if (!threadSnap.exists()) throw new Error('Thread not found');
      const tData: any = threadSnap.data();
      const mappedThread: MessageThread = {
        id: threadSnap.id,
        ...tData,
        createdAt: toDateSafe(tData.createdAt) || new Date(),
        updatedAt: toDateSafe(tData.updatedAt) || new Date(),
        lastMessageAt: toDateSafe(tData.lastMessageAt),
        flaggedAt: toDateSafe(tData.flaggedAt),
        adminReviewedAt: toDateSafe(tData.adminReviewedAt),
        moderationNotes: Array.isArray(tData.moderationNotes)
          ? tData.moderationNotes.map((n: any) => ({
              by: String(n?.by || ''),
              at: toDateSafe(n?.at) || new Date(),
              text: String(n?.text || ''),
            }))
          : undefined,
      };
      setActiveThread(mappedThread);

      const messagesRef = collection(db, 'messageThreads', threadId, 'messages');
      const messagesQuery = query(messagesRef, orderBy('createdAt', 'asc'), limit(250));
      const messagesSnap = await getDocs(messagesQuery);
      const msgs = messagesSnap.docs.map((m) => {
        const d: any = m.data();
        return {
          id: m.id,
          ...d,
          createdAt: toDateSafe(d.createdAt) || new Date(),
          readAt: toDateSafe(d.readAt) || undefined,
        } as Message;
      });
      setActiveMessages(msgs);
    } catch (e) {
      console.error('[admin/messages] Failed to open thread', e);
    } finally {
      setLoadingDetail(false);
    }
  };

  const setModeration = async (
    threadId: string,
    patch: Partial<Pick<MessageThread, 'flagged' | 'moderationStatus' | 'adminReviewed' | 'adminReviewedBy' | 'adminReviewedAt'>>
  ) => {
    const actorUid = user?.uid || null;
    const threadRef = doc(db, 'messageThreads', threadId);
    await updateDoc(threadRef, {
      ...patch,
      adminReviewedBy: patch.adminReviewed ? (actorUid || patch.adminReviewedBy || null) : patch.adminReviewedBy ?? null,
      adminReviewedAt: patch.adminReviewed ? (serverTimestamp() as any) : patch.adminReviewedAt ?? null,
      updatedAt: serverTimestamp(),
    } as any);
    await loadFlaggedThreads();
    if (activeThread?.id === threadId) {
      await openThread(threadId);
    }
  };

  const addNote = async () => {
    if (!activeThread?.id) return;
    if (!adminNote.trim()) return;
    const actorUid = user?.uid;
    if (!actorUid) return;

    const threadRef = doc(db, 'messageThreads', activeThread.id);
    await updateDoc(threadRef, {
      moderationNotes: arrayUnion({
        by: actorUid,
        at: serverTimestamp(),
        text: adminNote.trim(),
      } as any),
      updatedAt: serverTimestamp(),
    } as any);
    setAdminNote('');
    await openThread(activeThread.id);
  };

  const disableUser = async () => {
    if (!disableTargetUid) return;
    if (!disableReason.trim()) return;
    if (!user) return;

    const token = await user.getIdToken();
    const res = await fetch(`/api/admin/users/${disableTargetUid}/set-disabled`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ disabled: true, reason: disableReason.trim() }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.message || data?.error || 'Failed to disable user');
    }
    setDisableOpen(false);
    setDisableReason('');
    setDisableTargetUid(null);
  };

  if (adminLoading || loading) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 flex items-center justify-center">
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
            <p className="text-sm text-muted-foreground">Admin access required</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-2">
            Moderation Inbox
          </h1>
          <p className="text-base md:text-lg text-muted-foreground">
            Review reported conversations and take action.
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <Badge variant="outline">Total: {counts.total}</Badge>
            <Badge variant="destructive">Open: {counts.open}</Badge>
            <Badge variant="secondary">Reviewing: {counts.reviewing}</Badge>
          </div>
        </div>

        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search by thread ID, listing ID, or user ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {filteredThreads.length === 0 ? (
            <Card>
              <CardContent className="pt-12 pb-12 text-center">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
                <h3 className="text-lg font-semibold mb-2">No flagged threads</h3>
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? 'No threads match your search' : 'All clear!'}
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredThreads.map((thread) => (
              <Card key={thread.id} className="border-2 border-orange-200">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Flag className="h-5 w-5 text-orange-600" />
                        Thread {thread.id.slice(-8)}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Listing: {thread.listingId}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">{(thread.moderationStatus || 'open').toUpperCase()}</Badge>
                      <Badge variant="outline">{thread.flagCount || 1} report(s)</Badge>
                      <Badge variant="secondary">{thread.violationCount || 0} violations</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Buyer</p>
                      <p className="font-medium">{thread.buyerId}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Seller</p>
                      <p className="font-medium">{thread.sellerId}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Reason</p>
                      <p className="font-medium">{thread.flaggedReason || '—'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Reported</p>
                      <p className="font-medium">
                        {thread.flaggedAt ? formatDistanceToNow(thread.flaggedAt, { addSuffix: true }) : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Last Message</p>
                      <p className="font-medium">
                        {thread.lastMessageAt
                          ? formatDistanceToNow(toDateSafe(thread.lastMessageAt) || new Date(), { addSuffix: true })
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Updated</p>
                      <p className="font-medium">
                        {formatDistanceToNow(toDateSafe(thread.updatedAt) || new Date(), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  {thread.lastMessagePreview && (
                    <div className="mt-4 p-3 bg-muted rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Last Message Preview</p>
                      <p className="text-sm">{thread.lastMessagePreview}</p>
                    </div>
                  )}
                  {thread.flaggedDetails ? (
                    <div className="mt-3 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200/60 dark:border-orange-900/40">
                      <div className="text-xs font-semibold text-orange-800 dark:text-orange-200">Reporter details</div>
                      <div className="text-sm mt-1 text-orange-950 dark:text-orange-50">{thread.flaggedDetails}</div>
                    </div>
                  ) : null}
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/listing/${thread.listingId}`} target="_blank">
                        View Listing
                      </a>
                    </Button>
                    <Button variant="default" size="sm" onClick={() => openThread(thread.id)}>
                      Review & Take Action
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setModeration(thread.id, { moderationStatus: 'reviewing' } as any)}>
                      Mark Reviewing
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setModeration(thread.id, { flagged: false, moderationStatus: 'dismissed', adminReviewed: true } as any)}
                      className="border-border/60"
                    >
                      Dismiss
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setModeration(thread.id, { flagged: false, moderationStatus: 'resolved', adminReviewed: true } as any)}
                      className="border-green-500/40 text-green-700 hover:text-green-800"
                    >
                      Resolve
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-orange-600" />
                Moderation Review
              </DialogTitle>
              <DialogDescription>
                {activeThread ? (
                  <span>
                    Thread <span className="font-semibold">{activeThread.id}</span> • Listing{' '}
                    <a className="underline" href={`/listing/${activeThread.listingId}`} target="_blank">
                      {activeThread.listingId}
                    </a>
                  </span>
                ) : (
                  'Loading…'
                )}
              </DialogDescription>
            </DialogHeader>

            {loadingDetail ? (
              <div className="py-10 text-sm text-muted-foreground">Loading conversation…</div>
            ) : !activeThread ? (
              <div className="py-10 text-sm text-muted-foreground">No thread loaded.</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Conversation */}
                <div className="lg:col-span-2 border rounded-lg p-3 max-h-[65vh] overflow-y-auto bg-muted/20">
                  {activeMessages.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-8 text-center">No messages.</div>
                  ) : (
                    <div className="space-y-3">
                      {activeMessages.map((m) => {
                        const isBuyer = m.senderId === activeThread.buyerId;
                        return (
                          <div
                            key={m.id}
                            className={cn(
                              'rounded-lg border p-3 bg-background',
                              isBuyer ? 'border-primary/20' : 'border-border'
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs text-muted-foreground">
                                <span className="font-semibold text-foreground">{isBuyer ? 'Buyer' : 'Seller'}</span>{' '}
                                <span className="ml-1">{m.senderId}</span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {m.createdAt ? formatDistanceToNow(m.createdAt, { addSuffix: true }) : '—'}
                              </div>
                            </div>
                            <div className="mt-2 text-sm whitespace-pre-wrap break-words">{m.body}</div>
                            <div className="mt-2 flex gap-2">
                              {(m as any).wasRedacted ? (
                                <Badge variant="outline" className="text-xs">
                                  Redacted
                                </Badge>
                              ) : null}
                              {(m as any).violationCount ? (
                                <Badge variant="destructive" className="text-xs">
                                  {(m as any).violationCount} violation(s)
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Actions + next steps */}
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Report</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-muted-foreground">Reason</div>
                        <div className="font-semibold">{activeThread.flaggedReason || '—'}</div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-muted-foreground">Reported</div>
                        <div className="font-semibold">
                          {activeThread.flaggedAt ? formatDistanceToNow(activeThread.flaggedAt, { addSuffix: true }) : '—'}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-muted-foreground">Reports</div>
                        <div className="font-semibold">{activeThread.flagCount || 1}</div>
                      </div>
                      {activeThread.flaggedDetails ? (
                        <div className="pt-2">
                          <div className="text-xs font-semibold text-muted-foreground">Details</div>
                          <div className="text-sm">{activeThread.flaggedDetails}</div>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Next steps</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                      {activeThread.flaggedReason === 'circumvention' ? (
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                          <li>Look for phone/email/payment keywords (off-platform attempts).</li>
                          <li>If repeated: disable the offending account + document the action.</li>
                          <li>Consider warning both parties to keep payment on-platform.</li>
                        </ul>
                      ) : activeThread.flaggedReason === 'harassment' ? (
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                          <li>If abusive: disable the sender immediately.</li>
                          <li>Document why (copy message IDs into an internal note).</li>
                        </ul>
                      ) : activeThread.flaggedReason === 'scam' ? (
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                          <li>Disable suspected scammer and escalate for manual review.</li>
                          <li>Check listing + payout status for anomalies.</li>
                        </ul>
                      ) : (
                        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                          <li>Review conversation history and take appropriate action.</li>
                          <li>Add an internal note describing what you saw + what you did.</li>
                        </ul>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Actions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setModeration(activeThread.id, { moderationStatus: 'reviewing' } as any)}
                        >
                          <ShieldAlert className="h-4 w-4 mr-2" />
                          Reviewing
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setModeration(activeThread.id, { flagged: false, moderationStatus: 'dismissed', adminReviewed: true } as any)}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Dismiss
                        </Button>
                        <Button
                          variant="outline"
                          className="border-green-500/40 text-green-700 hover:text-green-800"
                          onClick={() => setModeration(activeThread.id, { flagged: false, moderationStatus: 'resolved', adminReviewed: true } as any)}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Resolve
                        </Button>
                        <AlertDialog open={disableOpen} onOpenChange={setDisableOpen}>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              className="border-destructive/40 text-destructive hover:text-destructive"
                              onClick={() => {
                                // default to disabling the non-reporting party? we don't know reporter; start with seller for now.
                                setDisableTargetUid(activeThread.sellerId);
                                setDisableReason('Violation of messaging policy');
                              }}
                            >
                              <UserX className="h-4 w-4 mr-2" />
                              Disable user…
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Disable a user</AlertDialogTitle>
                              <AlertDialogDescription>
                                This disables sign-in for the selected user. Provide a brief reason for the audit trail.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="space-y-3">
                              <div className="text-sm space-y-1">
                                <div className="font-semibold">Target</div>
                                <div className="flex flex-wrap gap-2">
                                  <Button variant={disableTargetUid === activeThread.buyerId ? 'default' : 'outline'} size="sm" onClick={() => setDisableTargetUid(activeThread.buyerId)}>
                                    Buyer
                                  </Button>
                                  <Button variant={disableTargetUid === activeThread.sellerId ? 'default' : 'outline'} size="sm" onClick={() => setDisableTargetUid(activeThread.sellerId)}>
                                    Seller
                                  </Button>
                                </div>
                                <div className="text-xs text-muted-foreground break-all">{disableTargetUid}</div>
                              </div>
                              <div className="space-y-2">
                                <div className="text-sm font-semibold">Reason</div>
                                <Textarea value={disableReason} onChange={(e) => setDisableReason(e.target.value)} placeholder="Required (shown in audit logs)" />
                              </div>
                            </div>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={async () => {
                                  try {
                                    await disableUser();
                                  } catch (e: any) {
                                    console.error(e);
                                  }
                                }}
                              >
                                Disable
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>

                      <div className="pt-3 space-y-2">
                        <div className="text-sm font-semibold">Internal note</div>
                        <Textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder="What did you review? What action did you take?" />
                        <Button onClick={addNote} disabled={!adminNote.trim()}>
                          Add note
                        </Button>
                        {activeThread.moderationNotes?.length ? (
                          <div className="pt-2 space-y-2">
                            <div className="text-xs font-semibold text-muted-foreground">Notes</div>
                            <div className="space-y-2">
                              {activeThread.moderationNotes
                                .slice()
                                .sort((a, b) => (b.at?.getTime?.() || 0) - (a.at?.getTime?.() || 0))
                                .slice(0, 5)
                                .map((n, idx) => (
                                  <div key={idx} className="rounded-md border p-2 text-sm bg-muted/30">
                                    <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                                      <span className="break-all">{n.by}</span>
                                      <span>{n.at ? formatDistanceToNow(n.at, { addSuffix: true }) : '—'}</span>
                                    </div>
                                    <div className="mt-1 whitespace-pre-wrap">{n.text}</div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
