'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Home, LayoutGrid, PlusCircle, Compass, Bell } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { LayoutBottomNav } from '@/components/navigation/LayoutBottomNav';
import type { LayoutBottomNavItem } from '@/components/navigation/LayoutBottomNav';
import {
  subscribeToUnreadCount,
  subscribeToUnreadCountByType,
  subscribeToUnreadCountByTypes,
} from '@/lib/firebase/notifications';
import type { NotificationType } from '@/lib/types';

/**
 * Renders the mobile bottom nav on public routes (e.g. home, browse) when the user is signed in.
 * Alerts badge = notifications + messages + offers (same as dashboard bottom nav).
 * Dashboard and seller routes have their own layout with bottom nav, so we skip those.
 */
export function MobileBottomNavWhenSignedIn() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState(0);
  const [messages, setMessages] = useState(0);
  const [offers, setOffers] = useState(0);

  useEffect(() => {
    if (!user?.uid) return;
    const unsubs: Array<() => void> = [];
    unsubs.push(subscribeToUnreadCount(user.uid, (c) => setNotifications(c ?? 0)));
    unsubs.push(subscribeToUnreadCountByType(user.uid, 'message_received', (c) => setMessages(c ?? 0)));
    const offerTypes: NotificationType[] = [
      'bid_outbid',
      'bid_received',
      'offer_received',
      'offer_countered',
      'offer_accepted',
      'offer_declined',
      'offer_expired',
    ];
    unsubs.push(subscribeToUnreadCountByTypes(user.uid, offerTypes, (c) => setOffers(c ?? 0)));
    return () => unsubs.forEach((fn) => fn());
  }, [user?.uid]);

  const alertsTotal = notifications + messages + offers;

  const items = useMemo<LayoutBottomNavItem[]>(
    () => [
      { href: '/', label: 'Home', shortLabel: 'Home', icon: Home },
      { href: '/dashboard/menu', label: 'Dashboard', shortLabel: 'Dashboard', icon: LayoutGrid },
      { href: '/dashboard/listings/new', label: 'Sell', shortLabel: 'Sell', icon: PlusCircle },
      { href: '/browse', label: 'Buy', shortLabel: 'Buy', icon: Compass },
      {
        href: '/dashboard/notifications',
        label: 'Alerts',
        shortLabel: 'Alerts',
        icon: Bell,
        badge: alertsTotal > 0 ? alertsTotal : undefined,
      },
    ],
    [alertsTotal]
  );

  if (!user) return null;
  // Dashboard and seller layouts already render their own bottom nav
  if (pathname?.startsWith('/dashboard') || pathname?.startsWith('/seller') || pathname?.startsWith('/delivery')) return null;

  return <LayoutBottomNav items={items} />;
}
