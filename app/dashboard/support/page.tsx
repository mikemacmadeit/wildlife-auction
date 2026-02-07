/**
 * User Support (tickets)
 * - Quick help links, FAQ, create tickets, view/reply to existing tickets
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { formatUserFacingError } from '@/lib/format-user-facing-error';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardContentSkeleton } from '@/components/skeletons/DashboardContentSkeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Loader2,
  LifeBuoy,
  Send,
  MessageSquare,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

const FAQ_ITEMS = [
  { q: 'Where is my order?', a: 'Go to Purchases (Orders) to see status, delivery, and messages. Use the order page to set your delivery address or confirm receipt.', link: '/dashboard/orders', linkLabel: 'View orders' },
  { q: 'How do I get paid as a seller?', a: 'Connect Stripe in Payouts. After the buyer confirms delivery, funds are released to your connected account.', link: '/seller/payouts', linkLabel: 'Payouts' },
  { q: 'How do I verify my listing or account?', a: 'Trust & Compliance explains verification and trust badges. Complete your profile and any required steps in your dashboard.', link: '/trust', linkLabel: 'Trust & compliance' },
  { q: 'I need help with something else', a: 'Create a support ticket below. Include a listing or order ID if your question is about a specific item or transaction. We reply by email.', link: null, linkLabel: null },
] as const;

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
      toast({ title: 'Could not load tickets', description: formatUserFacingError(e, 'Please try again.'), variant: 'destructive' });
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
      toast({ title: 'Could not create ticket', description: formatUserFacingError(e, 'Please try again.'), variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }, [form, loadTickets, toast, user]);

  if (loading) {
    return <DashboardContentSkeleton className="min-h-[300px]" />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6">
        <div className="container mx-auto px-4 py-6 md:py-8 max-w-3xl">
          <Card className="border border-border bg-card shadow-warm">
            <CardContent className="pt-6">
              <div className="font-semibold">Sign in required</div>
              <div className="text-sm text-muted-foreground mt-1">Please sign in to create and manage support tickets.</div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-bottom-nav-safe md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-5xl space-y-8 md:space-y-10">
        {/* Hero */}
        <section className="text-center md:text-left">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 mb-4">
            <LifeBuoy className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-foreground tracking-tight">
            We&apos;re here to help
          </h1>
          <p className="mt-2 text-base sm:text-lg text-muted-foreground max-w-2xl">
            Find answers fast, or contact support with a ticket. We reply by email—usually within a business day.
          </p>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            Before you contact us
          </h2>
          <Card className="border border-border bg-card shadow-warm overflow-hidden">
            <Accordion type="single" collapsible className="w-full">
              {FAQ_ITEMS.map((faq, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="border-b border-border last:border-b-0">
                  <AccordionTrigger className="px-4 sm:px-6 py-4 text-left font-medium hover:no-underline hover:bg-muted/30">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="px-4 sm:px-6 pb-4 text-muted-foreground text-sm">
                    <p className="mb-2">{faq.a}</p>
                    {faq.link && faq.linkLabel && (
                      <Button asChild variant="outline" size="sm" className="mt-2">
                        <Link href={faq.link}>{faq.linkLabel}</Link>
                      </Button>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Card>
        </section>

        {/* Contact support: tabs */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-foreground">Contact support</h2>
            <Button variant="outline" size="sm" onClick={loadTickets} disabled={ticketsLoading} className="min-h-[40px] w-full sm:w-auto">
              {ticketsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {ticketsLoading ? 'Loading…' : 'Refresh tickets'}
            </Button>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as 'new' | 'my')}>
            <TabsList className="w-full sm:w-auto grid grid-cols-2 p-1 h-auto rounded-lg bg-muted/40 border border-border">
              <TabsTrigger value="new" className="rounded-md py-2.5 px-4 font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                New ticket
              </TabsTrigger>
              <TabsTrigger value="my" className="rounded-md py-2.5 px-4 font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                My tickets {tickets.length > 0 ? `(${tickets.length})` : ''}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="new" className="mt-4">
              <Card className="border border-border bg-card shadow-warm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    Create a support ticket
                  </CardTitle>
                  <CardDescription>
                    Describe your issue and, if it&apos;s about a listing or order, add the ID. We&apos;ll reply by email. Don&apos;t share payment details here.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg bg-muted/40 border border-border/60 p-3 sm:p-4 text-sm text-muted-foreground space-y-1">
                    <p><strong className="text-foreground">1.</strong> Summarize the issue in the subject.</p>
                    <p><strong className="text-foreground">2.</strong> Add listing or order ID below if it&apos;s about a specific item or transaction.</p>
                    <p><strong className="text-foreground">3.</strong> We&apos;ll reply to your account email—usually within a business day.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">Subject</label>
                    <Input
                      value={form.subject}
                      onChange={(e) => setForm((p) => ({ ...p, subject: e.target.value }))}
                      className="min-h-[44px]"
                      placeholder="e.g. Question about my order delivery"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-muted-foreground">Listing ID (optional)</label>
                      <Input
                        value={form.listingId}
                        onChange={(e) => setForm((p) => ({ ...p, listingId: e.target.value }))}
                        className="min-h-[44px]"
                        placeholder="e.g. abc123"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-muted-foreground">Order ID (optional)</label>
                      <Input
                        value={form.orderId}
                        onChange={(e) => setForm((p) => ({ ...p, orderId: e.target.value }))}
                        className="min-h-[44px]"
                        placeholder="e.g. order_xyz"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">Message</label>
                    <Textarea
                      value={form.message}
                      onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                      className="min-h-[140px] resize-y"
                      placeholder="Tell us what happened and what you need. At least 10 characters."
                    />
                  </div>
                  <Button
                    className="w-full min-h-[48px] font-semibold"
                    onClick={createTicket}
                    disabled={!canCreate}
                  >
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
                <div className="py-12 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : tickets.length === 0 ? (
                <Card className="border border-border bg-card shadow-warm">
                  <CardContent className="py-12 text-center">
                    <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <div className="font-semibold text-foreground">No tickets yet</div>
                    <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                      Create a new ticket above and we&apos;ll get back to you by email.
                    </p>
                    <Button variant="outline" className="mt-4" onClick={() => setTab('new')}>
                      Create ticket
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {sentTicketId && (
                    <Card className="border-2 border-primary/40 bg-card shadow-warm">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-primary" />
                          Latest: {sentTicketId}
                        </CardTitle>
                        <CardDescription>We&apos;ll reply by email. You can also reply from this page when that&apos;s available.</CardDescription>
                      </CardHeader>
                    </Card>
                  )}

                  {tickets.map((t) => (
                    <Card key={t.ticketId} className="border border-border bg-card shadow-warm transition-shadow hover:shadow-lifted">
                      <CardHeader className="pb-3">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                          <div className="min-w-0">
                            <CardTitle className="text-base font-semibold truncate">{t.subject || '(No subject)'}</CardTitle>
                            <CardDescription className="mt-1 text-xs">
                              {t.ticketId} · {toDateLabel(t.createdAt)}
                            </CardDescription>
                          </div>
                          <Badge
                            variant={t.status === 'resolved' ? 'secondary' : 'default'}
                            className={cn(
                              'w-fit font-medium',
                              t.status === 'resolved' && 'bg-primary/10 text-primary border border-primary/20'
                            )}
                          >
                            {t.status === 'open' ? 'Open' : t.status === 'resolved' ? 'Resolved' : t.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">{t.messagePreview}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {t.listingId && <span>Listing: {t.listingId}</span>}
                          {t.orderId && <span>Order: {t.orderId}</span>}
                          {t.lastPublicReplyAt && <span>Last reply: {toDateLabel(t.lastPublicReplyAt)}</span>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </section>
      </div>
    </div>
  );
}
