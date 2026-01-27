import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CreditCard, Landmark, Banknote, Lock } from 'lucide-react';
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
      <DialogContent className="border-2 bg-background shadow-premium overflow-x-hidden w-[calc(100vw-2rem)] sm:w-full sm:max-w-3xl lg:max-w-4xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <DialogTitle>Choose payment method</DialogTitle>
              <DialogDescription className="hidden sm:block">
                Select how you&apos;d like to pay. All payments are encrypted and processed securely.
              </DialogDescription>
            </div>
            <Badge variant="secondary" className="font-semibold shrink-0 max-w-full tabular-nums">
              {amountLabel}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground pt-1">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5" aria-hidden />
              Secure checkout — your payment is encrypted.
            </span>
            <span className="hidden sm:inline">·</span>
            <span className="inline-flex items-center gap-1">Secured by Stripe</span>
          </div>
        </DialogHeader>

        {/* Compact layout (no scrolling) */}
        <TooltipProvider>
          <div className="space-y-3 sm:space-y-4">
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
              const disabledTooltip = !isEnabled
                ? !isAuthenticated
                  ? 'Sign in required to use this option'
                  : 'Verify email to use this option'
                : null;
              const btn = (
                <Button
                  variant="outline"
                  className={cn(
                    'w-full min-h-[56px] h-auto py-3 px-3 sm:px-4 text-left border-2 rounded-xl',
                    'transition-colors',
                    isRec && isEnabled
                      ? 'border-primary/40 bg-primary/5 hover:bg-primary/10'
                      : isEnabled
                        ? 'border-border/60 bg-card hover:bg-muted/30'
                        : 'border-border/40 bg-muted/20 opacity-70 cursor-not-allowed'
                  )}
                  onClick={() => isEnabled && onSelect(opt.key)}
                  disabled={!isEnabled}
                >
                  <div className="w-full flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={cn(
                          'h-9 w-9 rounded-xl border flex items-center justify-center shrink-0',
                          isRec && isEnabled ? 'bg-primary/10 border-primary/25' : 'bg-muted/20 border-border/60'
                        )}
                      >
                        <Icon className={cn('h-5 w-5', isRec && isEnabled ? 'text-primary' : 'text-foreground')} />
                      </div>
                      <div className="text-left min-w-0">
                        <div className="font-semibold leading-tight break-words text-foreground">{opt.title}</div>
                        <div className="hidden sm:block text-xs text-muted-foreground mt-1 break-words">{opt.copy}</div>
                        {opt.key === 'card' ? (
                          <div className="flex mt-2 items-center gap-1.5 sm:gap-2 flex-wrap">
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
              return disabledTooltip ? (
                <Tooltip key={opt.key}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex w-full min-w-0">{btn}</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    {disabledTooltip}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <div key={opt.key}>{btn}</div>
              );
            })}

            <div className="text-[11px] text-muted-foreground rounded-lg border bg-muted/20 px-3 py-2">
              {canUseBankRails ? 'Card is fastest. ACH/wire can help on larger purchases.' : 'Sign in + verify email for ACH/wire.'}
            </div>
          </div>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}

