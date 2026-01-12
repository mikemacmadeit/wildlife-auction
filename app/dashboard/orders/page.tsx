'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, CheckCircle, Clock, XCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { getOrdersForUser } from '@/lib/firebase/orders';
import { getListingById } from '@/lib/firebase/listings';
import { Order } from '@/lib/types';

interface OrderWithListing extends Order {
  listingTitle?: string;
  listingType?: string;
}

export default function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<OrderWithListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-accent" />; // Sage for success
      case 'pending':
        return <Clock className="h-5 w-5 text-muted-foreground" />; // Muted for pending
      case 'cancelled':
        return <XCircle className="h-5 w-5 text-destructive" />; // Brick red for cancelled
      default:
        return <Package className="h-5 w-5 text-muted-foreground" />;
    }
  };

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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'paid':
        return <CheckCircle className="h-5 w-5 text-accent" />;
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
      case 'paid':
        return <Badge variant="default" className="bg-accent text-accent-foreground">Completed</Badge>;
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
        <div className="md:hidden space-y-4">
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
                <div className="text-xs text-muted-foreground">
                  {order.createdAt.toLocaleDateString()}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Desktop: Table View */}
        <div className="hidden md:block">
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
                      <tr key={order.id} className="border-b transition-colors hover:bg-accent/8">
                        <td className="p-4 align-middle">
                          <div className="font-medium">{order.listingTitle || 'Unknown listing'}</div>
                        </td>
                        <td className="p-4 align-middle text-sm capitalize">{order.listingType || 'unknown'}</td>
                        <td className="p-4 align-middle font-medium">
                          ${order.amount.toLocaleString()}
                        </td>
                        <td className="p-4 align-middle text-sm text-muted-foreground">
                          {order.createdAt.toLocaleDateString()}
                        </td>
                        <td className="p-4 align-middle">{getStatusBadge(order.status)}</td>
                      </tr>
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
      </div>
    </div>
  );
}
