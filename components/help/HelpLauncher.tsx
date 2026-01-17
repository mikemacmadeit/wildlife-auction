'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { HelpButton } from '@/components/help/HelpButton';
import { HelpPanel } from '@/components/help/HelpPanel';
import { FirstTimeTourBanner } from '@/components/help/FirstTimeTourBanner';
import { TourOverlay } from '@/components/help/TourOverlay';
import { HELP_CONTENT } from '@/help/helpContent';
import { TOURS } from '@/help/tours';
import { getHelpKeyForPathname } from '@/lib/help/helpKeys';
import { getHelpBannerState, setTourBannerDismissed, setTourSeen } from '@/lib/help/helpState';
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
  const [tourSeen, setTourSeenState] = useState<boolean>(false);
  const [tourBannerDismissed, setTourBannerDismissedState] = useState<boolean>(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!helpKey) {
        if (!cancelled) {
          setTourSeenState(false);
          setTourBannerDismissedState(false);
          setReady(true);
        }
        return;
      }
      const s = await getHelpBannerState(uid, helpKey);
      if (cancelled) return;
      setTourSeenState(s.tourSeen === true);
      setTourBannerDismissedState(s.dismissedTourBanner === true);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, helpKey]);

  const dismissTourBanner = async () => {
    if (!helpKey) return;
    await setTourBannerDismissed(uid, helpKey);
    setTourBannerDismissedState(true);
  };

  const markTourSeen = async () => {
    if (!helpKey) return;
    await setTourSeen(uid, helpKey);
    setTourSeenState(true);
  };

  const topOffset = useMemo(() => {
    // Public pages have the sticky navbar (h-20). Keep the help button below it.
    if (!pathname) return 'top-24';
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/seller')) return 'top-4';
    return 'top-24';
  }, [pathname]);

  // Don’t show on auth pages to reduce noise.
  const hideOnAuthPages = pathname === '/login' || pathname === '/register';
  if (hideOnAuthPages) return null;

  // Refine help scope: only show on pages with curated help content.
  // Also: never show on homepage (per request).
  if (pathname === '/') return null;
  if (!helpKey) return null;
  if (!ready) return null;

  // Seller overview: we want tour-only (no floating help button / panel).
  const tourOnly = helpKey === 'seller_overview';

  return (
    <>
      {/* Persistent launcher (consistent placement, minimal overlap risk) */}
      {!tourOnly ? (
        <div className={cn('fixed right-4 z-[60]', topOffset)}>
          <HelpButton onClick={() => setOpen(true)} />
        </div>
      ) : null}

      {/* First-time banner (only shows on pages with a tour) */}
      {helpKey && tour?.steps?.length && tourSeen !== true && tourBannerDismissed !== true ? (
        <div className="fixed bottom-20 md:bottom-6 left-0 right-0 z-[55] px-4">
          <div className="container mx-auto max-w-4xl">
            <FirstTimeTourBanner
              uid={uid}
              helpKey={helpKey}
              onStartTour={() => setTourOpen(true)}
              // If they click "Not now", persist dismissal and stop showing the banner.
              className=""
            />
          </div>
        </div>
      ) : null}

      {!tourOnly ? (
        <HelpPanel
          open={open}
          onOpenChange={setOpen}
          content={content}
          showStartTour={!!tour?.steps?.length && tourSeen !== true}
          onStartTour={() => {
            // Tour should only ever open once (even if user clicks Start tour).
            void markTourSeen();
            setOpen(false);
            setTourOpen(true);
          }}
        />
      ) : null}

      {tour?.steps?.length ? (
        <TourOverlay
          open={tourOpen}
          title={tour.title}
          steps={tour.steps}
          onClose={() => {
            // If they complete OR exit, don't show the tour popup again for this page.
            void markTourSeen();
            setTourOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

