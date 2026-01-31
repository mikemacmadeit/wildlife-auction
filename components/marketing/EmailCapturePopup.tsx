/**
 * EmailCapturePopup
 *
 * - Shows after 12s on first eligible visit OR on exit intent (desktop)
 * - Cooldown via localStorage (14 days) + never show after subscribed
 * - Accessible: Radix Dialog focus trap, ESC, outside click, aria-modal
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, Sparkles } from 'lucide-react';

const DISMISSED_KEY = 'we_email_capture_dismissed';
const SUBSCRIBED_KEY = 'we_email_capture_subscribed';
const SEEN_SESSION_KEY = 'we_email_capture_seen_session';

function isEmail(email: string): boolean {
  // Light client-side validation; server is authoritative.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function canUseDOM(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function shouldSuppressPopup(): boolean {
  if (!canUseDOM()) return true;
  try {
    // Session-level guard: if it already showed once this session, don't re-open repeatedly
    // when navigating between route groups that mount/unmount this component.
    try {
      const seen = window.sessionStorage?.getItem(SEEN_SESSION_KEY);
      if (seen === 'true') return true;
    } catch {
      // ignore
    }

    const subscribed = window.localStorage.getItem(SUBSCRIBED_KEY);
    if (subscribed === 'true') return true;
    const dismissedAt = window.localStorage.getItem(DISMISSED_KEY);
    // New behavior: if a user dismisses the popup, do not show it again (ever) on this device.
    // Back-compat: older versions stored a timestamp; treat any value as dismissed.
    if (!dismissedAt) return false;
    return true;
  } catch {
    return false;
  }
}

export function EmailCapturePopup(props: { source?: string }) {
  const { source = 'popup' } = props;

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shownRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const openRef = useRef(false);
  const successRef = useRef(false);

  const eligible = useMemo(() => !shouldSuppressPopup(), []);

  const markDismissed = useCallback(() => {
    if (!canUseDOM()) return;
    try {
      window.localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // ignore
    }
  }, []);

  const markSubscribed = useCallback(() => {
    if (!canUseDOM()) return;
    try {
      window.localStorage.setItem(SUBSCRIBED_KEY, 'true');
    } catch {
      // ignore
    }
  }, []);

  const markSeenThisSession = useCallback(() => {
    if (!canUseDOM()) return;
    try {
      window.sessionStorage?.setItem(SEEN_SESSION_KEY, 'true');
    } catch {
      // ignore
    }
  }, []);

  const showOnce = useCallback(() => {
    if (!eligible) return;
    if (shownRef.current) return;
    shownRef.current = true;
    // Prevent repeated popups if this component unmounts/remounts during navigation (mobile is especially prone).
    markSeenThisSession();
    setOpen(true);
  }, [eligible, markSeenThisSession]);

  // 12 second delay
  useEffect(() => {
    if (!canUseDOM()) return;
    if (!eligible) return;
    if (shownRef.current) return;
    timerRef.current = window.setTimeout(() => {
      showOnce();
    }, 12_000);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [eligible, showOnce]);

  // Exit intent (desktop): mouse leaving top
  useEffect(() => {
    if (!canUseDOM()) return;
    if (!eligible) return;
    if (shownRef.current) return;

    const onMouseOut = (e: MouseEvent) => {
      // Only trigger if leaving to top
      if (e.clientY <= 0) {
        showOnce();
      }
    };
    window.addEventListener('mouseout', onMouseOut);
    return () => window.removeEventListener('mouseout', onMouseOut);
  }, [eligible, showOnce]);

  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next && !success) {
        // Only mark dismissed if they close without subscribing
        markDismissed();
      }
    },
    [markDismissed, success]
  );

  const submit = useCallback(async () => {
    setError(null);
    const trimmed = email.trim();
    if (!isEmail(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/marketing/newsletter/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: trimmed, source }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError(data?.error || 'Could not subscribe right now. Please try again.');
        return;
      }

      setSuccess(true);
      markSubscribed();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [email, markSubscribed, source]);

  // Track open/success in refs so we can safely mark dismissal if the component unmounts while open.
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    successRef.current = success;
  }, [success]);

  // If the popup is open and the user navigates away (this component can unmount between route groups),
  // treat it as dismissed so it doesn’t keep popping up repeatedly.
  useEffect(() => {
    return () => {
      try {
        if (openRef.current && !successRef.current) {
          markDismissed();
          markSeenThisSession();
        }
      } catch {
        // ignore
      }
    };
  }, [markDismissed, markSeenThisSession]);

  if (!eligible) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[460px] h-[90vh] max-h-[90vh] p-0 overflow-hidden border-border/60 shadow-2xl sm:w-full flex flex-col">
        {/* Soft header band for visual polish */}
        <div className="relative px-4 sm:px-7 pt-4 sm:pt-7 pb-4 sm:pb-5 border-b bg-gradient-to-b from-primary/10 via-background to-background">
          <div className="absolute inset-0 pointer-events-none rounded-t-lg overflow-hidden">
            <div className="absolute -top-24 -right-24 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
          </div>

          <DialogHeader className="text-left relative">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 h-9 w-9 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                <Mail className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-lg sm:text-[22px] leading-tight font-extrabold tracking-tight break-words">
                  Get listings before they hit the feed
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs sm:text-sm leading-relaxed break-words">
                  Weekly drops, new ranch inventory, and market insights. <span className="font-semibold">Texas-only.</span>
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <div className="p-4 sm:p-7 overflow-y-auto min-h-0 flex-1">
          {success ? (
            <div className="mt-5 space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold">You’re in. Check your inbox soon.</p>
                  <p className="text-sm text-muted-foreground">
                    Welcome to the drops list.
                  </p>
                </div>
              </div>
              <div className="pt-2">
                <Button
                  className="w-full min-h-[48px]"
                  onClick={() => {
                    setOpen(false);
                  }}
                >
                  Done
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="we-email" className="text-sm font-semibold">
                  Email
                </Label>
                <div className="rounded-xl sm:rounded-2xl border bg-muted/20 p-2">
                  <div className="flex flex-col gap-2">
                  <Input
                    id="we-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (!submitting) submit();
                      }
                    }}
                    className={[
                      'min-h-[44px] sm:min-h-[48px] text-base bg-background w-full',
                      error ? 'border-destructive focus-visible:ring-destructive' : '',
                    ].join(' ')}
                  />
                  <Button
                    className="min-h-[44px] sm:min-h-[48px] w-full sm:min-w-[132px] font-semibold"
                    onClick={submit}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Subscribing…
                      </>
                    ) : (
                      'Subscribe'
                    )}
                  </Button>
                  </div>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>

              <div className="rounded-lg sm:rounded-xl border bg-muted/30 p-3 sm:p-3.5">
                <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed break-words">
                  No spam. Just the best auctions, breeder inventory, and ranch deals—delivered weekly.
                </p>
              </div>

              <div className="pt-2 border-t">
                <p className="text-[10px] sm:text-[11px] leading-relaxed text-muted-foreground break-words">
                  By subscribing, you agree to receive emails from Agchange. Unsubscribe anytime.{' '}
                  <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
                    Privacy
                  </Link>{' '}
                  ·{' '}
                  <Link href="/trust" className="underline underline-offset-2 hover:text-foreground">
                    Trust &amp; Compliance
                  </Link>
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

