/**
 * Document Upload Component
 * 
 * Reusable component for uploading compliance documents (permits, transfer approvals, etc.)
 */

'use client';

/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FileText, X, CheckCircle2, AlertCircle, Loader2, Eye, Trash2, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { uploadComplianceDocument, DocumentUploadProgress, deleteComplianceDocument } from '@/lib/firebase/storage-documents';
import { uploadDocument, deleteDocument } from '@/lib/firebase/documents';
import { DocumentStatus, DocumentType } from '@/lib/types';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

interface DocumentUploadProps {
  entityType: 'listing' | 'order';
  entityId: string;
  documentType: DocumentType;
  onUploadComplete: (documentUrl: string, documentId: string) => void;
  permitNumber?: string;
  onPermitNumberChange?: (value: string) => void;
  required?: boolean;
  className?: string;
  existingDocumentUrl?: string; // URL of existing document if already uploaded
  existingDocumentId?: string; // ID of existing document
  existingDocumentStatus?: DocumentStatus; // status of existing doc if known (e.g. verified/rejected/uploaded)
  onPendingFileChange?: (hasPendingFile: boolean) => void; // Callback when file selection changes
  uploadTrigger?: boolean; // If true, trigger upload automatically
}

export function DocumentUpload({
  entityType,
  entityId,
  documentType,
  onUploadComplete,
  permitNumber,
  onPermitNumberChange,
  required = false,
  className,
  existingDocumentUrl,
  existingDocumentId,
  existingDocumentStatus,
  onPendingFileChange,
  uploadTrigger = false,
}: DocumentUploadProps): JSX.Element {
  const { user } = useAuth();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(existingDocumentUrl || null);
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(existingDocumentId || null);
  const [documentStatus, setDocumentStatus] = useState<DocumentStatus | null>(existingDocumentStatus || null);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    // Keep in sync if parent refetches a newer status (e.g. admin verified/rejected)
    if (existingDocumentStatus) setDocumentStatus(existingDocumentStatus);
  }, [existingDocumentStatus]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    console.log('File selected:', selectedFile?.name, selectedFile?.type, selectedFile?.size);
    
    if (!selectedFile) {
      console.log('No file selected');
      return;
    }

    // Validate file type
    const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(selectedFile.type)) {
      console.error('Invalid file type:', selectedFile.type);
      setError('Invalid file type. Please upload a PDF or image file.');
      return;
    }

    // Validate file size (max 10MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      console.error('File too large:', selectedFile.size);
      setError('File size must be less than 10MB.');
      return;
    }

    console.log('✅ File validated, setting file state');
    setFile(selectedFile);
    setError(null);
    setUploadedUrl(null);
    // new file selection implies a new upload attempt
    setDocumentStatus(null);
    
    // Notify parent that there's a pending file
    if (onPendingFileChange) {
      onPendingFileChange(true);
    }
  };

  const handleUpload = async () => {
    console.log('handleUpload called', { file: file?.name, user: user?.uid, entityType, entityId });
    
    if (!file || !user) {
      console.error('Missing file or user:', { file: !!file, user: !!user });
      setError('Please select a file and ensure you are logged in.');
      return;
    }

    console.log('Starting upload process...');
    setUploading(true);
    setError(null);

    try {
      // Step 1: Upload file to Firebase Storage
      console.log('Step 1: Uploading to Firebase Storage...');
      const storageResult = await uploadComplianceDocument(
        entityType,
        entityId,
        file,
        (progress: DocumentUploadProgress) => {
          setUploadProgress(progress.progress * 0.9); // 90% for storage upload
        }
      );
      console.log('✅ Storage upload complete:', storageResult.url);

      // Step 2: Create Firestore document record
      setUploadProgress(95);
      let documentId: string;
      try {
        console.log('Creating Firestore document record:', {
          entityType,
          entityId,
          type: documentType,
          url: storageResult.url,
          uploadedBy: user.uid,
          permitNumber: permitNumber || undefined,
        });
        
        documentId = await uploadDocument({
          entityType,
          entityId,
          type: documentType,
          documentUrl: storageResult.url,
          uploadedBy: user.uid,
          permitNumber: permitNumber || undefined,
        });
        
        console.log('✅ Document saved to Firestore successfully! ID:', documentId);
        console.log('Document URL:', storageResult.url);
      } catch (docError: any) {
        console.error('❌ Error saving document to Firestore:', docError);
        console.error('Error details:', {
          message: docError.message,
          code: docError.code,
          stack: docError.stack,
        });
        throw new Error(`Failed to save document record: ${docError.message || 'Unknown error'}`);
      }

      setUploadProgress(100);
      setUploadedUrl(storageResult.url);
      setCurrentDocumentId(documentId);
      setDocumentStatus('uploaded');
      setFile(null); // Clear selected file after successful upload
      
      // Clear pending file flag
      if (onPendingFileChange) {
        onPendingFileChange(false);
      }
      
      console.log('Calling onUploadComplete with:', {
        url: storageResult.url,
        documentId,
      });
      
      onUploadComplete(storageResult.url, documentId);
      
      toast({
        title: 'Document uploaded',
        description: 'Your document has been uploaded and saved successfully.',
      });
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to upload document. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleRemove = () => {
    setFile(null);
    setUploadProgress(0);
    setError(null);
    if (onPendingFileChange) {
      onPendingFileChange(false);
    }
  };

  const handleDelete = async () => {
    if (typeof window !== 'undefined' && !window.confirm('Are you sure you want to delete this document? You will need to upload it again.')) {
      return;
    }

    if (!currentDocumentId || !uploadedUrl) {
      // If no document ID, just clear local state
      setUploadedUrl(null);
      setCurrentDocumentId(null);
      setFile(null);
      setError(null);
      setDocumentStatus(null);
      if (onPendingFileChange) {
        onPendingFileChange(false);
      }
      return;
    }

    try {
      // Delete from Firestore
      await deleteDocument(entityType, entityId, currentDocumentId);
      
      // Try to delete from Storage (extract path from URL)
      try {
        const urlPath = uploadedUrl.split('/o/')[1]?.split('?')[0];
        if (urlPath) {
          const decodedPath = decodeURIComponent(urlPath);
          await deleteComplianceDocument(decodedPath);
        }
      } catch (storageError) {
        console.warn('Could not delete from Storage:', storageError);
        // Continue even if Storage deletion fails
      }

      setUploadedUrl(null);
      setCurrentDocumentId(null);
      setFile(null);
      setError(null);
      setDocumentStatus(null);
      if (onPendingFileChange) {
        onPendingFileChange(false);
      }
      
      toast({
        title: 'Document deleted',
        description: 'The document has been removed. Please upload a new one.',
      });
    } catch (error: any) {
      console.error('Error deleting document:', error);
      toast({
        title: 'Error deleting document',
        description: error.message || 'Failed to delete document. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleReplace = () => {
    setUploadedUrl(null);
    setCurrentDocumentId(null);
    setFile(null);
    setError(null);
    setDocumentStatus(null);
  };

  const getDocumentTypeLabel = (type: DocumentType): string => {
    const labels: Record<DocumentType, string> = {
      TPWD_BREEDER_PERMIT: 'TPWD Breeder Permit',
      TPWD_TRANSFER_APPROVAL: 'TPWD Transfer Approval',
      DELIVERY_PROOF: 'Delivery Proof',
      TAHC_CVI: 'TAHC CVI (Certificate of Veterinary Inspection)',
      BRAND_INSPECTION: 'Brand Inspection',
      TITLE: 'Title',
      BILL_OF_SALE: 'Bill of Sale',
      HEALTH_CERTIFICATE: 'Health Certificate',
      OTHER: 'Other Document',
    };
    return labels[type] || type;
  };

  const rootClassName = className ? `space-y-4 ${className}` : 'space-y-4';

  return (
    <div className={rootClassName}>
      <div>
        <Label className="text-base font-semibold">
          {getDocumentTypeLabel(documentType)}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a PDF or image file (max 10MB)
        </p>
      </div>

      {permitNumber !== undefined && onPermitNumberChange && (
        <div className="space-y-2">
          <Label htmlFor="permit-number">Permit/License Number (Optional)</Label>
          <Input
            id="permit-number"
            value={permitNumber}
            onChange={(e) => onPermitNumberChange(e.target.value)}
            placeholder="Enter permit or license number"
            className="min-h-[48px]"
          />
        </div>
      )}

      {/* Show uploaded document status (uploaded vs verified vs rejected) */}
      {uploadedUrl && !file && (
        <Card
          className={
            documentStatus === 'verified'
              ? 'border-2 border-green-200 bg-green-50/50'
              : documentStatus === 'rejected'
                ? 'border-2 border-red-200 bg-red-50/50'
                : 'border-2 border-amber-200 bg-amber-50/50'
          }
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                <div className="mt-1">
                  {documentStatus === 'verified' ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : documentStatus === 'rejected' ? (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  ) : (
                    <Loader2 className="h-5 w-5 text-amber-700 animate-spin" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText
                      className={
                        documentStatus === 'verified'
                          ? 'h-4 w-4 text-green-700'
                          : documentStatus === 'rejected'
                            ? 'h-4 w-4 text-red-700'
                            : 'h-4 w-4 text-amber-800'
                      }
                    />
                    <span
                      className={
                        documentStatus === 'verified'
                          ? 'font-semibold text-green-900'
                          : documentStatus === 'rejected'
                            ? 'font-semibold text-red-900'
                            : 'font-semibold text-amber-900'
                      }
                    >
                      {documentStatus === 'verified'
                        ? 'Verified (marketplace)'
                        : documentStatus === 'rejected'
                          ? 'Rejected (needs update)'
                          : 'Uploaded (awaiting verification)'}
                    </span>
                  </div>
                  <p
                    className={
                      documentStatus === 'verified'
                        ? 'text-sm text-green-800 mb-2'
                        : documentStatus === 'rejected'
                          ? 'text-sm text-red-800 mb-2'
                          : 'text-sm text-amber-900 mb-2'
                    }
                  >
                    {documentStatus === 'verified'
                      ? `Your ${getDocumentTypeLabel(documentType)} has been verified as complete for marketplace workflow.`
                      : documentStatus === 'rejected'
                        ? `Your ${getDocumentTypeLabel(documentType)} was rejected. Please upload a corrected document.`
                        : `Your ${getDocumentTypeLabel(documentType)} has been uploaded. An admin will verify it shortly.`}
                  </p>
                  {/* Extract filename from URL if possible */}
                  {uploadedUrl && (
                    <p
                      className={
                        documentStatus === 'verified'
                          ? 'text-xs text-green-700 mb-3 font-mono bg-green-100 px-2 py-1 rounded inline-block'
                          : documentStatus === 'rejected'
                            ? 'text-xs text-red-700 mb-3 font-mono bg-red-100 px-2 py-1 rounded inline-block'
                            : 'text-xs text-amber-900 mb-3 font-mono bg-amber-100 px-2 py-1 rounded inline-block'
                      }
                    >
                      {uploadedUrl.split('/').pop()?.split('?')[0] || 'Document file'}
                    </p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPreview(true)}
                      className="h-8"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(uploadedUrl, '_blank')}
                      className="h-8"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open in New Tab
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleReplace}
                      className="h-8"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Replace
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDelete}
                      className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload UI - Show when no document uploaded or when replacing */}
      {(!uploadedUrl || file) && (
        <div className="space-y-3">
          <div className="border-2 border-dashed border-border rounded-lg p-6 bg-muted/30 hover:bg-muted/50 transition-colors">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div className="text-center space-y-2">
                <Label htmlFor={`file-upload-${documentType}`} className="text-base font-semibold cursor-pointer text-foreground">
                  Click to select file or drag and drop
                </Label>
                <p className="text-sm text-muted-foreground">
                  PDF, JPG, PNG, or WEBP (max 10MB)
                </p>
              </div>
              <Input
                id={`file-upload-${documentType}`}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={handleFileSelect}
                disabled={uploading}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById(`file-upload-${documentType}`)?.click()}
                disabled={uploading}
                className="min-h-[48px]"
              >
                <Upload className="mr-2 h-4 w-4" />
                Choose File
              </Button>
            </div>
          </div>

          {file && (
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between p-3 bg-card border rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemove}
                    disabled={uploading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Button
                onClick={handleUpload}
                disabled={uploading}
                className="min-h-[48px]"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload
                  </>
                )}
              </Button>
            </div>
          )}

          {uploading && (
            <div className="space-y-2">
              <Progress value={uploadProgress} />
              <p className="text-sm text-muted-foreground text-center">
                {Math.round(uploadProgress)}% uploaded
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Document Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{getDocumentTypeLabel(documentType)}</DialogTitle>
            <DialogDescription>
              Preview your uploaded document
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {uploadedUrl && (
              <div className="w-full h-[70vh] border rounded-lg overflow-hidden">
                {uploadedUrl.endsWith('.pdf') || uploadedUrl.includes('application/pdf') ? (
                  <iframe
                    src={uploadedUrl}
                    className="w-full h-full"
                    title="Document Preview"
                  />
                ) : (
                  <img
                    src={uploadedUrl}
                    alt="Document Preview"
                    className="w-full h-full object-contain"
                  />
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Close
            </Button>
            <Button onClick={() => {
              window.open(uploadedUrl || '', '_blank');
            }}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Open in New Tab
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
