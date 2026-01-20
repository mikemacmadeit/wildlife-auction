/**
 * Admin Ops Health Page
 * 
 * Read-only dashboard showing system health metrics
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle,
  AlertTriangle,
  Clock,
  RefreshCw,
  Loader2,
  ExternalLink,
  Activity,
} from 'lucide-react';
import { formatDate, formatDistanceToNow } from '@/lib/utils';
import Link from 'next/link';
import { db } from '@/lib/firebase/config';
import { useToast } from '@/hooks/use-toast';
import { doc, getDoc, Timestamp } from 'firebase/firestore';

interface AutoReleaseHealth {
  lastRunAt?: Timestamp;
  scannedCount?: number;
  releasedCount?: number;
  errorsCount?: number;
  lastError?: string | null;
  updatedAt?: Timestamp;
}

interface WebhookHealth {
  lastWebhookAt?: Timestamp;
  lastEventType?: string;
  lastEventId?: string;
  updatedAt?: Timestamp;
}

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
};

export default function OpsHealthPage() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [runningAutoRelease, setRunningAutoRelease] = useState(false);
  const [autoReleaseHealth, setAutoReleaseHealth] = useState<AutoReleaseHealth | null>(null);
  const [webhookHealth, setWebhookHealth] = useState<WebhookHealth | null>(null);
  const [adminHealth, setAdminHealth] = useState<AdminHealthResponse | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadHealthData = useCallback(async () => {
    if (!user?.uid) return;

    setLoading(true);
    try {
      // Server-side health checks (env/config + opsHealth snapshots)
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/admin/health', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.ok === true) setAdminHealth(json as AdminHealthResponse);
        else setAdminHealth(null);
      } catch {
        setAdminHealth(null);
      }

      // Load auto-release health
      const autoReleaseDoc = await getDoc(doc(db, 'opsHealth', 'autoReleaseProtected'));
      if (autoReleaseDoc.exists()) {
        setAutoReleaseHealth(autoReleaseDoc.data() as AutoReleaseHealth);
      }

      // Load webhook health
      const webhookDoc = await getDoc(doc(db, 'opsHealth', 'stripeWebhook'));
      if (webhookDoc.exists()) {
        setWebhookHealth(webhookDoc.data() as WebhookHealth);
      }
    } catch (error) {
      console.error('Error loading health data:', error);
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, [user?.uid]);

  const runAutoReleaseNow = useCallback(async () => {
    // This endpoint exists in Netlify; locally it may 404.
    setRunningAutoRelease(true);
    try {
      const res = await fetch('/.netlify/functions/autoReleaseProtected', { method: 'GET' });
      const text = await res.text().catch(() => '');
      if (!res.ok) {
        throw new Error(text || `Failed to invoke auto-release (HTTP ${res.status})`);
      }
      toast({
        title: 'Auto-release triggered',
        description: 'The scheduler run has been invoked. Refreshing health…',
      });
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
      loadHealthData();
    }
  }, [adminLoading, isAdmin, user, loadHealthData]);

  const getAutoReleaseStatus = () => {
    if (!autoReleaseHealth?.lastRunAt) return { status: 'unknown', label: 'Unknown', color: 'gray' };
    
    const lastRun = autoReleaseHealth.lastRunAt.toDate();
    const minutesAgo = (Date.now() - lastRun.getTime()) / (1000 * 60);
    
    if (minutesAgo > 20) {
      return { status: 'stale', label: 'Stale', color: 'red' };
    } else if (minutesAgo > 15) {
      return { status: 'warning', label: 'Warning', color: 'orange' };
    } else {
      return { status: 'healthy', label: 'Healthy', color: 'green' };
    }
  };

  const getWebhookStatus = () => {
    if (!webhookHealth?.lastWebhookAt) return { status: 'unknown', label: 'Unknown', color: 'gray' };
    
    const lastWebhook = webhookHealth.lastWebhookAt.toDate();
    const hoursAgo = (Date.now() - lastWebhook.getTime()) / (1000 * 60 * 60);
    
    if (hoursAgo > 24) {
      return { status: 'stale', label: 'Stale', color: 'red' };
    } else if (hoursAgo > 12) {
      return { status: 'warning', label: 'Warning', color: 'orange' };
    } else {
      return { status: 'healthy', label: 'Healthy', color: 'green' };
    }
  };

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

  const autoReleaseStatus = getAutoReleaseStatus();
  const webhookStatus = getWebhookStatus();

  const badgeClassFor = (status: 'healthy' | 'warning' | 'stale' | 'unknown') => {
    if (status === 'healthy') return 'bg-emerald-600 text-white';
    if (status === 'warning') return 'bg-amber-600 text-white';
    if (status === 'stale') return 'bg-red-600 text-white';
    return 'bg-muted text-foreground';
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">System Health</h1>
          <p className="text-muted-foreground">
            Real-time monitoring of critical system operations
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          {/* Config & Environment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Environment & Configuration
              </CardTitle>
              <CardDescription>
                Runtime configuration checks (no secrets shown). Use this to diagnose “it works locally but not on Netlify”.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!adminHealth ? (
                <div className="text-sm text-muted-foreground">
                  Health API not available yet. Refresh the page.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border bg-muted/10 p-4 space-y-2">
                    <div className="text-sm font-semibold">Firebase Admin</div>
                    <div className="text-sm text-muted-foreground">
                      Project: <span className="font-mono">{adminHealth.config.firebaseAdmin.projectId || 'UNKNOWN'}</span>
                    </div>
                    <Badge variant="secondary">OK</Badge>
                  </div>

                  <div className="rounded-lg border bg-muted/10 p-4 space-y-2">
                    <div className="text-sm font-semibold">Rate limiting (Upstash)</div>
                    {adminHealth.env.netlifyRuntime && !adminHealth.config.rateLimiting.upstashConfigured ? (
                      <>
                        <Badge variant="destructive">FAIL</Badge>
                        <div className="text-sm text-muted-foreground">
                          Upstash env vars are missing. Sensitive endpoints will return <span className="font-mono">503</span> in Netlify.
                        </div>
                      </>
                    ) : adminHealth.config.rateLimiting.upstashConfigured ? (
                      <>
                        <Badge variant="secondary">OK</Badge>
                        <div className="text-sm text-muted-foreground">Upstash is configured.</div>
                      </>
                    ) : (
                      <>
                        <Badge variant="outline">DEV</Badge>
                        <div className="text-sm text-muted-foreground">Not in Netlify runtime; in-memory fallback is allowed.</div>
                      </>
                    )}
                  </div>

                  <div className="rounded-lg border bg-muted/10 p-4 space-y-2">
                    <div className="text-sm font-semibold">Stripe</div>
                    {adminHealth.config.stripe.configured ? (
                      <Badge variant="secondary">OK</Badge>
                    ) : (
                      <Badge variant="destructive">FAIL</Badge>
                    )}
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div>STRIPE_SECRET_KEY: {adminHealth.config.stripe.hasSecretKey ? 'set' : 'missing'}</div>
                      <div>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: {adminHealth.config.stripe.hasPublishableKey ? 'set' : 'missing'}</div>
                      <div>STRIPE_WEBHOOK_SECRET: {adminHealth.config.stripe.hasWebhookSecret ? 'set' : 'missing'}</div>
                    </div>
                  </div>

                  <div className="rounded-lg border bg-muted/10 p-4 space-y-2">
                    <div className="text-sm font-semibold">Emergency flags</div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={adminHealth.flags.globalCheckoutFreezeEnabled ? 'destructive' : 'outline'}>
                        Checkout freeze: {adminHealth.flags.globalCheckoutFreezeEnabled ? 'ON' : 'OFF'}
                      </Badge>
                      <Badge variant={adminHealth.flags.globalPayoutFreezeEnabled ? 'destructive' : 'outline'}>
                        Payout freeze: {adminHealth.flags.globalPayoutFreezeEnabled ? 'ON' : 'OFF'}
                      </Badge>
                      <Badge variant={adminHealth.flags.autoReleaseEnabled ? 'secondary' : 'outline'}>
                        Auto-release: {adminHealth.flags.autoReleaseEnabled ? 'ON' : 'OFF'}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Auto-Release Health */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Auto-Release Protected Transactions
                  </CardTitle>
                  <CardDescription>
                    Scheduled function runs every 10 minutes to release eligible payments
                  </CardDescription>
                </div>
                <Badge
                  variant={autoReleaseStatus.status === 'healthy' ? 'default' : 'destructive'}
                  className={badgeClassFor(autoReleaseStatus.status as any)}
                >
                  {autoReleaseStatus.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {autoReleaseHealth ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Last Run</p>
                      <p className="font-semibold">
                        {autoReleaseHealth.lastRunAt
                          ? formatDistanceToNow(autoReleaseHealth.lastRunAt.toDate(), { addSuffix: true })
                          : 'Never'}
                      </p>
                      {autoReleaseHealth.lastRunAt && (
                        <p className="text-xs text-muted-foreground">
                          {formatDate(autoReleaseHealth.lastRunAt.toDate())}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Scanned</p>
                      <p className="font-semibold">{autoReleaseHealth.scannedCount ?? 0}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Released</p>
                      <p className="font-semibold text-green-600">
                        {autoReleaseHealth.releasedCount ?? 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Errors</p>
                      <p className="font-semibold text-red-600">
                        {autoReleaseHealth.errorsCount ?? 0}
                      </p>
                    </div>
                  </div>
                  {autoReleaseHealth.lastError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded">
                      <p className="text-sm font-medium text-red-800">Last Error</p>
                      <p className="text-sm text-red-600">{autoReleaseHealth.lastError}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">No health data available</p>
              )}
            </CardContent>
          </Card>

          {/* Webhook Health */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    Stripe Webhook
                  </CardTitle>
                  <CardDescription>
                    Last webhook event received from Stripe
                  </CardDescription>
                </div>
                <Badge
                  variant={webhookStatus.status === 'healthy' ? 'default' : 'destructive'}
                  className={badgeClassFor(webhookStatus.status as any)}
                >
                  {webhookStatus.label}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {webhookHealth ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Last Webhook</p>
                      <p className="font-semibold">
                        {webhookHealth.lastWebhookAt
                          ? formatDistanceToNow(webhookHealth.lastWebhookAt.toDate(), { addSuffix: true })
                          : 'Never'}
                      </p>
                      {webhookHealth.lastWebhookAt && (
                        <p className="text-xs text-muted-foreground">
                          {formatDate(webhookHealth.lastWebhookAt.toDate())}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Last Event Type</p>
                      <p className="font-semibold">{webhookHealth.lastEventType || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Last Event ID</p>
                      <p className="font-mono text-xs">{webhookHealth.lastEventId?.slice(-12) || 'N/A'}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No webhook data available</p>
              )}
            </CardContent>
          </Card>

          {/* Quick Links */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Links</CardTitle>
              <CardDescription>Access related admin tools</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link href="/dashboard/admin/ops">
                  <Button variant="outline" className="w-full justify-start">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Admin Ops Dashboard
                  </Button>
                </Link>
                <Link href="/dashboard/admin/reconciliation">
                  <Button variant="outline" className="w-full justify-start">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Reconciliation
                  </Button>
                </Link>
                <Button variant="outline" className="w-full justify-start" disabled>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Chargebacks (Coming Soon)
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Last Refresh */}
          <div className="text-center text-sm text-muted-foreground">
            Last refreshed: {formatDate(lastRefresh)}
          </div>
        </>
      )}
    </div>
  );
}
