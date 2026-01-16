'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, PlusCircle, Package, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/browse', label: 'Browse', icon: Search },
  { href: '/dashboard/listings/new', label: 'Sell', icon: PlusCircle },
  { href: '/dashboard/orders', label: 'Purchases', icon: Package },
  { href: '/dashboard/account', label: 'Account', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background md:hidden">
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
                'min-h-[44px] touch-manipulation', // Minimum 44px for thumb-friendly
                isActive && 'text-primary'
              )}
            >
              <Icon className={cn(
                'h-5 w-5',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )} />
              <span className={cn(
                'text-xs font-medium',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
