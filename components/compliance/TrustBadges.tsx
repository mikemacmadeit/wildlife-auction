/**
 * Trust Badges Component
 * 
 * Displays compliance and verification badges for listings (read-only)
 */

'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, HelpCircle } from 'lucide-react';
import { Listing, ComplianceStatus } from '@/lib/types';
import { getDocuments } from '@/lib/firebase/documents';
import { useEffect, useState } from 'react';
import { getPermitExpirationStatus } from '@/lib/compliance/validation';
import { formatDate } from '@/lib/utils';
import { isAnimalCategory, isTexasOnlyCategory } from '@/lib/compliance/requirements';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TrustBadgesProps {
  listing: Listing;
  className?: string;
  variant?: 'inline' | 'card';
}

export function ComplianceBadges({ listing, className, variant = 'inline' }: TrustBadgesProps) {
  const [hasVerifiedPermit, setHasVerifiedPermit] = useState(false);
  const [loading, setLoading] = useState(true);

  const expirationRaw =
    listing.category === 'whitetail_breeder' ? (listing.attributes as any)?.tpwdPermitExpirationDate : null;
  const expirationDate: Date | null =
    (expirationRaw as any)?.toDate?.() ||
    (expirationRaw instanceof Date ? expirationRaw : null);
  const expStatus = getPermitExpirationStatus(expirationDate);

  useEffect(() => {
    const checkDocuments = async () => {
      if (listing.category === 'whitetail_breeder') {
        try {
          const docs = await getDocuments('listing', listing.id, 'TPWD_BREEDER_PERMIT');
          setHasVerifiedPermit(docs.some(doc => doc.status === 'verified'));
        } catch (error) {
          console.error('Error checking documents:', error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    checkDocuments();
  }, [listing.id, listing.category]);

  if (!isAnimalCategory(listing.category as any)) {
    return null; // Only show for animal listings
  }

  const getComplianceBadge = () => {
    if (!listing.complianceStatus || listing.complianceStatus === 'none') {
      return null;
    }

    switch (listing.complianceStatus) {
      case 'approved':
        return <Badge className="bg-emerald-600 text-white border-emerald-700/30">Marketplace Review Approved</Badge>;
      case 'pending_review':
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Pending Review
          </Badge>
        );
      case 'rejected':
        return <Badge variant="destructive">Compliance Rejected</Badge>;
      default:
        return null;
    }
  };

  const content = (
    <div className={className}>
      <div className="space-y-3">
        {/* Compliance Status */}
        {getComplianceBadge() ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Compliance:</span>
            {getComplianceBadge()}
          </div>
        ) : null}

        {/* TPWD Breeder Permit (whitetail only) */}
        {listing.category === 'whitetail_breeder' ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">TPWD permit:</span>
            {loading ? (
              <Badge variant="outline">Checking…</Badge>
            ) : hasVerifiedPermit ? (
              <div className="flex items-center gap-1.5">
                <Badge className="bg-primary text-primary-foreground border-primary/30">Verified</Badge>
                <TooltipProvider>
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center text-muted-foreground hover:text-foreground"
                        aria-label="What does verified mean?"
                      >
                        <HelpCircle className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-xs">
                        Verified means our admin reviewed the uploaded permit document. It does not itself authorize a transfer.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            ) : (
              <Badge variant="outline">Not verified</Badge>
            )}
          </div>
        ) : null}

        {/* Permit Expiration (whitetail only) */}
        {listing.category === 'whitetail_breeder' ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Permit expiration:</span>
            {!expirationDate ? (
              <Badge variant="destructive">Missing</Badge>
            ) : expStatus.expired ? (
              <Badge variant="destructive">Expired</Badge>
            ) : expStatus.expiringSoon ? (
              <Badge variant="secondary">
                <Clock className="h-3 w-3 mr-1" />
                Expiring in {expStatus.daysRemaining ?? '?'}d
              </Badge>
            ) : (
              <Badge variant="outline">Valid until {formatDate(expirationDate)}</Badge>
            )}
          </div>
        ) : null}

        {/* Seller Attestation (whitetail only; not "TPWD approved") */}
        {listing.category === 'whitetail_breeder' ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Seller attestation:</span>
            {listing.sellerAttestationAccepted ? <Badge variant="outline">Accepted</Badge> : <Badge variant="destructive">Missing</Badge>}
          </div>
        ) : null}

        {/* Texas-Only Notice */}
        <div className="pt-2 border-t">
          {isTexasOnlyCategory(listing.category as any) ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">Texas-only</Badge>
              <span className="text-xs text-muted-foreground">TX residents only.</span>
            </div>
          ) : null}
          {listing.category === 'whitetail_breeder' ? (
            <p className="text-[11px] text-muted-foreground mt-2">
              Payout is released only after delivery/acceptance requirements are met, and after Transfer Approval is uploaded and verified (see Transfer Requirements).
            </p>
          ) : null}
          {listing.category === 'horse_equestrian' ? (
            <p className="text-[11px] text-muted-foreground mt-2">
              Horse orders include an in-platform Bill of Sale / written transfer document tied to the order.
            </p>
          ) : null}
          <p className="text-[11px] text-muted-foreground mt-2">
            Learn more:{' '}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href={listing.category === 'horse_equestrian' ? '/trust#horses' : '/trust#whitetail'}
            >
              Trust &amp; Compliance
            </a>
          </p>
        </div>
      </div>
    </div>
  );

  if (variant === 'card') {
    return (
      <Card className={className}>
        <CardContent className="pt-6">{content}</CardContent>
      </Card>
    );
  }

  return content;
}
