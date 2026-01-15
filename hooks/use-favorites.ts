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
  const unsubscribeRef = useRef<Unsubscribe | null>(null);

  // Logged-out: no watchlist (auth required)
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setFavoriteIds(new Set());
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
        setFavoriteIds(ids);
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
      const isCurrentlyFavorite = favoriteIds.has(listingId);
      const action: 'added' | 'removed' = isCurrentlyFavorite ? 'removed' : 'added';

      // Optimistic update
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isCurrentlyFavorite) {
          next.delete(listingId);
        } else {
          next.add(listingId);
        }
        return next;
      });

      try {
        await syncWatchlistServer(listingId, isCurrentlyFavorite ? 'remove' : 'add');
        // Success - optimistic update was correct, Firestore will update via onSnapshot
        return action;
      } catch (error: any) {
        // Rollback optimistic update
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (isCurrentlyFavorite) {
            next.add(listingId); // Restore
          } else {
            next.delete(listingId); // Remove
          }
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

  const isFavorite = useCallback(
    (listingId: string) => {
      return favoriteIds.has(listingId);
    },
    [favoriteIds]
  );

  const addFavorite = useCallback(
    async (listingId: string) => {
      if (!user) {
        const err: any = new Error('Authentication required');
        err.code = 'AUTH_REQUIRED';
        throw err;
      }
      if (favoriteIds.has(listingId)) return; // Already favorite

      // Optimistic update
      setFavoriteIds((prev) => new Set(prev).add(listingId));

      try {
        await syncWatchlistServer(listingId, 'add');
      } catch (error: any) {
        // Rollback
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          next.delete(listingId);
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
      if (!favoriteIds.has(listingId)) return; // Not favorite

      // Optimistic update
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        next.delete(listingId);
        return next;
      });

      try {
        await syncWatchlistServer(listingId, 'remove');
      } catch (error: any) {
        // Rollback
        setFavoriteIds((prev) => new Set(prev).add(listingId));

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

  const favoriteIdsArray = useMemo(() => Array.from(favoriteIds), [favoriteIds]);

  return {
    favoriteIds: favoriteIdsArray,
    isFavorite,
    toggleFavorite,
    addFavorite,
    removeFavorite,
    isLoading,
  };
}
