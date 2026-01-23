/**
 * Admin Support Inbox
 * - Shows contact form submissions from /contact
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Mail, CheckCircle2, ArrowRight, Search, MessageSquare, Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { AIAdminDraft } from '@/components/admin/AIAdminDraft';

type TicketRow = {
  ticketId: string;
  status: 'open' | 'resolved' | string;
  source: string;
  name: string;
  email: string;
  subject: string;
  messagePreview: string;
  userId: string | null;
  listingId: string | null;
  orderId: string | null;
  createdAt: string | Date | null;
  updatedAt: string | Date | null;
};

function toDateLabel(v: any): string {
  const d = v instanceof Date ? v : v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function AdminSupportPage() {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { toast } = useToast();

  const [tab, setTab] = useState<'open' | 'resolved'>('open');
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const [detailOpen, setDetailOpen] = useState(false);
  const [active, setActive] = useState<TicketRow | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/support/tickets?status=${encodeURIComponent(tab)}&limit=100`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok !== true) throw new Error(body?.error || body?.message || 'Failed to load tickets');
      setTickets(Array.isArray(body?.tickets) ? body.tickets : []);
    } catch (e: any) {
      toast({ title: 'Support inbox error', description: e?.message || 'Failed to load.', variant: 'destructive' });
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [tab, toast, user]);

  useEffect(() => {
    if (!adminLoading && isAdmin && user) void load();
  }, [adminLoading, isAdmin, user, load]);

  const markStatus = useCallback(
    async (ticketId: string, status: 'open' | 'resolved') => {
      if (!user) return;
      setActingId(ticketId);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/support/tickets/${encodeURIComponent(ticketId)}/status`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ status }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body?.ok !== true) throw new Error(body?.error || body?.message || 'Failed to update');
        toast({ title: 'Updated', description: status === 'resolved' ? 'Ticket resolved.' : 'Ticket reopened.' });
        await load();
      } catch (e: any) {
        toast({ title: 'Update failed', description: e?.message || 'Please try again.', variant: 'destructive' });
      } finally {
        setActingId(null);
      }
    },
    [load, toast, user]
  );

  const counts = useMemo(() => {
    const open = tickets.filter((t) => t.status === 'open').length;
    const resolved = tickets.filter((t) => t.status === 'resolved').length;
    return { open, resolved };
  }, [tickets]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return tickets;
    return tickets.filter((t) => {
      return (
        String(t.ticketId || '').toLowerCase().includes(query) ||
        String(t.subject || '').toLowerCase().includes(query) ||
        String(t.email || '').toLowerCase().includes(query) ||
        String(t.userId || '').toLowerCase().includes(query) ||
        String(t.listingId || '').toLowerCase().includes(query) ||
        String(t.orderId || '').toLowerCase().includes(query)
      );
    });
  }, [q, tickets]);

  const openTicket = useCallback((t: TicketRow) => {
    setActive(t);
    setReply('');
    setDetailOpen(true);
  }, []);

  const sendReply = useCallback(async () => {
    if (!user || !active?.ticketId) return;
    if (!reply.trim()) return;
    setSending(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/support/tickets/${encodeURIComponent(active.ticketId)}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: reply.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok !== true) throw new Error(body?.error || body?.message || 'Failed to send');
      toast({ title: 'Reply sent', description: body?.emailed ? 'Emailed user successfully.' : 'Saved reply, but email failed.' });
      setReply('');
      setDetailOpen(false);
      await load();
    } catch (e: any) {
      toast({ title: 'Send failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }, [active?.ticketId, load, reply, toast, user]);

  if (adminLoading) {
    return (
      <div className="min-h-[300px] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card>
          <CardContent className="pt-6">
            <div className="font-semibold">Admin access required</div>
            <div className="text-sm text-muted-foreground mt-1">You don’t have access to Support.</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <h1 className="text-3xl font-extrabold">Support</h1>
          </div>
          <p className="text-muted-foreground mt-1">Contact form submissions from `/contact`.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading} className="min-h-[44px] font-semibold">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="open" className="font-semibold">
            Open
          </TabsTrigger>
          <TabsTrigger value="resolved" className="font-semibold">
            Resolved
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card className="border-2 mb-4">
            <CardContent className="pt-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search tickets by email, subject, ticketId, userId, listingId, orderId…"
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <Card className="border-2">
              <CardContent className="py-10 text-center">
                <div className="font-extrabold">No tickets</div>
                <div className="text-sm text-muted-foreground mt-1">Nothing in this queue right now.</div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filtered.map((t) => (
                <Card key={t.ticketId} className="border-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <CardTitle className="text-lg font-extrabold truncate">{t.subject || '(No subject)'}</CardTitle>
                        <CardDescription className="mt-1">
                          {t.name} • <a className="underline" href={`mailto:${t.email}`}>{t.email}</a> • {toDateLabel(t.createdAt)}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={t.status === 'resolved' ? 'secondary' : 'default'} className="font-semibold">
                          {t.status}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">{t.messagePreview}</div>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                      {t.userId ? (
                        <span>
                          User: <Link className="underline" href={`/dashboard/admin/users/${t.userId}`}>{t.userId}</Link>
                        </span>
                      ) : (
                        <span>User: —</span>
                      )}
                      {t.listingId ? <span>Listing: {t.listingId}</span> : null}
                      {t.orderId ? <span>Order: {t.orderId}</span> : null}
                    </div>
                    <div className="flex items-center justify-between gap-3 flex-wrap pt-2 border-t border-border/50">
                      <Button type="button" variant="outline" className="font-semibold" onClick={() => openTicket(t)}>
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Open
                      </Button>
                      {t.status === 'open' ? (
                        <Button
                          type="button"
                          className="font-semibold"
                          disabled={actingId === t.ticketId}
                          onClick={() => markStatus(t.ticketId, 'resolved')}
                        >
                          {actingId === t.ticketId ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Mark resolved
                            </>
                          )}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="font-semibold"
                          disabled={actingId === t.ticketId}
                          onClick={() => markStatus(t.ticketId, 'open')}
                        >
                          Reopen
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Ticket reply
            </DialogTitle>
            <DialogDescription>
              {active ? (
                <span>
                  <span className="font-semibold">{active.subject || '(No subject)'}</span> •{' '}
                  <a className="underline" href={`mailto:${active.email}`}>
                    {active.email}
                  </a>
                </span>
              ) : (
                '—'
              )}
            </DialogDescription>
          </DialogHeader>

          {!active ? (
            <div className="py-8 text-sm text-muted-foreground">No ticket selected.</div>
          ) : (
            <div className="space-y-4">
              <Card className="border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Original message</CardTitle>
                  <CardDescription>
                    {active.ticketId} • {toDateLabel(active.createdAt)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">{active.messagePreview}</CardContent>
              </Card>

              <AIAdminDraft
                ticketId={active.ticketId}
                onDraftChange={(draft) => {
                  // When draft is generated/updated, populate the reply field
                  setReply(draft);
                }}
                disabled={sending}
              />

              <div className="space-y-2">
                <div className="text-sm font-semibold">Reply (emails the user)</div>
                <Textarea value={reply} onChange={(e) => setReply(e.target.value)} className="min-h-[160px]" />
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setDetailOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={sendReply} disabled={sending || !reply.trim()}>
                  {sending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Send reply
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

