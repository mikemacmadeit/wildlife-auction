/**
 * Admin Compliance Dashboard
 * 
 * Single compliance hub (operator-friendly):
 * - Listings: review listings with complianceStatus='pending_review'
 * - Orders: review whitetail_breeder orders requiring TPWD transfer approval
 * - Breeder Permits: seller-submitted TPWD breeder permits
 * - Payout Holds: orders blocked from payout release for compliance reasons (payoutHoldReason)
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CheckCircle,
  XCircle,
  FileText,
  Loader2,
  Search,
  Eye,
  Shield,
  ShieldAlert,
  AlertCircle,
  Calendar,
  MapPin,
  User,
} from 'lucide-react';
import { collection, query, where, getDocs, updateDoc, doc, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Listing, Order, ComplianceStatus, DocumentType } from '@/lib/types';
import { formatDistanceToNow, format } from 'date-fns';
import Image from 'next/image';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency } from '@/lib/utils';
import { ComplianceDocument } from '@/lib/types';
import { getPermitExpirationStatus } from '@/lib/compliance/validation';

type TabType = 'listings' | 'orders' | 'breeder_permits' | 'payout_holds';

type SellerPermit = {
  sellerId: string;
  status: 'pending' | 'verified' | 'rejected';
  permitNumber?: string | null;
  documentUrl?: string | null;
  storagePath?: string | null;
  rejectionReason?: string | null;
  expiresAt?: string | null; // ISO
  uploadedAt?: string | null; // ISO
  reviewedAt?: string | null; // ISO
  reviewedBy?: string | null;
  updatedAt?: string | null;
};

type HoldRow = {
  id: string;
  status?: string;
  payoutHoldReason?: string;
  adminPayoutApproval?: boolean;
  listingId?: string;
  buyerId?: string;
  sellerId?: string;
  listingSnapshot?: { title?: string; category?: string } | null;
  complianceDocsStatus?: { missing?: string[] } | null;
};

const HOLD_REASONS = [
  'MISSING_TAHC_CVI',
  'EXOTIC_CERVID_REVIEW_REQUIRED',
  'ESA_REVIEW_REQUIRED',
  'OTHER_EXOTIC_REVIEW_REQUIRED',
] as const;

const REVIEW_REQUIRED = new Set<string>([
  'EXOTIC_CERVID_REVIEW_REQUIRED',
  'ESA_REVIEW_REQUIRED',
  'OTHER_EXOTIC_REVIEW_REQUIRED',
]);

export default function AdminCompliancePage() {
  const toDateSafe = (value: any): Date | null => {
    if (!value) return null;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
    if (typeof value?.toDate === 'function') {
      try {
        const d = value.toDate();
        if (d instanceof Date && Number.isFinite(d.getTime())) return d;
      } catch {
        // ignore
      }
    }
    if (typeof value?.seconds === 'number') {
      const d = new Date(value.seconds * 1000);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      const d = new Date(value);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    return null;
  };

  const toMillisSafe = (value: any): number => {
    const d = toDateSafe(value);
    return d ? d.getTime() : 0;
  };

  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>('listings');
  const [listings, setListings] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [breederPermits, setBreederPermits] = useState<SellerPermit[]>([]);
  const [holdRows, setHoldRows] = useState<HoldRow[]>([]);
  const [approvingHold, setApprovingHold] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [listingDocs, setListingDocs] = useState<ComplianceDocument[]>([]);
  const [orderDocs, setOrderDocs] = useState<ComplianceDocument[]>([]);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [verifyDocDialogOpen, setVerifyDocDialogOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<ComplianceDocument | null>(null);
  const [docRejectionReason, setDocRejectionReason] = useState('');
  const [viewingDocUrl, setViewingDocUrl] = useState<string | null>(null);
  const [quickVerifyDocId, setQuickVerifyDocId] = useState<string | null>(null);
  const [listingDocsMap, setListingDocsMap] = useState<Record<string, ComplianceDocument[]>>({});

  const [selectedPermit, setSelectedPermit] = useState<SellerPermit | null>(null);
  const [permitDialogOpen, setPermitDialogOpen] = useState(false);
  const [permitRejectionReason, setPermitRejectionReason] = useState('');

  // Allow deep-linking: /dashboard/admin/compliance?tab=payout_holds
  useEffect(() => {
    const tab = String(searchParams?.get('tab') || '').trim();
    if (!tab) return;
    if (tab === 'listings' || tab === 'orders' || tab === 'breeder_permits' || tab === 'payout_holds') {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      if (activeTab === 'listings') {
        await loadPendingListings();
      } else if (activeTab === 'orders') {
        await loadPendingOrders();
      } else if (activeTab === 'breeder_permits') {
        await loadBreederPermits();
      } else {
        await loadComplianceHolds();
      }
    } catch (error) {
      console.error('Error loading compliance data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load compliance data.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [activeTab, toast]);

  useEffect(() => {
    if (!adminLoading && isAdmin) {
      loadData();
    }
  }, [activeTab, adminLoading, isAdmin, loadData]);

  const loadPendingListings = async () => {
    const listingsRef = collection(db, 'listings');
    // Query without orderBy to avoid needing composite index
    // We'll sort client-side instead
    const q = query(
      listingsRef,
      where('complianceStatus', '==', 'pending_review')
    );
    
    const snapshot = await getDocs(q);
    const pendingListings: Listing[] = [];
    const docsMap: Record<string, ComplianceDocument[]> = {};
    
    // Load documents for each listing
    const { getDocuments } = await import('@/lib/firebase/documents');
    
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const listingId = docSnap.id;
      
      // Helper function to safely convert Firestore Timestamp to Date
      const toDate = (value: any): Date | undefined => {
        if (!value) return undefined;
        if (value instanceof Date) return value;
        if (value && typeof value.toDate === 'function') return value.toDate();
        return undefined;
      };
      
      pendingListings.push({
        id: listingId,
        ...data,
        createdAt: toDate(data.createdAt) || new Date(),
        updatedAt: toDate(data.updatedAt) || new Date(),
        publishedAt: toDate(data.publishedAt),
        endsAt: toDate(data.endsAt),
      } as Listing);
      
      // Load documents for this listing
      try {
        const docs = await getDocuments('listing', listingId);
        docsMap[listingId] = docs;
      } catch (error) {
        console.error(`Error loading documents for listing ${listingId}:`, error);
        docsMap[listingId] = [];
      }
    }
    
    // Sort by createdAt descending (newest first) - bulletproof against Timestamp-like values
    pendingListings.sort((a, b) => toMillisSafe((b as any).createdAt) - toMillisSafe((a as any).createdAt));
    
    setListings(pendingListings);
    setListingDocsMap(docsMap);
  };

  const loadPendingOrders = async () => {
    // Get whitetail_breeder orders that need transfer approval
    const ordersRef = collection(db, 'orders');
    const q = query(
      ordersRef,
      where('transferPermitRequired', '==', true),
      where('transferPermitStatus', 'in', ['none', 'uploaded']),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    const pendingOrders: Order[] = [];
    
    // Helper function to safely convert Firestore Timestamp to Date
    const toDate = (value: any): Date | undefined => {
      if (!value) return undefined;
      if (value instanceof Date) return value;
      if (value && typeof value.toDate === 'function') return value.toDate();
      return undefined;
    };
    
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      pendingOrders.push({
        id: docSnap.id,
        ...data,
        createdAt: toDate(data.createdAt) || new Date(),
        updatedAt: toDate(data.updatedAt) || new Date(),
        paidAt: toDate(data.paidAt),
      } as Order);
    });
    
    setOrders(pendingOrders);
  };

  const loadBreederPermits = async () => {
    if (!user?.uid) return;
    const token = await user.getIdToken();
    const res = await fetch('/api/admin/breeder-permits?status=pending&limit=50', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const jsonRes = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(jsonRes?.error || jsonRes?.message || `Failed to load breeder permits (HTTP ${res.status})`);
    }
    setBreederPermits(Array.isArray(jsonRes?.permits) ? jsonRes.permits : []);
  };

  const loadComplianceHolds = async () => {
    const ordersRef = collection(db, 'orders');
    // Firestore `in` supports up to 10 values; we use 4.
    const q = query(ordersRef, where('payoutHoldReason', 'in', [...HOLD_REASONS]), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const data: HoldRow[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    setHoldRows(data);
  };

  const approveHold = async (orderId: string) => {
    if (!user) return;
    setApprovingHold((m) => ({ ...m, [orderId]: true }));
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/orders/${orderId}/payout-approval`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ approved: true }),
      });
      const jsonRes = await res.json().catch(() => null);
      if (!res.ok) throw new Error(jsonRes?.error || jsonRes?.message || 'Unable to approve payout');
      toast({ title: 'Approved', description: `Payout approval set for ${orderId}` });
      await loadComplianceHolds();
    } catch (e: any) {
      toast({ title: 'Approve failed', description: e?.message || 'Unable to approve payout', variant: 'destructive' });
    } finally {
      setApprovingHold((m) => ({ ...m, [orderId]: false }));
    }
  };

  const loadListingDocuments = async (listingId: string) => {
    try {
      const { getDocuments } = await import('@/lib/firebase/documents');
      const docs = await getDocuments('listing', listingId);
      setListingDocs(docs);
    } catch (error) {
      console.error('Error loading listing documents:', error);
    }
  };

  const loadOrderDocuments = async (orderId: string) => {
    try {
      const { getDocuments } = await import('@/lib/firebase/documents');
      const docs = await getDocuments('order', orderId, 'TPWD_TRANSFER_APPROVAL');
      setOrderDocs(docs);
    } catch (error) {
      console.error('Error loading order documents:', error);
    }
  };

  const handleApproveListing = async (listingId: string) => {
    if (!user) return;
    
    try {
      setProcessingId(listingId);
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/compliance/listings/${listingId}/approve`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const jsonRes = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(jsonRes?.error || jsonRes?.message || `Failed to approve compliance (HTTP ${res.status})`);
      }
      
      toast({
        title: '✅ Listing Approved',
        description: jsonRes?.published ? 'The listing is now live and visible to buyers.' : 'Compliance approved. The listing may still require admin approval to go live.',
      });
      
      await loadPendingListings();
      setReviewDialogOpen(false);
    } catch (error) {
      console.error('Error approving listing:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve listing.',
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectListing = async (listingId: string) => {
    if (!user || !rejectionReason.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a rejection reason.',
        variant: 'destructive',
      });
      return;
    }
    
    try {
      setProcessingId(listingId);
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/compliance/listings/${listingId}/reject`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: rejectionReason }),
      });
      const jsonRes = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(jsonRes?.error || jsonRes?.message || `Failed to reject compliance (HTTP ${res.status})`);
      }
      
      toast({
        title: 'Listing Rejected',
        description: 'The listing has been rejected.',
      });
      
      await loadPendingListings();
      setReviewDialogOpen(false);
      setRejectionReason('');
    } catch (error) {
      console.error('Error rejecting listing:', error);
      toast({
        title: 'Error',
        description: 'Failed to reject listing.',
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleVerifyDocument = async (entityType: 'listing' | 'order', entityId: string, documentId: string, status: 'verified' | 'rejected') => {
    if (!user) return;
    
    if (status === 'rejected' && !docRejectionReason.trim()) {
      toast({
        title: 'Error',
        description: 'Please provide a rejection reason.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setProcessingId(documentId);
      
      const token = await user.getIdToken();
      const response = await fetch(
        `/api/admin/${entityType}s/${entityId}/documents/verify`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            documentId,
            status,
            rejectionReason: status === 'rejected' ? docRejectionReason : undefined,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to verify document');
      }

      toast({
        title: `Document ${status === 'verified' ? 'Verified' : 'Rejected'}`,
        description: `The document has been ${status === 'verified' ? 'verified' : 'rejected'}.`,
      });

      if (entityType === 'listing') {
        await loadListingDocuments(entityId);
        // If TPWD permit verified, auto-approve listing
        if (status === 'verified' && selectedDoc?.type === 'TPWD_BREEDER_PERMIT') {
          await handleApproveListing(entityId);
        }
      } else {
        await loadOrderDocuments(entityId);
      }

      setVerifyDocDialogOpen(false);
      setSelectedDoc(null);
      setDocRejectionReason('');
    } catch (error: any) {
      console.error('Error verifying document:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to verify document.',
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const openReviewDialog = async (listing: Listing) => {
    setSelectedListing(listing);
    await loadListingDocuments(listing.id);
    setReviewDialogOpen(true);
  };

  const openOrderReview = async (order: Order) => {
    setSelectedOrder(order);
    await loadOrderDocuments(order.id);
    setReviewDialogOpen(true);
  };

  const openDocVerifyDialog = (doc: ComplianceDocument) => {
    setSelectedDoc(doc);
    setVerifyDocDialogOpen(true);
  };

  const filteredListings = useMemo(() => {
    if (!searchQuery) return listings;
    const query = searchQuery.toLowerCase();
    return listings.filter(listing =>
      listing.title.toLowerCase().includes(query) ||
      listing.description?.toLowerCase().includes(query) ||
      listing.location.city.toLowerCase().includes(query)
    );
  }, [listings, searchQuery]);

  const filteredOrders = useMemo(() => {
    if (!searchQuery) return orders;
    const query = searchQuery.toLowerCase();
    return orders.filter(order =>
      order.id.toLowerCase().includes(query) ||
      order.listingId.toLowerCase().includes(query)
    );
  }, [orders, searchQuery]);

  if (adminLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
              <p className="text-muted-foreground">You don't have permission to access this page.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Compliance</h1>
        <p className="text-muted-foreground">
          Manage compliance review queues and payout holds in one place.
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          const next = v as TabType;
          setActiveTab(next);
          // Keep URL in sync so old links can deep-link to a specific queue.
          try {
            router.replace(`/dashboard/admin/compliance?tab=${encodeURIComponent(next)}`);
          } catch {
            // ignore
          }
        }}
      >
        <TabsList>
          <TabsTrigger value="listings">
            Listings ({listings.length})
          </TabsTrigger>
          <TabsTrigger value="orders">
            Orders ({orders.length})
          </TabsTrigger>
          <TabsTrigger value="breeder_permits">
            Breeder Permits ({breederPermits.length})
          </TabsTrigger>
          <TabsTrigger value="payout_holds">
            Payout Holds ({holdRows.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="listings" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search listings..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button onClick={loadPendingListings} variant="outline" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredListings.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Pending Reviews</h3>
                  <p className="text-muted-foreground">All listings have been reviewed.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredListings.map((listing) => (
                <Card key={listing.id} className="border-2">
                  <CardContent className="p-6">
                    <div className="grid md:grid-cols-[200px_1fr_auto] gap-6">
                      <div className="relative w-full h-48 rounded-lg overflow-hidden bg-muted">
                        {listing.images && listing.images.length > 0 ? (
                          <Image
                            src={listing.images[0]}
                            alt={listing.title}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <FileText className="h-12 w-12 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      <div className="space-y-4">
                        <div>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className="text-xl font-bold">{listing.title}</h3>
                            <Badge variant="outline">{listing.category}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                            {listing.description}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-muted-foreground">Location</p>
                              <p className="font-semibold">
                                {listing.location.city}, {listing.location.state}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-muted-foreground">Created</p>
                              <p className="font-semibold">
                                {formatDistanceToNow(toDateSafe((listing as any).createdAt) || new Date(), { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-muted-foreground">Seller</p>
                              <p className="font-semibold text-xs">
                                {listing.sellerSnapshot?.displayName || 'Unknown'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-muted-foreground">Status</p>
                              <p className="font-semibold capitalize">{listing.complianceStatus}</p>
                            </div>
                          </div>
                        </div>

                        {listing.category === 'whitetail_breeder' && (
                          <div className="mt-4 space-y-2">
                            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                              <p className="text-sm font-semibold text-yellow-800 mb-1">
                                TPWD Breeder Permit Required
                              </p>
                              <p className="text-xs text-yellow-700">
                                Verify TPWD Breeder Permit document before approving.
                              </p>
                            </div>

                            {/* Attestation + Permit Expiration (seller-provided) */}
                            <div className="p-3 rounded-lg border bg-card">
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                <div>
                                  <p className="text-muted-foreground">Seller Attestation</p>
                                  <div className="mt-1">
                                    {listing.sellerAttestationAccepted ? (
                                      <Badge className="h-5 px-2">Accepted</Badge>
                                    ) : (
                                      <Badge variant="destructive" className="h-5 px-2">Missing</Badge>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Permit Expiration</p>
                                  <p className="mt-1 font-semibold">
                                    {(() => {
                                      const raw: any = (listing.attributes as any)?.tpwdPermitExpirationDate;
                                      const d: Date | null = raw?.toDate?.() || (raw instanceof Date ? raw : null);
                                      return d ? d.toLocaleDateString() : 'Not provided';
                                    })()}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground">Expiration Status</p>
                                  <div className="mt-1">
                                    {(() => {
                                      const status = getPermitExpirationStatus((listing.attributes as any)?.tpwdPermitExpirationDate);
                                      if (status.daysRemaining === null) {
                                        return <Badge variant="outline" className="h-5 px-2">Unknown</Badge>;
                                      }
                                      if (status.expired) {
                                        return <Badge variant="destructive" className="h-5 px-2">Expired</Badge>;
                                      }
                                      if (status.expiringSoon) {
                                        return <Badge variant="secondary" className="h-5 px-2">Expiring Soon</Badge>;
                                      }
                                      return <Badge variant="outline" className="h-5 px-2">Current</Badge>;
                                    })()}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Internal Admin Flags (guardrails only) */}
                            {(listing.internalFlags?.duplicatePermitNumber || listing.internalFlags?.duplicateFacilityId) && (
                              <div className="p-3 rounded-lg border border-orange-200 bg-orange-50">
                                <p className="text-sm font-semibold text-orange-900 mb-1">Internal Flags</p>
                                <div className="space-y-1 text-xs text-orange-900">
                                  {listing.internalFlags?.duplicatePermitNumber && (
                                    <p>
                                      <span className="font-semibold">Duplicate Permit #:</span>{' '}
                                      {listing.internalFlagsNotes?.duplicatePermitNumber || 'Flagged'}
                                    </p>
                                  )}
                                  {listing.internalFlags?.duplicateFacilityId && (
                                    <p>
                                      <span className="font-semibold">Duplicate Facility ID:</span>{' '}
                                      {listing.internalFlagsNotes?.duplicateFacilityId || 'Flagged'}
                                    </p>
                                  )}
                                </div>
                                <p className="text-[11px] text-orange-800 mt-2">
                                  Flags do not block approval automatically. Review for suspicious reuse.
                                </p>
                              </div>
                            )}
                            
                            {/* Document Status */}
                            {listingDocsMap[listing.id] && listingDocsMap[listing.id].length > 0 ? (
                              <div className="space-y-2">
                                {listingDocsMap[listing.id].map((doc) => (
                                  <div
                                    key={doc.id}
                                    className={`p-2 rounded border text-xs ${
                                      doc.status === 'verified'
                                        ? 'bg-green-50 border-green-300 text-green-800'
                                        : doc.status === 'rejected'
                                        ? 'bg-red-50 border-red-300 text-red-800'
                                        : 'bg-yellow-50 border-yellow-300 text-yellow-800'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <FileText className="h-3 w-3" />
                                        <span className="font-medium">{doc.type}</span>
                                        <Badge
                                          variant={
                                            doc.status === 'verified'
                                              ? 'default'
                                              : doc.status === 'rejected'
                                              ? 'destructive'
                                              : 'secondary'
                                          }
                                          className="text-xs h-4 px-1"
                                        >
                                          {doc.status}
                                        </Badge>
                                      </div>
                                      {doc.permitNumber && (
                                        <span className="font-mono text-xs">
                                          #{doc.permitNumber}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="p-2 rounded border border-red-300 bg-red-50 text-red-800 text-xs">
                                <div className="flex items-center gap-2">
                                  <AlertCircle className="h-3 w-3" />
                                  <span>No documents uploaded yet</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 min-w-[200px]">
                        <Link href={`/listing/${listing.id}`} target="_blank">
                          <Button variant="outline" className="w-full" size="sm">
                            <Eye className="mr-2 h-4 w-4" />
                            Preview
                          </Button>
                        </Link>
                        <Button
                          onClick={() => openReviewDialog(listing)}
                          className="w-full"
                          size="sm"
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          Review
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search orders..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button onClick={loadPendingOrders} variant="outline" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Pending Orders</h3>
                  <p className="text-muted-foreground">All transfer approvals have been reviewed.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredOrders.map((order) => (
                <Card key={order.id} className="border-2">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold">Order #{order.id.slice(0, 8)}</h3>
                          <Badge variant="outline">Whitetail Breeder</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Amount: {formatCurrency(order.amount)} | Status: {order.status}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Transfer Permit Status: {order.transferPermitStatus || 'none'}
                        </p>
                      </div>
                      <Button
                        onClick={() => openOrderReview(order)}
                        size="sm"
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Review Transfer Approval
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="breeder_permits" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <div className="font-semibold">TPWD Breeder Permits</div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Seller-submitted TPWD breeder permits. Approving applies a public trust badge (marketplace workflow).
                  </div>
                </div>
                <Button onClick={loadBreederPermits} variant="outline" disabled={loading || !user}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : breederPermits.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Pending Permits</h3>
                  <p className="text-muted-foreground">All breeder permits have been reviewed.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {breederPermits.map((p) => (
                <Card key={p.sellerId} className="border-2">
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-semibold">Seller</div>
                          <Link href={`/dashboard/admin/users/${p.sellerId}`} className="font-mono text-xs text-primary hover:underline">
                            {p.sellerId}
                          </Link>
                          <Badge variant="outline" className="capitalize">
                            {p.status === 'pending' ? 'Pending review' : p.status}
                          </Badge>
                        </div>
                        {p.permitNumber ? (
                          <div className="text-sm text-muted-foreground">
                            Permit #: <span className="font-mono">{p.permitNumber}</span>
                          </div>
                        ) : null}
                        {p.uploadedAt ? (
                          <div className="text-xs text-muted-foreground">
                            Submitted: {new Date(p.uploadedAt).toLocaleString()}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          disabled={!p.documentUrl}
                          onClick={() => {
                            setSelectedPermit(p);
                            setPermitRejectionReason('');
                            setPermitDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Review
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Dialog open={permitDialogOpen} onOpenChange={setPermitDialogOpen}>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Breeder Permit Review</DialogTitle>
                <DialogDescription>
                  Approving adds the “TPWD breeder permit” trust badge to the seller’s public profile and listing cards.
                </DialogDescription>
              </DialogHeader>

              {selectedPermit ? (
                <div className="space-y-4">
                  <div className="text-sm">
                    Seller:{' '}
                    <Link href={`/dashboard/admin/users/${selectedPermit.sellerId}`} className="font-mono text-primary hover:underline">
                      {selectedPermit.sellerId}
                    </Link>
                  </div>

                  {selectedPermit.documentUrl ? (
                    <div className="rounded-lg border overflow-hidden bg-background">
                      <iframe title="Breeder permit document" src={selectedPermit.documentUrl} className="w-full h-[60vh]" />
                    </div>
                  ) : (
                    <div className="rounded-lg border bg-muted/20 p-6 text-sm text-muted-foreground">No document URL on file.</div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="permit-reject-reason">Rejection reason (required if rejecting)</Label>
                    <Textarea
                      id="permit-reject-reason"
                      value={permitRejectionReason}
                      onChange={(e) => setPermitRejectionReason(e.target.value)}
                      rows={3}
                      placeholder="Explain what is missing/invalid and what the seller should upload instead."
                    />
                  </div>
                </div>
              ) : null}

              <DialogFooter className="flex items-center justify-between sm:justify-between">
                <Button variant="outline" onClick={() => setPermitDialogOpen(false)}>
                  Close
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="destructive"
                    disabled={!selectedPermit || processingId === selectedPermit?.sellerId}
                    onClick={async () => {
                      if (!user || !selectedPermit) return;
                      if (!permitRejectionReason.trim()) {
                        toast({
                          title: 'Rejection reason required',
                          description: 'Please provide a reason when rejecting a permit.',
                          variant: 'destructive',
                        });
                        return;
                      }
                      try {
                        setProcessingId(selectedPermit.sellerId);
                        const token = await user.getIdToken();
                        const res = await fetch(`/api/admin/breeder-permits/${selectedPermit.sellerId}/review`, {
                          method: 'POST',
                          headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ status: 'rejected', rejectionReason: permitRejectionReason.trim() }),
                        });
                        const j = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(j?.error || j?.message || 'Failed to reject permit');
                        toast({ title: 'Rejected', description: 'Breeder permit rejected.' });
                        setPermitDialogOpen(false);
                        await loadBreederPermits();
                      } catch (e: any) {
                        toast({ title: 'Error', description: e?.message || 'Failed to reject permit', variant: 'destructive' });
                      } finally {
                        setProcessingId(null);
                      }
                    }}
                  >
                    {processingId === selectedPermit?.sellerId ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Reject
                  </Button>
                  <Button
                    variant="default"
                    disabled={!selectedPermit || processingId === selectedPermit?.sellerId}
                    onClick={async () => {
                      if (!user || !selectedPermit) return;
                      try {
                        setProcessingId(selectedPermit.sellerId);
                        const token = await user.getIdToken();
                        const res = await fetch(`/api/admin/breeder-permits/${selectedPermit.sellerId}/review`, {
                          method: 'POST',
                          headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ status: 'verified' }),
                        });
                        const j = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(j?.error || j?.message || 'Failed to approve permit');
                        toast({ title: 'Approved', description: 'Breeder permit verified. Badge applied.' });
                        setPermitDialogOpen(false);
                        await loadBreederPermits();
                      } catch (e: any) {
                        toast({ title: 'Error', description: e?.message || 'Failed to approve permit', variant: 'destructive' });
                      } finally {
                        setProcessingId(null);
                      }
                    }}
                  >
                    {processingId === selectedPermit?.sellerId ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Approve
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="payout_holds" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-primary" />
                Compliance payout holds
              </CardTitle>
              <CardDescription>
                Orders blocked for marketplace compliance reasons (docs missing or admin approval required).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <div className="text-sm text-muted-foreground">{holdRows.length} order(s)</div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={loadComplianceHolds} disabled={loading}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Refresh
                  </Button>
                  <Button asChild variant="secondary">
                    <Link href="/dashboard/admin/ops">Open Admin Ops</Link>
                  </Button>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground py-6">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : holdRows.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6">No compliance payout holds found.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Listing</TableHead>
                      <TableHead>Hold reason</TableHead>
                      <TableHead>Missing</TableHead>
                      <TableHead>Approval</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {holdRows.map((o) => {
                      const title = o.listingSnapshot?.title || o.listingId || '—';
                      const missing = o.complianceDocsStatus?.missing || [];
                      const reason = String(o.payoutHoldReason || '—');
                      const canApprove = REVIEW_REQUIRED.has(reason) && o.adminPayoutApproval !== true;
                      return (
                        <TableRow key={o.id}>
                          <TableCell className="font-mono text-xs">{o.id}</TableCell>
                          <TableCell className="max-w-[360px]">
                            <div className="truncate">{title}</div>
                            <div className="text-xs text-muted-foreground truncate">{o.listingSnapshot?.category || ''}</div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{reason}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {missing.length > 0 ? missing.join(', ') : '—'}
                          </TableCell>
                          <TableCell>
                            {o.adminPayoutApproval ? (
                              <Badge className="bg-emerald-600 text-white">Approved</Badge>
                            ) : (
                              <Badge variant="outline">Not approved</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {canApprove ? (
                              <Button size="sm" onClick={() => approveHold(o.id)} disabled={!!approvingHold[o.id]}>
                                {approvingHold[o.id] ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                Approve payout
                              </Button>
                            ) : (
                              <Button size="sm" variant="outline" asChild>
                                <Link href="/dashboard/admin/ops">View</Link>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Review {activeTab === 'listings' ? 'Listing' : 'Order'} Compliance
            </DialogTitle>
            <DialogDescription>
              {activeTab === 'listings' 
                ? 'Review listing compliance and verify required documents.'
                : 'Review TPWD transfer approval document for whitetail breeder order.'}
            </DialogDescription>
          </DialogHeader>

          {activeTab === 'listings' && selectedListing && (
            <div className="space-y-6">
              <Card className="border bg-card">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-base">Listing Details</CardTitle>
                      <CardDescription className="mt-1">
                        Verify required info + documents before approving
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">{selectedListing.category}</Badge>
                      <Badge variant="secondary" className="capitalize">{selectedListing.type}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Title</span>
                      <p className="font-medium">{selectedListing.title}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Location</span>
                      <p className="font-medium">
                        {selectedListing.location.city}, {selectedListing.location.state}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold">Required Documents</h4>
                  <Badge variant="outline" className="text-xs">
                    {listingDocs.length} uploaded
                  </Badge>
                </div>
                {listingDocs.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No documents uploaded yet. Seller must upload required documents.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-3">
                    {listingDocs.map((doc) => {
                      const attrs = selectedListing?.attributes as any;
                      const permitMatches = doc.type === 'TPWD_BREEDER_PERMIT' && 
                        doc.permitNumber && 
                        attrs?.tpwdBreederPermitNumber &&
                        doc.permitNumber.trim() === attrs.tpwdBreederPermitNumber.trim();
                      
                      return (
                        <Card
                          key={doc.id}
                          className={`p-4 border ${
                            doc.status === 'verified'
                              ? 'border-primary/30 bg-primary/5'
                              : doc.status === 'rejected'
                              ? 'border-destructive/30 bg-destructive/5'
                              : 'border-accent/30 bg-accent/5'
                          }`}
                        >
                          <div className="space-y-3">
                            <div className="flex items-start justify-between">
                              <div className="flex items-start gap-3 flex-1">
                                <FileText
                                  className={`h-6 w-6 mt-1 ${
                                    doc.status === 'verified'
                                      ? 'text-primary'
                                      : doc.status === 'rejected'
                                      ? 'text-destructive'
                                      : 'text-accent'
                                  }`}
                                />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <p className="font-semibold">{String(doc.type).replace(/_/g, ' ')}</p>
                                    <Badge variant={doc.status === 'verified' ? 'default' : doc.status === 'rejected' ? 'destructive' : 'secondary'}>
                                      {doc.status}
                                    </Badge>
                                  </div>
                                  {doc.permitNumber && (
                                    <div className="space-y-1">
                                      <p className="text-sm text-muted-foreground">
                                        Document Permit #: <span className="font-mono font-medium">{doc.permitNumber}</span>
                                      </p>
                                      {doc.type === 'TPWD_BREEDER_PERMIT' && attrs?.tpwdBreederPermitNumber && (
                                        <div className="flex items-center gap-2">
                                          <p className="text-sm text-muted-foreground">
                                            Listing Permit #: <span className="font-mono font-medium">{attrs.tpwdBreederPermitNumber}</span>
                                          </p>
                                          {permitMatches ? (
                                            <Badge variant="default" className="text-xs">✓ Match</Badge>
                                          ) : (
                                            <Badge variant="destructive" className="text-xs">✗ Mismatch</Badge>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {doc.uploadedAt && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Uploaded: {format(new Date(doc.uploadedAt), 'MMM d, yyyy h:mm a')}
                                    </p>
                                  )}
                                  {doc.verifiedAt && doc.verifiedBy && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      Verified: {format(new Date(doc.verifiedAt), 'MMM d, yyyy h:mm a')}
                                    </p>
                                  )}
                                  {doc.rejectionReason && (
                                    <Alert className="mt-2 border-destructive/30 bg-destructive/5">
                                      <AlertCircle className="h-4 w-4 text-destructive" />
                                      <AlertDescription className="text-foreground text-xs">
                                        Rejection reason: {doc.rejectionReason}
                                      </AlertDescription>
                                    </Alert>
                                  )}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex gap-2 flex-wrap">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setViewingDocUrl(doc.documentUrl)}
                                className="flex-1 sm:flex-none"
                              >
                                <Eye className="h-4 w-4 mr-1" />
                                View Document
                              </Button>
                              {doc.status !== 'verified' && doc.status !== 'rejected' && (
                                <>
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => {
                                      setQuickVerifyDocId(doc.id);
                                      handleVerifyDocument('listing', selectedListing!.id, doc.id, 'verified');
                                    }}
                                    disabled={processingId === doc.id}
                                    className="flex-1 sm:flex-none"
                                  >
                                    {processingId === doc.id ? (
                                      <>
                                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                        Verifying...
                                      </>
                                    ) : (
                                      <>
                                        <CheckCircle className="h-4 w-4 mr-1" />
                                        Quick Verify
                                      </>
                                    )}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => openDocVerifyDialog(doc)}
                                    className="flex-1 sm:flex-none"
                                  >
                                    Review & Verify
                                  </Button>
                                </>
                              )}
                              {doc.status === 'rejected' && (
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => {
                                    setQuickVerifyDocId(doc.id);
                                    handleVerifyDocument('listing', selectedListing!.id, doc.id, 'verified');
                                  }}
                                  disabled={processingId === doc.id}
                                  className="flex-1 sm:flex-none"
                                >
                                  {processingId === doc.id ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                      Verifying...
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle className="h-4 w-4 mr-1" />
                                      Re-verify
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="rejection-reason">Rejection Reason (Required for rejection)</Label>
                <Textarea
                  id="rejection-reason"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explain why this listing is being rejected..."
                  className="mt-2"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReviewDialogOpen(false)}
                  disabled={processingId === selectedListing.id}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={() => handleRejectListing(selectedListing.id)}
                  variant="destructive"
                  disabled={processingId === selectedListing.id || !rejectionReason.trim()}
                >
                  {processingId === selectedListing.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Rejecting...
                    </>
                  ) : (
                    <>
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  onClick={() => handleApproveListing(selectedListing.id)}
                  disabled={processingId === selectedListing.id}
                >
                  {processingId === selectedListing.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Approving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Approve
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'orders' && selectedOrder && (
            <div className="space-y-6">
              <div>
                <h4 className="font-semibold mb-2">Order Details</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Order ID:</span>
                    <p className="font-medium font-mono">{selectedOrder.id}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Amount:</span>
                    <p className="font-medium">{formatCurrency(selectedOrder.amount)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>
                    <p className="font-medium capitalize">{selectedOrder.status}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Transfer Permit Status:</span>
                    <p className="font-medium capitalize">{selectedOrder.transferPermitStatus || 'none'}</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">TPWD Transfer Approval Documents</h4>
                {orderDocs.length === 0 ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No transfer approval documents uploaded yet. Seller must upload TPWD transfer approval.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-3">
                    {orderDocs.map((doc) => (
                      <Card key={doc.id} className={`p-4 ${doc.status === 'verified' ? 'border-green-500 bg-green-50/50' : doc.status === 'rejected' ? 'border-red-500 bg-red-50/50' : 'border-yellow-500 bg-yellow-50/50'}`}>
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3 flex-1">
                              <FileText className={`h-6 w-6 mt-1 ${doc.status === 'verified' ? 'text-green-600' : doc.status === 'rejected' ? 'text-red-600' : 'text-yellow-600'}`} />
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-semibold">{doc.type}</p>
                                  <Badge variant={doc.status === 'verified' ? 'default' : doc.status === 'rejected' ? 'destructive' : 'secondary'}>
                                    {doc.status}
                                  </Badge>
                                </div>
                                {doc.permitNumber && (
                                  <p className="text-sm text-muted-foreground">
                                    Permit #: <span className="font-mono font-medium">{doc.permitNumber}</span>
                                  </p>
                                )}
                                {doc.uploadedAt && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Uploaded: {format(new Date(doc.uploadedAt), 'MMM d, yyyy h:mm a')}
                                  </p>
                                )}
                                {doc.verifiedAt && doc.verifiedBy && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Verified: {format(new Date(doc.verifiedAt), 'MMM d, yyyy h:mm a')}
                                  </p>
                                )}
                                {doc.rejectionReason && (
                                  <Alert className="mt-2 bg-red-50 border-red-200">
                                    <AlertCircle className="h-4 w-4 text-red-600" />
                                    <AlertDescription className="text-red-800 text-xs">
                                      Rejection reason: {doc.rejectionReason}
                                    </AlertDescription>
                                  </Alert>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setViewingDocUrl(doc.documentUrl)}
                              className="flex-1 sm:flex-none"
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View Document
                            </Button>
                            {doc.status !== 'verified' && doc.status !== 'rejected' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setQuickVerifyDocId(doc.id);
                                    handleVerifyDocument('order', selectedOrder!.id, doc.id, 'verified');
                                  }}
                                  disabled={processingId === doc.id}
                                  className="flex-1 sm:flex-none bg-green-50 hover:bg-green-100 border-green-300"
                                >
                                  {processingId === doc.id ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                      Verifying...
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle className="h-4 w-4 mr-1" />
                                      Quick Verify
                                    </>
                                  )}
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openDocVerifyDialog(doc)}
                                  className="flex-1 sm:flex-none"
                                >
                                  Review & Verify
                                </Button>
                              </>
                            )}
                            {doc.status === 'rejected' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setQuickVerifyDocId(doc.id);
                                  handleVerifyDocument('order', selectedOrder!.id, doc.id, 'verified');
                                }}
                                disabled={processingId === doc.id}
                                className="flex-1 sm:flex-none bg-green-50 hover:bg-green-100 border-green-300"
                              >
                                {processingId === doc.id ? (
                                  <>
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    Verifying...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="h-4 w-4 mr-1" />
                                    Re-verify
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Document Verify Dialog */}
      <Dialog open={verifyDocDialogOpen} onOpenChange={setVerifyDocDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review & Verify Document</DialogTitle>
            <DialogDescription>
              Review the document details and verify or reject it.
            </DialogDescription>
          </DialogHeader>

          {selectedDoc && (
            <div className="space-y-6">
              {/* Document Viewer */}
              <div className="border rounded-lg overflow-hidden bg-muted">
                <div className="bg-muted/50 p-2 flex items-center justify-between border-b">
                  <span className="text-sm font-medium">{selectedDoc.type}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(selectedDoc.documentUrl, '_blank')}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Open in New Tab
                  </Button>
                </div>
                <div className="h-[500px] w-full">
                  <iframe
                    src={selectedDoc.documentUrl}
                    className="w-full h-full"
                    title="Document Viewer"
                  />
                </div>
              </div>

              {/* Document Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Document Type</Label>
                  <p className="font-medium">{selectedDoc.type}</p>
                </div>
                {selectedDoc.permitNumber && (
                  <div>
                    <Label>Permit Number</Label>
                    <p className="font-medium font-mono">{selectedDoc.permitNumber}</p>
                  </div>
                )}
                {selectedDoc.uploadedAt && (
                  <div>
                    <Label>Uploaded</Label>
                    <p className="font-medium text-sm">
                      {format(new Date(selectedDoc.uploadedAt), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                )}
                {selectedDoc.status && (
                  <div>
                    <Label>Current Status</Label>
                    <Badge variant={selectedDoc.status === 'verified' ? 'default' : selectedDoc.status === 'rejected' ? 'destructive' : 'secondary'}>
                      {selectedDoc.status}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Permit Number Comparison for TPWD Breeder Permit */}
              {selectedDoc.type === 'TPWD_BREEDER_PERMIT' && activeTab === 'listings' && selectedListing && (
                <Alert className="bg-blue-50 border-blue-200">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800">
                    <div className="space-y-1">
                      <p className="font-semibold">Permit Number Verification:</p>
                      <p className="text-sm">
                        Document: <span className="font-mono">{selectedDoc.permitNumber || 'Not provided'}</span>
                      </p>
                      <p className="text-sm">
                        Listing: <span className="font-mono">{(selectedListing.attributes as any)?.tpwdBreederPermitNumber || 'Not provided'}</span>
                      </p>
                      {selectedDoc.permitNumber && (selectedListing.attributes as any)?.tpwdBreederPermitNumber && (
                        <p className={`text-sm font-semibold mt-2 ${
                          selectedDoc.permitNumber.trim() === (selectedListing.attributes as any).tpwdBreederPermitNumber.trim()
                            ? 'text-green-700'
                            : 'text-red-700'
                        }`}>
                          {selectedDoc.permitNumber.trim() === (selectedListing.attributes as any).tpwdBreederPermitNumber.trim()
                            ? '✓ Permit numbers match'
                            : '⚠ Permit numbers do not match - please verify'}
                        </p>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Rejection Reason */}
              <div>
                <Label htmlFor="doc-rejection-reason">Rejection Reason (Required if rejecting)</Label>
                <Textarea
                  id="doc-rejection-reason"
                  value={docRejectionReason}
                  onChange={(e) => setDocRejectionReason(e.target.value)}
                  placeholder="Explain why this document is being rejected (e.g., expired permit, incorrect permit number, poor image quality, etc.)..."
                  className="mt-2 min-h-[100px]"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setVerifyDocDialogOpen(false);
                    setSelectedDoc(null);
                    setDocRejectionReason('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => handleVerifyDocument(
                    activeTab === 'listings' ? 'listing' : 'order',
                    activeTab === 'listings' ? selectedListing!.id : selectedOrder!.id,
                    selectedDoc.id,
                    'rejected'
                  )}
                  disabled={processingId === selectedDoc.id || !docRejectionReason.trim()}
                >
                  {processingId === selectedDoc.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Rejecting...
                    </>
                  ) : (
                    <>
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject Document
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => handleVerifyDocument(
                    activeTab === 'listings' ? 'listing' : 'order',
                    activeTab === 'listings' ? selectedListing!.id : selectedOrder!.id,
                    selectedDoc.id,
                    'verified'
                  )}
                  disabled={processingId === selectedDoc.id}
                >
                  {processingId === selectedDoc.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Verify Document
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Document Viewer Dialog */}
      <Dialog open={!!viewingDocUrl} onOpenChange={(open) => !open && setViewingDocUrl(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Document Viewer</DialogTitle>
            <DialogDescription>
              Review the document before making a decision
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {viewingDocUrl && (
              <iframe
                src={viewingDocUrl}
                className="w-full h-full min-h-[600px] border rounded"
                title="Document Viewer"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => window.open(viewingDocUrl!, '_blank')}>
              Open in New Tab
            </Button>
            <Button onClick={() => setViewingDocUrl(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
