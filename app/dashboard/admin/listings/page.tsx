'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DashboardContentSkeleton } from '@/components/skeletons/DashboardContentSkeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  CheckCircle, 
  XCircle, 
  Package, 
  Loader2, 
  AlertCircle,
  Search,
  Filter,
  Clock,
  MapPin,
  DollarSign,
  Eye,
  ExternalLink,
  TrendingUp,
  Calendar,
  Shield,
  FileText,
  CheckCircle2,
  X,
  AlertTriangle,
  Copy,
  Sparkles,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { collection, query, where, getDocs, getDoc, updateDoc, doc, Timestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Listing, ListingStatus } from '@/lib/types';
import { User } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { formatCurrency } from '@/lib/utils';
import { AIAdminSummary } from '@/components/admin/AIAdminSummary';
import { Switch } from '@/components/ui/switch';

type FilterType = 'all' | 'pending' | 'compliance' | 'ai_approved' | 'all_approved' | 'manually_approved';
type SortType = 'newest' | 'oldest' | 'price-high' | 'price-low' | 'approved-date';

function toDateSafe(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') {
    try {
      const d = value.toDate();
      if (d instanceof Date) return d;
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
}

function toMillisSafe(value: any): number {
  const d = toDateSafe(value);
  return d ? d.getTime() : 0;
}

export default function AdminListingsPage() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const [listings, setListings] = useState<Listing[]>([]);
  const [listingDocsMap, setListingDocsMap] = useState<Record<string, any[]>>({});
  const [sellerProfilesMap, setSellerProfilesMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortType, setSortType] = useState<SortType>('newest');
  const [aiApprovedListings, setAiApprovedListings] = useState<Listing[]>([]);
  const [allApprovedListings, setAllApprovedListings] = useState<Listing[]>([]);
  const [modConfig, setModConfig] = useState<{ aiAutoApproveEnabled: boolean; minTextConfidence?: number; maxRiskScore?: number; updatedAt?: number; updatedBy?: string } | null>(null);
  const [modConfigToggling, setModConfigToggling] = useState(false);
  const [viewingDocUrl, setViewingDocUrl] = useState<string | null>(null);
  const [viewingDocTitle, setViewingDocTitle] = useState<string>('Document');

  const searchParams = useSearchParams();
  const sellerIdFilter = searchParams?.get('sellerId')?.trim() || null;

  // Reject dialog state
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectListingId, setRejectListingId] = useState<string | null>(null);
  const [rejectReasonKey, setRejectReasonKey] = useState<string>('');
  const [rejectCustomNote, setRejectCustomNote] = useState<string>('');

  const rejectReasonOptions = useMemo(
    () =>
      [
        { key: 'missing_required_info', label: 'Missing required information (title/description/location/photos)' },
        { key: 'poor_photo_quality', label: 'Poor photo quality / insufficient photos' },
        { key: 'pricing_issue', label: 'Pricing issue (missing/invalid/unreasonable)' },
        { key: 'category_mismatch', label: 'Wrong category / incorrect attributes' },
        { key: 'policy_prohibited', label: 'Prohibited item / policy violation' },
        { key: 'suspected_scam', label: 'Suspected scam / misleading listing' },
        { key: 'compliance_required', label: 'Compliance documents required / not verifiable' },
        { key: 'duplicate_listing', label: 'Duplicate listing' },
        { key: 'other', label: 'Other (add a note)' },
      ] as const,
    []
  );

  const loadPendingListings = useCallback(async () => {
    try {
      setLoading(true);
      const listingsRef = collection(db, 'listings');
      
      // Only get listings that have been submitted/published by users:
      // 1. Status is 'pending' (submitted for approval)
      // 2. OR complianceStatus is 'pending_review' (submitted for compliance review)
      // EXCLUDE 'draft' status - those haven't been submitted yet
      const q = query(
        listingsRef,
        where('status', '==', 'pending'),
        orderBy('createdAt', 'desc')
      );
      
      const snapshot = await getDocs(q);
      const pendingListings: Listing[] = [];
      
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const listing = {
          id: docSnap.id,
          ...data,
          createdAt: toDateSafe(data.createdAt) || new Date(),
          updatedAt: toDateSafe(data.updatedAt) || new Date(),
          publishedAt: toDateSafe(data.publishedAt) || undefined,
          endsAt: toDateSafe(data.endsAt) || undefined,
        } as Listing;
        
        pendingListings.push(listing);
      });
      
      // Also get listings with complianceStatus='pending_review' that might not be in the first query
      // Query without orderBy to avoid needing composite index - we'll sort client-side
      const complianceQuery = query(
        listingsRef,
        where('complianceStatus', '==', 'pending_review')
      );
      
      const complianceSnapshot = await getDocs(complianceQuery);
      const existingIds = new Set(pendingListings.map(l => l.id));
      
      complianceSnapshot.forEach((docSnap) => {
        if (!existingIds.has(docSnap.id)) {
          const data = docSnap.data();
          // Only include if status is 'pending' (submitted), not 'draft'
          if (data.status === 'pending') {
            pendingListings.push({
              id: docSnap.id,
              ...data,
              createdAt: toDateSafe(data.createdAt) || new Date(),
              updatedAt: toDateSafe(data.updatedAt) || new Date(),
              publishedAt: toDateSafe(data.publishedAt) || undefined,
              endsAt: toDateSafe(data.endsAt) || undefined,
            } as Listing);
          }
        }
      });
      
      // Sort all listings by createdAt descending (newest first)
      pendingListings.sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt));
      
      // Load documents for each listing
      const { getDocuments } = await import('@/lib/firebase/documents');
      const docsMap: Record<string, any[]> = {};
      
      await Promise.all(
        pendingListings.map(async (listing) => {
          try {
            const docs = await getDocuments('listing', listing.id);
            docsMap[listing.id] = docs;
          } catch (error) {
            console.error(`Error loading documents for listing ${listing.id}:`, error);
            docsMap[listing.id] = [];
          }
        })
      );
      
      // Load seller profiles for each listing
      const profilesMap: Record<string, any> = {};
      await Promise.all(
        pendingListings.map(async (listing) => {
          try {
            if (listing.sellerId) {
              const sellerDoc = await getDoc(doc(db, 'users', listing.sellerId));
              if (sellerDoc.exists()) {
                profilesMap[listing.sellerId] = sellerDoc.data();
              }
            }
          } catch (error) {
            console.error(`Error loading seller profile for listing ${listing.id}:`, error);
          }
        })
      );
      
      setListings(pendingListings);
      setListingDocsMap(docsMap);
      setSellerProfilesMap(profilesMap);
    } catch (error) {
      console.error('Error loading pending listings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load pending listings.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadAIApprovedListings = useCallback(async () => {
    try {
      setLoading(true);
      const listingsRef = collection(db, 'listings');
      let list: Listing[] = [];
      try {
        const q = query(
          listingsRef,
          where('status', '==', 'active'),
          where('aiModeration.decision', '==', 'auto_approved'),
          orderBy('createdAt', 'desc'),
          limit(100)
        );
        const snapshot = await getDocs(q);
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            ...data,
            createdAt: toDateSafe(data.createdAt) || new Date(),
            updatedAt: toDateSafe(data.updatedAt) || new Date(),
          } as Listing);
        });
      } catch (idxErr: any) {
        const msg = String(idxErr?.message || '');
        if (msg.includes('index') || msg.includes('FAILED_PRECONDITION')) {
          const fallbackQuery = query(
            listingsRef,
            where('status', '==', 'active'),
            orderBy('createdAt', 'desc'),
            limit(500)
          );
          const fallbackSnap = await getDocs(fallbackQuery);
          fallbackSnap.forEach((docSnap) => {
            const data = docSnap.data();
            if ((data as any)?.aiModeration?.decision === 'auto_approved') {
              list.push({
                id: docSnap.id,
                ...data,
                createdAt: toDateSafe(data.createdAt) || new Date(),
                updatedAt: toDateSafe(data.updatedAt) || new Date(),
              } as Listing);
            }
          });
        } else {
          throw idxErr;
        }
      }
      setAiApprovedListings(list);
    } catch (e) {
      console.error('Error loading AI-approved listings:', e);
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to load', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadAllApprovedListings = useCallback(async () => {
    try {
      setLoading(true);
      const listingsRef = collection(db, 'listings');
      const q = query(
        listingsRef,
        where('status', '==', 'active'),
        orderBy('publishedAt', 'desc'),
        limit(200)
      );
      let list: Listing[] = [];
      try {
        const snapshot = await getDocs(q);
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            ...data,
            createdAt: toDateSafe(data.createdAt) || new Date(),
            updatedAt: toDateSafe(data.updatedAt) || new Date(),
          } as Listing);
        });
      } catch (idxErr: any) {
        const msg = String(idxErr?.message || '');
        if (msg.includes('index') || msg.includes('FAILED_PRECONDITION')) {
          const fallback = query(
            listingsRef,
            where('status', '==', 'active'),
            orderBy('createdAt', 'desc'),
            limit(300)
          );
          const fallbackSnap = await getDocs(fallback);
          fallbackSnap.forEach((docSnap) => {
            const data = docSnap.data();
            list.push({
              id: docSnap.id,
              ...data,
              createdAt: toDateSafe(data.createdAt) || new Date(),
              updatedAt: toDateSafe(data.updatedAt) || new Date(),
            } as Listing);
          });
          list.sort((a, b) => toMillisSafe((b as any).publishedAt) - toMillisSafe((a as any).publishedAt));
        } else {
          throw idxErr;
        }
      }
      setAllApprovedListings(list);
    } catch (e) {
      console.error('Error loading approved listings:', e);
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to load', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadModConfig = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/listing-moderation-config', { headers: { authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.config) setModConfig(data.config);
    } catch {
      setModConfig(null);
    }
  }, [user]);

  useEffect(() => {
    if (!adminLoading && isAdmin) {
      loadPendingListings();
      loadModConfig();
    }
  }, [adminLoading, isAdmin, loadPendingListings, loadModConfig]);

  useEffect(() => {
    if (!isAdmin) return;
    if (filterType === 'ai_approved') loadAIApprovedListings();
    else if (filterType === 'all_approved' || filterType === 'manually_approved') loadAllApprovedListings();
  }, [isAdmin, filterType, loadAIApprovedListings, loadAllApprovedListings]);

  const handleApprove = async (listingId: string) => {
    if (!user) return;
    
    try {
      setProcessingId(listingId);

      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/listings/${listingId}/approve`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        throw new Error(data?.message || data?.error || 'Failed to approve listing');
      }
      
      toast({
        title: '✅ Listing Approved',
        description: 'The listing is now live and visible to buyers.',
      });
      
      await loadPendingListings();
    } catch (error) {
      console.error('Error approving listing:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to approve listing.',
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const openRejectDialog = (listingId: string) => {
    setRejectListingId(listingId);
    setRejectReasonKey('');
    setRejectCustomNote('');
    setRejectOpen(true);
  };

  const buildRejectReason = () => {
    const selected = rejectReasonOptions.find((r) => r.key === rejectReasonKey);
    const base = selected?.label || '';
    const note = rejectCustomNote.trim();
    if (rejectReasonKey === 'other') return note || 'Other';
    if (!base) return note || '';
    return note ? `${base} — ${note}` : base;
  };

  const handleTryAIAutoApprove = async (listingId: string) => {
    if (!user) return;
    try {
      setProcessingId(listingId);
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/listings/${listingId}/try-ai-auto-approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (data?.ok) {
        toast({ title: 'Auto-approved', description: 'Listing passed AI check and is now live.' });
        await loadPendingListings();
      } else {
        const reasons = data?.reasons ?? [data?.error ?? 'Did not pass AI auto-approve'];
        toast({
          title: 'AI did not auto-approve',
          description: Array.isArray(reasons) ? reasons[0] : reasons,
          variant: 'destructive',
        });
      }
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed', variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleRevertToPending = async (listingId: string) => {
    if (!user) return;
    try {
      setProcessingId(listingId);
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/listings/${listingId}/revert-to-pending`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) throw new Error(data?.error || 'Failed to revert');
      toast({ title: 'Reverted', description: 'Listing sent back to manual review.' });
      await loadAIApprovedListings();
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to revert', variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (listingId: string, reason: string) => {
    if (!user) return;
    
    try {
      setProcessingId(listingId);

      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/listings/${listingId}/reject`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        throw new Error(data?.message || data?.error || 'Failed to reject listing');
      }
      
      toast({
        title: 'Listing Rejected',
        description: 'The listing has been removed.',
      });
      
      await loadPendingListings();
    } catch (error) {
      console.error('Error rejecting listing:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to reject listing.',
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  // Filter and sort listings
  const filteredAndSortedListings = useMemo(() => {
    let filtered = listings;

    // Filter by status
    if (filterType === 'pending') {
      // "Pending" = submitted listings that do NOT require compliance review.
      // Whitetail breeder listings always require compliance review (even if complianceStatus isn't set on older docs).
      filtered = filtered.filter(
        (listing) =>
          listing.status === 'pending' &&
          listing.complianceStatus !== 'pending_review' &&
          listing.category !== 'whitetail_breeder'
      );
    } else if (filterType === 'compliance') {
      // "Compliance" = listings requiring compliance review.
      // NOTE: whitetail breeder always requires review; some older docs may have complianceStatus unset.
      filtered = filtered.filter(
        (listing) => listing.complianceStatus === 'pending_review' || listing.category === 'whitetail_breeder'
      );
    }
    // 'all' shows everything (no filter)

    // Seller filter (from URL ?sellerId=uid, e.g. from user dossier)
    if (sellerIdFilter) {
      filtered = filtered.filter((listing) => listing.sellerId === sellerIdFilter);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(listing =>
        listing.title.toLowerCase().includes(query) ||
        listing.description?.toLowerCase().includes(query) ||
        listing.location.city.toLowerCase().includes(query) ||
        listing.location.state.toLowerCase().includes(query)
      );
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      switch (sortType) {
        case 'newest':
          return toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt);
        case 'oldest':
          return toMillisSafe(a.createdAt) - toMillisSafe(b.createdAt);
        case 'approved-date':
          return toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt);
        case 'price-high':
          const priceA = a.price || a.startingBid || 0;
          const priceB = b.price || b.startingBid || 0;
          return priceB - priceA;
        case 'price-low':
          const priceALow = a.price || a.startingBid || 0;
          const priceBLow = b.price || b.startingBid || 0;
          return priceALow - priceBLow;
        default:
          return 0;
      }
    });

    return filtered;
  }, [listings, filterType, searchQuery, sortType, sellerIdFilter]);

  const approvedDisplayList = useMemo(() => {
    let list: Listing[] = [];
    if (filterType === 'ai_approved') list = aiApprovedListings;
    else if (filterType === 'all_approved') list = allApprovedListings;
    else if (filterType === 'manually_approved') list = allApprovedListings.filter((l) => (l as any).approvedBy);
    if (list.length === 0) return [];
    if (sellerIdFilter) list = list.filter((l) => l.sellerId === sellerIdFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((l) =>
        l.title?.toLowerCase().includes(q) ||
        l.description?.toLowerCase().includes(q) ||
        l.location?.city?.toLowerCase().includes(q) ||
        l.location?.state?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [filterType, aiApprovedListings, allApprovedListings, sellerIdFilter, searchQuery]);

  const isApprovedView = filterType === 'ai_approved' || filterType === 'all_approved' || filterType === 'manually_approved';
  const displayList = isApprovedView ? approvedDisplayList : filteredAndSortedListings;

  const sortedApprovedList = useMemo(() => {
    if (!isApprovedView) return displayList;
    const list = [...displayList];
    if (sortType === 'approved-date') {
      list.sort((a, b) => {
        const aMs = toMillisSafe((a as any).approvedAt) || toMillisSafe((a as any).aiModeration?.evaluatedAt) || toMillisSafe((a as any).publishedAt) || 0;
        const bMs = toMillisSafe((b as any).approvedAt) || toMillisSafe((b as any).aiModeration?.evaluatedAt) || toMillisSafe((b as any).publishedAt) || 0;
        return bMs - aMs;
      });
    } else if (sortType === 'newest') {
      list.sort((a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt));
    } else if (sortType === 'oldest') {
      list.sort((a, b) => toMillisSafe(a.createdAt) - toMillisSafe(b.createdAt));
    } else if (sortType === 'price-high') {
      list.sort((a, b) => (b.price || b.startingBid || 0) - (a.price || a.startingBid || 0));
    } else if (sortType === 'price-low') {
      list.sort((a, b) => (a.price || a.startingBid || 0) - (b.price || b.startingBid || 0));
    }
    return list;
  }, [displayList, isApprovedView, sortType]);

  const finalDisplayList = isApprovedView ? sortedApprovedList : filteredAndSortedListings;

  // Stats (when sellerId filter is set, show counts for filtered list)
  const stats = useMemo(() => {
    const source = sellerIdFilter ? filteredAndSortedListings : listings;
    const total = source.length;
    const pending = source.filter(l => l.status === 'pending').length;
    const complianceReview = source.filter(l => l.complianceStatus === 'pending_review' || l.category === 'whitetail_breeder').length;
    const totalValue = source.reduce((sum, l) => sum + (l.price || l.startingBid || 0), 0);
    return { total, pending, complianceReview, totalValue };
  }, [listings, sellerIdFilter, filteredAndSortedListings]);

  const approvalStats = useMemo(() => {
    const list = allApprovedListings;
    const ai = list.filter(l => (l as any).aiModeration?.decision === 'auto_approved').length;
    const manual = list.filter(l => (l as any).approvedBy).length;
    const direct = list.filter(l => !(l as any).aiModeration?.decision && !(l as any).approvedBy).length;
    return { ai, manual, direct, total: list.length };
  }, [allApprovedListings]);

  if (adminLoading) {
    return <DashboardContentSkeleton />;
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
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-7xl">
      {/* Header Section */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-1">Approve Listings</h1>
            <p className="text-muted-foreground">
              Review and approve new listings before they go live
            </p>
          </div>
          <Button
            onClick={
              filterType === 'ai_approved' ? loadAIApprovedListings
              : filterType === 'all_approved' || filterType === 'manually_approved' ? loadAllApprovedListings
              : loadPendingListings
            }
            variant="outline"
            disabled={loading}
            size="sm"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Package className="mr-2 h-4 w-4" />
                Refresh
              </>
            )}
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border shadow-warm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Total Pending</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                  <Package className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border shadow-warm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Awaiting Review</p>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-accent/15 dark:bg-accent/10 flex items-center justify-center">
                  <AlertCircle className="h-5 w-5 text-accent" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border shadow-warm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Compliance Review</p>
                  <p className="text-2xl font-bold">{stats.complianceReview}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border shadow-warm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Total Value</p>
                  <p className="text-lg font-bold">{formatCurrency(stats.totalValue)}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-primary/10 dark:bg-primary/20 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* AI Moderation Config */}
        <Card className="border bg-gradient-to-br from-primary/5 to-transparent dark:from-primary/10">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3 min-w-0">
                <div className="h-10 w-10 rounded-lg bg-primary/15 dark:bg-primary/25 flex items-center justify-center shrink-0">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-base">AI Auto-Approve</h3>
                    <Badge
                      variant={modConfig?.aiAutoApproveEnabled ? 'default' : 'secondary'}
                      className="text-xs font-medium"
                    >
                      {modConfig?.aiAutoApproveEnabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Low-risk listings are auto-approved without manual review. Whitetail breeder and unverified sellers always require manual review.
                  </p>
                  {modConfig?.updatedBy && modConfig.updatedBy !== 'system' && modConfig.updatedAt && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Updated {formatDistanceToNow(new Date(modConfig.updatedAt), { addSuffix: true })}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 sm:pl-4">
                {modConfigToggling ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <Switch
                    checked={modConfig?.aiAutoApproveEnabled ?? false}
                    disabled={!user || modConfig === null || modConfigToggling}
                    onCheckedChange={async (checked) => {
                      if (!user || modConfig === null) return;
                      setModConfigToggling(true);
                      try {
                        const token = await user.getIdToken();
                        const res = await fetch('/api/admin/listing-moderation-config', {
                          method: 'PATCH',
                          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
                          body: JSON.stringify({ aiAutoApproveEnabled: checked }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(data?.error || 'Failed');
                        setModConfig(data?.config ?? null);
                        toast({
                          title: checked ? 'AI auto-approve enabled' : 'AI auto-approve disabled',
                          description: checked ? 'Low-risk listings will now auto-publish.' : 'All new listings will require manual review.',
                        });
                      } catch (e) {
                        toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed', variant: 'destructive' });
                      } finally {
                        setModConfigToggling(false);
                      }
                    }}
                  />
                )}
                <span className="text-sm font-medium text-muted-foreground w-12">
                  {modConfig?.aiAutoApproveEnabled ? 'On' : 'Off'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {sellerIdFilter && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              Showing listings for seller: <span className="font-mono font-medium text-foreground">{sellerIdFilter}</span>
            </span>
            <Button variant="ghost" size="sm" className="shrink-0 h-8" asChild>
              <Link href="/dashboard/admin/listings">
                <X className="h-4 w-4 mr-1" />
                Clear filter
              </Link>
            </Button>
          </div>
        )}

        {/* Filters and Search */}
        <Card className="border">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title, description, or location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-10"
                />
              </div>
              <Select value={filterType} onValueChange={(value) => setFilterType(value as FilterType)}>
                <SelectTrigger className="w-full md:w-[160px] h-10">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Pending (All)</SelectItem>
                <SelectItem value="pending">Pending Approval</SelectItem>
                <SelectItem value="compliance">Compliance Review</SelectItem>
                <SelectItem value="ai_approved">AI Approved</SelectItem>
                <SelectItem value="all_approved">All Approved</SelectItem>
                <SelectItem value="manually_approved">Manually Approved</SelectItem>
              </SelectContent>
              </Select>
              <Select value={sortType} onValueChange={(value) => setSortType(value as SortType)}>
                <SelectTrigger className="w-full md:w-[160px] h-10">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="approved-date">Approved Date</SelectItem>
                  <SelectItem value="price-high">Price: High to Low</SelectItem>
                  <SelectItem value="price-low">Price: Low to High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {filterType === 'all_approved' && allApprovedListings.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center rounded-lg border bg-muted/20 px-3 py-2 text-sm">
            <span className="font-medium text-muted-foreground">Approval breakdown:</span>
            <Badge variant="outline" className="border-emerald-500/50 text-emerald-700 dark:text-emerald-400">
              <Sparkles className="h-3 w-3 mr-1" />
              AI: {approvalStats.ai}
            </Badge>
            <Badge variant="outline" className="border-blue-500/50 text-blue-700 dark:text-blue-400">
              <User className="h-3 w-3 mr-1" />
              Manual: {approvalStats.manual}
            </Badge>
            <Badge variant="outline" className="text-muted-foreground">
              Direct: {approvalStats.direct}
            </Badge>
          </div>
        )}
      </div>

      {/* Listings */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : finalDisplayList.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {filterType === 'ai_approved' ? 'No AI-Approved Listings'
                  : filterType === 'all_approved' ? 'No Approved Listings'
                  : filterType === 'manually_approved' ? 'No Manually Approved Listings'
                  : searchQuery || filterType !== 'all' ? 'No matching listings' : 'No Pending Listings'}
              </h3>
              <p className="text-muted-foreground">
                {filterType === 'ai_approved'
                  ? 'No listings have been auto-approved by AI yet.'
                  : filterType === 'all_approved'
                    ? 'Approved listings (AI and manual) will appear here.'
                  : filterType === 'manually_approved'
                    ? 'Listings approved by an admin will appear here.'
                  : searchQuery || filterType !== 'all'
                    ? 'Try adjusting your filters or search query.'
                    : 'All listings have been reviewed.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          <AnimatePresence mode="popLayout">
            {finalDisplayList.map((listing, index) => (
              <motion.div
                key={listing.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.2, delay: index * 0.05 }}
              >
                <Card className={`border-2 transition-all shadow-warm ${
                  listing.complianceStatus === 'pending_review' 
                    ? 'border-accent/40 bg-accent/5 dark:bg-accent/10 hover:border-accent/60' 
                    : 'border-border hover:border-primary/50 hover:shadow-lifted'
                }`}>
                  <CardContent className="p-0">
                    {/* Header Section - Compact */}
                    <div className={`px-5 py-3 border-b ${
                      listing.status === 'pending'
                        ? 'bg-accent/5 dark:bg-accent/10 border-accent/20'
                        : 'bg-muted/20 dark:bg-muted/10 border-border'
                    }`}>
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-base font-bold line-clamp-1">{listing.title}</h3>
                            <Badge 
                              variant="secondary"
                              className="text-xs font-semibold px-2 py-0.5 shrink-0"
                            >
                              {listing.category === 'whitetail_breeder' && 'Whitetail Breeder'}
                              {listing.category === 'wildlife_exotics' && 'Wildlife & Exotics'}
                              {listing.category === 'cattle_livestock' && 'Cattle'}
                              {listing.category === 'farm_animals' && 'Farm Animals'}
                              {listing.category === 'ranch_equipment' && 'Ranch Equipment & Attachments'}
                              {listing.category === 'ranch_vehicles' && 'Ranch Vehicles & Trailers'}
                              {listing.category === 'horse_equestrian' && 'Horse & Equestrian'}
                              {listing.category === 'sporting_working_dogs' && 'Sporting & Working Dogs'}
                              {listing.category === 'hunting_outfitter_assets' && 'Hunting & Outfitter Assets'}
                              {!listing.category && 'Listing'}
                            </Badge>
                            <Badge variant="outline" className="text-xs px-2 py-0.5 shrink-0">
                              {listing.type === 'auction' && 'Auction'}
                              {listing.type === 'fixed' && 'Buy Now'}
                              {listing.type === 'classified' && 'Classified'}
                              {!listing.type && 'Type'}
                            </Badge>
                          </div>
                          
                          {/* Status Row - Compact */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge 
                              variant={listing.status === 'pending' ? 'secondary' : 'default'}
                              className={`text-xs px-2 py-0.5 ${
                                listing.status === 'pending'
                                  ? 'bg-accent/30 text-accent-foreground border-accent/40 font-semibold'
                                  : ''
                              }`}
                            >
                              <Clock className="h-3 w-3 mr-1 inline" />
                              {listing.status === 'pending' ? 'Pending' : listing.status}
                            </Badge>
                            
                            {listing.complianceStatus && listing.complianceStatus !== 'none' && (
                              <Badge 
                                className={`text-xs px-2 py-0.5 ${
                                  listing.complianceStatus === 'approved'
                                    ? 'bg-emerald-600 text-white border-emerald-700/30'
                                    : listing.complianceStatus === 'rejected'
                                      ? 'bg-destructive text-destructive-foreground border-destructive/50'
                                      : listing.complianceStatus === 'pending_review'
                                        ? 'bg-amber-500/15 text-amber-800 border-amber-600/30 dark:text-amber-200'
                                        : 'bg-muted/30 text-foreground border-border/50'
                                }`}
                              >
                                <Shield className="h-3 w-3 mr-1 inline" />
                                {listing.complianceStatus === 'pending_review' ? 'Compliance review' : listing.complianceStatus}
                              </Badge>
                            )}

                            {listing.pendingReason ? (
                              <Badge variant="outline" className="text-xs px-2 py-0.5">
                                {listing.pendingReason === 'admin_approval' ? 'Admin approval' : 'Compliance review'}
                              </Badge>
                            ) : null}
                            {(listing as any).aiModeration && (listing as any).aiModeration.decision !== 'auto_approved' && (
                              <Badge variant="outline" className="text-xs px-2 py-0.5 border-amber-500/50 text-amber-700 dark:text-amber-400" title={(listing as any).aiModeration.reasons?.join?.(' • ') || ''}>
                                <Sparkles className="h-3 w-3 mr-1 inline" />
                                AI: {((listing as any).aiModeration.reasons?.[0]) || (listing as any).aiModeration.decision}
                              </Badge>
                            )}
                            {listing.status === 'active' && (() => {
                              const aiAuto = (listing as any).aiModeration?.decision === 'auto_approved';
                              const manual = !!(listing as any).approvedBy;
                              const approvedAt = toDateSafe((listing as any).approvedAt) || toDateSafe((listing as any).aiModeration?.evaluatedAt) || toDateSafe((listing as any).publishedAt);
                              const label = aiAuto ? 'AI' : manual ? 'Manual' : 'Direct';
                              const sub = aiAuto ? 'auto-approved' : manual ? `by admin` : 'no review';
                              const title = approvedAt ? `Approved ${format(approvedAt, 'PPp')} (${sub})` : sub;
                              return (
                                <Badge
                                  variant="outline"
                                  className={`text-xs px-2 py-0.5 shrink-0 ${
                                    aiAuto ? 'border-emerald-500/50 text-emerald-700 dark:text-emerald-400'
                                    : manual ? 'border-blue-500/50 text-blue-700 dark:text-blue-400'
                                    : 'border-muted-foreground/40 text-muted-foreground'
                                  }`}
                                  title={title}
                                >
                                  {aiAuto ? <Sparkles className="h-3 w-3 mr-1 inline" /> : manual ? <User className="h-3 w-3 mr-1 inline" /> : null}
                                  {label}{approvedAt ? ` · ${formatDistanceToNow(approvedAt, { addSuffix: true })}` : ''}
                                </Badge>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => {
                              void navigator.clipboard.writeText(listing.id);
                              toast({ title: 'Copied', description: 'Listing ID copied.' });
                            }}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy ID
                          </Button>
                          <Link href={`/listing/${listing.id}`} target="_blank">
                            <Button variant="outline" size="sm" className="h-8">
                              <ExternalLink className="h-4 w-4 mr-2" />
                              View
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>

                    {/* Main Content */}
                    <div className="p-5">
                      <div className="grid lg:grid-cols-[240px_1fr_240px] gap-5">
                        {/* Left: Image & Quick Info */}
                        <div className="space-y-3">
                          <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-muted/50 dark:bg-muted/30 border border-border">
                            {listing.images && listing.images.length > 0 ? (
                              // Use a plain <img> to avoid `next/image` remote-host config issues with Firebase Storage URLs.
                              // (We still optimize elsewhere; this is an admin-only surface where reliability > optimization.)
                              <img
                                src={listing.images[0]}
                                alt={listing.title}
                                className="absolute inset-0 h-full w-full object-cover"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="flex items-center justify-center h-full">
                                <Package className="h-12 w-12 text-muted-foreground opacity-40" />
                              </div>
                            )}
                            {listing.images && listing.images.length > 1 && (
                              <Badge className="absolute top-2 right-2 bg-card/95 backdrop-blur-sm border">
                                +{listing.images.length - 1}
                              </Badge>
                            )}
                          </div>

                          {/* Quick Info Card */}
                          <Card className="border bg-card">
                            <CardContent className="p-3 space-y-2.5">
                              <div className="flex items-center justify-between pb-2 border-b">
                                <span className="text-xs text-muted-foreground">Listing</span>
                                <span className="text-xs font-mono text-foreground/80">
                                  {listing.id.slice(0, 8)}…{listing.id.slice(-6)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between pb-2 border-b">
                                <span className="text-xs text-muted-foreground">Price</span>
                                <span className="text-sm font-bold">
                                  {listing.price 
                                    ? formatCurrency(listing.price)
                                    : listing.startingBid 
                                    ? formatCurrency(listing.startingBid)
                                    : 'Contact'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Location</span>
                                <span className="text-xs font-semibold">
                                  {listing.location.city}, {listing.location.state}
                                </span>
                              </div>
                              <div className="flex items-center justify-between pt-2 border-t">
                                <span className="text-xs text-muted-foreground">Created</span>
                                <span className="text-xs text-foreground/80">
                                  {formatDistanceToNow(toDateSafe(listing.createdAt) || new Date(), { addSuffix: true })}
                                </span>
                              </div>
                              {sellerProfilesMap[listing.sellerId] && (
                                <>
                                  <div className="pt-2 border-t space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-muted-foreground">Seller</span>
                                      <span className="text-xs font-semibold truncate max-w-[140px] text-right">
                                        {sellerProfilesMap[listing.sellerId].displayName || sellerProfilesMap[listing.sellerId].email || 'N/A'}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs text-muted-foreground">Verified</span>
                                      <Badge 
                                        variant={
                                          sellerProfilesMap[listing.sellerId]?.seller?.verified === true ||
                                          sellerProfilesMap[listing.sellerId]?.seller?.credentials?.identityVerified === true
                                            ? 'default'
                                            : 'secondary'
                                        }
                                        className="text-xs px-1.5 py-0 h-4"
                                      >
                                        {sellerProfilesMap[listing.sellerId]?.seller?.verified === true ||
                                        sellerProfilesMap[listing.sellerId]?.seller?.credentials?.identityVerified === true ? (
                                          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                                        ) : null}
                                        {sellerProfilesMap[listing.sellerId]?.seller?.verified === true ||
                                        sellerProfilesMap[listing.sellerId]?.seller?.credentials?.identityVerified === true
                                          ? 'Yes'
                                          : 'No'}
                                      </Badge>
                                    </div>
                                  </div>
                                </>
                              )}
                            </CardContent>
                          </Card>
                        </div>

                        {/* Center: Compliance & Documents */}
                        <div className="space-y-3">
                          {/* AI Review Result - why not auto-approved (for pending listings) */}
                          {listing.status === 'pending' && (listing as any).aiModeration && (listing as any).aiModeration.decision !== 'auto_approved' && (() => {
                            const am = (listing as any).aiModeration;
                            const conf = (am.scores?.textConfidence ?? 0) * 100;
                            const risk = (am.scores?.riskScore ?? 0) * 100;
                            const minConf = (modConfig?.minTextConfidence ?? 0.8) * 100;
                            const maxRisk = (modConfig?.maxRiskScore ?? 0.25) * 100;
                            const confFail = conf < minConf;
                            const riskFail = risk > maxRisk;
                            const reasons = (am.reasons || []) as string[];
                            const evidence = (am.evidence || []) as Array<{ flag: string; snippet: string }>;
                            const factorBreakdown = (am.factorBreakdown || []) as Array<{ factor: string; passed: boolean; note?: string }>;
                            const flagSet = new Set((am.flags || []) as string[]);
                            const FACTOR_LABELS: Record<string, string> = {
                              prohibited_language: 'Prohibited terms (venison, meat, tags)',
                              scam_pricing: 'Pricing (suspicious/low)',
                              misrepresentation: 'Title vs description consistency',
                              illegal_species: 'Prohibited species language',
                              interstate_shipping: 'Interstate shipping claims',
                              permit_required_missing: 'Permit requirements',
                              description_clarity: 'Description clarity',
                              uncertain: 'Text clarity / ambiguity',
                            };
                            const derivedFactors: Array<{ factor: string; passed: boolean; note?: string }> = factorBreakdown.length > 0 ? [] : [
                              { factor: 'prohibited_language', passed: !flagSet.has('prohibited_language'), note: flagSet.has('prohibited_language') ? (evidence.find(e => e.flag === 'prohibited_language')?.snippet || 'Flagged') : 'None found' },
                              { factor: 'scam_pricing', passed: !flagSet.has('scam_pricing'), note: flagSet.has('scam_pricing') ? (evidence.find(e => e.flag === 'scam_pricing')?.snippet || 'Flagged') : 'Normal' },
                              { factor: 'misrepresentation', passed: !flagSet.has('misrepresentation'), note: flagSet.has('misrepresentation') ? (evidence.find(e => e.flag === 'misrepresentation')?.snippet || 'Flagged') : 'None' },
                              { factor: 'illegal_species', passed: !flagSet.has('illegal_species'), note: flagSet.has('illegal_species') ? (evidence.find(e => e.flag === 'illegal_species')?.snippet || 'Flagged') : 'None' },
                              { factor: 'interstate_shipping', passed: !flagSet.has('interstate_shipping'), note: flagSet.has('interstate_shipping') ? (evidence.find(e => e.flag === 'interstate_shipping')?.snippet || 'Flagged') : 'None' },
                              { factor: 'description_clarity', passed: !flagSet.has('uncertain'), note: flagSet.has('uncertain') ? (evidence.find(e => e.flag === 'uncertain')?.snippet || 'Flagged as vague') : 'OK' },
                            ];
                            const factors = factorBreakdown.length > 0 ? factorBreakdown : derivedFactors;
                            const allPassed = factors.every((f) => f.passed);
                            const plainSummary = allPassed && (confFail || riskFail)
                              ? `All checks passed but scores were borderline (${conf.toFixed(0)}% confidence, ${risk.toFixed(0)}% risk). Approve manually or re-run AI.`
                              : confFail && riskFail
                                ? `Confidence ${conf.toFixed(0)}% (need ${minConf.toFixed(0)}%) and risk ${risk.toFixed(0)}% (max ${maxRisk.toFixed(0)}%).`
                                : confFail
                                  ? `Confidence ${conf.toFixed(0)}% below threshold (need ${minConf.toFixed(0)}%).`
                                  : riskFail
                                    ? `Risk ${risk.toFixed(0)}% exceeds max (${maxRisk.toFixed(0)}%).`
                                    : reasons[0] || 'Needs manual review.';
                            return (
                              <Card className="border-amber-500/40 bg-amber-500/5 dark:bg-amber-500/10">
                                <CardHeader className="pb-2">
                                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    <Sparkles className="h-4 w-4 text-amber-600" />
                                    Why AI Didn&apos;t Auto-Approve
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm">
                                  <p className="text-amber-800 dark:text-amber-200 font-medium">{plainSummary}</p>
                                  {factors.length > 0 && (
                                    <div className="text-xs pt-2 border-t border-amber-500/20">
                                      <div className="font-medium text-amber-800 dark:text-amber-200 mb-1.5">Checks:</div>
                                      <ul className="space-y-1">
                                        {factors.map((f, i) => (
                                          <li key={i} className="flex items-start gap-2">
                                            <span className={f.passed ? 'text-emerald-600' : 'text-amber-600'}>{f.passed ? '✓' : '✗'}</span>
                                            <span>
                                              <span className="font-medium">{FACTOR_LABELS[f.factor] || f.factor.replace(/_/g, ' ')}:</span>
                                              <span className={f.passed ? ' text-muted-foreground' : ' text-amber-700 dark:text-amber-300'}>
                                                {' '}{f.note || (f.passed ? 'Passed' : 'Flagged')}
                                              </span>
                                            </span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {evidence.length > 0 && !factorBreakdown.length && (
                                    <div className="text-xs pt-2 border-t border-amber-500/20">
                                      <div className="font-medium text-amber-800 dark:text-amber-200 mb-1">Flagged text:</div>
                                      <ul className="space-y-1 text-muted-foreground">
                                        {evidence.map((e, i) => (
                                          <li key={i}>
                                            <span className="text-foreground/90">&quot;{e.snippet}&quot;</span>
                                            {e.flag ? <span className="ml-1 text-amber-600">— {e.flag.replace(/_/g, ' ')}</span> : null}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {reasons.length > 0 && (
                                    <details className="text-xs pt-1 border-t border-amber-500/20">
                                      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Show full AI reasoning</summary>
                                      <ul className="list-disc list-inside mt-1 space-y-0.5 text-muted-foreground">
                                        {reasons.map((r, i) => (
                                          <li key={i}>{r}</li>
                                        ))}
                                      </ul>
                                    </details>
                                  )}
                                </CardContent>
                              </Card>
                            );
                          })()}
                          {/* AI Summary */}
                          <AIAdminSummary
                            entityType="listing"
                            entityId={listing.id}
                            existingSummary={listing.aiAdminSummary || null}
                            existingSummaryAt={listing.aiAdminSummaryAt || null}
                            existingSummaryModel={listing.aiAdminSummaryModel || null}
                            onSummaryUpdated={(summary, model, generatedAt) => {
                              // Update local state
                              listing.aiAdminSummary = summary;
                              listing.aiAdminSummaryAt = generatedAt;
                              listing.aiAdminSummaryModel = model;
                            }}
                          />
                          
                          {/* Compliance Status - Whitetail Breeder */}
                          {listing.category === 'whitetail_breeder' && (
                            <Card className={`border ${
                              listing.complianceStatus === 'approved' 
                                ? 'border-primary/30 bg-primary/5' 
                                : listing.complianceStatus === 'rejected'
                                ? 'border-destructive/30 bg-destructive/5'
                                : 'border-accent/30 bg-accent/5'
                            }`}>
                              <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Shield className={`h-4 w-4 ${
                                      listing.complianceStatus === 'approved' ? 'text-primary' : 'text-accent'
                                    }`} />
                                    <CardTitle className="text-sm font-bold">TPWD Compliance</CardTitle>
                                  </div>
                                  {(() => {
                                    const docs = listingDocsMap[listing.id] || [];
                                    const tpwdPermit = docs.find(d => d.type === 'TPWD_BREEDER_PERMIT');
                                    return tpwdPermit?.status === 'verified' ? (
                                      <Badge variant="default" className="text-xs px-2 py-0.5">
                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                        Verified
                                      </Badge>
                                    ) : null;
                                  })()}
                                </div>
                              </CardHeader>
                              <CardContent className="space-y-3">
                                {(() => {
                                  const docs = listingDocsMap[listing.id] || [];
                                  const tpwdPermit = docs.find(d => d.type === 'TPWD_BREEDER_PERMIT');
                                  const attrs = listing.attributes as any;
                                  
                                  return (
                                    <>
                                      {/* Document Status */}
                                      <div className="p-3 rounded-lg bg-card border">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-xs font-semibold text-foreground">TPWD Breeder Permit</span>
                                          {tpwdPermit?.status === 'verified' ? (
                                            <Badge variant="default" className="text-xs px-2 py-0.5">
                                              <CheckCircle2 className="h-3 w-3 mr-1" />
                                              Verified
                                            </Badge>
                                          ) : tpwdPermit ? (
                                            <Badge variant="secondary" className="text-xs px-2 py-0.5">
                                              <AlertCircle className="h-3 w-3 mr-1" />
                                              {tpwdPermit.status}
                                            </Badge>
                                          ) : (
                                            <Badge variant="outline" className="text-xs px-2 py-0.5 text-muted-foreground">
                                              Not Uploaded
                                            </Badge>
                                          )}
                                        </div>
                                        {tpwdPermit?.permitNumber && (
                                          <div className="text-xs text-muted-foreground mt-1">
                                            Permit #: <span className="text-foreground font-medium">{tpwdPermit.permitNumber}</span>
                                          </div>
                                        )}

                                        {(() => {
                                          const docUrl = tpwdPermit?.documentUrl || tpwdPermit?.url;
                                          if (!docUrl) return null;
                                          return (
                                            <div className="mt-2 flex items-center gap-2">
                                              <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="h-7 px-2 text-xs"
                                                onClick={() => {
                                                  setViewingDocTitle('TPWD Breeder Permit');
                                                  setViewingDocUrl(docUrl);
                                                }}
                                              >
                                                <Eye className="h-3.5 w-3.5 mr-1.5" />
                                                View
                                              </Button>
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 px-2 text-xs"
                                                onClick={() => window.open(docUrl, '_blank')}
                                              >
                                                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                                Open
                                              </Button>
                                            </div>
                                          );
                                        })()}
                                      </div>

                                      {/* Required Information Checklist */}
                                      <div className="p-3 rounded-lg bg-card border">
                                        <div className="text-xs font-semibold text-foreground mb-2.5">Required Information</div>
                                        <div className="space-y-2">
                                          <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">Permit Number</span>
                                            {attrs?.tpwdBreederPermitNumber ? (
                                              <div className="flex items-center gap-1 text-primary">
                                                <CheckCircle2 className="h-3 w-3" />
                                                <span className="font-medium">{attrs.tpwdBreederPermitNumber}</span>
                                              </div>
                                            ) : (
                                              <span className="text-muted-foreground">Not provided</span>
                                            )}
                                          </div>
                                          <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">Facility ID</span>
                                            {attrs?.breederFacilityId ? (
                                              <div className="flex items-center gap-1 text-primary">
                                                <CheckCircle2 className="h-3 w-3" />
                                                <span className="font-medium">{attrs.breederFacilityId}</span>
                                              </div>
                                            ) : (
                                              <span className="text-muted-foreground">Not provided</span>
                                            )}
                                          </div>
                                          <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">Deer ID Tag</span>
                                            {attrs?.deerIdTag ? (
                                              <div className="flex items-center gap-1 text-primary">
                                                <CheckCircle2 className="h-3 w-3" />
                                                <span className="font-medium">{attrs.deerIdTag}</span>
                                              </div>
                                            ) : (
                                              <span className="text-muted-foreground">Not provided</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {/* Warning Message */}
                                      {listing.complianceStatus === 'pending_review' && (
                                        <div className="p-2.5 rounded-lg bg-accent/10 border border-accent/30">
                                          <div className="flex items-start gap-2">
                                            <AlertTriangle className="h-4 w-4 text-accent mt-0.5 shrink-0" />
                                            <div className="text-xs">
                                              <div className="font-semibold text-accent-foreground mb-0.5">Review Required</div>
                                              <div className="text-muted-foreground">Verify TPWD permit document and required information before approving this listing.</div>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </CardContent>
                            </Card>
                          )}

                          {/* Documents List - Only show for non-whitetail or if there are additional documents beyond TPWD */}
                          {listing.category !== 'whitetail_breeder' && (
                            <>
                              {listingDocsMap[listing.id] && listingDocsMap[listing.id].length > 0 ? (
                                <Card className="border">
                                  <CardHeader className="pb-2.5">
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-4 w-4 text-primary" />
                                      <CardTitle className="text-sm font-bold">Documents</CardTitle>
                                    </div>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="space-y-1.5">
                                      {listingDocsMap[listing.id].map((doc, idx) => (
                                        <div key={idx} className="flex items-center justify-between p-2 rounded bg-card/50 border text-xs">
                                          <span className="font-medium capitalize">
                                            {doc.type.replace(/_/g, ' ')}
                                            {doc.permitNumber && (
                                              <span className="text-muted-foreground ml-1">({doc.permitNumber})</span>
                                            )}
                                          </span>
                                          <div className="flex items-center gap-2">
                                            {(doc.documentUrl || doc.url) && (
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 px-2 text-xs"
                                                onClick={() => {
                                                  const url = doc.documentUrl || doc.url;
                                                  setViewingDocTitle(doc.type?.replace(/_/g, ' ') || 'Document');
                                                  setViewingDocUrl(url);
                                                }}
                                              >
                                                <Eye className="h-3.5 w-3.5 mr-1.5" />
                                                View
                                              </Button>
                                            )}
                                            <Badge 
                                              variant={
                                                doc.status === 'verified' ? 'default' :
                                                doc.status === 'rejected' ? 'destructive' : 'secondary'
                                              }
                                              className="text-xs h-5 px-1.5"
                                            >
                                              {doc.status === 'verified' && <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />}
                                              {doc.status === 'rejected' && <X className="h-2.5 w-2.5 mr-0.5" />}
                                              {doc.status === 'uploaded' && <AlertCircle className="h-2.5 w-2.5 mr-0.5" />}
                                              {doc.status}
                                            </Badge>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </CardContent>
                                </Card>
                              ) : (
                                <Card className="border border-muted/30 bg-muted/5">
                                  <CardContent className="p-3">
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-4 w-4 text-muted-foreground" />
                                      <span className="text-xs font-medium text-muted-foreground">
                                        No documents uploaded
                                      </span>
                                    </div>
                                  </CardContent>
                                </Card>
                              )}
                            </>
                          )}
                        </div>

                        {/* Right: Actions */}
                        <div className="space-y-3">
                          <Card className="border bg-card">
                            <CardHeader className="pb-2.5">
                              <CardTitle className="text-sm font-bold">Actions</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                              {(listing.complianceStatus === 'pending_review' || listing.category === 'whitetail_breeder') && (
                                <Link href={`/dashboard/admin/compliance?listing=${listing.id}`} className="block">
                                  <Button 
                                    variant="outline" 
                                    className={`w-full ${
                                      listing.complianceStatus === 'pending_review' 
                                        ? 'border-accent/40 bg-accent/10 hover:bg-accent/20 text-accent-foreground' 
                                        : 'border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary'
                                    }`} 
                                    size="sm"
                                  >
                                    <Shield className="mr-2 h-3.5 w-3.5" />
                                    Review Compliance
                                  </Button>
                                </Link>
                              )}
                              
                              {filterType === 'ai_approved' ? (
                                <>
                                  {(listing as any).aiModeration && (
                                    <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs space-y-1">
                                      <div className="font-semibold">AI Moderation</div>
                                      <div>Confidence: {((listing as any).aiModeration.scores?.textConfidence ?? 0) * 100}% · Risk: {((listing as any).aiModeration.scores?.riskScore ?? 0) * 100}%</div>
                                      {((listing as any).aiModeration.reasons?.length) > 0 && (
                                        <div className="text-muted-foreground">{(listing as any).aiModeration.reasons[0]}</div>
                                      )}
                                    </div>
                                  )}
                                  <Button
                                    onClick={() => handleRevertToPending(listing.id)}
                                    disabled={processingId === listing.id}
                                    variant="outline"
                                    className="w-full border-amber-500/50 text-amber-700 hover:bg-amber-500/10"
                                    size="sm"
                                  >
                                    {processingId === listing.id ? (
                                      <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Reverting...</>
                                    ) : (
                                      <>Revert to Manual Review</>
                                    )}
                                  </Button>
                                </>
                              ) : (
                                <>
                                  {modConfig?.aiAutoApproveEnabled && listing.status === 'pending' && (
                                    <Button
                                      onClick={() => handleTryAIAutoApprove(listing.id)}
                                      disabled={processingId === listing.id}
                                      variant="outline"
                                      size="sm"
                                      className="w-full border-primary/40 bg-primary/5 hover:bg-primary/10"
                                    >
                                      {processingId === listing.id ? (
                                        <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Checking...</>
                                      ) : (
                                        <><Sparkles className="mr-2 h-3.5 w-3.5" />Try AI Auto-Approve</>
                                      )}
                                    </Button>
                                  )}
                                  <Button
                                    onClick={() => handleApprove(listing.id)}
                                    disabled={
                                      processingId === listing.id || 
                                      (listing.category === 'whitetail_breeder' && listing.complianceStatus !== 'approved')
                                    }
                                    className="w-full"
                                    size="sm"
                                  >
                                    {processingId === listing.id ? (
                                      <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Approving...</>
                                    ) : (
                                      <><CheckCircle className="mr-2 h-3.5 w-3.5" />Approve Listing</>
                                    )}
                                  </Button>
                                  {listing.category === 'whitetail_breeder' && listing.complianceStatus !== 'approved' && (
                                    <div className="rounded-md border border-amber-600/30 bg-amber-500/10 p-2">
                                      <div className="flex items-start gap-2">
                                        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                                        <div className="text-xs">
                                          <div className="font-semibold text-foreground">TPWD permit required</div>
                                          <div className="text-muted-foreground">Approve is disabled until compliance is approved.</div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                  <Button
                                    onClick={() => openRejectDialog(listing.id)}
                                    disabled={processingId === listing.id}
                                    variant="destructive"
                                    className="w-full"
                                    size="sm"
                                  >
                                    {processingId === listing.id ? (
                                      <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Rejecting...</>
                                    ) : (
                                      <><XCircle className="mr-2 h-3.5 w-3.5" />Reject Listing</>
                                    )}
                                  </Button>
                                </>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Document Viewer Dialog (quick view from Approve Listings) */}
      <Dialog open={!!viewingDocUrl} onOpenChange={(open) => !open && setViewingDocUrl(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{viewingDocTitle}</DialogTitle>
            <DialogDescription>
              Review the uploaded document without leaving this page
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {viewingDocUrl && (
              <iframe
                src={viewingDocUrl}
                className="w-full h-full min-h-[600px] border rounded"
                title={viewingDocTitle}
              />
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => window.open(viewingDocUrl!, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open in New Tab
            </Button>
            <Button onClick={() => setViewingDocUrl(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Listing Dialog */}
      <Dialog
        open={rejectOpen}
        onOpenChange={(open) => {
          setRejectOpen(open);
          if (!open) {
            setRejectListingId(null);
            setRejectReasonKey('');
            setRejectCustomNote('');
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reject listing</DialogTitle>
            <DialogDescription>
              Choose a reason (this will be included in the seller’s notification). Avoid buyer info or private order details.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold">Reason</div>
              <Select value={rejectReasonKey} onValueChange={(v) => setRejectReasonKey(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {rejectReasonOptions.map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">
                Optional note {rejectReasonKey === 'other' ? '(recommended)' : ''}
              </div>
              <Textarea
                value={rejectCustomNote}
                onChange={(e) => setRejectCustomNote(e.target.value)}
                placeholder={
                  rejectReasonKey === 'other'
                    ? 'Add a short, specific note the seller can act on...'
                    : 'Optional: add details (e.g., what to fix)'
                }
                className="min-h-[90px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRejectOpen(false)}
              disabled={!!processingId}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                !rejectListingId ||
                !!processingId ||
                (rejectReasonKey === 'other' && rejectCustomNote.trim().length < 3) ||
                (!rejectReasonKey && rejectCustomNote.trim().length < 3)
              }
              onClick={async () => {
                if (!rejectListingId) return;
                const reason = buildRejectReason();
                await handleReject(rejectListingId, reason);
                setRejectOpen(false);
              }}
            >
              {processingId === rejectListingId ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rejecting...
                </>
              ) : (
                'Reject listing'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
