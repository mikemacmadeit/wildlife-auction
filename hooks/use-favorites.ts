'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, Unsubscribe } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

/**
 * Custom hook for managing favorite/watchlist listings.
 *
 * IMPORTANT: Watchlist actions require authentication.
 * If the user is logged out, we keep an empty set and callers should prompt sign-in.
 *
 * Firestore Structure:
 * /users/{uid}/watchlist/{listingId}
 * {
 *   listingId: string,
 *   createdAt: serverTimestamp()
 * }
 */
export function useFavorites() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const unsubscribeRef = useRef<Unsubscribe | null>(null);
  const pendingOpsRef = useRef<Map<string, { desired: boolean; startedAt: number }>>(new Map());
  // Use refs to store current values so functions can be stable
  const favoriteIdsRef = useRef<Set<string>>(new Set());
  const pendingIdsRef = useRef<Set<string>>(new Set());

  const PENDING_TTL_MS = 15_000;
  
  // Keep refs in sync with state
  useEffect(() => {
    favoriteIdsRef.current = favoriteIds;
  }, [favoriteIds]);
  
  useEffect(() => {
    pendingIdsRef.current = pendingIds;
  }, [pendingIds]);

  // Logged-out: no watchlist (auth required)
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      const emptySet = new Set();
      favoriteIdsRef.current = emptySet;
      setFavoriteIds(emptySet);
      setIsLoading(false);
    }
  }, [user, authLoading]);

  // Subscribe to Firestore watchlist when logged in
  useEffect(() => {
    if (authLoading || !user) {
      // Clean up subscription if user logs out
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      pendingOpsRef.current.clear();
      const emptyPending = new Set();
      pendingIdsRef.current = emptyPending;
      setPendingIds(emptyPending);
      return;
    }

    // Logged-in mode: subscribe to Firestore
    setIsLoading(true);
    const watchlistRef = collection(db, 'users', user.uid, 'watchlist');

    // Subscribe to real-time updates
    unsubscribeRef.current = onSnapshot(
      watchlistRef,
      (snapshot) => {
        const ids = new Set<string>();
        snapshot.forEach((doc) => {
          ids.add(doc.id); // listingId is the document ID
        });

        // Merge in-flight optimistic toggles to avoid UI flicker:
        // Firestore snapshot can briefly show the old state before the server write lands.
        const now = Date.now();
        const pending = pendingOpsRef.current;
        // NOTE: Avoid Map iterator downlevelIteration issues by iterating Array.from().
        for (const [listingId, op] of Array.from(pending.entries())) {
          if (!op || now - op.startedAt > PENDING_TTL_MS) {
            pending.delete(listingId);
            continue;
          }
          const inSnapshot = ids.has(listingId);
          // If snapshot already reflects desired state, clear pending.
          if (inSnapshot === op.desired) {
            pending.delete(listingId);
            continue;
          }
          // Otherwise, keep optimistic desired state in the UI.
          if (op.desired) ids.add(listingId);
          else ids.delete(listingId);
        }

        // Only update state if the Set actually changed to prevent unnecessary re-renders
        setFavoriteIds((prev) => {
          // Quick check: if sizes differ, definitely changed
          if (prev.size !== ids.size) {
            favoriteIdsRef.current = ids;
            return ids;
          }
          // Deep check: compare all items
          // Convert to arrays to avoid iteration issues
          const idsArray = Array.from(ids);
          const prevArray = Array.from(prev);
          for (const id of idsArray) {
            if (!prev.has(id)) {
              favoriteIdsRef.current = ids;
              return ids;
            }
          }
          for (const id of prevArray) {
            if (!ids.has(id)) {
              favoriteIdsRef.current = ids;
              return ids;
            }
          }
          // No change - return previous to prevent re-render
          return prev;
        });

        // Only update pendingIds if it actually changed
        const newPendingIds = new Set(pending.keys());
        setPendingIds((prev) => {
          if (prev.size !== newPendingIds.size) {
            pendingIdsRef.current = newPendingIds;
            return newPendingIds;
          }
          // Convert to arrays to avoid iteration issues
          const newPendingIdsArray = Array.from(newPendingIds);
          const prevArray = Array.from(prev);
          for (const id of newPendingIdsArray) {
            if (!prev.has(id)) {
              pendingIdsRef.current = newPendingIds;
              return newPendingIds;
            }
          }
          for (const id of prevArray) {
            if (!newPendingIds.has(id)) {
              pendingIdsRef.current = newPendingIds;
              return newPendingIds;
            }
          }
          return prev;
        });

        setIsLoading(false);
      },
      (error) => {
        console.error('Error subscribing to watchlist:', error);
        setIsLoading(false);
      }
    );

    // Cleanup subscription on unmount or user change
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [user, authLoading]);

  const syncWatchlistServer = useCallback(
    async (listingId: string, action: 'add' | 'remove') => {
      if (!user) throw new Error('Authentication required');
      const token = await user.getIdToken();
      const res = await fetch('/api/watchlist/toggle', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ listingId, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.message || json?.error || 'Failed to update watchlist');
      }
      return json;
    },
    [user]
  );

  const toggleFavorite = useCallback(
    async (listingId: string): Promise<'added' | 'removed'> => {
      if (!user) {
        const err: any = new Error('Authentication required');
        err.code = 'AUTH_REQUIRED';
        throw err;
      }

      // Prevent double-toggles (common on mobile where click/pointer events can fire close together).
      const existingPending = pendingOpsRef.current.get(listingId);
      if (existingPending) {
        return existingPending.desired ? 'added' : 'removed';
      }

      const isCurrentlyFavorite = favoriteIdsRef.current.has(listingId);
      const action: 'added' | 'removed' = isCurrentlyFavorite ? 'removed' : 'added';
      const desired = !isCurrentlyFavorite;
      pendingOpsRef.current.set(listingId, { desired, startedAt: Date.now() });
      setPendingIds((prev) => {
        const next = new Set(prev).add(listingId);
        pendingIdsRef.current = next;
        return next;
      });

      // Optimistic update
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlyFavorite) {
          next.delete(listingId);
        } else {
          next.add(listingId);
        }
        favoriteIdsRef.current = next;
        return next;
      });

      try {
        await syncWatchlistServer(listingId, isCurrentlyFavorite ? 'remove' : 'add');
        // Success - optimistic update was correct, Firestore will update via onSnapshot
        // Clear pending immediately since server confirmed the change
        pendingOpsRef.current.delete(listingId);
        setPendingIds((prev) => {
          if (!prev.has(listingId)) return prev; // No change needed
          const next = new Set(prev);
          next.delete(listingId);
          pendingIdsRef.current = next;
          return next;
        });
        return action;
      } catch (error: any) {
        pendingOpsRef.current.delete(listingId);
        setPendingIds((prev) => {
          if (!prev.has(listingId)) return prev; // No change needed
          const next = new Set(prev);
          next.delete(listingId);
          pendingIdsRef.current = next;
          return next;
        });

        // Rollback optimistic update
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (isCurrentlyFavorite) {
            next.add(listingId); // Restore
          } else {
            next.delete(listingId); // Remove
          }
          favoriteIdsRef.current = next;
          return next;
        });

        // Show error toast
        const errorMessage =
          error.code === 'permission-denied'
            ? 'You do not have permission to update favorites.'
            : 'Failed to update watchlist. Please try again.';

        toast({
          title: 'Error',
          description: errorMessage,
          variant: 'destructive',
        });

        throw error;
      }
    },
    [favoriteIds, user, toast]
  );

  // Stable function that reads from ref to prevent re-renders when favoriteIds changes
  const isFavorite = useCallback(
    (listingId: string) => {
      return favoriteIdsRef.current.has(listingId);
    },
    [] // Empty deps - function is stable, reads from ref
  );
  
  const isPending = useCallback(
    (listingId: string) => {
      return pendingIdsRef.current.has(listingId);
    },
    [] // Empty deps - function is stable, reads from ref
  );

  const addFavorite = useCallback(
    async (listingId: string) => {
      if (!user) {
        const err: any = new Error('Authentication required');
        err.code = 'AUTH_REQUIRED';
        throw err;
      }
      if (favoriteIdsRef.current.has(listingId)) return; // Already favorite

      // Optimistic update
      setFavoriteIds((prev) => {
        const next = new Set(prev).add(listingId);
        favoriteIdsRef.current = next;
        return next;
      });

      try {
        await syncWatchlistServer(listingId, 'add');
      } catch (error: any) {
        // Rollback
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          next.delete(listingId);
          favoriteIdsRef.current = next;
          return next;
        });

        toast({
          title: 'Error',
          description: 'Failed to add to watchlist. Please try again.',
          variant: 'destructive',
        });

        throw error;
      }
    },
    [favoriteIds, user, toast, syncWatchlistServer]
  );

  const removeFavorite = useCallback(
    async (listingId: string) => {
      if (!user) {
        const err: any = new Error('Authentication required');
        err.code = 'AUTH_REQUIRED';
        throw err;
      }
      if (!favoriteIdsRef.current.has(listingId)) return; // Not favorite

      // Optimistic update
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        next.delete(listingId);
        favoriteIdsRef.current = next;
        return next;
      });

      try {
        await syncWatchlistServer(listingId, 'remove');
      } catch (error: any) {
        // Rollback
        setFavoriteIds((prev) => {
          const next = new Set(prev).add(listingId);
          favoriteIdsRef.current = next;
          return next;
        });

        toast({
          title: 'Error',
          description: 'Failed to remove from watchlist. Please try again.',
          variant: 'destructive',
        });

        throw error;
      }
    },
    [favoriteIds, user, toast, syncWatchlistServer]
  );

  // Memoize favoriteIdsArray and only update when Set actually changes
  // Use a deep comparison to prevent unnecessary array recreation
  const favoriteIdsArray = useMemo(() => {
    const arr = Array.from(favoriteIds);
    // Sort for consistent comparison
    arr.sort();
    return arr;
  }, [favoriteIds]);

  return {
    favoriteIds: favoriteIdsArray,
    isFavorite,
    isPending,
    toggleFavorite,
    addFavorite,
    removeFavorite,
    isLoading,
  };
}
