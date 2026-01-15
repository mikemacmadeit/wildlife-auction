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
  type: 'verified' | 'transport';
  className?: string;
  showTooltip?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const badgeConfig = {
    verified: {
      icon: CheckCircle2,
      label: 'Verified Eligible',
      description: 'Listing verified by Wildlife Exchange. Seller identity confirmed and eligible to trade.',
      // Sage in light mode, Olive in dark mode for verified
      color: 'text-foreground bg-primary/15 border-primary/30 dark:bg-primary/20 dark:border-primary/40',
      iconColor: 'text-primary dark:text-primary/90',
    },
  transport: {
    icon: Truck,
    label: 'Transport Ready',
    description: 'Seller can arrange or coordinate transport. Quote available before purchase.',
    // Olive accent for transport - soft chip
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
  size = 'md' 
}: StatusBadgeProps) {
  const config = badgeConfig[type];
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;

  const badge = (
    <div
      className={cn(
        'inline-flex items-center rounded-full border font-medium',
        config.color,
        sizeStyles.container,
        className
      )}
    >
      <Icon className={cn(config.iconColor, sizeStyles.icon)} />
      <span className={cn(sizeStyles.text)}>{config.label}</span>
    </div>
  );

  if (showTooltip) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="font-medium mb-1">{config.label}</p>
            <p className="text-xs text-muted-foreground">{config.description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
}

interface TrustBadgesProps {
  verified?: boolean;
  transport?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showTooltips?: boolean;
}

export function TrustBadges({
  verified = false,
  transport = false,
  className,
  size = 'md',
  showTooltips = true,
}: TrustBadgesProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {verified && (
        <StatusBadge type="verified" size={size} showTooltip={showTooltips} />
      )}
      {transport && (
        <StatusBadge type="transport" size={size} showTooltip={showTooltips} />
      )}
    </div>
  );
}
