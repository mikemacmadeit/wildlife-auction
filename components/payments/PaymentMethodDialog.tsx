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

  const options = baseOptions
    .filter((o) => eligible.includes(o.key))
    .sort((a, b) => (a.key === recommended ? -1 : b.key === recommended ? 1 : 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose payment method</DialogTitle>
          <DialogDescription>
            Cards (including Apple Pay / Google Pay / Link) are always available. ACH and wire are available for eligible orders.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {options.map((opt) => {
            const Icon = opt.icon;
            const isRec = opt.key === recommended;
            return (
              <Button
                key={opt.key}
                variant="outline"
                className="w-full justify-between min-h-[60px]"
                onClick={() => onSelect(opt.key)}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5" />
                  <div className="text-left">
                    <div className="font-semibold">{opt.title}</div>
                    <div className="text-xs text-muted-foreground">{opt.copy}</div>
                  </div>
                </div>
                {isRec ? (
                  <Badge className="bg-primary text-primary-foreground">Recommended</Badge>
                ) : (
                  <Badge variant="secondary">Available</Badge>
                )}
              </Button>
            );
          })}

          <div className="text-xs text-muted-foreground">
            Funds are held in escrow until delivery confirmation and issue windows are complete.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

