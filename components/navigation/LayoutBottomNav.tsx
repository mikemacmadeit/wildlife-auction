'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { LucideIcon } from 'lucide-react';

export type LayoutBottomNavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon | React.ComponentType<{ className?: string }>;
  badge?: number;
};

function isActive(pathname: string | null, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  if (href === '/dashboard/menu') {
    return pathname === '/dashboard/menu' || (pathname?.startsWith('/dashboard/menu/') ?? false);
  }
  if (href === '/dashboard/listings/new') {
    return pathname === '/dashboard/listings/new' || (pathname?.startsWith('/dashboard/listings/new/') ?? false);
  }
  return pathname === href || (pathname?.startsWith(href + '/') ?? false);
}

export function LayoutBottomNav({ items }: { items: LayoutBottomNavItem[] }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const nav = (
    <nav
      className={cn(
        'fixed left-0 right-0 z-[60] md:hidden flex justify-center px-1 pt-2',
        'bottom-0 pb-[max(env(safe-area-inset-bottom),0.25rem)]', // lower; minimal padding above home indicator
      )}
    >
      <div
        className={cn(
          'w-full max-w-[calc(100%-0.25rem)] h-16 rounded-full',
          'border-2 bg-background/98 backdrop-blur-lg',
          'border-primary/30 dark:border-primary/40',
          'shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.15),0_4px_16px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.05)]',
          'dark:bg-card/95 dark:shadow-[0_-4px_32px_-4px_rgba(0,0,0,0.6),0_4px_20px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.05)]',
          'grid grid-cols-5 relative overflow-hidden'
        )}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          const displayLabel = item.shortLabel ?? item.label;

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 transition-colors',
                'hover:bg-primary/10 active:bg-primary/20',
                'min-h-[52px] min-w-[44px] touch-manipulation',
                active ? 'text-primary dark:text-white' : 'text-muted-foreground dark:text-white/90'
              )}
            >
              {/* Sliding bubble pill – animates smoothly between tabs (eBay-style) */}
              {active && (
                <motion.div
                  layoutId="bottom-nav-bubble"
                  className="absolute inset-y-0 left-[2px] right-[2px] rounded-full bg-primary/25 dark:bg-primary/30 border border-primary/40 dark:border-primary/50 pointer-events-none"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <div className="relative z-10">
                <Icon
                  className={cn(
                    'h-5 w-5',
                    active ? 'text-primary dark:text-white' : 'text-muted-foreground dark:text-white/90'
                  )}
                />
                {item.badge != null && item.badge > 0 && (
                  <Badge
                    variant="destructive"
                    className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
                  >
                    {item.badge}
                  </Badge>
                )}
              </div>
              <span
                className={cn(
                  'relative z-10 text-[10px] font-semibold',
                  active ? 'text-primary dark:text-white' : 'text-muted-foreground dark:text-white/90'
                )}
              >
                {displayLabel}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );

  if (!mounted) return null;
  return createPortal(nav, document.body);
}
