'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
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
  const { user, loading, initialized } = useAuth();

  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);

  const isAuthedArea = useMemo(() => {
    // Only enforce inside authenticated app areas; avoid popping modals while browsing public pages.
    return pathname?.startsWith('/dashboard') || pathname?.startsWith('/seller');
  }, [pathname]);

  const refresh = useCallback(async () => {
    if (!user?.uid) return;
    setChecking(true);
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
      setChecking(false);
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

  if (!isAuthedArea) return null;
  if (!initialized || loading) return null;
  if (!user) return null;

  return (
    <ProfileCompletionModal
      open={open && !checking}
      userId={user.uid}
      userEmail={user.email || ''}
      userDisplayName={user.displayName || undefined}
      onComplete={() => {
        setOpen(false);
        // Re-check in background to ensure the Firestore doc is now complete.
        refresh();
      }}
    />
  );
}

