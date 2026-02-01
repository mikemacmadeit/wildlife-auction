'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { reloadCurrentUser } from '@/lib/firebase/auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  /** Increments when refreshUser() runs; use so UI re-renders with updated user (e.g. emailVerified). */
  refreshKey: number;
  /** Refresh auth user from Firebase (e.g. after email verification in another tab). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  initialized: false,
  refreshKey: 0,
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshUser = useCallback(async () => {
    if (!auth.currentUser) return;
    await reloadCurrentUser();
    // Firebase updates the user object in place; keep the real User so getIdToken/getIdTokenResult work.
    // Bump refreshKey so consumers re-render and see updated emailVerified etc.
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
      setInitialized(true);
    });

    return () => unsubscribe();
  }, []);

  // Ensure a Firestore `users/{uid}` doc exists for every signed-in user (server-side, rules-independent).
  // This unblocks admin tooling (Users directory) and keeps `publicProfiles` / `userSummaries` warm.
  // Skip during email registration so bootstrap doesn't create a minimal doc before createUserDocument.
  useEffect(() => {
    if (!initialized) return;
    if (!user?.uid) return;
    const regKey = 'we:registration-in-progress:v1';
    try {
      if (sessionStorage.getItem(regKey) === '1') {
        sessionStorage.removeItem(regKey);
        return;
      }
    } catch {
      /* ignore */
    }

    const key = `we:bootstrap-user:v1:${user.uid}`;
    try {
      if (sessionStorage.getItem(key) === '1') return;
      sessionStorage.setItem(key, '1');
    } catch {
      // ignore storage failures
    }

    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        if (cancelled) return;
        await fetch('/api/auth/bootstrap-user', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}` },
        }).catch(() => null);
      } catch {
        // best-effort; ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialized, user?.uid]);

  return (
    <AuthContext.Provider value={{ user, loading, initialized, refreshKey, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
