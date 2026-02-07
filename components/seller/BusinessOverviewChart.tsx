'use client';

import { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { format, subMonths, startOfMonth, startOfDay, subDays } from 'date-fns';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import type { Order } from '@/lib/types';

const CHART_CONFIG: ChartConfig = {
  earned: {
    label: 'Earned',
    theme: {
      light: 'hsl(160 84% 39%)',   // emerald-500
      dark: 'hsl(160 84% 45%)',
    },
  },
  spent: {
    label: 'Spent',
    theme: {
      light: 'hsl(215 16% 47%)',   // slate-500
      dark: 'hsl(215 20% 55%)',
    },
  },
};

function toDateSafe(v: unknown): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof (v as { toDate?: () => Date }).toDate === 'function') return (v as { toDate: () => Date }).toDate();
  return null;
}

function aggregateByMonth(
  sellerOrders: Order[],
  buyerOrders: Order[],
  monthsBack: number
): { month: string; monthKey: string; earned: number; spent: number }[] {
  const now = new Date();
  const start = startOfMonth(subMonths(now, monthsBack));
  const end = startOfMonth(now);

  const completedSeller = sellerOrders.filter((o) => {
    const status = o.status;
    const hasPaidAt = !!(o as { paidAt?: unknown }).paidAt;
    return status === 'paid' || status === 'completed' || status === 'paid_held' || status === 'buyer_confirmed' || hasPaidAt;
  });
  const completedBuyer = buyerOrders.filter((o) => {
    const status = o.status;
    const hasPaidAt = !!(o as { paidAt?: unknown }).paidAt;
    return status === 'paid' || status === 'completed' || status === 'paid_held' || status === 'buyer_confirmed' || hasPaidAt;
  });

  const buckets: Record<string, { earned: number; spent: number }> = {};
  for (let i = 0; i <= monthsBack; i++) {
    const d = startOfMonth(subMonths(now, monthsBack - i));
    const key = format(d, 'yyyy-MM');
    buckets[key] = { earned: 0, spent: 0 };
  }

  completedSeller.forEach((o) => {
    const createdAt = toDateSafe((o as { createdAt?: unknown }).createdAt);
    if (!createdAt) return;
    const key = format(startOfMonth(createdAt), 'yyyy-MM');
    if (key in buckets) {
      buckets[key].earned += o.sellerAmount ?? o.amount - (o.platformFee ?? 0);
    }
  });
  completedBuyer.forEach((o) => {
    const createdAt = toDateSafe((o as { createdAt?: unknown }).createdAt);
    if (!createdAt) return;
    const key = format(startOfMonth(createdAt), 'yyyy-MM');
    if (key in buckets) {
      buckets[key].spent += o.amount ?? 0;
    }
  });

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, v]) => ({
      month: format(new Date(monthKey + '-01'), 'MMM yyyy'),
      monthKey,
      earned: Math.round(v.earned),
      spent: Math.round(v.spent),
    }));
}

function aggregateByDay(
  sellerOrders: Order[],
  buyerOrders: Order[],
  daysBack: number
): { month: string; monthKey: string; earned: number; spent: number }[] {
  const now = new Date();
  const completedSeller = sellerOrders.filter((o) => {
    const status = o.status;
    const hasPaidAt = !!(o as { paidAt?: unknown }).paidAt;
    return status === 'paid' || status === 'completed' || status === 'paid_held' || status === 'buyer_confirmed' || hasPaidAt;
  });
  const completedBuyer = buyerOrders.filter((o) => {
    const status = o.status;
    const hasPaidAt = !!(o as { paidAt?: unknown }).paidAt;
    return status === 'paid' || status === 'completed' || status === 'paid_held' || status === 'buyer_confirmed' || hasPaidAt;
  });

  const buckets: Record<string, { earned: number; spent: number }> = {};
  for (let i = 0; i <= daysBack; i++) {
    const d = startOfDay(subDays(now, daysBack - i));
    const key = format(d, 'yyyy-MM-dd');
    buckets[key] = { earned: 0, spent: 0 };
  }

  completedSeller.forEach((o) => {
    const createdAt = toDateSafe((o as { createdAt?: unknown }).createdAt);
    if (!createdAt) return;
    const key = format(startOfDay(createdAt), 'yyyy-MM-dd');
    if (key in buckets) {
      buckets[key].earned += o.sellerAmount ?? o.amount - (o.platformFee ?? 0);
    }
  });
  completedBuyer.forEach((o) => {
    const createdAt = toDateSafe((o as { createdAt?: unknown }).createdAt);
    if (!createdAt) return;
    const key = format(startOfDay(createdAt), 'yyyy-MM-dd');
    if (key in buckets) {
      buckets[key].spent += o.amount ?? 0;
    }
  });

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayKey, v]) => ({
      month: format(new Date(dayKey), 'M/d'),
      monthKey: dayKey,
      earned: Math.round(v.earned),
      spent: Math.round(v.spent),
    }));
}

