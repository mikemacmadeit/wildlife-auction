'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getHelpBannerState, setTourBannerDismissed } from '@/lib/help/helpState';

export function FirstTimeTourBanner(props: {
  uid: string | null;
  helpKey: string;
  onStartTour: () => void;
  onDismissed?: () => void;
  className?: string;
}) {
  const { uid, helpKey, onStartTour, onDismissed, className } = props;
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const state = await getHelpBannerState(uid, helpKey);
      if (cancelled) return;
      // Banner is only for first-time: once tour is seen OR banner dismissed, never show again.
      setVisible(state.dismissedTourBanner !== true && state.tourSeen !== true);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, helpKey]);

  if (!ready || !visible) return null;

  return (
    <div
      className={cn(
        'rounded-xl border-2 p-4 sm:p-5 shadow-lg',
        'bg-zinc-900 border-zinc-700 text-white',
        'dark:bg-zinc-100 dark:border-zinc-300 dark:text-zinc-900',
        className
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center flex-shrink-0 dark:bg-primary/20 dark:border-primary/40">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm sm:text-base font-extrabold">
              Want a 30-second tour?
            </p>
            <p className="text-xs sm:text-sm text-zinc-400 dark:text-zinc-600 mt-0.5">
              We’ll point out the key controls on this page. Nothing will auto-run unless you click Start tour.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <Button
            type="button"
            className="min-h-[44px] font-semibold"
            onClick={async () => {
              await setTourBannerDismissed(uid, helpKey);
              setVisible(false);
              onDismissed?.();
              onStartTour();
            }}
          >
            Start tour
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px] font-semibold border-zinc-500 text-zinc-200 hover:bg-zinc-800 hover:text-white dark:border-zinc-400 dark:text-zinc-700 dark:hover:bg-zinc-200 dark:hover:text-zinc-900"
            onClick={async () => {
              await setTourBannerDismissed(uid, helpKey);
              setVisible(false);
              onDismissed?.();
            }}
          >
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}

