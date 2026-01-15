/**
 * Admin Revenue Page
 * 
 * Displays platform revenue KPIs and breakdowns
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Calendar,
  CreditCard,
  Package,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { getIdToken } from '@/lib/firebase/auth-helper';
import { auth } from '@/lib/firebase/config';

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
  generatedAt: string;
}

export default function AdminRevenuePage() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Date filters
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sellerId, setSellerId] = useState<string>('');
  const [listingId, setListingId] = useState<string>('');

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
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (sellerId) params.append('sellerId', sellerId);
      if (listingId) params.append('listingId', listingId);

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
  }, [endDate, isAdmin, listingId, sellerId, startDate, toast, user?.uid]);

  useEffect(() => {
    if (!adminLoading && isAdmin && user) {
      fetchRevenue();
    }
  }, [adminLoading, isAdmin, user, fetchRevenue]);

  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
    setSellerId('');
    setListingId('');
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
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Platform Revenue</h1>
        <p className="text-muted-foreground">
          Platform fee revenue, refunds, and chargebacks overview
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Filter revenue data by date range, seller, or listing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label>End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Seller ID</Label>
              <Input
                placeholder="Seller UID"
                value={sellerId}
                onChange={(e) => setSellerId(e.target.value)}
              />
            </div>
            <div>
              <Label>Listing ID</Label>
              <Input
                placeholder="Listing ID"
                value={listingId}
                onChange={(e) => setListingId(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={fetchRevenue} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Apply Filters
                </>
              )}
            </Button>
            <Button variant="outline" onClick={handleResetFilters}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

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
                  <p className="text-xs text-muted-foreground mt-1">5% marketplace fee</p>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Priority</p>
                  <p className="text-2xl font-bold">{formatCurrency(revenueData.feesByPlan.pro)}</p>
                  <p className="text-xs text-muted-foreground mt-1">5% marketplace fee</p>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Premier</p>
                  <p className="text-2xl font-bold">{formatCurrency(revenueData.feesByPlan.elite)}</p>
                  <p className="text-xs text-muted-foreground mt-1">5% marketplace fee</p>
                </div>
                <div className="p-4 rounded-lg border bg-card">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Unknown</p>
                  <p className="text-2xl font-bold">{formatCurrency(revenueData.feesByPlan.unknown)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Legacy orders</p>
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

          {/* Generated At */}
          <div className="text-xs text-muted-foreground text-center">
            Report generated at {formatDate(new Date(revenueData.generatedAt))}
          </div>
        </>
      )}
    </div>
  );
}
