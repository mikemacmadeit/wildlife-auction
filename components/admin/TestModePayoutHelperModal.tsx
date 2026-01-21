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
  settlementInfo?: { availableOnIso?: string | null; minutesUntilAvailable?: number | null } | null;
  onTryReleaseAgain: () => Promise<void> | void;
};

export function TestModePayoutHelperModal({
  open,
  onOpenChange,
  orderId,
  listingId,
  settlementInfo,
  onTryReleaseAgain,
}: Props) {
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

  const openAccessGate = useCallback(() => {
    // In private beta environments, public listing routes can be behind the access gate.
    window.open('/coming-soon', '_blank', 'noopener,noreferrer');
  }, []);

  const openCheckout = useCallback(() => {
    if (!rerunCheckoutUrl) {
      toast({
        title: 'Re-run checkout',
        description: 'Go back and re-run checkout using the instant-availability test card.',
      });
      return;
    }
    // Navigate in the same tab so any existing session/cookies apply consistently.
    onOpenChange(false);
    window.location.href = rerunCheckoutUrl;
  }, [onOpenChange, rerunCheckoutUrl, toast]);

  const tryRelease = useCallback(async () => {
    setTrying(true);
    try {
      await onTryReleaseAgain();
    } finally {
      setTrying(false);
    }
  }, [onOpenChange, onTryReleaseAgain]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          // Keep the modal within the viewport on smaller screens and allow scrolling.
          // (Some environments render slightly larger fonts which can otherwise overflow.)
          'w-[calc(100vw-2rem)] sm:w-full sm:max-w-lg max-h-[85vh] overflow-y-auto'
        }
      >
        <DialogHeader>
          <DialogTitle>Test Mode: Make Funds Available Instantly</DialogTitle>
          <DialogDescription>
            Stripe test payments can remain pending. Payout transfers require <span className="font-semibold">available</span> funds.
            Use this test card to create instantly-available funds so you can complete end-to-end payout testing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm">
            <div className="font-semibold">Important</div>
            <div className="mt-1 text-muted-foreground text-xs">
              Using this card helps when you create a <span className="font-semibold">new</span> test purchase. It does not change the settlement timing for this existing order.
            </div>
            {settlementInfo?.availableOnIso ? (
              <div className="mt-2 text-xs text-muted-foreground">
                This order’s funds are expected to become available at{' '}
                <span className="font-semibold">{new Date(settlementInfo.availableOnIso).toLocaleString()}</span>
                {typeof settlementInfo.minutesUntilAvailable === 'number'
                  ? ` (~${settlementInfo.minutesUntilAvailable} minutes)`
                  : ''}
                .
              </div>
            ) : null}
          </div>

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

          <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
            If you land on a “Coming Soon / Private beta” screen, open the access page first, enter the access password,
            then return to the listing and proceed to checkout.
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2 flex flex-col sm:flex-row sm:flex-wrap sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Close
          </Button>
          <Button type="button" variant="outline" onClick={openAccessGate} className="w-full sm:w-auto">
            Open access page
          </Button>
          <Button type="button" variant="secondary" onClick={openCheckout} className="w-full sm:w-auto">
            Create new test purchase
          </Button>
          <Button type="button" onClick={tryRelease} disabled={trying} className="w-full sm:w-auto">
            {trying ? 'Trying…' : 'Try release again'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

