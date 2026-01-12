'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Package,
  DollarSign,
  Eye,
  TrendingUp,
  AlertCircle,
  Clock,
  CheckCircle2,
  ArrowRight,
  MessageSquare,
  Truck,
  Shield,
  Calendar,
  Activity,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { listSellerListings } from '@/lib/firebase/listings';
import { getOrdersForUser } from '@/lib/firebase/orders';
import { Listing, Order } from '@/lib/types';

// Helper functions outside component to prevent recreation
const getAlertIcon = (type: string) => {
  switch (type) {
    case 'auction_ending':
      return Clock;
    case 'transport_request':
      return Truck;
    case 'insurance_pending':
      return Shield;
    case 'message':
      return MessageSquare;
    case 'bid':
      return DollarSign;
    default:
      return AlertCircle;
  }
};

const getAlertColor = (priority: string) => {
  switch (priority) {
    case 'high':
      return 'border-destructive/50 bg-destructive/5';
    case 'medium':
      return 'border-primary/50 bg-primary/5';
    case 'low':
      return 'border-border/50 bg-background/50';
    default:
      return 'border-border/50 bg-background/50';
  }
};

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'listing_created':
      return Package;
    case 'bid_placed':
      return DollarSign;
    case 'message_received':
      return MessageSquare;
    case 'sale_completed':
      return CheckCircle2;
    case 'verification_complete':
      return Shield;
    default:
      return Activity;
  }
};

