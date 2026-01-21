import * as React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    const isDateLike =
      type === 'date' || type === 'datetime-local' || type === 'time';
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 md:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          'min-h-[48px]', // Mobile-friendly touch target
          // Ensure native date/time controls (calendar/clock icons) respect dark mode.
          // This fixes the browser-rendered icon being dark-on-dark in dark mode.
          isDateLike ? '[color-scheme:light] dark:[color-scheme:dark]' : null,
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
