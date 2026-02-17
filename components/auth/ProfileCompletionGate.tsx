'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { createUserDocument, getUserProfile, isProfileComplete, updateUserProfile } from '@/lib/firebase/users';
import { ProfileCompletionModal } from '@/components/auth/ProfileCompletionModal';

/**
 * Global-ish gate for authenticated areas.
 *
 * Purpose:
 * - Ensure every authenticated user has a usable marketplace profile (name, phone, location)
 *   especially for Google sign-ins where these fields are often missing.
 * - Keep Firestore `users/{uid}.emailVerified` in sync with Firebase Auth `user.emailVerified`.
 *
 * NOTE: This intentionally does NOT run on public pages.
 */
export function ProfileCompletionGate() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, initialized } = useAuth();

  const [open, setOpen] = useState(false);
  const checkingRef = useRef(false);

  // Use open directly so the modal doesn't flash closed when refresh() runs again (e.g. effect re-run).
  // Previously "open && !checking" caused a visible flash: setChecking(true) hid the modal, then it reappeared.
  const gateOpen = open;

  const isAuthedArea = useMemo(() => {
    // Only enforce inside authenticated app areas; avoid popping modals while browsing public pages.
    return pathname?.startsWith('/dashboard') || pathname?.startsWith('/seller');
  }, [pathname]);

  const refresh = useCallback(async () => {
    if (!user?.uid) return;
    // Avoid duplicate concurrent checks so we don't race and flash the modal.
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      // Ensure the user doc exists (Google sign-in/login paths try to do this, but be defensive).
      await createUserDocument(user);

      const profile = await getUserProfile(user.uid);

      // Keep emailVerified in sync (prevents stale Firestore profile flags).
      if (profile && typeof profile.emailVerified === 'boolean' && profile.emailVerified !== user.emailVerified) {
        await updateUserProfile(user.uid, { emailVerified: user.emailVerified });
      }

      const complete = isProfileComplete(profile);
      setOpen(!complete);
    } catch {
      // If profile checks fail (offline, rules, transient), don't hard-block the app with a modal.
      setOpen(false);
    } finally {
      checkingRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (!isAuthedArea) return;
    if (!initialized || loading) return;
    if (!user) {
      setOpen(false);
      return;
    }
    refresh();
  }, [isAuthedArea, initialized, loading, user, refresh]);

  // Signal other UI (e.g. tour prompt) to wait until profile completion modal is done.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('ui:profile-completion-gate-open:v1', gateOpen ? '1' : '0');
    } catch {
      // ignore
    }
    try {
      window.dispatchEvent(
        new CustomEvent('we:profile-completion-gate', {
          detail: { open: gateOpen },
        })
      );
    } catch {
      // ignore
    }
  }, [gateOpen]);

  if (!isAuthedArea) return null;
  if (!initialized || loading) return null;
  if (!user) return null;

  return (
    <ProfileCompletionModal
      open={gateOpen}
      userId={user.uid}
      userEmail={user.email || ''}
      userDisplayName={user.displayName || undefined}
      onComplete={() => {
        setOpen(false);
        // Let other UI know the user just completed the profile gate (useful to show a "want a tour?" prompt next).
        try {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('ui:profile-completion-gate-just-completed:v1', String(Date.now()));
            // Re-arm the post-profile tour prompt (it will self-consume after the user responds).
            // If they’ve already consumed it, we leave it consumed.
            if (window.localStorage.getItem('ui:tour-prompt-after-profile-consumed:v1') !== '1') {
              // no-op: presence of the timestamp is the "armed" signal
            }
            window.dispatchEvent(
              new CustomEvent('we:profile-completion-gate', {
                detail: { open: false, justCompleted: true },
              })
            );
          }
        } catch {
          // ignore
        }
        refresh();
        // Redirect to seller overview (same on desktop and mobile).
        router.replace('/seller/overview');
      }}
    />
  );
}

