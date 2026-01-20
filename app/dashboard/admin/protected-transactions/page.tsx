/**
 * Admin Dashboard for Protected Transactions
 * 
 * Shows orders with:
 * - Status "ready_to_release" (protection window ended, buyer accepted, or eligible)
 * - Open disputes requiring admin review
 */

'use client';

/* eslint-disable @next/next/no-img-element */

import React, { useState, useEffect, useMemo } from 'react';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Shield,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Loader2,
  Search,
  Filter,
  Package,
  DollarSign,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Order, DisputeStatus, DisputeReason } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { releasePayment } from '@/lib/stripe/api';
import Link from 'next/link';

interface OrderWithDetails extends Order {
  listingTitle?: string;
  listingImage?: string;
  buyerName?: string;
  sellerName?: string;
  buyerEmail?: string;
  sellerEmail?: string;
}

type FilterType = 'all' | 'ready_to_release' | 'disputes' | 'protection_window';

export default function AdminProtectedTransactionsPage() {
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
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [selectedOrder, setSelectedOrder] = useState<OrderWithDetails | null>(null);
  const [showDisputeDialog, setShowDisputeDialog] = useState(false);
  const [showReleaseDialog, setShowReleaseDialog] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [resolutionType, setResolutionType] = useState<'release' | 'refund' | 'partial_refund'>('release');
  const [refundAmount, setRefundAmount] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [markFraudulent, setMarkFraudulent] = useState(false);

  const hydrateOrder = (raw: any): OrderWithDetails => {
    const copy: any = { ...raw };
    const dateFields = [
      'createdAt',
      'updatedAt',
      'paidAt',
      'deliveredAt',
      'deliveryConfirmedAt',
      'protectionStartAt',
      'protectionEndsAt',
      'buyerConfirmedAt',
      'buyerAcceptedAt',
      'disputedAt',
      'disputeOpenedAt',
    ];
    for (const k of dateFields) {
      if (k in copy) {
        const d = toDateSafe(copy[k]);
        if (d) copy[k] = d;
      }
    }
    if (Array.isArray(copy?.disputeEvidence)) {
      copy.disputeEvidence = copy.disputeEvidence.map((e: any) => ({
        ...e,
        uploadedAt: toDateSafe(e?.uploadedAt) || e?.uploadedAt,
      }));
    }
    return copy as OrderWithDetails;
  };

  const loadOrders = async (opts?: { cursor?: string | null; append?: boolean }) => {
    if (!isAdmin || !user) return;
    const append = opts?.append === true;
    const cursorValue = typeof opts?.cursor === 'string' ? opts?.cursor : null;

    try {
      setLoading(true);
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      params.set('limit', '50');
      if (cursorValue) params.set('cursor', cursorValue);

      const res = await fetch(`/api/admin/orders/protected?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.message || 'Failed to load protected transactions');
      }

      const nextOrders: OrderWithDetails[] = Array.isArray(data?.orders) ? data.orders.map(hydrateOrder) : [];
      setOrders((prev) => (append ? [...prev, ...nextOrders] : nextOrders));
      setCursor(typeof data?.nextCursor === 'string' ? data.nextCursor : null);
      setHasMore(!!data?.nextCursor);
    } catch (error: any) {
      console.error('Error loading orders:', error);
      toast({
        title: 'Error loading orders',
        description: error.message || 'Failed to load orders',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    if (!user) return;
    loadOrders({ cursor: null, append: false });
  }, [isAdmin, adminLoading, user]);

  const filteredOrders = useMemo(() => {
    let result = [...orders];

    if (filterType === 'ready_to_release') {
      result = result.filter(o => o.status === 'ready_to_release');
    } else if (filterType === 'disputes') {
      result = result.filter(o => 
        o.disputeStatus && 
        ['open', 'needs_evidence', 'under_review'].includes(o.disputeStatus)
      );
    } else if (filterType === 'protection_window') {
      result = result.filter(o => 
        o.payoutHoldReason === 'protection_window' && 
        o.protectionEndsAt && 
        toMillisSafe((o as any).protectionEndsAt) > Date.now()
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(o =>
        o.listingTitle?.toLowerCase().includes(query) ||
        o.buyerName?.toLowerCase().includes(query) ||
        o.sellerName?.toLowerCase().includes(query) ||
        o.id.toLowerCase().includes(query)
      );
    }

    return result.sort((a, b) => toMillisSafe((b as any).createdAt) - toMillisSafe((a as any).createdAt));
  }, [orders, filterType, searchQuery]);

  const handleRelease = async (orderId: string) => {
    if (!user) return;

    try {
      setProcessingId(orderId);
      await releasePayment(orderId);
      toast({
        title: 'Payment released',
        description: 'Funds have been transferred to the seller.',
      });
      // Refresh orders
      // await loadOrders();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to release payment',
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
      setShowReleaseDialog(false);
    }
  };

  const handleResolveDispute = async () => {
    if (!selectedOrder || !user) return;

    try {
      setProcessingId(selectedOrder.id);
      const token = await user.getIdToken();
      
      const response = await fetch(`/api/orders/${selectedOrder.id}/disputes/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resolution: resolutionType,
          refundAmount: resolutionType === 'partial_refund' ? parseFloat(refundAmount) : undefined,
          markFraudulent,
          adminNotes: adminNotes.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to resolve dispute');
      }

      toast({
        title: 'Dispute resolved',
        description: `Dispute resolved: ${resolutionType}`,
      });

      setShowDisputeDialog(false);
      setSelectedOrder(null);
      setResolutionType('release');
      setRefundAmount('');
      setAdminNotes('');
      setMarkFraudulent(false);
      // Refresh orders
      // await loadOrders();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to resolve dispute',
        variant: 'destructive',
      });
    } finally {
      setProcessingId(null);
    }
  };

  const getDisputeStatusBadge = (status?: DisputeStatus) => {
    if (!status || status === 'none') return null;
    
    switch (status) {
      case 'open':
        return <Badge variant="default" className="bg-orange-600">Open</Badge>;
      case 'needs_evidence':
        return <Badge variant="default" className="bg-yellow-600">Needs Evidence</Badge>;
      case 'under_review':
        return <Badge variant="default" className="bg-blue-600">Under Review</Badge>;
      case 'resolved_refund':
        return <Badge variant="default" className="bg-green-600">Resolved - Refunded</Badge>;
      case 'resolved_partial_refund':
        return <Badge variant="default" className="bg-green-600">Resolved - Partial Refund</Badge>;
      case 'resolved_release':
        return <Badge variant="default" className="bg-green-600">Resolved - Released</Badge>;
      case 'cancelled':
        return <Badge variant="outline">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (adminLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
              <p className="text-muted-foreground">You do not have admin privileges.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl">
        <div className="mb-6 md:mb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-2">
            Protected Transactions
          </h1>
          <p className="text-base md:text-lg text-muted-foreground">
            Manage protected transaction orders, disputes, and releases
          </p>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search by order ID, listing, buyer, or seller..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterType} onValueChange={(value) => setFilterType(value as FilterType)}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Orders</SelectItem>
                  <SelectItem value="ready_to_release">Ready to Release</SelectItem>
                  <SelectItem value="disputes">Open Disputes</SelectItem>
                  <SelectItem value="protection_window">In Protection Window</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Orders List */}
        {filteredOrders.length === 0 ? (
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No orders found</h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery || filterType !== 'all'
                  ? 'Try adjusting your filters or search query.'
                  : 'No protected transaction orders at this time.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order) => (
              <Card key={order.id} className="border-2">
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
                        <h3 className="text-lg font-bold mb-2">{order.listingTitle || 'Unknown Listing'}</h3>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {getDisputeStatusBadge(order.disputeStatus)}
                          {order.status === 'ready_to_release' && (
                            <Badge variant="default" className="bg-green-600">Ready to Release</Badge>
                          )}
                          {order.payoutHoldReason === 'protection_window' && (
                            <Badge variant="default" className="bg-blue-600">Protection Window Active</Badge>
                          )}
                          {order.payoutHoldReason === 'dispute_open' && (
                            <Badge variant="destructive">Dispute Open</Badge>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Buyer</p>
                          <p className="font-medium">{order.buyerName || 'Unknown'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Seller</p>
                          <p className="font-medium">{order.sellerName || 'Unknown'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Amount</p>
                          <p className="font-semibold">{formatCurrency(order.amount)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Seller Payout</p>
                          <p className="font-semibold text-primary">{formatCurrency(order.sellerAmount)}</p>
                        </div>
                        {order.protectionStartAt && (
                          <div>
                            <p className="text-muted-foreground">Protection Started</p>
                            <p className="font-medium">{formatDate(order.protectionStartAt)}</p>
                          </div>
                        )}
                        {order.protectionEndsAt && (
                          <div>
                            <p className="text-muted-foreground">Protection Ends</p>
                            <p className="font-medium">
                              {formatDate(order.protectionEndsAt)}
                              {order.protectionEndsAt.getTime() < Date.now() && (
                                <span className="ml-2 text-green-600 font-semibold">(Passed)</span>
                              )}
                            </p>
                          </div>
                        )}
                        {order.disputeReasonV2 && (
                          <div>
                            <p className="text-muted-foreground">Dispute Reason</p>
                            <p className="font-medium capitalize">{order.disputeReasonV2.replace('_', ' ')}</p>
                          </div>
                        )}
                      </div>

                      {order.disputeEvidence && order.disputeEvidence.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-1">Evidence</p>
                          <div className="flex flex-wrap gap-2">
                            {order.disputeEvidence.map((evidence, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {evidence.type === 'photo' && <ImageIcon className="h-3 w-3 mr-1" />}
                                {evidence.type === 'vet_report' && <FileText className="h-3 w-3 mr-1" />}
                                {evidence.type}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 min-w-[180px]">
                      <Link href={`/listing/${order.listingId}`} target="_blank">
                        <Button variant="outline" className="w-full" size="sm">
                          <Eye className="mr-2 h-4 w-4" />
                          View Listing
                        </Button>
                      </Link>
                      
                      {order.status === 'ready_to_release' && (
                        <Button
                          onClick={() => {
                            setSelectedOrder(order);
                            setShowReleaseDialog(true);
                          }}
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
                              <DollarSign className="mr-2 h-4 w-4" />
                              Release Payment
                            </>
                          )}
                        </Button>
                      )}

                      {order.disputeStatus && 
                       ['open', 'needs_evidence', 'under_review'].includes(order.disputeStatus) && (
                        <Button
                          onClick={() => {
                            setSelectedOrder(order);
                            setShowDisputeDialog(true);
                          }}
                          variant="outline"
                          className="w-full"
                          size="sm"
                        >
                          <AlertTriangle className="mr-2 h-4 w-4" />
                          Resolve Dispute
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {hasMore && !loading && (
          <div className="pt-4 flex justify-center">
            <Button variant="outline" onClick={() => loadOrders({ cursor, append: true })}>
              Load more
            </Button>
          </div>
        )}

        {/* Release Dialog */}
        <Dialog open={showReleaseDialog} onOpenChange={setShowReleaseDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Release Payment</DialogTitle>
              <DialogDescription>
                Release funds to seller for order {selectedOrder?.id.slice(-8)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Seller Payout</p>
                <p className="text-2xl font-bold">{selectedOrder && formatCurrency(selectedOrder.sellerAmount)}</p>
              </div>
              {selectedOrder?.protectionEndsAt && (
                <div>
                  <p className="text-sm text-muted-foreground">Protection Window</p>
                  <p className="text-sm">
                    {selectedOrder.protectionEndsAt.getTime() < Date.now() 
                      ? 'Protection window has ended'
                      : `Ends on ${formatDate(selectedOrder.protectionEndsAt)}`}
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowReleaseDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => selectedOrder && handleRelease(selectedOrder.id)}
                disabled={processingId === selectedOrder?.id}
                className="bg-green-600 hover:bg-green-700"
              >
                {processingId === selectedOrder?.id ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Release Payment'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dispute Resolution Dialog */}
        <Dialog open={showDisputeDialog} onOpenChange={setShowDisputeDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Resolve Dispute</DialogTitle>
              <DialogDescription>
                Review and resolve dispute for order {selectedOrder?.id.slice(-8)}
              </DialogDescription>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold mb-2">Dispute Details</p>
                  <div className="space-y-1 text-sm">
                    <p><span className="text-muted-foreground">Reason:</span> {selectedOrder.disputeReasonV2?.replace('_', ' ')}</p>
                    {selectedOrder.disputeNotes && (
                      <p><span className="text-muted-foreground">Notes:</span> {selectedOrder.disputeNotes}</p>
                    )}
                  </div>
                </div>

                {selectedOrder.disputeEvidence && selectedOrder.disputeEvidence.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold mb-2">Evidence</p>
                    <div className="space-y-2">
                      {selectedOrder.disputeEvidence.map((evidence, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 border rounded">
                          {evidence.type === 'photo' && <ImageIcon className="h-4 w-4" />}
                          {evidence.type === 'vet_report' && <FileText className="h-4 w-4" />}
                          <span className="text-sm capitalize">{evidence.type}</span>
                          <a
                            href={evidence.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline ml-auto"
                          >
                            View
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-sm font-semibold mb-2">Resolution</p>
                  <Select value={resolutionType} onValueChange={(value) => setResolutionType(value as any)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="release">Release to Seller</SelectItem>
                      <SelectItem value="refund">Full Refund to Buyer</SelectItem>
                      <SelectItem value="partial_refund">Partial Refund</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {resolutionType === 'partial_refund' && (
                  <div>
                    <p className="text-sm font-semibold mb-2">Refund Amount</p>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={`Max: ${formatCurrency(selectedOrder.amount)}`}
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                    />
                  </div>
                )}

                <div>
                  <p className="text-sm font-semibold mb-2">Admin Notes (Optional)</p>
                  <textarea
                    className="w-full p-2 border rounded text-sm"
                    rows={3}
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Internal notes about this resolution..."
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="mark-fraudulent"
                    checked={markFraudulent}
                    onChange={(e) => setMarkFraudulent(e.target.checked)}
                  />
                  <label htmlFor="mark-fraudulent" className="text-sm">
                    Mark as fraudulent claim (will affect buyer's protection eligibility)
                  </label>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDisputeDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleResolveDispute}
                disabled={processingId === selectedOrder?.id || (resolutionType === 'partial_refund' && !refundAmount)}
              >
                {processingId === selectedOrder?.id ? (
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
      </div>
    </div>
  );
}
