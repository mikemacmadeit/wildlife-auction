/**
 * OrderDocumentsPanel
 *
 * UX goal: keep "what do I need to upload?" and "what's the status?" in the canonical order page,
 * without changing any backend enforcement. This is a UI-only consolidation layer.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DocumentUpload } from '@/components/compliance/DocumentUpload';
import { getDocuments } from '@/lib/firebase/documents';
import { getCategoryRequirements } from '@/lib/compliance/requirements';
import { getRequiredOrderDocsForListing } from '@/lib/compliance/policy';
import { normalizeCategory } from '@/lib/listings/normalizeCategory';
import type { ComplianceDocument, DocumentType, Listing, ListingCategory } from '@/lib/types';

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function getLatestByType(docs: ComplianceDocument[]): Record<string, ComplianceDocument> {
  const out: Record<string, ComplianceDocument> = {};
  for (const d of docs) {
    const key = String((d as any)?.type || '').trim();
    if (!key) continue;
    const existing = out[key];
    if (!existing) out[key] = d;
    else {
      const a = existing?.uploadedAt ? new Date(existing.uploadedAt).getTime() : 0;
      const b = d?.uploadedAt ? new Date(d.uploadedAt).getTime() : 0;
      if (b >= a) out[key] = d;
    }
  }
  return out;
}

export function OrderDocumentsPanel(props: {
  orderId: string;
  listing: Listing | null;
  excludeDocumentTypes?: DocumentType[];
}): JSX.Element | null {
  const { orderId, listing, excludeDocumentTypes } = props;
  const [docs, setDocs] = useState<ComplianceDocument[]>([]);
  const [loading, setLoading] = useState(false);

  const category = useMemo(() => {
    const raw = (listing as any)?.category;
    try {
      return normalizeCategory(raw) as ListingCategory;
    } catch {
      // best-effort: keep UI working even if listing.category is missing/legacy
      return 'wildlife_exotics' as ListingCategory;
    }
  }, [listing]);

  const attributes = useMemo(() => ((listing as any)?.attributes || {}) as any, [listing]);

  const requirements = useMemo(() => {
    try {
      return getCategoryRequirements(category);
    } catch {
      return null;
    }
  }, [category]);

  const requiredCheckoutDocs = useMemo(() => {
    return requirements?.requiredOrderDocuments || [];
  }, [requirements]);

  const requiredPayoutDocs = useMemo(() => {
    try {
      return getRequiredOrderDocsForListing(category, attributes);
    } catch {
      return [];
    }
  }, [attributes, category]);

  const excludeSet = useMemo(() => new Set((excludeDocumentTypes || []).map(String)), [excludeDocumentTypes]);

  const requiredDocs = useMemo(() => {
    const all = uniq([...requiredCheckoutDocs, ...requiredPayoutDocs]).filter(Boolean);
    return all.filter((t) => !excludeSet.has(String(t)));
  }, [excludeSet, requiredCheckoutDocs, requiredPayoutDocs]);

  const optionalDocs = useMemo(() => {
    const supported = requirements?.supportedOrderDocuments || [];
    const optional = supported.filter((t) => !requiredDocs.includes(t));
    return optional.filter((t) => !excludeSet.has(String(t)));
  }, [excludeSet, requiredDocs, requirements]);

  const latestByType = useMemo(() => getLatestByType(docs), [docs]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!orderId) return;
      setLoading(true);
      try {
        const all = await getDocuments('order', orderId).catch(() => []);
        if (!cancelled) setDocs(all);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  // If we truly have nothing to show, don’t render extra UI.
  if (requiredDocs.length === 0 && optionalDocs.length === 0) return null;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Documents</CardTitle>
        <CardDescription>
          Upload and track required documents for this order. These are for marketplace workflow and payout holds (not transport coordination).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading documents…</div>
        ) : null}

        {requiredDocs.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-semibold text-sm">Required</div>
              {requiredPayoutDocs.length > 0 ? (
                <Badge variant="secondary" className="text-xs">
                  Required before payout release
                </Badge>
              ) : null}
              {requiredCheckoutDocs.length > 0 ? (
                <Badge variant="secondary" className="text-xs">
                  Required paperwork
                </Badge>
              ) : null}
            </div>
            <div className="grid gap-4">
              {requiredDocs.map((type) => {
                const existing = latestByType[String(type)];
                return (
                  <DocumentUpload
                    key={String(type)}
                    entityType="order"
                    entityId={orderId}
                    documentType={type}
                    existingDocumentUrl={existing?.documentUrl}
                    existingDocumentId={existing?.id}
                    existingDocumentStatus={(existing as any)?.status}
                    required
                    onUploadComplete={async () => {
                      const all = await getDocuments('order', orderId).catch(() => []);
                      setDocs(all);
                    }}
                  />
                );
              })}
            </div>
          </div>
        ) : null}

        {optionalDocs.length > 0 ? (
          <>
            <Separator />
            <details>
              <summary className="cursor-pointer text-sm font-semibold">Optional supporting documents</summary>
              <div className="mt-3 grid gap-4">
                {optionalDocs.map((type) => {
                  const existing = latestByType[String(type)];
                  return (
                    <DocumentUpload
                      key={String(type)}
                      entityType="order"
                      entityId={orderId}
                      documentType={type}
                      existingDocumentUrl={existing?.documentUrl}
                      existingDocumentId={existing?.id}
                      existingDocumentStatus={(existing as any)?.status}
                      required={false}
                      onUploadComplete={async () => {
                        const all = await getDocuments('order', orderId).catch(() => []);
                        setDocs(all);
                      }}
                    />
                  );
                })}
              </div>
            </details>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

