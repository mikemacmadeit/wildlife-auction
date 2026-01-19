import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { PaymentMethodChoice } from '@/components/payments/PaymentMethodDialog';

export function CheckoutStartErrorDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attemptedMethod: PaymentMethodChoice;
  errorMessage: string;
  technicalDetails?: string;
  canSwitchBank?: boolean;
  canSwitchWire?: boolean;
  onRetryCard: () => void | Promise<void>;
  onSwitchBank: () => void | Promise<void>;
  onSwitchWire: () => void | Promise<void>;
}) {
  const { open, onOpenChange, attemptedMethod, errorMessage, technicalDetails, canSwitchBank = true, canSwitchWire = true, onRetryCard, onSwitchBank, onSwitchWire } = props;
  const [showTech, setShowTech] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg border-2 w-[calc(100vw-2rem)] sm:w-full">
        <DialogHeader>
          <DialogTitle>Checkout couldn’t be started</DialogTitle>
          <DialogDescription>
            {attemptedMethod === 'card'
              ? 'Try again with card, or use ACH/wire if available for this order.'
              : 'Try another payment method.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">What happened</div>
              <Badge variant="secondary">Tried: {attemptedMethod}</Badge>
            </div>
            <div className="text-muted-foreground mt-1">{errorMessage}</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button variant="outline" onClick={onSwitchBank} disabled={!canSwitchBank} className="border-2">
              Switch to ACH
            </Button>
            <Button variant="outline" onClick={onSwitchWire} disabled={!canSwitchWire} className="border-2">
              Switch to Wire
            </Button>
            <Button onClick={onRetryCard} className="font-semibold">
              Retry Card
            </Button>
          </div>

          {technicalDetails ? (
            <div className="rounded-lg border p-3">
              <button
                type="button"
                className="w-full flex items-center justify-between text-sm font-semibold"
                onClick={() => setShowTech((s) => !s)}
              >
                Technical details
                {showTech ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showTech ? (
                <pre className="mt-2 whitespace-pre-wrap break-all text-xs text-muted-foreground max-h-[30vh] overflow-y-auto overflow-x-hidden">
                  {technicalDetails}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

