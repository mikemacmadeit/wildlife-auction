/**
 * Trust Badges Component
 * 
 * Displays compliance and verification badges for listings (read-only)
 */

'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, FileText, Clock, XCircle, Shield, HelpCircle } from 'lucide-react';
import { Listing, ComplianceStatus } from '@/lib/types';
import { getDocuments } from '@/lib/firebase/documents';
import { useEffect, useState } from 'react';
import { getPermitExpirationStatus } from '@/lib/compliance/validation';
import { formatDate } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface TrustBadgesProps {
  listing: Listing;
  className?: string;
}

export function ComplianceBadges({ listing, className }: TrustBadgesProps) {
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

  const animalCategories = ['whitetail_breeder', 'wildlife_exotics', 'cattle_livestock'];
  if (!animalCategories.includes(listing.category)) {
    return null; // Only show for animal listings
  }

  const getComplianceBadge = () => {
    if (!listing.complianceStatus || listing.complianceStatus === 'none') {
      return null;
    }

    switch (listing.complianceStatus) {
      case 'approved':
        return (
          <Badge variant="default" className="bg-green-600">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Compliance Approved
          </Badge>
        );
      case 'pending_review':
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Pending Review
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Compliance Rejected
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-4 w-4 text-primary" />
          <h3 className="font-semibold text-sm">Trust & Compliance</h3>
        </div>
        <div className="space-y-3">
          {/* Compliance Status */}
          {getComplianceBadge() && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Status:</span>
              {getComplianceBadge()}
            </div>
          )}

          {/* TPWD Breeder Permit (whitetail only) */}
          {listing.category === 'whitetail_breeder' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">TPWD Breeder Permit:</span>
              {loading ? (
                <Badge variant="outline">Checking...</Badge>
              ) : hasVerifiedPermit ? (
                <div className="flex items-center gap-1.5">
                  <Badge variant="default" className="bg-primary text-primary-foreground">
                    <FileText className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                  <TooltipProvider>
                    <Tooltip delayDuration={200}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center text-muted-foreground hover:text-foreground"
                          aria-label="What does Verified mean?"
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
                <Badge variant="outline">Not Verified</Badge>
              )}
            </div>
          )}

          {/* Permit Expiration (whitetail only) */}
          {listing.category === 'whitetail_breeder' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Permit Expiration:</span>
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
          )}

          {/* Seller Attestation (whitetail only; not "TPWD approved") */}
          {listing.category === 'whitetail_breeder' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Seller Attestation:</span>
              {listing.sellerAttestationAccepted ? (
                <Badge variant="outline">Accepted</Badge>
              ) : (
                <Badge variant="destructive">Missing</Badge>
              )}
            </div>
          )}

          {/* Texas-Only Notice */}
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">
              <strong>Texas-only:</strong> TX residents only.
            </p>
            {listing.category === 'whitetail_breeder' && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Payout is released only after delivery/acceptance requirements are met, and after Transfer Approval is uploaded and verified (see Transfer Requirements).
              </p>
            )}
            <p className="text-[11px] text-muted-foreground mt-2">
              Learn more: <a className="underline underline-offset-2 hover:text-foreground" href="/trust#whitetail">Trust &amp; Compliance</a>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
