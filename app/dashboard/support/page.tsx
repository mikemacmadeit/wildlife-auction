/**
 * User Support (tickets)
 * - Create tickets (in-app)
 * - View/reply to existing tickets
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/page-loader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, LifeBuoy, Send, MessageSquare } from 'lucide-react';

type TicketRow = {
  ticketId: string;
  status: 'open' | 'resolved' | string;
  subject: string;
  messagePreview: string;
  listingId: string | null;
  orderId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastPublicReplyAt?: string | null;
};

function toDateLabel(v: any): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function SupportPage() {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const sp = useSearchParams();

  const [tab, setTab] = useState<'new' | 'my'>('new');
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    subject: '',
    message: '',
    listingId: '',
    orderId: '',
  });
  const [sentTicketId, setSentTicketId] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    if (!user) return;
    setTicketsLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/support/tickets?status=all&limit=50`, { headers: { authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok !== true) throw new Error(body?.error || body?.message || 'Failed to load tickets');
      setTickets(Array.isArray(body?.tickets) ? body.tickets : []);
    } catch (e: any) {
      toast({ title: 'Could not load tickets', description: e?.message || 'Please try again.', variant: 'destructive' });
      setTickets([]);
    } finally {
      setTicketsLoading(false);
    }
  }, [toast, user]);

  useEffect(() => {
    if (!loading && user) void loadTickets();
  }, [loading, user, loadTickets]);

  useEffect(() => {
    const ticketId = sp?.get('ticketId');
    if (ticketId) {
      setTab('my');
      setSentTicketId(ticketId);
    }
  }, [sp]);

  const canCreate = useMemo(() => {
    return !!user && form.subject.trim().length > 0 && form.message.trim().length >= 10 && !creating;
  }, [creating, form.message, form.subject, user]);

  const createTicket = useCallback(async () => {
    if (!user) return;
    setCreating(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          subject: form.subject.trim(),
          message: form.message.trim(),
          listingId: form.listingId.trim() ? form.listingId.trim() : undefined,
          orderId: form.orderId.trim() ? form.orderId.trim() : undefined,
          category: 'other',
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok !== true) throw new Error(body?.error || body?.message || 'Failed to create ticket');
      setSentTicketId(body.ticketId || null);
      toast({ title: 'Ticket created', description: 'Support has received your request.' });
      setForm({ subject: '', message: '', listingId: '', orderId: '' });
      setTab('my');
      await loadTickets();
    } catch (e: any) {
      toast({ title: 'Could not create ticket', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }, [form, loadTickets, toast, user]);

  if (loading) {
    return (
      <PageLoader title="Loading support…" subtitle="Getting help resources ready." className="min-h-[300px]" />
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Card>
          <CardContent className="pt-6">
            <div className="font-semibold">Sign in required</div>
            <div className="text-sm text-muted-foreground mt-1">Please sign in to create and manage support tickets.</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-5 w-5 text-primary" />
            <h1 className="text-3xl font-extrabold">Support</h1>
          </div>
          <p className="text-muted-foreground mt-1">Create a ticket or track your existing requests.</p>
        </div>
        <Button variant="outline" onClick={loadTickets} disabled={ticketsLoading} className="min-h-[44px] font-semibold">
          {ticketsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="new" className="font-semibold">
            New ticket
          </TabsTrigger>
          <TabsTrigger value="my" className="font-semibold">
            My tickets
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-4">
          <Card className="border-2">
            <CardHeader>
              <CardTitle>Create a support ticket</CardTitle>
              <CardDescription>
                Include a Listing ID / Order ID if this is about a specific transaction. Do not share off-platform payment details.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-semibold">Subject</div>
                <Input value={form.subject} onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))} className="min-h-[48px]" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Listing ID (optional)</div>
                  <Input value={form.listingId} onChange={(e) => setForm((p) => ({ ...p, listingId: e.target.value }))} className="min-h-[48px]" />
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Order ID (optional)</div>
                  <Input value={form.orderId} onChange={(e) => setForm((p) => ({ ...p, orderId: e.target.value }))} className="min-h-[48px]" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-semibold">Message</div>
                <Textarea
                  value={form.message}
                  onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                  className="min-h-[160px]"
                  placeholder="Tell us what happened and what you need."
                />
              </div>
              <Button className="w-full min-h-[48px] font-semibold" onClick={createTicket} disabled={!canCreate}>
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Create ticket
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="my" className="mt-4">
          {ticketsLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tickets.length === 0 ? (
            <Card className="border-2">
              <CardContent className="py-10 text-center">
                <div className="font-extrabold">No tickets yet</div>
                <div className="text-sm text-muted-foreground mt-1">Create a new ticket and we’ll help you out.</div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {sentTicketId ? (
                <Card className="border-2 border-primary/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-extrabold flex items-center gap-2">
                      <MessageSquare className="h-5 w-5 text-primary" />
                      Latest ticket: {sentTicketId}
                    </CardTitle>
                    <CardDescription>Support will reply by email. You can also reply from this page soon.</CardDescription>
                  </CardHeader>
                </Card>
              ) : null}

              {tickets.map((t) => (
                <Card key={t.ticketId} className="border-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <CardTitle className="text-lg font-extrabold truncate">{t.subject || '(No subject)'}</CardTitle>
                        <CardDescription className="mt-1">
                          {t.ticketId} • {toDateLabel(t.createdAt)}
                        </CardDescription>
                      </div>
                      <Badge variant={t.status === 'resolved' ? 'secondary' : 'default'} className="font-semibold">
                        {t.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">{t.messagePreview}</div>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                      {t.listingId ? <span>Listing: {t.listingId}</span> : null}
                      {t.orderId ? <span>Order: {t.orderId}</span> : null}
                      {t.lastPublicReplyAt ? <span>Last reply: {toDateLabel(t.lastPublicReplyAt)}</span> : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}

