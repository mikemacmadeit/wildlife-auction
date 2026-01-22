/**
 * Admin: Notifications Dashboard
 *
 * - View recent events + jobs
 * - Simulate events (test=true) without sending directly
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useAdmin } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ShieldAlert, Rocket, RefreshCw, PlayCircle } from 'lucide-react';
import { listEmailEvents } from '@/lib/email';
import { NOTIFICATION_EVENT_TYPES } from '@/lib/notifications/types';

function prettyJson(v: any): string {
  return JSON.stringify(v, null, 2);
}

export default function AdminNotificationsPage() {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [emailJobs, setEmailJobs] = useState<any[]>([]);
  const [pushJobs, setPushJobs] = useState<any[]>([]);
  const [dlqEvents, setDlqEvents] = useState<any[]>([]);
  const [dlqEmail, setDlqEmail] = useState<any[]>([]);
  const [dlqPush, setDlqPush] = useState<any[]>([]);

  const [eventType, setEventType] = useState<(typeof NOTIFICATION_EVENT_TYPES)[number]>('Auction.Outbid');
  const [targetUserId, setTargetUserId] = useState('');
  const [entityType, setEntityType] = useState<'listing' | 'order' | 'user' | 'message_thread' | 'system'>('listing');
  const [entityId, setEntityId] = useState('');
  const [nonce, setNonce] = useState('');
  const [payloadText, setPayloadText] = useState<string>(() =>
    prettyJson({
      type: 'Auction.Outbid',
      listingId: 'listing_123',
      listingTitle: 'Blackbuck Trophy Buck',
      listingUrl: 'https://wildlife.exchange/listing/listing_123',
      newHighBidAmount: 9850,
    })
  );

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const [eventsRes, emailRes, pushRes, dlqEvRes, dlqEmailRes, dlqPushRes] = await Promise.all([
        fetch('/api/admin/notifications/events?limit=100', { headers: { authorization: `Bearer ${token}` } }),
        fetch('/api/admin/notifications/jobs?kind=email&limit=100', { headers: { authorization: `Bearer ${token}` } }),
        fetch('/api/admin/notifications/jobs?kind=push&limit=100', { headers: { authorization: `Bearer ${token}` } }),
        fetch('/api/admin/notifications/deadletters?kind=event&limit=100', { headers: { authorization: `Bearer ${token}` } }),
        fetch('/api/admin/notifications/deadletters?kind=email&limit=100', { headers: { authorization: `Bearer ${token}` } }),
        fetch('/api/admin/notifications/deadletters?kind=push&limit=100', { headers: { authorization: `Bearer ${token}` } }),
      ]);
      const eventsJson = await eventsRes.json().catch(() => ({}));
      const emailJson = await emailRes.json().catch(() => ({}));
      const pushJson = await pushRes.json().catch(() => ({}));
      const dlqEvJson = await dlqEvRes.json().catch(() => ({}));
      const dlqEmailJson = await dlqEmailRes.json().catch(() => ({}));
      const dlqPushJson = await dlqPushRes.json().catch(() => ({}));
      setEvents(Array.isArray(eventsJson.events) ? eventsJson.events : []);
      setEmailJobs(Array.isArray(emailJson.jobs) ? emailJson.jobs : []);
      setPushJobs(Array.isArray(pushJson.jobs) ? pushJson.jobs : []);
      setDlqEvents(Array.isArray(dlqEvJson.items) ? dlqEvJson.items : []);
      setDlqEmail(Array.isArray(dlqEmailJson.items) ? dlqEmailJson.items : []);
      setDlqPush(Array.isArray(dlqPushJson.items) ? dlqPushJson.items : []);
    } catch (e: any) {
      toast({ title: 'Load failed', description: e?.message || 'Failed to load admin data.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, user]);

  const runProcessorsNow = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/notifications/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ kind: 'all', limit: 50 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        toast({ title: 'Run failed', description: data?.error || 'Failed to run processors.', variant: 'destructive' });
        return;
      }
      toast({
        title: 'Processors ran',
        description: `events: ${data?.events?.processed || 0}/${data?.events?.scanned || 0}, email: ${data?.email?.sent || 0}/${data?.email?.scanned || 0}`,
      });
      await load();
    } catch (e: any) {
      toast({ title: 'Run failed', description: e?.message || 'Failed to run processors.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [load, toast, user]);

  useEffect(() => {
    if (!adminLoading && isAdmin && user) void load();
  }, [adminLoading, isAdmin, user, load]);

  const emitTest = useCallback(async () => {
    if (!user) return;
    let payloadObj: any;
    try {
      payloadObj = JSON.parse(payloadText);
    } catch (e: any) {
      toast({ title: 'Invalid JSON', description: e?.message || 'Fix payload JSON first.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/notifications/emit', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: eventType,
          targetUserId,
          entityType,
          entityId,
          payload: payloadObj,
          nonce: nonce || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        toast({ title: 'Emit failed', description: data?.error || 'Failed to emit event.', variant: 'destructive' });
        return;
      }
      toast({
        title: data.created ? 'Event emitted' : 'Event already existed (deduped)',
        description: `eventId: ${data.eventId}`,
      });
      await load();
    } catch (e: any) {
      toast({ title: 'Emit failed', description: e?.message || 'Failed to emit event.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType, eventType, load, nonce, payloadText, targetUserId, toast, user]);

  const dlqAction = useCallback(
    async (params: { kind: 'event' | 'email' | 'push'; id: string; action: 'retry' | 'suppress' }) => {
      if (!user) return;
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const reason =
          params.action === 'suppress'
            ? window.prompt('Suppress reason (optional):') || undefined
            : undefined;
        const res = await fetch('/api/admin/notifications/deadletters', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ ...params, ...(reason ? { reason } : {}) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          toast({ title: 'Action failed', description: data?.error || 'Failed to update dead letter.', variant: 'destructive' });
          return;
        }
        toast({ title: 'Updated', description: `${params.action} queued for ${params.kind}:${params.id}` });
        await load();
      } catch (e: any) {
        toast({ title: 'Action failed', description: e?.message || 'Failed to update dead letter.', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    },
    [load, toast, user]
  );

  if (!adminLoading && !isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>Admin access required.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Notifications</h1>
            <p className="text-sm text-muted-foreground">
              Inspect the canonical event stream and queued jobs. Simulate events without sending directly.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={runProcessorsNow} disabled={loading || adminLoading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
              Run processors now
            </Button>
            <Button variant="outline" onClick={load} disabled={loading || adminLoading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Refresh
            </Button>
          </div>
        </div>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Rocket className="h-4 w-4 text-primary" />
              Simulate event (test)
            </CardTitle>
            <CardDescription>
              Emits an event into `events/*` with `test=true`. Processors will fan out into in-app + jobs as normal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Event type</div>
                <Select value={eventType} onValueChange={(v) => setEventType(v as any)}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTIFICATION_EVENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Target userId</div>
                <Input value={targetUserId} onChange={(e) => setTargetUserId(e.target.value)} placeholder="uid_..." />
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Entity type</div>
                <Select value={entityType} onValueChange={(v) => setEntityType(v as any)}>
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['listing', 'order', 'user', 'message_thread', 'system'].map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Entity id</div>
                <Input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="listingId / orderId / ..." />
              </div>
              <div className="space-y-2 md:col-span-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nonce (optional)</div>
                <Input value={nonce} onChange={(e) => setNonce(e.target.value)} placeholder="Use to bypass dedupe for repeated tests" />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payload (JSON)</div>
                <Badge variant="secondary" className="font-semibold">
                  Templates previewed separately in Email Templates
                </Badge>
              </div>
              <Textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} className="min-h-[220px] font-mono text-xs" />
            </div>

            <div className="flex justify-end">
              <Button onClick={emitTest} disabled={loading || !targetUserId || !entityId}>
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
                Emit test event
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 overflow-hidden">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>Last 100 events + queued jobs</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Tabs defaultValue="events">
              <div className="px-5 pb-4">
                <TabsList className="grid grid-cols-4 w-full">
                  <TabsTrigger value="events">Events</TabsTrigger>
                  <TabsTrigger value="email">Email jobs</TabsTrigger>
                  <TabsTrigger value="push">Push jobs</TabsTrigger>
                  <TabsTrigger value="deadletters">Dead letters</TabsTrigger>
                </TabsList>
              </div>
              <Separator />
              <TabsContent value="events" className="m-0">
                <div className="divide-y">
                  {events.map((e) => (
                    <div key={e.id} className="p-4 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold break-words">{e.type}</div>
                          <div className="text-xs text-muted-foreground break-words">
                            {e.status} · {e.entityType}:{e.entityId} · {Array.isArray(e.targetUserIds) ? e.targetUserIds.join(',') : ''}
                            {e.test ? ' · test' : ''}
                          </div>
                        </div>
                        <Badge variant={e.status === 'failed' ? 'destructive' : e.status === 'processed' ? 'secondary' : 'outline'}>
                          {e.status}
                        </Badge>
                      </div>
                      {e.processing?.error ? <div className="mt-2 text-xs text-destructive break-words">{String(e.processing.error)}</div> : null}
                    </div>
                  ))}
                  {events.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No events yet.</div> : null}
                </div>
              </TabsContent>
              <TabsContent value="email" className="m-0">
                <div className="divide-y">
                  {emailJobs.map((j) => (
                    <div key={j.id} className="p-4 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold break-words">{j.template}</div>
                          <div className="text-xs text-muted-foreground break-words">
                            {j.status} · eventId:{j.eventId} · userId:{j.userId} {j.test ? ' · test' : ''}
                          </div>
                        </div>
                        <Badge variant={j.status === 'failed' ? 'destructive' : j.status === 'sent' ? 'secondary' : 'outline'}>
                          {j.status}
                        </Badge>
                      </div>
                      {j.error ? <div className="mt-2 text-xs text-destructive break-words">{String(j.error)}</div> : null}
                    </div>
                  ))}
                  {emailJobs.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No email jobs yet.</div> : null}
                </div>
              </TabsContent>
              <TabsContent value="push" className="m-0">
                <div className="divide-y">
                  {pushJobs.map((j) => (
                    <div key={j.id} className="p-4 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold break-words">{j.payload?.title || 'Push'}</div>
                          <div className="text-xs text-muted-foreground break-words">
                            {j.status} · eventId:{j.eventId} · userId:{j.userId} {j.test ? ' · test' : ''}
                          </div>
                        </div>
                        <Badge variant={j.status === 'failed' ? 'destructive' : j.status === 'sent' ? 'secondary' : 'outline'}>
                          {j.status}
                        </Badge>
                      </div>
                      {j.error ? <div className="mt-2 text-xs text-destructive break-words">{String(j.error)}</div> : null}
                    </div>
                  ))}
                  {pushJobs.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No push jobs yet.</div> : null}
                </div>
              </TabsContent>

              <TabsContent value="deadletters" className="m-0">
                <div className="p-4 space-y-6">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Event dead letters</div>
                    <div className="rounded-lg border border-border/60 overflow-hidden divide-y">
                      {dlqEvents.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground">No event dead letters.</div>
                      ) : (
                        dlqEvents.map((d) => (
                          <div key={d.id} className="p-3 text-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-semibold break-words">{d.eventType || d.snapshot?.type || d.id}</div>
                                <div className="text-xs text-muted-foreground break-words">
                                  attempts:{d.attempts ?? d.snapshot?.processing?.attempts ?? '?'} · {d.error?.message || d.snapshot?.processing?.error || ''}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" onClick={() => dlqAction({ kind: 'event', id: d.id, action: 'retry' })}>
                                  Retry
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => dlqAction({ kind: 'event', id: d.id, action: 'suppress' })}>
                                  Suppress
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email job dead letters</div>
                    <div className="rounded-lg border border-border/60 overflow-hidden divide-y">
                      {dlqEmail.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground">No email job dead letters.</div>
                      ) : (
                        dlqEmail.map((d) => (
                          <div key={d.id} className="p-3 text-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-semibold break-words">{d.template || d.id}</div>
                                <div className="text-xs text-muted-foreground break-words">
                                  to:{d.toEmail || ''} · attempts:{d.attempts ?? '?'} · {d.error?.message || ''}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" onClick={() => dlqAction({ kind: 'email', id: d.id, action: 'retry' })}>
                                  Retry
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => dlqAction({ kind: 'email', id: d.id, action: 'suppress' })}>
                                  Suppress
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Push job dead letters</div>
                    <div className="rounded-lg border border-border/60 overflow-hidden divide-y">
                      {dlqPush.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground">No push job dead letters.</div>
                      ) : (
                        dlqPush.map((d) => (
                          <div key={d.id} className="p-3 text-sm">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-semibold break-words">{d.snapshot?.notificationType || 'Push job'}</div>
                                <div className="text-xs text-muted-foreground break-words">
                                  user:{d.userId || ''} · attempts:{d.attempts ?? '?'} · {d.error?.message || ''}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" onClick={() => dlqAction({ kind: 'push', id: d.id, action: 'retry' })}>
                                  Retry
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => dlqAction({ kind: 'push', id: d.id, action: 'suppress' })}>
                                  Suppress
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

