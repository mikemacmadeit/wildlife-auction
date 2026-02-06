/**
 * Premium site footer (public pages)
 * - Outdoors/ranch + modern marketplace vibe
 * - Newsletter signup wired to /api/marketing/newsletter/subscribe (Brevo)
 * - Careful marketplace/compliance language (no regulator claims)
 */

'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Mail, ArrowRight, Loader2 } from 'lucide-react';
import { BrandLogoText } from '@/components/navigation/BrandLogoText';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CreateListingGateLink } from '@/components/listings/CreateListingGate';

function currentYear() {
  return new Date().getFullYear();
}

function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function Footer() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const links = useMemo(
    () => ({
      marketplace: [
        { href: '/browse', label: 'Browse' },
        { href: '/dashboard/listings/new', label: 'Create listing' },
      ],
      howItWorks: [
        { href: '/how-it-works', label: 'Overview' },
        { href: '/how-it-works/plans', label: 'Seller Tiers' },
        { href: '/how-it-works/trust', label: 'Trust & Compliance' },
        { href: '/how-it-works/trust#badges', label: 'Seller Verification' },
        { href: '/how-it-works/trust#safety', label: 'Safety Tips' },
        { href: '/field-notes', label: 'Field Notes' },
      ],
      legal: [
        { href: '/privacy', label: 'Privacy Policy' },
        { href: '/terms', label: 'Terms of Service' },
        { href: '/legal/marketplace-policies', label: 'Marketplace Policies' },
        { href: '/legal/seller-policy', label: 'Seller Policy' },
        { href: '/legal/buyer-acknowledgment', label: 'Buyer Acknowledgment' },
      ],
      support: [{ href: '/contact', label: 'Contact' }],
    }),
    []
  );

  const onSubmit = async () => {
    setError(null);
    const trimmed = email.trim();
    if (!isEmail(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/marketing/newsletter/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: trimmed, source: 'footer' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError(data?.error || 'Could not subscribe right now. Please try again.');
        return;
      }

      // Keep popup + footer consistent
      try {
        window.localStorage.setItem('we_email_capture_subscribed', 'true');
      } catch (e) {
        if (process.env.NODE_ENV === 'development') console.warn('[Footer] localStorage setItem failed', e);
      }

      setSuccess(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <footer className="relative border-t border-border/50 bg-muted/50 dark:bg-[hsl(75_8%_10%)] text-[hsl(37_27%_15%)] dark:text-[hsl(37_27%_85%)]">
      {/* Subtle texture / glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 opacity-[0.15] dark:opacity-[0.35] [background:radial-gradient(80%_60%_at_20%_0%,hsl(90_12%_45%/.15)_0%,transparent_60%),radial-gradient(70%_60%_at_80%_10%,hsl(37_27%_50%/.08)_0%,transparent_55%)] dark:[background:radial-gradient(80%_60%_at_20%_0%,hsl(90_12%_28%/.35)_0%,transparent_60%),radial-gradient(70%_60%_at_80%_10%,hsl(37_27%_70%/.18)_0%,transparent_55%)]" />
        <div className="absolute inset-0 opacity-[0.08] dark:opacity-[0.18] [background-image:linear-gradient(to_right,hsl(37_27%_30%/.05)_1px,transparent_1px),linear-gradient(to_bottom,hsl(37_27%_30%/.05)_1px,transparent_1px)] dark:[background-image:linear-gradient(to_right,hsl(37_27%_70%/.08)_1px,transparent_1px),linear-gradient(to_bottom,hsl(37_27%_70%/.08)_1px,transparent_1px)] [background-size:42px_42px]" />
      </div>

      <div className="relative container mx-auto px-4 md:px-6 py-8 md:py-10">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-1 space-y-3">
            <Link href="/" className="inline-flex items-center gap-3 group">
              <div className="relative h-10 w-10">
                <div
                  className="h-full w-full bg-[hsl(37_27%_30%)] dark:bg-[hsl(37_27%_70%)]"
                  style={{
                    maskImage: 'url(/images/Kudu.png)',
                    maskSize: 'contain',
                    maskRepeat: 'no-repeat',
                    maskPosition: 'center',
                    WebkitMaskImage: 'url(/images/Kudu.png)',
                    WebkitMaskSize: 'contain',
                    WebkitMaskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                  }}
                />
              </div>
              <div className="leading-tight">
                <BrandLogoText className="text-lg font-extrabold tracking-tight text-[hsl(37_27%_20%)] dark:text-[hsl(37_27%_88%)]" />
                <div className="text-xs text-[hsl(37_27%_35%)] dark:text-[hsl(37_27%_78%)]">
                  Texas marketplace • built for trust
                </div>
              </div>
            </Link>

            <p className="text-sm text-[hsl(37_27%_35%)] dark:text-[hsl(37_27%_78%)] max-w-xs">
              Texas marketplace for whitetail breeders, registered livestock, and cattle—built for trust and compliance.
            </p>

            <div className="flex flex-wrap gap-1.5">
              <Badge
                variant="secondary"
                className="text-[10px] px-2 py-0 bg-black/5 dark:bg-white/10 text-[hsl(37_27%_20%)] dark:text-[hsl(37_27%_88%)] border border-black/10 dark:border-white/10"
              >
                Texas-only
              </Badge>
              <Badge
                variant="secondary"
                className="text-[10px] px-2 py-0 bg-black/5 dark:bg-white/10 text-[hsl(37_27%_20%)] dark:text-[hsl(37_27%_88%)] border border-black/10 dark:border-white/10"
              >
                Pre-listing verification
              </Badge>
            </div>
          </div>

          {/* Marketplace */}
          <div className="space-y-2">
            <div className="text-sm font-semibold text-[hsl(37_27%_20%)] dark:text-[hsl(37_27%_88%)]">Marketplace</div>
            <ul className="space-y-1.5 text-sm">
              {links.marketplace.map((l) =>
                l.href === '/dashboard/listings/new' ? (
                  <li key={l.href}>
                    <CreateListingGateLink
                      href={l.href}
                      className="text-[hsl(37_27%_35%)] dark:text-[hsl(37_27%_78%)] hover:text-[hsl(37_27%_15%)] dark:hover:text-[hsl(37_27%_92%)] transition-colors underline-offset-4 hover:underline"
                    >
                      {l.label}
                    </CreateListingGateLink>
                  </li>
                ) : (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-[hsl(37_27%_35%)] dark:text-[hsl(37_27%_78%)] hover:text-[hsl(37_27%_15%)] dark:hover:text-[hsl(37_27%_92%)] transition-colors underline-offset-4 hover:underline"
                    >
                      {l.label}
                    </Link>
                  </li>
                )
              )}
            </ul>
          </div>

          {/* How It Works + Trust */}
          <div className="space-y-2">
            <div className="text-sm font-semibold text-[hsl(37_27%_20%)] dark:text-[hsl(37_27%_88%)]">How It Works</div>
            <ul className="space-y-1.5 text-sm">
              {links.howItWorks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-[hsl(37_27%_35%)] dark:text-[hsl(37_27%_78%)] hover:text-[hsl(37_27%_15%)] dark:hover:text-[hsl(37_27%_92%)] transition-colors underline-offset-4 hover:underline"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal + Support */}
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-[hsl(37_27%_20%)] dark:text-[hsl(37_27%_88%)]">Legal</div>
              <ul className="space-y-1.5 text-sm">
                {links.legal.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-[hsl(37_27%_35%)] dark:text-[hsl(37_27%_78%)] hover:text-[hsl(37_27%_15%)] dark:hover:text-[hsl(37_27%_92%)] transition-colors underline-offset-4 hover:underline"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold text-[hsl(37_27%_20%)] dark:text-[hsl(37_27%_88%)]">Support</div>
              <ul className="space-y-1.5 text-sm">
                {links.support.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-[hsl(37_27%_35%)] dark:text-[hsl(37_27%_78%)] hover:text-[hsl(37_27%_15%)] dark:hover:text-[hsl(37_27%_92%)] transition-colors underline-offset-4 hover:underline"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Newsletter */}
          <div className="col-span-2 sm:col-span-3 lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-[hsl(37_27%_20%)] dark:text-[hsl(37_27%_88%)]">Newsletter</div>
              <Mail className="h-4 w-4 text-[hsl(37_27%_35%)] dark:text-[hsl(37_27%_78%)]" />
            </div>

            <p className="text-sm text-[hsl(37_27%_35%)] dark:text-[hsl(37_27%_78%)]">
              Get weekly drops, ranch inventory, and market insights—Texas-only.
            </p>

            {success ? (
              <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 p-4">
                <div className="text-sm font-semibold text-[hsl(37_27%_15%)] dark:text-[hsl(37_27%_92%)]">You're in.</div>
                <div className="text-sm text-[hsl(37_27%_35%)] dark:text-[hsl(37_27%_78%)]">Check your inbox soon.</div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError(null);
                    }}
                    placeholder="you@example.com"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    className="min-h-[44px] bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-[hsl(37_27%_15%)] dark:text-[hsl(37_27%_90%)] placeholder:text-[hsl(37_27%_50%)] dark:placeholder:text-[hsl(37_27%_70%)]"
                  />
                  <Button
                    onClick={onSubmit}
                    disabled={loading}
                    className="min-h-[44px] sm:min-w-[120px] font-semibold bg-[hsl(90_12%_45%)] dark:bg-[hsl(90_12%_35%)] hover:bg-[hsl(90_12%_50%)] dark:hover:bg-[hsl(90_12%_40%)] text-white"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Joining
                      </>
                    ) : (
                      <>
                        Join
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
                {error && <p className="text-xs text-red-600 dark:text-red-200">{error}</p>}
                <p className="text-[11px] leading-relaxed text-[hsl(37_27%_45%)] dark:text-[hsl(37_27%_70%)]">
                  By subscribing, you agree to receive emails from Agchange. Unsubscribe anytime.{' '}
                  <Link href="/privacy" className="underline underline-offset-2 hover:text-[hsl(37_27%_15%)] dark:hover:text-[hsl(37_27%_92%)]">
                    Privacy
                  </Link>
                  .
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 pt-5 border-t border-black/10 dark:border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-center sm:text-left">
          <div className="text-xs text-[hsl(37_27%_45%)] dark:text-[hsl(37_27%_70%)]">
            © {currentYear()} Agchange. All rights reserved.
          </div>
          <div className="text-xs text-[hsl(37_27%_45%)] dark:text-[hsl(37_27%_70%)]">
            Texas-only animal listings (equipment may be multi-state).
          </div>
        </div>
      </div>
    </footer>
  );
}
