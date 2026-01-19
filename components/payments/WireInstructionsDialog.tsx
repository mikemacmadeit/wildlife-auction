'use client';

import { useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

export function WireInstructionsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: null | {
    orderId: string;
    paymentIntentId: string;
    instructions: { reference: string; financialAddresses: Array<{ type: string; address: any }> };
  };
}) {
  const { open, onOpenChange, data } = props;
  const { toast } = useToast();

  const reference = data?.instructions?.reference || '';
  const addresses = useMemo(() => data?.instructions?.financialAddresses || [], [data?.instructions?.financialAddresses]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied', description: `${label} copied to clipboard.` });
    } catch {
      toast({ title: 'Copy failed', description: 'Please copy manually.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl border-2 w-[calc(100vw-2rem)] sm:w-full">
        <DialogHeader>
          <DialogTitle>Wire transfer instructions</DialogTitle>
          <DialogDescription>
            Send a bank/wire transfer using the details below. Funds are held in escrow once received.
          </DialogDescription>
        </DialogHeader>

        {!data ? (
          <div className="text-sm text-muted-foreground">Loading instructions…</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-xs text-muted-foreground">Reference code (required)</div>
                  <div className="font-mono text-sm break-all">{reference || '—'}</div>
                </div>
                <Button variant="outline" onClick={() => copy(reference, 'Reference code')} disabled={!reference}>
                  Copy reference code
                </Button>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Always include this reference so Stripe can match the incoming transfer to your order.
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs text-muted-foreground">Order</div>
                <Badge variant="secondary" className="font-mono text-xs">
                  {data.orderId}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3 flex-wrap mt-2">
                <div className="text-xs text-muted-foreground">PaymentIntent</div>
                <Badge variant="secondary" className="font-mono text-xs">
                  {data.paymentIntentId}
                </Badge>
              </div>
            </div>

            <div className="rounded-lg border p-3">
              <div className="text-sm font-semibold mb-2">Bank details</div>
              {addresses.length === 0 ? (
                <div className="text-sm text-muted-foreground">No bank details were returned by Stripe.</div>
              ) : (
                <div className="space-y-3">
                  {addresses.map((fa, idx) => (
                    <div key={`${fa.type}-${idx}`} className="rounded-md bg-muted/40 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold">{fa.type || 'bank'}</div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copy(JSON.stringify(fa.address, null, 2), 'Bank details JSON')}
                        >
                          Copy details
                        </Button>
                      </div>
                      <pre className="mt-2 text-xs overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all max-h-[220px]">
                        {JSON.stringify(fa.address, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              After funds are received, your order will automatically move to <span className="font-semibold">paid_held</span>.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

