'use client';

import { createContext, useContext, type ReactNode } from 'react';

export interface DashboardBadges {
  messages: number;
  notifications: number;
  offers: number;
  todo: number;
  adminNotifications: number;
  supportTickets: number;
  pendingApprovals: number;
  pendingBreederPermits: number;
}

const defaultBadges: DashboardBadges = {
  messages: 0,
  notifications: 0,
  offers: 0,
  todo: 0,
  adminNotifications: 0,
  supportTickets: 0,
  pendingApprovals: 0,
  pendingBreederPermits: 0,
};

const DashboardBadgesContext = createContext<DashboardBadges>(defaultBadges);

export function DashboardBadgesProvider({
  value,
  children,
}: {
  value: DashboardBadges;
  children: ReactNode;
}) {
  return (
    <DashboardBadgesContext.Provider value={value}>
      {children}
    </DashboardBadgesContext.Provider>
  );
}

export function useDashboardBadges(): DashboardBadges {
  return useContext(DashboardBadgesContext);
}

/** Total of notifications + messages + offers for mobile bottom nav Notifications badge */
export function useDashboardAlertsTotal(): number {
  const { notifications, messages, offers } = useDashboardBadges();
  return notifications + messages + offers;
}
