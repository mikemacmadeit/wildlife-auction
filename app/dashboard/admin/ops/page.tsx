/**
 * Admin Ops Dashboard - Unified view for managing transaction lifecycle
 * 
 * Tabs:
 * 1. Orders in Escrow - Orders with status='paid' and no transfer ID
 * 2. Protected Transactions - Orders with protected transaction enabled
 * 3. Open Disputes - Orders with open disputes
 * 4. Ready to Release - Orders eligible for payout release
 */

'use client';

/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Shield,
  Clock,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Search,
  Eye,
  DollarSign,
  Package,
  Users,
  Calendar,
  FileText,
  CreditCard,
  ArrowRight,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { formatCurrency, formatDate, formatDistanceToNow } from '@/lib/utils';
import { Order, OrderStatus, DisputeStatus, PayoutHoldReason } from '@/lib/types';
import { getAdminOrders } from '@/lib/stripe/api';
import { getListingById } from '@/lib/firebase/listings';
import { getUserProfile } from '@/lib/firebase/users';
import { releasePayment, processRefund, resolveDispute, confirmDelivery, adminMarkOrderPaid } from '@/lib/stripe/api';
import { TransactionTimeline } from '@/components/orders/TransactionTimeline';
import { useDebounce } from '@/hooks/use-debounce';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Checkbox } from '@/components/ui/checkbox';
import { getHoldInfo, generatePayoutExplanation } from '@/lib/orders/hold-reasons';
import { Copy, Check } from 'lucide-react';
import { getOrderTrustState } from '@/lib/orders/getOrderTrustState';
import { getOrderIssueState } from '@/lib/orders/getOrderIssueState';

interface OrderWithDetails extends Order {
  listingTitle?: string;
  listingImage?: string;
  listingComplianceStatus?: string;
  listingCategory?: string;
  buyerName?: string;
  buyerEmail?: string;
  sellerName?: string;
  sellerEmail?: string;
}

type TabType = 'escrow' | 'protected' | 'disputes' | 'ready_to_release';

