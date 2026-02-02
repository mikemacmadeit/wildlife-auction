'use client';

/**
 * Seller-only: create delivery session, show driver link and QR for buyer signature.
 * Shown when order is DELIVERY_SCHEDULED (buyer confirmed delivery date).
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { QrCode, Copy, Check, Loader2 } from 'lucide-react';
import QRCode from 'qrcode';

interface DeliverySessionCardProps {
  orderId: string;
  getAuthToken: () => Promise<string>;
  onError?: (msg: string) => void;
}

interface SessionData {
  driverLink: string;
  buyerConfirmLink: string;
  qrValue: string;
  expiresAt?: string;
}

export function DeliverySessionCard({ orderId, getAuthToken, onError }: DeliverySessionCardProps) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionData | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
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
        throw new Error(data.error || data.details || 'Failed to create session');
      }
      setSession({
        driverLink: data.driverLink,
        buyerConfirmLink: data.buyerConfirmLink,
        qrValue: data.qrValue || data.buyerConfirmLink,
        expiresAt: data.expiresAt,
      });
      if (data.qrValue || data.buyerConfirmLink) {
        QRCode.toDataURL(data.qrValue || data.buyerConfirmLink, { width: 200, margin: 2 })
          .then(setQrDataUrl)
          .catch(() => {});
      }
    } catch (e: any) {
      onErrorRef.current?.(e?.message || 'Failed to load session');
      setSession(null);
      setSetupError(null);
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
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading driver link...
      </div>
    );
  }

  if (setupError) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-4 text-sm">
        <p className="font-medium text-amber-800 dark:text-amber-200">Driver link setup required</p>
        <p className="mt-1 text-amber-700 dark:text-amber-300">{setupError}</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
      <p className="text-sm font-medium">Not delivering yourself?</p>
      <p className="text-xs text-muted-foreground">
        Send the driver link to your driver. At delivery, show the QR so the buyer can sign and confirm.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={copyDriver} className="min-h-[36px]">
          {copied === 'driver' ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
          Copy Driver Link
        </Button>
        <Button variant="outline" size="sm" onClick={copyBuyer} className="min-h-[36px]">
          {copied === 'buyer' ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
          Copy Buyer Link
        </Button>
      </div>
      {qrDataUrl && (
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white rounded border">
            <img src={qrDataUrl} alt="Buyer signature QR" className="w-[120px] h-[120px]" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <QrCode className="h-3 w-3" />
              QR for buyer to scan and sign
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
