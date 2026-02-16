/**
 * Compliance Transfer Panel
 * 
 * Displays TPWD transfer permit compliance confirmation UI for regulated whitetail breeder buck transactions.
 * Both buyer and seller must confirm compliance before fulfillment can proceed.
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FileText, Upload, CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import type { Order } from '@/lib/types';
import { isRegulatedWhitetailDeal, hasComplianceConfirmations } from '@/lib/compliance/whitetail';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import { uploadComplianceDocument } from '@/lib/firebase/storage-documents';

interface ComplianceTransferPanelProps {
  order: Order;
  role: 'buyer' | 'seller';
  onConfirm?: () => void;
}

export function ComplianceTransferPanel({ order, role, onConfirm }: ComplianceTransferPanelProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  const txStatus = getEffectiveTransactionStatus(order);
  const isRegulated = isRegulatedWhitetailDeal(order);
  const confirmations = hasComplianceConfirmations(order);

  // Only show for regulated deals in compliance gate
  if (!isRegulated || txStatus !== 'AWAITING_TRANSFER_COMPLIANCE') {
    return null;
  }

  const isBuyer = role === 'buyer';
  const hasConfirmed = isBuyer ? confirmations.buyerConfirmed : confirmations.sellerConfirmed;
  const otherConfirmed = isBuyer ? confirmations.sellerConfirmed : confirmations.buyerConfirmed;

  const handleSubmit = async () => {
    if (!confirmed) {
      setError('Please confirm compliance before submitting.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/orders/${order.id}/compliance-transfer/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          confirmed: true,
          ...(uploadedUrl ? { uploadUrl: uploadedUrl } : {}),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to confirm compliance');
      }

      // Success - refresh or call callback
      if (onConfirm) {
        onConfirm();
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to confirm compliance');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setError(null);

    try {
      const result = await uploadComplianceDocument('order', order.id, file);
      setUploadedUrl(result.url);
    } catch (err: any) {
      setError(err.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  if (hasConfirmed) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-800">
            <CheckCircle2 className="h-5 w-5" />
            Compliance Confirmed
          </CardTitle>
          <CardDescription>
            You have confirmed TPWD transfer permit compliance.
            {!otherConfirmed && (
              <span className="block mt-2 text-amber-700">
                Waiting for {isBuyer ? 'seller' : 'buyer'} to confirm.
              </span>
            )}
            {otherConfirmed && (
              <span className="block mt-2 text-green-700 font-semibold">
                Both parties confirmed. Fulfillment is now unlocked.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        {order.complianceTransfer?.buyerUploadUrl || order.complianceTransfer?.sellerUploadUrl ? (
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <FileText className="h-4 w-4" />
              <span>Permit document uploaded</span>
            </div>
          </CardContent>
        ) : null}
      </Card>
    );
  }

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-amber-900">
          <AlertTriangle className="h-5 w-5" />
          TPWD Transfer Permit Required
        </CardTitle>
        <CardDescription className="text-amber-800">
          This transaction requires TPWD transfer permit compliance confirmation before fulfillment can proceed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription className="text-sm text-gray-700">
            <strong>Legal Notice:</strong> Agchange facilitates transactions between permitted parties.
            Buyer and seller are solely responsible for complying with all Texas Parks & Wildlife transfer and
            possession requirements prior to delivery or pickup.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Checkbox
              id="compliance-confirm"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
              disabled={submitting}
            />
            <Label htmlFor="compliance-confirm" className="text-sm leading-relaxed cursor-pointer">
              {isBuyer ? (
                <>
                  I confirm the TPWD transfer permit has been completed in compliance with Texas law.
                </>
              ) : (
                <>
                  I confirm the TPWD transfer permit has been completed and approved prior to transfer.
                </>
              )}
            </Label>
          </div>

          <div className="text-sm text-gray-600">
            <p className="font-semibold mb-1">Optional: Upload Permit Document</p>
            <p className="text-xs text-gray-500 mb-2">
              While not required, uploading your TPWD transfer permit document helps maintain records.
            </p>
            {uploadedUrl && (
              <p className="text-xs text-green-600 mb-2 flex items-center gap-1">
                <FileText className="h-3 w-3" />
                Document uploaded. Confirm compliance below to save.
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.pdf,.jpg,.jpeg,.png';
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleFileUpload(file);
                };
                input.click();
              }}
              disabled={uploading || submitting}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Permit Document
                </>
              )}
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={handleSubmit}
          disabled={!confirmed || submitting}
          className="w-full"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              Confirm Compliance
            </>
          )}
        </Button>

        {otherConfirmed && (
          <Alert className="bg-blue-50 border-blue-200">
            <AlertDescription className="text-sm text-blue-800">
              The {isBuyer ? 'seller' : 'buyer'} has already confirmed. Once you confirm, fulfillment will be unlocked.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
