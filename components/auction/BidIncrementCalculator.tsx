'use client';

import { useState, useMemo } from 'react';
import { Calculator, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface BidIncrementCalculatorProps {
  currentBid?: number;
  startingBid?: number;
  onBidChange?: (amount: number) => void;
  className?: string;
}

const INCREMENT_PRESETS = [50, 100, 250, 500, 1000, 2500, 5000];

export function BidIncrementCalculator({
  currentBid,
  startingBid = 0,
  onBidChange,
  className,
}: BidIncrementCalculatorProps) {
  const [customBid, setCustomBid] = useState<string>('');
  const [useMaxBid, setUseMaxBid] = useState(false);
  const [maxBid, setMaxBid] = useState<string>('');

  const baseAmount = currentBid || startingBid || 0;
  
  // Calculate minimum bid (typically 5% increment)
  const minBid = useMemo(() => {
    if (baseAmount === 0) return startingBid || 0;
    // 5% increment with minimum of $50
    const increment = Math.max(baseAmount * 0.05, 50);
    return Math.ceil(baseAmount + increment);
  }, [baseAmount, startingBid]);

  const suggestedIncrements = useMemo(() => {
    return INCREMENT_PRESETS.map(preset => {
      const bidAmount = baseAmount + preset;
      return {
        preset,
        amount: bidAmount,
        display: `$${bidAmount.toLocaleString()}`,
        increment: `+$${preset.toLocaleString()}`,
      };
    }).filter(item => item.amount >= minBid);
  }, [baseAmount, minBid]);

  const handlePresetClick = (amount: number) => {
    setCustomBid(amount.toString());
    if (onBidChange) onBidChange(amount);
  };

  const handleCustomBidChange = (value: string) => {
    setCustomBid(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && onBidChange) {
      onBidChange(numValue);
    }
  };

  const calculateAutoBidStrategy = () => {
    if (!maxBid || !useMaxBid) return null;
    const max = parseFloat(maxBid);
    if (isNaN(max) || max <= baseAmount) return null;

    // Strategy: Bid incrementally up to max
    const currentIncrement = minBid - baseAmount;
    const remaining = max - baseAmount;
    const numberOfBids = Math.floor(remaining / currentIncrement);

    return {
      max,
      currentIncrement,
      numberOfBids,
      finalBid: baseAmount + (numberOfBids * currentIncrement),
    };
  };

  const autoBidStrategy = calculateAutoBidStrategy();

  return (
    <Card className={cn('border-border/50', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          Bid Calculator
        </CardTitle>
        <p className="text-sm text-muted-foreground font-normal mt-2">
          Current bid: <span className="font-bold text-foreground">${baseAmount.toLocaleString()}</span>
          {' • '}
          Minimum: <span className="font-bold text-foreground">${minBid.toLocaleString()}</span>
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick Increment Buttons */}
        <div>
          <Label className="text-sm font-semibold mb-2 block">Quick Increments</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {suggestedIncrements.slice(0, 6).map((item) => (
              <Button
                key={item.preset}
                variant="outline"
                size="sm"
                onClick={() => handlePresetClick(item.amount)}
                className={cn(
                  'h-auto py-2.5 flex flex-col items-center gap-0.5',
                  'hover:bg-primary hover:text-primary-foreground hover:border-primary',
                  'transition-all'
                )}
              >
                <span className="font-bold text-sm">{item.display}</span>
                <span className="text-xs text-muted-foreground">{item.increment}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Custom Bid Input */}
        <div className="space-y-2">
          <Label htmlFor="custom-bid" className="text-sm font-semibold">Custom Bid Amount</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">$</span>
            <Input
              id="custom-bid"
              type="number"
              value={customBid}
              onChange={(e) => handleCustomBidChange(e.target.value)}
              placeholder={minBid.toLocaleString()}
              min={minBid}
              className="pl-8 h-12 text-base font-bold"
            />
          </div>
          {customBid && parseFloat(customBid) < minBid && (
            <p className="text-xs text-destructive font-medium">
              Bid must be at least ${minBid.toLocaleString()}
            </p>
          )}
        </div>

        {/* Auto-Bid / Maximum Bid */}
        <div className="space-y-3 pt-2 border-t border-border/50">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="use-max-bid"
              checked={useMaxBid}
              onChange={(e) => setUseMaxBid(e.target.checked)}
              className="w-4 h-4 rounded border-border"
            />
            <Label htmlFor="use-max-bid" className="text-sm font-semibold cursor-pointer">
              Set Maximum Bid (Auto-Bid)
            </Label>
          </div>
          
          {useMaxBid && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-2"
            >
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">$</span>
                <Input
                  type="number"
                  value={maxBid}
                  onChange={(e) => setMaxBid(e.target.value)}
                  placeholder="Enter maximum bid"
                  min={minBid}
                  className="pl-8 h-12 text-base font-bold"
                />
              </div>
              
              {autoBidStrategy && (
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                    <TrendingUp className="h-4 w-4" />
                    <span>Auto-Bid Strategy</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    We'll bid ${autoBidStrategy.currentIncrement.toLocaleString()} increments up to your maximum of ${autoBidStrategy.max.toLocaleString()}.
                    {autoBidStrategy.numberOfBids > 0 && (
                      <> Estimated {autoBidStrategy.numberOfBids} automatic bids.</>
                    )}
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Bid Summary */}
        {customBid && parseFloat(customBid) >= minBid && (
          <div className="pt-3 border-t border-border/50 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Your Bid</span>
              <span className="font-bold text-lg">${parseFloat(customBid).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Platform Fee (3%)</span>
              <span>${(parseFloat(customBid) * 0.03).toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-sm font-bold pt-1 border-t border-border/30">
              <span>Total</span>
              <span className="text-primary">${((parseFloat(customBid) * 1.03)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
