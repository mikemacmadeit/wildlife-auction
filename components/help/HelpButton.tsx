'use client';

import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function HelpButton(props: {
  onClick: () => void;
  className?: string;
  label?: string;
}) {
  const { onClick, className, label = 'Help' } = props;
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className={cn(
        'h-10 rounded-full px-3 gap-2 shadow-sm bg-background/90 backdrop-blur border-border/60',
        'hover:bg-muted/60',
        className
      )}
      aria-label="Open help"
    >
      <HelpCircle className="h-4 w-4" />
      <span className="text-sm font-semibold">{label}</span>
    </Button>
  );
}

