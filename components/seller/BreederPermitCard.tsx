'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { FileText, Loader2, Eye, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { uploadSellerPermitDocument, type DocumentUploadProgress } from '@/lib/firebase/storage-documents';

type PermitStatus = 'pending' | 'verified' | 'rejected';

type SellerPermit = {
  sellerId: string;
  status: PermitStatus;
  permitNumber: string | null;
  documentUrl: string | null;
  storagePath: string | null;
  rejectionReason: string | null;
  expiresAt: string | null;
  uploadedAt: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  updatedAt: string | null;
};

function statusBadgeVariant(status: PermitStatus | null | undefined) {
  if (status === 'verified') return 'secondary';
  if (status === 'rejected') return 'destructive';
  return 'outline';
}

export function BreederPermitCard(props: { className?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [permit, setPermit] = useState<SellerPermit | null>(null);

  const [permitNumber, setPermitNumber] = useState('');
  const [expiresAt, setExpiresAt] = useState(''); // yyyy-mm-dd
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const canSubmit = useMemo(() => !!user?.uid && !!file && !uploading, [file, uploading, user?.uid]);

  const load = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/seller/breeder-permit', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || json?.message || 'Failed to load breeder permit');
      setPermit(json?.permit || null);
      setPermitNumber(String(json?.permit?.permitNumber || ''));
      setExpiresAt(json?.permit?.expiresAt ? String(json.permit.expiresAt).slice(0, 10) : '');
    } catch (e: any) {
      setPermit(null);
      setError(e?.message || 'Failed to load breeder permit');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setLoading(false);
      setPermit(null);
      return;
    }
    load();
  }, [user?.uid, load]);

  const onFile = (f: File | null) => {
    setError(null);
    setFile(f);
  };

  const handleSubmit = useCallback(async () => {
    if (!user?.uid || !file) return;
    setUploading(true);
    setError(null);
    setProgress(0);
    try {
      const storage = await uploadSellerPermitDocument(user.uid, file, (p: DocumentUploadProgress) => {
        setProgress(Math.round(p.progress * 0.9));
      });

      const token = await user.getIdToken();
      const res = await fetch('/api/seller/breeder-permit', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          documentUrl: storage.url,
          storagePath: storage.path,
          permitNumber: permitNumber || undefined,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || json?.message || 'Failed to submit breeder permit');

      setProgress(100);
      setFile(null);
      toast({
        title: 'Submitted for review',
        description: 'Your breeder permit has been uploaded and submitted to the compliance team.',
      });
      await load();
    } catch (e: any) {
      console.error('Breeder permit submit failed:', e);
      setError(e?.message || 'Failed to upload breeder permit');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }, [expiresAt, file, load, permitNumber, toast, user]);

  return (
    <Card className={props.className}>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              TPWD Breeder Permit
            </CardTitle>
            <CardDescription>
              Upload your breeder permit. Admin will review and (if approved) you’ll receive a badge shown on your profile and listings.
            </CardDescription>
          </div>
          {permit?.status ? (
            <Badge variant={statusBadgeVariant(permit.status) as any} className="capitalize">
              {permit.status === 'pending' ? 'Pending review' : permit.status}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {permit?.status === 'rejected' && permit.rejectionReason ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-semibold">Rejected</div>
              <div className="text-sm mt-1">{permit.rejectionReason}</div>
            </AlertDescription>
          </Alert>
        ) : null}

        {permit?.status === 'verified' ? (
          <div className="rounded-lg border bg-muted/20 p-4 flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Permit verified
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {permit.expiresAt ? `Expires: ${new Date(permit.expiresAt).toLocaleDateString()}` : 'No expiration on file.'}
              </div>
            </div>
            {permit.documentUrl ? (
              <Button variant="outline" size="sm" onClick={() => setShowPreview(true)}>
                <Eye className="h-4 w-4 mr-2" />
                View
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="tpwd-permit-number">Permit number</Label>
            <Input
              id="tpwd-permit-number"
              value={permitNumber}
              onChange={(e) => setPermitNumber(e.target.value)}
              placeholder="e.g. TPWD-XXXXXX"
              disabled={uploading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tpwd-permit-exp">Expiration date</Label>
            <Input
              id="tpwd-permit-exp"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              disabled={uploading}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tpwd-permit-file">Upload permit (PDF or image)</Label>
          <Input
            id="tpwd-permit-file"
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => onFile(e.target.files?.[0] || null)}
            disabled={uploading}
          />
          <div className="text-xs text-muted-foreground">
            Allowed: PDF/JPG/PNG/WEBP. Max 10MB.
          </div>
        </div>

        {uploading ? (
          <div className="space-y-2">
            <Progress value={progress} />
            <div className="text-xs text-muted-foreground">Uploading…</div>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Submit for review
          </Button>
          {permit?.documentUrl ? (
            <Button variant="outline" onClick={() => setShowPreview(true)} disabled={uploading}>
              <Eye className="h-4 w-4 mr-2" />
              View current
            </Button>
          ) : null}
        </div>

        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>TPWD Breeder Permit</DialogTitle>
              <DialogDescription>Preview your uploaded document.</DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border overflow-hidden bg-background">
              {permit?.documentUrl ? (
                <iframe title="TPWD Breeder Permit" src={permit.documentUrl} className="w-full h-[70vh]" />
              ) : (
                <div className="p-6 text-sm text-muted-foreground">No document uploaded yet.</div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

