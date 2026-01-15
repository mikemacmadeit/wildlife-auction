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
        { href: '/dashboard/listings/new', label: 'List an Animal' },
        { href: '/how-it-works', label: 'How It Works' },
        { href: '/pricing', label: 'Exposure Plans' },
      ],
      trust: [
        { href: '/trust', label: 'Trust & Compliance' },
        { href: '/trust#badges', label: 'Seller Verification' },
        { href: '/trust#safety', label: 'Safety Tips' },
      ],
      legal: [
        { href: '/privacy', label: 'Privacy Policy' },
        { href: '/terms', label: 'Terms of Service' },
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
      } catch {}

      setSuccess(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <footer className="relative border-t border-border/50 bg-[hsl(75_8%_10%)] text-[hsl(37_27%_85%)]">
      {/* Subtle texture / glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 opacity-[0.35] [background:radial-gradient(80%_60%_at_20%_0%,hsl(90_12%_28%/.35)_0%,transparent_60%),radial-gradient(70%_60%_at_80%_10%,hsl(37_27%_70%/.18)_0%,transparent_55%)]" />
        <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(to_right,hsl(37_27%_70%/.08)_1px,transparent_1px),linear-gradient(to_bottom,hsl(37_27%_70%/.08)_1px,transparent_1px)] [background-size:42px_42px]" />
      </div>

      <div className="relative container mx-auto px-4 md:px-6 py-12">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1.3fr]">
          {/* Brand */}
          <div className="space-y-4">
            <Link href="/" className="inline-flex items-center gap-3 group">
              <div className="relative h-10 w-10">
                <div
                  className="h-full w-full bg-[hsl(37_27%_70%)]"
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
                <div className="text-lg font-extrabold tracking-tight text-[hsl(37_27%_88%)]">
                  Wildlife Exchange
                </div>
                <div className="text-xs text-[hsl(37_27%_78%)]">
                  Texas marketplace • built for trust
                </div>
              </div>
            </Link>

            <p className="text-sm text-[hsl(37_27%_78%)] max-w-sm">
              Texas marketplace for whitetail breeders, exotics, and cattle—built for trust and compliance.
            </p>

            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className="bg-white/10 text-[hsl(37_27%_88%)] border border-white/10"
              >
                Texas-only animals
              </Badge>
              <Badge
                variant="secondary"
                className="bg-white/10 text-[hsl(37_27%_88%)] border border-white/10"
              >
                Escrow + payout gating
              </Badge>
            </div>
          </div>

          {/* Marketplace */}
          <div className="space-y-3">
            <div className="text-sm font-semibold text-[hsl(37_27%_88%)]">Marketplace</div>
            <ul className="space-y-2 text-sm">
              {links.marketplace.map((l) =>
                l.href === '/dashboard/listings/new' ? (
                  <li key={l.href}>
                    <CreateListingGateLink
                      href={l.href}
                      className="text-[hsl(37_27%_78%)] hover:text-[hsl(37_27%_92%)] transition-colors underline-offset-4 hover:underline"
                    >
                      {l.label}
                    </CreateListingGateLink>
                  </li>
                ) : (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-[hsl(37_27%_78%)] hover:text-[hsl(37_27%_92%)] transition-colors underline-offset-4 hover:underline"
                    >
                      {l.label}
                    </Link>
                  </li>
                )
              )}
            </ul>
          </div>

          {/* Trust */}
          <div className="space-y-3">
            <div className="text-sm font-semibold text-[hsl(37_27%_88%)]">Trust</div>
            <ul className="space-y-2 text-sm">
              {links.trust.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-[hsl(37_27%_78%)] hover:text-[hsl(37_27%_92%)] transition-colors underline-offset-4 hover:underline"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal + Support */}
          <div className="space-y-6">
            <div className="space-y-3">
              <div className="text-sm font-semibold text-[hsl(37_27%_88%)]">Legal</div>
              <ul className="space-y-2 text-sm">
                {links.legal.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-[hsl(37_27%_78%)] hover:text-[hsl(37_27%_92%)] transition-colors underline-offset-4 hover:underline"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-3">
              <div className="text-sm font-semibold text-[hsl(37_27%_88%)]">Support</div>
              <ul className="space-y-2 text-sm">
                {links.support.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-[hsl(37_27%_78%)] hover:text-[hsl(37_27%_92%)] transition-colors underline-offset-4 hover:underline"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Newsletter */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] overflow-hidden">
              {/* Header band */}
              <div className="relative px-4 sm:px-5 pt-4 sm:pt-5 pb-4 border-b border-white/10 bg-[radial-gradient(90%_120%_at_0%_0%,hsl(90_12%_35%/.18)_0%,transparent_55%),radial-gradient(90%_120%_at_100%_0%,hsl(37_27%_70%/.14)_0%,transparent_55%)]">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <Mail className="h-5 w-5 text-[hsl(37_27%_88%)]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-base font-extrabold tracking-tight text-[hsl(37_27%_92%)] leading-tight">
                      Get listings before they hit the feed
                    </div>
                    <div className="mt-1 text-sm text-[hsl(37_27%_78%)] leading-relaxed">
                      Weekly drops, new ranch inventory, and market insights. <span className="font-semibold">Texas-only.</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="px-4 sm:px-5 py-4 sm:py-5 space-y-3">
                {success ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm font-semibold text-[hsl(37_27%_92%)]">You’re in.</div>
                    <div className="text-sm text-[hsl(37_27%_78%)]">Check your inbox soon.</div>
                  </div>
                ) : (
                  <>
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
                          className="min-h-[48px] bg-white/5 border-white/10 text-[hsl(37_27%_92%)] placeholder:text-[hsl(37_27%_70%)]"
                        />
                        <Button
                          onClick={onSubmit}
                          disabled={loading}
                          className="min-h-[48px] sm:min-w-[132px] font-semibold bg-[hsl(90_12%_35%)] hover:bg-[hsl(90_12%_40%)] text-white"
                        >
                          {loading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Subscribing…
                            </>
                          ) : (
                            <>
                              Subscribe
                              <ArrowRight className="h-4 w-4 ml-2" />
                            </>
                          )}
                        </Button>
                      </div>
                      {error && <p className="text-xs text-red-200">{error}</p>}
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <p className="text-xs leading-relaxed text-[hsl(37_27%_78%)]">
                        No spam. Just the best auctions, breeder inventory, and ranch deals—delivered weekly.
                      </p>
                    </div>

                    <p className="text-[11px] leading-relaxed text-[hsl(37_27%_70%)]">
                      By subscribing, you agree to receive emails from Wildlife Exchange. Unsubscribe anytime.{' '}
                      <Link href="/privacy" className="underline underline-offset-2 hover:text-[hsl(37_27%_92%)]">
                        Privacy
                      </Link>{' '}
                      ·{' '}
                      <Link href="/trust" className="underline underline-offset-2 hover:text-[hsl(37_27%_92%)]">
                        Trust &amp; Compliance
                      </Link>
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="text-xs text-[hsl(37_27%_70%)]">
            © {currentYear()} Wildlife Exchange. All rights reserved.
          </div>
          <div className="text-xs text-[hsl(37_27%_70%)]">
            Texas-only for animal transactions. Equipment may be multi-state.
          </div>
        </div>
      </div>
    </footer>
  );
}

