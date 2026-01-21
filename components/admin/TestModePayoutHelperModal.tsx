'use client';

import { useCallback, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  listingId?: string | null;
  onTryReleaseAgain: () => Promise<void> | void;
};

export function TestModePayoutHelperModal({ open, onOpenChange, orderId, listingId, onTryReleaseAgain }: Props) {
  const { toast } = useToast();
  const [trying, setTrying] = useState(false);

  const cardNumber = '4000 0000 0000 0077';
  const exp = '12/34';
  const cvc = '123';
  const zip = '12345';

  const rerunCheckoutUrl = useMemo(() => {
    if (!listingId) return null;
    // App router listing page path in this repo
    return `/listing/${listingId}`;
  }, [listingId]);

  const copyCard = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(cardNumber);
      toast({ title: 'Copied', description: 'Card number copied to clipboard.' });
    } catch {
      toast({ title: 'Copy failed', description: 'Please copy the card number manually.', variant: 'destructive' });
    }
  }, [cardNumber, toast]);

  const openCheckout = useCallback(() => {
    if (!rerunCheckoutUrl) {
      toast({
        title: 'Re-run checkout',
        description: 'Go back and re-run checkout using the instant-availability test card.',
      });
      return;
    }
    window.open(rerunCheckoutUrl, '_blank', 'noopener,noreferrer');
  }, [rerunCheckoutUrl, toast]);

  const tryRelease = useCallback(async () => {
    setTrying(true);
    try {
      onOpenChange(false);
      await onTryReleaseAgain();
    } finally {
      setTrying(false);
    }
  }, [onOpenChange, onTryReleaseAgain]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Test Mode: Make Funds Available Instantly</DialogTitle>
          <DialogDescription>
            Stripe test payments can remain pending. Payout transfers require <span className="font-semibold">available</span> funds.
            Use this test card to create instantly-available funds so you can complete end-to-end payout testing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Card number</Label>
            <div className="flex gap-2">
              <Input value={cardNumber} readOnly />
              <Button type="button" variant="secondary" onClick={copyCard}>
                Copy card number
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label>Exp</Label>
              <Input value={exp} readOnly />
            </div>
            <div className="space-y-2">
              <Label>CVC</Label>
              <Input value={cvc} readOnly />
            </div>
            <div className="space-y-2">
              <Label>ZIP</Label>
              <Input value={zip} readOnly />
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Order: <span className="font-mono">{orderId}</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" variant="secondary" onClick={openCheckout}>
            Re-run checkout
          </Button>
          <Button type="button" onClick={tryRelease} disabled={trying}>
            {trying ? 'Trying…' : 'Try release again'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

