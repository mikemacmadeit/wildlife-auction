/**
 * Admin Ops Dashboard - Fulfillment-first console for managing order fulfillment
 * 
 * Lanes (organized by transactionStatus):
 * - Overdue: Orders past SLA deadline, not completed
 * - Needs Action: Active fulfillment statuses requiring action
 * - Disputes: Orders with open disputes
 * - Completed: Completed orders
 * 
 * NOTE: Sellers are paid immediately via Stripe Connect destination charges - no payout release needed.
 */

'use client';

/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DashboardContentSkeleton } from '@/components/skeletons/DashboardContentSkeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  Mail,
  CreditCard,
  ArrowRight,
  TrendingUp,
  Truck,
  XCircle,
} from 'lucide-react';
import { cn, formatCurrency, formatDate, formatDistanceToNow } from '@/lib/utils';
import { formatUserFacingError } from '@/lib/format-user-facing-error';
import { Order } from '@/lib/types';
import { getAdminOrders } from '@/lib/stripe/api';
import { getListingById } from '@/lib/firebase/listings';
import { getUserProfile } from '@/lib/firebase/users';
// DEPRECATED: releasePayment removed - sellers paid immediately via destination charges
import { processRefund, resolveDispute, confirmDelivery, adminMarkOrderPaid } from '@/lib/stripe/api';
import { TransactionTimeline } from '@/components/orders/TransactionTimeline';
import { useDebounce } from '@/hooks/use-debounce';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
// DEPRECATED: hold-reasons.ts - sellers paid immediately, no payout holds
import { Copy, Check, ChevronDown, MoreHorizontal } from 'lucide-react';
import { getOrderTrustState } from '@/lib/orders/getOrderTrustState';
import { getOrderIssueState } from '@/lib/orders/getOrderIssueState';
import { getEffectiveTransactionStatus } from '@/lib/orders/status';
import { getNextRequiredAction, getUXBadge } from '@/lib/orders/progress';
import { isStripeTestModeClient } from '@/lib/stripe/mode';
import { AIAdminSummary } from '@/components/admin/AIAdminSummary';
import { AIDisputeSummary } from '@/components/admin/AIDisputeSummary';
import { DeliveryProofTimelineBlock } from '@/components/delivery/DeliveryProofTimelineBlock';

interface OrderWithDetails extends Order {
  listingTitle?: string;
  listingImage?: string;
  listingComplianceStatus?: string;
  listingCategory?: string;
  buyerName?: string;
  buyerEmail?: string;
  sellerName?: string;
  sellerEmail?: string;
  fulfillmentSlaDeadlineAt?: Date;
  fulfillmentSlaStartedAt?: Date;
}

// Fulfillment-first lanes (no legacy tabs)
type FulfillmentLane = 'overdue' | 'needs_action' | 'disputes' | 'completed';

