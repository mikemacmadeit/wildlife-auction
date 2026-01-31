'use client';

import { CheckCircle2, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface StatusBadgeProps {
  type: 'verified' | 'transport' | 'delivery_window';
  className?: string;
  showTooltip?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  /** For type 'delivery_window': label shown as-is (e.g. "Next day delivery", "1-3 days"). Omit for generic "Delivery window". */
  deliveryWindowLabel?: string | null;
}

const badgeConfig = {
  verified: {
    icon: CheckCircle2,
    label: 'Verified Eligible',
    description: 'Listing verified by Agchange. Seller identity confirmed and eligible to trade.',
    color: 'text-foreground bg-primary/15 border-primary/30 dark:bg-primary/20 dark:border-primary/40',
    iconColor: 'text-primary dark:text-primary/90',
  },
  transport: {
    icon: Truck,
    label: 'Transport Ready',
    description: 'Buyer and seller coordinate pickup/delivery directly. Agchange does not arrange transport.',
    color: 'text-foreground bg-accent/15 border-accent/30 dark:bg-accent/10 dark:border-accent/25',
    iconColor: 'text-accent dark:text-accent/90',
  },
  delivery_window: {
    icon: Truck,
    label: 'Delivery window',
    description: 'Seller arranges delivery. Timeframe coordinated after purchase.',
    color: 'text-foreground bg-accent/15 border-accent/30 dark:bg-accent/10 dark:border-accent/25',
    iconColor: 'text-accent dark:text-accent/90',
  },
};

const sizeConfig = {
  sm: {
    container: 'px-2 py-1 text-xs gap-1',
    icon: 'h-3 w-3',
    text: 'text-xs',
  },
  md: {
    container: 'px-2.5 py-1.5 text-sm gap-1.5',
    icon: 'h-4 w-4',
    text: 'text-sm',
  },
  lg: {
    container: 'px-3 py-2 text-base gap-2',
    icon: 'h-5 w-5',
    text: 'text-base',
  },
};

export function StatusBadge({
  type,
  className,
  showTooltip = true,
  size = 'md',
  showIcon = true,
  deliveryWindowLabel,
}: StatusBadgeProps) {
  const config = badgeConfig[type];
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;
  const displayLabel =
    type === 'delivery_window' && deliveryWindowLabel?.trim()
      ? deliveryWindowLabel.trim()
      : type === 'delivery_window'
        ? 'Delivery window'
        : config.label;
  const description =
    type === 'delivery_window' && deliveryWindowLabel?.trim()
      ? `Seller arranges delivery. ${deliveryWindowLabel.trim()}. Buyer and seller coordinate after purchase.`
      : config.description;

  const badge = (
    <div
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        config.color,
        sizeStyles.container,
        className
      )}
    >
      {showIcon ? <Icon className={cn(config.iconColor, sizeStyles.icon)} /> : null}
      <span className={cn(sizeStyles.text)}>{displayLabel}</span>
    </div>
  );

  if (showTooltip) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="font-medium mb-1">{displayLabel}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
}

interface TrustBadgesProps {
  /** @deprecated Verified Eligible badge no longer shown. */
  verified?: boolean;
  /** @deprecated Use deliveryWindowLabel instead. When true and no deliveryWindowLabel, shows generic "Delivery window" badge. */
  transport?: boolean;
  /** When set, shows badge with this label only (e.g. "Next day delivery", "1-3 days"). From listing deliveryDetails.deliveryTimeframe. */
  deliveryWindowLabel?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showTooltips?: boolean;
  showIcons?: boolean;
}

export function TrustBadges({
  transport = false,
  deliveryWindowLabel,
  className,
  size = 'md',
  showTooltips = true,
  showIcons = true,
}: TrustBadgesProps) {
  const showDeliveryBadge = deliveryWindowLabel !== undefined && deliveryWindowLabel !== null
    ? true
    : transport;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {showDeliveryBadge && (
        <StatusBadge
          type="delivery_window"
          size={size}
          showTooltip={showTooltips}
          showIcon={showIcons}
          deliveryWindowLabel={deliveryWindowLabel ?? (transport ? '' : undefined)}
        />
      )}
    </div>
  );
}
