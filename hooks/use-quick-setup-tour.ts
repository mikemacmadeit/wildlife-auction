'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './use-auth';
import { getUserProfile, isProfileComplete } from '@/lib/firebase/users';
import { LEGAL_VERSIONS } from '@/lib/legal/versions';

const TOUR_DISMISSED_KEY = 'we:quick-setup-tour:dismissed';
const TOUR_COMPLETED_KEY = 'we:quick-setup-tour:completed';
const TOUR_SHOWN_KEY = 'we:quick-setup-tour:shown';

export function useQuickSetupTour() {
  const { user, loading: authLoading } = useAuth();
  const [shouldShow, setShouldShow] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkShouldShow = useCallback(async () => {
    if (!user?.uid || authLoading) {
      setShouldShow(false);
      return;
    }

    // Check if already dismissed or completed
    if (typeof window !== 'undefined') {
      const dismissed = localStorage.getItem(TOUR_DISMISSED_KEY) === '1';
      const completed = localStorage.getItem(TOUR_COMPLETED_KEY) === '1';
      if (dismissed || completed) {
        setShouldShow(false);
        return;
      }
    }

    setChecking(true);
    try {
      const profile = await getUserProfile(user.uid);
      if (!profile) {
        setShouldShow(false);
        return;
      }

      // Check if user has accepted terms (required for tour)
      const hasAcceptedTerms = profile.legal?.tos?.version === LEGAL_VERSIONS.tos.version;
      if (!hasAcceptedTerms) {
        setShouldShow(false);
        return;
      }

      // Check if all steps are already complete
      const profileComplete = isProfileComplete(profile);
      const emailVerified = user.emailVerified === true;
      const stripeConnected = 
        profile.stripeOnboardingStatus === 'complete' &&
        profile.payoutsEnabled === true &&
        profile.chargesEnabled === true;

      // Show tour if at least one step is incomplete
      const allComplete = profileComplete && emailVerified && stripeConnected;
      
      // Check if user is "new" (account created in last 7 days)
      const accountAge = profile.createdAt 
        ? Date.now() - new Date(profile.createdAt).getTime()
        : Infinity;
      const isNewUser = accountAge < 7 * 24 * 60 * 60 * 1000; // 7 days

      // Show if new user and not all complete
      if (isNewUser && !allComplete) {
        // Check if we've already shown it in this session
        const shown = sessionStorage.getItem(TOUR_SHOWN_KEY) === '1';
        if (!shown) {
          setShouldShow(true);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem(TOUR_SHOWN_KEY, '1');
          }
        } else {
          setShouldShow(false);
        }
      } else {
        setShouldShow(false);
      }
    } catch (error) {
      console.error('Error checking tour eligibility:', error);
      setShouldShow(false);
    } finally {
      setChecking(false);
    }
  }, [user, authLoading]);

  useEffect(() => {
    checkShouldShow();
  }, [checkShouldShow]);

  const markDismissed = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOUR_DISMISSED_KEY, '1');
    }
    setShouldShow(false);
  }, []);

  const markCompleted = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(TOUR_COMPLETED_KEY, '1');
    }
    setShouldShow(false);
  }, []);

  return {
    shouldShow,
    checking,
    markDismissed,
    markCompleted,
    refresh: checkShouldShow,
  };
}
