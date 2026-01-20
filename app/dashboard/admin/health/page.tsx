/**
 * Admin System Health Page (best-effort, no mock data)
 *
 * This page is intentionally wired to `/api/admin/health` only (server-side probes),
 * so we can catch missing indexes / runtime env issues the same way production will.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, RefreshCw, Activity, AlertTriangle, CheckCircle2, XCircle, Copy } from 'lucide-react';
import { formatDate } from '@/lib/utils';

type HealthStatus = 'OK' | 'WARN' | 'FAIL' | 'DEV';
type HealthCheck = {
  id: string;
  title: string;
  status: HealthStatus;
  message: string;
  details?: Record<string, any>;
  action?: string;
  docs?: string;
};

type AdminHealthResponse = {
  ok: true;
  now: string;
  env: { netlifyRuntime: boolean; nodeEnv: string | null };
  flags: {
    globalCheckoutFreezeEnabled: boolean;
    globalPayoutFreezeEnabled: boolean;
    autoReleaseEnabled: boolean;
  };
  config: {
    firebaseAdmin: { ok: boolean; projectId: string | null };
    rateLimiting: { requireRedisInProdForSensitiveRoutes: boolean; upstashConfigured: boolean; effectiveInNetlify: boolean };
    stripe: { configured: boolean; hasSecretKey: boolean; hasPublishableKey: boolean; hasWebhookSecret: boolean };
    email: { configured: boolean; provider: 'brevo' | 'resend' | 'none' };
    monitoring: { sentryConfigured: boolean };
  };
  opsHealth: {
    autoReleaseProtected: null | {
      lastRunAt: string | null;
      scannedCount: number | null;
      releasedCount: number | null;
      errorsCount: number | null;
      lastError: string | null;
      updatedAt: string | null;
    };
    stripeWebhook: null | {
      lastWebhookAt: string | null;
      lastEventType: string | null;
      lastEventId: string | null;
      updatedAt: string | null;
    };
    aggregateRevenue: null | {
      lastRunAt: string | null;
      processed: number | null;
      durationMs: number | null;
      updatedAt: string | null;
    };
  };
  checks?: HealthCheck[];
};

function statusBadge(s: HealthStatus) {
  const cls =
    s === 'OK'
      ? 'bg-emerald-600 text-white'
      : s === 'WARN'
      ? 'bg-amber-600 text-white'
      : s === 'FAIL'
      ? 'bg-red-600 text-white'
      : 'bg-muted text-foreground';
  return (
    <Badge className={cls} variant="outline">
      {s}
    </Badge>
  );
}

export default function OpsHealthPage() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [runningAutoRelease, setRunningAutoRelease] = useState(false);
  const [adminHealth, setAdminHealth] = useState<AdminHealthResponse | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | HealthStatus>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const loadHealthData = useCallback(async () => {
    if (!user?.uid) return;

    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/health', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok === true) setAdminHealth(json as AdminHealthResponse);
      else setAdminHealth(null);
    } catch (e) {
      console.error('[admin/health] load failed', e);
      setAdminHealth(null);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, [user]);

  const runAutoReleaseNow = useCallback(async () => {
    // This endpoint exists in Netlify; locally it may 404.
    setRunningAutoRelease(true);
    try {
      const res = await fetch('/.netlify/functions/autoReleaseProtected', { method: 'GET' });
      const text = await res.text().catch(() => '');
      if (!res.ok) throw new Error(text || `Failed to invoke auto-release (HTTP ${res.status})`);
      toast({ title: 'Auto-release triggered', description: 'Scheduler run invoked. Refreshing health…' });
      await loadHealthData();
    } catch (error: any) {
      toast({
        title: 'Failed to trigger auto-release',
        description: error?.message || 'This may not be available in local dev. Try in production.',
        variant: 'destructive',
      });
    } finally {
      setRunningAutoRelease(false);
    }
  }, [loadHealthData, toast]);

  useEffect(() => {
    if (!adminLoading && isAdmin && user) {
      void loadHealthData();
    }
  }, [adminLoading, isAdmin, user, loadHealthData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => {
      if (!document.hidden) void loadHealthData();
    }, 30_000);
    return () => clearInterval(t);
  }, [autoRefresh, loadHealthData]);

  const checks = useMemo(() => adminHealth?.checks || [], [adminHealth?.checks]);

  const counts = useMemo(() => {
    const base = { OK: 0, WARN: 0, FAIL: 0, DEV: 0 } as Record<HealthStatus, number>;
    for (const c of checks) base[c.status] = (base[c.status] || 0) + 1;
    return base;
  }, [checks]);

  const filteredChecks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return checks.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${c.title} ${c.message} ${c.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [checks, query, statusFilter]);

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
              <p className="text-muted-foreground">You don't have permission to access this page.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold mb-2">System Health</h1>
          <p className="text-muted-foreground">Live operational checks wired to server-side probes (no mock data).</p>
          <div className="text-xs text-muted-foreground mt-1">
            Last refreshed: {formatDate(lastRefresh)} {adminHealth?.env ? `• Netlify runtime: ${adminHealth.env.netlifyRuntime ? 'yes' : 'no'}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={runAutoReleaseNow} disabled={runningAutoRelease || loading} variant="secondary">
            <Activity className={`h-4 w-4 mr-2 ${runningAutoRelease ? 'animate-spin' : ''}`} />
            Run Auto-Release Now
          </Button>
          <Button onClick={loadHealthData} disabled={loading} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border-2">
              <CardContent className="pt-6 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fail</div>
                  <div className="text-2xl font-extrabold">{counts.FAIL || 0}</div>
                </div>
                <XCircle className="h-6 w-6 text-red-600" />
              </CardContent>
            </Card>
            <Card className="border-2">
              <CardContent className="pt-6 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Warn</div>
                  <div className="text-2xl font-extrabold">{counts.WARN || 0}</div>
                </div>
                <AlertTriangle className="h-6 w-6 text-amber-600" />
              </CardContent>
            </Card>
            <Card className="border-2">
              <CardContent className="pt-6 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">OK</div>
                  <div className="text-2xl font-extrabold">{counts.OK || 0}</div>
                </div>
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </CardContent>
            </Card>
            <Card className="border-2">
              <CardContent className="pt-6 space-y-2">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Auto-refresh</div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm">{autoRefresh ? 'ON (30s)' : 'OFF'}</div>
                  <Button size="sm" variant="outline" onClick={() => setAutoRefresh((v) => !v)}>
                    Toggle
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-2">
            <CardContent className="pt-6 space-y-3">
              <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                <div className="flex-1">
                  <Input placeholder="Search checks…" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant={statusFilter === 'all' ? 'secondary' : 'outline'} onClick={() => setStatusFilter('all')}>
                    All
                  </Button>
                  <Button variant={statusFilter === 'FAIL' ? 'secondary' : 'outline'} onClick={() => setStatusFilter('FAIL')}>
                    Fail
                  </Button>
                  <Button variant={statusFilter === 'WARN' ? 'secondary' : 'outline'} onClick={() => setStatusFilter('WARN')}>
                    Warn
                  </Button>
                  <Button variant={statusFilter === 'OK' ? 'secondary' : 'outline'} onClick={() => setStatusFilter('OK')}>
                    OK
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!adminHealth}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(JSON.stringify(adminHealth || {}, null, 2));
                        toast({ title: 'Copied', description: 'Raw health JSON copied to clipboard.' });
                      } catch {
                        toast({ title: 'Copy failed', description: 'Could not copy to clipboard.', variant: 'destructive' });
                      }
                    }}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy JSON
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {!adminHealth ? (
              <Card className="border-2 border-destructive/30 bg-destructive/5">
                <CardContent className="pt-6 text-sm text-destructive">Health API not available. Try refresh.</CardContent>
              </Card>
            ) : filteredChecks.length === 0 ? (
              <Card className="border-2">
                <CardContent className="pt-6 text-sm text-muted-foreground">No checks match your filters.</CardContent>
              </Card>
            ) : (
              filteredChecks.map((c) => (
                <Card key={c.id} className="border-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{c.title}</CardTitle>
                        <CardDescription className="mt-1">{c.message}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        {statusBadge(c.status)}
                        <Button size="sm" variant="outline" onClick={() => setExpanded((m) => ({ ...m, [c.id]: !m[c.id] }))}>
                          {expanded[c.id] ? 'Hide' : 'Details'}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  {expanded[c.id] ? (
                    <CardContent className="space-y-3">
                      {c.action ? (
                        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                          <div className="font-semibold">Next action</div>
                          <div className="text-muted-foreground mt-1">{c.action}</div>
                        </div>
                      ) : null}
                      {c.docs ? (
                        <div className="text-sm">
                          Docs:{' '}
                          <a className="text-primary hover:underline" href={c.docs} target="_blank" rel="noreferrer">
                            {c.docs}
                          </a>
                        </div>
                      ) : null}
                      {c.details ? (
                        <pre className="text-xs rounded-lg border bg-muted/20 p-3 overflow-auto">{JSON.stringify(c.details, null, 2)}</pre>
                      ) : (
                        <div className="text-xs text-muted-foreground">No additional details.</div>
                      )}
                    </CardContent>
                  ) : null}
                </Card>
              ))
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Quick Links</CardTitle>
              <CardDescription>Jump to related admin tools.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link href="/dashboard/admin/ops">
                  <Button variant="outline" className="w-full justify-start">
                    Admin Ops Dashboard
                  </Button>
                </Link>
                <Link href="/dashboard/admin/reconciliation">
                  <Button variant="outline" className="w-full justify-start">
                    Reconciliation
                  </Button>
                </Link>
                <Link href="/dashboard/admin/support">
                  <Button variant="outline" className="w-full justify-start">
                    Support
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
