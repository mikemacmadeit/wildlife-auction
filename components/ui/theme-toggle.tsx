'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const current = theme === 'system' ? (document.documentElement.classList.contains('dark') ? 'dark' : 'light') : theme;
    setTheme(current === 'light' ? 'dark' : 'light');
  };

  // Use explicit dimensions so server and client always match (avoids hydration className mismatch).
  const iconButtonClass = 'h-11 w-11 min-w-[44px] min-h-[44px]';

  if (!mounted) {
    // Placeholder matches mounted button structure so hydration is consistent.
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn(iconButtonClass, className)}
        aria-label="Toggle theme"
      >
        <Sun className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={cn(iconButtonClass, className)}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {(theme === 'light' || (theme === 'system' && !document.documentElement.classList.contains('dark'))) ? (
        <Moon className="h-5 w-5" />
      ) : (
        <Sun className="h-5 w-5" />
      )}
    </Button>
  );
}
