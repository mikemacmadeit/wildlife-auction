'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Apple, Landmark, Banknote, Link2 } from 'lucide-react';

function Chip(props: { children: ReactNode; className?: string; title?: string }) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-[11px] leading-none',
        'text-muted-foreground',
        props.className
      )}
      title={props.title}
    >
      {props.children}
    </div>
  );
}

export function VisaBadge() {
  return (
    <Chip className="text-foreground" title="Visa">
      <span className="font-extrabold tracking-tight" style={{ color: '#1A1F71' }}>
        VISA
      </span>
    </Chip>
  );
}

export function MastercardBadge() {
  return (
    <Chip className="text-foreground" title="Mastercard">
      <span className="relative inline-flex h-3.5 w-6">
        <span className="absolute left-0 top-0 h-3.5 w-3.5 rounded-full" style={{ backgroundColor: '#EB001B' }} />
        <span className="absolute left-2.5 top-0 h-3.5 w-3.5 rounded-full" style={{ backgroundColor: '#F79E1B' }} />
      </span>
      <span className="font-semibold">mastercard</span>
    </Chip>
  );
}

export function AmexBadge() {
  return (
    <Chip className="text-foreground" title="American Express">
      <span
        className="rounded-[3px] px-1 py-0.5 font-extrabold tracking-tight text-white"
        style={{ backgroundColor: '#2E77BC' }}
      >
        AMEX
      </span>
    </Chip>
  );
}

export function ApplePayBadge() {
  return (
    <Chip className="text-foreground" title="Apple Pay">
      <Apple className="h-3.5 w-3.5 text-foreground" />
      <span className="font-semibold">Pay</span>
    </Chip>
  );
}

export function GooglePayBadge() {
  // Simple Google "G" mark (4-color) as inline SVG for crisp rendering.
  return (
    <Chip className="text-foreground" title="Google Pay">
      <svg viewBox="0 0 256 262" className="h-3.5 w-3.5" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M255.7 133.5c0-9.2-.8-18-2.3-26.5H130.5v50.2h70.2c-3 16-12 29.6-25.6 38.8v32.2h41.4c24.2-22.3 39.2-55.2 39.2-94.7z"
        />
        <path
          fill="#34A853"
          d="M130.5 261.1c34.6 0 63.6-11.4 84.8-31l-41.4-32.2c-11.5 7.7-26.3 12.2-43.4 12.2-33.4 0-61.7-22.5-71.8-52.8H15.9v33.2c21 41.6 64.1 70.6 114.6 70.6z"
        />
        <path
          fill="#FBBC05"
          d="M58.7 157.3c-2.6-7.7-4.1-15.9-4.1-24.3s1.5-16.6 4.1-24.3V75.5H15.9C6 95.1.4 117.2.4 133c0 15.8 5.6 37.9 15.5 57.5l42.8-33.2z"
        />
        <path
          fill="#EA4335"
          d="M130.5 52c18.8 0 35.7 6.5 49 19.2l36.7-36.7C194.1 13.2 165.1 0 130.5 0 80 0 36.9 29 15.9 75.5l42.8 33.2C68.8 74.5 97.1 52 130.5 52z"
        />
      </svg>
      <span className="font-semibold">Pay</span>
    </Chip>
  );
}

export function LinkBadge() {
  return (
    <Chip className="text-foreground" title="Link (Stripe)">
      <span
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[4px] text-white"
        style={{ backgroundColor: '#635BFF' }}
      >
        <Link2 className="h-3 w-3" />
      </span>
      <span className="font-semibold" style={{ color: '#635BFF' }}>
        Link
      </span>
    </Chip>
  );
}

export function AchBadge(props: { disabled?: boolean; title?: string }) {
  return (
    <Chip className={cn(props.disabled && 'opacity-60')} title={props.title || 'Bank (ACH)'}>
      <Landmark className="h-3.5 w-3.5" />
      <span className="font-semibold">Bank (ACH)</span>
    </Chip>
  );
}

export function WireBadge(props: { disabled?: boolean; title?: string }) {
  return (
    <Chip className={cn(props.disabled && 'opacity-60')} title={props.title || 'Wire transfer'}>
      <Banknote className="h-3.5 w-3.5" />
      <span className="font-semibold">Wire</span>
    </Chip>
  );
}

