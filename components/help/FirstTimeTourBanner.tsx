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
  className?: string;
}) {
  const { uid, helpKey, onStartTour, className } = props;
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const state = await getHelpBannerState(uid, helpKey);
      if (cancelled) return;
      setVisible(state.dismissedTourBanner !== true);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, helpKey]);

  if (!ready || !visible) return null;

  return (
    <div className={cn('rounded-xl border-2 border-border/50 bg-card p-4 sm:p-5 shadow-sm', className)}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm sm:text-base font-extrabold text-foreground">
              Want a 30-second tour?
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              We’ll point out the key controls on this page. Nothing will auto-run unless you click Start tour.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <Button
            type="button"
            className="min-h-[44px] font-semibold"
            onClick={async () => {
              // If they start (or later exit/complete) we never want to show this banner again.
              await setTourBannerDismissed(uid, helpKey);
              setVisible(false);
              onStartTour();
            }}
          >
            Start tour
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px] font-semibold"
            onClick={async () => {
              await setTourBannerDismissed(uid, helpKey);
              setVisible(false);
            }}
          >
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}

