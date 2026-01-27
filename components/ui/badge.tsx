import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary text-primary-foreground hover:bg-primary/90',
        secondary:
          'border-border/50 bg-background/50 text-foreground hover:bg-background/60',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'bg-background/50 border-border/50 text-foreground hover:bg-background/60',
        success:
          'border-transparent bg-green-600 text-white hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700',
        warning:
          'border-amber-500/40 bg-amber-500/15 text-amber-900 dark:text-amber-200 hover:bg-amber-500/25',
        info:
          'border-blue-500/40 bg-blue-500/10 text-blue-900 dark:text-blue-200 hover:bg-blue-500/20',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
