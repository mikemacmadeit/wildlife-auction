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
import { Loader2, Mail, CheckCircle2, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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
          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : tickets.length === 0 ? (
            <Card className="border-2">
              <CardContent className="py-10 text-center">
                <div className="font-extrabold">No tickets</div>
                <div className="text-sm text-muted-foreground mt-1">Nothing in this queue right now.</div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {tickets.map((t) => (
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
                      <Button asChild variant="outline" className="font-semibold">
                        <Link href={`/contact`}>View contact page <ArrowRight className="h-4 w-4 ml-2" /></Link>
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
    </div>
  );
}