export default function OpsClient() {
  const { isAdmin, isSuperAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [activeLane, setActiveLane] = useState<FulfillmentLane>('needs_action');
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [sortBySla, setSortBySla] = useState(true);
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [bulkActionDialogOpen, setBulkActionDialogOpen] = useState<'hold' | 'unhold' | null>(null);
  const [bulkHoldReason, setBulkHoldReason] = useState('');
  const [bulkHoldNotes, setBulkHoldNotes] = useState('');
  
  // Dialog states
  const [refundDialogOpen, setRefundDialogOpen] = useState<string | null>(null);
  const [resolveDialogOpen, setResolveDialogOpen] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [resolutionType, setResolutionType] = useState<'refund' | 'partial_refund'>('refund');
  const [adminNotes, setAdminNotes] = useState('');
  const [copiedExplanation, setCopiedExplanation] = useState(false);
  const [freezeDialogOpen, setFreezeDialogOpen] = useState<string | null>(null);
  const [freezeReason, setFreezeReason] = useState('');
  const [reminderDialogOpen, setReminderDialogOpen] = useState<string | null>(null);
  const [reminderRole, setReminderRole] = useState<'buyer' | 'seller' | null>(null);
  const [reminderMessage, setReminderMessage] = useState('');
  const [bulkReminderDialogOpen, setBulkReminderDialogOpen] = useState(false);
  const [bulkReminderRole, setBulkReminderRole] = useState<'buyer' | 'seller'>('seller');
  const [bulkReminderMessage, setBulkReminderMessage] = useState('');
  const [orderAuditLogs, setOrderAuditLogs] = useState<{ actorUid: string; actionType: string; createdAt: string | null; beforeState: any; afterState: any }[]>([]);
  const [loadingOrderAudit, setLoadingOrderAudit] = useState(false);
  const [orderReview, setOrderReview] = useState<any | null>(null);
  const [loadingOrderReview, setLoadingOrderReview] = useState(false);
  const [orderAdminNoteText, setOrderAdminNoteText] = useState('');
  const [orderAdminNoteSubmitting, setOrderAdminNoteSubmitting] = useState<string | null>(null);
  const [revenueStats, setRevenueStats] = useState<{
    platformFees: { last30Days: number; allTime: number };
    orders: { last30Days: number };
  } | null>(null);

  const handleViewOrder = useCallback((order: OrderWithDetails) => {
    setSelectedOrder(order);
    setDetailDialogOpen(true);
  }, []);

  const orderIdFromUrl = searchParams?.get('orderId') || null;

  useEffect(() => {
    if (!detailDialogOpen || !selectedOrder?.id || !user?.uid) {
      setOrderAuditLogs([]);
      return;
    }
    let cancelled = false;
    setLoadingOrderAudit(true);
    user.getIdToken().then((token) => {
      return fetch(`/api/admin/orders/${selectedOrder.id}/audit`, { headers: { Authorization: `Bearer ${token}` } });
    }).then((res) => res.json()).then((json) => {
      if (cancelled) return;
      if (json?.ok && Array.isArray(json.logs)) setOrderAuditLogs(json.logs);
      else setOrderAuditLogs([]);
    }).catch(() => {
      if (!cancelled) setOrderAuditLogs([]);
    }).finally(() => {
      if (!cancelled) setLoadingOrderAudit(false);
    });
    return () => { cancelled = true; };
  }, [detailDialogOpen, selectedOrder?.id, user?.uid]);

  useEffect(() => {
    if (!detailDialogOpen || !selectedOrder?.id || !user?.uid) {
      setOrderReview(null);
      return;
    }
    let cancelled = false;
    setLoadingOrderReview(true);
    user.getIdToken().then((token) => {
      return fetch(`/api/admin/reviews/${selectedOrder.id}`, { headers: { Authorization: `Bearer ${token}` } });
    }).then((res) => res.json()).then((json) => {
      if (cancelled) return;
      if (json?.ok) setOrderReview(json.review || null);
      else setOrderReview(null);
    }).catch(() => {
      if (!cancelled) setOrderReview(null);
    }).finally(() => {
      if (!cancelled) setLoadingOrderReview(false);
    });
    return () => { cancelled = true; };
  }, [detailDialogOpen, selectedOrder?.id, user?.uid]);

  useEffect(() => {
    if (!orderIdFromUrl || !user?.uid || !isAdmin || orders.length === 0) return;
    const order = orders.find((o) => o.id === orderIdFromUrl);
    if (order) {
      setSelectedOrder(order);
      setDetailDialogOpen(true);
    }
  }, [orderIdFromUrl, user?.uid, isAdmin, orders]);

  const loadOrders = useCallback(async () => {
    if (!user?.uid || !isAdmin) return;
    
    setLoading(true);
    try {
      // Load all orders - we'll filter by txStatus client-side
      const result = await getAdminOrders('all');
      
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
              'refundedAt', 'completedAt', 'fulfillmentSlaDeadlineAt', 'fulfillmentSlaStartedAt',
              // Stripe settlement visibility (server-authored via webhooks)
              'stripeFundsAvailableOn'
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
        description: formatUserFacingError(error, 'Failed to load orders'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user?.uid, isAdmin, toast]);

  const loadRevenueStats = useCallback(async () => {
    if (!user?.uid || !isAdmin) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/admin/revenue', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRevenueStats({
          platformFees: data.platformFees || { last30Days: 0, allTime: 0 },
          orders: data.orders || { last30Days: 0 },
        });
      }
    } catch {
      setRevenueStats(null);
    }
  }, [user?.uid, isAdmin]);

  // Load orders and revenue stats when tab changes
  useEffect(() => {
    if (!adminLoading && isAdmin && user) {
      loadOrders();
      loadRevenueStats();
    }
  }, [adminLoading, isAdmin, user, loadOrders, loadRevenueStats]);

  // Debounce search query
  const debouncedSearchQuery = useDebounce(searchQuery, 300);


  // Filter orders by search query (enhanced with paymentIntentId)
  const searchFilteredOrders = useMemo(() => {
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

  // Organize orders into fulfillment lanes based on txStatus
  const laneOrders = useMemo(() => {
    const now = Date.now();
    const overdue: OrderWithDetails[] = [];
    const needsAction: OrderWithDetails[] = [];
    const atRisk: OrderWithDetails[] = []; // SLA < 24h or stalled > 48h
    const disputes: OrderWithDetails[] = [];
    const completed: OrderWithDetails[] = [];

    searchFilteredOrders.forEach(order => {
      const txStatus = getEffectiveTransactionStatus(order);
      
      // Overdue: SLA deadline passed and not completed
      if (order.fulfillmentSlaDeadlineAt && 
          order.fulfillmentSlaDeadlineAt.getTime() < now && 
          txStatus !== 'COMPLETED') {
        overdue.push(order);
        return;
      }

      // Disputes
      if (txStatus === 'DISPUTE_OPENED') {
        disputes.push(order);
        return;
      }

      // Completed
      if (txStatus === 'COMPLETED') {
        completed.push(order);
        return;
      }

      // Needs Action: all other active fulfillment statuses (including compliance gate)
      if (['AWAITING_TRANSFER_COMPLIANCE', 'FULFILLMENT_REQUIRED', 'PAID', 'DELIVERY_SCHEDULED', 'OUT_FOR_DELIVERY', 
           'READY_FOR_PICKUP', 'PICKUP_SCHEDULED', 'DELIVERED_PENDING_CONFIRMATION'].includes(txStatus)) {
        needsAction.push(order);
        
        // Check if "At Risk" (SLA < 24h or stalled > 48h)
        const slaDeadline = order.fulfillmentSlaDeadlineAt?.getTime();
        const hoursUntilSla = slaDeadline ? (slaDeadline - now) / (1000 * 60 * 60) : null;
        const lastStatusChange = order.lastStatusChangedAt?.getTime() || order.updatedAt?.getTime() || order.createdAt?.getTime() || 0;
        const hoursSinceStatusChange = (now - lastStatusChange) / (1000 * 60 * 60);
        
        if ((hoursUntilSla !== null && hoursUntilSla < 24 && hoursUntilSla > 0) || hoursSinceStatusChange > 48) {
          atRisk.push(order);
        }
        return;
      }
    });

    // Sort Needs Action by SLA deadline (soonest first) if enabled
    if (sortBySla) {
      needsAction.sort((a, b) => {
        const aDeadline = a.fulfillmentSlaDeadlineAt?.getTime() || Infinity;
        const bDeadline = b.fulfillmentSlaDeadlineAt?.getTime() || Infinity;
        return aDeadline - bDeadline;
      });
      atRisk.sort((a, b) => {
        const aDeadline = a.fulfillmentSlaDeadlineAt?.getTime() || Infinity;
        const bDeadline = b.fulfillmentSlaDeadlineAt?.getTime() || Infinity;
        return aDeadline - bDeadline;
      });
    }

    return { overdue, needsAction, atRisk, disputes, completed };
  }, [searchFilteredOrders, sortBySla]);

  // Get orders for active lane
  const filteredOrders = useMemo(() => {
    if (activeLane === 'overdue') {
      return laneOrders.overdue;
    }
    if (activeLane === 'needs_action') {
      // If "Overdue only" toggle is on, show overdue items in needs_action lane
      // If "At Risk" grouping is enabled, show at-risk items first
      if (showOverdueOnly) {
        return laneOrders.overdue;
      }
      // Show at-risk items first, then regular needs action
      return [...laneOrders.atRisk, ...laneOrders.needsAction.filter(o => !laneOrders.atRisk.includes(o))];
    }
    return laneOrders[activeLane] || [];
  }, [activeLane, laneOrders, showOverdueOnly]);

  // Action handlers

  const handleMarkPaid = useCallback(async (orderId: string) => {
    setProcessingOrderId(orderId);
    try {
      await adminMarkOrderPaid(orderId);
      toast({
        title: 'Payment confirmed',
        description: 'Order marked as paid. Seller was paid immediately via destination charge.',
      });
      await loadOrders();
    } catch (error: any) {
      console.error('Error marking paid:', error);
      toast({
        title: 'Error',
        description: formatUserFacingError(error, 'Failed to mark order paid'),
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
        description: formatUserFacingError(error, 'Failed to process refund'),
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
      setResolutionType('refund');
      setRefundAmount('');
      setRefundReason('');
      setAdminNotes('');
      await loadOrders();
    } catch (error: any) {
      console.error('Error resolving dispute:', error);
      toast({
        title: 'Error',
        description: formatUserFacingError(error, 'Failed to resolve dispute'),
        variant: 'destructive',
      });
    } finally {
      setProcessingOrderId(null);
    }
  }, [resolveDialogOpen, resolutionType, refundAmount, refundReason, adminNotes, loadOrders, toast]);

  // Calculate stats based on txStatus
  const stats = useMemo(() => {
    const total = orders.length;
    const now = Date.now();
    const overdue = orders.filter(o => {
      const txStatus = getEffectiveTransactionStatus(o);
      return o.fulfillmentSlaDeadlineAt && 
             o.fulfillmentSlaDeadlineAt.getTime() < now && 
             txStatus !== 'COMPLETED';
    }).length;
    const needsAction = orders.filter(o => {
      const txStatus = getEffectiveTransactionStatus(o);
      return ['FULFILLMENT_REQUIRED', 'PAID', 'DELIVERY_SCHEDULED', 'OUT_FOR_DELIVERY', 
              'READY_FOR_PICKUP', 'PICKUP_SCHEDULED', 'DELIVERED_PENDING_CONFIRMATION'].includes(txStatus);
    }).length;
    const disputes = orders.filter(o => getEffectiveTransactionStatus(o) === 'DISPUTE_OPENED').length;
    const completed = orders.filter(o => getEffectiveTransactionStatus(o) === 'COMPLETED').length;
    const totalValue = orders.reduce((sum, o) => sum + o.amount, 0);
    const totalFees = orders.reduce((sum, o) => sum + (o.platformFee || 0), 0);
    const totalPayouts = orders.reduce((sum, o) => sum + o.sellerAmount, 0);

    return { total, overdue, needsAction, disputes, completed, totalValue, totalFees, totalPayouts };
  }, [orders]);

  // Delivery timeline stage counts (for pipeline view)
  const deliveryStageCounts = useMemo(() => {
    const counts: Record<string, number> = {
      pendingPayment: 0,
      fulfillmentRequired: 0,
      scheduled: 0,
      outForDelivery: 0,
      awaitingConfirmation: 0,
      completed: 0,
    };
    orders.forEach((o) => {
      const tx = getEffectiveTransactionStatus(o);
      if (tx === 'PENDING_PAYMENT') counts.pendingPayment++;
      else if (['FULFILLMENT_REQUIRED', 'PAID', 'AWAITING_TRANSFER_COMPLIANCE'].includes(tx)) counts.fulfillmentRequired++;
      else if (['DELIVERY_PROPOSED', 'DELIVERY_SCHEDULED', 'READY_FOR_PICKUP', 'PICKUP_PROPOSED', 'PICKUP_SCHEDULED'].includes(tx)) counts.scheduled++;
      else if (tx === 'OUT_FOR_DELIVERY') counts.outForDelivery++;
      else if (['DELIVERED_PENDING_CONFIRMATION', 'PICKED_UP'].includes(tx)) counts.awaitingConfirmation++;
      else if (tx === 'COMPLETED') counts.completed++;
    });
    return counts;
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
        description: formatUserFacingError(error, 'Failed to confirm delivery'),
        variant: 'destructive',
      });
    } finally {
      setProcessingOrderId(null);
    }
  }, [loadOrders, toast]);

  // Bulk release removed - sellers paid immediately

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
        results.push({ orderId: order.id, success: false, error: formatUserFacingError(error, 'Unknown error') });
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
        results.push({ orderId: order.id, success: false, error: formatUserFacingError(error, 'Unknown error') });
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

  // Reset selection when lane changes
  useEffect(() => {
    setSelectedOrderIds(new Set());
  }, [activeLane]);

  // Status badge helpers - Updated to reflect immediate payment (no payout holds)
  // Removed getStatusBadge and getHoldReasonText - all badges now use txStatus from getEffectiveTransactionStatus

  if (adminLoading) {
    return <DashboardContentSkeleton />;
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-3 sm:px-4 py-4 md:py-8 pb-20 md:pb-6">
        <Card className="rounded-xl border border-border/60 bg-card">
          <CardContent className="pt-6 px-4 sm:px-6">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl md:text-2xl font-bold mb-2">Access Denied</h2>
              <p className="text-muted-foreground text-sm md:text-base">You don't have permission to access this page.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-3 sm:px-4 py-4 md:py-8 max-w-6xl space-y-4 md:space-y-6">
      {/* Header */}
      <div className="min-w-0">
        <h1 className="text-2xl md:text-3xl font-bold mb-1 md:mb-2">Admin Operations Dashboard</h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Monitor fulfillment, disputes, and compliance. Sellers are paid immediately upon payment.
        </p>
      </div>

      {/* Stats Dashboard — clickable for quick lane switch */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3">
        {laneOrders.atRisk.length > 0 && (
          <Card
            className="rounded-xl border-2 border-destructive/50 bg-destructive/5 cursor-pointer hover:bg-destructive/10 transition-colors"
            onClick={() => setActiveLane('needs_action')}
          >
            <CardContent className="pt-4 pb-4 md:pt-5 flex items-center justify-between px-3 md:px-5">
              <div className="min-w-0">
                <p className="text-[10px] md:text-xs font-semibold text-destructive uppercase tracking-wide">At Risk</p>
                <p className="text-xl md:text-2xl font-bold text-destructive">{laneOrders.atRisk.length}</p>
                <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">SLA or stalled</p>
              </div>
              <AlertTriangle className="h-6 w-6 md:h-8 md:w-8 text-destructive shrink-0" />
            </CardContent>
          </Card>
        )}
        <Card
          className={`rounded-xl border border-border/60 md:border-2 cursor-pointer transition-colors ${activeLane === 'overdue' ? 'border-orange-500 bg-orange-500/5' : 'bg-muted/30 dark:bg-muted/20 md:bg-card hover:bg-muted/50'}`}
          onClick={() => setActiveLane('overdue')}
        >
          <CardContent className="pt-4 pb-4 md:pt-5 flex items-center justify-between px-3 md:px-5">
            <div className="min-w-0">
              <p className="text-[10px] md:text-xs font-medium text-muted-foreground">Overdue</p>
              <p className="text-xl md:text-2xl font-bold">{stats.overdue}</p>
              <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">Past SLA</p>
            </div>
            <AlertTriangle className="h-5 w-5 md:h-7 md:w-7 text-orange-600 shrink-0" />
          </CardContent>
        </Card>
        <Card
          className={`rounded-xl border border-border/60 md:border-2 cursor-pointer transition-colors ${activeLane === 'needs_action' ? 'border-primary bg-primary/5' : 'bg-muted/30 dark:bg-muted/20 md:bg-card hover:bg-muted/50'}`}
          onClick={() => setActiveLane('needs_action')}
        >
          <CardContent className="pt-4 pb-4 md:pt-5 flex items-center justify-between px-3 md:px-5">
            <div className="min-w-0">
              <p className="text-[10px] md:text-xs font-medium text-muted-foreground">Needs Action</p>
              <p className="text-xl md:text-2xl font-bold">{stats.needsAction}</p>
              <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">Active orders</p>
            </div>
            <Clock className="h-5 w-5 md:h-7 md:w-7 text-orange-600 shrink-0" />
          </CardContent>
        </Card>
        <Card
          className={`rounded-xl border border-border/60 md:border-2 cursor-pointer transition-colors ${activeLane === 'disputes' ? 'border-destructive bg-destructive/5' : 'bg-muted/30 dark:bg-muted/20 md:bg-card hover:bg-muted/50'}`}
          onClick={() => setActiveLane('disputes')}
        >
          <CardContent className="pt-4 pb-4 md:pt-5 flex items-center justify-between px-3 md:px-5">
            <div className="min-w-0">
              <p className="text-[10px] md:text-xs font-medium text-muted-foreground">Disputes</p>
              <p className="text-xl md:text-2xl font-bold">{stats.disputes}</p>
              <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">Open</p>
            </div>
            <AlertTriangle className="h-5 w-5 md:h-7 md:w-7 text-red-600 shrink-0" />
          </CardContent>
        </Card>
        <Card
          className={`rounded-xl border border-border/60 md:border-2 cursor-pointer transition-colors ${activeLane === 'completed' ? 'border-green-600 bg-green-600/5' : 'bg-muted/30 dark:bg-muted/20 md:bg-card hover:bg-muted/50'}`}
          onClick={() => setActiveLane('completed')}
        >
          <CardContent className="pt-4 pb-4 md:pt-5 flex items-center justify-between px-3 md:px-5">
            <div className="min-w-0">
              <p className="text-[10px] md:text-xs font-medium text-muted-foreground">Completed</p>
              <p className="text-xl md:text-2xl font-bold">{stats.completed}</p>
              <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5">{stats.total} total</p>
            </div>
            <CheckCircle className="h-5 w-5 md:h-7 md:w-7 text-green-600 shrink-0" />
          </CardContent>
        </Card>
        <Link href="/dashboard/admin/revenue">
          <Card className="rounded-xl border border-border/60 md:border-2 bg-muted/30 dark:bg-muted/20 md:bg-card hover:border-primary/40 transition-colors cursor-pointer">
            <CardContent className="pt-4 pb-4 md:pt-5 flex items-center justify-between px-3 md:px-5">
              <div className="min-w-0">
                <p className="text-[10px] md:text-xs font-medium text-muted-foreground">Platform Fees</p>
                <p className="text-lg md:text-xl font-bold">
                  {revenueStats ? formatCurrency(revenueStats.platformFees.last30Days) : '—'}
                </p>
                <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 truncate">
                  {revenueStats ? `${revenueStats.orders.last30Days} orders · 30d` : 'Matches Revenue tab'}
                </p>
              </div>
              <DollarSign className="h-5 w-5 md:h-7 md:w-7 text-purple-600 shrink-0" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Delivery Timeline Stages */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Delivery timeline</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 md:gap-3">
          <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
            <CardContent className="pt-3 pb-3 md:pt-4 flex items-center justify-between px-3 md:px-4">
              <div className="min-w-0">
                <p className="text-[10px] md:text-xs font-medium text-muted-foreground">Pending Payment</p>
                <p className="text-lg md:text-xl font-bold">{deliveryStageCounts.pendingPayment}</p>
              </div>
              <CreditCard className="h-5 w-5 md:h-6 md:w-6 text-muted-foreground shrink-0" />
            </CardContent>
          </Card>
          <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
            <CardContent className="pt-3 pb-3 md:pt-4 flex items-center justify-between px-3 md:px-4">
              <div className="min-w-0">
                <p className="text-[10px] md:text-xs font-medium text-muted-foreground">Fulfillment Required</p>
                <p className="text-lg md:text-xl font-bold">{deliveryStageCounts.fulfillmentRequired}</p>
              </div>
              <Package className="h-5 w-5 md:h-6 md:w-6 text-orange-600 shrink-0" />
            </CardContent>
          </Card>
          <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
            <CardContent className="pt-3 pb-3 md:pt-4 flex items-center justify-between px-3 md:px-4">
              <div className="min-w-0">
                <p className="text-[10px] md:text-xs font-medium text-muted-foreground">Scheduled</p>
                <p className="text-lg md:text-xl font-bold">{deliveryStageCounts.scheduled}</p>
              </div>
              <Calendar className="h-5 w-5 md:h-6 md:w-6 text-blue-600 shrink-0" />
            </CardContent>
          </Card>
          <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
            <CardContent className="pt-3 pb-3 md:pt-4 flex items-center justify-between px-3 md:px-4">
              <div className="min-w-0">
                <p className="text-[10px] md:text-xs font-medium text-muted-foreground">Out for Delivery</p>
                <p className="text-lg md:text-xl font-bold">{deliveryStageCounts.outForDelivery}</p>
              </div>
              <Truck className="h-5 w-5 md:h-6 md:w-6 text-amber-600 shrink-0" />
            </CardContent>
          </Card>
          <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
            <CardContent className="pt-3 pb-3 md:pt-4 flex items-center justify-between px-3 md:px-4">
              <div className="min-w-0">
                <p className="text-[10px] md:text-xs font-medium text-muted-foreground">Awaiting Confirm</p>
                <p className="text-lg md:text-xl font-bold">{deliveryStageCounts.awaitingConfirmation}</p>
              </div>
              <Clock className="h-5 w-5 md:h-6 md:w-6 text-purple-600 shrink-0" />
            </CardContent>
          </Card>
          <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
            <CardContent className="pt-3 pb-3 md:pt-4 flex items-center justify-between px-3 md:px-4">
              <div className="min-w-0">
                <p className="text-[10px] md:text-xs font-medium text-muted-foreground">Completed</p>
                <p className="text-lg md:text-xl font-bold">{deliveryStageCounts.completed}</p>
              </div>
              <CheckCircle className="h-5 w-5 md:h-6 md:w-6 text-green-600 shrink-0" />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Search & Bulk Actions */}
      <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
        <CardContent className="pt-4 pb-4 md:pt-6 px-3 sm:px-6">
          <div className="space-y-3 md:space-y-4">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                placeholder="Order, listing, buyer, seller, payment ID…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 min-h-[44px] text-base"
              />
            </div>
            {selectedOrderIds.size > 0 && (
              <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
                <span className="text-xs md:text-sm text-muted-foreground">
                  {selectedOrderIds.size} order{selectedOrderIds.size !== 1 ? 's' : ''} selected
                </span>
                <Button size="sm" variant="outline" className="min-h-[36px]" onClick={() => setBulkActionDialogOpen('hold')}>
                  Bulk Hold
                </Button>
                <Button size="sm" variant="outline" className="min-h-[36px]" onClick={() => setBulkActionDialogOpen('unhold')}>
                  Bulk Unhold
                </Button>
                <Button size="sm" variant="default" className="min-h-[36px]" onClick={() => { setBulkReminderDialogOpen(true); setBulkReminderRole('seller'); }}>
                  <Clock className="h-4 w-4 mr-2" />
                  Remind Sellers
                </Button>
                <Button size="sm" variant="default" className="min-h-[36px]" onClick={() => { setBulkReminderDialogOpen(true); setBulkReminderRole('buyer'); }}>
                  <Clock className="h-4 w-4 mr-2" />
                  Remind Buyers
                </Button>
                <Button size="sm" variant="ghost" className="min-h-[36px]" onClick={() => setSelectedOrderIds(new Set())}>
                  Clear
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lane tabs + filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="overflow-x-auto -mx-1 px-1 we-scrollbar-hover">
          <div className="flex items-center gap-1.5 min-w-max pb-1">
            {(['overdue', 'needs_action', 'disputes', 'completed'] as const).map((lane) => {
              const count = lane === 'overdue' ? laneOrders.overdue.length
                : lane === 'needs_action' ? laneOrders.needsAction.length
                : lane === 'disputes' ? laneOrders.disputes.length
                : laneOrders.completed.length;
              const isActive = activeLane === lane;
              const label = lane === 'needs_action' ? 'Needs Action' : lane.charAt(0).toUpperCase() + lane.slice(1).replace('_', ' ');
              return (
                <button
                  key={lane}
                  type="button"
                  onClick={() => setActiveLane(lane)}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {lane === 'overdue' && <AlertTriangle className="h-4 w-4" />}
                  {lane === 'needs_action' && <Clock className="h-4 w-4" />}
                  {lane === 'disputes' && <AlertTriangle className="h-4 w-4" />}
                  {lane === 'completed' && <CheckCircle className="h-4 w-4" />}
                  <span>{label}</span>
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-bold',
                    isActive ? 'bg-primary-foreground/20' : 'bg-muted-foreground/20'
                  )}>
                    {count}
                  </span>
                  {lane === 'needs_action' && laneOrders.atRisk.length > 0 && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{laneOrders.atRisk.length} at risk</Badge>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        {activeLane === 'needs_action' && (
          <div className="flex items-center gap-4 shrink-0">
            <label className="flex items-center gap-2 cursor-pointer text-xs">
              <Checkbox id="overdue-only" checked={showOverdueOnly} onCheckedChange={(c) => setShowOverdueOnly(c === true)} />
              <span>Overdue only</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs">
              <Checkbox id="sort-sla" checked={sortBySla} onCheckedChange={(c) => setSortBySla(c === true)} />
              <span>Sort by SLA</span>
            </label>
          </div>
        )}
      </div>

      {/* Lane Content */}
      <div className="space-y-2 md:space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {activeLane === 'overdue' && `Overdue orders (${filteredOrders.length})`}
            {activeLane === 'needs_action' && `Needs action (${filteredOrders.length})`}
            {activeLane === 'disputes' && `Open disputes (${filteredOrders.length})`}
            {activeLane === 'completed' && `Completed (${filteredOrders.length})`}
          </h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8 md:py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
            <CardContent className="pt-6 pb-6 px-3 sm:px-6">
              <div className="text-center py-8 md:py-12">
                {activeLane === 'overdue' && <AlertTriangle className="h-12 w-12 text-red-600 mx-auto mb-4" />}
                {activeLane === 'needs_action' && <Clock className="h-12 w-12 text-orange-600 mx-auto mb-4" />}
                {activeLane === 'disputes' && <AlertTriangle className="h-12 w-12 text-red-600 mx-auto mb-4" />}
                {activeLane === 'completed' && <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />}
                <h3 className="text-lg font-semibold mb-2">
                  {activeLane === 'overdue' && 'No Overdue Orders'}
                  {activeLane === 'needs_action' && 'No Orders Needing Action'}
                  {activeLane === 'disputes' && 'No Open Disputes'}
                  {activeLane === 'completed' && 'No Completed Orders'}
                </h3>
                <p className="text-muted-foreground">
                  {activeLane === 'overdue' && 'All orders are within SLA or completed.'}
                  {activeLane === 'needs_action' && 'All fulfillment actions are complete.'}
                  {activeLane === 'disputes' && 'All disputes have been resolved.'}
                  {activeLane === 'completed' && 'No completed orders found.'}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2 md:space-y-4">
            {/* At Risk section (only shown in needs_action lane) */}
            {activeLane === 'needs_action' && laneOrders.atRisk.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 px-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <div className="text-sm font-semibold text-destructive">At Risk ({laneOrders.atRisk.length})</div>
                  <div className="text-xs text-muted-foreground">SLA approaching or stalled {'>'} 48h</div>
                </div>
                {laneOrders.atRisk.map((order) => {
                  const txStatus = getEffectiveTransactionStatus(order);
                  if (txStatus === 'DISPUTE_OPENED') {
                    return (
                      <DisputeCard
                        key={order.id}
                        order={order}
                        onResolve={() => setResolveDialogOpen(order.id)}
                        onView={() => handleViewOrder(order)}
                      />
                    );
                  }
                  return (
                    <OrderCard
                      key={order.id}
                      order={order}
                      isAtRisk
                      onRefund={() => setRefundDialogOpen(order.id)}
                      onMarkPaid={() => handleMarkPaid(order.id)}
                      onView={() => handleViewOrder(order)}
                      onRemind={(role) => {
                        setReminderRole(role);
                        setReminderDialogOpen(order.id);
                      }}
                      onConfirmDelivery={() => handleConfirmDelivery(order.id)}
                      selected={selectedOrderIds.has(order.id)}
                      onSelect={(orderId, checked) => {
                        setSelectedOrderIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(orderId);
                          else next.delete(orderId);
                          return next;
                        });
                      }}
                    />
                  );
                })}
                {laneOrders.needsAction.filter(o => !laneOrders.atRisk.includes(o)).length > 0 && (
                  <div className="pt-4 border-t">
                    <div className="text-sm font-semibold text-muted-foreground px-2 mb-2">Other Orders Needing Action</div>
                  </div>
                )}
              </div>
            )}
            {filteredOrders
              .filter(order => activeLane !== 'needs_action' || !laneOrders.atRisk.includes(order))
              .map((order) => {
              const txStatus = getEffectiveTransactionStatus(order);
              // Use DisputeCard for disputes, OrderCard for everything else
              if (txStatus === 'DISPUTE_OPENED') {
                return (
                  <DisputeCard
                    key={order.id}
                    order={order}
                    onResolve={() => setResolveDialogOpen(order.id)}
                    onView={() => handleViewOrder(order)}
                  />
                );
              }
              return (
                <OrderCard
                  key={order.id}
                  order={order}
                  onRefund={() => setRefundDialogOpen(order.id)}
                  onMarkPaid={() => handleMarkPaid(order.id)}
                  onView={() => handleViewOrder(order)}
                  onRemind={(role) => {
                    setReminderRole(role);
                    setReminderDialogOpen(order.id);
                  }}
                  onConfirmDelivery={() => handleConfirmDelivery(order.id)}
                  selected={selectedOrderIds.has(order.id)}
                  onSelect={(orderId, checked) => {
                    setSelectedOrderIds((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(orderId);
                      else next.delete(orderId);
                      return next;
                    });
                  }}
                />
              );
            })}
          </div>
        )}
      </div>


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

      {/* Freeze Seller Dialog */}
      <Dialog open={!!freezeDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setFreezeDialogOpen(null);
          setFreezeReason('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Freeze Seller Account</DialogTitle>
            <DialogDescription>
              Freeze this seller's account. They will not be able to create new listings or receive payments.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Reason *</Label>
              <Textarea
                placeholder="Enter reason for freezing seller account"
                value={freezeReason}
                onChange={(e) => setFreezeReason(e.target.value)}
                required
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setFreezeDialogOpen(null);
              setFreezeReason('');
            }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!freezeReason.trim() || processingOrderId !== null}
              onClick={async () => {
                if (!freezeDialogOpen || !freezeReason.trim()) return;
                try {
                  setProcessingOrderId(freezeDialogOpen);
                  const token = await user?.getIdToken();
                  const res = await fetch(`/api/admin/sellers/${freezeDialogOpen}/freeze`, {
                    method: 'POST',
                    headers: {
                      'content-type': 'application/json',
                      authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ reason: freezeReason.trim() }),
                  });
                  if (!res.ok) {
                    const json = await res.json().catch(() => ({}));
                    throw new Error(json?.message || json?.error || 'Failed to freeze seller');
                  }
                  toast({ title: 'Success', description: 'Seller account frozen.' });
                  setFreezeDialogOpen(null);
                  setFreezeReason('');
                  await loadOrders();
                } catch (e: any) {
                  toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to freeze seller'), variant: 'destructive' });
                } finally {
                  setProcessingOrderId(null);
                }
              }}
            >
              {processingOrderId === freezeDialogOpen ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Freeze Seller
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Reminder Dialog */}
      <Dialog open={!!reminderDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setReminderDialogOpen(null);
          setReminderRole(null);
          setReminderMessage('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Reminder</DialogTitle>
            <DialogDescription>
              Send a reminder email to the {reminderRole || 'user'} about this order.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Custom Message (Optional)</Label>
              <Textarea
                placeholder="Add a custom message to include in the reminder email..."
                value={reminderMessage}
                onChange={(e) => setReminderMessage(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">
                If left empty, a standard reminder will be sent based on the order status.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setReminderDialogOpen(null);
              setReminderRole(null);
              setReminderMessage('');
            }}>
              Cancel
            </Button>
            <Button
              disabled={!reminderRole || processingOrderId !== null}
              onClick={async () => {
                if (!reminderDialogOpen || !reminderRole) return;
                try {
                  setProcessingOrderId(reminderDialogOpen);
                  const token = await user?.getIdToken();
                  const res = await fetch(`/api/admin/orders/${reminderDialogOpen}/send-reminder`, {
                    method: 'POST',
                    headers: {
                      'content-type': 'application/json',
                      authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                      role: reminderRole,
                      message: reminderMessage.trim() || undefined,
                    }),
                  });
                  if (!res.ok) {
                    const json = await res.json().catch(() => ({}));
                    throw new Error(json?.message || json?.error || 'Failed to send reminder');
                  }
                  toast({ title: 'Success', description: `Reminder sent to ${reminderRole}.` });
                  setReminderDialogOpen(null);
                  setReminderRole(null);
                  setReminderMessage('');
                } catch (e: any) {
                  toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to send reminder'), variant: 'destructive' });
                } finally {
                  setProcessingOrderId(null);
                }
              }}
            >
              {processingOrderId === reminderDialogOpen ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Clock className="h-4 w-4 mr-2" />}
              Send Reminder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Send Reminder Dialog */}
      <Dialog open={bulkReminderDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setBulkReminderDialogOpen(false);
          setBulkReminderMessage('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Bulk Reminders</DialogTitle>
            <DialogDescription>
              Send reminder emails to {bulkReminderRole === 'buyer' ? 'buyers' : 'sellers'} for {selectedOrderIds.size} selected order{selectedOrderIds.size !== 1 ? 's' : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Target Role</Label>
              <Select value={bulkReminderRole} onValueChange={(v) => setBulkReminderRole(v as 'buyer' | 'seller')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seller">Sellers</SelectItem>
                  <SelectItem value="buyer">Buyers</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Custom Message (Optional)</Label>
              <Textarea
                placeholder="Add a custom message to include in all reminder emails..."
                value={bulkReminderMessage}
                onChange={(e) => setBulkReminderMessage(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">
                If left empty, standard reminders will be sent based on each order's status.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setBulkReminderDialogOpen(false);
              setBulkReminderMessage('');
            }}>
              Cancel
            </Button>
            <Button
              disabled={processingOrderId === 'bulk-reminder'}
              onClick={async () => {
                if (selectedOrderIds.size === 0) return;
                try {
                  setProcessingOrderId('bulk-reminder');
                  const token = await user?.getIdToken();
                  const orderIds = Array.from(selectedOrderIds);
                  const results: { orderId: string; success: boolean; error?: string }[] = [];
                  
                  // Process in batches to avoid rate limits
                  const BATCH_SIZE = 5;
                  for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
                    const batch = orderIds.slice(i, i + BATCH_SIZE);
                    const batchResults = await Promise.all(
                      batch.map(async (orderId) => {
                        try {
                          const res = await fetch(`/api/admin/orders/${orderId}/send-reminder`, {
                            method: 'POST',
                            headers: {
                              'content-type': 'application/json',
                              authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify({
                              role: bulkReminderRole,
                              message: bulkReminderMessage.trim() || undefined,
                            }),
                          });
                          if (!res.ok) {
                            const json = await res.json().catch(() => ({}));
                            throw new Error(json?.message || json?.error || 'Failed to send reminder');
                          }
                          return { orderId, success: true };
                        } catch (error: any) {
                          return { orderId, success: false, error: formatUserFacingError(error, 'Unknown error') };
                        }
                      })
                    );
                    results.push(...batchResults);
                  }

                  const successCount = results.filter(r => r.success).length;
                  const failCount = results.filter(r => !r.success).length;

                  toast({
                    title: 'Bulk Reminders Sent',
                    description: `${successCount} sent successfully, ${failCount} failed`,
                    variant: failCount > 0 ? 'destructive' : 'default',
                  });

                  setBulkReminderDialogOpen(false);
                  setBulkReminderMessage('');
                  setSelectedOrderIds(new Set());
                } catch (e: any) {
                  toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to send bulk reminders'), variant: 'destructive' });
                } finally {
                  setProcessingOrderId(null);
                }
              }}
            >
              {processingOrderId === 'bulk-reminder' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Clock className="h-4 w-4 mr-2" />
                  Send to {selectedOrderIds.size} {bulkReminderRole === 'buyer' ? 'Buyer' : 'Seller'}{selectedOrderIds.size !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Dispute Dialog */}
      <Dialog open={!!resolveDialogOpen} onOpenChange={(open) => !open && setResolveDialogOpen(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resolve Dispute</DialogTitle>
            <DialogDescription>
              Choose how to resolve this dispute.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* AI Dispute Summary */}
            {resolveDialogOpen && (
              <AIDisputeSummary
                orderId={resolveDialogOpen}
                existingSummary={
                  orders.find(o => o.id === resolveDialogOpen)?.aiDisputeSummary || null
                }
                existingFacts={
                  orders.find(o => o.id === resolveDialogOpen)?.aiDisputeFacts || null
                }
                existingReviewedAt={
                  orders.find(o => o.id === resolveDialogOpen)?.aiDisputeReviewedAt || null
                }
                existingModel={
                  orders.find(o => o.id === resolveDialogOpen)?.aiDisputeModel || null
                }
                onSummaryUpdated={(summary, facts, model, generatedAt) => {
                  // Update order in local state
                  const order = orders.find(o => o.id === resolveDialogOpen);
                  if (order) {
                    (order as any).aiDisputeSummary = summary;
                    (order as any).aiDisputeFacts = facts;
                    (order as any).aiDisputeReviewedAt = generatedAt;
                    (order as any).aiDisputeModel = model;
                  }
                }}
              />
            )}
            <div>
              <Label>Resolution</Label>
              <Select value={resolutionType} onValueChange={(v) => setResolutionType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
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
        <DialogContent className="max-w-4xl max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0 pb-2">
            <DialogTitle>Order #{selectedOrder?.id?.slice(-8) ?? '—'}</DialogTitle>
            <DialogDescription>
              Order details, fulfillment progress, and admin actions
            </DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
              {/* Hero: Listing + Status + Amount */}
              <div className="flex gap-4 p-3 rounded-xl border border-border/60 bg-muted/20">
                {selectedOrder.listingImage ? (
                  <img
                    src={selectedOrder.listingImage}
                    alt=""
                    className="w-16 h-16 md:w-20 md:h-20 rounded-lg object-cover shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-lg bg-muted shrink-0 flex items-center justify-center">
                    <Package className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base md:text-lg truncate">
                    {selectedOrder.listingTitle || (selectedOrder as any).listingSnapshot?.title || selectedOrder.listingId || 'Unknown Listing'}
                  </h3>
                  <a
                    href={`/listing/${selectedOrder.listingId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    View listing →
                  </a>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {(() => {
                      const txStatus = getEffectiveTransactionStatus(selectedOrder);
                      return (
                        <Badge variant={txStatus === 'COMPLETED' ? 'default' : txStatus === 'DISPUTE_OPENED' ? 'destructive' : 'secondary'} className="text-xs">
                          {txStatus.replaceAll('_', ' ')}
                        </Badge>
                      );
                    })()}
                    <Badge variant="outline" className="text-xs bg-green-600/10 text-green-700 border-green-600/30">
                      Seller paid
                    </Badge>
                    <span className="text-sm font-bold">{formatCurrency(selectedOrder.amount)}</span>
                    <span className="text-xs text-muted-foreground">→ seller {formatCurrency(selectedOrder.sellerAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Next Action (if any) — prominent "Waiting on" + one-tap Remind */}
              {(() => {
                const nextAction = getNextRequiredAction(selectedOrder, 'admin');
                if (!nextAction) return null;
                const waitingOn = nextAction.ownerRole === 'buyer' ? 'buyer' : nextAction.ownerRole === 'seller' ? 'seller' : null;
                if (!waitingOn) return (
                  <div className="p-3 rounded-xl border-2 border-primary/30 bg-primary/5">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Action needed</p>
                    <p className="font-semibold text-sm">{nextAction.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{nextAction.description}</p>
                  </div>
                );
                return (
                  <div className={cn(
                    'p-3 rounded-xl border-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3',
                    waitingOn === 'buyer' ? 'border-blue-500/40 bg-blue-500/10' : 'border-amber-500/40 bg-amber-500/10'
                  )}>
                    <div>
                      <p className={cn(
                        'text-sm font-bold',
                        waitingOn === 'buyer' ? 'text-blue-700 dark:text-blue-300' : 'text-amber-700 dark:text-amber-300'
                      )}>
                        Waiting on: {waitingOn === 'buyer' ? 'Buyer' : 'Seller'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{nextAction.description}</p>
                    </div>
                    <Button
                      size="sm"
                      className={cn(
                        'shrink-0 font-semibold',
                        waitingOn === 'buyer' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'
                      )}
                      onClick={() => {
                        setReminderRole(waitingOn);
                        setReminderDialogOpen(selectedOrder.id);
                      }}
                      disabled={processingOrderId !== null}
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Remind {waitingOn === 'buyer' ? 'Buyer' : 'Seller'}
                    </Button>
                  </div>
                );
              })()}

              {/* Compact health row */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {(() => {
                  const trust = getOrderTrustState(selectedOrder);
                  const issue = getOrderIssueState(selectedOrder);
                  const now = new Date();
                  const protectionEndsAt = selectedOrder.protectionEndsAt || null;
                  const protectionRemaining =
                    protectionEndsAt && protectionEndsAt.getTime() > now.getTime()
                      ? formatDistanceToNow(protectionEndsAt, { addSuffix: true })
                      : null;
                  return (
                    <>
                      <Badge variant="secondary" className="text-[10px] capitalize">{trust.replaceAll('_', ' ')}</Badge>
                      <Badge variant={issue === 'none' ? 'outline' : 'destructive'} className="text-[10px] capitalize">{issue.replaceAll('_', ' ')}</Badge>
                      {protectionRemaining && (
                        <Badge variant="outline" className="text-[10px]">Protection ends {protectionRemaining}</Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">{(selectedOrder.listingCategory as any) || '—'}</Badge>
                      <Badge variant="outline" className="text-[10px]">{(selectedOrder.listingComplianceStatus as any) || '—'}</Badge>
                    </>
                  );
                })()}
              </div>

              {/* People & IDs — compact grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">Buyer</Label>
                  <p className="text-sm font-medium truncate">{selectedOrder.buyerName || '—'}</p>
                  <p className="text-xs text-muted-foreground truncate">{selectedOrder.buyerEmail}</p>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">Seller</Label>
                  <p className="text-sm font-medium truncate">{selectedOrder.sellerName || '—'}</p>
                  <p className="text-xs text-muted-foreground truncate">{selectedOrder.sellerEmail || '—'}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-[10px] text-muted-foreground uppercase">Order ID</Label>
                  <p className="font-mono text-xs break-all">{selectedOrder.id}</p>
                  {selectedOrder.stripePaymentIntentId && (
                    <p className="font-mono text-[10px] text-muted-foreground break-all mt-0.5">{selectedOrder.stripePaymentIntentId}</p>
                  )}
                </div>
              </div>

              {/* Delivery address (when set) */}
              {selectedOrder.delivery?.buyerAddress?.line1 && (
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                  <Label className="text-[10px] text-muted-foreground uppercase mb-1 block">Delivery address</Label>
                  <p className="text-xs break-words">
                    {[selectedOrder.delivery.buyerAddress.line1, selectedOrder.delivery.buyerAddress.line2, [selectedOrder.delivery.buyerAddress.city, selectedOrder.delivery.buyerAddress.state, selectedOrder.delivery.buyerAddress.zip].filter(Boolean).join(', ')].filter(Boolean).join(', ')}
                    {selectedOrder.delivery.buyerAddress.deliveryInstructions ? ` · ${selectedOrder.delivery.buyerAddress.deliveryInstructions}` : ''}
                  </p>
                </div>
              )}

              {/* AI Summary - Collapsible */}
              {selectedOrder.id && (
                <div className="border border-border/50 rounded-lg overflow-hidden">
                  <AIAdminSummary
                    entityType="order"
                    entityId={selectedOrder.id}
                    existingSummary={(selectedOrder as any).aiAdminSummary || null}
                    existingSummaryAt={(selectedOrder as any).aiAdminSummaryAt || null}
                    existingSummaryModel={(selectedOrder as any).aiAdminSummaryModel || null}
                    onSummaryUpdated={(summary, model, generatedAt) => {
                      // Update local state
                      (selectedOrder as any).aiAdminSummary = summary;
                      (selectedOrder as any).aiAdminSummaryAt = generatedAt;
                      (selectedOrder as any).aiAdminSummaryModel = model;
                    }}
                  />
                </div>
              )}

              {/* AI Dispute Summary - Only show if order has an active dispute */}
              {selectedOrder.id && selectedOrder.disputeStatus && 
               selectedOrder.disputeStatus !== 'none' && 
               selectedOrder.disputeStatus !== 'cancelled' &&
               !selectedOrder.disputeStatus.startsWith('resolved_') && (
                <AIDisputeSummary
                  orderId={selectedOrder.id}
                  existingSummary={(selectedOrder as any).aiDisputeSummary || null}
                  existingFacts={(selectedOrder as any).aiDisputeFacts || null}
                  existingReviewedAt={(selectedOrder as any).aiDisputeReviewedAt || null}
                  existingModel={(selectedOrder as any).aiDisputeModel || null}
                  onSummaryUpdated={(summary, facts, model, generatedAt) => {
                    // Update local state
                    (selectedOrder as any).aiDisputeSummary = summary;
                    (selectedOrder as any).aiDisputeFacts = facts;
                    (selectedOrder as any).aiDisputeReviewedAt = generatedAt;
                    (selectedOrder as any).aiDisputeModel = model;
                  }}
                />
              )}

              {/* Compliance Transfer Status (for regulated whitetail deals) */}
              {(() => {
                const txStatus = getEffectiveTransactionStatus(selectedOrder);
                const { isRegulatedWhitetailDeal, hasComplianceConfirmations } = require('@/lib/compliance/whitetail');
                if (isRegulatedWhitetailDeal(selectedOrder) || txStatus === 'AWAITING_TRANSFER_COMPLIANCE') {
                  const confirmations = hasComplianceConfirmations(selectedOrder);
                  const paidAt = selectedOrder.paidAt;
                  const daysSincePayment = paidAt ? Math.floor((Date.now() - (paidAt instanceof Date ? paidAt.getTime() : new Date(paidAt).getTime())) / (1000 * 60 * 60 * 24)) : null;
                  const isOverdue = daysSincePayment !== null && daysSincePayment > 7;
                  
                  return (
                    <div className="p-3 rounded-lg border border-purple-200 bg-purple-50 dark:bg-purple-950/20">
                      <Label className="text-xs font-semibold mb-2 block text-purple-900 dark:text-purple-100">Transfer Compliance</Label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Buyer</div>
                          <div className="flex items-center gap-1.5">
                            {confirmations.buyerConfirmed ? (
                              <>
                                <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                <span className="text-xs font-semibold text-green-600">Confirmed</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-3.5 w-3.5 text-red-600" />
                                <span className="text-xs font-semibold text-red-600">Pending</span>
                              </>
                            )}
                          </div>
                          {selectedOrder.complianceTransfer?.buyerConfirmedAt && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {formatDate(selectedOrder.complianceTransfer.buyerConfirmedAt)}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Seller</div>
                          <div className="flex items-center gap-1.5">
                            {confirmations.sellerConfirmed ? (
                              <>
                                <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                <span className="text-xs font-semibold text-green-600">Confirmed</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-3.5 w-3.5 text-red-600" />
                                <span className="text-xs font-semibold text-red-600">Pending</span>
                              </>
                            )}
                          </div>
                          {selectedOrder.complianceTransfer?.sellerConfirmedAt && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {formatDate(selectedOrder.complianceTransfer.sellerConfirmedAt)}
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Document</div>
                          <div className="flex items-center gap-1.5">
                            {(selectedOrder.complianceTransfer?.buyerUploadUrl || selectedOrder.complianceTransfer?.sellerUploadUrl) ? (
                              <>
                                <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                                <span className="text-xs font-semibold text-green-600">Uploaded</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">None</span>
                              </>
                            )}
                          </div>
                        </div>
                        {paidAt && (
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Days Since Payment</div>
                            <div className={`text-xs font-semibold ${isOverdue ? 'text-red-600' : ''}`}>
                              {daysSincePayment !== null ? `${daysSincePayment}d` : 'N/A'}
                              {isOverdue && <Badge variant="destructive" className="ml-1 text-[10px]">Overdue</Badge>}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Fulfillment & Timeline — main content */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedOrder && (
                    <div className="p-3 rounded-xl border border-border/50 bg-muted/20">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Fulfillment progress</Label>
                      <FulfillmentStatusBlock order={selectedOrder} />
                    </div>
                  )}
                  <div>
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">Timeline</Label>
                    <div className="p-3 rounded-xl border border-border/50 bg-muted/20 max-h-[320px] overflow-y-auto">
                      <TransactionTimeline order={selectedOrder} role="admin" dense showTitle={false} />
                    </div>
                  </div>
                </div>

                {/* Audit Trail */}
                <details className="group rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
                  <summary className="px-3 py-2 cursor-pointer text-sm font-semibold list-none flex items-center justify-between">
                    <span>Audit trail</span>
                    <span className="text-muted-foreground text-xs">{orderAuditLogs.length} entries</span>
                  </summary>
                  <div className="px-3 pb-3 pt-0">
                  {loadingOrderAudit ? (
                    <div className="flex items-center gap-2 py-4"><Loader2 className="h-4 w-4 animate-spin" /> <span className="text-sm text-muted-foreground">Loading…</span></div>
                  ) : orderAuditLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No admin/system audit entries yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-[280px] overflow-y-auto">
                      {orderAuditLogs.map((log, i) => (
                        <div key={i} className="rounded border border-border/40 p-2 text-xs bg-background/50">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-medium">{String(log.actorUid).slice(0, 12)}…</span>
                            <Badge variant="outline" className="text-[10px]">{log.actionType}</Badge>
                            <span className="text-muted-foreground">{log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}</span>
                          </div>
                          {(log.beforeState || log.afterState) && (
                            <details className="mt-1.5">
                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">before/after</summary>
                              <pre className="mt-1 text-[10px] overflow-auto max-h-[120px] rounded bg-muted/50 p-1.5">{JSON.stringify({ before: log.beforeState, after: log.afterState }, null, 2)}</pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  </div>
                </details>

                {/* Admin notes — add freeform note to order */}
                <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden p-3 space-y-3">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase">Admin notes</Label>
                  {(selectedOrder as any).adminActionNotes?.length > 0 && (
                    <div className="space-y-2 max-h-[160px] overflow-y-auto">
                      {(selectedOrder as any).adminActionNotes
                        .filter((n: any) => n.action === 'admin_note' || n.reason === 'Admin note')
                        .map((n: any, i: number) => (
                          <div key={i} className="rounded border border-border/40 p-2 text-xs bg-background/50">
                            <div className="text-muted-foreground mb-0.5">
                              {n.createdAt?.toDate ? formatDate(n.createdAt.toDate()) : n.createdAt ? formatDate(new Date(n.createdAt)) : '—'}
                            </div>
                            <p className="whitespace-pre-wrap">{n.notes}</p>
                          </div>
                        ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Add a note (e.g. Called buyer, will set address by Friday)"
                      value={orderAdminNoteText}
                      onChange={(e) => setOrderAdminNoteText(e.target.value)}
                      className="min-h-[60px] text-sm"
                      maxLength={2000}
                    />
                    <Button
                      size="sm"
                      className="shrink-0 self-end"
                      disabled={!orderAdminNoteText.trim() || orderAdminNoteSubmitting !== null}
                      onClick={async () => {
                        if (!selectedOrder?.id || !orderAdminNoteText.trim() || !user) return;
                        setOrderAdminNoteSubmitting(selectedOrder.id);
                        try {
                          const token = await user.getIdToken();
                          const res = await fetch(`/api/orders/${selectedOrder.id}/admin-notes`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ notes: orderAdminNoteText.trim() }),
                          });
                          const json = await res.json().catch(() => ({}));
                          if (!res.ok) throw new Error(json?.error || 'Failed to add note');
                          const newNote = {
                            reason: 'Admin note',
                            notes: orderAdminNoteText.trim(),
                            actorUid: user.uid,
                            createdAt: new Date(),
                            action: 'admin_note',
                          };
                          setSelectedOrder({
                            ...selectedOrder,
                            adminActionNotes: [...((selectedOrder as any).adminActionNotes || []), newNote],
                          } as OrderWithDetails);
                          setOrderAdminNoteText('');
                          toast({ title: 'Note added', description: 'Admin note saved to order.' });
                        } catch (e: any) {
                          toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to add note'), variant: 'destructive' });
                        } finally {
                          setOrderAdminNoteSubmitting(null);
                        }
                      }}
                    >
                      {orderAdminNoteSubmitting === selectedOrder?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add note'}
                    </Button>
                  </div>
                </div>

                {/* Review (if any) */}
                <details className="group rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
                  <summary className="px-3 py-2 cursor-pointer text-sm font-semibold list-none">Buyer review</summary>
                  <div className="px-3 pb-3 pt-2 border-t">
                  {loadingOrderReview ? (
                    <div className="flex items-center gap-2 py-4"><Loader2 className="h-4 w-4 animate-spin" /> <span className="text-sm text-muted-foreground">Loading…</span></div>
                  ) : !orderReview ? (
                    <p className="text-sm text-muted-foreground py-2">No review submitted yet.</p>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="outline">{orderReview.status}</Badge>
                        <span className="text-muted-foreground">Rating: {orderReview.rating}/5</span>
                      </div>
                      {orderReview.text ? <div className="text-sm">{orderReview.text}</div> : null}
                      {orderReview.moderationReason ? (
                        <div className="text-xs text-muted-foreground">Reason: {orderReview.moderationReason}</div>
                      ) : null}
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            if (!selectedOrder) return;
                            try {
                              const token = await user?.getIdToken();
                              const res = await fetch(`/api/admin/reviews/${selectedOrder.id}/moderate`, {
                                method: 'POST',
                                headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
                                body: JSON.stringify({ status: 'hidden', reason: 'Hidden by admin' }),
                              });
                              if (!res.ok) throw new Error('Failed to hide review');
                              setOrderReview({ ...orderReview, status: 'hidden', moderationReason: 'Hidden by admin' });
                              toast({ title: 'Review hidden' });
                            } catch (e: any) {
                              toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to hide review'), variant: 'destructive' });
                            }
                          }}
                        >
                          Hide
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            if (!selectedOrder) return;
                            try {
                              const token = await user?.getIdToken();
                              const res = await fetch(`/api/admin/reviews/${selectedOrder.id}/moderate`, {
                                method: 'POST',
                                headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
                                body: JSON.stringify({ status: 'published', reason: null }),
                              });
                              if (!res.ok) throw new Error('Failed to unhide review');
                              setOrderReview({ ...orderReview, status: 'published', moderationReason: null });
                              toast({ title: 'Review published' });
                            } catch (e: any) {
                              toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to publish review'), variant: 'destructive' });
                            }
                          }}
                        >
                          Unhide
                        </Button>
                      </div>
                    </div>
                  )}
                  </div>
                </details>

                {/* Delivery Proof */}
                {selectedOrder && (() => {
                  const d = selectedOrder.delivery as any;
                  const sigUrl = d?.signatureUrl;
                  const photoUrl = d?.deliveryPhotoUrl;
                  const proofUrls = selectedOrder.deliveryProofUrls;
                  const hasProof = sigUrl || photoUrl || (Array.isArray(proofUrls) && proofUrls.length > 0);
                  const signedAt = d?.confirmedAt || d?.deliveredAt || selectedOrder.deliveredAt;
                  if (!hasProof) return null;
                  return (
                    <div className="p-3 rounded-lg border border-border/50 bg-muted/30">
                      <Label className="text-sm font-semibold mb-2 block">Delivery Proof</Label>
                      <DeliveryProofTimelineBlock
                        signedLabel="Recipient signed"
                        signedAt={signedAt instanceof Date ? signedAt : signedAt ? new Date(signedAt) : new Date()}
                        signatureUrl={sigUrl}
                        deliveryPhotoUrl={photoUrl}
                      />
                      {Array.isArray(proofUrls) && proofUrls.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {proofUrls.map((url: string, j: number) => (
                            <a key={j} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Proof {j + 1}</a>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
          <DialogFooter className="flex-shrink-0 flex flex-col sm:flex-row gap-2 pt-4 border-t">
            <div className="flex gap-2 flex-1 flex-wrap items-center">
              {selectedOrder && (
                <>
                  {getEffectiveTransactionStatus(selectedOrder) === 'DELIVERED_PENDING_CONFIRMATION' && (
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => handleConfirmDelivery(selectedOrder.id)}
                      disabled={processingOrderId !== null}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Confirm Delivery
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setRefundDialogOpen(selectedOrder.id)}
                    disabled={processingOrderId !== null}
                  >
                    Refund
                  </Button>
                  {/* Compliance-specific reminder buttons if in compliance gate */}
                  {(() => {
                    const txStatus = getEffectiveTransactionStatus(selectedOrder);
                    const { isRegulatedWhitetailDeal } = require('@/lib/compliance/whitetail');
                    if (txStatus === 'AWAITING_TRANSFER_COMPLIANCE' && isRegulatedWhitetailDeal(selectedOrder)) {
                      return (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              if (!selectedOrder) return;
                              try {
                                setProcessingOrderId(selectedOrder.id);
                                const token = await user?.getIdToken();
                                const res = await fetch(`/api/admin/orders/${selectedOrder.id}/compliance-transfer/remind`, {
                                  method: 'POST',
                                  headers: {
                                    'content-type': 'application/json',
                                    authorization: `Bearer ${token}`,
                                  },
                                  body: JSON.stringify({ target: 'buyer' }),
                                });
                                if (!res.ok) {
                                  const json = await res.json().catch(() => ({}));
                                  throw new Error(json?.error || 'Failed to send reminder');
                                }
                                toast({ title: 'Success', description: 'Compliance reminder sent to buyer.' });
                              } catch (e: any) {
                                toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to send reminder'), variant: 'destructive' });
                              } finally {
                                setProcessingOrderId(null);
                              }
                            }}
                            disabled={processingOrderId !== null}
                          >
                            <Clock className="h-4 w-4 mr-2" />
                            Remind Buyer (Compliance)
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              if (!selectedOrder) return;
                              try {
                                setProcessingOrderId(selectedOrder.id);
                                const token = await user?.getIdToken();
                                const res = await fetch(`/api/admin/orders/${selectedOrder.id}/compliance-transfer/remind`, {
                                  method: 'POST',
                                  headers: {
                                    'content-type': 'application/json',
                                    authorization: `Bearer ${token}`,
                                  },
                                  body: JSON.stringify({ target: 'seller' }),
                                });
                                if (!res.ok) {
                                  const json = await res.json().catch(() => ({}));
                                  throw new Error(json?.error || 'Failed to send reminder');
                                }
                                toast({ title: 'Success', description: 'Compliance reminder sent to seller.' });
                              } catch (e: any) {
                                toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to send reminder'), variant: 'destructive' });
                              } finally {
                                setProcessingOrderId(null);
                              }
                            }}
                            disabled={processingOrderId !== null}
                          >
                            <Clock className="h-4 w-4 mr-2" />
                            Remind Seller (Compliance)
                          </Button>
                        </>
                      );
                    }
                    return (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setReminderDialogOpen(selectedOrder.id);
                            setReminderRole('seller');
                            setReminderMessage('');
                          }}
                          disabled={processingOrderId !== null}
                        >
                          <Clock className="h-4 w-4 mr-2" />
                          Remind Seller
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setReminderDialogOpen(selectedOrder.id);
                            setReminderRole('buyer');
                            setReminderMessage('');
                          }}
                          disabled={processingOrderId !== null}
                        >
                          <Clock className="h-4 w-4 mr-2" />
                          Remind Buyer
                        </Button>
                      </>
                    );
                  })()}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!selectedOrder) return;
                      try {
                        setProcessingOrderId(selectedOrder.id);
                        const token = await user?.getIdToken();
                        const res = await fetch(`/api/admin/orders/${selectedOrder.id}/review-request`, {
                          method: 'POST',
                          headers: {
                            'content-type': 'application/json',
                            authorization: `Bearer ${token}`,
                          },
                          body: JSON.stringify({ force: false }),
                        });
                        if (!res.ok) {
                          const json = await res.json().catch(() => ({}));
                          throw new Error(json?.error || 'Failed to resend review request');
                        }
                        toast({ title: 'Review request queued' });
                      } catch (e: any) {
                        toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to resend review request'), variant: 'destructive' });
                      } finally {
                        setProcessingOrderId(null);
                      }
                    }}
                    disabled={processingOrderId !== null}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Resend review request
                  </Button>
                  {isSuperAdmin ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (!selectedOrder) return;
                        try {
                          setProcessingOrderId(selectedOrder.id);
                          const token = await user?.getIdToken();
                          const res = await fetch(`/api/admin/orders/${selectedOrder.id}/review-request`, {
                            method: 'POST',
                            headers: {
                              'content-type': 'application/json',
                              authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify({ force: true }),
                          });
                          if (!res.ok) {
                            const json = await res.json().catch(() => ({}));
                            throw new Error(json?.error || 'Failed to force resend');
                          }
                          toast({ title: 'Review request re-sent' });
                        } catch (e: any) {
                          toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to force resend'), variant: 'destructive' });
                        } finally {
                          setProcessingOrderId(null);
                        }
                      }}
                      disabled={processingOrderId !== null}
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Force resend review request
                    </Button>
                  ) : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" disabled={processingOrderId !== null}>
                        <MoreHorizontal className="h-4 w-4 mr-2" />
                        More
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => setFreezeDialogOpen(selectedOrder.sellerId)}>
                        <Shield className="h-4 w-4 mr-2" />
                        Freeze Seller
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={async () => {
                          if (!selectedOrder) return;
                          try {
                            setProcessingOrderId(selectedOrder.id);
                            const token = await user?.getIdToken();
                            const res = await fetch(`/api/orders/${selectedOrder.id}/dispute-packet`, {
                              headers: { authorization: `Bearer ${token}` },
                            });
                            if (!res.ok) throw new Error('Failed to export dispute packet');
                            const blob = await res.blob();
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `dispute-packet-${selectedOrder.id}.json`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            window.URL.revokeObjectURL(url);
                            toast({ title: 'Success', description: 'Dispute packet downloaded.' });
                          } catch (e: any) {
                            toast({ title: 'Error', description: formatUserFacingError(e, 'Failed to export dispute packet'), variant: 'destructive' });
                          } finally {
                            setProcessingOrderId(null);
                          }
                        }}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Export Dispute Packet
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}

// Fulfillment Status Component (reusable)
function FulfillmentStatusBlock({ order, compact = false }: { order: OrderWithDetails; compact?: boolean }) {
  const txStatus = getEffectiveTransactionStatus(order);
  const transportOption = order.transportOption || 'SELLER_TRANSPORT';
  const slaDeadline = order.fulfillmentSlaDeadlineAt;
  const now = Date.now();
  const slaTimeRemaining = slaDeadline ? Math.max(0, slaDeadline.getTime() - now) : null;
  const slaHoursRemaining = slaTimeRemaining ? Math.floor(slaTimeRemaining / (1000 * 60 * 60)) : null;
  const slaMinutesRemaining = slaTimeRemaining ? Math.floor((slaTimeRemaining % (1000 * 60 * 60)) / (1000 * 60)) : null;

  // Progress checklist based on transport
  const progressItems: Array<{ label: string; completed: boolean }> = [];
  if (transportOption === 'SELLER_TRANSPORT') {
    const scheduled = ['DELIVERY_SCHEDULED', 'OUT_FOR_DELIVERY', 'DELIVERED_PENDING_CONFIRMATION', 'COMPLETED'].includes(txStatus);
    const out = ['OUT_FOR_DELIVERY', 'DELIVERED_PENDING_CONFIRMATION', 'COMPLETED'].includes(txStatus);
    const deliveredPending = ['DELIVERED_PENDING_CONFIRMATION', 'COMPLETED'].includes(txStatus);
    const completed = txStatus === 'COMPLETED';
    progressItems.push(
      { label: 'Delivery scheduled', completed: scheduled },
      { label: 'Out for delivery', completed: out },
      { label: 'Delivered (pending confirmation)', completed: deliveredPending },
      { label: 'Completed', completed: completed }
    );
  } else {
    const pickupInfo = ['READY_FOR_PICKUP', 'PICKUP_SCHEDULED', 'PICKED_UP', 'COMPLETED'].includes(txStatus);
    const windowSelected = ['PICKUP_SCHEDULED', 'PICKED_UP', 'COMPLETED'].includes(txStatus);
    const pickupConfirmed = ['PICKED_UP', 'COMPLETED'].includes(txStatus);
    const completed = txStatus === 'COMPLETED';
    progressItems.push(
      { label: 'Pickup info set', completed: pickupInfo },
      { label: 'Pickup window selected', completed: windowSelected },
      { label: 'Pickup confirmed', completed: pickupConfirmed },
      { label: 'Completed', completed: completed }
    );
  }

  if (compact) {
    const currentStep = progressItems.find((p) => !p.completed) || progressItems[progressItems.length - 1];
    const slaLabel = slaDeadline
      ? slaTimeRemaining && slaTimeRemaining > 0
        ? `${slaHoursRemaining}h ${slaMinutesRemaining}m left`
        : 'SLA passed'
      : null;
    const isStalled = !currentStep.completed;
    return (
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {transportOption === 'SELLER_TRANSPORT' ? 'Seller' : 'Buyer'} transport
        </Badge>
        <span className="text-muted-foreground">
          {currentStep.completed ? (
            <span className="text-green-600 font-medium">{currentStep.label}</span>
          ) : (
            <span>
              {isStalled ? 'Stalled at: ' : ''}
              <span className="font-medium">{currentStep.label}</span>
            </span>
          )}
        </span>
        {slaLabel && (
          <Badge variant={slaTimeRemaining && slaTimeRemaining > 0 ? (slaHoursRemaining && slaHoursRemaining < 24 ? 'destructive' : 'secondary') : 'destructive'} className="text-[10px] px-1.5 py-0">
            {slaLabel}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={txStatus === 'COMPLETED' ? 'default' : txStatus === 'DISPUTE_OPENED' ? 'destructive' : 'secondary'} className="text-xs">
          {txStatus.replaceAll('_', ' ')}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {transportOption === 'SELLER_TRANSPORT' ? 'Seller Transport' : 'Buyer Transport'}
        </Badge>
        {slaDeadline ? (
          <Badge variant={slaTimeRemaining && slaTimeRemaining > 0 ? (slaHoursRemaining && slaHoursRemaining < 24 ? 'destructive' : 'secondary') : 'destructive'} className="text-xs">
            {slaTimeRemaining && slaTimeRemaining > 0
              ? `${slaHoursRemaining !== null && slaMinutesRemaining !== null ? `${slaHoursRemaining}h ${slaMinutesRemaining}m` : 'Calculating...'}`
              : 'SLA Passed'}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs">No SLA</Badge>
        )}
      </div>
      <div className="space-y-1">
        {progressItems.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2 text-xs">
            {item.completed ? (
              <CheckCircle className="h-3 w-3 text-green-600 shrink-0" />
            ) : (
              <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
            )}
            <span className={item.completed ? 'text-green-600 font-medium' : 'text-muted-foreground'}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Order Card Component — scannable, prominent "waiting on" and one-tap Remind
function OrderCard({
  order,
  onRefund,
  onMarkPaid,
  onView,
  onRemind,
  onConfirmDelivery,
  selected,
  onSelect,
  isAtRisk = false,
}: {
  order: OrderWithDetails;
  onRefund: () => void;
  onMarkPaid: () => void;
  onView: () => void;
  onRemind?: (role: 'buyer' | 'seller') => void;
  onConfirmDelivery?: () => void;
  selected?: boolean;
  onSelect?: (orderId: string, checked: boolean) => void;
  isAtRisk?: boolean;
}) {
  const txStatus = getEffectiveTransactionStatus(order);
  const isAwaitingBankRails = order.status === 'awaiting_bank_transfer' || order.status === 'awaiting_wire';
  const nextAction = getNextRequiredAction(order, 'admin');
  const badge = getUXBadge(order, 'admin');
  const isDeliveredPendingConfirmation = txStatus === 'DELIVERED_PENDING_CONFIRMATION';
  const waitingOn = nextAction?.ownerRole === 'buyer' ? 'buyer' : nextAction?.ownerRole === 'seller' ? 'seller' : null;
  const slaDeadline = order.fulfillmentSlaDeadlineAt;
  const now = Date.now();
  const slaPassed = slaDeadline && slaDeadline.getTime() < now;
  const lastChange = order.lastStatusChangedAt?.getTime() || order.updatedAt?.getTime() || order.createdAt?.getTime() || 0;
  const hoursSinceUpdate = (now - lastChange) / (1000 * 60 * 60);
  const isStalled = hoursSinceUpdate > 48;

  return (
    <Card className={`rounded-xl border transition-colors ${isAtRisk ? 'border-destructive/60 bg-destructive/5' : 'border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card'}`}>
      <CardContent className="pt-0 pb-3 md:pt-0 md:pb-4 px-3 sm:px-4">
        {/* Prominent "Waiting on" strip */}
        {nextAction && waitingOn && (
          <div
            className={cn(
              'flex items-center justify-between gap-3 px-3 py-2 -mx-3 sm:-mx-4 mb-3 rounded-t-xl',
              waitingOn === 'buyer' ? 'bg-blue-500/15 border-b border-blue-500/30' : 'bg-amber-500/15 border-b border-amber-500/30'
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn(
                'text-sm font-bold shrink-0',
                waitingOn === 'buyer' ? 'text-blue-700 dark:text-blue-300' : 'text-amber-700 dark:text-amber-300'
              )}>
                Waiting on: {waitingOn === 'buyer' ? 'Buyer' : 'Seller'}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {nextAction.description?.split('.')[0] ?? nextAction.title}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {slaPassed && (
                <Badge variant="destructive" className="text-[10px]">SLA passed</Badge>
              )}
              {isStalled && !slaPassed && (
                <Badge variant="secondary" className="text-[10px]">Stalled</Badge>
              )}
              {onRemind && (
                <Button
                  size="sm"
                  className={cn(
                    'min-h-[28px] h-7 text-xs font-semibold',
                    waitingOn === 'buyer' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'
                  )}
                  onClick={() => onRemind(waitingOn)}
                >
                  <Mail className="h-3 w-3 mr-1.5" />
                  Remind {waitingOn === 'buyer' ? 'Buyer' : 'Seller'}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-3 md:gap-4">
          {onSelect && (
            <div className="flex items-center shrink-0 pt-1">
              <Checkbox
                checked={selected || false}
                onCheckedChange={(checked) => onSelect(order.id, checked === true)}
              />
            </div>
          )}
          {order.listingImage ? (
            <img
              src={order.listingImage}
              alt=""
              className="w-14 h-14 md:w-16 md:h-16 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="w-14 h-14 md:w-16 md:h-16 rounded-lg bg-muted shrink-0 flex items-center justify-center">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-muted-foreground">#{order.id.slice(-8)}</span>
              <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
              {isAtRisk && (
                <Badge variant="destructive" className="text-xs">At risk</Badge>
              )}
            </div>
            <h3 className="font-semibold text-sm md:text-base break-words leading-tight">
              {order.listingTitle || (order as any).listingSnapshot?.title || order.listingId || 'Unknown Listing'}
            </h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span>Buyer: {order.buyerName || '—'}</span>
              <span>Seller: {order.sellerName || '—'}</span>
              <span className="font-semibold text-foreground">{formatCurrency(order.amount)}</span>
              <span>{formatDate(order.createdAt)}</span>
            </div>
            <FulfillmentStatusBlock order={order} compact />
          </div>
        </div>
        <div className="flex gap-2 flex-wrap mt-3 pt-3 border-t">
          <Button variant="outline" size="sm" className="min-h-[32px] h-8" onClick={onView}>
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            View
          </Button>
          {onRemind && !waitingOn && (
            <>
              <Button variant="outline" size="sm" className="min-h-[32px] h-8" onClick={() => onRemind('buyer')}>
                <Mail className="h-3.5 w-3.5 mr-1.5" />
                Remind Buyer
              </Button>
              <Button variant="outline" size="sm" className="min-h-[32px] h-8" onClick={() => onRemind('seller')}>
                <Mail className="h-3.5 w-3.5 mr-1.5" />
                Remind Seller
              </Button>
            </>
          )}
          {isDeliveredPendingConfirmation && onConfirmDelivery && (
            <Button size="sm" className="min-h-[32px] h-8 bg-green-600 hover:bg-green-700" onClick={onConfirmDelivery}>
              <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
              Confirm Delivery
            </Button>
          )}
          {isAwaitingBankRails && (
            <Button size="sm" className="min-h-[32px] h-8 bg-blue-600 hover:bg-blue-700" onClick={onMarkPaid}>
              <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
              Mark Paid
            </Button>
          )}
          <Button variant="destructive" size="sm" className="min-h-[32px] h-8" onClick={onRefund}>
            Refund
          </Button>
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
}: {
  order: OrderWithDetails;
  onResolve: () => void;
  onView: () => void;
}) {
  const txStatus = getEffectiveTransactionStatus(order);
  return (
    <Card className="rounded-xl border border-border/60 bg-muted/30 dark:bg-muted/20 md:border-2 md:bg-card">
      <CardContent className="pt-4 pb-4 md:pt-6 px-3 sm:px-6">
        <div className="flex flex-col gap-3 md:gap-4">
          <div className="flex-1 space-y-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs md:text-sm text-muted-foreground">#{order.id.slice(-8)}</span>
              <Badge variant={txStatus === 'COMPLETED' ? 'default' : txStatus === 'DISPUTE_OPENED' ? 'destructive' : 'secondary'} className="text-xs">
                {txStatus.replaceAll('_', ' ')}
              </Badge>
            </div>
            <h3 className="font-semibold text-sm md:text-base break-words">{order.listingTitle || (order as any).listingSnapshot?.title || order.listingId || 'Unknown Listing'}</h3>
            <div className="text-xs md:text-sm text-muted-foreground space-y-0.5">
              <p className="truncate">Buyer: {order.buyerName} | Seller: {order.sellerName}</p>
              <p>Amount: {formatCurrency(order.amount)}</p>
              {order.disputeReasonV2 && <p>Reason: {order.disputeReasonV2}</p>}
              {order.disputeOpenedAt && <p>Opened: {formatDate(order.disputeOpenedAt)}</p>}
              {order.disputeEvidence && order.disputeEvidence.length > 0 && (
                <p>Evidence: {order.disputeEvidence.length} item(s)</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap border-t pt-3">
            <Button variant="outline" size="sm" className="min-h-[36px]" onClick={onView}>
              <Eye className="h-4 w-4 mr-2" />
              View Evidence
            </Button>
            <Button size="sm" className="min-h-[36px] bg-blue-600 hover:bg-blue-700" onClick={onResolve}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Resolve
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

