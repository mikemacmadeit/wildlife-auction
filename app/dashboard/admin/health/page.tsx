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
import { PageLoader } from '@/components/ui/page-loader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Copy, ExternalLink, Shield } from 'lucide-react';
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
  dashboardUrl?: string;
  category?: 'connectivity' | 'monitoring' | 'payments' | 'jobs' | 'indexes' | 'flags';
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

  const keyServiceIds = ['firebase_firestore', 'upstash_redis', 'monitoring_sentry', 'stripe_api'] as const;
  const keyServices = useMemo(() => {
    const list: HealthCheck[] = [];
    for (const id of keyServiceIds) {
      const fromCheck = checks.find((c) => c.id === id);
      if (fromCheck) {
        list.push(fromCheck);
        continue;
      }
      // Fallback from config so Redis and Sentry always appear even if checks missed
      if (id === 'upstash_redis' && adminHealth?.config?.rateLimiting) {
        const r = adminHealth.config.rateLimiting;
        list.push({
          id: 'upstash_redis',
          title: 'Upstash Redis (rate limiting)',
          status: r.upstashConfigured ? (r.effectiveInNetlify ? 'OK' : 'WARN') : 'FAIL',
          message: r.upstashConfigured
            ? (r.effectiveInNetlify ? 'Redis configured and effective.' : 'Redis configured; not effective in this runtime.')
            : 'Upstash not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
          category: 'monitoring',
          dashboardUrl: 'https://console.upstash.com',
        });
        continue;
      }
      if (id === 'monitoring_sentry' && adminHealth?.config?.monitoring) {
        const s = adminHealth.config.monitoring;
        list.push({
          id: 'monitoring_sentry',
          title: 'Monitoring (Sentry)',
          status: s.sentryConfigured ? 'OK' : 'WARN',
          message: s.sentryConfigured ? 'Sentry DSN is set.' : 'Sentry DSN is not set.',
          category: 'monitoring',
          dashboardUrl: 'https://sentry.io',
        });
        continue;
      }
      if (id === 'firebase_firestore' && adminHealth?.config?.firebaseAdmin) {
        const f = adminHealth.config.firebaseAdmin;
        list.push({
          id: 'firebase_firestore',
          title: 'Firestore connectivity (Admin)',
          status: f.ok ? 'OK' : 'FAIL',
          message: f.ok ? 'Firestore Admin SDK available.' : 'Firebase Admin not configured.',
          category: 'connectivity',
        });
        continue;
      }
      if (id === 'stripe_api' && adminHealth?.config?.stripe) {
        const st = adminHealth.config.stripe;
        list.push({
          id: 'stripe_api',
          title: 'Stripe API connectivity',
          status: st.configured ? 'OK' : 'FAIL',
          message: st.configured ? 'Stripe configured.' : 'Stripe keys or webhook secret missing.',
          category: 'payments',
          dashboardUrl: 'https://dashboard.stripe.com',
        });
      }
    }
    return list;
  }, [checks, adminHealth?.config]);

  const categoryOrder: (HealthCheck['category'])[] = ['connectivity', 'monitoring', 'payments', 'jobs', 'indexes', 'flags'];
  const checksByCategory = useMemo(() => {
    const map = new Map<HealthCheck['category'], HealthCheck[]>();
    for (const c of filteredChecks) {
      const cat = c.category || 'connectivity';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(c);
    }
    return categoryOrder.map((cat) => ({ category: cat, checks: map.get(cat) || [] })).filter((g) => g.checks.length > 0);
  }, [filteredChecks]);
  const categoryLabels: Record<string, string> = {
    connectivity: 'Connectivity & storage',
    monitoring: 'Rate limiting & monitoring',
    payments: 'Payments (Stripe)',
    jobs: 'Scheduled jobs',
    indexes: 'Firestore indexes',
    flags: 'Emergency flags',
  };

  if (adminLoading) {
    return (
      <PageLoader title="Loading…" subtitle="Getting things ready." minHeight="screen" />
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-3 sm:px-4 py-4 md:py-8 pb-20 md:pb-6">
        <Card className="rounded-xl border border-border/60 bg-card">
          <CardContent className="pt-6 px-4 sm:px-6">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl md:text-2xl font-bold mb-2">Access Denied</h2>
              <p className="text-muted-foreground text-sm md:text-base">You don't have permission to access this page.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-3 sm:px-4 py-4 md:py-8 max-w-5xl space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold mb-1 md:mb-2">System Health</h1>
            <p className="text-sm md:text-base text-muted-foreground">Live operational checks (server-side probes, no mock data).</p>
            <div className="text-xs text-muted-foreground mt-1">
              Last refreshed: {formatDate(lastRefresh)} {adminHealth?.env ? `• Netlify: ${adminHealth.env.netlifyRuntime ? 'yes' : 'no'}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <Button onClick={loadHealthData} disabled={loading} variant="outline" className="h-9 px-3 md:h-10 md:px-4">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 md:py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* One-line status summary for quick tracking */}
          {(counts.FAIL > 0 || counts.WARN > 0) && adminHealth && (
            <div className={counts.FAIL > 0 ? 'rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm' : 'rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm'}>
              <span className="font-semibold text-foreground">
                {counts.FAIL > 0 && `${counts.FAIL} failing`}
                {counts.FAIL > 0 && counts.WARN > 0 && ' • '}
                {counts.WARN > 0 && `${counts.WARN} warning${counts.WARN !== 1 ? 's' : ''}`}
              </span>
              <span className="text-muted-foreground"> — filter or scroll to review checks below.</span>
            </div>
          )}

          {/* Key services at-a-glance: Redis, Sentry, Stripe, Firestore */}
          {keyServices.length > 0 && (
            <Card className="rounded-xl border-2 border-border/60 bg-card">
              <CardHeader className="pb-2 px-3 sm:px-6 pt-4 md:pt-6">
                <CardTitle className="text-base md:text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Key services
                </CardTitle>
                <CardDescription className="text-xs md:text-sm">
                  Redis (rate limiting), Sentry (errors), Stripe, Firestore — status and quick links.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-4 md:pb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                  {keyServices.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-lg border border-border/60 bg-muted/20 p-3 md:p-4 flex flex-col gap-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold truncate">{c.title.replace(/ \(.*\)$/, '')}</span>
                        {statusBadge(c.status)}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{c.message}</p>
                      {c.dashboardUrl && (
                        <a
                          href={c.dashboardUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1 mt-auto"
                        >
                          Open dashboard
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
            <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
              <CardContent className="pt-4 pb-4 md:pt-6 flex items-center justify-between px-3 md:px-6">
                <div>
                  <div className="text-[10px] md:text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fail</div>
                  <div className="text-xl md:text-2xl font-extrabold">{counts.FAIL || 0}</div>
                </div>
                <XCircle className="h-5 w-5 md:h-6 md:w-6 text-red-600 shrink-0" />
              </CardContent>
            </Card>
            <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
              <CardContent className="pt-4 pb-4 md:pt-6 flex items-center justify-between px-3 md:px-6">
                <div>
                  <div className="text-[10px] md:text-xs font-semibold text-muted-foreground uppercase tracking-wide">Warn</div>
                  <div className="text-xl md:text-2xl font-extrabold">{counts.WARN || 0}</div>
                </div>
                <AlertTriangle className="h-5 w-5 md:h-6 md:w-6 text-amber-600 shrink-0" />
              </CardContent>
            </Card>
            <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
              <CardContent className="pt-4 pb-4 md:pt-6 flex items-center justify-between px-3 md:px-6">
                <div>
                  <div className="text-[10px] md:text-xs font-semibold text-muted-foreground uppercase tracking-wide">OK</div>
                  <div className="text-xl md:text-2xl font-extrabold">{counts.OK || 0}</div>
                </div>
                <CheckCircle2 className="h-5 w-5 md:h-6 md:w-6 text-emerald-600 shrink-0" />
              </CardContent>
            </Card>
            <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
              <CardContent className="pt-4 pb-4 md:pt-6 px-3 md:px-6">
                <div className="text-[10px] md:text-xs font-semibold text-muted-foreground uppercase tracking-wide">Auto-refresh</div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-xs md:text-sm">{autoRefresh ? 'ON (30s)' : 'OFF'}</span>
                  <Button size="sm" variant="outline" onClick={() => setAutoRefresh((v) => !v)} className="min-h-[32px]">
                    Toggle
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
            <CardHeader className="pb-2 px-3 sm:px-6 pt-4 md:pt-6">
              <CardTitle className="text-base md:text-lg">Checks</CardTitle>
              <CardDescription className="text-xs md:text-sm">Filter and search health checks. Copy raw JSON for debugging.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 px-3 sm:px-6 pb-4 md:pb-6">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:items-center">
                <div className="flex-1 min-w-0">
                  <Input placeholder="Search checks…" value={query} onChange={(e) => setQuery(e.target.value)} className="min-h-[40px] text-base" />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button variant={statusFilter === 'all' ? 'secondary' : 'outline'} size="sm" className="min-h-[36px]" onClick={() => setStatusFilter('all')}>
                    All
                  </Button>
                  <Button variant={statusFilter === 'FAIL' ? 'secondary' : 'outline'} size="sm" className="min-h-[36px]" onClick={() => setStatusFilter('FAIL')}>
                    Fail
                  </Button>
                  <Button variant={statusFilter === 'WARN' ? 'secondary' : 'outline'} size="sm" className="min-h-[36px]" onClick={() => setStatusFilter('WARN')}>
                    Warn
                  </Button>
                  <Button variant={statusFilter === 'OK' ? 'secondary' : 'outline'} size="sm" className="min-h-[36px]" onClick={() => setStatusFilter('OK')}>
                    OK
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[36px] shrink-0"
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
                    <Copy className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Copy JSON</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6 md:space-y-8">
            {!adminHealth ? (
              <Card className="rounded-xl border border-destructive/30 bg-destructive/5">
                <CardContent className="pt-4 pb-4 px-3 sm:px-6 text-sm text-destructive">Health API not available. Try refresh.</CardContent>
              </Card>
            ) : filteredChecks.length === 0 ? (
              <Card className="rounded-xl border border-border/60">
                <CardContent className="pt-4 pb-4 px-3 sm:px-6 text-sm text-muted-foreground">No checks match your filters.</CardContent>
              </Card>
            ) : (
              checksByCategory.map(({ category, checks: groupChecks }) => (
                <div key={category}>
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 md:mb-4">
                    {category != null ? (categoryLabels[category] || category) : 'Other'}
                  </h2>
                  <div className="space-y-2 md:space-y-3">
                    {groupChecks.map((c) => (
                <Card key={c.id} className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
                  <CardHeader className="pb-2 px-3 sm:px-6 pt-4 md:pt-6">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-3">
                      <div className="min-w-0">
                        <CardTitle className="text-sm md:text-base break-words">{c.title}</CardTitle>
                        <CardDescription className="mt-1 text-xs md:text-sm break-words">{c.message}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {statusBadge(c.status)}
                        <Button size="sm" variant="outline" className="min-h-[36px]" onClick={() => setExpanded((m) => ({ ...m, [c.id]: !m[c.id] }))}>
                          {expanded[c.id] ? 'Hide' : 'Details'}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  {expanded[c.id] ? (
                    <CardContent className="space-y-3 px-3 sm:px-6 pb-4 md:pb-6">
                      {c.action ? (
                        <div className="rounded-lg border bg-muted/20 p-2.5 md:p-3 text-xs md:text-sm">
                          <div className="font-semibold">Next action</div>
                          <div className="text-muted-foreground mt-1 break-words">{c.action}</div>
                        </div>
                      ) : null}
                      {c.dashboardUrl ? (
                        <div className="text-xs md:text-sm">
                          <a className="text-primary hover:underline inline-flex items-center gap-1" href={c.dashboardUrl} target="_blank" rel="noreferrer">
                            Open dashboard
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        </div>
                      ) : null}
                      {c.docs ? (
                        <div className="text-xs md:text-sm break-all">
                          Docs:{' '}
                          <a className="text-primary hover:underline" href={c.docs} target="_blank" rel="noreferrer">
                            {c.docs}
                          </a>
                        </div>
                      ) : null}
                      {c.details ? (
                        <pre className="text-[10px] md:text-xs rounded-lg border bg-muted/20 p-2.5 md:p-3 overflow-auto max-h-[200px] md:max-h-[280px]">{JSON.stringify(c.details, null, 2)}</pre>
                      ) : (
                        <div className="text-xs text-muted-foreground">No additional details.</div>
                      )}
                    </CardContent>
                  ) : null}
                </Card>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
            <CardHeader className="px-3 sm:px-6 pt-4 pb-2 md:pt-6 md:pb-4">
              <CardTitle className="text-base md:text-lg">Quick Links</CardTitle>
              <CardDescription className="text-xs md:text-sm">Jump to admin tools and external dashboards.</CardDescription>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-4 md:pb-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-4">
                <Button variant="outline" className="w-full justify-start min-h-[40px] text-sm md:text-base" asChild>
                  <Link href="/dashboard/admin/ops">Admin Ops Dashboard</Link>
                </Button>
                <Button variant="outline" className="w-full justify-start min-h-[40px] text-sm md:text-base" asChild>
                  <Link href="/dashboard/admin/reconciliation">Reconciliation</Link>
                </Button>
                <Button variant="outline" className="w-full justify-start min-h-[40px] text-sm md:text-base" asChild>
                  <Link href="/dashboard/admin/support">Support</Link>
                </Button>
                <Button variant="outline" className="w-full justify-start min-h-[40px] text-sm md:text-base" asChild>
                  <a href="https://sentry.io" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
                    Open Sentry
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                </Button>
                <Button variant="outline" className="w-full justify-start min-h-[40px] text-sm md:text-base" asChild>
                  <a href="https://console.upstash.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2">
                    Open Upstash (Redis)
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
      </div>
    </div>
  );
}
