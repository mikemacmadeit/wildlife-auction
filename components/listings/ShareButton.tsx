'use client';

import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ShareButtonProps {
  listingId: string;
  listingTitle: string;
  variant?: 'icon' | 'button';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ShareButton({ 
  listingId,
  listingTitle,
  variant = 'icon',
  size = 'md',
  className 
}: ShareButtonProps) {
  const { toast } = useToast();

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const url = `${window.location.origin}/listing/${listingId}`;
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: listingTitle,
          text: `Check out this listing on Wildlife Exchange: ${listingTitle}`,
          url,
        });
        toast({
          title: 'Shared!',
          description: 'Listing shared successfully.',
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast({
          title: 'Link Copied!',
          description: 'Listing link copied to clipboard.',
        });
      }
    } catch (error) {
      // User cancelled or error occurred
      if ((error as Error).name !== 'AbortError') {
        toast({
          title: 'Share Failed',
          description: 'Could not share listing. Please try again.',
          variant: 'destructive',
        });
      }
    }
  };

  if (variant === 'button') {
    return (
      <Button
        variant="outline"
        size={size}
        onClick={handleShare}
        className={cn('gap-2', className)}
      >
        <Share2 className="h-4 w-4" />
        Share
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleShare}
      className={cn(
        'h-10 w-10',
        'hover:bg-primary/10',
        className
      )}
      aria-label="Share listing"
    >
      <Share2 className="h-5 w-5" />
    </Button>
  );
}
