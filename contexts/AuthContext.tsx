'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  initialized: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  initialized: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

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
  useEffect(() => {
    
    if (!initialized) return;
    if (!user?.uid) return;
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
    <AuthContext.Provider value={{ user, loading, initialized }}>
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
