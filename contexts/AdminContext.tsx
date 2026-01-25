'use client';

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getUserProfile } from '@/lib/firebase/users';
import { UserRole } from '@/lib/types';

interface AdminContextValue {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  role: UserRole | null;
  loading: boolean;
}

const AdminContext = createContext<AdminContextValue>({
  isAdmin: false,
  isSuperAdmin: false,
  role: null,
  loading: true,
});

/**
 * Provider that manages admin status for the entire app
 * This prevents multiple useAdmin hook calls from making redundant Firestore requests
 */
export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const checkingRef = useRef(false);

  useEffect(() => {
    async function checkAdminStatus() {
      // Prevent concurrent checks
      if (checkingRef.current) return;
      
      if (!user) {
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setRole(null);
        setLoading(false);
        return;
      }

      checkingRef.current = true;
      try {
        // 1) Prefer Firebase Auth custom claims if present (fast + avoids Firestore doc drift)
        try {
          const tokenResult = await user.getIdTokenResult();
          const claimRole = (tokenResult?.claims as any)?.role as UserRole | undefined;
          const claimSuper = (tokenResult?.claims as any)?.superAdmin === true;

          if (claimRole === 'admin' || claimRole === 'super_admin' || claimSuper) {
            const effectiveRole: UserRole = claimRole === 'admin' || claimRole === 'super_admin'
              ? claimRole
              : 'super_admin';
            setRole(effectiveRole);
            setIsAdmin(true);
            setIsSuperAdmin(effectiveRole === 'super_admin' || claimSuper);
            setLoading(false);
            checkingRef.current = false;
            return;
          }
        } catch (e) {
          // If token claim read fails, fall back to Firestore.
          if (process.env.NODE_ENV !== 'production') {
            console.warn('useAdmin - Failed to read token claims, falling back to Firestore', e);
          }
        }

        // 2) Fallback: Firestore user profile
        const profile = await getUserProfile(user.uid);
        
        if (process.env.NODE_ENV !== 'production') {
          console.log('useAdmin - User profile:', {
            userId: user.uid,
            email: user.email,
            role: profile?.role,
            superAdmin: profile?.superAdmin,
          });
        }
        
        // Check role field first (new system)
        if (profile?.role) {
          const userRole = profile.role;
          if (process.env.NODE_ENV !== 'production') {
            console.log('useAdmin - Found role:', userRole);
          }
          setRole(userRole);
          setIsAdmin(userRole === 'admin' || userRole === 'super_admin');
          setIsSuperAdmin(userRole === 'super_admin');
        } 
        // Fallback to legacy superAdmin flag
        else if (profile?.superAdmin) {
          if (process.env.NODE_ENV !== 'production') {
            console.log('useAdmin - Found legacy superAdmin flag');
          }
          setRole('super_admin');
          setIsAdmin(true);
          setIsSuperAdmin(true);
        } 
        // Default to regular user
        else {
          if (process.env.NODE_ENV !== 'production') {
            console.log('useAdmin - No admin role found, defaulting to user');
          }
          setRole('user');
          setIsAdmin(false);
          setIsSuperAdmin(false);
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
        setRole(null);
        setIsAdmin(false);
        setIsSuperAdmin(false);
      } finally {
        setLoading(false);
        checkingRef.current = false;
      }
    }

    if (!authLoading) {
      checkAdminStatus();
    }
  }, [user, authLoading]);

  const value: AdminContextValue = {
    isAdmin,
    isSuperAdmin,
    role,
    loading: loading || authLoading,
  };

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

/**
 * Hook to access admin status from context
 * This replaces the useAdmin hook to prevent redundant calls
 */
export function useAdmin() {
  return useContext(AdminContext);
}
