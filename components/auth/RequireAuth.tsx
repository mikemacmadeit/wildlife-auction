'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { getUserProfile } from '@/lib/firebase/users';
import { LEGAL_VERSIONS } from '@/lib/legal/versions';

interface RequireAuthProps {
  children: React.ReactNode;
}

const STRIPE_RETURN_DELAY_MS = 3000;

/**
 * Client-side route protection component
 * Redirects to /login if user is not authenticated.
 * When returning from Stripe (onboarding=complete), waits briefly for Firebase persistence to restore so user is not sent to login.
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [stripeReturnWaitDone, setStripeReturnWaitDone] = useState(false);

  // When returning from Stripe Connect onboarding, give Firebase Auth time to restore from persistence before redirecting to login.
  const isStripeReturn = pathname?.includes('/seller/payouts') && searchParams?.get('onboarding') === 'complete';
  useEffect(() => {
    if (!isStripeReturn) {
      setStripeReturnWaitDone(true);
      return;
    }
    const t = setTimeout(() => setStripeReturnWaitDone(true), STRIPE_RETURN_DELAY_MS);
    return () => clearTimeout(t);
  }, [isStripeReturn]);

  useEffect(() => {
    if (!loading && !user && stripeReturnWaitDone) {
      try {
        const fullPath = pathname + (typeof window !== 'undefined' && window.location?.search ? window.location.search : '');
        if (fullPath && fullPath !== '/login') {
          sessionStorage.setItem('redirectAfterLogin', fullPath);
        }
      } catch {
        /* ignore */
      }
      router.push('/login');
    }
  }, [user, loading, router, pathname, stripeReturnWaitDone]);

  // Enforce latest Terms acceptance for continued use (dashboard + other gated pages).
  useEffect(() => {
    let cancelled = false;
    async function enforceLegalGate() {
      if (!user) return;
      // Don't gate the acceptance page itself, or we'd loop.
      if (pathname?.startsWith('/legal/accept')) return;

      const p = await getUserProfile(user.uid).catch(() => null);
      if (!p) return;
      const required = LEGAL_VERSIONS.tos.version;
      const accepted = p.legal?.tos?.version === required;
      if (!accepted && !cancelled) {
        const next = pathname || '/dashboard';
        router.replace(`/legal/accept?next=${encodeURIComponent(next)}`);
      }
    }
    if (!loading && user) void enforceLegalGate();
    return () => {
      cancelled = true;
    };
  }, [loading, pathname, router, user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // When returning from Stripe onboarding, show "Completing sign-in" during the wait so we don't confuse the user
    const isStripeReturnWaiting = isStripeReturn && !stripeReturnWaitDone;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">
            {isStripeReturnWaiting ? 'Completing sign-in...' : 'Redirecting to login...'}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
