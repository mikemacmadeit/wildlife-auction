/**
 * Plan Savings Card Component
 * 
 * Shows seller's savings vs Free plan based on completed orders
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingDown, DollarSign, Package } from 'lucide-react';
import { calculatePlanSavings } from '@/lib/firebase/sellerStats';
import { formatCurrency } from '@/lib/utils';

interface PlanSavingsCardProps {
  sellerId: string;
  days?: number; // Default 30 days
}

interface SavingsData {
  feesPaid: number;
  feesIfFree: number;
  savings: number;
  ordersCount: number;
  planBreakdown: {
    free: { count: number; fees: number };
    pro: { count: number; fees: number };
    elite: { count: number; fees: number };
    unknown: { count: number; fees: number };
  };
}

export function PlanSavingsCard({ sellerId, days = 30 }: PlanSavingsCardProps) {
  const [loading, setLoading] = useState(true);
  const [savingsData, setSavingsData] = useState<SavingsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSavings = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await calculatePlanSavings(sellerId, days);
        setSavingsData(data);
      } catch (err: any) {
        console.error('Error fetching plan savings:', err);
        setError(err.message || 'Failed to load savings data');
      } finally {
        setLoading(false);
      }
    };

    if (sellerId) {
      fetchSavings();
    }
  }, [sellerId, days]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Plan Savings</CardTitle>
          <CardDescription>Last {days} days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !savingsData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Plan Savings</CardTitle>
          <CardDescription>Last {days} days</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {error || 'Unable to load savings data'}
          </p>
        </CardContent>
      </Card>
    );
  }

  const { feesPaid, feesIfFree, savings, ordersCount, planBreakdown } = savingsData;

  // If no orders, show empty state
  if (ordersCount === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Plan Savings</CardTitle>
          <CardDescription>Last {days} days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <Package className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground font-medium">
              No completed sales in the last {days} days
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Savings will appear here once you have completed transactions
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold">Plan Savings</CardTitle>
            <CardDescription>Last {days} days</CardDescription>
          </div>
          {savings > 0 && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <TrendingDown className="h-3 w-3 mr-1" />
              Saved {formatCurrency(savings)}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Savings Amount */}
        {savings > 0 ? (
          <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900">
            <p className="text-sm font-semibold text-green-900 dark:text-green-100 mb-1">
              You saved {formatCurrency(savings)} by being on a paid plan
            </p>
            <p className="text-xs text-green-700 dark:text-green-300">
              vs. Free plan fees ({formatCurrency(feesIfFree)})
            </p>
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <p className="text-sm font-semibold text-foreground mb-1">
              No savings to display
            </p>
            <p className="text-xs text-muted-foreground">
              All transactions were on Free plan rate
            </p>
          </div>
        )}

        {/* Fee Breakdown */}
        <div className="space-y-2 pt-2 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Fees Paid (Actual)</span>
            <span className="font-semibold">{formatCurrency(feesPaid)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Fees if Free Plan</span>
            <span className="font-semibold">{formatCurrency(feesIfFree)}</span>
          </div>
          {savings > 0 && (
            <div className="flex items-center justify-between text-sm pt-2 border-t">
              <span className="font-semibold text-green-700 dark:text-green-400">
                Total Savings
              </span>
              <span className="font-bold text-lg text-green-700 dark:text-green-400">
                {formatCurrency(savings)}
              </span>
            </div>
          )}
        </div>

        {/* Plan Breakdown (if multiple plans) */}
        {(planBreakdown.pro.count > 0 || planBreakdown.elite.count > 0) && (
          <div className="pt-2 border-t">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              By Plan ({ordersCount} orders)
            </p>
            <div className="space-y-1 text-xs">
              {planBreakdown.pro.count > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Pro Plan</span>
                  <span className="font-semibold">
                    {planBreakdown.pro.count} orders, {formatCurrency(planBreakdown.pro.fees)} fees
                  </span>
                </div>
              )}
              {planBreakdown.elite.count > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Elite Plan</span>
                  <span className="font-semibold">
                    {planBreakdown.elite.count} orders, {formatCurrency(planBreakdown.elite.fees)} fees
                  </span>
                </div>
              )}
              {planBreakdown.free.count > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Free Plan</span>
                  <span className="font-semibold">
                    {planBreakdown.free.count} orders, {formatCurrency(planBreakdown.free.fees)} fees
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
