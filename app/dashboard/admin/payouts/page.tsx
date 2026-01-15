'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  CheckCircle, 
  Package, 
  Loader2, 
  AlertCircle, 
  DollarSign, 
  Calendar,
  Search,
  Filter,
  TrendingUp,
  Clock,
  Truck,
  CreditCard,
  Users,
  Eye,
  ArrowRight,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatDate } from '@/lib/utils';
import { collection, query, where, getDocs, updateDoc, doc, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Order, OrderStatus } from '@/lib/types';
import { getListingById } from '@/lib/firebase/listings';
import { getUserProfile } from '@/lib/firebase/users';
import { releasePayment, processRefund } from '@/lib/stripe/api';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Undo2 } from 'lucide-react';

interface OrderWithDetails extends Order {
  listingTitle?: string;
  listingImage?: string;
  buyerName?: string;
  sellerName?: string;
  buyerEmail?: string;
  sellerEmail?: string;
}

type FilterStatus = 'all' | 'paid' | 'completed';

export default function AdminPayoutsPage() {
  const { isAdmin, loading: adminLoading } = useAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [refundDialogOpen, setRefundDialogOpen] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundAmount, setRefundAmount] = useState<string>('');

  useEffect(() => {
    if (!adminLoading && isAdmin) {
      loadOrders();
    }
  }, [adminLoading, isAdmin]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const ordersRef = collection(db, 'orders');
      // Query all orders and filter client-side to avoid index requirement
      // For admin, we can load all orders since we have permission
      const q = query(
        ordersRef,
        orderBy('createdAt', 'desc')
      );
      
      const snapshot = await getDocs(q);
      const ordersData: OrderWithDetails[] = [];
      
      // Fetch details for each order
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        
        // Filter to only paid/completed orders (client-side filter before processing)
        // Include all escrow statuses for admin view
        const escrowStatuses = ['paid', 'in_transit', 'delivered', 'accepted', 'disputed', 'completed'];
        if (!escrowStatuses.includes(data.status)) {
          continue;
        }
        
        const order: OrderWithDetails = {
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          completedAt: data.completedAt?.toDate(),
        } as OrderWithDetails;

        // Fetch listing details
        try {
          const listing = await getListingById(order.listingId);
          order.listingTitle = listing?.title || 'Unknown Listing';
          order.listingImage = listing?.images?.[0];
        } catch (err) {
          console.error(`Error fetching listing ${order.listingId}:`, err);
        }

        // Fetch buyer details
        try {
          const buyerProfile = await getUserProfile(order.buyerId);
          order.buyerName = buyerProfile?.displayName || buyerProfile?.email?.split('@')[0] || 'Unknown Buyer';
          order.buyerEmail = buyerProfile?.email;
        } catch (err) {
          console.error(`Error fetching buyer ${order.buyerId}:`, err);
        }

        // Fetch seller details
        try {
          const sellerProfile = await getUserProfile(order.sellerId);
          order.sellerName = sellerProfile?.displayName || sellerProfile?.email?.split('@')[0] || 'Unknown Seller';
          order.sellerEmail = sellerProfile?.email;
        } catch (err) {
          console.error(`Error fetching seller ${order.sellerId}:`, err);
        }

        ordersData.push(order);
      }
      
      setOrders(ordersData);
    } catch (error) {
      console.error('Error loading orders:', error);
      toast({
        title: 'Error',
        description: 'Failed to load orders.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDelivery = async (orderId: string) => {
    if (!user) return;
    
    try {
      setProcessingId(orderId);
      
      // Release payment via Stripe transfer API
      const result = await releasePayment(orderId);
      
      toast({
        title: '✅ Payment Released',
        description: `Transfer ${result.transferId} created. ${formatCurrency(result.amount)} has been sent to the seller.`,
      });
      
      await loadOrders();
    } catch (error: any) {
      console.error('Error releasing payment:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to release payment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const handleProcessRefund = async (orderId: string) => {
    if (!user) return;
    
    try {
      setProcessingId(orderId);
      
      // Parse refund amount if provided (partial refund)
      const amount = refundAmount ? parseFloat(refundAmount) : undefined;
      
      if (amount !== undefined && (isNaN(amount) || amount <= 0)) {
        toast({
          title: 'Invalid Amount',
          description: 'Refund amount must be a positive number.',
          variant: 'destructive',
        });
        return;
      }
      
      // Process refund via Stripe API
      const result = await processRefund(orderId, refundReason.trim() ? refundReason : '', amount);
      
      toast({
        title: '✅ Refund Processed',
        description: result.isFullRefund 
          ? `Full refund of ${formatCurrency(result.amount)} processed. Refund ID: ${result.refundId}`
          : `Partial refund of ${formatCurrency(result.amount)} processed. Refund ID: ${result.refundId}`,
      });
      
      // Reset form
      setRefundDialogOpen(null);
      setRefundReason('');
      setRefundAmount('');
      
      await loadOrders();
    } catch (error: any) {
      console.error('Error processing refund:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to process refund. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  // Filter orders
  const filteredOrders = useMemo(() => {
    let filtered = orders;

    // Filter by status
    if (filterStatus !== 'all') {
      filtered = filtered.filter(order => order.status === filterStatus);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order =>
        order.listingTitle?.toLowerCase().includes(query) ||
        order.buyerName?.toLowerCase().includes(query) ||
        order.sellerName?.toLowerCase().includes(query) ||
        order.id.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [orders, filterStatus, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const total = orders.length;
    const paid = orders.filter(o => o.status === 'paid').length;
    const completed = orders.filter(o => o.status === 'completed').length;
    const totalValue = orders.reduce((sum, o) => sum + o.amount, 0);
    const totalFees = orders.reduce((sum, o) => sum + o.platformFee, 0);
    const totalPayouts = orders.reduce((sum, o) => sum + o.sellerAmount, 0);
    const pendingPayouts = orders
      .filter(o => o.status === 'paid')
      .reduce((sum, o) => sum + o.sellerAmount, 0);

    return { total, paid, completed, totalValue, totalFees, totalPayouts, pendingPayouts };
  }, [orders]);

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'paid':
        return <Badge variant="default" className="bg-blue-600">Paid - Awaiting Delivery</Badge>;
      case 'completed':
        return <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50">Completed</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending Payment</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
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
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
              <p className="text-muted-foreground">You don't have permission to access this page.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Orders eligible for release: accepted OR (deadline passed + not disputed + not adminHold)
  const eligibleForRelease = filteredOrders.filter((o) => {
    if (o.status === 'accepted') return true;
    if (o.status === 'disputed') return false;
    if (o.adminHold) return false;
    if (!o.disputeDeadlineAt) return false;
    const deadline = o.disputeDeadlineAt instanceof Date 
      ? o.disputeDeadlineAt 
      : new Date(o.disputeDeadlineAt);
    if (deadline.getTime() < Date.now()) {
      return ['paid', 'in_transit', 'delivered'].includes(o.status);
    }
    return false;
  });
  
  const pendingOrders = filteredOrders.filter(o => o.status === 'paid');

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">Manage Payouts</h1>
          <p className="text-muted-foreground">
            Confirm deliveries and release payments to sellers
          </p>
        </div>
        <Button onClick={loadOrders} variant="outline" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading...
            </>
          ) : (
            'Refresh'
          )}
        </Button>
      </div>

      {/* Stats Cards */}
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
                <p className="text-xs text-muted-foreground mt-1">Platform fee (varies by seller plan)</p>
              </div>
              <DollarSign className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by listing, buyer, seller, or order ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value as FilterStatus)}>
              <SelectTrigger className="w-full md:w-[200px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Orders</SelectItem>
                <SelectItem value="paid">Pending Payouts</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Orders */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : pendingOrders.length === 0 && filterStatus !== 'completed' ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {searchQuery || filterStatus !== 'all' ? 'No matching orders' : 'No Pending Payouts'}
              </h3>
              <p className="text-muted-foreground">
                {searchQuery || filterStatus !== 'all'
                  ? 'Try adjusting your filters or search query.'
                  : 'All deliveries have been confirmed and payments released.'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filterStatus === 'all' && pendingOrders.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-orange-600" />
                Pending Payouts ({pendingOrders.length})
              </h2>
              <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                  {pendingOrders.map((order, index) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      index={index}
                      processingId={processingId}
                      onConfirmDelivery={handleConfirmDelivery}
                      onProcessRefund={handleProcessRefund}
                      refundDialogOpen={refundDialogOpen}
                      setRefundDialogOpen={setRefundDialogOpen}
                      refundReason={refundReason}
                      setRefundReason={setRefundReason}
                      refundAmount={refundAmount}
                      setRefundAmount={setRefundAmount}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {filterStatus === 'paid' && (
            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {pendingOrders.map((order, index) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    index={index}
                    processingId={processingId}
                    onConfirmDelivery={handleConfirmDelivery}
                    onProcessRefund={handleProcessRefund}
                    refundDialogOpen={refundDialogOpen}
                    setRefundDialogOpen={setRefundDialogOpen}
                    refundReason={refundReason}
                    setRefundReason={setRefundReason}
                    refundAmount={refundAmount}
                    setRefundAmount={setRefundAmount}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}

          {(filterStatus === 'all' || filterStatus === 'completed') && (
            <div>
              {filterStatus === 'all' && pendingOrders.length > 0 && (
                <h2 className="text-xl font-semibold mb-4 mt-8 flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Completed Orders ({filteredOrders.filter(o => o.status === 'completed').length})
                </h2>
              )}
              <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                  {filteredOrders
                    .filter(o => o.status === 'completed')
                    .map((order, index) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        index={index}
                        processingId={processingId}
                        onConfirmDelivery={handleConfirmDelivery}
                        onProcessRefund={handleProcessRefund}
                        refundDialogOpen={refundDialogOpen}
                        setRefundDialogOpen={setRefundDialogOpen}
                        refundReason={refundReason}
                        setRefundReason={setRefundReason}
                        refundAmount={refundAmount}
                        setRefundAmount={setRefundAmount}
                      />
                    ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OrderCard({
  order,
  index,
  processingId,
  onConfirmDelivery,
  onProcessRefund,
  refundDialogOpen,
  setRefundDialogOpen,
  refundReason,
  setRefundReason,
  refundAmount,
  setRefundAmount,
}: {
  order: OrderWithDetails;
  index: number;
  processingId: string | null;
  onConfirmDelivery: (id: string) => void;
  onProcessRefund: (id: string) => void;
  refundDialogOpen: string | null;
  setRefundDialogOpen: (id: string | null) => void;
  refundReason: string;
  setRefundReason: (reason: string) => void;
  refundAmount: string;
  setRefundAmount: (amount: string) => void;
}) {
  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'paid':
        return <Badge variant="default" className="bg-blue-600">Paid - Awaiting Delivery</Badge>;
      case 'completed':
        return <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50">Completed</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending Payment</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
    >
      <Card className={`border-2 ${order.status === 'paid' ? 'border-orange-200 bg-orange-50/50' : 'hover:border-primary/50'} transition-colors`}>
        <CardContent className="p-6">
          <div className="grid md:grid-cols-[120px_1fr_auto] gap-6">
            {/* Listing Image */}
            <div className="relative w-full h-32 rounded-lg overflow-hidden bg-muted">
              {order.listingImage ? (
                <img
                  src={order.listingImage}
                  alt={order.listingTitle}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <Package className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Order Details */}
            <div className="space-y-4">
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold mb-1">{order.listingTitle || 'Unknown Listing'}</h3>
                    <div className="flex items-center gap-2 mb-2">
                      {getStatusBadge(order.status)}
                      <span className="text-xs text-muted-foreground">
                        Order #{order.id.slice(-8)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Transaction Details */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Transaction
                  </h4>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total Amount:</span>
                      <span className="font-semibold">{formatCurrency(order.amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Platform Fee:</span>
                      <span className="font-semibold text-destructive">{formatCurrency(order.platformFee)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t font-semibold">
                      <span>Seller Payout:</span>
                      <span className="text-primary text-base">{formatCurrency(order.sellerAmount)}</span>
                    </div>
                  </div>
                </div>

                {/* Parties */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Parties
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Buyer</p>
                      <p className="font-medium">{order.buyerName || 'Unknown'}</p>
                      {order.buyerEmail && (
                        <p className="text-xs text-muted-foreground">{order.buyerEmail}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Seller</p>
                      <p className="font-medium">{order.sellerName || 'Unknown'}</p>
                      {order.sellerEmail && (
                        <p className="text-xs text-muted-foreground">{order.sellerEmail}</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>Ordered: {formatDate(order.createdAt)}</span>
                </div>
                {order.completedAt && (
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-green-600" />
                    <span>Completed: {formatDate(order.completedAt)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 min-w-[180px]">
              <Link href={`/listing/${order.listingId}`} target="_blank">
                <Button variant="outline" className="w-full" size="sm">
                  <Eye className="mr-2 h-4 w-4" />
                  View Listing
                </Button>
              </Link>
              {order.status === 'paid' && (
                <Button
                  onClick={() => onConfirmDelivery(order.id)}
                  disabled={processingId === order.id}
                  className="w-full bg-green-600 hover:bg-green-700"
                  size="sm"
                >
                  {processingId === order.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Confirm & Release
                    </>
                  )}
                </Button>
              )}
              {order.status === 'completed' && !order.stripeRefundId && (
                <Dialog open={refundDialogOpen === order.id} onOpenChange={(open) => setRefundDialogOpen(open ? order.id : null)}>
                  <DialogTrigger asChild>
                    <Button
                      variant="destructive"
                      className="w-full"
                      size="sm"
                      disabled={processingId === order.id}
                    >
                      <Undo2 className="mr-2 h-4 w-4" />
                      Process Refund
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Process Refund</DialogTitle>
                      <DialogDescription>
                        Process a refund for this order. Leave amount empty for full refund.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="refund-reason">Refund Reason</Label>
                        <Textarea
                          id="refund-reason"
                          placeholder="Enter reason for refund..."
                          value={refundReason}
                          onChange={(e) => setRefundReason(e.target.value)}
                          className="mt-1"
                          rows={3}
                        />
                      </div>
                      <div>
                        <Label htmlFor="refund-amount">Refund Amount (Optional)</Label>
                        <Input
                          id="refund-amount"
                          type="number"
                          placeholder={`Full refund: ${formatCurrency(order.amount)}`}
                          value={refundAmount}
                          onChange={(e) => setRefundAmount(e.target.value)}
                          className="mt-1"
                          min={0}
                          max={order.amount}
                          step="0.01"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Leave empty for full refund. Maximum: {formatCurrency(order.amount)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => onProcessRefund(order.id)}
                          disabled={processingId === order.id}
                          variant="destructive"
                          className="flex-1"
                        >
                          {processingId === order.id ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <Undo2 className="mr-2 h-4 w-4" />
                              Process Refund
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setRefundDialogOpen(null);
                            setRefundReason('');
                            setRefundAmount('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              {order.status === 'refunded' && (
                <div className="space-y-2">
                  <div className="text-xs text-center text-red-600 p-2 bg-red-50 rounded-md border border-red-200">
                    <p className="font-semibold">Refunded</p>
                    {order.refundReason && (
                      <p className="text-xs mt-1">Reason: {order.refundReason}</p>
                    )}
                    {order.refundedAt && (
                      <p className="text-xs mt-1">Date: {formatDate(order.refundedAt)}</p>
                    )}
                  </div>
                </div>
              )}
              {order.status === 'completed' && order.stripeRefundId && (
                <div className="text-xs text-center text-muted-foreground p-2 bg-green-50 rounded-md">
                  Payment released
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
