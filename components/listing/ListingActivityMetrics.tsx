'use client';

import { Eye, Heart, MessageSquare, TrendingUp, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ListingActivityMetricsProps {
  views?: number;
  favorites?: number;
  bids?: number;
  watchers?: number;
  inquiries?: number;
  className?: string;
}

export function ListingActivityMetrics({
  views = 1247,
  favorites = 23,
  bids = 8,
  watchers = 12,
  inquiries = 5,
  className
}: ListingActivityMetricsProps) {
  const metrics = [
    {
      icon: Eye,
      label: 'Views',
      value: views,
      iconColor: 'text-foreground/70 dark:text-foreground/70',
      valueColor: 'text-foreground dark:text-foreground',
      bgColor: 'bg-card dark:bg-card',
      borderColor: 'border-2 border-border/80 dark:border-border/70',
      hoverBg: 'hover:bg-muted/50 dark:hover:bg-card/80',
      hoverBorder: 'hover:border-border dark:hover:border-border',
    },
    {
      icon: Heart,
      label: 'Favorites',
      value: favorites,
      iconColor: 'text-[hsl(90,18%,35%)] dark:text-primary',
      valueColor: 'text-[hsl(90,18%,35%)] dark:text-primary',
      bgColor: 'bg-primary/25 dark:bg-primary/30',
      borderColor: 'border-2 border-[hsl(90,18%,35%)]/70 dark:border-primary/60',
      hoverBg: 'hover:bg-primary/30 dark:hover:bg-primary/35',
      hoverBorder: 'hover:border-[hsl(90,18%,35%)]/90 dark:hover:border-primary/70',
    },
    {
      icon: TrendingUp,
      label: 'Bids',
      value: bids,
      iconColor: 'text-[hsl(90,18%,35%)] dark:text-primary',
      valueColor: 'text-[hsl(90,18%,35%)] dark:text-primary',
      bgColor: 'bg-primary/25 dark:bg-primary/30',
      borderColor: 'border-2 border-[hsl(90,18%,35%)]/70 dark:border-primary/60',
      hoverBg: 'hover:bg-primary/30 dark:hover:bg-primary/35',
      hoverBorder: 'hover:border-[hsl(90,18%,35%)]/90 dark:hover:border-primary/70',
    },
    {
      icon: Users,
      label: 'Watchers',
      value: watchers,
      iconColor: 'text-[hsl(90,18%,35%)] dark:text-primary',
      valueColor: 'text-[hsl(90,18%,35%)] dark:text-primary',
      bgColor: 'bg-primary/25 dark:bg-primary/30',
      borderColor: 'border-2 border-[hsl(90,18%,35%)]/70 dark:border-primary/60',
      hoverBg: 'hover:bg-primary/30 dark:hover:bg-primary/35',
      hoverBorder: 'hover:border-[hsl(90,18%,35%)]/90 dark:hover:border-primary/70',
    },
    {
      icon: MessageSquare,
      label: 'Inquiries',
      value: inquiries,
      iconColor: 'text-[hsl(90,18%,35%)] dark:text-primary',
      valueColor: 'text-[hsl(90,18%,35%)] dark:text-primary',
      bgColor: 'bg-primary/25 dark:bg-primary/30',
      borderColor: 'border-2 border-[hsl(90,18%,35%)]/70 dark:border-primary/60',
      hoverBg: 'hover:bg-primary/30 dark:hover:bg-primary/35',
      hoverBorder: 'hover:border-[hsl(90,18%,35%)]/90 dark:hover:border-primary/70',
    },
  ].filter(m => m.value !== undefined && m.value > 0);

  return (
    <div className={cn('w-full', className)}>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.label}
              className={cn(
                'flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-200',
                'hover:shadow-warm hover:scale-[1.02] hover:-translate-y-0.5',
                metric.bgColor,
                metric.borderColor,
                metric.hoverBg,
                metric.hoverBorder
              )}
            >
              <Icon className={cn('h-5 w-5 mb-2', metric.iconColor)} />
              <span className={cn('text-xl mb-0.5 leading-tight font-bold', metric.valueColor)}>
                {metric.value.toLocaleString()}
              </span>
              <span className="text-[10px] text-muted-foreground dark:text-muted-foreground font-semibold uppercase tracking-wide mt-0.5 text-center leading-tight">
                {metric.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
