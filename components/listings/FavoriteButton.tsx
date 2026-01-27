'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
// Don't import useFavorites - we'll use module-level exports instead
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { AuthPromptModal } from '@/components/auth/AuthPromptModal';
import { cn } from '@/lib/utils';

interface FavoriteButtonProps {
  listingId: string;
  variant?: 'icon' | 'button';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function FavoriteButtonComponent({ 
  listingId, 
  variant = 'icon',
  size = 'md',
  className 
}: FavoriteButtonProps) {
  const { user } = useAuth();
  // CRITICAL: Don't call useFavorites() here - it subscribes to state and causes ALL FavoriteButton components to re-render
  // Access the ref directly from the module-level export to avoid subscribing to state
  const favoriteIdsRef = (globalThis as any).__favoritesRef as React.MutableRefObject<Set<string>> | undefined;
  const pendingIdsRef = (globalThis as any).__pendingIdsRef as React.MutableRefObject<Set<string>> | undefined;
  const toggleFavoriteFn = (globalThis as any).__toggleFavorite as ((listingId: string) => Promise<'added' | 'removed'>) | undefined;
  
  const { toast } = useToast();
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  
  // Track favorite status locally by reading directly from ref
  const isFavoriteRef = useRef((id: string) => favoriteIdsRef?.current?.has(id) ?? false);
  if (favoriteIdsRef) {
    isFavoriteRef.current = (id: string) => favoriteIdsRef.current.has(id);
  }
  
  const isPendingRef = useRef((id: string) => pendingIdsRef?.current?.has(id) ?? false);
  if (pendingIdsRef) {
    isPendingRef.current = (id: string) => pendingIdsRef.current.has(id);
  }
  
  // Track favorite status locally - only update on click, not via polling
  // The optimistic update in toggleFavorite already updates the ref immediately
  const [localIsFavorited, setLocalIsFavorited] = useState(() => isFavoriteRef.current(listingId));
  const [localPending, setLocalPending] = useState(() => isPendingRef.current(listingId));
  
  // Only check the ref once on mount - no polling to avoid re-renders
  useEffect(() => {
    const currentStatus = isFavoriteRef.current(listingId);
    const currentPending = isPendingRef.current(listingId);
    setLocalIsFavorited(currentStatus);
    setLocalPending(currentPending);
  }, [listingId]); // Only check when listingId changes
  
  const isFavorited = localIsFavorited;
  const pending = localPending;

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      setAuthPromptOpen(true);
      return;
    }
    if (!toggleFavoriteFn) {
      console.error('toggleFavorite function not available');
      return;
    }
    // Optimistically update local state immediately for instant UI feedback
    const newStatus = !isFavorited;
    setLocalIsFavorited(newStatus);
    setLocalPending(true);
    
    try {
      const action = await toggleFavoriteFn(listingId);
      // Update local state to match the ref (which was updated optimistically in toggleFavorite)
      setLocalIsFavorited(isFavoriteRef.current(listingId));
      setLocalPending(isPendingRef.current(listingId));
      toast({
        title: action === 'added' ? 'Added to Favorites' : 'Removed from Favorites',
        description: action === 'added' 
          ? 'You can find this listing in your favorites.'
          : 'Listing removed from your favorites.',
      });
    } catch (error) {
      // Rollback on error
      setLocalIsFavorited(!newStatus);
      setLocalPending(false);
      // Error toast is handled in the hook
    }
  };

  if (variant === 'button') {
    // Map 'md' to 'default' since Button doesn't support 'md'
    const buttonSize = size === 'md' ? 'default' : size;
    return (
      <>
        <Button
          variant="outline"
          size={buttonSize as 'sm' | 'default' | 'lg' | 'icon' | null | undefined}
          onClick={handleClick}
          disabled={pending}
          className={cn(
            'gap-2',
            isFavorited && 'border-primary bg-primary/10 text-primary',
            className
          )}
        >
          <Heart className={cn('h-4 w-4', isFavorited && 'fill-primary')} />
          {isFavorited ? 'Saved' : 'Save'}
        </Button>

        <AuthPromptModal
          open={authPromptOpen}
          onOpenChange={setAuthPromptOpen}
          title="Sign in to save listings"
          description="Create an account or sign in to add listings to your watchlist and view them later."
        />
      </>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClick}
        disabled={pending}
        className={cn(
          'hover:bg-primary/10',
          isFavorited && 'text-primary',
          className
        )}
        aria-label={isFavorited ? 'Remove from watchlist' : 'Add to watchlist'}
      >
        <Heart className={cn('h-5 w-5 transition-colors duration-200', isFavorited && 'fill-primary text-primary')} />
      </Button>

      <AuthPromptModal
        open={authPromptOpen}
        onOpenChange={setAuthPromptOpen}
        title="Sign in to save listings"
        description="Create an account or sign in to add listings to your watchlist and view them later."
      />
    </>
  );
}

// Memoize FavoriteButton to prevent re-renders when parent re-renders
// Only re-render if props actually change
export const FavoriteButton = React.memo(FavoriteButtonComponent, (prevProps, nextProps) => {
  return prevProps.listingId === nextProps.listingId &&
         prevProps.variant === nextProps.variant &&
         prevProps.size === nextProps.size &&
         prevProps.className === nextProps.className;
});
FavoriteButton.displayName = 'FavoriteButton';

