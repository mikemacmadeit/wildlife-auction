import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Landmark, Banknote, Apple, Link2 } from 'lucide-react';
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

  const WalletChip = (props: { icon: React.ReactNode; label: string }) => (
    <div className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[11px] text-muted-foreground">
      {props.icon}
      <span className="font-semibold">{props.label}</span>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg border-2 w-[calc(100vw-2rem)] sm:w-full">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <DialogTitle>Choose payment method</DialogTitle>
              <DialogDescription>
                Pick the best rail for this purchase. Funds are held in escrow once received.
              </DialogDescription>
            </div>
            <Badge variant="secondary" className="font-mono shrink-0">
              {amountLabel}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          {options.map((opt) => {
            const Icon = opt.icon;
            const isRec = opt.key === recommended;
            const isEnabled = eligible.includes(opt.key);
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
                className="w-full min-h-[66px] border-2 hover:bg-muted/30 disabled:opacity-60 h-auto py-3 px-3 sm:px-4"
                onClick={() => onSelect(opt.key)}
                disabled={!isEnabled}
              >
                <div className="w-full flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-xl border bg-background flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="text-left min-w-0">
                      <div className="font-semibold leading-tight break-words">{opt.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 break-words">{opt.copy}</div>
                      {opt.key === 'card' ? (
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <WalletChip icon={<Apple className="h-3 w-3" />} label="Apple Pay" />
                          <WalletChip icon={<svg viewBox="0 0 24 24" className="h-3 w-3" aria-hidden="true"><path fill="currentColor" d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 2a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm-1 2h2v4h-2V7zm0 6h2v4h-2v-4z"/></svg>} label="Google Pay" />
                          <WalletChip icon={<Link2 className="h-3 w-3" />} label="Link" />
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <Badge variant={badge.variant} className="shrink-0">
                    {badge.text}
                  </Badge>
                </div>
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

