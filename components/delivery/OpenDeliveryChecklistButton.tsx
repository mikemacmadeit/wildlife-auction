'use client';

/**
 * Seller: Opens the delivery checklist page (same as driver page) in a new tab.
 * Used when seller is delivering themselves - they need the same PIN/signature/photo flow.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ClipboardList, Loader2 } from 'lucide-react';

interface OpenDeliveryChecklistButtonProps {
  orderId: string;
  getAuthToken: () => Promise<string>;
  onError?: (msg: string) => void;
  variant?: 'default' | 'outline';
  className?: string;
}

export function OpenDeliveryChecklistButton({
  orderId,
  getAuthToken,
  onError,
  variant = 'default',
  className,
}: OpenDeliveryChecklistButtonProps) {
  const [driverLink, setDriverLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await getAuthToken();
        const res = await fetch('/api/delivery/create-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ orderId }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.driverLink) {
          setDriverLink(data.driverLink);
        } else {
          setError(data.error || 'Failed to load');
          onError?.(data.error || 'Failed to load delivery checklist');
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed');
          onError?.(e?.message || 'Failed to load');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, onError]);

  const handleOpen = () => {
    if (driverLink) window.open(driverLink, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <Button variant={variant} size="sm" disabled className={className}>
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Loading checklist…
      </Button>
    );
  }

  if (error || !driverLink) {
    return null;
  }

  return (
    <Button
      variant={variant}
      size="sm"
      onClick={handleOpen}
      className={className}
    >
      <ClipboardList className="h-4 w-4 mr-2" />
      Open delivery checklist
    </Button>
  );
}
