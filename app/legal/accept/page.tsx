'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Gavel, Shield, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { LEGAL_VERSIONS } from '@/lib/legal/versions';
import { getIdToken } from '@/lib/firebase/auth-helper';
import { getUserProfile } from '@/lib/firebase/users';
import { LegalDocsModal } from '@/components/legal/LegalDocsModal';

export default function LegalAcceptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();

  const nextUrl = useMemo(() => {
    const raw = searchParams?.get('next');
    if (!raw) return '/dashboard';
    if (!raw.startsWith('/')) return '/dashboard';
    return raw;
  }, [searchParams]);

  const [agreedInModal, setAgreedInModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);
  const [docsInitialTab, setDocsInitialTab] = useState<'tos' | 'marketplacePolicies' | 'sellerPolicy' | 'buyerAcknowledgment'>('tos');

  const openDocs = (tab: typeof docsInitialTab) => {
    setDocsInitialTab(tab);
    setDocsOpen(true);
  };

  // If already accepted, don’t block.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!user) return;
      const p = await getUserProfile(user.uid).catch(() => null);
      if (!p) return;
      const v = LEGAL_VERSIONS.tos.version;
      const accepted = p.legal?.tos?.version === v;
      if (accepted && !cancelled) router.replace(nextUrl);
    }
    if (!loading) void check();
    return () => {
      cancelled = true;
    };
  }, [loading, nextUrl, router, user]);

  const onAccept = async (opts?: { skipAgreedCheck?: boolean }) => {
    if (!user) return;
    setError(null);
    if (!opts?.skipAgreedCheck && !agreedInModal) {
      openDocs('tos');
      setError('Please read and agree to the Terms in the modal to continue.');
      return;
    }
    setSubmitting(true);
    try {
      const token = await getIdToken(user, true);
      const res = await fetch('/api/legal/accept', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          docs: ['tos', 'marketplacePolicies', 'buyerAcknowledgment', 'sellerPolicy'],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || data?.error || 'Failed to record acceptance');
      }
      router.replace(nextUrl);
    } catch (e: any) {
      setError(e?.message || 'Failed to record acceptance. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-10 max-w-2xl space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sign in required</CardTitle>
              <CardDescription>You must be signed in to accept the Terms.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="font-semibold">
                <Link href={`/login?next=${encodeURIComponent(`/legal/accept?next=${encodeURIComponent(nextUrl)}`)}`}>
                  Sign in
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-10 max-w-3xl space-y-6">
        <LegalDocsModal
          open={docsOpen}
          onOpenChange={setDocsOpen}
          initialTab={docsInitialTab}
          agreeAction={{
            onConfirm: () => {
              setAgreedInModal(true);
              setDocsOpen(false);
              setError(null);
            },
            buttonText: 'I Agree',
          }}
        />

        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center">
            <Gavel className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="text-2xl font-extrabold tracking-tight">Accept updated terms</div>
            <div className="text-sm text-muted-foreground">
              Effective {LEGAL_VERSIONS.tos.effectiveDateLabel} (version {LEGAL_VERSIONS.tos.version})
            </div>
          </div>
        </div>

        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Agchange is a marketplace platform only. The legal docs below explain that buyer/seller contract directly and
            that live animal transactions carry inherent risk.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Review these documents</CardTitle>
            <CardDescription>You must accept to continue using the marketplace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-4 space-y-2">
              <div className="text-sm font-semibold">Read and agree (no page changes)</div>
              <div className="text-sm text-foreground">
                Open the full Terms and policies in a scrollable modal. Agree inside the modal, then come right back here to continue.
              </div>
              <Button type="button" variant="outline" className="font-semibold" onClick={() => openDocs('tos')}>
                Read terms & policies
              </Button>
              <div className="text-xs text-muted-foreground">
                Optional links (not required):{' '}
                <button type="button" className="underline underline-offset-4" onClick={() => openDocs('tos')}>
                  Terms
                </button>
                ,{' '}
                <button type="button" className="underline underline-offset-4" onClick={() => openDocs('marketplacePolicies')}>
                  Marketplace
                </button>
                ,{' '}
                <button type="button" className="underline underline-offset-4" onClick={() => openDocs('sellerPolicy')}>
                  Seller
                </button>
                ,{' '}
                <button type="button" className="underline underline-offset-4" onClick={() => openDocs('buyerAcknowledgment')}>
                  Buyer
                </button>
                .
              </div>
            </div>

            <div className="rounded-xl border p-4 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-sm">
                <span className="font-semibold">Status:</span>{' '}
                <span className={agreedInModal ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-muted-foreground'}>
                  {agreedInModal ? 'Agreed' : 'Not agreed yet'}
                </span>
              </div>
              {!agreedInModal ? (
                <Button type="button" className="font-semibold" onClick={() => openDocs('tos')}>
                  Review & agree
                </Button>
              ) : null}
            </div>

            {error ? <div className="text-sm text-destructive">{error}</div> : null}

            <div className="flex items-center gap-3">
              <Button onClick={() => onAccept()} disabled={submitting || !agreedInModal} className="font-semibold">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Accept & Continue'
                )}
              </Button>
              <Button variant="outline" asChild>
                <Link href="/browse">Cancel</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

