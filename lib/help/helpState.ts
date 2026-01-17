import { db } from '@/lib/firebase/config';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

type BannerState = {
  dismissedTourBanner?: boolean;
  tourSeen?: boolean;
  updatedAt?: any;
};

function lsKeyUser(uid: string | null, helpKey: string) {
  return `help:v1:user:${uid || 'anon'}:${helpKey}`;
}

// Global per-device fallback so banner dismissal persists even if the user clicks
// "Not now" before auth finishes loading (uid null) or switches accounts.
function lsKeyGlobal(helpKey: string) {
  return `help:v1:global:${helpKey}`;
}

/**
 * Read per-page help UI state.
 * Prefers Firestore for authenticated users (cross-device), but safely falls back to localStorage.
 */
export async function getHelpBannerState(uid: string | null, helpKey: string): Promise<BannerState> {
  // localStorage global first (best-effort): if they've dismissed/seen on this device, respect it.
  try {
    if (typeof window !== 'undefined') {
      const rawGlobal = window.localStorage.getItem(lsKeyGlobal(helpKey));
      if (rawGlobal) {
        const parsed = JSON.parse(rawGlobal) as BannerState;
        if (parsed?.tourSeen === true || parsed?.dismissedTourBanner === true) return parsed;
      }
    }
  } catch {
    // ignore
  }

  // Firestore first (best-effort)
  if (uid) {
    try {
      const ref = doc(db, 'users', uid, 'helpFlags', helpKey);
      const snap = await getDoc(ref);
      if (snap.exists()) return (snap.data() as any) || {};
    } catch {
      // ignore and fall back
    }
  }

  // localStorage user fallback (best-effort)
  try {
    if (typeof window === 'undefined') return {};
    const raw = window.localStorage.getItem(lsKeyUser(uid, helpKey));
    return raw ? (JSON.parse(raw) as BannerState) : {};
  } catch {
    return {};
  }
}

export async function setTourBannerDismissed(uid: string | null, helpKey: string): Promise<void> {
  // Firestore first (best-effort)
  if (uid) {
    try {
      const ref = doc(db, 'users', uid, 'helpFlags', helpKey);
      await setDoc(
        ref,
        { dismissedTourBanner: true, updatedAt: serverTimestamp() },
        { merge: true }
      );
    } catch {
      // ignore and fall back
    }
  }

  // localStorage fallback
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(lsKeyGlobal(helpKey), JSON.stringify({ dismissedTourBanner: true }));
    window.localStorage.setItem(lsKeyUser(uid, helpKey), JSON.stringify({ dismissedTourBanner: true }));
  } catch {
    // ignore
  }
}

/**
 * Mark the tour as "seen" so it never auto-opens or re-opens for this page.
 * This is stricter than dismissing the banner: once seen, we hide Start tour everywhere.
 */
export async function setTourSeen(uid: string | null, helpKey: string): Promise<void> {
  // Firestore first (best-effort)
  if (uid) {
    try {
      const ref = doc(db, 'users', uid, 'helpFlags', helpKey);
      await setDoc(ref, { tourSeen: true, dismissedTourBanner: true, updatedAt: serverTimestamp() }, { merge: true });
    } catch {
      // ignore and fall back
    }
  }

  // localStorage fallback
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(lsKeyGlobal(helpKey), JSON.stringify({ tourSeen: true, dismissedTourBanner: true }));
    window.localStorage.setItem(lsKeyUser(uid, helpKey), JSON.stringify({ tourSeen: true, dismissedTourBanner: true }));
  } catch {
    // ignore
  }
}

