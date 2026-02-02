'use client';

/**
 * Public driver page. No auth required.
 * URL: /delivery/driver?token=...
 *
 * 3-step delivery process:
 * 1. PIN — Confirm recipient knows PIN to verify they're authorized
 * 2. Photo — Take a picture of the animals being delivered
 * 3. Signature — Recipient signs on this device (seller's/driver's phone)
 */

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, AlertCircle, Loader2, KeyRound, Camera, PenLine } from 'lucide-react';
import { BrandLogoText } from '@/components/navigation/BrandLogoText';
import { SignaturePad, type SignaturePadRef } from '@/components/delivery/SignaturePad';

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
  const [deliveryPin, setDeliveryPin] = useState('');
  const [tracking, setTracking] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  // 3-step state
  const [pinConfirmed, setPinConfirmed] = useState(false);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signatureRef = useRef<SignaturePadRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          setDeliveryPin(linkData.deliveryPin ?? '');
        }
      })
      .catch(() => setVerify({ valid: false, error: 'Verification failed' }))
      .finally(() => setLoading(false));
  }, [token]);

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
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to stop');
      setTracking(false);
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    } catch {
      /* keep state */
    } finally {
      setTrackingLoading(false);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmit = async () => {
    if (!token || !hasSignature) return;
    const base64 = signatureRef.current?.getPngBase64();
    if (!base64) {
      setError('Please sign before submitting.');
      return;
    }
    if (!deliveryPin || deliveryPin.length !== 6) {
      setError('PIN is required. Confirm with the recipient before completing.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, string> = {
        token,
        signaturePngBase64: base64,
        deliveryPin: deliveryPin.replace(/\D/g, '').slice(0, 6),
      };
      if (photoDataUrl) body.photoBase64 = photoDataUrl;

      const res = await fetch('/api/delivery/complete-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || data.message || 'Failed to complete delivery');
        return;
      }
      setSuccess(true);
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setTracking(false);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
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
          <Link href="/"><BrandLogoText className="text-xl" /></Link>
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

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-muted/30">
        <header className="absolute top-4 left-4">
          <Link href="/"><BrandLogoText className="text-xl" /></Link>
        </header>
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 pb-6 text-center">
            <Check className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Delivery confirmed</h2>
            <p className="text-muted-foreground">The seller has been notified.</p>
            <Button asChild variant="outline" className="w-full mt-6">
              <Link href="/">Done</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="border-b bg-background px-4 py-3">
        <Link href="/"><BrandLogoText className="text-xl" /></Link>
      </header>

      <main className="flex-1 p-6 max-w-lg mx-auto w-full space-y-6">
        <div>
          <h1 className="text-lg font-semibold">Delivery</h1>
          <p className="text-sm text-muted-foreground">{verify.listingTitle || 'Order'} · {verify.orderShortId || ''}</p>
          {(verify.deliveryWindowStart || verify.deliveryWindowEnd) && (
            <p className="text-sm text-muted-foreground mt-1">
              Window: {formatDate(verify.deliveryWindowStart)} – {formatDate(verify.deliveryWindowEnd)}
            </p>
          )}
        </div>

        {/* Live tracking toggle */}
        <Card>
          <CardContent className="pt-4 space-y-2">
            {!tracking ? (
              <Button onClick={startTracking} disabled={trackingLoading} variant="outline" className="w-full min-h-[44px]">
                {trackingLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Start live tracking
              </Button>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Tracking active
                </span>
                <Button onClick={stopTracking} disabled={trackingLoading} variant="ghost" size="sm">Stop</Button>
              </div>
            )}
            {locationDenied && (
              <p className="text-xs text-amber-600">Location denied. You can still complete delivery below.</p>
            )}
          </CardContent>
        </Card>

        {/* 3-step process */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Complete delivery</CardTitle>
            <p className="text-sm text-muted-foreground">Follow these 3 steps. Hand your phone to the recipient for step 3.</p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Step 1: PIN */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${pinConfirmed ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  {pinConfirmed ? <Check className="h-4 w-4" /> : '1'}
                </div>
                <span className="font-medium">Confirm PIN</span>
              </div>
              <p className="text-sm text-muted-foreground pl-10">
                Ask the recipient to tell you the delivery PIN. This ensures they are authorized to receive the animals.
              </p>
              {deliveryPin && (
                <div className="pl-10 flex items-center gap-2 py-2 px-3 rounded-lg bg-muted/50 w-fit">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-mono font-semibold">PIN: {deliveryPin}</span>
                </div>
              )}
              {!pinConfirmed && (
                <Button onClick={() => setPinConfirmed(true)} className="ml-10 min-h-[44px]">
                  Recipient confirmed PIN
                </Button>
              )}
            </div>

            {/* Step 2: Photo */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${photoDataUrl ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  {photoDataUrl ? <Check className="h-4 w-4" /> : '2'}
                </div>
                <span className="font-medium">Take photo</span>
              </div>
              <p className="text-sm text-muted-foreground pl-10">
                Take a picture of the animals being delivered.
              </p>
              <div className="pl-10 space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  aria-label="Take photo of animals being delivered"
                  onChange={handlePhotoChange}
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[44px] w-full sm:w-auto"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  {photoDataUrl ? 'Change photo' : 'Take photo'}
                </Button>
                {photoDataUrl && (
                  <div className="relative">
                    <img src={photoDataUrl} alt="Delivery" className="rounded-lg border max-h-48 object-cover" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-1 right-1 text-destructive hover:text-destructive"
                      onClick={() => setPhotoDataUrl(null)}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Step 3: Signature */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${hasSignature ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  {hasSignature ? <Check className="h-4 w-4" /> : '3'}
                </div>
                <span className="font-medium">Get signature</span>
              </div>
              <p className="text-sm text-muted-foreground pl-10">
                Hand your phone to the recipient. They sign below to confirm delivery.
              </p>
              <div className="pl-10">
                <SignaturePad
                  ref={signatureRef}
                  width={320}
                  height={160}
                  onSignatureChange={setHasSignature}
                  className="w-full"
                />
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </p>
            )}

            <Button
              onClick={handleSubmit}
              disabled={!pinConfirmed || !hasSignature || submitting}
              className="w-full min-h-[48px]"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Complete delivery
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
