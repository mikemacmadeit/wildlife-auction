/**
 * Admin Revenue Page
 *
 * Displays platform revenue KPIs, 10% fee confirmation, and transaction-level detail.
 * Filters are simple clickable presets (7d / 30d / 90d / All) for speed.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/page-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Loader2,
  RefreshCw,
  CreditCard,
  ExternalLink,
  Info,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getIdToken } from '@/lib/firebase/auth-helper';
import { auth } from '@/lib/firebase/config';
import { cn } from '@/lib/utils';

const PLATFORM_FEE_PERCENT = 10;

interface RevenueTransaction {
  orderId: string;
  paidAt: string;
  listingId: string;
  listingTitle: string;
  amount: number;
  platformFee: number;
  sellerId: string;
  status: string;
}

interface RevenueData {
  period: {
    startDate: string;
    endDate: string;
  };
  platformFees: {
    last7Days: number;
    last30Days: number;
    allTime: number;
  };
  feesByPlan: {
    free: number;
    pro: number;
    elite: number;
    unknown: number;
  };
  refunds: {
    total: number;
    period: { startDate: string; endDate: string };
  };
  chargebacks: {
    total: number;
    period: { startDate: string; endDate: string };
  };
  orders: {
    last7Days: number;
    last30Days: number;
    inPeriod: number;
  };
  transactions?: RevenueTransaction[];
  generatedAt: string;
}

type PresetRange = '7d' | '30d' | '90d' | 'all' | 'custom';

function presetToDates(preset: PresetRange): { start: string; end: string } {
  const end = new Date();
  const endStr = end.toISOString().slice(0, 10);
  if (preset === '7d') {
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { start: start.toISOString().slice(0, 10), end: endStr };
  }
  if (preset === '30d') {
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { start: start.toISOString().slice(0, 10), end: endStr };
  }
  if (preset === '90d') {
    const start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
    return { start: start.toISOString().slice(0, 10), end: endStr };
  }
  if (preset === 'all') {
    return { start: '2020-01-01', end: endStr };
  }
  return { start: '', end: '' };
}

export default function AdminRevenuePage() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [preset, setPreset] = useState<PresetRange>('30d');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sellerId, setSellerId] = useState<string>('');
  const [listingId, setListingId] = useState<string>('');
  const [showCustomRange, setShowCustomRange] = useState(false);

  const fetchRevenue = useCallback(async () => {
    if (!user?.uid || !isAdmin) return;

    setLoading(true);
    setError(null);

    try {
      const token = await getIdToken(auth.currentUser!, true);
      if (!token) {
        throw new Error('Failed to get authentication token');
      }

      const params = new URLSearchParams();
      const useStart = preset === 'custom' ? startDate : presetToDates(preset).start;
      const useEnd = preset === 'custom' ? endDate : presetToDates(preset).end;
      if (useStart) params.append('startDate', useStart);
      if (useEnd) params.append('endDate', useEnd);
      if (sellerId.trim()) params.append('sellerId', sellerId.trim());
      if (listingId.trim()) params.append('listingId', listingId.trim());

      const response = await fetch(`/api/admin/revenue?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch revenue data');
      }

      const data = await response.json();
      setRevenueData(data);
    } catch (err: any) {
      console.error('Error fetching revenue data:', err);
      setError(err.message || 'Failed to load revenue data');
      toast({
        title: 'Error',
        description: err.message || 'Failed to load revenue data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, listingId, preset, sellerId, startDate, endDate, toast, user?.uid]);

  useEffect(() => {
    if (!adminLoading && isAdmin && user) {
      fetchRevenue();
    }
  }, [adminLoading, isAdmin, user, fetchRevenue]);

  const applyPreset = (p: PresetRange) => {
    setPreset(p);
    setShowCustomRange(p === 'custom');
    if (p === 'custom') {
      const { start, end } = presetToDates('30d');
      setStartDate(start);
      setEndDate(end);
    }
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
      <div className="container mx-auto px-3 sm:px-4 py-4 md:py-8 max-w-6xl space-y-4 md:space-y-6">
      {/* Header + 10% callout */}
      <div className="min-w-0">
        <h1 className="text-2xl md:text-3xl font-bold mb-1 md:mb-2">Platform Revenue</h1>
        <p className="text-sm md:text-base text-muted-foreground mb-2 md:mb-3">
          Platform fee revenue, refunds, and chargebacks
        </p>
        <div className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 px-3 py-2 text-xs md:text-sm">
          <Info className="h-4 w-4 text-primary shrink-0" />
          <span className="break-words">
            <strong>{PLATFORM_FEE_PERCENT}% platform fee</strong> on each transaction. Set in <code className="text-[10px] md:text-xs bg-muted px-1 rounded">lib/pricing/plans.ts</code> (MARKETPLACE_FEE_PERCENT).
          </span>
        </div>
      </div>

      {/* Filters card */}
      <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
        <CardHeader className="pb-2 px-3 sm:px-6 pt-4 md:pt-6">
          <CardTitle className="text-base md:text-lg">Date range & filters</CardTitle>
          <CardDescription className="text-xs md:text-sm">Preset or custom range; optional seller/listing filter.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-3 sm:px-6 pb-4 md:pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs md:text-sm font-medium text-muted-foreground shrink-0">Range:</span>
            {(['7d', '30d', '90d', 'all'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className={cn(
                  'rounded-md px-2.5 md:px-3 py-1.5 text-xs md:text-sm font-medium transition-colors min-h-[36px]',
                  preset === p ? 'bg-primary text-primary-foreground' : 'bg-muted/60 hover:bg-muted text-foreground'
                )}
              >
                {p === '7d' ? '7d' : p === '30d' ? '30d' : p === '90d' ? '90d' : 'All'}
              </button>
            ))}
            <button
              type="button"
              onClick={() => applyPreset('custom')}
              className={cn(
                'rounded-md px-2.5 md:px-3 py-1.5 text-xs md:text-sm font-medium transition-colors min-h-[36px]',
                preset === 'custom' ? 'bg-primary text-primary-foreground' : 'bg-muted/60 hover:bg-muted text-foreground'
              )}
            >
              Custom
            </button>
            <Button variant="outline" size="sm" className="ml-auto h-9 min-h-[36px] gap-1.5 shrink-0" onClick={fetchRevenue} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span>Refresh</span>
            </Button>
          </div>
          {showCustomRange && (
            <div className="flex flex-wrap items-center gap-2">
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full min-[200px]:w-[140px] min-h-[40px]" />
              <span className="text-muted-foreground">–</span>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full min-[200px]:w-[140px] min-h-[40px]" />
            </div>
          )}
          {((sellerId || listingId) || showCustomRange) && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Input placeholder="Seller ID" value={sellerId} onChange={(e) => setSellerId(e.target.value)} className="flex-1 min-w-0 min-h-[40px] text-sm" />
              <Input placeholder="Listing ID" value={listingId} onChange={(e) => setListingId(e.target.value)} className="flex-1 min-w-0 min-h-[40px] text-sm" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading State */}
      {loading && !revenueData && (
        <div className="flex items-center justify-center py-8 md:py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <Card className="rounded-xl border border-destructive/30 bg-destructive/5">
          <CardContent className="pt-4 pb-4 px-3 sm:px-6">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-destructive text-sm md:text-base">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Revenue Data */}
      {revenueData && !loading && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4">
            <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 md:pt-6 px-3 md:px-6">
                <CardTitle className="text-[10px] md:text-sm font-medium">Fees (7d)</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardHeader>
              <CardContent className="px-3 md:px-6 pb-4 md:pb-6">
                <div className="text-xl md:text-2xl font-bold">{formatCurrency(revenueData.platformFees.last7Days)}</div>
                <p className="text-[10px] md:text-xs text-muted-foreground">{revenueData.orders.last7Days} orders</p>
              </CardContent>
            </Card>
            <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 md:pt-6 px-3 md:px-6">
                <CardTitle className="text-[10px] md:text-sm font-medium">Fees (30d)</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardHeader>
              <CardContent className="px-3 md:px-6 pb-4 md:pb-6">
                <div className="text-xl md:text-2xl font-bold">{formatCurrency(revenueData.platformFees.last30Days)}</div>
                <p className="text-[10px] md:text-xs text-muted-foreground">{revenueData.orders.last30Days} orders</p>
              </CardContent>
            </Card>
            <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card col-span-2 md:col-span-1">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-4 md:pt-6 px-3 md:px-6">
                <CardTitle className="text-[10px] md:text-sm font-medium">All-Time</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardHeader>
              <CardContent className="px-3 md:px-6 pb-4 md:pb-6">
                <div className="text-xl md:text-2xl font-bold">{formatCurrency(revenueData.platformFees.allTime)}</div>
                <p className="text-[10px] md:text-xs text-muted-foreground">Total platform fees</p>
              </CardContent>
            </Card>
          </div>

          {/* Fees by Seller Tier */}
          <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
            <CardHeader className="px-3 sm:px-6 pt-4 md:pt-6 pb-2 md:pb-4">
              <CardTitle className="text-base md:text-lg">Fees by Seller Tier (30d)</CardTitle>
              <CardDescription className="text-xs md:text-sm">Platform fees by seller tier (legacy keys for older orders)</CardDescription>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-4 md:pb-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4">
                <div className="p-2.5 md:p-4 rounded-lg border bg-card">
                  <p className="text-[10px] md:text-sm font-medium text-muted-foreground mb-0.5 md:mb-1">Standard</p>
                  <p className="text-lg md:text-2xl font-bold">{formatCurrency(revenueData.feesByPlan.free)}</p>
                  <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">{PLATFORM_FEE_PERCENT}% fee</p>
                </div>
                <div className="p-2.5 md:p-4 rounded-lg border bg-card">
                  <p className="text-[10px] md:text-sm font-medium text-muted-foreground mb-0.5 md:mb-1">Priority</p>
                  <p className="text-lg md:text-2xl font-bold">{formatCurrency(revenueData.feesByPlan.pro)}</p>
                  <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">{PLATFORM_FEE_PERCENT}% fee</p>
                </div>
                <div className="p-2.5 md:p-4 rounded-lg border bg-card">
                  <p className="text-[10px] md:text-sm font-medium text-muted-foreground mb-0.5 md:mb-1">Premier</p>
                  <p className="text-lg md:text-2xl font-bold">{formatCurrency(revenueData.feesByPlan.elite)}</p>
                  <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">{PLATFORM_FEE_PERCENT}% fee</p>
                </div>
                <div className="p-2.5 md:p-4 rounded-lg border bg-card">
                  <p className="text-[10px] md:text-sm font-medium text-muted-foreground mb-0.5 md:mb-1">Unknown</p>
                  <p className="text-lg md:text-2xl font-bold">{formatCurrency(revenueData.feesByPlan.unknown)}</p>
                  <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1">Legacy / no tier</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Refunds & Chargebacks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-4">
            <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
              <CardHeader className="px-3 sm:px-6 pt-4 md:pt-6 pb-2 md:pb-4">
                <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                  <CreditCard className="h-4 w-4 md:h-5 md:w-5 shrink-0" />
                  Refunds
                </CardTitle>
                <CardDescription className="text-xs md:text-sm">Total refunded in selected period</CardDescription>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-4 md:pb-6">
                <div className="text-2xl md:text-3xl font-bold text-orange-600">{formatCurrency(revenueData.refunds.total)}</div>
                <p className="text-[10px] md:text-xs text-muted-foreground mt-2">
                  {formatDate(new Date(revenueData.refunds.period.startDate))} – {formatDate(new Date(revenueData.refunds.period.endDate))}
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
              <CardHeader className="px-3 sm:px-6 pt-4 md:pt-6 pb-2 md:pb-4">
                <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                  <AlertTriangle className="h-4 w-4 md:h-5 md:w-5 text-destructive shrink-0" />
                  Chargebacks
                </CardTitle>
                <CardDescription className="text-xs md:text-sm">Total chargebacks in selected period</CardDescription>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-4 md:pb-6">
                <div className="text-2xl md:text-3xl font-bold text-destructive">{formatCurrency(revenueData.chargebacks.total)}</div>
                <p className="text-[10px] md:text-xs text-muted-foreground mt-2">
                  {formatDate(new Date(revenueData.chargebacks.period.startDate))} – {formatDate(new Date(revenueData.chargebacks.period.endDate))}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Transaction-level detail */}
          {Array.isArray(revenueData.transactions) && revenueData.transactions.length > 0 && (
            <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
              <CardHeader className="px-3 sm:px-6 pt-4 md:pt-6 pb-2 md:pb-4">
                <CardTitle className="text-base md:text-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span>Transactions in period</span>
                  <span className="text-xs md:text-sm font-normal text-muted-foreground">
                    {revenueData.transactions.length} of {revenueData.orders.inPeriod} (newest first)
                  </span>
                </CardTitle>
                <CardDescription className="text-xs md:text-sm">Order-level revenue. Fee is {PLATFORM_FEE_PERCENT}% of each transaction.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {/* Mobile: card list */}
                <div className="md:hidden divide-y divide-border/60">
                  {revenueData.transactions.map((tx) => (
                    <div key={tx.orderId} className="p-3 sm:px-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-muted-foreground">{formatDate(new Date(tx.paidAt))}</p>
                          <p className="font-mono text-xs text-foreground truncate" title={tx.orderId}>{tx.orderId.slice(0, 12)}…</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5" title={tx.listingTitle}>{tx.listingTitle || '—'}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-medium text-sm">{formatCurrency(tx.amount)}</p>
                          <p className="text-xs text-primary font-medium">{formatCurrency(tx.platformFee)} fee</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[120px]" title={tx.sellerId}>{tx.sellerId ? `${tx.sellerId.slice(0, 8)}…` : '—'}</span>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" asChild>
                          <Link href={`/dashboard/admin/ops?orderId=${tx.orderId}`} target="_blank" rel="noopener noreferrer" title="Open order in admin">
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop: table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left font-semibold p-3">Date</th>
                        <th className="text-left font-semibold p-3">Order</th>
                        <th className="text-left font-semibold p-3 min-w-[160px]">Listing</th>
                        <th className="text-right font-semibold p-3">Amount</th>
                        <th className="text-right font-semibold p-3">Fee ({PLATFORM_FEE_PERCENT}%)</th>
                        <th className="text-left font-semibold p-3">Seller</th>
                        <th className="text-left font-semibold p-3 w-16"> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueData.transactions.map((tx) => (
                        <tr key={tx.orderId} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="p-3 text-muted-foreground whitespace-nowrap">{formatDate(new Date(tx.paidAt))}</td>
                          <td className="p-3 font-mono text-xs">{tx.orderId.slice(0, 8)}…</td>
                          <td className="p-3 truncate max-w-[200px]" title={tx.listingTitle}>{tx.listingTitle || '—'}</td>
                          <td className="p-3 text-right font-medium">{formatCurrency(tx.amount)}</td>
                          <td className="p-3 text-right font-medium text-primary">{formatCurrency(tx.platformFee)}</td>
                          <td className="p-3 font-mono text-xs text-muted-foreground truncate max-w-[120px]" title={tx.sellerId}>{tx.sellerId ? `${tx.sellerId.slice(0, 8)}…` : '—'}</td>
                          <td className="p-3">
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                              <Link href={`/dashboard/admin/ops?orderId=${tx.orderId}`} target="_blank" rel="noopener noreferrer" title="Open order in admin">
                                <ExternalLink className="h-4 w-4" />
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Generated At */}
          <div className="text-[10px] md:text-xs text-muted-foreground text-center">
            Report generated at {formatDate(new Date(revenueData.generatedAt))}
          </div>
        </>
      )}
      </div>
    </div>
  );
}
