'use client';

import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFavorites } from '@/hooks/use-favorites';
import { useToast } from '@/hooks/use-toast';
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
  const { isFavorite, toggleFavorite } = useFavorites();
  const { toast } = useToast();
  const isFavorited = isFavorite(listingId);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const action = toggleFavorite(listingId);
    toast({
      title: action === 'added' ? 'Added to Favorites' : 'Removed from Favorites',
      description: action === 'added' 
        ? 'You can find this listing in your favorites.'
        : 'Listing removed from your favorites.',
    });
  };

  if (variant === 'button') {
    return (
      <Button
        variant="outline"
        size={size}
        onClick={handleClick}
        className={cn(
          'gap-2',
          isFavorited && 'border-primary bg-primary/10 text-primary',
          className
        )}
      >
        <Heart className={cn('h-4 w-4', isFavorited && 'fill-primary')} />
        {isFavorited ? 'Favorited' : 'Favorite'}
      </Button>
    );
  }

  return (
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
      aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
    >
      <Heart className={cn('h-5 w-5 transition-all', isFavorited && 'fill-primary text-primary')} />
    </Button>
  );
}
