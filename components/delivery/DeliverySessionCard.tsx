'use client';

/**
 * Seller-only: create delivery session, show driver link and buyer link.
 * Shown when order is DELIVERY_SCHEDULED (buyer confirmed delivery date).
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check, Loader2 } from 'lucide-react';

interface DeliverySessionCardProps {
  orderId: string;
  getAuthToken: () => Promise<string>;
  onError?: (msg: string) => void;
}

interface SessionData {
  driverLink: string;
  buyerConfirmLink?: string | null;
  deliveryPin?: string | null;
  expiresAt?: string;
  finalPaymentPending?: boolean;
}

export function DeliverySessionCard({ orderId, getAuthToken, onError }: DeliverySessionCardProps) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionData | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'driver' | 'buyer' | null>(null);
  const getAuthTokenRef = useRef(getAuthToken);
  const onErrorRef = useRef(onError);
  getAuthTokenRef.current = getAuthToken;
  onErrorRef.current = onError;

  const fetchSession = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setSetupError(null);
    try {
      const token = await getAuthTokenRef.current();
      const res = await fetch('/api/delivery/create-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 503 && (data.details?.includes?.('DELIVERY_TOKEN_SECRET') || data.error?.includes?.('misconfigured'))) {
          setSetupError('Driver links require DELIVERY_TOKEN_SECRET in .env.local. Add it (32+ chars), restart the dev server, then refresh.');
          setSession(null);
          return;
        }
        const errMsg = data.error || data.details || data.message || 'Failed to create session';
        setSetupError(typeof errMsg === 'string' ? errMsg : String(errMsg));
        setSession(null);
        return;
      }
      setSession({
        driverLink: data.driverLink,
        buyerConfirmLink: data.buyerConfirmLink ?? null,
        deliveryPin: data.deliveryPin ?? null,
        expiresAt: data.expiresAt,
        finalPaymentPending: data.finalPaymentPending === true,
      });
    } catch (e: any) {
      const msg = e?.message || 'Failed to load session';
      setSetupError(msg);
      setSession(null);
      onErrorRef.current?.(msg);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const copyDriver = () => {
    if (session?.driverLink) {
      navigator.clipboard.writeText(session.driverLink);
      setCopied('driver');
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const copyBuyer = () => {
    if (session?.buyerConfirmLink) {
      navigator.clipboard.writeText(session.buyerConfirmLink);
      setCopied('buyer');
      setTimeout(() => setCopied(null), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        <span>Getting your link...</span>
      </div>
    );
  }

  if (setupError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 text-sm">
        <p className="font-medium text-amber-800 dark:text-amber-200">Couldn&apos;t load driver link</p>
        <p className="mt-1 text-amber-700 dark:text-amber-300">{setupError}</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  const canCopyBuyer = session.buyerConfirmLink && !session.finalPaymentPending;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        <Button
          onClick={copyDriver}
          className="min-h-[48px] font-semibold shrink-0 touch-manipulation"
        >
          {copied === 'driver' ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
          {copied === 'driver' ? 'Copied!' : 'Copy link for driver'}
        </Button>
        {canCopyBuyer && (
          <Button variant="outline" size="sm" onClick={copyBuyer} className="min-h-[44px] shrink-0">
            {copied === 'buyer' ? <Check className="h-4 w-4 mr-1.5" /> : <Copy className="h-4 w-4 mr-1.5" />}
            {copied === 'buyer' ? 'Copied!' : 'Copy buyer link'}
          </Button>
        )}
      </div>
      {session.finalPaymentPending && (
        <p className="text-sm text-muted-foreground rounded-md bg-muted/50 px-3 py-2">
          Once the buyer pays the remaining balance, the buyer link and PIN will show here so you can share them at handoff.
        </p>
      )}
    </div>
  );
}
