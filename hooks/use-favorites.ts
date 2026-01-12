'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, Unsubscribe } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

const FAVORITES_STORAGE_KEY = 'wildlife-exchange-favorites';
const SYNCED_KEY = 'wildlife-exchange-favorites-synced';

/**
 * Custom hook for managing favorite/saved listings
 * 
 * Behavior:
 * - Logged-out: Uses localStorage only (preserves existing behavior)
 * - Logged-in: Uses Firestore as source of truth, syncs localStorage on first login
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
  const isSyncingRef = useRef(false);

  // Load favorites from localStorage on mount (for logged-out users or initial state)
  useEffect(() => {
    if (authLoading) return; // Wait for auth to initialize

    if (!user) {
      // Logged-out mode: use localStorage only
      try {
        const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
        if (stored) {
          const ids = JSON.parse(stored) as string[];
          setFavoriteIds(new Set(ids));
        }
      } catch (error) {
        console.error('Failed to load favorites from localStorage:', error);
      } finally {
        setIsLoading(false);
      }
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

        // Mirror to localStorage for offline support (optional)
        try {
          localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(ids)));
        } catch (error) {
          console.error('Failed to sync favorites to localStorage:', error);
        }
      },
      (error) => {
        console.error('Error subscribing to watchlist:', error);
        setIsLoading(false);
        
        // On permission error, fall back to localStorage
        if (error.code === 'permission-denied') {
          try {
            const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
            if (stored) {
              const ids = JSON.parse(stored) as string[];
              setFavoriteIds(new Set(ids));
            }
          } catch (e) {
            console.error('Failed to load favorites from localStorage fallback:', e);
          }
        }
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

  // Sync localStorage favorites to Firestore on first login
  useEffect(() => {
    if (authLoading || !user || isSyncingRef.current) return;

    // Check if we've already synced for this user
    const syncedKey = `${SYNCED_KEY}-${user.uid}`;
    const hasSynced = localStorage.getItem(syncedKey);

    if (hasSynced) {
      // Already synced for this user
      return;
    }

    // Check if there are localStorage favorites to sync
    try {
      const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (!stored) {
        // No favorites to sync, mark as synced
        localStorage.setItem(syncedKey, 'true');
        return;
      }

      const ids = JSON.parse(stored) as string[];
      if (ids.length === 0) {
        // Empty favorites, mark as synced
        localStorage.setItem(syncedKey, 'true');
        return;
      }

      // Sync to Firestore (idempotent - setDoc with merge)
      isSyncingRef.current = true;
      const syncPromises = ids.map((listingId) => {
        const watchlistDocRef = doc(db, 'users', user.uid, 'watchlist', listingId);
        return setDoc(
          watchlistDocRef,
          {
            listingId,
            createdAt: serverTimestamp(),
          },
          { merge: true } // Idempotent - won't overwrite if already exists
        ).catch((error) => {
          console.error(`Failed to sync favorite ${listingId}:`, error);
          // Continue with other favorites even if one fails
        });
      });

      Promise.all(syncPromises)
        .then(() => {
          // Mark as synced
          localStorage.setItem(syncedKey, 'true');
          console.log(`Synced ${ids.length} favorites to Firestore`);
        })
        .catch((error) => {
          console.error('Error syncing favorites to Firestore:', error);
        })
        .finally(() => {
          isSyncingRef.current = false;
        });
    } catch (error) {
      console.error('Error reading localStorage favorites for sync:', error);
      isSyncingRef.current = false;
    }
  }, [user, authLoading]);

  // Save to localStorage for logged-out users
  useEffect(() => {
    if (user || authLoading) return; // Only for logged-out users

    try {
      localStorage.setItem(
        FAVORITES_STORAGE_KEY,
        JSON.stringify(Array.from(favoriteIds))
      );
    } catch (error) {
      console.error('Failed to save favorites to localStorage:', error);
    }
  }, [favoriteIds, user, authLoading]);

  const toggleFavorite = useCallback(
    async (listingId: string): Promise<'added' | 'removed'> => {
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

      // If logged in, sync to Firestore
      if (user) {
        try {
          const watchlistDocRef = doc(db, 'users', user.uid, 'watchlist', listingId);

          if (isCurrentlyFavorite) {
            // Remove from Firestore
            await deleteDoc(watchlistDocRef);
          } else {
            // Add to Firestore
            await setDoc(watchlistDocRef, {
              listingId,
              createdAt: serverTimestamp(),
            });
          }

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
              : 'Failed to update favorites. Please try again.';

          toast({
            title: 'Error',
            description: errorMessage,
            variant: 'destructive',
          });

          throw error;
        }
      }

      // Logged-out: localStorage only (already updated optimistically)
      return action;
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
      if (favoriteIds.has(listingId)) return; // Already favorite

      // Optimistic update
      setFavoriteIds((prev) => new Set(prev).add(listingId));

      if (user) {
        try {
          const watchlistDocRef = doc(db, 'users', user.uid, 'watchlist', listingId);
          await setDoc(watchlistDocRef, {
            listingId,
            createdAt: serverTimestamp(),
          });
        } catch (error: any) {
          // Rollback
          setFavoriteIds((prev) => {
            const next = new Set(prev);
            next.delete(listingId);
            return next;
          });

          toast({
            title: 'Error',
            description: 'Failed to add favorite. Please try again.',
            variant: 'destructive',
          });

          throw error;
        }
      }
    },
    [favoriteIds, user, toast]
  );

  const removeFavorite = useCallback(
    async (listingId: string) => {
      if (!favoriteIds.has(listingId)) return; // Not favorite

      // Optimistic update
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        next.delete(listingId);
        return next;
      });

      if (user) {
        try {
          const watchlistDocRef = doc(db, 'users', user.uid, 'watchlist', listingId);
          await deleteDoc(watchlistDocRef);
        } catch (error: any) {
          // Rollback
          setFavoriteIds((prev) => new Set(prev).add(listingId));

          toast({
            title: 'Error',
            description: 'Failed to remove favorite. Please try again.',
            variant: 'destructive',
          });

          throw error;
        }
      }
    },
    [favoriteIds, user, toast]
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
