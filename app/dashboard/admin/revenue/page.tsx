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
      {/* Header + 10% callout */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Platform Revenue</h1>
        <p className="text-muted-foreground mb-3">
          Platform fee revenue, refunds, and chargebacks
        </p>
        <div className="inline-flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <Info className="h-4 w-4 text-primary shrink-0" />
          <span>
            <strong>{PLATFORM_FEE_PERCENT}% platform fee</strong> on each transaction. Fee is set in <code className="text-xs bg-muted px-1 rounded">lib/pricing/plans.ts</code> (MARKETPLACE_FEE_PERCENT) and applied at checkout.
          </span>
        </div>
      </div>

      {/* Clickable preset filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground mr-1">Range:</span>
        {(['7d', '30d', '90d', 'all'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => applyPreset(p)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              preset === p
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/60 hover:bg-muted text-foreground'
            )}
          >
            {p === '7d' ? 'Last 7 days' : p === '30d' ? 'Last 30 days' : p === '90d' ? 'Last 90 days' : 'All time'}
          </button>
        ))}
        <button
          type="button"
          onClick={() => applyPreset('custom')}
          className={cn(
            'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            preset === 'custom' ? 'bg-primary text-primary-foreground' : 'bg-muted/60 hover:bg-muted text-foreground'
          )}
        >
          Custom
        </button>
        {showCustomRange && (
          <div className="flex flex-wrap items-center gap-2 ml-2">
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[140px]"
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-[140px]"
            />
          </div>
        )}
        {((sellerId || listingId) || showCustomRange) && (
          <div className="flex items-center gap-2 flex-wrap ml-2">
            <Input
              placeholder="Seller ID"
              value={sellerId}
              onChange={(e) => setSellerId(e.target.value)}
              className="w-[180px] h-9 text-sm"
            />
            <Input
              placeholder="Listing ID"
              value={listingId}
              onChange={(e) => setListingId(e.target.value)}
              className="w-[180px] h-9 text-sm"
            />
          </div>
        )}
        <Button variant="outline" size="sm" className="ml-auto h-9 gap-1.5" onClick={fetchRevenue} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span>Refresh</span>
        </Button>
      </div>

      {/* Loading State */}
      {loading && !revenueData && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-destructive">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Revenue Data */}
      {revenueData && !loading && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Platform Fees (7d)</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(revenueData.platformFees.last7Days)}</div>
                <p className="text-xs text-muted-foreground">{revenueData.orders.last7Days} orders</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Platform Fees (30d)</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(revenueData.platformFees.last30Days)}</div>
                <p className="text-xs text-muted-foreground">{revenueData.orders.last30Days} orders</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">All-Time Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(revenueData.platformFees.allTime)}</div>
                <p className="text-xs text-muted-foreground">Total platform fees</p>
              </CardContent>
            </Card>
          </div>

          {/* Fees by Seller Tier */}
          <Card>
            <CardHeader>
              <CardTitle>Fees by Seller Tier (Last 30 Days)</CardTitle>
              <CardDescription>Platform fees grouped by seller tier snapshot (legacy keys kept for older orders)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg border bg-card">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Standard</p>
                  <p className="text-2xl font-bold">{formatCurrency(revenueData.feesByPlan.free)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{PLATFORM_FEE_PERCENT}% platform fee</p>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Priority</p>
                  <p className="text-2xl font-bold">{formatCurrency(revenueData.feesByPlan.pro)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{PLATFORM_FEE_PERCENT}% platform fee</p>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Premier</p>
                  <p className="text-2xl font-bold">{formatCurrency(revenueData.feesByPlan.elite)}</p>
                  <p className="text-xs text-muted-foreground mt-1">{PLATFORM_FEE_PERCENT}% platform fee</p>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Unknown</p>
                  <p className="text-2xl font-bold">{formatCurrency(revenueData.feesByPlan.unknown)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Legacy / no tier</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Refunds & Chargebacks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Refunds
                </CardTitle>
                <CardDescription>
                  Total refunded amounts in selected period
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-orange-600">
                  {formatCurrency(revenueData.refunds.total)}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Period: {formatDate(new Date(revenueData.refunds.period.startDate))} - {formatDate(new Date(revenueData.refunds.period.endDate))}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Chargebacks
                </CardTitle>
                <CardDescription>
                  Total chargeback amounts in selected period
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-destructive">
                  {formatCurrency(revenueData.chargebacks.total)}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Period: {formatDate(new Date(revenueData.chargebacks.period.startDate))} - {formatDate(new Date(revenueData.chargebacks.period.endDate))}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Transaction-level detail */}
          {Array.isArray(revenueData.transactions) && revenueData.transactions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Transactions in period</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {revenueData.transactions.length} of {revenueData.orders.inPeriod} (newest first)
                  </span>
                </CardTitle>
                <CardDescription>
                  Order-level revenue. Platform fee is {PLATFORM_FEE_PERCENT}% of each transaction amount.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
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
                        <td className="p-3 text-muted-foreground whitespace-nowrap">
                          {formatDate(new Date(tx.paidAt))}
                        </td>
                        <td className="p-3 font-mono text-xs">{tx.orderId.slice(0, 8)}…</td>
                        <td className="p-3 truncate max-w-[200px]" title={tx.listingTitle}>
                          {tx.listingTitle || '—'}
                        </td>
                        <td className="p-3 text-right font-medium">{formatCurrency(tx.amount)}</td>
                        <td className="p-3 text-right font-medium text-primary">{formatCurrency(tx.platformFee)}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground truncate max-w-[120px]" title={tx.sellerId}>
                          {tx.sellerId ? `${tx.sellerId.slice(0, 8)}…` : '—'}
                        </td>
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
              </CardContent>
            </Card>
          )}

          {/* Generated At */}
          <div className="text-xs text-muted-foreground text-center">
            Report generated at {formatDate(new Date(revenueData.generatedAt))}
          </div>
        </>
      )}
    </div>
  );
}
