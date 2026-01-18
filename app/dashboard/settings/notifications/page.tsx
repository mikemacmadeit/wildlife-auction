/**
 * /dashboard/settings/notifications
 * User Notification Preferences
 *
 * Kept for deep links, but the same UI is also embedded inside
 * Account & Settings → Notifications.
 */

'use client';

import { NotificationPreferencesPanel } from '@/components/settings/NotificationPreferencesPanel';

export default function NotificationSettingsPage() {
  return <NotificationPreferencesPanel embedded={false} />;
}

