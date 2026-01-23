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
  const [profileGateOpen, setProfileGateOpen] = useState<boolean>(false);
  const [tourPromptArmed, setTourPromptArmed] = useState<boolean>(false);

  const consumeTourPrompt = () => {
    try {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem('ui:tour-prompt-after-profile-consumed:v1', '1');
      window.localStorage.removeItem('ui:profile-completion-gate-just-completed:v1');
    } catch {
      // ignore
    }
    setTourPromptArmed(false);
  };

  // If the profile completion modal is open, suppress the tour prompt until it's finished.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const readInitial = () => {
      try {
        const raw = window.localStorage.getItem('ui:profile-completion-gate-open:v1');
        setProfileGateOpen(raw === '1');
      } catch {
        setProfileGateOpen(false);
      }

      // Only show the tour opt-in prompt immediately after profile completion, once.
      try {
        const consumed = window.localStorage.getItem('ui:tour-prompt-after-profile-consumed:v1') === '1';
        const justCompleted = window.localStorage.getItem('ui:profile-completion-gate-just-completed:v1');
        setTourPromptArmed(!consumed && !!justCompleted);
      } catch {
        setTourPromptArmed(false);
      }
    };

    readInitial();

    const onGate = (e: any) => {
      const open = e?.detail?.open === true;
      setProfileGateOpen(open);
      if (e?.detail?.justCompleted === true) {
        try {
          const consumed = window.localStorage.getItem('ui:tour-prompt-after-profile-consumed:v1') === '1';
          if (!consumed) setTourPromptArmed(true);
        } catch {
          setTourPromptArmed(true);
        }
      }
    };

    window.addEventListener('we:profile-completion-gate', onGate as any);
    return () => window.removeEventListener('we:profile-completion-gate', onGate as any);
  }, []);

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

  // Bottom-right positioning for mobile safety (above bottom nav on mobile)
  // Also account for ScrollToTop button on browse page (bottom-24 mobile, bottom-8 desktop)
  const bottomOffset = useMemo(() => {
    // On mobile, account for bottom nav (h-16) + safe area + padding
    // On desktop, just use bottom padding
    if (!pathname) return 'bottom-4 md:bottom-6';
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/seller')) return 'bottom-20 md:bottom-6';
    // Browse page: position above ScrollToTop button (which is at bottom-24 mobile, bottom-8 desktop)
    // ScrollToTop is h-12 (48px) mobile, h-14 (56px) desktop
    // Help button is h-10 (40px), so we need:
    // - Mobile: bottom-24 (96px) + 48px + 16px gap = bottom-32 (128px) ✓
    // - Desktop: bottom-8 (32px) + 56px + 16px gap = bottom-28 (112px) to avoid overlap
    if (pathname.startsWith('/browse')) return 'bottom-32 md:bottom-28';
    return 'bottom-4 md:bottom-6';
  }, [pathname]);

  // Don't show on auth pages to reduce noise.
  const hideOnAuthPages = pathname === '/login' || pathname === '/register';
  if (hideOnAuthPages) return null;

  // Never show on homepage (per request).
  if (pathname === '/') return null;

  // Always show HelpLauncher on all pages (not just pages with helpKey)
  // The HelpPanel will show chat and support tabs even without helpKey content
  // Only wait for ready state if we have a helpKey (for tour banner)
  if (helpKey && !ready) return null;

  // Seller overview: we want tour-only (no floating help button / panel).
  const tourOnly = helpKey === 'seller_overview';

  return (
    <>
      {/* Persistent launcher (bottom-right, mobile-safe) */}
      {/* Always show help button, even if no helpKey (for chat and support tabs) */}
      {!tourOnly ? (
        <div className={cn('fixed right-4 z-[60]', bottomOffset)}>
          <HelpButton onClick={() => setOpen(true)} />
        </div>
      ) : null}

      {/* First-time banner (only shows on pages with a tour) */}
      {helpKey &&
      tour?.steps?.length &&
      tourSeen !== true &&
      tourBannerDismissed !== true &&
      !profileGateOpen &&
      tourPromptArmed ? (
        <div className="fixed bottom-20 md:bottom-6 left-0 right-0 z-[55] px-4">
          <div className="container mx-auto max-w-4xl">
            <FirstTimeTourBanner
              uid={uid}
              helpKey={helpKey}
              onDismissed={consumeTourPrompt}
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
            consumeTourPrompt();
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
            consumeTourPrompt();
            setTourOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

