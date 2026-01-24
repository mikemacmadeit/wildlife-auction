import { useAuth } from './use-auth';
import { useEffect, useState, useRef } from 'react';
import { getUserProfile } from '@/lib/firebase/users';
import { UserRole } from '@/lib/types';

// Global cache to prevent multiple simultaneous checks for the same user
const adminStatusCache = new Map<string, {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  role: UserRole | null;
  timestamp: number;
}>();

const CHECKING_USERS = new Set<string>(); // Track users currently being checked
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Hook to check if current user is an admin
 * Uses global cache to prevent duplicate Firestore queries
 */
export function useAdmin() {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const checkInProgressRef = useRef(false);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;

    async function checkAdminStatus() {
      // Prevent multiple simultaneous checks for the same user
      if (!user?.uid) {
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setRole(null);
        setLoading(false);
        return;
      }

      const userId = user.uid;

      // Check cache first
      const cached = adminStatusCache.get(userId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log('[useAdmin] Using cached result for', userId);
        setRole(cached.role);
        setIsAdmin(cached.isAdmin);
        setIsSuperAdmin(cached.isSuperAdmin);
        setLoading(false);
        return;
      }

      // Prevent concurrent checks for the same user
      if (CHECKING_USERS.has(userId)) {
        console.log('[useAdmin] Check already in progress for', userId, '- waiting for cache...');
        // Wait for the check to complete and cache to be populated
        const checkCache = () => {
          const cached = adminStatusCache.get(userId);
          if (cached) {
            setRole(cached.role);
            setIsAdmin(cached.isAdmin);
            setIsSuperAdmin(cached.isSuperAdmin);
            setLoading(false);
            return true;
          }
          return false;
        };

        // Check immediately in case it just completed
        if (checkCache()) return;

        // Poll every 100ms for up to 5 seconds
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds at 100ms intervals
        pollInterval = setInterval(() => {
          attempts++;
          if (checkCache() || attempts >= maxAttempts) {
            if (pollInterval) clearInterval(pollInterval);
            pollInterval = null;
            if (attempts >= maxAttempts && !adminStatusCache.has(userId)) {
              console.warn('[useAdmin] Timeout waiting for check, using defaults');
              setRole(null);
              setIsAdmin(false);
              setIsSuperAdmin(false);
              setLoading(false);
            }
          }
        }, 100);
        return;
      }

      // Mark as checking
      CHECKING_USERS.add(userId);
      checkInProgressRef.current = true;

      try {
        console.log('[useAdmin] Starting checkAdminStatus for', userId);

        // 1) Prefer Firebase Auth custom claims if present (fast + avoids Firestore doc drift)
        try {
          const tokenResult = await user.getIdTokenResult();
          const claimRole = (tokenResult?.claims as any)?.role as UserRole | undefined;
          const claimSuper = (tokenResult?.claims as any)?.superAdmin === true;

          if (claimRole === 'admin' || claimRole === 'super_admin' || claimSuper) {
            const effectiveRole: UserRole = claimRole === 'admin' || claimRole === 'super_admin'
              ? claimRole
              : 'super_admin';
            
            const result = {
              isAdmin: true,
              isSuperAdmin: effectiveRole === 'super_admin' || claimSuper,
              role: effectiveRole,
            };
            
            // Cache the result
            adminStatusCache.set(userId, {
              ...result,
              timestamp: Date.now(),
            });
            
            setRole(effectiveRole);
            setIsAdmin(true);
            setIsSuperAdmin(result.isSuperAdmin);
            setLoading(false);
            return;
          }
        } catch (e) {
          console.warn('[useAdmin] Failed to read token claims, falling back to Firestore', e);
        }

        // 2) Fallback: Firestore user profile
        const profile = await getUserProfile(user.uid);
        
        let result: {
          isAdmin: boolean;
          isSuperAdmin: boolean;
          role: UserRole | null;
        };
        
        // Check role field first (new system)
        if (profile?.role) {
          const userRole = profile.role;
          result = {
            role: userRole,
            isAdmin: userRole === 'admin' || userRole === 'super_admin',
            isSuperAdmin: userRole === 'super_admin',
          };
        } 
        // Fallback to legacy superAdmin flag
        else if (profile?.superAdmin) {
          result = {
            role: 'super_admin',
            isAdmin: true,
            isSuperAdmin: true,
          };
        } 
        // Default to regular user
        else {
          result = {
            role: 'user',
            isAdmin: false,
            isSuperAdmin: false,
          };
        }

        // Cache the result
        adminStatusCache.set(userId, {
          ...result,
          timestamp: Date.now(),
        });

        setRole(result.role);
        setIsAdmin(result.isAdmin);
        setIsSuperAdmin(result.isSuperAdmin);
      } catch (error) {
        console.error('[useAdmin] Error checking admin status:', error);
        setRole(null);
        setIsAdmin(false);
        setIsSuperAdmin(false);
      } finally {
        CHECKING_USERS.delete(userId);
        checkInProgressRef.current = false;
        setLoading(false);
        console.log('[useAdmin] Finished checkAdminStatus for', userId);
      }
    }

    if (!authLoading && user) {
      checkAdminStatus();
    } else if (!authLoading && !user) {
      // No user, set defaults immediately
      setIsAdmin(false);
      setIsSuperAdmin(false);
      setRole(null);
      setLoading(false);
    }

    // Cleanup function
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [user?.uid, authLoading]);

  return {
    isAdmin,
    isSuperAdmin,
    role,
    loading: loading || authLoading,
  };
}
