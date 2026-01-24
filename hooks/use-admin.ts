import { useAuth } from './use-auth';
import { useEffect, useState } from 'react';
import { getUserProfile } from '@/lib/firebase/users';
import { UserRole } from '@/lib/types';

/**
 * Hook to check if current user is an admin
 */
export function useAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);

  useEffect(() => {
    
    async function checkAdminStatus() {
      if (!user) {
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        // 1) Prefer Firebase Auth custom claims if present (fast + avoids Firestore doc drift)
        // Claims commonly used: { role: 'admin' | 'super_admin', superAdmin: true }
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

            if (process.env.NODE_ENV !== 'production') {
              console.log('useAdmin - Using token claims', {
                uid: user.uid,
                claimRole,
                claimSuper,
              });
            }
            setLoading(false);
            return;
          }
        } catch (e) {
          // If token claim read fails, fall back to Firestore.
          if (process.env.NODE_ENV !== 'production') {
            console.warn('useAdmin - Failed to read token claims, falling back to Firestore', e);
          }
        }

        // 2) Fallback: Firestore user profile with timeout protection
        const profilePromise = getUserProfile(user.uid);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Admin check timed out after 8 seconds')), 8000)
        );
        const profile = await Promise.race([profilePromise, timeoutPromise]) as any;
        
        // Profile loaded successfully (removed console spam)
        
        // Check role field first (new system)
        if (profile?.role) {
          const userRole = profile.role;
          // Role found - removed excessive logging
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
      }
    }

    if (!authLoading) {
      checkAdminStatus();
    }
  }, [user?.uid, authLoading]); // FIXED: Use stable user.uid instead of user object

  return {
    isAdmin,
    isSuperAdmin,
    role,
    loading: loading || authLoading,
  };
}
