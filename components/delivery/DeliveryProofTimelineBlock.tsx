'use client';

/**
 * Shows signature and delivery photo in the order timeline when recipient signed via QR.
 * Used in both buyer and seller order detail pages.
 * Clickable thumbnails open full image in new tab.
 */

import { PenLine, Camera } from 'lucide-react';

interface DeliveryProofTimelineBlockProps {
  signedLabel: string;
  signedAt: Date;
  signatureUrl?: string | null;
  deliveryPhotoUrl?: string | null;
}

export function DeliveryProofTimelineBlock({
  signedLabel,
  signedAt,
  signatureUrl,
  deliveryPhotoUrl,
}: DeliveryProofTimelineBlockProps) {
  const hasProof = signatureUrl || deliveryPhotoUrl;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm">
      <div>
        <span className="font-medium text-primary">{signedLabel}</span>
        <span className="text-muted-foreground"> {signedAt.toLocaleDateString()} {signedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      {hasProof && (
        <div className="mt-3 flex flex-wrap gap-4">
          {signatureUrl && (
            <a
              href={signatureUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-start gap-1"
            >
              <div className="rounded border border-border/60 bg-white overflow-hidden ring-1 ring-transparent group-hover:ring-primary/30 transition-shadow">
                <img src={signatureUrl} alt="Signature" className="h-20 w-24 object-contain" />
              </div>
              <span className="text-xs text-primary flex items-center gap-1">
                <PenLine className="h-3 w-3" />
                View signature
              </span>
            </a>
          )}
          {deliveryPhotoUrl && (
            <a
              href={deliveryPhotoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-start gap-1"
            >
              <div className="rounded border border-border/60 bg-white overflow-hidden ring-1 ring-transparent group-hover:ring-primary/30 transition-shadow">
                <img src={deliveryPhotoUrl} alt="Delivery photo" className="h-20 w-24 object-cover" />
              </div>
              <span className="text-xs text-primary flex items-center gap-1">
                <Camera className="h-3 w-3" />
                View delivery photo
              </span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}
