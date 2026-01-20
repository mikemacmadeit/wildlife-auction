'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { getUserProfile } from '@/lib/firebase/users';
import { LEGAL_VERSIONS } from '@/lib/legal/versions';

interface RequireAuthProps {
  children: React.ReactNode;
}

/**
 * Client-side route protection component
 * Redirects to /login if user is not authenticated
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

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
    return null; // Will redirect via useEffect
  }

  return <>{children}</>;
}
