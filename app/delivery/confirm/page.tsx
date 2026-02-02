'use client';

/**
 * Public buyer signature page. No auth required.
 * URL: /delivery/confirm?token=...
 * Shows signature pad, Clear, Submit.
 */

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { BrandLogoText } from '@/components/navigation/BrandLogoText';
import { SignaturePad, type SignaturePadRef } from '@/components/delivery/SignaturePad';

interface VerifyResult {
  valid: boolean;
  role?: string;
  orderShortId?: string;
  listingTitle?: string;
  error?: string;
  alreadyDelivered?: boolean;
  expired?: boolean;
}

export default function DeliveryConfirmPage() {
  const searchParams = useSearchParams();
  const token = (searchParams?.get('token') ?? '') || '';

  const [loading, setLoading] = useState(true);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signatureRef = useRef<SignaturePadRef>(null);

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

  const handleSubmit = async () => {
    if (!token || !hasSignature) return;
    const base64 = signatureRef.current?.getPngBase64();
    if (!base64) {
      setError('Please sign before submitting.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/delivery/submit-signature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, signaturePngBase64: base64 }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || data.message || 'Submission failed');
        return;
      }

      setSuccess(true);
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

  if (verify.role !== 'buyer') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-muted/30">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <p className="text-muted-foreground">This link is for the buyer to confirm delivery.</p>
            <Button asChild variant="outline" className="w-full mt-4">
              <Link href="/">Go to homepage</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-muted/30">
        <header className="absolute top-4 left-4">
          <Link href="/">
            <BrandLogoText className="text-xl" />
          </Link>
        </header>
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 pb-6 text-center">
            <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Delivery confirmed</h2>
            <p className="text-muted-foreground">Thank you! The seller has been notified.</p>
            <Button asChild variant="outline" className="w-full mt-6">
              <Link href="/">Go to homepage</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="border-b bg-background px-4 py-3">
        <Link href="/">
          <BrandLogoText className="text-xl" />
        </Link>
      </header>

      <main className="flex-1 p-4 max-w-lg mx-auto w-full flex flex-col">
        <div className="mb-4">
          <h1 className="text-lg font-semibold">Confirm delivery</h1>
          <p className="text-sm text-muted-foreground">
            Order {verify.orderShortId || ''} · {verify.listingTitle || 'Order'}
          </p>
        </div>

        <Card className="flex-1 flex flex-col min-h-0">
          <CardHeader>
            <CardTitle className="text-base">Sign to confirm receipt</CardTitle>
            <p className="text-sm text-muted-foreground">
              Use your finger to sign below. This confirms you received the delivery.
            </p>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col min-h-0 space-y-4">
            <div className="flex-1 min-h-[200px]">
              <SignaturePad
                ref={signatureRef}
                width={340}
                height={180}
                onSignatureChange={setHasSignature}
                className="h-full"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <Button
                onClick={handleSubmit}
                disabled={!hasSignature || submitting}
                className="flex-1 min-h-[48px]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
