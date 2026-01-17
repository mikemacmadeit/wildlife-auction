'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TourStep } from '@/help/tours';

type Rect = { top: number; left: number; width: number; height: number };

function getRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function TourOverlay(props: {
  open: boolean;
  title: string;
  steps: TourStep[];
  onClose: () => void;
}) {
  const { open, title, steps, onClose } = props;
  const [mounted, setMounted] = useState(false);
  const [idx, setIdx] = useState(0);
  const [targetEl, setTargetEl] = useState<Element | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  const activeStep = useMemo(() => steps[idx] || null, [steps, idx]);

  const resolveTarget = useCallback(() => {
    if (!activeStep?.selector) {
      setTargetEl(null);
      setRect(null);
      return;
    }
    const el = document.querySelector(activeStep.selector);
    if (!el) {
      setTargetEl(null);
      setRect(null);
      return;
    }
    setTargetEl(el);
    setRect(getRect(el));
  }, [activeStep?.selector]);

  const goTo = useCallback(
    (nextIdx: number) => {
      const total = steps.length;
      if (total <= 0) return;
      const safe = clamp(nextIdx, 0, total - 1);
      setIdx(safe);
    },
    [steps.length]
  );

  // Mount gate for portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset when opening
  useEffect(() => {
    if (!open) return;
    setIdx(0);
  }, [open]);

  // Resolve and keep the highlight in sync
  useEffect(() => {
    if (!open) return;
    if (!activeStep) return;

    // Find first available step if current target is missing
    const findFirstAvailable = () => {
      for (let i = idx; i < steps.length; i++) {
        const s = steps[i];
        if (!s?.selector) continue;
        if (document.querySelector(s.selector)) return i;
      }
      for (let i = 0; i < idx; i++) {
        const s = steps[i];
        if (!s?.selector) continue;
        if (document.querySelector(s.selector)) return i;
      }
      return null;
    };

    const available = findFirstAvailable();
    if (available === null) {
      // Nothing to show; close gracefully.
      onClose();
      return;
    }
    if (available !== idx) {
      setIdx(available);
      return;
    }

    resolveTarget();
    // Scroll the target into view for a “guided” feel.
    const el = document.querySelector(activeStep.selector);
    try {
      (el as any)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    } catch {
      // ignore
    }

    const onRecalc = () => resolveTarget();
    window.addEventListener('scroll', onRecalc, true);
    window.addEventListener('resize', onRecalc);
    return () => {
      window.removeEventListener('scroll', onRecalc, true);
      window.removeEventListener('resize', onRecalc);
    };
  }, [open, activeStep, idx, steps, resolveTarget, onClose]);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goTo(idx + 1);
      if (e.key === 'ArrowLeft') goTo(idx - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, goTo, idx]);

  if (!open || !mounted || typeof document === 'undefined') return null;
  if (!activeStep) return null;

  const total = steps.length;
  const stepNumber = idx + 1;

  // Tooltip card placement
  const card = (() => {
    const base = { top: 24, left: 24 } as any;
    if (!rect) return base;

    const padding = 12;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const cardW = Math.min(360, viewportW - 32);
    const cardH = Math.min(260, viewportH - 32);

    const preferred = activeStep.placement || 'bottom';
    let top = rect.top;
    let left = rect.left;

    if (preferred === 'bottom') {
      top = rect.top + rect.height + padding;
      left = rect.left;
    } else if (preferred === 'top') {
      top = rect.top - cardH - padding;
      left = rect.left;
    } else if (preferred === 'right') {
      top = rect.top;
      left = rect.left + rect.width + padding;
    } else if (preferred === 'left') {
      top = rect.top;
      left = rect.left - cardW - padding;
    }

    top = clamp(top, 16, viewportH - cardH - 16);
    left = clamp(left, 16, viewportW - cardW - 16);
    return { top, left };
  })();

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      {/* Dim overlay */}
      <div className="absolute inset-0 bg-black/55" onClick={onClose} />

      {/* Highlight ring */}
      {rect && (
        <div
          className="absolute rounded-xl ring-4 ring-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] pointer-events-none"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}

      {/* Tour card */}
      <div
        className={cn(
          'absolute w-[360px] max-w-[calc(100vw-32px)]',
          'rounded-xl border bg-background shadow-2xl',
          'p-4 sm:p-5',
          'max-h-[calc(100vh-32px)] overflow-y-auto'
        )}
        style={{ top: card.top, left: card.left }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {title} • Step {stepNumber}/{total}
            </p>
            <h3 className="text-base font-extrabold text-foreground mt-1">{activeStep.title}</h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{activeStep.body}</p>
          </div>
          <Button variant="ghost" size="icon" className="min-w-[44px] min-h-[44px]" onClick={onClose} aria-label="Close tour">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px] font-semibold"
            onClick={() => goTo(idx - 1)}
            disabled={idx === 0}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          {idx < total - 1 ? (
            <Button type="button" className="min-h-[44px] font-semibold" onClick={() => goTo(idx + 1)}>
              Next <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button type="button" className="min-h-[44px] font-semibold" onClick={onClose}>
              Done
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

