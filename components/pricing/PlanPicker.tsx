'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PLAN_CONFIG, type PlanId } from '@/lib/pricing/plans';
import { Crown, Zap, CreditCard, CheckCircle2 } from 'lucide-react';

export function PlanPicker(props: {
  currentPlanId: PlanId;
  onSelectPaidPlan: (planId: 'pro' | 'elite') => void;
  loadingPlanId?: 'pro' | 'elite' | null;
  className?: string;
}) {
  const { currentPlanId, onSelectPaidPlan, loadingPlanId = null, className } = props;

  const plans = useMemo(() => {
    const free = PLAN_CONFIG.free;
    const pro = PLAN_CONFIG.pro;
    const elite = PLAN_CONFIG.elite;
    return [free, pro, elite];
  }, []);

  return (
    <div className={cn('grid gap-3 sm:grid-cols-3', className)}>
      {plans.map((p) => {
        const isCurrent = currentPlanId === p.id;
        const Icon = p.id === 'elite' ? Crown : p.id === 'pro' ? Zap : CreditCard;

        const limitLabel =
          p.listingLimit === null ? 'Unlimited' : `${p.listingLimit} active`;

        return (
          <Card
            key={p.id}
            className={cn(
              'border-2',
              p.id === 'elite'
                ? 'border-primary/30 bg-gradient-to-br from-primary/5 to-background'
                : p.id === 'pro'
                ? 'border-primary/20 bg-primary/5'
                : 'border-border/50 bg-card',
              isCurrent && 'ring-2 ring-primary/30'
            )}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'h-9 w-9 rounded-lg border-2 flex items-center justify-center',
                      p.id === 'free'
                        ? 'bg-muted/50 border-border/50'
                        : 'bg-primary/10 border-primary/20'
                    )}
                  >
                    <Icon className={cn('h-5 w-5', p.id === 'free' ? 'text-muted-foreground' : 'text-primary')} />
                  </div>
                  <div>
                    <CardTitle className="text-base font-extrabold">{p.displayName}</CardTitle>
                    <CardDescription className="text-xs">
                      {p.monthlyPrice === 0 ? '$0/mo' : `$${p.monthlyPrice}/mo`}
                    </CardDescription>
                  </div>
                </div>
                {isCurrent && (
                  <Badge variant="secondary" className="text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Current
                  </Badge>
                )}
              </div>
            </CardHeader>

            <CardContent className="pt-0 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Listing limit</span>
                <span className="font-semibold">{limitLabel}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Transaction fee</span>
                <span className="font-semibold">{Math.round(p.takeRate * 100)}%</span>
              </div>

              {p.id === 'free' ? (
                <Button variant="outline" className="w-full" disabled>
                  Included
                </Button>
              ) : (
                <Button
                  className="w-full font-semibold"
                  variant={p.id === 'pro' ? 'secondary' : 'default'}
                  disabled={isCurrent || loadingPlanId === p.id}
                  onClick={() => onSelectPaidPlan(p.id as 'pro' | 'elite')}
                >
                  {isCurrent ? 'Current plan' : `Upgrade to ${p.displayName}`}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

