import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mail, Shield, ArrowRight } from 'lucide-react';
import { ContactForm } from '@/components/support/ContactForm';
import { BRAND_DISPLAY_NAME, SUPPORT_EMAIL } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Contact | Agchange',
  description: 'Contact Agchange support for help with listings, transactions, or compliance workflow questions.',
};

export default function ContactPage() {
  return (
    <div className="container mx-auto px-4 py-10 max-w-4xl">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-4">
          <Mail className="h-7 w-7 text-primary" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Contact</h1>
        <p className="text-muted-foreground mt-3">
          Questions about a listing, a transaction, or our compliance workflow? We can help.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <ContactForm />
        <Card>
          <CardHeader>
            <CardTitle>Email Support</CardTitle>
            <CardDescription>We typically respond within 1–2 business days.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="text-sm text-muted-foreground">Support email</div>
              <div className="text-lg font-semibold">{SUPPORT_EMAIL}</div>
            </div>
            <Button asChild className="w-full min-h-[48px]">
              <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(BRAND_DISPLAY_NAME + ' Support')}`}>
                Email support <ArrowRight className="h-4 w-4 ml-2" />
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trust & Compliance</CardTitle>
            <CardDescription>How verification and Texas-only rules work.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-4">
              <div className="mt-0.5 h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div className="text-sm text-muted-foreground">
                If you’re asking about whitetail breeder permit review or order transfer documents, start here.
              </div>
            </div>
            <Button asChild variant="outline" className="w-full min-h-[48px]">
              <Link href="/trust">
                View Trust &amp; Compliance <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 text-sm text-muted-foreground">
        Prefer to read our policies? See{' '}
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy
        </Link>{' '}
        and{' '}
        <Link href="/terms" className="underline underline-offset-4">
          Terms
        </Link>
        .
      </div>
    </div>
  );
}

