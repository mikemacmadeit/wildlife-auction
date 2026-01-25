'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { startTransition } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, Unsubscribe } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/hooks/use-auth';
import { toast as globalToast } from '@/hooks/use-toast';

// Module-level refs that are initialized immediately (before any hook calls)
// This ensures they're always available, even if no component calls useFavorites()
const moduleFavoriteIdsRef = { current: new Set<string>() };
const modulePendingIdsRef = { current: new Set<string>() };
let moduleToggleFavorite: ((listingId: string) => Promise<'added' | 'removed'>) | null = null;

// Initialize global exports immediately
(globalThis as any).__favoritesRef = moduleFavoriteIdsRef;
(globalThis as any).__pendingIdsRef = modulePendingIdsRef;

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
  // Use global toast function instead of useToast() hook to prevent FavoritesInitializer
  // from subscribing to toast state changes, which causes re-renders
  const toast = globalToast;
  // Use ref for user to keep callbacks stable and prevent FavoritesInitializer from re-rendering
  const userRef = useRef(user);
  userRef.current = user;
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  // Use ref for isLoading to avoid causing re-renders in FavoritesInitializer
  // Components that need isLoading can poll the ref or use a separate hook instance
  const isLoadingRef = useRef(true);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const unsubscribeRef = useRef<Unsubscribe | null>(null);
  const pendingOpsRef = useRef<Map<string, { desired: boolean; startedAt: number }>>(new Map());
  // Use module-level refs that are shared across all hook instances
  // This ensures components can access them without calling the hook
  const favoriteIdsRef = moduleFavoriteIdsRef;
  const pendingIdsRef = modulePendingIdsRef;
  
  // Update global exports to point to module-level refs (they're already set, but ensure they're current)
  (globalThis as any).__favoritesRef = favoriteIdsRef;
  (globalThis as any).__pendingIdsRef = pendingIdsRef;
  
  // Don't sync ref from state - we update the ref directly and never update state
  // This prevents FavoritesInitializer from re-rendering when favoriteIds changes
  // The ref is the source of truth, state is just for backward compatibility

  const PENDING_TTL_MS = 15_000;

  // Logged-out: no watchlist (auth required)
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      const emptySet = new Set<string>();
      favoriteIdsRef.current = emptySet;
      // Don't call setFavoriteIds - it causes re-renders in all components using the hook
      // Components will read from favoriteIdsRef.current via isFavorite callback
      isLoadingRef.current = false;
      // Don't call setIsLoading - it causes FavoritesInitializer to re-render
      // Components that need isLoading can poll isLoadingRef.current
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
      pendingIdsRef.current = new Set(); // Update ref immediately
      // Don't call setPendingIds - it causes re-renders in all components using the hook
      // Components will read from pendingIdsRef.current via isPending callback
      return;
    }

    // Logged-in mode: subscribe to Firestore
    isLoadingRef.current = true;
    // Don't call setIsLoading - it causes FavoritesInitializer to re-render
    // Components that need isLoading can poll isLoadingRef.current
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

        // Check if the Set actually changed BEFORE calling setState to prevent unnecessary re-renders
        // Use ref to check current state without triggering React's state update mechanism
        const currentIds = favoriteIdsRef.current;
        let hasChanged = false;
        
        if (currentIds.size !== ids.size) {
          hasChanged = true;
        } else {
          // Deep check: compare all items
          const idsArray = Array.from(ids);
          for (const id of idsArray) {
            if (!currentIds.has(id)) {
              hasChanged = true;
              break;
            }
          }
          if (!hasChanged) {
            const currentArray = Array.from(currentIds);
            for (const id of currentArray) {
              if (!ids.has(id)) {
                hasChanged = true;
                break;
              }
            }
          }
        }
        
        // Only call setState if something actually changed
        if (hasChanged) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-favorites.ts:125',message:'Set changed - updating state',data:{prevSize:currentIds.size,newSize:ids.size,idsArray:Array.from(ids).join(',')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
          // #endregion
          favoriteIdsRef.current = ids; // Update ref immediately
          // Don't call setFavoriteIds - it causes re-renders in all components using the hook
          // Components will read from favoriteIdsRef.current via isFavorite callback
        } else {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-favorites.ts:119',message:'No change detected - skipping setState',data:{size:currentIds.size},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
        }

        // Update pendingIds ref immediately (doesn't cause re-renders)
        pendingIdsRef.current = new Set(pending.keys());
        // Don't call setPendingIds - it causes re-renders in all components using the hook
        // Components will read from pendingIdsRef.current via isPending callback

        isLoadingRef.current = false;
        // Don't call setIsLoading - it causes FavoritesInitializer to re-render
        // Components that need isLoading can poll isLoadingRef.current
      },
      (error) => {
        console.error('Error subscribing to watchlist:', error);
        isLoadingRef.current = false;
        // Don't call setIsLoading - it causes FavoritesInitializer to re-render
        // Components that need isLoading can poll isLoadingRef.current
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

  // Update userRef when user changes (already declared above)
  userRef.current = user;
  
  const syncWatchlistServer = useCallback(
    async (listingId: string, action: 'add' | 'remove') => {
      const currentUser = userRef.current;
      if (!currentUser) throw new Error('Authentication required');
      const token = await currentUser.getIdToken();
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
    [] // Empty deps - use userRef.current instead
  );

  const toggleFavorite = useCallback(
    async (listingId: string): Promise<'added' | 'removed'> => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-favorites.ts:168',message:'toggleFavorite called',data:{listingId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'I'})}).catch(()=>{});
      // #endregion
      const currentUser = userRef.current;
      if (!currentUser) {
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
      pendingIdsRef.current = new Set(pendingIdsRef.current).add(listingId); // Update ref immediately
      // Don't call setPendingIds - it causes re-renders in all components using the hook

      // Optimistic update
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-favorites.ts:182',message:'Optimistic update - toggleFavorite',data:{listingId,action,isCurrentlyFavorite,currentFavoriteIdsCount:favoriteIdsRef.current.size},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const next = new Set(favoriteIdsRef.current);
      if (isCurrentlyFavorite) {
        next.delete(listingId);
      } else {
        next.add(listingId);
      }
      favoriteIdsRef.current = next; // Update ref immediately
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-favorites.ts:189',message:'Optimistic update applied',data:{listingId,prevSize:favoriteIdsRef.current.size,nextSize:next.size,wasFavorite:isCurrentlyFavorite},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      // Don't call setFavoriteIds - it causes re-renders in all components using the hook
      // Components will read from favoriteIdsRef.current via isFavorite callback

      try {
        await syncWatchlistServer(listingId, isCurrentlyFavorite ? 'remove' : 'add');
        // Success - optimistic update was correct, Firestore will update via onSnapshot
        // Clear pending immediately since server confirmed the change
        pendingOpsRef.current.delete(listingId);
        const nextPending = new Set(pendingIdsRef.current);
        nextPending.delete(listingId);
        pendingIdsRef.current = nextPending; // Update ref immediately
        // Don't call setPendingIds - it causes re-renders in all components using the hook
        return action;
      } catch (error: any) {
        pendingOpsRef.current.delete(listingId);
        const nextPending = new Set(pendingIdsRef.current);
        nextPending.delete(listingId);
        pendingIdsRef.current = nextPending; // Update ref immediately
        // Don't call setPendingIds - it causes re-renders in all components using the hook

        // Rollback optimistic update
        const rollbackSet = new Set(favoriteIdsRef.current);
        if (isCurrentlyFavorite) {
          rollbackSet.add(listingId); // Restore
        } else {
          rollbackSet.delete(listingId); // Remove
        }
        favoriteIdsRef.current = rollbackSet;
        // Don't call setFavoriteIds - it causes re-renders in all components using the hook

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
    [syncWatchlistServer] // Remove user and toast - user is accessed via userRef, toast is global
  );

  // Use ref-based check to avoid dependency on favoriteIds state, preventing unnecessary re-renders
  const isFavorite = useCallback(
    (listingId: string) => {
      const result = favoriteIdsRef.current.has(listingId);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-favorites.ts:242',message:'isFavorite called',data:{listingId,result,favoriteIdsSize:favoriteIdsRef.current.size},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return result;
    },
    [] // Empty deps - use ref instead to keep callback stable
  );

  // Use ref-based check to avoid dependency on pendingIds state, preventing unnecessary re-renders
  const isPending = useCallback(
    (listingId: string) => {
      return pendingIdsRef.current.has(listingId);
    },
    [] // Empty deps - use ref instead to keep callback stable
  );

  const addFavorite = useCallback(
    async (listingId: string) => {
      const currentUser = userRef.current;
      if (!currentUser) {
        const err: any = new Error('Authentication required');
        err.code = 'AUTH_REQUIRED';
        throw err;
      }
      if (favoriteIdsRef.current.has(listingId)) return; // Already favorite

      // Optimistic update
      const next = new Set(favoriteIdsRef.current);
      next.add(listingId);
      favoriteIdsRef.current = next;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-favorites.ts:210',message:'Optimistic update - adding',data:{listingId,prevSize:favoriteIdsRef.current.size,newSize:next.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      // Don't call setFavoriteIds - it causes re-renders in all components using the hook

      try {
        await syncWatchlistServer(listingId, 'add');
      } catch (error: any) {
        // Rollback
        const rollbackSet = new Set(favoriteIdsRef.current);
        rollbackSet.delete(listingId);
        favoriteIdsRef.current = rollbackSet;
        // Don't call setFavoriteIds - it causes re-renders in all components using the hook

        toast({
          title: 'Error',
          description: 'Failed to add to watchlist. Please try again.',
          variant: 'destructive',
        });

        throw error;
      }
    },
    [syncWatchlistServer] // Remove user and toast - user is accessed via userRef, toast is global
  );

  const removeFavorite = useCallback(
    async (listingId: string) => {
      const currentUser = userRef.current;
      if (!currentUser) {
        const err: any = new Error('Authentication required');
        err.code = 'AUTH_REQUIRED';
        throw err;
      }
      if (!favoriteIdsRef.current.has(listingId)) return; // Not favorite

      // Optimistic update
      const next = new Set(favoriteIdsRef.current);
      next.delete(listingId);
      favoriteIdsRef.current = next;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/17040e56-eeab-425b-acb7-47343bdc73b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'use-favorites.ts:330',message:'Optimistic update - removing',data:{listingId,prevSize:favoriteIdsRef.current.size,newSize:next.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      // Don't call setFavoriteIds - it causes re-renders in all components using the hook

      try {
        await syncWatchlistServer(listingId, 'remove');
      } catch (error: any) {
        // Rollback
        const rollbackSet = new Set(favoriteIdsRef.current);
        rollbackSet.add(listingId);
        favoriteIdsRef.current = rollbackSet;
        // Don't call setFavoriteIds - it causes re-renders in all components using the hook

        toast({
          title: 'Error',
          description: 'Failed to remove from watchlist. Please try again.',
          variant: 'destructive',
        });

        throw error;
      }
    },
    [syncWatchlistServer] // Remove user and toast - user is accessed via userRef, toast is global
  );

  // Generate favoriteIds array from ref (components that need it will poll or use the ref directly)
  // We still need to return something for backward compatibility, but it won't cause re-renders
  // since we're not updating the state
  const favoriteIdsArray = useMemo(() => {
    return Array.from(favoriteIdsRef.current).sort();
  }, []); // Empty deps - components should use favoriteIdsRef directly or poll

  // Export toggleFavorite at module level so components can use it without calling the hook
  // Store it in module-level variable and update globalThis
  moduleToggleFavorite = toggleFavorite;
  (globalThis as any).__toggleFavorite = toggleFavorite;
  
  // Keep it updated when toggleFavorite changes
  useEffect(() => {
    moduleToggleFavorite = toggleFavorite;
    (globalThis as any).__toggleFavorite = toggleFavorite;
  }, [toggleFavorite]);
  
  return {
    favoriteIds: favoriteIdsArray,
    isFavorite,
    isPending,
    toggleFavorite,
    addFavorite,
    removeFavorite,
    isLoading,
    // Export ref for components that need to read favoriteIds without subscribing to state
    favoriteIdsRef,
  };
}
