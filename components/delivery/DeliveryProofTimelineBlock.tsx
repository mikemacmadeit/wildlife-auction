'use client';

/**
 * Shows signature and delivery photo in the order timeline when recipient signed via QR.
 * Used in both buyer and seller order detail pages.
 */

import { PenLine, Camera, ExternalLink } from 'lucide-react';

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
        <span className="text-muted-foreground"> at {signedAt.toLocaleDateString()} {signedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      {hasProof && (
        <div className="mt-2 flex flex-wrap gap-3">
          {signatureUrl && (
            <a
              href={signatureUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <PenLine className="h-3.5 w-3.5" />
              View signature
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {deliveryPhotoUrl && (
            <a
              href={deliveryPhotoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <Camera className="h-3.5 w-3.5" />
              View delivery photo
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
