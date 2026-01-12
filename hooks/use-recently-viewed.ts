'use client';

import { useState, useEffect, useCallback } from 'react';

const RECENTLY_VIEWED_STORAGE_KEY = 'wildlife-exchange-recently-viewed';
const MAX_RECENT_ITEMS = 10;

/**
 * Custom hook for managing recently viewed listings
 * Uses localStorage for persistence
 */
export function useRecentlyViewed() {
  const [recentIds, setRecentIds] = useState<string[]>([]);

  // Load recently viewed from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENTLY_VIEWED_STORAGE_KEY);
      if (stored) {
        const ids = JSON.parse(stored) as string[];
        setRecentIds(ids);
      }
    } catch (error) {
      console.error('Failed to load recently viewed from localStorage:', error);
    }
  }, []);

  // Save to localStorage whenever recent items change
  useEffect(() => {
    try {
      localStorage.setItem(
        RECENTLY_VIEWED_STORAGE_KEY,
        JSON.stringify(recentIds)
      );
    } catch (error) {
      console.error('Failed to save recently viewed to localStorage:', error);
    }
  }, [recentIds]);

  const addToListing = useCallback((listingId: string) => {
    setRecentIds((prev) => {
      // Remove if already exists
      const filtered = prev.filter(id => id !== listingId);
      // Add to front
      const updated = [listingId, ...filtered];
      // Keep only last MAX items
      return updated.slice(0, MAX_RECENT_ITEMS);
    });
  }, []);

  const clearRecent = useCallback(() => {
    setRecentIds([]);
  }, []);

  return {
    recentIds,
    addToListing,
    clearRecent,
  };
}
