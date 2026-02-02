'use client';

/**
 * Public driver page. No auth required.
 * URL: /delivery/driver?token=...
 * Shows minimal order info and "Show QR for Buyer Signature" button.
 */

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { QrCode, Copy, Check, AlertCircle, Loader2 } from 'lucide-react';
import { BrandLogoText } from '@/components/navigation/BrandLogoText';
import QRCode from 'qrcode';

function json(body: unknown, init?: { status?: number }) {
  return new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: { 'content-type': 'application/json' } });
}

interface VerifyResult {
  valid: boolean;
  role?: string;
  orderShortId?: string;
  listingTitle?: string;
  ranchLabel?: string;
  deliveryWindowStart?: string;
  deliveryWindowEnd?: string;
  error?: string;
  alreadyDelivered?: boolean;
  expired?: boolean;
}

export default function DeliveryDriverPage() {
  const searchParams = useSearchParams();
  const token = (searchParams?.get('token') ?? '') || '';

  const [loading, setLoading] = useState(true);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [buyerLink, setBuyerLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!token) {
      setVerify({ valid: false, error: 'Missing token' });
      setLoading(false);
      return;
    }

    fetch('/api/delivery/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then(async (data: VerifyResult) => {
        setVerify(data);
        if (data.valid && data.role === 'driver') {
          const linkRes = await fetch('/api/delivery/buyer-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
          const linkData = await linkRes.json();
          if (linkData.buyerConfirmLink) {
            setBuyerLink(linkData.buyerConfirmLink);
            QRCode.toDataURL(linkData.buyerConfirmLink, { width: 280, margin: 2 }).then(setQrDataUrl).catch(() => {});
          }
        }
      })
      .catch(() => setVerify({ valid: false, error: 'Verification failed' }))
      .finally(() => setLoading(false));
  }, [token]);

  const handleCopyDriverLink = () => {
    if (typeof window !== 'undefined' && token) {
      const url = window.location.href;
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const handleCopyBuyerLink = () => {
    if (buyerLink) {
      navigator.clipboard.writeText(buyerLink).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const startTracking = async () => {
    if (!token || trackingLoading) return;
    setTrackingLoading(true);
    try {
      const res = await fetch('/api/delivery/start-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start');
      setTracking(true);
      setLocationDenied(false);

      if ('geolocation' in navigator) {
        const id = navigator.geolocation.watchPosition(
          (pos) => {
            fetch('/api/delivery/ping-location', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                token,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              }),
            }).catch(() => {});
          },
          () => setLocationDenied(true),
          { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
        );
        watchIdRef.current = id;
      }
    } catch (e: any) {
      setTracking(false);
    } finally {
      setTrackingLoading(false);
    }
  };

  const stopTracking = async () => {
    if (!token || trackingLoading) return;
    setTrackingLoading(true);
    try {
      const res = await fetch('/api/delivery/stop-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to stop');
      }
      setTracking(false);
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    } catch (e: any) {
      // keep tracking state on error
    } finally {
      setTrackingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Verifying link...</p>
      </div>
    );
  }

  if (!verify?.valid) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-muted/30">
        <header className="absolute top-4 left-4">
          <Link href="/">
            <BrandLogoText className="text-xl" />
          </Link>
        </header>
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Invalid or Expired Link
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              {verify?.expired
                ? 'This link has expired. Ask the seller for a new one.'
                : verify?.alreadyDelivered
                  ? 'Delivery was already confirmed.'
                  : verify?.error || 'This link is invalid or has expired.'}
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/">Go to homepage</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (verify.role !== 'driver') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <p className="text-muted-foreground">This link is for the driver. Use the buyer link to confirm delivery.</p>
            <Button asChild variant="outline" className="w-full mt-4">
              <Link href="/">Go to homepage</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formatDate = (s?: string) => (s ? new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="border-b bg-background px-4 py-3 flex items-center justify-between">
        <Link href="/">
          <BrandLogoText className="text-xl" />
        </Link>
      </header>

      <main className="flex-1 p-6 max-w-lg mx-auto w-full space-y-6">
        <div>
          <h1 className="text-lg font-semibold">Delivery</h1>
          <p className="text-sm text-muted-foreground">Order {verify.orderShortId || ''}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{verify.listingTitle || 'Order'}</CardTitle>
            {tracking && (
              <p className="text-sm text-green-600 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Tracking active
              </p>
            )}
            {verify.ranchLabel && <p className="text-sm text-muted-foreground">{verify.ranchLabel}</p>}
            {(verify.deliveryWindowStart || verify.deliveryWindowEnd) && (
              <p className="text-sm text-muted-foreground">
                Window: {formatDate(verify.deliveryWindowStart)} – {formatDate(verify.deliveryWindowEnd)}
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              {!tracking ? (
                <Button
                  onClick={startTracking}
                  disabled={trackingLoading}
                  variant="default"
                  className="min-h-[44px] touch-manipulation"
                >
                  {trackingLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Start Tracking
                </Button>
              ) : (
                <Button
                  onClick={stopTracking}
                  disabled={trackingLoading}
                  variant="outline"
                  className="min-h-[44px] touch-manipulation"
                >
                  {trackingLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Stop Tracking
                </Button>
              )}
            </div>
            {locationDenied && (
              <p className="text-sm text-amber-600">
                Location access was denied. Tracking disabled, but you can still show the QR for the buyer to sign.
              </p>
            )}

            <p className="text-sm text-muted-foreground">
              Show the QR code below to the buyer so they can sign and confirm delivery.
            </p>

            {!showQR ? (
              <Button onClick={() => setShowQR(true)} className="w-full min-h-[48px]">
                <QrCode className="h-5 w-5 mr-2" />
                Show QR for Buyer Signature
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-center p-4 bg-white rounded-lg">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="Buyer signature QR" className="w-[280px] h-[280px]" />
                  ) : (
                    <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
                  )}
                </div>
                <p className="text-center text-sm text-muted-foreground">Buyer scans this to confirm delivery</p>
                <Button variant="outline" onClick={() => setShowQR(false)} className="w-full">
                  Hide QR
                </Button>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopyDriverLink} className="flex-1">
                {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                Copy Driver Link
              </Button>
              <Button variant="outline" size="sm" onClick={handleCopyBuyerLink} className="flex-1">
                {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                Copy Buyer Link
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
