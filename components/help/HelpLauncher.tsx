'use client';

import { useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { HelpButton } from '@/components/help/HelpButton';
import { HelpPanel } from '@/components/help/HelpPanel';
import { FirstTimeTourBanner } from '@/components/help/FirstTimeTourBanner';
import { TourOverlay } from '@/components/help/TourOverlay';
import { HELP_CONTENT } from '@/help/helpContent';
import { TOURS } from '@/help/tours';
import { getHelpKeyForPathname } from '@/lib/help/helpKeys';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';

export function HelpLauncher() {
  const pathname = usePathname();
  const { user } = useAuth();
  const uid = user?.uid || null;

  const helpKey = useMemo(() => getHelpKeyForPathname(pathname), [pathname]);
  const content = useMemo(() => (helpKey ? HELP_CONTENT[helpKey] : null), [helpKey]);
  const tour = useMemo(() => (helpKey ? TOURS[helpKey] : null), [helpKey]);

  const [open, setOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  const topOffset = useMemo(() => {
    // Public pages have the sticky navbar (h-20). Keep the help button below it.
    if (!pathname) return 'top-24';
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/seller')) return 'top-4';
    return 'top-24';
  }, [pathname]);

  // Don’t show on auth pages to reduce noise.
  const hideOnAuthPages = pathname === '/login' || pathname === '/register';
  if (hideOnAuthPages) return null;

  return (
    <>
      {/* Persistent launcher (consistent placement, minimal overlap risk) */}
      <div className={cn('fixed right-4 z-[60]', topOffset)}>
        <HelpButton onClick={() => setOpen(true)} />
      </div>

      {/* First-time banner (only shows on pages with a tour) */}
      {helpKey && tour?.steps?.length ? (
        <div className="fixed bottom-20 md:bottom-6 left-0 right-0 z-[55] px-4">
          <div className="container mx-auto max-w-4xl">
            <FirstTimeTourBanner
              uid={uid}
              helpKey={helpKey}
              onStartTour={() => setTourOpen(true)}
            />
          </div>
        </div>
      ) : null}

      <HelpPanel
        open={open}
        onOpenChange={setOpen}
        content={content}
        showStartTour={!!tour?.steps?.length}
        onStartTour={() => {
          setOpen(false);
          setTourOpen(true);
        }}
      />

      {tour?.steps?.length ? (
        <TourOverlay
          open={tourOpen}
          title={tour.title}
          steps={tour.steps}
          onClose={() => setTourOpen(false)}
        />
      ) : null}
    </>
  );
}

