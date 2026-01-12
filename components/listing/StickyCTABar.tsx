'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ListingType } from '@/lib/types';
import { Gavel, ShoppingCart, MessageCircle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StickyCTABarProps {
  listingType: ListingType;
  price?: number;
  currentBid?: number;
  onAction: () => void;
  className?: string;
}

export function StickyCTABar({
  listingType,
  price,
  currentBid,
  onAction,
  className,
}: StickyCTABarProps) {
  const getButtonConfig = () => {
    switch (listingType) {
      case 'auction':
        return {
          icon: Gavel,
          label: 'Place Bid',
          price: currentBid ? `$${currentBid.toLocaleString()}` : 'Bid Now',
          variant: 'default' as const,
        };
      case 'fixed':
        return {
          icon: ShoppingCart,
          label: 'Buy Now',
          price: price ? `$${price.toLocaleString()}` : 'Buy Now',
          variant: 'default' as const,
        };
      case 'classified':
        return {
          icon: MessageCircle,
          label: 'Contact Seller',
          price: price ? `$${price.toLocaleString()}` : 'Contact',
          variant: 'outline' as const,
        };
      default:
        return {
          icon: MessageCircle,
          label: 'Contact Seller',
          price: 'Contact',
          variant: 'default' as const,
        };
    }
  };

  const config = getButtonConfig();
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 bg-card/95 backdrop-blur-xl p-4 shadow-premium',
        'shadow-2xl shadow-primary/5 md:hidden',
        'border-primary/10',
        className
      )}
    >
      {/* Decorative gradient at top */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      
      <div className="flex items-center justify-between gap-4 max-w-md mx-auto">
        <div className="flex-1 space-y-1">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {listingType === 'auction' ? 'Current Bid' : listingType === 'fixed' ? 'Price' : 'Asking Price'}
          </div>
          <div className="text-2xl font-extrabold bg-gradient-to-r from-primary via-primary/90 to-primary bg-clip-text text-transparent">
            {config.price}
          </div>
        </div>
        <Button
          onClick={onAction}
          size="lg"
          variant={config.variant}
          className={cn(
            'min-h-[52px] min-w-[160px] gap-2 font-bold text-base',
            'flex-1 max-w-[220px]',
            config.variant === 'default' && 'bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/40 transition-all duration-300',
            'hover:scale-[1.02] active:scale-[0.98] transition-transform'
          )}
        >
          <Icon className="h-5 w-5" />
          {config.label}
        </Button>
      </div>
    </motion.div>
  );
}
