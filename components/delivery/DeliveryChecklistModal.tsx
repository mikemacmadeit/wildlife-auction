'use client';

/**
 * Seller: Modal with the delivery checklist (same as driver page).
 * Use it when delivering, or copy the link to send to a transporter.
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Copy, Check } from 'lucide-react';

interface DeliveryChecklistModalProps {
  orderId: string;
  getAuthToken: () => Promise<string>;
  onError?: (msg: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeliveryChecklistModal({
  orderId,
  getAuthToken,
  onError,
  open,
  onOpenChange,
}: DeliveryChecklistModalProps) {
  const [driverLink, setDriverLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fetchedForRef = useRef<string | null>(null);

  // Keep callback refs so effect only runs when open/orderId change (one fetch per open).
  const getAuthTokenRef = useRef(getAuthToken);
  const onErrorRef = useRef(onError);
  getAuthTokenRef.current = getAuthToken;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!open || !orderId) return;
    const key = `${orderId}`;
    if (fetchedForRef.current === key) return; // already fetched for this open
    fetchedForRef.current = key;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const token = await getAuthTokenRef.current();
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
          const msg =
            res.status === 429
              ? 'Please wait a moment and try again.'
              : (data.error || 'Failed to load');
          setError(msg);
          onErrorRef.current?.(msg);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || 'Failed');
          onErrorRef.current?.(e?.message || 'Failed to load');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  // Reset so reopening the modal (or opening for another order) fetches again
  useEffect(() => {
    if (!open) {
      fetchedForRef.current = null;
      setDriverLink(null);
      setError(null);
    }
  }, [open]);

  const handleCopy = () => {
    if (driverLink) {
      navigator.clipboard.writeText(driverLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const embedDriverLink = driverLink
    ? driverLink + (driverLink.includes('?') ? '&embed=1' : '?embed=1')
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-2xl w-[calc(100%-2rem)] h-[95vh] max-h-[95vh] flex flex-col p-0 overflow-hidden"
          overlayClassName="bg-black/80"
        >
          <DialogDescription className="sr-only">
            Delivery checklist: PIN, signature, and photo steps for completing delivery.
          </DialogDescription>
          <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-b">
            <span className="text-sm font-medium">Delivery checklist</span>
            {driverLink && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-8 text-xs shrink-0"
              >
                {copied ? <Check className="h-3.5 w-3.5 mr-1.5 text-green-600" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                {copied ? 'Copied' : 'Copy link'}
              </Button>
            )}
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {loading && (
              <div className="flex-1 flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            {error && (
              <div className="p-4 text-sm text-destructive">{error}</div>
            )}
            {embedDriverLink && !loading && (
              <iframe
                src={embedDriverLink}
                title="Delivery checklist"
                className="w-full flex-1 min-h-[600px] border-0"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                allow="geolocation"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
  );
}
