import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Landmark, Banknote } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getRecommendationCopy, getRecommendedPaymentMethod } from '@/lib/payments/recommendation';
import { getEligiblePaymentMethods, type SupportedPaymentMethod } from '@/lib/payments/gating';
import { cn } from '@/lib/utils';
import { AmexBadge, ApplePayBadge, GooglePayBadge, LinkBadge, MastercardBadge, VisaBadge } from '@/components/payments/PaymentBrandBadges';

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
      <DialogContent className="sm:max-w-lg border-2 w-[calc(100vw-2rem)] sm:w-full bg-background shadow-2xl">
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
                className={cn(
                  'w-full min-h-[72px] h-auto py-4 px-3 sm:px-4 text-left border-2 rounded-xl',
                  'transition-colors',
                  isRec && isEnabled
                    ? 'border-primary/40 bg-primary/5 hover:bg-primary/10'
                    : isEnabled
                      ? 'border-border/60 bg-card hover:bg-muted/30'
                      : 'border-border/40 bg-muted/20 opacity-70'
                )}
                onClick={() => onSelect(opt.key)}
                disabled={!isEnabled}
              >
                <div className="w-full flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={cn(
                        'h-10 w-10 rounded-xl border flex items-center justify-center shrink-0',
                        isRec && isEnabled ? 'bg-primary/10 border-primary/25' : 'bg-muted/20 border-border/60'
                      )}
                    >
                      <Icon className={cn('h-5 w-5', isRec && isEnabled ? 'text-primary' : 'text-foreground')} />
                    </div>
                    <div className="text-left min-w-0">
                      <div className="font-semibold leading-tight break-words text-foreground">{opt.title}</div>
                      <div className="text-xs text-muted-foreground mt-1 break-words">{opt.copy}</div>
                      {opt.key === 'card' ? (
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <VisaBadge />
                          <MastercardBadge />
                          <AmexBadge />
                          <ApplePayBadge />
                          <GooglePayBadge />
                          <LinkBadge />
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <Badge
                    variant={badge.variant}
                    className={cn(
                      'shrink-0',
                      isRec ? 'bg-primary text-primary-foreground border-primary/30' : undefined
                    )}
                  >
                    {badge.text}
                  </Badge>
                </div>
              </Button>
            );
          })}

          <div className="text-xs text-muted-foreground rounded-lg border bg-muted/20 p-3">
            {canUseBankRails
              ? 'Card payments are fastest; ACH and wire can reduce bank/card declines on larger purchases.'
              : 'To use ACH or wire, sign in and verify your email address.'}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