const formatTimeAgo = (date: Date) => {
  const minutes = Math.floor((Date.now() - date.getTime()) / (1000 * 60));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

interface SellerAlert {
  id: string;
  type: 'auction_ending' | 'transport_request' | 'insurance_pending' | 'message' | 'bid';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  listingId?: string;
  listingTitle?: string;
  timestamp: Date;
  action: 'view' | 'respond' | 'complete';
  actionUrl: string;
}

interface SellerActivity {
  id: string;
  type: 'listing_created' | 'bid_placed' | 'message_received' | 'sale_completed' | 'verification_complete';
  title: string;
  description: string;
  timestamp: Date;
  listingId?: string;
}

export default function SellerOverviewPage() {
  const { user, loading: authLoading } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch listings and orders
  useEffect(() => {
    const fetchData = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const [sellerListings, sellerOrders] = await Promise.all([
          listSellerListings(user.uid),
          getOrdersForUser(user.uid, 'seller'),
        ]);
        setListings(sellerListings);
        setOrders(sellerOrders);
      } catch (err) {
        console.error('Error fetching seller data:', err);
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      fetchData();
    }
  }, [user, authLoading]);

  // Calculate stats from real data
  const stats = useMemo(() => {
    const activeListings = listings.filter((l) => l.status === 'active');
    const auctionsEndingSoon = activeListings.filter((l) => {
      if (l.type !== 'auction' || !l.endsAt) return false;
      const hoursUntilEnd = (l.endsAt.getTime() - Date.now()) / (1000 * 60 * 60);
      return hoursUntilEnd > 0 && hoursUntilEnd <= 24;
    });

    const completedOrders = orders.filter((o) => o.status === 'paid' || o.status === 'completed');
    const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.sellerAmount || o.amount - o.platformFee), 0);
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const revenue30Days = completedOrders
      .filter((o) => o.createdAt >= thirtyDaysAgo)
      .reduce((sum, o) => sum + (o.sellerAmount || o.amount - o.platformFee), 0);

    const views7Days = activeListings.reduce((sum, l) => sum + (l.metrics?.views || 0), 0);
    const totalViews = activeListings.reduce((sum, l) => sum + (l.metrics?.views || 0), 0);
    const totalBids = activeListings.reduce((sum, l) => sum + (l.metrics?.bidCount || 0), 0);
    const conversionRate = totalViews > 0 ? Math.round((totalBids / totalViews) * 100) : 0;

    return [
      {
        label: 'Active Listings',
        value: activeListings.length.toString(),
        subtext: `${auctionsEndingSoon.length} auction${auctionsEndingSoon.length !== 1 ? 's' : ''} ending soon`,
        icon: Package,
        color: 'text-primary',
        bgColor: 'bg-primary/10',
        borderColor: 'border-primary/20',
      },
      {
        label: 'Total Revenue',
        value: `$${totalRevenue.toLocaleString()}`,
        subtext: `$${revenue30Days.toLocaleString()} last 30 days`,
        icon: DollarSign,
        color: 'text-primary',
        bgColor: 'bg-primary/10',
        borderColor: 'border-primary/20',
      },
      {
        label: 'Views (7 days)',
        value: views7Days.toLocaleString(),
        subtext: `${conversionRate}% conversion rate`,
        icon: Eye,
        color: 'text-primary',
        bgColor: 'bg-primary/10',
        borderColor: 'border-primary/20',
      },
      {
        label: 'Conversion',
        value: `${conversionRate}%`,
        subtext: 'Views → bids',
        icon: TrendingUp,
        color: 'text-primary',
        bgColor: 'bg-primary/10',
        borderColor: 'border-primary/20',
      },
    ];
  }, [listings, orders]);

  // Generate alerts from real data
  const alerts = useMemo((): SellerAlert[] => {
    const alertsList: SellerAlert[] = [];
    
    // Check for auctions ending soon (within 24 hours)
    listings.forEach((listing) => {
      if (listing.type === 'auction' && listing.status === 'active' && listing.endsAt) {
        const hoursUntilEnd = (listing.endsAt.getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursUntilEnd > 0 && hoursUntilEnd <= 24) {
          alertsList.push({
            id: `auction-ending-${listing.id}`,
            type: 'auction_ending',
            priority: hoursUntilEnd <= 6 ? 'high' : hoursUntilEnd <= 12 ? 'medium' : 'low',
            title: `Auction ending soon: ${listing.title}`,
            description: hoursUntilEnd <= 1 
              ? `Ending in less than 1 hour`
              : `Ending in ${Math.round(hoursUntilEnd)} hours`,
            listingId: listing.id,
            listingTitle: listing.title,
            timestamp: new Date(),
            action: 'view',
            actionUrl: `/listing/${listing.id}`,
          });
        }
      }
    });

    // Sort by priority and timestamp
    alertsList.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

    return alertsList;
  }, [listings]);

  // Generate activities from real data
  const activities = useMemo((): SellerActivity[] => {
    const activitiesList: SellerActivity[] = [];
    
    // Add listing creation activities (most recent first)
    listings
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10)
      .forEach((listing) => {
        activitiesList.push({
          id: `listing-${listing.id}`,
          type: 'listing_created',
          title: `Created listing: ${listing.title}`,
          description: `${listing.type} listing in ${listing.category}`,
          timestamp: listing.createdAt,
          listingId: listing.id,
        });
      });

    // Add completed sales
    orders
      .filter((o) => o.status === 'paid' || o.status === 'completed')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 5)
      .forEach((order) => {
        activitiesList.push({
          id: `sale-${order.id}`,
          type: 'sale_completed',
          title: `Sale completed`,
          description: `Order #${order.id.slice(0, 8)} - $${order.amount.toLocaleString()}`,
          timestamp: order.completedAt || order.createdAt,
          listingId: order.listingId,
        });
      });

    // Sort by timestamp (most recent first)
    activitiesList.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    return activitiesList.slice(0, 10);
  }, [listings, orders]);

  // Calculate performance metrics
  const performanceMetrics = useMemo(() => {
    const totalViews = listings.reduce((sum, l) => sum + (l.metrics?.views || 0), 0);
    const totalBids = listings.reduce((sum, l) => sum + (l.metrics?.bidCount || 0), 0);
    const completedListings = listings.filter((l) => l.status === 'sold').length;
    const completionRate = listings.length > 0 ? Math.round((completedListings / listings.length) * 100) : 0;
    const verifiedCount = listings.filter((l) => l.trust?.verified).length;

    return {
      completionRate,
      responseTime: '< 2 hours', // TODO: Calculate from actual response times
      verifiedAnimals: verifiedCount,
    };
  }, [listings]);

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">Loading overview...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-7xl space-y-6 md:space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-2">
              Seller Overview
            </h1>
            <p className="text-base md:text-lg text-muted-foreground">
              Daily briefing and action items for your listings
            </p>
          </div>
          <Button asChild className="min-h-[44px] font-semibold gap-2">
            <Link href="/seller/listings/new">
              <Package className="h-4 w-4" />
              Create Listing
            </Link>
          </Button>
        </div>

        {/* Status Snapshot Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <Card
                key={stat.label}
                className={cn(
                  'border-2 border-border/50 bg-card hover:border-border/70',
                  'hover:shadow-sm cursor-pointer group'
                )}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                  <div className={cn(
                    'w-10 h-10 rounded-lg border-2 flex items-center justify-center',
                    stat.bgColor,
                    stat.borderColor,
                    'group-hover:bg-primary/20 group-hover:border-primary/30'
                  )}>
                    <Icon className={cn('h-5 w-5', stat.color)} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl md:text-3xl font-extrabold text-foreground mb-1">
                    {stat.value}
                  </div>
                  <p className="text-xs text-muted-foreground font-medium">
                    {stat.subtext}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          {/* Action Required Panel */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border-2 border-border/50 bg-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-primary" />
                    <CardTitle className="text-xl font-extrabold">Action Required</CardTitle>
                  </div>
                  <Badge variant="secondary" className="font-semibold">
                    {alerts.length} items
                  </Badge>
                </div>
                <CardDescription>
                  Items that need your attention
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {alerts.length === 0 ? (
                  <div className="py-12 text-center">
                    <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <p className="text-muted-foreground font-medium">No actions required</p>
                    <p className="text-sm text-muted-foreground mt-1">You're all caught up!</p>
                  </div>
                ) : (
                  alerts.map((alert) => {
                    const Icon = getAlertIcon(alert.type);
                    return (
                      <div
                        key={alert.id}
                        className={cn(
                          'flex items-start gap-4 p-4 rounded-lg border-2',
                          getAlertColor(alert.priority),
                          'hover:shadow-sm cursor-pointer group'
                        )}
                      >
                        <div className={cn(
                          'w-10 h-10 rounded-lg border-2 flex items-center justify-center flex-shrink-0',
                          alert.priority === 'high' ? 'bg-destructive/10 border-destructive/20' :
                          alert.priority === 'medium' ? 'bg-primary/10 border-primary/20' :
                          'bg-background/50 border-border/50'
                        )}>
                          <Icon className={cn(
                            'h-5 w-5',
                            alert.priority === 'high' ? 'text-destructive' :
                            alert.priority === 'medium' ? 'text-primary' :
                            'text-muted-foreground'
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h3 className="font-semibold text-foreground group-hover:text-primary">
                              {alert.title}
                            </h3>
                            <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                              {formatTimeAgo(alert.timestamp)}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {alert.description}
                          </p>
                          {alert.listingTitle && (
                            <p className="text-xs text-muted-foreground font-medium">
                              {alert.listingTitle}
                            </p>
                          )}
                        </div>
                        <Button
                          asChild
                          variant="outline"
                          size="sm"
                          className="min-h-[36px] px-3 font-semibold flex-shrink-0"
                        >
                          <Link href={alert.actionUrl}>
                            {alert.action === 'view' ? 'View' :
                             alert.action === 'respond' ? 'Respond' :
                             'Complete'}
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </Link>
                        </Button>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <div className="space-y-4">
            <Card className="border-2 border-border/50 bg-card">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  <CardTitle className="text-xl font-extrabold">Recent Activity</CardTitle>
                </div>
                <CardDescription>
                  Latest updates on your listings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {activities.length === 0 ? (
                  <div className="py-8 text-center">
                    <Activity className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                    <p className="text-sm text-muted-foreground font-medium">No recent activity</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activities.map((activity, index) => {
                      const Icon = getActivityIcon(activity.type);
                      const isLast = index === activities.length - 1;
                      return (
                        <div key={activity.id}>
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                              <Icon className="h-4 w-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0 pt-0.5">
                              <p className="text-sm font-semibold text-foreground mb-0.5">
                                {activity.title}
                              </p>
                              <p className="text-xs text-muted-foreground mb-1">
                                {activity.description}
                              </p>
                              <span className="text-xs text-muted-foreground font-medium">
                                {formatTimeAgo(activity.timestamp)}
                              </span>
                            </div>
                          </div>
                          {!isLast && (
                            <Separator className="my-4" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Performance (Lightweight) */}
            <Card className="border-2 border-border/50 bg-card">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <CardTitle className="text-xl font-extrabold">Performance</CardTitle>
                </div>
                <CardDescription>
                  Quick metrics overview
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Completion Rate</span>
                    <span className="text-base font-extrabold text-foreground">{performanceMetrics.completionRate}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Response Time</span>
                    <span className="text-base font-extrabold text-foreground">{performanceMetrics.responseTime}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Verified Animals</span>
                    <span className="text-base font-extrabold text-foreground">{performanceMetrics.verifiedAnimals}</span>
                  </div>
                </div>
                <Separator />
                <Button
                  asChild
                  variant="outline"
                  className="w-full min-h-[44px] font-semibold"
                >
                  <Link href="/seller/reputation">
                    View Full Stats
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
