'use client';

import React, { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { Home, LayoutGrid, PlusCircle, Compass, Bell } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { LayoutBottomNav } from '@/components/navigation/LayoutBottomNav';
import type { LayoutBottomNavItem } from '@/components/navigation/LayoutBottomNav';

/**
 * Renders the mobile bottom nav on public routes (e.g. home, browse) when the user is signed in.
 * Dashboard and seller routes have their own layout with bottom nav, so we skip those.
 */
export function MobileBottomNavWhenSignedIn() {
  const pathname = usePathname();
  const { user } = useAuth();

  const items = useMemo<LayoutBottomNavItem[]>(
    () => [
      { href: '/', label: 'Home', shortLabel: 'Home', icon: Home },
      { href: '/dashboard/menu', label: 'Dashboard', shortLabel: 'Dashboard', icon: LayoutGrid },
      { href: '/dashboard/listings/new', label: 'Sell', shortLabel: 'Sell', icon: PlusCircle },
      { href: '/browse', label: 'Buy', shortLabel: 'Buy', icon: Compass },
      { href: '/dashboard/notifications', label: 'Alerts', shortLabel: 'Alerts', icon: Bell },
    ],
    []
  );

  if (!user) return null;
  // Dashboard and seller layouts already render their own bottom nav
  if (pathname?.startsWith('/dashboard') || pathname?.startsWith('/seller')) return null;

  return <LayoutBottomNav items={items} />;
}
