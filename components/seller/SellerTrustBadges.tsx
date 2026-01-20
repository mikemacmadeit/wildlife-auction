'use client';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { BadgeCheck, FileText, ShieldCheck, Shield } from 'lucide-react';
import type { SellerBadgeId } from '@/lib/types';
import { badgeIdsToDefinitions } from '@/lib/seller/badges';

const ICON_BY_ID: Partial<Record<SellerBadgeId, any>> = {
  verified_seller: BadgeCheck,
  identity_verified: ShieldCheck,
  stripe_payouts_enabled: ShieldCheck,
  stripe_payments_enabled: ShieldCheck,
  tpwd_breeder_permit_verified: Shield,
};

export function SellerTrustBadges(props: {
  badgeIds: SellerBadgeId[] | null | undefined;
  className?: string;
}) {
  const defs = badgeIdsToDefinitions(Array.isArray(props.badgeIds) ? props.badgeIds : []);
  if (defs.length === 0) return null;

  return (
    <TooltipProvider>
      <div className={cn('flex flex-wrap gap-2', props.className)}>
        {defs.map((b) => {
          const Icon = ICON_BY_ID[b.id] || BadgeCheck;
          return (
            <Tooltip key={b.id} delayDuration={150}>
              <TooltipTrigger asChild>
                <div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'px-2 py-1 h-auto text-[11px] font-semibold inline-flex items-center gap-1.5',
                      b.className
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {b.label}
                  </Badge>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs">{b.description}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

