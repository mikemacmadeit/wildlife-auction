'use client';

/**
 * Seller: Modal with the delivery checklist (same as driver page).
 * Use it when delivering, or copy the link to send to a transporter.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

  useEffect(() => {
    if (!open || !orderId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
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
  }, [open, orderId, getAuthToken, onError]);

  const handleCopy = () => {
    if (driverLink) {
      navigator.clipboard.writeText(driverLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-2xl w-[calc(100%-2rem)] max-h-[90vh] flex flex-col p-0 overflow-hidden"
          overlayClassName="bg-black/80"
        >
          <DialogHeader className="px-4 pt-4 pb-2 shrink-0 border-b">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <DialogTitle className="text-base">Delivery checklist</DialogTitle>
              {driverLink && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 mr-2 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4 mr-2" />
                  )}
                  {copied ? 'Copied' : 'Copy link to send to transporter'}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Use this checklist at handoff, or send the link to your driver.
            </p>
          </DialogHeader>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {loading && (
              <div className="flex-1 flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            {error && (
              <div className="p-4 text-sm text-destructive">{error}</div>
            )}
            {driverLink && !loading && (
              <iframe
                src={driverLink}
                title="Delivery checklist"
                className="w-full flex-1 min-h-[480px] border-0 rounded-b-lg"
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                allow="geolocation"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
  );
}
