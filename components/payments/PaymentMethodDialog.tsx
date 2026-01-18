import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Landmark, Banknote } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getRecommendationCopy, getRecommendedPaymentMethod } from '@/lib/payments/recommendation';
import { getEligiblePaymentMethods, type SupportedPaymentMethod } from '@/lib/payments/gating';

export type PaymentMethodChoice = SupportedPaymentMethod;

export function PaymentMethodDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amountUsd: number;
  onSelect: (method: PaymentMethodChoice) => void | Promise<void>;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
}) {
  const { open, onOpenChange, amountUsd, onSelect, isAuthenticated, isEmailVerified } = props;

  const eligible = getEligiblePaymentMethods({ totalUsd: amountUsd, isAuthenticated, isEmailVerified });
  const recommended = getRecommendedPaymentMethod(amountUsd) as PaymentMethodChoice;
  const baseOptions: Array<{ key: PaymentMethodChoice; title: string; icon: LucideIcon; copy: string }> = [
    { key: 'card', title: 'Card / Apple Pay / Google Pay / Link', icon: CreditCard, copy: getRecommendationCopy('card', amountUsd) },
    { key: 'ach_debit', title: 'ACH Debit (US bank account)', icon: Landmark, copy: getRecommendationCopy('ach_debit', amountUsd) },
    { key: 'wire', title: 'Wire transfer', icon: Banknote, copy: getRecommendationCopy('wire', amountUsd) },
  ];

  const options = baseOptions.sort((a, b) => (a.key === recommended ? -1 : b.key === recommended ? 1 : 0));
  const canUseBankRails = isAuthenticated && isEmailVerified;
  const amountLabel = Number(amountUsd || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg border-2">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>Choose payment method</DialogTitle>
              <DialogDescription>
                Pick the best rail for this purchase. Funds are held in escrow once received.
              </DialogDescription>
            </div>
            <Badge variant="secondary" className="font-mono">
              {amountLabel}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {options.map((opt) => {
            const Icon = opt.icon;
            const isRec = opt.key === recommended;
            const isEnabled = opt.key === 'card' ? true : canUseBankRails;
            const badge = isRec
              ? { text: 'Recommended', variant: 'default' as const }
              : isEnabled
                ? { text: 'Available', variant: 'secondary' as const }
                : !isAuthenticated
                  ? { text: 'Sign in', variant: 'secondary' as const }
                  : { text: 'Verify email', variant: 'secondary' as const };
            return (
              <Button
                key={opt.key}
                variant="outline"
                className="w-full justify-between min-h-[66px] border-2 hover:bg-muted/30 disabled:opacity-60"
                onClick={() => onSelect(opt.key)}
                disabled={!isEnabled}
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl border bg-background flex items-center justify-center">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold">{opt.title}</div>
                    <div className="text-xs text-muted-foreground">{opt.copy}</div>
                  </div>
                </div>
                <Badge variant={badge.variant}>{badge.text}</Badge>
              </Button>
            );
          })}

          <div className="text-xs text-muted-foreground">
            {canUseBankRails
              ? 'Card payments are fastest; ACH and wire can reduce bank/card declines on larger purchases.'
              : 'To use ACH or wire, sign in and verify your email address.'}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

