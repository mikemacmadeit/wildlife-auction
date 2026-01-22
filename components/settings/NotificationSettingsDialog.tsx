/**
 * Notification settings modal (re-uses the existing preferences panel).
 *
 * Goal: give non-technical users a simple, consistent modal entrypoint
 * without duplicating settings logic.
 */

'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { NotificationPreferencesPanel } from '@/components/settings/NotificationPreferencesPanel';

export function NotificationSettingsDialog(props: {
  triggerLabel?: string;
  triggerVariant?: React.ComponentProps<typeof Button>['variant'];
  triggerSize?: React.ComponentProps<typeof Button>['size'];
  className?: string;
}) {
  const { triggerLabel = 'Notification settings', triggerVariant = 'outline', triggerSize = 'default', className } = props;
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={triggerSize} className={className}>
          <Bell className="h-4 w-4 mr-2" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Notification settings</DialogTitle>
        </DialogHeader>
        <NotificationPreferencesPanel embedded />
      </DialogContent>
    </Dialog>
  );
}

