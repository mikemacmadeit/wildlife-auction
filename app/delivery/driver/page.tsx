'use client';

/**
 * Public driver page. No auth required.
 * URL: /delivery/driver?token=...
 *
 * 3-step delivery process (protects both sides):
 * 1. PIN — Recipient (buyer) enters their PIN. Only they know it. Unlocks steps 2–3.
 * 2. Signature — Recipient signs on this device
 * 3. Photo — Take a picture of the animals at delivery
 */

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Check, AlertCircle, Loader2, KeyRound, Camera } from 'lucide-react';
import { BrandLogoText } from '@/components/navigation/BrandLogoText';
import { SignaturePad, type SignaturePadRef } from '@/components/delivery/SignaturePad';
import { cn } from '@/lib/utils';

interface VerifyResult {
  valid: boolean;
  role?: string;
  orderShortId?: string;
  listingTitle?: string;
  ranchLabel?: string;
  deliveryWindowStart?: string;
  deliveryWindowEnd?: string;
  finalPaymentConfirmed?: boolean;
  finalPaymentPending?: boolean;
  canMarkOut?: boolean;
  error?: string;
  alreadyDelivered?: boolean;
  expired?: boolean;
}

export default function DeliveryDriverPage() {
  const searchParams = useSearchParams();
  const token = (searchParams?.get('token') ?? '') || '';
  const embed = searchParams?.get('embed') === '1';

  const [loading, setLoading] = useState(true);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [tracking, setTracking] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [markOutLoading, setMarkOutLoading] = useState(false);
  const [markedOut, setMarkedOut] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  // 3-step state: Step 1 unlocks 2 and 3
  const [pinInput, setPinInput] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [pinVerifying, setPinVerifying] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [verifiedPin, setVerifiedPin] = useState(''); // Store for submit
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
      .then((data: VerifyResult) => {
        setVerify(data);
      })
      .catch(() => setVerify({ valid: false, error: 'Verification failed' }))
      .finally(() => setLoading(false));
  }, [token]);

  const handleVerifyPin = async () => {
    const trimmed = pinInput.replace(/\D/g, '').slice(0, 4);
    if (trimmed.length !== 4) {
      setPinError('Enter a 4-digit PIN');
      return;
    }
    setPinVerifying(true);
    setPinError(null);
    try {
      const res = await fetch('/api/delivery/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, pin: trimmed }),
      });
      const data = await res.json();
      if (data.valid) {
        setPinVerified(true);
        setVerifiedPin(trimmed);
        setPinError(null);
      } else {
        setPinError('Incorrect PIN. Ask the recipient to enter their delivery PIN from their order page.');
      }
    } catch {
      setPinError('Verification failed. Try again.');
    } finally {
      setPinVerifying(false);
    }
  };

  const startTracking = async () => {
    if (!token || trackingLoading) return;
    setTrackingLoading(true);
    setLocationDenied(false);
    try {
      // Request permission first — on mobile, getCurrentPosition triggers the prompt; watchPosition may fail if never granted
      if ('geolocation' in navigator) {
        const granted = await new Promise<boolean>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            () => resolve(true),
            () => resolve(false),
            { enableHighAccuracy: false, maximumAge: 60000, timeout: 20000 }
          );
        });
        if (!granted) {
          setLocationDenied(true);
          setTrackingLoading(false);
          return;
        }
      }
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

  /** Compress image for upload — mobile cameras often produce huge files that exceed server limits. */
  const compressImageForUpload = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => {
          const MAX_DIM = 1200;
          const quality = 0.85;
          let { width, height } = img;
          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          try {
            const out = canvas.toDataURL('image/jpeg', quality);
            resolve(out);
          } catch {
            resolve(dataUrl);
          }
        };
        img.onerror = () => reject(new Error('Could not load image'));
        img.src = dataUrl;
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsDataURL(file);
    });
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.target.value = '';
    try {
      const compressed = await compressImageForUpload(file);
      setPhotoDataUrl(compressed);
    } catch {
      setError('Could not process photo. Try a different image.');
    }
  };

  const handleSubmit = async () => {
    if (!token || !hasSignature || !pinVerified) return;
    const base64 = signatureRef.current?.getPngBase64();
    if (!base64) {
      setError('Please sign before submitting.');
      return;
    }
    if (!photoDataUrl) {
      setError('Please take a photo of the delivery before completing.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, string> = {
        token,
        signaturePngBase64: base64,
        deliveryPin: verifiedPin,
        photoBase64: photoDataUrl,
      };

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
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-background to-muted/20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Verifying link...</p>
      </div>
    );
  }

  if (!verify?.valid) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-muted/30">
        {!embed && (
          <header className="absolute top-4 left-4">
            <Link href="/"><BrandLogoText className="text-xl" /></Link>
          </header>
        )}
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
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-background to-muted/20">
        {!embed && (
          <header className="absolute top-4 left-4">
            <Link href="/"><BrandLogoText className="text-xl" /></Link>
          </header>
        )}
        <div className="max-w-sm w-full rounded-2xl border bg-background shadow-lg p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/50">
            <Check className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-xl font-semibold mb-1">Delivery confirmed</h2>
          <p className="text-sm text-muted-foreground">The seller has been notified.</p>
          <Button asChild variant="outline" className="w-full mt-6 rounded-lg h-11" size="sm">
            <Link href="/">Done</Link>
          </Button>
        </div>
      </div>
    );
  }

  const stepsComplete = [pinVerified, hasSignature, !!photoDataUrl];
  const StepDot = ({ n, done }: { n: number; done: boolean }) => (
    <div className={cn(
      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors',
      done ? 'bg-primary text-primary-foreground' : 'bg-muted/80 text-muted-foreground'
    )}>
      {done ? <Check className="h-5 w-5" /> : n}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/20">
      {!embed && (
        <header className="border-b bg-background/95 backdrop-blur px-4 py-3">
          <Link href="/"><BrandLogoText className="text-xl" /></Link>
        </header>
      )}

      <main className={`flex-1 p-5 sm:p-6 max-w-xl mx-auto w-full space-y-5 ${embed ? 'pt-5 sm:pt-6' : ''}`}>
        {/* Order info — compact pill */}
        <div className="rounded-xl bg-background border shadow-sm px-5 py-4">
          <h1 className="text-base font-semibold text-foreground">{verify.listingTitle || 'Delivery'}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{verify.orderShortId && `Order ${verify.orderShortId}`}</p>
          {(verify.deliveryWindowStart || verify.deliveryWindowEnd) && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {formatDate(verify.deliveryWindowStart)} – {formatDate(verify.deliveryWindowEnd)}
            </p>
          )}
        </div>

        {/* Mark out for delivery — driver only, when status is DELIVERY_SCHEDULED */}
        {verify.role === 'driver' && (verify.canMarkOut || markedOut) && (
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 dark:bg-primary/10 p-5">
            {markedOut ? (
              <p className="text-sm font-medium text-primary flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0" />
                Out for delivery — the buyer has been notified.
              </p>
            ) : (
              <>
                <p className="text-sm text-foreground mb-3">
                  When you’re on the way, mark the order as out for delivery so the buyer gets notified.
                </p>
                <Button
                  onClick={async () => {
                    if (!token || markOutLoading) return;
                    setMarkOutLoading(true);
                    try {
                      const res = await fetch('/api/delivery/mark-out-for-delivery', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token }),
                      });
                      const data = await res.json();
                      if (data.success) {
                        setMarkedOut(true);
                      } else {
                        setError(data.error || data.details || 'Failed to mark out for delivery');
                      }
                    } catch {
                      setError('Something went wrong. Try again.');
                    } finally {
                      setMarkOutLoading(false);
                    }
                  }}
                  disabled={markOutLoading}
                  className="w-full h-11 rounded-lg"
                >
                  {markOutLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Mark out for delivery
                </Button>
              </>
            )}
          </div>
        )}

        {/* Live tracking — compact */}
        <div className="rounded-xl border bg-background shadow-sm p-5">
          {!tracking ? (
            <Button onClick={startTracking} disabled={trackingLoading} variant="outline" className="w-full h-11 rounded-lg border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 hover:border-emerald-400 dark:hover:border-emerald-600">
              {trackingLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Start live tracking
            </Button>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                Tracking active
              </span>
              <Button onClick={stopTracking} disabled={trackingLoading} variant="ghost" size="sm" className="text-muted-foreground">Stop</Button>
            </div>
          )}
          {locationDenied && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm mt-3">
              <p className="font-medium text-amber-800 dark:text-amber-200">Location denied</p>
              <p className="text-xs mt-1 text-amber-700 dark:text-amber-300">
                {typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)
                  ? 'iPhone: Settings → Safari → Location → Allow'
                  : typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
                    ? 'Android: Tap lock icon → Site settings → Location → Allow'
                    : 'Allow location in browser settings, then refresh.'}
              </p>
              <p className="text-xs mt-1 text-muted-foreground">You can complete delivery below without tracking.</p>
            </div>
          )}
        </div>

        {/* Gate: driver checklist locked until buyer completes final payment */}
        {verify.role === 'driver' && verify.finalPaymentPending && (
          <div className="rounded-xl border-2 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-5 sm:p-6 space-y-3">
            <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-100">Delivery checklist locked</h2>
            <p className="text-sm text-amber-800 dark:text-amber-200">
              The checklist will unlock once the buyer completes final payment on their order. The recipient has a 4-digit PIN they’ll enter to complete the handoff.
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              You can use <strong>Start live tracking</strong> above in the meantime. When the buyer has paid, refresh this page to open the checklist.
            </p>
          </div>
        )}

        {/* 3-step checklist — shown when buyer has paid (or for non-driver roles) */}
        {(!verify.role || verify.role !== 'driver' || verify.finalPaymentConfirmed) && (
        <div className="rounded-xl border bg-background shadow-sm overflow-hidden">
          <div className="px-5 sm:px-6 py-3 border-b bg-muted/30">
            <h2 className="text-sm font-semibold">Complete delivery</h2>
          </div>
          <div className="p-5 sm:p-6 space-y-5">
            {/* Step 1: PIN */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <StepDot n={1} done={pinVerified} />
                <span className="font-medium text-sm">Recipient enters PIN</span>
              </div>
              <p className="text-xs text-muted-foreground pl-12">
                Hand your phone to the recipient. They enter the 4-digit PIN from their order page.
              </p>
              {!pinVerified ? (
                <div className="pl-12 flex flex-col sm:flex-row gap-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    placeholder="0000"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="font-mono text-xl w-28 h-12 text-center"
                    aria-label="Delivery PIN"
                  />
                  <Button onClick={handleVerifyPin} disabled={pinInput.length !== 4 || pinVerifying} className="h-12 px-4">
                    {pinVerifying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
                    Verify
                  </Button>
                </div>
              ) : (
                <p className="pl-12 text-sm text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">PIN verified ✓</p>
              )}
              {pinError && (
                <p className="pl-12 text-xs text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  {pinError}
                </p>
              )}
            </div>

            {/* Step 2: Signature */}
            <div className={cn('space-y-2', !pinVerified && 'opacity-50 pointer-events-none')}>
              <div className="flex items-center gap-3">
                <StepDot n={2} done={hasSignature} />
                <span className="font-medium text-sm">Get signature <span className="text-muted-foreground font-normal">(required)</span></span>
              </div>
              <p className="text-xs text-muted-foreground pl-12">Recipient signs below to confirm delivery.</p>
              <div className="pl-12">
                <SignaturePad
                  ref={signatureRef}
                  width={360}
                  height={160}
                  onSignatureChange={setHasSignature}
                  className="w-full rounded-lg border-2 border-dashed border-muted-foreground/25 bg-muted/20"
                />
              </div>
            </div>

            {/* Step 3: Photo */}
            <div className={cn('space-y-2', !pinVerified && 'opacity-50 pointer-events-none')}>
              <div className="flex items-center gap-3">
                <StepDot n={3} done={!!photoDataUrl} />
                <span className="font-medium text-sm">Take photo <span className="text-muted-foreground font-normal">(required)</span></span>
              </div>
              <p className="text-xs text-muted-foreground pl-12">Picture of the animals or items at delivery.</p>
              <div className="pl-12 space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  aria-label="Take photo of animals at delivery"
                  onChange={handlePhotoChange}
                />
                <Button
                  variant="outline"
                  onClick={() => pinVerified && fileInputRef.current?.click()}
                  disabled={!pinVerified}
                  className="h-11 rounded-lg"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  {photoDataUrl ? 'Change photo' : 'Take photo'}
                </Button>
                {photoDataUrl && (
                  <div className="relative rounded-lg overflow-hidden border">
                    <img src={photoDataUrl} alt="Delivery" className="w-full max-h-40 object-cover" />
                    <Button
                      variant="secondary"
                      size="sm"
                      className="absolute top-1.5 right-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setPhotoDataUrl(null)}
                    >
                      Remove
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}

            <Button
              onClick={handleSubmit}
              disabled={!pinVerified || !hasSignature || !photoDataUrl || submitting}
              className="w-full h-12 rounded-lg font-semibold"
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
          </div>
        </div>
        )}
      </main>
    </div>
  );
}
