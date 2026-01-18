'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';

export function CreateListingGateLink(props: {
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { href = '/dashboard/listings/new', className, children } = props;
  const router = useRouter();
  const { user } = useAuth();

  const checkAndMaybeNavigate = useCallback(async () => {
    if (!user) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('redirectAfterLogin', href);
      }
      router.push('/login');
      return;
    }
    // Seller Tiers model: Standard sellers are never blocked from listing.
    router.push(href);
  }, [href, router, user]);

  return (
    <>
      <Link
        href={href}
        className={className}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          checkAndMaybeNavigate();
        }}
      >
        {children}
      </Link>
    </>
  );
}

export function CreateListingGateButton(props: {
  href?: string;
  className?: string;
  children: React.ReactNode;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}) {
  const { href = '/dashboard/listings/new', className, children, variant = 'default', size = 'default' } = props;
  return (
    <Button variant={variant} size={size} className={className} asChild>
      <CreateListingGateLink href={href}>{children}</CreateListingGateLink>
    </Button>
  );
}