export default function AdminOpsPage() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('escrow');
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState<'release' | 'hold' | 'unhold' | null>(null);
  const [bulkHoldReason, setBulkHoldReason] = useState('');
  const [bulkHoldNotes, setBulkHoldNotes] = useState('');
  
  // Dialog states
  const [releaseDialogOpen, setReleaseDialogOpen] = useState<string | null>(null);
  const [refundDialogOpen, setRefundDialogOpen] = useState<string | null>(null);
  const [resolveDialogOpen, setResolveDialogOpen] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [resolutionType, setResolutionType] = useState<'release' | 'refund' | 'partial_refund'>('release');
  const [adminNotes, setAdminNotes] = useState('');
  const [copiedExplanation, setCopiedExplanation] = useState(false);

  const handleViewOrder = useCallback((order: OrderWithDetails) => {
    setSelectedOrder(order);
    setDetailDialogOpen(true);
  }, []);

  const loadOrders = useCallback(async () => {
    if (!user?.uid || !isAdmin) return;
    
    setLoading(true);
    try {
      const result = await getAdminOrders(activeTab === 'escrow' ? 'escrow' : 
                                          activeTab === 'protected' ? 'protected' :
                                          activeTab === 'disputes' ? 'disputes' :
                                          'ready_to_release');
      
      // Enrich orders with listing and user details
      const enrichedOrders = await Promise.all(
        result.orders.map(async (order: any) => {
          try {
            const listing = await getListingById(order.listingId);
            const buyer = await getUserProfile(order.buyerId);
            const seller = await getUserProfile(order.sellerId);
            
            // Convert ISO strings back to Date objects
            const dateFields = [
              'createdAt', 'updatedAt', 'paidAt', 'disputeDeadlineAt', 'deliveredAt',
              'acceptedAt', 'disputedAt', 'deliveryConfirmedAt', 'protectionStartAt',
              'protectionEndsAt', 'buyerAcceptedAt', 'disputeOpenedAt', 'releasedAt',
              'refundedAt', 'completedAt'
            ];
            
            dateFields.forEach((field) => {
              if (order[field]) {
                order[field] = new Date(order[field]);
              }
            });
            
            if (order.disputeEvidence && Array.isArray(order.disputeEvidence)) {
              order.disputeEvidence = order.disputeEvidence.map((e: any) => ({
                ...e,
                uploadedAt: e.uploadedAt ? new Date(e.uploadedAt) : new Date(),
              }));
            }
            
            return {
              ...order,
              listingTitle: listing?.title,
              listingImage: listing?.images?.[0],
              listingComplianceStatus: (listing as any)?.complianceStatus,
              listingCategory: (listing as any)?.category,
              buyerName: buyer?.displayName || buyer?.profile?.fullName || 'N/A',
              buyerEmail: buyer?.email,
              sellerName: seller?.displayName || seller?.profile?.fullName || 'N/A',
              sellerEmail: seller?.email,
            } as OrderWithDetails;
          } catch (error) {
            console.error('Error enriching order:', error);
            return {
              ...order,
              listingTitle: 'Unknown',
              buyerName: 'N/A',
              sellerName: 'N/A',
            } as OrderWithDetails;
          }
        })
      );
      
      setOrders(enrichedOrders);
    } catch (error: any) {
      console.error('Error loading orders:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load orders',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [activeTab, user?.uid, isAdmin, toast]);

  // Load orders when tab changes
  useEffect(() => {
    if (!adminLoading && isAdmin && user) {
      loadOrders();
    }
  }, [adminLoading, isAdmin, user, loadOrders]);

  // Debounce search query
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Filter orders by search query (enhanced with paymentIntentId)
  const filteredOrders = useMemo(() => {
    if (!debouncedSearchQuery) return orders;
    
    const query = debouncedSearchQuery.toLowerCase();
    return orders.filter(order =>
      order.id.toLowerCase().includes(query) ||
      order.listingId?.toLowerCase().includes(query) ||
      order.listingTitle?.toLowerCase().includes(query) ||
      order.buyerName?.toLowerCase().includes(query) ||
      order.buyerEmail?.toLowerCase().includes(query) ||
      order.sellerName?.toLowerCase().includes(query) ||
      order.sellerEmail?.toLowerCase().includes(query) ||
      order.stripePaymentIntentId?.toLowerCase().includes(query)
    );
  }, [orders, debouncedSearchQuery]);

  // Action handlers
  const handleReleasePayout = useCallback(async (orderId: string) => {
    setProcessingOrderId(orderId);
    try {
      const result = await releasePayment(orderId);
      toast({
        title: 'Funds Released',
        description: `Payout released. Transfer ID: ${result.transferId}`,
      });
      setReleaseDialogOpen(null);
      await loadOrders();
    } catch (error: any) {
      console.error('Error releasing payout:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to release payout',
        variant: 'destructive',
      });
    } finally {
      setProcessingOrderId(null);
    }
  }, [loadOrders, toast]);

  const handleMarkPaid = useCallback(async (orderId: string) => {
    setProcessingOrderId(orderId);
    try {
      await adminMarkOrderPaid(orderId);
      toast({
        title: 'Payment confirmed',
        description: 'Order marked as paid (held). Funds remain held until manual release.',
      });
      await loadOrders();
    } catch (error: any) {
      console.error('Error marking paid:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to mark order paid',
        variant: 'destructive',
      });
    } finally {
      setProcessingOrderId(null);
    }
  }, [loadOrders, toast]);

  const handleProcessRefund = useCallback(async () => {
    if (!refundDialogOpen) return;
    
    if (!refundReason.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Refund reason is required',
        variant: 'destructive',
      });
      return;
    }
    
    setProcessingOrderId(refundDialogOpen);
    try {
      const amount = refundAmount ? parseFloat(refundAmount) : undefined;
      const result = await processRefund(refundDialogOpen, refundReason, amount);
      toast({
        title: 'Refund Processed',
        description: `${result.isFullRefund ? 'Full' : 'Partial'} refund of ${formatCurrency(result.amount)} processed.`,
      });
      setRefundDialogOpen(null);
      setRefundReason('');
      setRefundAmount('');
      await loadOrders();
    } catch (error: any) {
      console.error('Error processing refund:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to process refund',
        variant: 'destructive',
      });
    } finally {
      setProcessingOrderId(null);
    }
  }, [refundDialogOpen, refundReason, refundAmount, loadOrders, toast]);

  const handleResolveDispute = useCallback(async () => {
    if (!resolveDialogOpen) return;
    
    if (!adminNotes.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Admin notes are required to resolve a dispute',
        variant: 'destructive',
      });
      return;
    }
    
    setProcessingOrderId(resolveDialogOpen);
    try {
      const refundAmountNum = resolutionType.includes('refund') && refundAmount ? parseFloat(refundAmount) : undefined;
      await resolveDispute(
        resolveDialogOpen, 
        resolutionType, 
        refundAmountNum, 
        refundReason || undefined,
        false, // markFraudulent - could be added to UI later
        adminNotes
      );
      toast({
        title: 'Dispute Resolved',
        description: `Dispute resolved as ${resolutionType}.`,
      });
      setResolveDialogOpen(null);
      setResolutionType('release');
      setRefundAmount('');
      setRefundReason('');
      setAdminNotes('');
      await loadOrders();
    } catch (error: any) {
      console.error('Error resolving dispute:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to resolve dispute',
        variant: 'destructive',
      });
    } finally {
      setProcessingOrderId(null);
    }
  }, [resolveDialogOpen, resolutionType, refundAmount, refundReason, adminNotes, loadOrders, toast]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = orders.length;
    const paid = orders.filter(o => (o.status === 'paid' || o.status === 'paid_held') && !o.stripeTransferId).length;
    const completed = orders.filter(o => o.status === 'completed').length;
    const totalValue = orders.reduce((sum, o) => sum + o.amount, 0);
    const totalFees = orders.reduce((sum, o) => sum + o.platformFee, 0);
    const totalPayouts = orders.reduce((sum, o) => sum + o.sellerAmount, 0);
    const pendingPayouts = orders
      .filter(o => (o.status === 'paid' || o.status === 'paid_held') && !o.stripeTransferId)
      .reduce((sum, o) => sum + o.sellerAmount, 0);

    return { total, paid, completed, totalValue, totalFees, totalPayouts, pendingPayouts };
  }, [orders]);

  const handleConfirmDelivery = useCallback(async (orderId: string) => {
    setProcessingOrderId(orderId);
    try {
      await confirmDelivery(orderId);
      toast({
        title: 'Delivery Confirmed',
        description: 'Protection window has been started for this order.',
      });
      await loadOrders();
    } catch (error: any) {
      console.error('Error confirming delivery:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to confirm delivery',
        variant: 'destructive',
      });
    } finally {
      setProcessingOrderId(null);
    }
  }, [loadOrders, toast]);

  // Bulk action handlers
  const handleBulkRelease = useCallback(async () => {
    const ordersToRelease = filteredOrders.filter(o => selectedOrderIds.has(o.id));
    if (ordersToRelease.length === 0) return;

    // Filter to only eligible orders (same logic as "Ready to Release" tab)
    const eligibleOrders = ordersToRelease.filter(order => {
      if (order.stripeTransferId || order.status === 'completed') return false;
      if (order.adminHold) return false;
      if (order.disputeStatus && ['open', 'needs_evidence', 'under_review'].includes(order.disputeStatus)) return false;

      const hasBuyerConfirm = !!(order.buyerConfirmedAt || order.buyerAcceptedAt || order.acceptedAt);
      const hasDelivery = !!(order.deliveredAt || order.deliveryConfirmedAt);
      if (!hasBuyerConfirm || !hasDelivery) return false;

      return order.status === 'ready_to_release' || order.status === 'buyer_confirmed' || order.status === 'accepted';
    });

    if (eligibleOrders.length === 0) {
      toast({
        title: 'No Eligible Orders',
        description: 'None of the selected orders are eligible for release.',
        variant: 'destructive',
      });
      setBulkActionDialogOpen(null);
      return;
    }

    setBulkActionDialogOpen(null);
    setProcessingOrderId('bulk');

    const results: { orderId: string; success: boolean; error?: string }[] = [];
    const BATCH_SIZE = 3;

    // Process in batches
    for (let i = 0; i < eligibleOrders.length; i += BATCH_SIZE) {
      const batch = eligibleOrders.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (order) => {
          try {
            await releasePayment(order.id);
            return { orderId: order.id, success: true };
          } catch (error: any) {
            return { orderId: order.id, success: false, error: error.message || 'Unknown error' };
          }
        })
      );
      results.push(...batchResults);
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    toast({
      title: 'Bulk Release Complete',
      description: `${successCount} released, ${failCount} failed`,
      variant: failCount > 0 ? 'destructive' : 'default',
    });

    setSelectedOrderIds(new Set());
    setProcessingOrderId(null);
    await loadOrders();
  }, [filteredOrders, selectedOrderIds, loadOrders, toast]);

  const handleBulkHold = useCallback(async () => {
    if (!bulkHoldReason.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Reason is required',
        variant: 'destructive',
      });
      return;
    }

    const ordersToHold = filteredOrders.filter(o => selectedOrderIds.has(o.id));
    if (ordersToHold.length === 0) return;

    setBulkActionDialogOpen(null);
    setProcessingOrderId('bulk');

    const results: { orderId: string; success: boolean; error?: string }[] = [];

    // Process sequentially to avoid rate limits
    for (const order of ordersToHold) {
      try {
        const { adminSetOrderHold } = await import('@/lib/stripe/api');
        await adminSetOrderHold(order.id, true, bulkHoldReason, bulkHoldNotes || undefined);
        results.push({ orderId: order.id, success: true });
      } catch (error: any) {
        results.push({ orderId: order.id, success: false, error: error.message || 'Unknown error' });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    toast({
      title: 'Bulk Hold Complete',
      description: `${successCount} held, ${failCount} failed`,
      variant: failCount > 0 ? 'destructive' : 'default',
    });

    setSelectedOrderIds(new Set());
    setBulkHoldReason('');
    setBulkHoldNotes('');
    setProcessingOrderId(null);
    await loadOrders();
  }, [filteredOrders, selectedOrderIds, bulkHoldReason, bulkHoldNotes, loadOrders, toast]);

  const handleBulkUnhold = useCallback(async () => {
    if (!bulkHoldReason.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Reason is required',
        variant: 'destructive',
      });
      return;
    }

    const ordersToUnhold = filteredOrders.filter(o => selectedOrderIds.has(o.id));
    if (ordersToUnhold.length === 0) return;

    setBulkActionDialogOpen(null);
    setProcessingOrderId('bulk');

    const results: { orderId: string; success: boolean; error?: string }[] = [];

    // Process sequentially
    for (const order of ordersToUnhold) {
      try {
        const { adminSetOrderHold } = await import('@/lib/stripe/api');
        await adminSetOrderHold(order.id, false, bulkHoldReason, bulkHoldNotes || undefined);
        results.push({ orderId: order.id, success: true });
      } catch (error: any) {
        results.push({ orderId: order.id, success: false, error: error.message || 'Unknown error' });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    toast({
      title: 'Bulk Unhold Complete',
      description: `${successCount} unheld, ${failCount} failed`,
      variant: failCount > 0 ? 'destructive' : 'default',
    });

    setSelectedOrderIds(new Set());
    setBulkHoldReason('');
    setBulkHoldNotes('');
    setProcessingOrderId(null);
    await loadOrders();
  }, [filteredOrders, selectedOrderIds, bulkHoldReason, bulkHoldNotes, loadOrders, toast]);

  // Reset selection when tab changes
  useEffect(() => {
    setSelectedOrderIds(new Set());
  }, [activeTab]);

  // Status badge helpers
  const getStatusBadge = (status: OrderStatus, disputeStatus?: DisputeStatus, payoutHoldReason?: PayoutHoldReason) => {
    if (disputeStatus && disputeStatus !== 'none' && disputeStatus !== 'cancelled' && !disputeStatus.startsWith('resolved')) {
      return <Badge variant="destructive">Dispute: {disputeStatus}</Badge>;
    }
    
    switch (status) {
      case 'paid':
        return <Badge variant="default" className="bg-orange-500 text-white">Paid</Badge>;
      case 'paid_held':
        return <Badge variant="default" className="bg-orange-500 text-white">Paid (Held)</Badge>;
      case 'awaiting_bank_transfer':
        return <Badge variant="default" className="bg-orange-500 text-white">Awaiting Bank Transfer</Badge>;
      case 'awaiting_wire':
        return <Badge variant="default" className="bg-orange-500 text-white">Awaiting Wire</Badge>;
      case 'in_transit':
        return <Badge variant="default" className="bg-blue-500 text-white">In Transit</Badge>;
      case 'delivered':
        return <Badge variant="default" className="bg-blue-600 text-white">Delivered</Badge>;
      case 'accepted':
        return <Badge variant="default" className="bg-green-600 text-white">Buyer Confirmed</Badge>;
      case 'buyer_confirmed':
        return <Badge variant="default" className="bg-green-600 text-white">Buyer Confirmed</Badge>;
      case 'ready_to_release':
        return <Badge variant="default" className="bg-emerald-700 text-white">Ready to Release</Badge>;
      case 'completed':
        return <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50">Completed</Badge>;
      case 'refunded':
        return <Badge variant="destructive">Refunded</Badge>;
      case 'disputed':
        return <Badge variant="destructive">Disputed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getHoldReasonText = (reason: PayoutHoldReason) => {
    switch (reason) {
      case 'protection_window':
        return 'Protection Window';
      case 'dispute_open':
        return 'Dispute Open';
      case 'admin_hold':
        return 'Admin Hold';
      case 'none':
        return 'None';
      default:
        return reason;
    }
  };

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
              <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
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
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Admin Operations Dashboard</h1>
        <p className="text-muted-foreground">
          Manage escrow, protected transactions, disputes, and payouts
        </p>
      </div>

      {/* Stats Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending Payouts</p>
                <p className="text-2xl font-bold">{stats.paid}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(stats.pendingPayouts)}
                </p>
              </div>
              <Clock className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{stats.completed}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(stats.totalPayouts)}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.totalValue)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.total} orders
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Platform Fees</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.totalFees)}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Platform fee (varies by seller plan)
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Bulk Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by order ID, listing ID, buyer email, seller email, or payment intent ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            {(activeTab === 'escrow' || activeTab === 'ready_to_release') && selectedOrderIds.size > 0 && (
              <div className="flex items-center gap-2 pt-2 border-t">
                <span className="text-sm text-muted-foreground">
                  {selectedOrderIds.size} order{selectedOrderIds.size !== 1 ? 's' : ''} selected
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const totalAmount = filteredOrders
                      .filter(o => selectedOrderIds.has(o.id))
                      .reduce((sum, o) => sum + o.sellerAmount, 0);
                    setBulkActionDialogOpen('release');
                  }}
                >
                  Bulk Release ({formatCurrency(filteredOrders.filter(o => selectedOrderIds.has(o.id)).reduce((sum, o) => sum + o.sellerAmount, 0))})
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkActionDialogOpen('hold')}
                >
                  Bulk Hold
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setBulkActionDialogOpen('unhold')}
                >
                  Bulk Unhold
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedOrderIds(new Set())}
                >
                  Clear Selection
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="escrow">
            <DollarSign className="h-4 w-4 mr-2" />
            Orders in Escrow ({orders.filter(o => (o.status === 'paid' || o.status === 'paid_held') && !o.stripeTransferId).length})
          </TabsTrigger>
          <TabsTrigger value="protected">
            <Shield className="h-4 w-4 mr-2" />
            Protected ({orders.filter(o => o.protectedTransactionDaysSnapshot).length})
          </TabsTrigger>
          <TabsTrigger value="disputes">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Open Disputes ({orders.filter(o => o.disputeStatus && ['open', 'needs_evidence', 'under_review'].includes(o.disputeStatus)).length})
          </TabsTrigger>
          <TabsTrigger value="ready_to_release">
            <CheckCircle className="h-4 w-4 mr-2" />
            Ready to Release ({orders.filter(o => {
              if (o.stripeTransferId || o.status === 'completed') return false;
              if (o.adminHold) return false;
              if (o.disputeStatus && ['open', 'needs_evidence', 'under_review'].includes(o.disputeStatus)) return false;
              const hasBuyerConfirm = !!(o.buyerConfirmedAt || o.buyerAcceptedAt || o.acceptedAt);
              const hasDelivery = !!(o.deliveredAt || o.deliveryConfirmedAt);
              if (!hasBuyerConfirm || !hasDelivery) return false;
              return o.status === 'ready_to_release' || o.status === 'buyer_confirmed' || o.status === 'accepted';
            }).length})
          </TabsTrigger>
        </TabsList>

        {/* Tab Content */}
        <TabsContent value="escrow" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Orders in Escrow</h3>
                  <p className="text-muted-foreground">All paid orders have been released or are being processed.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((order) => (
                <div key={order.id} className="flex items-start gap-2">
                  {(activeTab === 'escrow' || activeTab === 'ready_to_release') && (
                    <Checkbox
                      checked={selectedOrderIds.has(order.id)}
                      onCheckedChange={(checked) => {
                        const newSet = new Set(selectedOrderIds);
                        if (checked) {
                          newSet.add(order.id);
                        } else {
                          newSet.delete(order.id);
                        }
                        setSelectedOrderIds(newSet);
                      }}
                      className="mt-6"
                    />
                  )}
                  <div className="flex-1">
                    <OrderCard
                      order={order}
                      onRelease={() => setReleaseDialogOpen(order.id)}
                      onRefund={() => setRefundDialogOpen(order.id)}
                      onMarkPaid={() => handleMarkPaid(order.id)}
                      onView={() => handleViewOrder(order)}
                      getStatusBadge={getStatusBadge}
                      getHoldReasonText={getHoldReasonText}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="protected" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Protected Transactions</h3>
                  <p className="text-muted-foreground">No orders with protected transactions found.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((order) => (
                <ProtectedTransactionCard
                  key={order.id}
                  order={order}
                  onRelease={() => setReleaseDialogOpen(order.id)}
                  onConfirmDelivery={() => handleConfirmDelivery(order.id)}
                  onView={() => handleViewOrder(order)}
                  getStatusBadge={getStatusBadge}
                  isProcessing={processingOrderId === order.id}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="disputes" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Open Disputes</h3>
                  <p className="text-muted-foreground">All disputes have been resolved.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((order) => (
                <DisputeCard
                  key={order.id}
                  order={order}
                  onResolve={() => setResolveDialogOpen(order.id)}
                  onView={() => handleViewOrder(order)}
                  getStatusBadge={getStatusBadge}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ready_to_release" className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Orders Ready to Release</h3>
                  <p className="text-muted-foreground">No orders are currently eligible for payout release.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((order) => (
                <div key={order.id} className="flex items-start gap-2">
                  <Checkbox
                    checked={selectedOrderIds.has(order.id)}
                    onCheckedChange={(checked) => {
                      const newSet = new Set(selectedOrderIds);
                      if (checked) {
                        newSet.add(order.id);
                      } else {
                        newSet.delete(order.id);
                      }
                      setSelectedOrderIds(newSet);
                    }}
                    className="mt-6"
                  />
                  <div className="flex-1">
                    <ReadyToReleaseCard
                      order={order}
                      onRelease={() => setReleaseDialogOpen(order.id)}
                      onView={() => handleViewOrder(order)}
                      getStatusBadge={getStatusBadge}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Release Dialog */}
      <Dialog open={!!releaseDialogOpen} onOpenChange={(open) => !open && setReleaseDialogOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release Payout</DialogTitle>
            <DialogDescription>
              Are you sure you want to release the payout for this order? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReleaseDialogOpen(null)}>Cancel</Button>
            <Button
              onClick={() => releaseDialogOpen && handleReleasePayout(releaseDialogOpen)}
              disabled={processingOrderId === releaseDialogOpen}
            >
              {processingOrderId === releaseDialogOpen ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Release Payout'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={!!refundDialogOpen} onOpenChange={(open) => !open && setRefundDialogOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Refund</DialogTitle>
            <DialogDescription>
              Process a full or partial refund for this order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Refund Amount (leave empty for full refund)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Enter amount or leave empty for full refund"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Reason *</Label>
              <Textarea
                placeholder="Reason for refund..."
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                required
              />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Additional notes..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundDialogOpen(null)}>Cancel</Button>
            <Button
              onClick={handleProcessRefund}
              disabled={processingOrderId === refundDialogOpen || !refundReason.trim()}
            >
              {processingOrderId === refundDialogOpen ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Process Refund'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Dispute Dialog */}
      <Dialog open={!!resolveDialogOpen} onOpenChange={(open) => !open && setResolveDialogOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Resolve Dispute</DialogTitle>
            <DialogDescription>
              Choose how to resolve this dispute.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Resolution</Label>
              <Select value={resolutionType} onValueChange={(v) => setResolutionType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="release">Release Funds to Seller</SelectItem>
                  <SelectItem value="refund">Full Refund to Buyer</SelectItem>
                  <SelectItem value="partial_refund">Partial Refund</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {resolutionType.includes('refund') && (
              <>
                <div>
                  <Label>Refund Amount {resolutionType === 'partial_refund' ? '(required)' : '(leave empty for full)'}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Enter amount"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Refund Reason</Label>
                  <Textarea
                    placeholder="Reason for refund..."
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                  />
                </div>
              </>
            )}
            <div>
              <Label>Admin Notes (required)</Label>
              <Textarea
                placeholder="Internal notes explaining the resolution..."
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveDialogOpen(null)}>Cancel</Button>
            <Button
              onClick={handleResolveDispute}
              disabled={processingOrderId === resolveDialogOpen || !adminNotes.trim()}
            >
              {processingOrderId === resolveDialogOpen ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Resolve Dispute'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Action Dialogs */}
      <Dialog open={bulkActionDialogOpen === 'release'} onOpenChange={(open) => !open && setBulkActionDialogOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Release Payouts</DialogTitle>
            <DialogDescription>
              Release payouts for {selectedOrderIds.size} selected order{selectedOrderIds.size !== 1 ? 's' : ''}?
              Total amount: {formatCurrency(filteredOrders.filter(o => selectedOrderIds.has(o.id)).reduce((sum, o) => sum + o.sellerAmount, 0))}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkActionDialogOpen(null)}>Cancel</Button>
            <Button onClick={handleBulkRelease} disabled={processingOrderId === 'bulk'}>
              {processingOrderId === 'bulk' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Release All'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkActionDialogOpen === 'hold' || bulkActionDialogOpen === 'unhold'} onOpenChange={(open) => !open && setBulkActionDialogOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk {bulkActionDialogOpen === 'hold' ? 'Hold' : 'Unhold'}</DialogTitle>
            <DialogDescription>
              {bulkActionDialogOpen === 'hold' ? 'Place hold on' : 'Remove hold from'} {selectedOrderIds.size} selected order{selectedOrderIds.size !== 1 ? 's' : ''}?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Reason (required)</Label>
              <Input
                placeholder="Reason for hold/unhold..."
                value={bulkHoldReason}
                onChange={(e) => setBulkHoldReason(e.target.value)}
              />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Additional notes..."
                value={bulkHoldNotes}
                onChange={(e) => setBulkHoldNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkActionDialogOpen(null)}>Cancel</Button>
            <Button 
              onClick={bulkActionDialogOpen === 'hold' ? handleBulkHold : handleBulkUnhold} 
              disabled={processingOrderId === 'bulk' || !bulkHoldReason.trim()}
            >
              {processingOrderId === 'bulk' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                `Confirm ${bulkActionDialogOpen === 'hold' ? 'Hold' : 'Unhold'}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>
              Complete order information and timeline
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-6">
              {/* Phase 2G: Admin Order Health Summary (derived; no DB writes) */}
              <div className="space-y-3 p-4 rounded-lg border border-border/50 bg-muted/20">
                {(() => {
                  const trust = getOrderTrustState(selectedOrder);
                  const issue = getOrderIssueState(selectedOrder);
                  const now = new Date();
                  const protectionEndsAt = selectedOrder.protectionEndsAt || null;
                  const protectionRemaining =
                    protectionEndsAt && protectionEndsAt.getTime() > now.getTime()
                      ? formatDistanceToNow(protectionEndsAt, { addSuffix: true })
                      : null;

                  const hasDeliveryMarked = !!selectedOrder.deliveredAt || !!selectedOrder.deliveryConfirmedAt;
                  const hasBuyerConfirmation =
                    !!selectedOrder.buyerConfirmedAt ||
                    !!selectedOrder.buyerAcceptedAt ||
                    !!selectedOrder.acceptedAt ||
                    selectedOrder.status === 'ready_to_release' ||
                    selectedOrder.status === 'buyer_confirmed' ||
                    selectedOrder.status === 'accepted';

                  const hasOpenProtectedDispute =
                    !!selectedOrder.disputeStatus && ['open', 'needs_evidence', 'under_review'].includes(selectedOrder.disputeStatus);
                  const hasChargeback =
                    !!selectedOrder.chargebackStatus &&
                    ['open', 'active', 'funds_withdrawn', 'needs_response', 'warning_needs_response'].includes(selectedOrder.chargebackStatus as any);
                  const inProtectionWindow =
                    selectedOrder.payoutHoldReason === 'protection_window' &&
                    protectionEndsAt &&
                    protectionEndsAt.getTime() > now.getTime();

                  const payoutEligible =
                    !selectedOrder.stripeTransferId &&
                    !selectedOrder.adminHold &&
                    !hasOpenProtectedDispute &&
                    !hasChargeback &&
                    !inProtectionWindow &&
                    hasDeliveryMarked &&
                    hasBuyerConfirmation &&
                    (selectedOrder.status === 'ready_to_release' ||
                      selectedOrder.status === 'buyer_confirmed' ||
                      selectedOrder.status === 'accepted');

                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Trust state</Label>
                        <div className="mt-1">
                          <Badge variant="secondary" className="font-semibold text-xs capitalize">
                            {trust.replaceAll('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Issue state</Label>
                        <div className="mt-1">
                          <Badge variant={issue === 'none' ? 'secondary' : 'destructive'} className="font-semibold text-xs capitalize">
                            {issue.replaceAll('_', ' ')}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Payout eligible</Label>
                        <div className="mt-1">
                          <Badge variant={payoutEligible ? 'default' : 'secondary'} className="font-semibold text-xs">
                            {payoutEligible ? 'Yes' : 'No'}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Protection window</Label>
                        <div className="mt-1 text-xs">
                          {protectionRemaining ? (
                            <Badge variant="secondary" className="font-semibold text-xs">
                              Ends {protectionRemaining}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2 md:col-span-4">
                        <Label className="text-xs text-muted-foreground">Compliance</Label>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="font-semibold text-xs">
                            {(selectedOrder.listingCategory as any) || 'unknown_category'}
                          </Badge>
                          <Badge variant="outline" className="font-semibold text-xs">
                            {(selectedOrder.listingComplianceStatus as any) || 'unknown_compliance'}
                          </Badge>
                          {selectedOrder.transferPermitRequired !== false && (
                            <Badge variant="outline" className="font-semibold text-xs">
                              Transfer permit: {selectedOrder.transferPermitStatus || 'none'}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Order Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Order ID</Label>
                  <p className="font-mono text-sm">{selectedOrder.id}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    {getStatusBadge(selectedOrder.status, selectedOrder.disputeStatus, selectedOrder.payoutHoldReason)}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Amount</Label>
                  <p className="text-sm font-semibold">{formatCurrency(selectedOrder.amount)}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Seller Receives</Label>
                  <p className="text-sm font-semibold">{formatCurrency(selectedOrder.sellerAmount)}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Buyer</Label>
                  <p className="text-sm">{selectedOrder.buyerName}</p>
                  <p className="text-xs text-muted-foreground">{selectedOrder.buyerEmail}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Seller</Label>
                  <p className="text-sm">{selectedOrder.sellerName}</p>
                  <p className="text-xs text-muted-foreground">{selectedOrder.sellerEmail}</p>
                </div>
                {selectedOrder.stripePaymentIntentId && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Payment Intent ID</Label>
                    <p className="font-mono text-xs">{selectedOrder.stripePaymentIntentId}</p>
                  </div>
                )}
                {selectedOrder.stripeTransferId && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Transfer ID</Label>
                    <p className="font-mono text-xs">{selectedOrder.stripeTransferId}</p>
                  </div>
                )}
              </div>

              {/* Listing Info */}
              <div>
                <Label className="text-xs text-muted-foreground">Listing</Label>
                <div className="mt-2 flex items-center gap-3">
                  {selectedOrder.listingImage && (
                    <img
                      src={selectedOrder.listingImage}
                      alt={selectedOrder.listingTitle || 'Listing'}
                      className="w-16 h-16 object-cover rounded"
                    />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold">{selectedOrder.listingTitle || 'Unknown Listing'}</p>
                    <a
                      href={`/listings/${selectedOrder.listingId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      View Listing →
                    </a>
                  </div>
                </div>
              </div>

              {/* Hold Reason and Next Action */}
              {selectedOrder && (() => {
                const holdInfo = getHoldInfo(selectedOrder);
                return (
                  <div className="space-y-4 p-4 rounded-lg border border-border/50 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Payout Hold Information</Label>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const explanation = generatePayoutExplanation(selectedOrder);
                          await navigator.clipboard.writeText(explanation);
                          setCopiedExplanation(true);
                          setTimeout(() => setCopiedExplanation(false), 2000);
                          toast({
                            title: 'Copied',
                            description: 'Payout explanation copied to clipboard',
                          });
                        }}
                      >
                        {copiedExplanation ? (
                          <>
                            <Check className="mr-2 h-4 w-4" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy Explanation
                          </>
                        )}
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Hold Reason</Label>
                        <p className="text-sm font-medium mt-1">{holdInfo.reason}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Next Action</Label>
                        <p className="text-sm mt-1">{holdInfo.nextAction}</p>
                      </div>
                      {holdInfo.earliestReleaseDate && (
                        <div className="col-span-2">
                          <Label className="text-xs text-muted-foreground">Earliest Release Date</Label>
                          <p className="text-sm mt-1">{holdInfo.earliestReleaseDate.toLocaleString()}</p>
                        </div>
                      )}
                      <div className="col-span-2">
                        <Label className="text-xs text-muted-foreground">Can Release</Label>
                        <Badge variant={holdInfo.canRelease ? 'default' : 'secondary'} className="mt-1">
                          {holdInfo.canRelease ? 'Yes' : 'No'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Timeline */}
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Transaction Timeline (Unified)</Label>
                <TransactionTimeline order={selectedOrder} role="admin" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Order Card Component
function OrderCard({
  order,
  onRelease,
  onRefund,
  onMarkPaid,
  onView,
  getStatusBadge,
  getHoldReasonText,
}: {
  order: OrderWithDetails;
  onRelease: () => void;
  onRefund: () => void;
  onMarkPaid: () => void;
  onView: () => void;
  getStatusBadge: (status: OrderStatus, disputeStatus?: DisputeStatus, payoutHoldReason?: PayoutHoldReason) => JSX.Element;
  getHoldReasonText: (reason: PayoutHoldReason) => string;
}) {
  const isAwaitingBankRails = order.status === 'awaiting_bank_transfer' || order.status === 'awaiting_wire';
  const isReleaseCandidate = order.status === 'ready_to_release' || order.status === 'buyer_confirmed' || order.status === 'accepted';

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">#{order.id.slice(-8)}</span>
              {getStatusBadge(order.status, order.disputeStatus, order.payoutHoldReason)}
            </div>
            <h3 className="font-semibold">{order.listingTitle || 'Unknown Listing'}</h3>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Buyer: {order.buyerName} ({order.buyerEmail})</p>
              <p>Seller: {order.sellerName} ({order.sellerEmail})</p>
              <p>Amount: {formatCurrency(order.amount)} | Seller receives: {formatCurrency(order.sellerAmount)}</p>
              <p>Created: {formatDate(order.createdAt)}</p>
              {order.payoutHoldReason && order.payoutHoldReason !== 'none' && (
                <p className="text-orange-600">Hold: {getHoldReasonText(order.payoutHoldReason)}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onView}>
              <Eye className="h-4 w-4 mr-2" />
              View
            </Button>
            {isAwaitingBankRails ? (
              <Button size="sm" onClick={onMarkPaid} className="bg-blue-600 hover:bg-blue-700">
                <CheckCircle className="h-4 w-4 mr-2" />
                Mark Paid (Stripe)
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={onRelease}
                disabled={!isReleaseCandidate}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Release
              </Button>
            )}
            <Button variant="destructive" size="sm" onClick={onRefund}>
              Refund
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Protected Transaction Card
function ProtectedTransactionCard({
  order,
  onRelease,
  onConfirmDelivery,
  onView,
  getStatusBadge,
  isProcessing,
}: {
  order: OrderWithDetails;
  onRelease: () => void;
  onConfirmDelivery: () => void;
  onView: () => void;
  getStatusBadge: (status: OrderStatus, disputeStatus?: DisputeStatus, payoutHoldReason?: PayoutHoldReason) => JSX.Element;
  isProcessing: boolean;
}) {
  const timeRemaining = order.protectionEndsAt 
    ? formatDistanceToNow(order.protectionEndsAt, { addSuffix: true })
    : 'N/A';
  
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">#{order.id.slice(-8)}</span>
              {getStatusBadge(order.status, order.disputeStatus, order.payoutHoldReason)}
              <Badge variant="outline" className="bg-blue-50">
                <Shield className="h-3 w-3 mr-1" />
                {order.protectedTransactionDaysSnapshot} Days
              </Badge>
            </div>
            <h3 className="font-semibold">{order.listingTitle || 'Unknown Listing'}</h3>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Seller: {order.sellerName} | Buyer: {order.buyerName}</p>
              <p>Amount: {formatCurrency(order.amount)}</p>
              {order.protectionEndsAt && (
                <p>Protection ends: {timeRemaining}</p>
              )}
              {order.disputeStatus && order.disputeStatus !== 'none' && (
                <p className="text-orange-600">Dispute: {order.disputeStatus}</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onView}>
              <Eye className="h-4 w-4 mr-2" />
              View
            </Button>
            {!order.deliveryConfirmedAt && order.protectedTransactionDaysSnapshot && (
              <Button 
                size="sm" 
                onClick={onConfirmDelivery} 
                disabled={isProcessing}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Truck className="h-4 w-4 mr-2" />
                    Confirm Delivery
                  </>
                )}
              </Button>
            )}
            {order.deliveryConfirmedAt && (!order.protectionEndsAt || order.protectionEndsAt.getTime() <= Date.now()) && (
              <Button size="sm" onClick={onRelease} className="bg-green-600 hover:bg-green-700">
                <CheckCircle className="h-4 w-4 mr-2" />
                Release
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Dispute Card
function DisputeCard({
  order,
  onResolve,
  onView,
  getStatusBadge,
}: {
  order: OrderWithDetails;
  onResolve: () => void;
  onView: () => void;
  getStatusBadge: (status: OrderStatus, disputeStatus?: DisputeStatus, payoutHoldReason?: PayoutHoldReason) => JSX.Element;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">#{order.id.slice(-8)}</span>
              {getStatusBadge(order.status, order.disputeStatus, order.payoutHoldReason)}
            </div>
            <h3 className="font-semibold">{order.listingTitle || 'Unknown Listing'}</h3>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Buyer: {order.buyerName} | Seller: {order.sellerName}</p>
              <p>Amount: {formatCurrency(order.amount)}</p>
              {order.disputeReasonV2 && (
                <p>Reason: {order.disputeReasonV2}</p>
              )}
              {order.disputeOpenedAt && (
                <p>Opened: {formatDate(order.disputeOpenedAt)}</p>
              )}
              {order.disputeEvidence && order.disputeEvidence.length > 0 && (
                <p>Evidence: {order.disputeEvidence.length} item(s)</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onView}>
              <Eye className="h-4 w-4 mr-2" />
              View Evidence
            </Button>
            <Button size="sm" onClick={onResolve} className="bg-blue-600 hover:bg-blue-700">
              <CheckCircle className="h-4 w-4 mr-2" />
              Resolve
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Ready to Release Card
function ReadyToReleaseCard({
  order,
  onRelease,
  onView,
  getStatusBadge,
}: {
  order: OrderWithDetails;
  onRelease: () => void;
  onView: () => void;
  getStatusBadge: (status: OrderStatus, disputeStatus?: DisputeStatus, payoutHoldReason?: PayoutHoldReason) => JSX.Element;
}) {
  const eligibleReason =
    order.status === 'ready_to_release'
      ? 'Ready to release'
      : order.buyerConfirmedAt || order.buyerAcceptedAt || order.acceptedAt
        ? 'Buyer confirmed receipt'
        : 'Eligible';
  
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">#{order.id.slice(-8)}</span>
              {getStatusBadge(order.status, order.disputeStatus, order.payoutHoldReason)}
            </div>
            <h3 className="font-semibold">{order.listingTitle || 'Unknown Listing'}</h3>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Seller: {order.sellerName} | Amount: {formatCurrency(order.sellerAmount)}</p>
              <p className="text-green-600 font-medium">Eligible: {eligibleReason}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onView}>
              <Eye className="h-4 w-4 mr-2" />
              View
            </Button>
            <Button size="sm" onClick={onRelease} className="bg-green-600 hover:bg-green-700">
              <CheckCircle className="h-4 w-4 mr-2" />
              Release Payout
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
