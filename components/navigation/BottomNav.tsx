'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, PlusCircle, Package, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const navItems = [
  { href: '/browse', label: 'Browse', icon: Search },
  { href: '/dashboard/listings/new', label: 'Sell', icon: PlusCircle },
  { href: '/dashboard/orders', label: 'Purchases', icon: Package },
  { href: '/dashboard/account', label: 'Account', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const nav = (
    <nav
      className={cn(
        // Render via portal so it stays truly fixed even if a parent has transforms (mobile bug).
        'fixed bottom-0 left-0 right-0 z-[60] md:hidden pb-safe',
        'border-t border-border/40 bg-background/80 backdrop-blur-md'
      )}
    >
      <div className="grid grid-cols-4 h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 transition-colors',
                'hover:bg-muted/50 active:bg-muted',
                'min-h-[44px] touch-manipulation',
                isActive && 'text-[hsl(90_12%_45%)] dark:text-[hsl(80_15%_70%)]'
              )}
            >
              <Icon
                className={cn(
                  'h-5 w-5',
                  isActive ? 'text-[hsl(90_12%_45%)] dark:text-[hsl(80_15%_70%)]' : 'text-muted-foreground'
                )}
              />
              <span
                className={cn(
                  'text-xs font-medium',
                  isActive ? 'text-[hsl(90_12%_45%)] dark:text-[hsl(80_15%_70%)]' : 'text-muted-foreground'
                )}
              >
                {item.label}
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
