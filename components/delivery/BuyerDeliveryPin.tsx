'use client';

/**
 * Buyer-only: fetches and displays the delivery PIN.
 * Only the buyer sees this. They enter it on the driver's device at delivery.
 */

import { useEffect, useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';

interface BuyerDeliveryPinProps {
  orderId: string;
  getAuthToken: () => Promise<string>;
  className?: string;
}

export function BuyerDeliveryPin({ orderId, getAuthToken, className }: BuyerDeliveryPinProps) {
  const [pin, setPin] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getAuthToken();
        const res = await fetch('/api/delivery/buyer-pin', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ orderId }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.deliveryPin) {
          setPin(data.deliveryPin);
        } else {
          setError(data.error || 'PIN not available');
        }
      } catch {
        if (!cancelled) setError('Failed to load PIN');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  if (loading) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your delivery PIN…
        </div>
      </div>
    );
  }

  if (error && !pin) {
    if (error.includes('not yet created') || error.includes('not found')) {
      return (
        <div className={className}>
          <p className="text-xs text-muted-foreground">Your PIN will appear here when the seller sets up the delivery link.</p>
        </div>
      );
    }
    return null;
  }

  if (!pin) return null;

  return (
    <div className={className}>
      <div className="rounded-lg border-2 border-primary/30 bg-primary/5 px-4 py-3">
        <p className="text-sm font-medium text-foreground/90">Your delivery PIN</p>
        <p className="text-xs text-muted-foreground mt-0.5">The seller or driver will ask for this when they arrive. Enter it on their phone to unlock the signature and photo steps — only you have this PIN.</p>
        <div className="mt-2 flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-lg font-semibold tracking-wider">{pin}</span>
        </div>
      </div>
    </div>
  );
}
