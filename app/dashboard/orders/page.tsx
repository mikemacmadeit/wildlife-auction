'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, CheckCircle, Clock, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getOrdersForUser } from '@/lib/firebase/orders';
import { getListingById } from '@/lib/firebase/listings';
import { Order, OrderStatus } from '@/lib/types';
import { acceptOrder, disputeOrder } from '@/lib/stripe/api';
import { OrderTimeline } from '@/components/orders/OrderTimeline';
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
import { Input } from '@/components/ui/input';

interface OrderWithListing extends Order {
  listingTitle?: string;
  listingType?: string;
}

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [orders, setOrders] = useState<OrderWithListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [disputeDialogOpen, setDisputeDialogOpen] = useState<string | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeNotes, setDisputeNotes] = useState('');
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);

  // Fetch orders when user is loaded
  useEffect(() => {
    const fetchOrders = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const userOrders = await getOrdersForUser(user.uid, 'buyer');

        // Fetch listing details for each order
        const ordersWithListings = await Promise.all(
          userOrders.map(async (order) => {
            try {
              const listing = await getListingById(order.listingId);
              return {
                ...order,
                listingTitle: listing?.title || 'Listing not found',
                listingType: listing?.type || 'unknown',
              };
            } catch (err) {
              console.error(`Error fetching listing ${order.listingId}:`, err);
              return {
                ...order,
                listingTitle: 'Listing not found',
                listingType: 'unknown',
              };
            }
          })
        );

        setOrders(ordersWithListings);
      } catch (err) {
        console.error('Error fetching orders:', err);
        setError(err instanceof Error ? err.message : 'Failed to load orders');
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      fetchOrders();
    }
  }, [user, authLoading]);

  const handleAcceptOrder = async (orderId: string) => {
    if (!user) return;
    
    try {
      setProcessingOrderId(orderId);
      await acceptOrder(orderId);
      toast({
        title: 'Order accepted',
        description: 'You have confirmed receipt. Funds will be released to the seller.',
      });
      // Refresh orders
      const userOrders = await getOrdersForUser(user.uid, 'buyer');
      const ordersWithListings = await Promise.all(
        userOrders.map(async (order) => {
          try {
            const listing = await getListingById(order.listingId);
            return {
              ...order,
              listingTitle: listing?.title || 'Listing not found',
              listingType: listing?.type || 'unknown',
            };
          } catch (err) {
            return {
              ...order,
              listingTitle: 'Listing not found',
              listingType: 'unknown',
            };
          }
        })
      );
      setOrders(ordersWithListings);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to accept order',
        variant: 'destructive',
      });
    } finally {
      setProcessingOrderId(null);
    }
  };

  const handleOpenDispute = (orderId: string) => {
    setDisputeDialogOpen(orderId);
    setDisputeReason('');
    setDisputeNotes('');
  };

  const handleSubmitDispute = async () => {
    if (!disputeDialogOpen || !disputeReason.trim() || !user) return;

    try {
      setProcessingOrderId(disputeDialogOpen);
      await disputeOrder(disputeDialogOpen, disputeReason.trim(), disputeNotes.trim() || undefined);
      toast({
        title: 'Dispute opened',
        description: 'Your dispute has been submitted. Admin will review and resolve.',
      });
      setDisputeDialogOpen(null);
      setDisputeReason('');
      setDisputeNotes('');
      // Refresh orders
      const userOrders = await getOrdersForUser(user.uid, 'buyer');
      const ordersWithListings = await Promise.all(
        userOrders.map(async (order) => {
          try {
            const listing = await getListingById(order.listingId);
            return {
              ...order,
              listingTitle: listing?.title || 'Listing not found',
              listingType: listing?.type || 'unknown',
            };
          } catch (err) {
            return {
              ...order,
              listingTitle: 'Listing not found',
              listingType: 'unknown',
            };
          }
        })
      );
      setOrders(ordersWithListings);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to open dispute',
        variant: 'destructive',
      });
    } finally {
      setProcessingOrderId(null);
    }
  };

  const canAcceptOrDispute = (order: Order): boolean => {
    const status = order.status as OrderStatus;
    return ['paid', 'in_transit', 'delivered'].includes(status) && !order.stripeTransferId;
  };

  const isDisputeDeadlinePassed = (order: Order): boolean => {
    if (!order.disputeDeadlineAt) return false;
    return order.disputeDeadlineAt.getTime() < Date.now();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-accent" />;
      case 'accepted':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'delivered':
        return <Package className="h-5 w-5 text-blue-600" />;
      case 'in_transit':
        return <Clock className="h-5 w-5 text-blue-500" />;
      case 'paid':
        return <Clock className="h-5 w-5 text-orange-500" />;
      case 'disputed':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-muted-foreground" />;
      case 'cancelled':
      case 'refunded':
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <Package className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-accent text-accent-foreground">Completed</Badge>;
      case 'accepted':
        return <Badge variant="default" className="bg-green-600 text-white">Accepted</Badge>;
      case 'delivered':
        return <Badge variant="default" className="bg-blue-600 text-white">Delivered</Badge>;
      case 'in_transit':
        return <Badge variant="default" className="bg-blue-500 text-white">In Transit</Badge>;
      case 'paid':
        return <Badge variant="default" className="bg-orange-500 text-white">Paid</Badge>;
      case 'disputed':
        return <Badge variant="destructive">Disputed</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'cancelled':
      case 'refunded':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">Loading orders...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6">
        <div className="container mx-auto px-4 py-6">
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <XCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
              <h3 className="text-lg font-semibold mb-2">Error loading orders</h3>
              <p className="text-sm text-muted-foreground">{error}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6">
        <div className="container mx-auto px-4 py-6">
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Please sign in</h3>
              <p className="text-sm text-muted-foreground">You must be signed in to view your orders</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">My Orders</h1>
          <p className="text-muted-foreground">View your purchase history</p>
        </div>

        {/* Mobile: Card View */}
        <div className="md:hidden space-y-4" data-tour="orders-list">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-base mb-1">{order.listingTitle || 'Unknown listing'}</h3>
                    <div className="text-sm text-muted-foreground capitalize">{order.listingType || 'unknown'}</div>
                  </div>
                  {getStatusIcon(order.status)}
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <div>
                    <div className="text-xs text-muted-foreground">Total</div>
                    <div className="text-lg font-bold">${order.amount.toLocaleString()}</div>
                  </div>
                  {getStatusBadge(order.status)}
                </div>
                {order.status === 'disputed' && order.disputeReason && (
                  <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                    Dispute: {order.disputeReason}
                  </div>
                )}
                {canAcceptOrDispute(order) && (
                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      size="sm"
                      onClick={() => handleAcceptOrder(order.id)}
                      disabled={processingOrderId === order.id}
                      className="flex-1"
                    >
                      {processingOrderId === order.id ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Accept
                        </>
                      )}
                    </Button>
                    {!isDisputeDeadlinePassed(order) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleOpenDispute(order.id)}
                        disabled={processingOrderId === order.id}
                        className="flex-1"
                      >
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Dispute
                      </Button>
                    )}
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  {order.createdAt.toLocaleDateString()}
                </div>
                {expandedOrderId === order.id && (
                  <div className="pt-4 border-t mt-4">
                    <OrderTimeline order={order} compact={true} />
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                >
                  {expandedOrderId === order.id ? 'Hide Timeline' : 'Show Timeline'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Desktop: Table View */}
        <div className="hidden md:block" data-tour="orders-list">
          <Card>
            <CardContent className="p-0">
              <div className="rounded-md border">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-secondary/20">
                      <th className="h-12 px-4 text-left align-middle font-medium text-sm">Order</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-sm">Type</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-sm">Amount</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-sm">Date</th>
                      <th className="h-12 px-4 text-left align-middle font-medium text-sm">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <>
                        <tr key={order.id} className="border-b transition-colors hover:bg-accent/8">
                          <td className="p-4 align-middle">
                            <div className="font-medium">{order.listingTitle || 'Unknown listing'}</div>
                            {order.status === 'disputed' && order.disputeReason && (
                              <div className="text-xs text-destructive mt-1">
                                Dispute: {order.disputeReason}
                              </div>
                            )}
                          </td>
                          <td className="p-4 align-middle text-sm capitalize">{order.listingType || 'unknown'}</td>
                          <td className="p-4 align-middle font-medium">
                            ${order.amount.toLocaleString()}
                          </td>
                          <td className="p-4 align-middle text-sm text-muted-foreground">
                            {order.createdAt.toLocaleDateString()}
                          </td>
                          <td className="p-4 align-middle">
                          <div className="space-y-2">
                            {getStatusBadge(order.status)}
                            {canAcceptOrDispute(order) && (
                              <div className="flex gap-2 mt-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleAcceptOrder(order.id)}
                                  disabled={processingOrderId === order.id}
                                  className="text-xs"
                                >
                                  {processingOrderId === order.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    'Accept'
                                  )}
                                </Button>
                                {!isDisputeDeadlinePassed(order) && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleOpenDispute(order.id)}
                                    disabled={processingOrderId === order.id}
                                    className="text-xs"
                                  >
                                    Dispute
                                  </Button>
                                )}
                              </div>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs mt-2"
                              onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                            >
                              {expandedOrderId === order.id ? 'Hide Timeline' : 'Show Timeline'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {expandedOrderId === order.id && (
                        <tr key={`${order.id}-timeline`}>
                          <td colSpan={5} className="p-4">
                            <OrderTimeline order={order} compact={false} />
                          </td>
                        </tr>
                      )}
                    </>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {orders.length === 0 && (
          <Card>
            <CardContent className="pt-12 pb-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
              <p className="text-sm text-muted-foreground">
                Start browsing to find your perfect listing
              </p>
            </CardContent>
          </Card>
        )}

        {/* Dispute Dialog */}
        <Dialog open={!!disputeDialogOpen} onOpenChange={(open) => !open && setDisputeDialogOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Open Dispute</DialogTitle>
              <DialogDescription>
                Report a problem with this order. Admin will review and resolve the dispute.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="dispute-reason">Reason *</Label>
                <Input
                  id="dispute-reason"
                  placeholder="e.g., Item not received, Item damaged, Wrong item"
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="dispute-notes">Additional Details (Optional)</Label>
                <Textarea
                  id="dispute-notes"
                  placeholder="Provide more information about the issue..."
                  value={disputeNotes}
                  onChange={(e) => setDisputeNotes(e.target.value)}
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDisputeDialogOpen(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitDispute}
                disabled={!disputeReason.trim() || processingOrderId !== null}
              >
                {processingOrderId ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Dispute'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
