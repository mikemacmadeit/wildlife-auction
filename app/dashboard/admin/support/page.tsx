/**
 * Admin Support Inbox (Enhanced)
 * - Shows all support tickets with advanced filtering, sorting, and priority management
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Loader2,
  Mail,
  CheckCircle2,
  Search,
  MessageSquare,
  Send,
  Filter,
  ArrowUpDown,
  UserPlus,
  AlertCircle,
  Clock,
  FileText,
  X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { AIAdminDraft } from '@/components/admin/AIAdminDraft';

type TicketRow = {
  ticketId: string;
  status: 'open' | 'resolved' | string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  category?: string;
  source: string;
  name: string;
  email: string;
  subject: string;
  messagePreview: string;
  userId: string | null;
  listingId: string | null;
  orderId: string | null;
  assignedTo?: string | null;
  createdAt: string | Date | null;
  updatedAt: string | Date | null;
};

type TicketDetail = {
  ticket: {
    ticketId: string;
    status: 'open' | 'resolved';
    priority: 'low' | 'normal' | 'high' | 'urgent';
    category: string;
    source: string;
    name: string;
    email: string;
    subject: string;
    message: string;
    userId: string | null;
    listingId: string | null;
    orderId: string | null;
    assignedTo: string | null;
    assignedAdmin: { uid: string; displayName: string | null; email: string | null } | null;
    adminNote: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    lastPublicReplyAt: string | null;
    adminLastRepliedAt: string | null;
    adminLastRepliedBy: string | null;
    resolvedAt: string | null;
    resolvedBy: string | null;
  };
  messages: Array<{
    id: string;
    kind: 'user' | 'admin';
    by: string | null;
    body: string;
    createdAt: string | null;
  }>;
};

function toDateLabel(v: any): string {
  const d = v instanceof Date ? v : v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function getPriorityColor(priority?: string): string {
  switch (priority) {
    case 'urgent':
      return 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20';
    case 'high':
      return 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20';
    case 'low':
      return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
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
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [assignedFilter, setAssignedFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');

  const [detailOpen, setDetailOpen] = useState(false);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [ticketDetail, setTicketDetail] = useState<TicketDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [updatingTicket, setUpdatingTicket] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({
        status: tab,
        limit: '100',
        sortBy,
      });
      if (priorityFilter !== 'all') params.append('priority', priorityFilter);
      if (categoryFilter !== 'all') params.append('category', categoryFilter);
      if (assignedFilter === 'me') params.append('assignedTo', 'me');
      else if (assignedFilter === 'unassigned') params.append('assignedTo', 'unassigned');

      const res = await fetch(`/api/admin/support/tickets?${params.toString()}`, {
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
  }, [tab, priorityFilter, categoryFilter, assignedFilter, sortBy, toast, user]);

  useEffect(() => {
    if (!adminLoading && isAdmin && user) void load();
  }, [adminLoading, isAdmin, user, load]);

  const loadTicketDetail = useCallback(
    async (ticketId: string) => {
      if (!user || !ticketId) return;
      setLoadingDetail(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/support/tickets/${encodeURIComponent(ticketId)}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body?.ok !== true) throw new Error(body?.error || body?.message || 'Failed to load ticket');
        setTicketDetail(body);
        setAdminNote(body.ticket?.adminNote || '');
      } catch (e: any) {
        toast({ title: 'Failed to load ticket', description: e?.message || 'Please try again.', variant: 'destructive' });
      } finally {
        setLoadingDetail(false);
      }
    },
    [toast, user]
  );

  const openTicket = useCallback(
    (t: TicketRow) => {
      setActiveTicketId(t.ticketId);
      setReply('');
      setDetailOpen(true);
      void loadTicketDetail(t.ticketId);
    },
    [loadTicketDetail]
  );

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
        if (activeTicketId === ticketId) {
          await loadTicketDetail(ticketId);
        }
      } catch (e: any) {
        toast({ title: 'Update failed', description: e?.message || 'Please try again.', variant: 'destructive' });
      } finally {
        setActingId(null);
      }
    },
    [activeTicketId, load, loadTicketDetail, toast, user]
  );

  const updateTicket = useCallback(
    async (updates: { priority?: string; assignedTo?: string | null; adminNote?: string }) => {
      if (!user || !activeTicketId) return;
      setUpdatingTicket(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/support/tickets/${encodeURIComponent(activeTicketId)}/update`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify(updates),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body?.ok !== true) throw new Error(body?.error || body?.message || 'Failed to update');
        toast({ title: 'Updated', description: 'Ticket updated successfully.' });
        await loadTicketDetail(activeTicketId);
        await load();
      } catch (e: any) {
        toast({ title: 'Update failed', description: e?.message || 'Please try again.', variant: 'destructive' });
      } finally {
        setUpdatingTicket(false);
      }
    },
    [activeTicketId, load, loadTicketDetail, toast, user]
  );

  const assignToMe = useCallback(() => {
    if (!user?.uid) return;
    updateTicket({ assignedTo: user.uid });
  }, [updateTicket, user?.uid]);

  const sendReply = useCallback(async () => {
    if (!user || !activeTicketId) return;
    if (!reply.trim()) return;
    setSending(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/support/tickets/${encodeURIComponent(activeTicketId)}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: reply.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok !== true) throw new Error(body?.error || body?.message || 'Failed to send');
      toast({ title: 'Reply sent', description: body?.emailed ? 'Emailed user successfully.' : 'Saved reply, but email failed.' });
      setReply('');
      await loadTicketDetail(activeTicketId);
      await load();
    } catch (e: any) {
      toast({ title: 'Send failed', description: e?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }, [activeTicketId, load, loadTicketDetail, reply, toast, user]);

  const counts = useMemo(() => {
    const open = tickets.filter((t) => t.status === 'open').length;
    const resolved = tickets.filter((t) => t.status === 'resolved').length;
    return { open, resolved };
  }, [tickets]);

  const filtered = useMemo(() => {
    let result = tickets;
    const query = q.trim().toLowerCase();
    if (query) {
      result = result.filter((t) => {
        return (
          String(t.ticketId || '').toLowerCase().includes(query) ||
          String(t.subject || '').toLowerCase().includes(query) ||
          String(t.email || '').toLowerCase().includes(query) ||
          String(t.userId || '').toLowerCase().includes(query) ||
          String(t.listingId || '').toLowerCase().includes(query) ||
          String(t.orderId || '').toLowerCase().includes(query)
        );
      });
    }
    return result;
  }, [q, tickets]);

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
            <div className="text-sm text-muted-foreground mt-1">You don't have access to Support.</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <h1 className="text-3xl font-extrabold">Support</h1>
          </div>
          <p className="text-muted-foreground mt-1">Manage support tickets with advanced filtering and priority management.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading} className="min-h-[44px] font-semibold">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="open" className="font-semibold">
            Open ({counts.open})
          </TabsTrigger>
          <TabsTrigger value="resolved" className="font-semibold">
            Resolved ({counts.resolved})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          <Card className="border-2 mb-4">
            <CardContent className="pt-6 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search tickets by email, subject, ticketId, userId, listingId, orderId…"
                  className="pl-10"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    <Filter className="h-3 w-3" />
                    Priority
                  </div>
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priorities</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    <Filter className="h-3 w-3" />
                    Category
                  </div>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="orders">Orders</SelectItem>
                      <SelectItem value="payments">Payments</SelectItem>
                      <SelectItem value="listings">Listings</SelectItem>
                      <SelectItem value="offers">Offers</SelectItem>
                      <SelectItem value="messages">Messages</SelectItem>
                      <SelectItem value="compliance">Compliance</SelectItem>
                      <SelectItem value="technical">Technical</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    <Filter className="h-3 w-3" />
                    Assignment
                  </div>
                  <Select value={assignedFilter} onValueChange={setAssignedFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tickets</SelectItem>
                      <SelectItem value="me">Assigned to Me</SelectItem>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                    <ArrowUpDown className="h-3 w-3" />
                    Sort By
                  </div>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest First</SelectItem>
                      <SelectItem value="oldest">Oldest First</SelectItem>
                      <SelectItem value="updated">Last Updated</SelectItem>
                      <SelectItem value="priority">Priority</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-lg font-extrabold truncate">{t.subject || '(No subject)'}</CardTitle>
                          {t.priority && t.priority !== 'normal' && (
                            <Badge variant="outline" className={`text-xs font-semibold ${getPriorityColor(t.priority)}`}>
                              {t.priority}
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="mt-1">
                          {t.name} • <a className="underline" href={`mailto:${t.email}`}>{t.email}</a> • {toDateLabel(t.createdAt)}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={t.status === 'resolved' ? 'secondary' : 'default'} className="font-semibold">
                          {t.status}
                        </Badge>
                        {t.category && t.category !== 'other' && (
                          <Badge variant="outline" className="text-xs">
                            {t.category}
                          </Badge>
                        )}
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
                      {t.listingId ? (
                        <span>
                          Listing: <Link className="underline" href={`/dashboard/admin/listings?q=${t.listingId}`}>{t.listingId}</Link>
                        </span>
                      ) : null}
                      {t.orderId ? (
                        <span>
                          Order: <Link className="underline" href={`/dashboard/admin/orders?q=${t.orderId}`}>{t.orderId}</Link>
                        </span>
                      ) : null}
                      {t.assignedTo && (
                        <span className="text-xs">
                          <UserPlus className="h-3 w-3 inline mr-1" />
                          Assigned
                        </span>
                      )}
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

      <Dialog open={detailOpen} onOpenChange={setDetailOpen} onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Ticket Details
            </DialogTitle>
            <DialogDescription>
              {ticketDetail ? (
                <span>
                  <span className="font-semibold">{ticketDetail.ticket.subject || '(No subject)'}</span> •{' '}
                  <a className="underline" href={`mailto:${ticketDetail.ticket.email}`}>
                    {ticketDetail.ticket.email}
                  </a>
                </span>
              ) : (
                '—'
              )}
            </DialogDescription>
          </DialogHeader>

          {loadingDetail ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !ticketDetail ? (
            <div className="py-8 text-sm text-muted-foreground">No ticket selected.</div>
          ) : (
            <div className="space-y-4">
              {/* Ticket Header Info */}
              <Card className="border">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <CardTitle className="text-base">Ticket Information</CardTitle>
                      <CardDescription className="mt-1">
                        {ticketDetail.ticket.ticketId} • Created {toDateLabel(ticketDetail.ticket.createdAt)} • Updated{' '}
                        {toDateLabel(ticketDetail.ticket.updatedAt)}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={ticketDetail.ticket.status === 'resolved' ? 'secondary' : 'default'} className="font-semibold">
                        {ticketDetail.ticket.status}
                      </Badge>
                      {ticketDetail.ticket.priority && ticketDetail.ticket.priority !== 'normal' && (
                        <Badge variant="outline" className={`text-xs font-semibold ${getPriorityColor(ticketDetail.ticket.priority)}`}>
                          {ticketDetail.ticket.priority}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="font-semibold text-muted-foreground">Category</div>
                      <div>{ticketDetail.ticket.category || 'other'}</div>
                    </div>
                    <div>
                      <div className="font-semibold text-muted-foreground">Assigned To</div>
                      <div>
                        {ticketDetail.ticket.assignedAdmin ? (
                          <span>
                            {ticketDetail.ticket.assignedAdmin.displayName || ticketDetail.ticket.assignedAdmin.email || ticketDetail.ticket.assignedTo}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {(ticketDetail.ticket.listingId || ticketDetail.ticket.orderId || ticketDetail.ticket.userId) && (
                    <div className="pt-2 border-t border-border/50">
                      <div className="text-xs font-semibold text-muted-foreground mb-2">Related Links</div>
                      <div className="flex items-center gap-3 flex-wrap">
                        {ticketDetail.ticket.userId && (
                          <Link
                            href={`/dashboard/admin/users/${ticketDetail.ticket.userId}`}
                            className="text-xs underline text-primary hover:opacity-80"
                          >
                            View User: {ticketDetail.ticket.userId}
                          </Link>
                        )}
                        {ticketDetail.ticket.listingId && (
                          <Link
                            href={`/dashboard/admin/listings?q=${ticketDetail.ticket.listingId}`}
                            className="text-xs underline text-primary hover:opacity-80"
                          >
                            View Listing: {ticketDetail.ticket.listingId}
                          </Link>
                        )}
                        {ticketDetail.ticket.orderId && (
                          <Link
                            href={`/dashboard/admin/orders?q=${ticketDetail.ticket.orderId}`}
                            className="text-xs underline text-primary hover:opacity-80"
                          >
                            View Order: {ticketDetail.ticket.orderId}
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card className="border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Select
                      value={ticketDetail.ticket.priority || 'normal'}
                      onValueChange={(v) => updateTicket({ priority: v })}
                      disabled={updatingTicket}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low Priority</SelectItem>
                        <SelectItem value="normal">Normal Priority</SelectItem>
                        <SelectItem value="high">High Priority</SelectItem>
                        <SelectItem value="urgent">Urgent Priority</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" onClick={assignToMe} disabled={updatingTicket || ticketDetail.ticket.assignedTo === user?.uid}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      {ticketDetail.ticket.assignedTo === user?.uid ? 'Assigned to Me' : 'Assign to Me'}
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={ticketDetail.ticket.status === 'open' ? 'default' : 'outline'}
                      onClick={() => markStatus(ticketDetail.ticket.ticketId, 'open')}
                      disabled={actingId === ticketDetail.ticket.ticketId || ticketDetail.ticket.status === 'open'}
                      className="flex-1"
                    >
                      {ticketDetail.ticket.status === 'open' ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Open
                        </>
                      ) : (
                        'Reopen'
                      )}
                    </Button>
                    <Button
                      variant={ticketDetail.ticket.status === 'resolved' ? 'default' : 'outline'}
                      onClick={() => markStatus(ticketDetail.ticket.ticketId, 'resolved')}
                      disabled={actingId === ticketDetail.ticket.ticketId || ticketDetail.ticket.status === 'resolved'}
                      className="flex-1"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Mark Resolved
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Message Thread */}
              <Card className="border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Message Thread</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {ticketDetail.messages.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4">No messages yet.</div>
                  ) : (
                    ticketDetail.messages.map((msg) => (
                      <div key={msg.id} className="space-y-2 pb-4 border-b border-border/50 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant={msg.kind === 'admin' ? 'default' : 'secondary'} className="text-xs">
                              {msg.kind === 'admin' ? 'Admin' : 'User'}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{toDateLabel(msg.createdAt)}</span>
                          </div>
                        </div>
                        <div className="text-sm whitespace-pre-wrap">{msg.body}</div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Admin Notes (Internal) */}
              <Card className="border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Internal Admin Notes</CardTitle>
                  <CardDescription>These notes are only visible to admins and are not sent to users.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Textarea
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    placeholder="Add internal notes about this ticket..."
                    className="min-h-[100px]"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateTicket({ adminNote })}
                    disabled={updatingTicket || adminNote === (ticketDetail.ticket.adminNote || '')}
                  >
                    {updatingTicket ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Notes'}
                  </Button>
                </CardContent>
              </Card>

              {/* Reply Section */}
              <Card className="border">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Reply to User</CardTitle>
                  <CardDescription>Your reply will be emailed to the user.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <AIAdminDraft
                    ticketId={ticketDetail.ticket.ticketId}
                    existingDraft={null}
                    existingGeneratedAt={null}
                    existingModel={null}
                    onDraftChange={(draft) => {
                      setReply(draft);
                    }}
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
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
