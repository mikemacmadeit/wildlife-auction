'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CheckCircle2, ShoppingBag, Handshake } from 'lucide-react';
import { cn } from '@/lib/utils';

export type OfferAcceptedSuccessRole = 'seller' | 'buyer';

export interface OfferAcceptedSuccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: OfferAcceptedSuccessRole;
  listingTitle?: string;
  amount?: number;
  offerId?: string;
  listingId?: string;
  /** Buyer: called when "Checkout now" is clicked. Caller should open payment dialog, then close modal. */
  onCheckout?: () => void;
  /** Seller: custom handler for "View in Bids & Offers". Defaults to navigation. */
  onViewBidsOffers?: () => void;
}

export function OfferAcceptedSuccessModal({
  open,
  onOpenChange,
  role,
  listingTitle,
  amount,
  offerId,
  listingId,
  onCheckout,
  onViewBidsOffers,
}: OfferAcceptedSuccessModalProps) {
  const isSeller = role === 'seller';
  const amountStr = typeof amount === 'number' && Number.isFinite(amount)
    ? `$${amount.toLocaleString()}`
    : null;

  const handlePrimary = () => {
    if (isSeller) {
      if (onViewBidsOffers) {
        onViewBidsOffers();
      } else {
        window.location.href = '/dashboard/bids-offers?tab=offers';
      }
      onOpenChange(false);
    } else {
      onCheckout?.();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'max-w-md border-2 overflow-hidden',
          'border-emerald-500/30 bg-gradient-to-b from-emerald-500/5 to-background',
          'dark:border-emerald-500/20 dark:from-emerald-950/30 dark:to-background'
        )}
        onEscapeKeyDown={() => onOpenChange(false)}
      >
        <DialogHeader className="space-y-4 pb-2">
          <AnimatePresence mode="wait">
            <motion.div
              key="icon"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 dark:bg-emerald-500/20"
            >
              <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
            </motion.div>
          </AnimatePresence>
          <DialogTitle className="text-center text-xl font-extrabold tracking-tight text-foreground">
            Offer accepted!
          </DialogTitle>
          <DialogDescription asChild>
            <div className="text-center space-y-1 pt-1">
              {isSeller ? (
                <>
                  <p className="text-muted-foreground">
                    The listing is reserved. The buyer can complete checkout at the agreed price.
                  </p>
                  {listingTitle && (
                    <p className="text-sm font-medium text-foreground/90 truncate px-4" title={listingTitle}>
                      {listingTitle}
                    </p>
                  )}
                  {amountStr && (
                    <p className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
                      {amountStr}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">
                    You can checkout at the agreed price. Complete payment to seal the deal.
                  </p>
                  {listingTitle && (
                    <p className="text-sm font-medium text-foreground/90 truncate px-4" title={listingTitle}>
                      {listingTitle}
                    </p>
                  )}
                  {amountStr && (
                    <p className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
                      {amountStr}
                    </p>
                  )}
                </>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-center pt-4">
          {isSeller ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="min-h-[44px] font-semibold">
                Close
              </Button>
              {onViewBidsOffers ? (
                <Button
                  onClick={handlePrimary}
                  className="min-h-[44px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Handshake className="h-4 w-4 mr-2" />
                  View in Bids & Offers
                </Button>
              ) : (
                <Button
                  asChild
                  className="min-h-[44px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Link href="/dashboard/bids-offers?tab=offers" onClick={() => onOpenChange(false)}>
                    <Handshake className="h-4 w-4 mr-2" />
                    View in Bids & Offers
                  </Link>
                </Button>
              )}
            </>
          ) : (
            <>
              {listingId && (
                <Button variant="outline" asChild className="min-h-[44px] font-semibold">
                  <Link href={`/listing/${listingId}`} onClick={() => onOpenChange(false)}>
                    View listing
                  </Link>
                </Button>
              )}
              <Button
                onClick={handlePrimary}
                className="min-h-[44px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <ShoppingBag className="h-4 w-4 mr-2" />
                Checkout now
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
