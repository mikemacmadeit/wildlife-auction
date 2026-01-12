'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, CheckCircle, Clock, XCircle } from 'lucide-react';

export default function OrdersPage() {
  // Mock orders data
  const orders = [
    {
      id: '1',
      listingTitle: 'Registered Texas Longhorn Bull',
      type: 'auction',
      amount: 8500,
      status: 'completed',
      date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    },
    {
      id: '2',
      listingTitle: 'Quarter Horse Mare',
      type: 'fixed',
      amount: 12000,
      status: 'pending',
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
  ];

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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-accent text-accent-foreground">Completed</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

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
                    <h3 className="font-semibold text-base mb-1">{order.listingTitle}</h3>
                    <div className="text-sm text-muted-foreground capitalize">{order.type}</div>
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
                  {order.date.toLocaleDateString()}
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
                          <div className="font-medium">{order.listingTitle}</div>
                        </td>
                        <td className="p-4 align-middle text-sm capitalize">{order.type}</td>
                        <td className="p-4 align-middle font-medium">
                          ${order.amount.toLocaleString()}
                        </td>
                        <td className="p-4 align-middle text-sm text-muted-foreground">
                          {order.date.toLocaleDateString()}
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
