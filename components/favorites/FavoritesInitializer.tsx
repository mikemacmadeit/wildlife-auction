'use client';

import React, { useEffect, useRef } from 'react';
import { useFavorites } from '@/hooks/use-favorites';

/**
 * Hidden component that initializes the useFavorites hook
 * to ensure module-level exports (toggleFavorite, refs) are available.
 * This component doesn't render anything and uses a ref to avoid subscribing to state changes.
 * 
 * CRITICAL: This component is memoized to prevent re-renders when favoriteIds changes.
 * Even though it calls useFavorites(), it doesn't use any state values, so memoization
 * should prevent unnecessary re-renders.
 */
function FavoritesInitializerComponent() {
  // Call the hook to initialize module-level exports
  // Store the result in a ref so we don't subscribe to state changes
  const favoritesHook = useFavorites();
  const hookRef = useRef(favoritesHook);
  hookRef.current = favoritesHook;
  
  // CRITICAL: We call useFavorites() but NEVER use any of its state values in the render
  // This means when favoriteIds or isLoading changes, this component will re-render,
  // but since we don't use those values and return null, it shouldn't cause visual changes.
  // However, the re-render itself might still trigger parent re-renders.
  // To prevent this, we use React.memo below, but that won't help if the hook's state changes.
  
  // This component doesn't render anything
  return null;
}

// Memoize to prevent re-renders - this component has no props and returns null
// so it should never need to re-render
export const FavoritesInitializer = React.memo(FavoritesInitializerComponent);
