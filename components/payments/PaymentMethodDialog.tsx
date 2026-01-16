import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Landmark, Cable } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getRecommendationCopy, getRecommendedPaymentMethod } from '@/lib/payments/recommendation';

export type PaymentMethodChoice = 'card' | 'bank_transfer' | 'wire';

export function PaymentMethodDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amountUsd: number;
  onSelect: (method: PaymentMethodChoice) => void | Promise<void>;
}) {
  const { open, onOpenChange, amountUsd, onSelect } = props;

  const recommended = getRecommendedPaymentMethod(amountUsd) as PaymentMethodChoice;
  const baseOptions = [
    { key: 'card', title: 'Card', icon: CreditCard, copy: getRecommendationCopy('card', amountUsd) },
    { key: 'bank_transfer', title: 'Bank Transfer', icon: Landmark, copy: getRecommendationCopy('bank_transfer', amountUsd) },
    { key: 'wire', title: 'Wire Transfer', icon: Cable, copy: getRecommendationCopy('wire', amountUsd) },
  ] satisfies Array<{ key: PaymentMethodChoice; title: string; icon: LucideIcon; copy: string }>;

  const options = [...baseOptions].sort((a, b) => (a.key === recommended ? -1 : b.key === recommended ? 1 : 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose payment method</DialogTitle>
          <DialogDescription>
            All payment methods are available. For large purchases, some banks may limit card payments.
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
            Funds are held until delivery confirmation.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

