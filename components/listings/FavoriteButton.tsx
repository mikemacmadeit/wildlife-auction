'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFavorites } from '@/hooks/use-favorites';
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

export function FavoriteButton({ 
  listingId, 
  variant = 'icon',
  size = 'md',
  className 
}: FavoriteButtonProps) {
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { toast } = useToast();
  const [authPromptOpen, setAuthPromptOpen] = useState(false);
  const isFavorited = isFavorite(listingId);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      setAuthPromptOpen(true);
      return;
    }
    try {
      const action = await toggleFavorite(listingId);
      toast({
        title: action === 'added' ? 'Added to Favorites' : 'Removed from Favorites',
        description: action === 'added' 
          ? 'You can find this listing in your favorites.'
          : 'Listing removed from your favorites.',
      });
    } catch (error) {
      // Error toast is handled in the hook
      // Just prevent default behavior
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
        className={cn(
          'h-10 w-10',
          'hover:bg-primary/10',
          isFavorited && 'text-primary',
          className
        )}
        aria-label={isFavorited ? 'Remove from watchlist' : 'Add to watchlist'}
      >
        <Heart className={cn('h-5 w-5 transition-all', isFavorited && 'fill-primary text-primary')} />
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
