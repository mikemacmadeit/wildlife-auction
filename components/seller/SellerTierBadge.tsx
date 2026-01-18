/**
 * Seller Tier Badge (Seller Tiers)
 * Shows Priority/Premier chips with a disclaimer tooltip.
 */

'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SubscriptionTier } from '@/lib/pricing/subscriptions';
import { getTierLabel } from '@/lib/pricing/subscriptions';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function SellerTierBadge(props: {
  tier: SubscriptionTier | null | undefined;
  className?: string;
}) {
  const { tier, className } = props;
  if (!tier || tier === 'standard') return null;

  const isPremier = tier === 'premier';
  const label = getTierLabel(tier);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] px-2 py-0.5 h-auto font-semibold',
                isPremier
                  ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-700 dark:text-yellow-300'
                  : 'border-primary/30 bg-primary/10 text-primary',
                className
              )}
            >
              {label}
            </Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-xs leading-relaxed">
          Seller tier reflects an optional placement + styling tier and does not indicate regulatory compliance approval.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

