import { db } from '@/lib/firebase/config';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

type BannerState = {
  dismissedTourBanner?: boolean;
  updatedAt?: any;
};

function lsKey(uid: string | null, helpKey: string) {
  return `help:v1:${uid || 'anon'}:${helpKey}`;
}

/**
 * Read per-page help UI state.
 * Prefers Firestore for authenticated users (cross-device), but safely falls back to localStorage.
 */
export async function getHelpBannerState(uid: string | null, helpKey: string): Promise<BannerState> {
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

  // localStorage fallback (best-effort)
  try {
    if (typeof window === 'undefined') return {};
    const raw = window.localStorage.getItem(lsKey(uid, helpKey));
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
    window.localStorage.setItem(lsKey(uid, helpKey), JSON.stringify({ dismissedTourBanner: true }));
  } catch {
    // ignore
  }
}