export type ChartRange = '30d' | '3M' | '6M' | '12M';

export interface BusinessOverviewChartProps {
  sellerOrders: Order[];
  buyerOrders: Order[];
  className?: string;
  /** Future: overlay by category/species from sold data */
  overlay?: 'none' | 'category';
}

export function BusinessOverviewChart({
  sellerOrders,
  buyerOrders,
  className,
  overlay = 'none',
}: BusinessOverviewChartProps) {
  const [range, setRange] = useState<ChartRange>('6M');

  const chartData = useMemo(() => {
    if (range === '30d') {
      return aggregateByDay(sellerOrders, buyerOrders, 30);
    }
    const monthsBack = range === '12M' ? 12 : range === '6M' ? 6 : 3;
    return aggregateByMonth(sellerOrders, buyerOrders, monthsBack);
  }, [sellerOrders, buyerOrders, range]);

  const hasData = chartData.some((d) => d.earned > 0 || d.spent > 0);

  return (
    <div className={cn('space-y-3 min-w-0', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs sm:text-sm font-semibold text-foreground">Earned vs spent over time</h3>
        <div className="flex flex-wrap rounded-lg border border-border/50 bg-muted/30 p-0.5 gap-0.5">
          {(['30d', '3M', '6M', '12M'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={cn(
                'rounded-md px-2 sm:px-2.5 py-2 min-h-[36px] sm:min-h-0 sm:py-1 text-xs font-medium transition-colors touch-manipulation',
                range === r
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground active:bg-muted/50'
              )}
            >
              {r === '30d' ? '30 days' : r}
            </button>
          ))}
        </div>
      </div>

      {!hasData ? (
        <div className="flex min-h-[180px] sm:min-h-[200px] items-center justify-center rounded-xl border border-border/50 bg-muted/20 text-xs sm:text-sm text-muted-foreground px-4">
          No earned or spent data in this period
        </div>
      ) : (
        <ChartContainer
          config={CHART_CONFIG}
          className="min-h-[200px] sm:min-h-[240px] h-[200px] sm:h-[240px] w-full max-w-full rounded-xl border border-border/50 bg-card/50 [&_.recharts-wrapper]:max-w-full"
        >
          <AreaChart
            data={chartData}
            margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
          >
            <defs>
              <linearGradient id="fillEarned" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-earned)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--color-earned)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="fillSpent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-spent)" stopOpacity={0.4} />
                <stop offset="100%" stopColor="var(--color-spent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: range === '30d' ? 10 : 12 }}
              interval={range === '30d' ? 4 : 0}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'hsl(var(--muted-foreground))' }}
              tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => [`$${Number(value).toLocaleString()}`, undefined]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.month}
                />
              }
            />
            <Legend
              wrapperStyle={{ paddingTop: 8 }}
              formatter={(value) => CHART_CONFIG[value as keyof typeof CHART_CONFIG]?.label ?? value}
              iconType="circle"
              iconSize={8}
            />
            <Area
              type="monotone"
              dataKey="earned"
              stroke="var(--color-earned)"
              strokeWidth={2}
              fill="url(#fillEarned)"
              name="earned"
            />
            <Area
              type="monotone"
              dataKey="spent"
              stroke="var(--color-spent)"
              strokeWidth={2}
              fill="url(#fillSpent)"
              name="spent"
            />
          </AreaChart>
        </ChartContainer>
      )}

      {overlay !== 'none' && (
        <p className="text-xs text-muted-foreground">
          Overlay by {overlay} coming soon — species/category trends from sold data.
        </p>
      )}
    </div>
  );
}
