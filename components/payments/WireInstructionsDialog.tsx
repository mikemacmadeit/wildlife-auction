'use client';

import { useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

type AddressLine = { label: string; value: string };

function formatBankAddress(type: string, address: any): AddressLine[] {
  if (!address || typeof address !== 'object') return [];
  const a = address as Record<string, unknown>;
  const line = (label: string, v: unknown) =>
    v != null && String(v).trim() ? { label, value: String(v).trim() } : null;
  const fmtAddr = (o: any) => {
    if (!o || typeof o !== 'object') return '';
    const parts = [o.line1, o.line2, o.city, o.state, o.postal_code, o.country].filter(Boolean);
    return parts.join(', ');
  };

  if (type === 'aba') {
    return [
      line('Bank name', a.bank_name),
      line('Routing number (ABA)', a.routing_number),
      line('Account number', a.account_number),
      line('Account type', a.account_type),
      line('Account holder name', a.account_holder_name),
      fmtAddr(a.account_holder_address) ? { label: 'Account holder address', value: fmtAddr(a.account_holder_address) } : null,
      fmtAddr(a.bank_address) ? { label: 'Bank address', value: fmtAddr(a.bank_address) } : null,
    ].filter(Boolean) as AddressLine[];
  }
  if (type === 'swift') {
    return [
      line('Bank name', a.bank_name),
      line('SWIFT code', a.swift_code),
      line('Account number', a.account_number),
      line('Account type', a.account_type),
      line('Account holder name', a.account_holder_name),
      fmtAddr(a.account_holder_address) ? { label: 'Account holder address', value: fmtAddr(a.account_holder_address) } : null,
      fmtAddr(a.bank_address) ? { label: 'Bank address', value: fmtAddr(a.bank_address) } : null,
    ].filter(Boolean) as AddressLine[];
  }
  return [];
}

function bankAddressToCopyText(type: string, address: any): string {
  const lines = formatBankAddress(type, address);
  return lines.map(({ label, value }) => `${label}: ${value}`).join('\n');
}

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
      <DialogContent className="flex flex-col max-h-[90dvh] sm:max-h-[90vh] overflow-hidden sm:max-w-2xl border-2 w-[calc(100vw-2rem)] sm:w-full p-3 sm:p-4 md:p-6">
        <DialogHeader className="shrink-0 pb-2 pr-8">
          <DialogTitle className="text-base sm:text-lg">Wire transfer instructions</DialogTitle>
          <DialogDescription className="text-xs sm:text-sm mt-0.5">
            Send a bank/wire transfer using the details below. Payments are processed by Stripe. Agchange does not hold funds or condition payouts on delivery.
          </DialogDescription>
        </DialogHeader>

        {!data ? (
          <div className="text-sm text-muted-foreground py-4">Loading instructions…</div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-3 sm:space-y-4 -mx-1 px-1">
            <div className="rounded-lg border p-2.5 sm:p-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[11px] sm:text-xs text-muted-foreground">Reference code (required)</div>
                  <div className="font-mono text-xs sm:text-sm break-all">{reference || '—'}</div>
                </div>
                <Button variant="outline" size="sm" className="w-full sm:w-auto shrink-0" onClick={() => copy(reference, 'Reference code')} disabled={!reference}>
                  Copy reference code
                </Button>
              </div>
              <div className="text-[11px] sm:text-xs text-muted-foreground mt-2">
                Always include this reference so Stripe can match the incoming transfer to your order.
              </div>
            </div>

            <div className="rounded-lg border p-2.5 sm:p-3">
              <div className="flex flex-col sm:flex-row gap-2 flex-wrap">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="text-[11px] sm:text-xs text-muted-foreground shrink-0">Order</span>
                  <Badge variant="secondary" className="font-mono text-[10px] sm:text-xs truncate max-w-[50%] sm:max-w-none">
                    {data.orderId}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="text-[11px] sm:text-xs text-muted-foreground shrink-0">PaymentIntent</span>
                  <Badge variant="secondary" className="font-mono text-[10px] sm:text-xs truncate max-w-[50%] sm:max-w-none">
                    {data.paymentIntentId}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-2.5 sm:p-3">
              <div className="text-xs sm:text-sm font-semibold mb-2">Bank details</div>
              {addresses.length === 0 ? (
                <div className="text-sm text-muted-foreground">No bank details were returned by Stripe.</div>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {addresses.map((fa, idx) => {
                    const readable = formatBankAddress(fa.type, fa.address);
                    const copyText = readable.length ? bankAddressToCopyText(fa.type, fa.address) : JSON.stringify(fa.address, null, 2);
                    const typeLabel = fa.type === 'aba' ? 'US (ABA / routing)' : fa.type === 'swift' ? 'International (SWIFT)' : fa.type || 'Bank';
                    return (
                      <div key={`${fa.type}-${idx}`} className="rounded-md bg-muted/40 p-2 sm:p-3">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div className="text-[11px] sm:text-xs font-semibold uppercase tracking-wide">{typeLabel}</div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full sm:w-auto shrink-0"
                            onClick={() => copy(copyText, 'Bank details')}
                          >
                            Copy details
                          </Button>
                        </div>
                        {readable.length > 0 ? (
                          <dl className="mt-1.5 sm:mt-2 text-xs sm:text-sm space-y-1 sm:space-y-1.5">
                            {readable.map(({ label, value }) => (
                              <div key={label} className="flex flex-col sm:flex-row sm:flex-wrap gap-x-2 gap-y-0">
                                <dt className="text-muted-foreground shrink-0 text-[11px] sm:text-xs">{label}</dt>
                                <dd className="font-mono text-[11px] sm:text-xs break-all min-w-0">{value}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                          <pre className="mt-2 text-[11px] sm:text-xs overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-all max-h-[40vh] sm:max-h-[220px]">
                            {JSON.stringify(fa.address, null, 2)}
                          </pre>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="text-[11px] sm:text-xs text-muted-foreground pb-1">
              After funds are received, your order will automatically move to <span className="font-semibold">paid_held</span>.
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

