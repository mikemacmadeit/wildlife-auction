'use client';

import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export function HelpTooltip(props: {
  text: string;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  const { text, className, side = 'top' } = props;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex items-center justify-center',
              'h-7 w-7 rounded-full border border-border/60 bg-background/70 backdrop-blur',
              'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              className
            )}
            aria-label="Help"
          >
            <Info className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-[280px] text-sm leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

