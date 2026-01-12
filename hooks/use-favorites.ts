'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

const FAVORITES_STORAGE_KEY = 'wildlife-exchange-favorites';

/**
 * Custom hook for managing favorite/saved listings
 * Uses localStorage for persistence
 */
export function useFavorites() {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  // Load favorites from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (stored) {
        const ids = JSON.parse(stored) as string[];
        setFavoriteIds(new Set(ids));
      }
    } catch (error) {
      console.error('Failed to load favorites from localStorage:', error);
    }
  }, []);

  // Save to localStorage whenever favorites change
  useEffect(() => {
    try {
      localStorage.setItem(
        FAVORITES_STORAGE_KEY,
        JSON.stringify(Array.from(favoriteIds))
      );
    } catch (error) {
      console.error('Failed to save favorites to localStorage:', error);
    }
  }, [favoriteIds]);

  const toggleFavorite = useCallback((listingId: string) => {
    let action: 'added' | 'removed' = 'added';
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(listingId)) {
        next.delete(listingId);
        action = 'removed';
      } else {
        next.add(listingId);
        action = 'added';
      }
      return next;
    });
    return action;
  }, []);

  const isFavorite = useCallback((listingId: string) => {
    return favoriteIds.has(listingId);
  }, [favoriteIds]);

  const addFavorite = useCallback((listingId: string) => {
    setFavoriteIds((prev) => new Set(prev).add(listingId));
  }, []);

  const removeFavorite = useCallback((listingId: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      next.delete(listingId);
      return next;
    });
  }, []);

  const favoriteIdsArray = useMemo(() => Array.from(favoriteIds), [favoriteIds]);

  return {
    favoriteIds: favoriteIdsArray,
    isFavorite,
    toggleFavorite,
    addFavorite,
    removeFavorite,
  };
}
