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
  FileCheck,
  Shield,
  Calendar,
  Activity,
  Loader2,
  X,
  Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CreateListingGateButton } from '@/components/listings/CreateListingGate';
import { useAuth } from '@/hooks/use-auth';
import { listSellerListings } from '@/lib/firebase/listings';
import { getOrdersForUser } from '@/lib/firebase/orders';
import { Listing, Order, UserProfile } from '@/lib/types';
import { getUserProfile, isProfileComplete } from '@/lib/firebase/users';
import { getEffectiveListingStatus } from '@/lib/listings/effectiveStatus';
import { PayoutReadinessCard } from '@/components/seller/PayoutReadinessCard';
import { BreederPermitCard } from '@/components/seller/BreederPermitCard';
import { useToast } from '@/hooks/use-toast';
import { reloadCurrentUser, resendVerificationEmail } from '@/lib/firebase/auth';
import { createStripeAccount, createAccountLink } from '@/lib/stripe/api';
import type { SellerDashboardData } from '@/lib/seller/getSellerDashboardData';
import { NotificationSettingsDialog } from '@/components/settings/NotificationSettingsDialog';

// Helper functions outside component to prevent recreation
const getAlertIcon = (type: string) => {
  switch (type) {
    case 'auction_ending':
      return Clock;
    case 'delivery_details_request':
      return FileCheck;
    case 'message':
      return MessageSquare;
    case 'bid':
      return DollarSign;
    case 'sale_delivery_update':
      return FileCheck;
    case 'sale_documents':
      return FileCheck;
    case 'sale_issue':
      return AlertCircle;
    case 'listings_pending_review':
      return Clock;
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

function toDateSafe(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  // Firestore Timestamp (client) shape
  if (typeof value?.toDate === 'function') {
    try {
      const d = value.toDate();
      if (d instanceof Date) return d;
    } catch {
      // ignore
    }
  }
  // Serialized timestamp (e.g. { seconds, nanoseconds })
  if (typeof value?.seconds === 'number') {
    const ms = value.seconds * 1000;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

const formatTimeAgo = (date: any) => {
  const d = toDateSafe(date);
  if (!d) return '';
  const minutes = Math.floor((Date.now() - d.getTime()) / (1000 * 60));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

interface SellerAlert {
  id: string;
  // NOTE: platform does not arrange transport. Any delivery/pickup is handled by buyer/seller off-platform.
  type:
    | 'auction_ending'
    | 'delivery_details_request'
    | 'message'
    | 'bid'
    | 'sale_delivery_update'
    | 'sale_documents'
    | 'sale_issue'
    | 'listings_pending_review';
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
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const uid = user?.uid || null;
  const [listings, setListings] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [dashboardData, setDashboardData] = useState<SellerDashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [hideBreederPermitOnOverview, setHideBreederPermitOnOverview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingStripe, setConnectingStripe] = useState(false);

  const breederPermitDismissKey = (sellerId: string) => `we:ui:dismissed:breeder_permit_overview:v1:${sellerId}`;

  // Allow sellers who will never need a TPWD breeder permit to dismiss the card on Overview only.
  useEffect(() => {
    if (!uid) return;
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(breederPermitDismissKey(uid));
      setHideBreederPermitOnOverview(raw === '1');
    } catch {
      // ignore
    }
  }, [uid]);

  // Fetch listings and orders
  useEffect(() => {
    let cancelled = false;

    const fetchData = async (sellerId: string) => {
      try {
        setLoading(true);
        setError(null);

        const [listingsRes, ordersRes, profileRes] = await Promise.allSettled([
          listSellerListings(sellerId),
          getOrdersForUser(sellerId, 'seller'),
          getUserProfile(sellerId),
        ]);

        if (cancelled) return;

        if (listingsRes.status === 'rejected') {
          const e: any = listingsRes.reason;
          throw new Error(`Failed to load listings: ${e?.message || e?.code || 'Unknown error'}`);
        }

        setListings(listingsRes.value);

        if (ordersRes.status === 'fulfilled') {
          setOrders(ordersRes.value);
        } else {
          // Non-fatal: keep page usable even if orders fail
          setOrders([]);
        }

        if (profileRes.status === 'fulfilled') {
          setUserProfile(profileRes.value);
        } else {
          setUserProfile(null);
        }
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message || 'Failed to load seller data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (authLoading) return;
    if (!uid) {
      setLoading(false);
      return;
    }

    fetchData(uid);
    return () => {
      cancelled = true;
    };
  }, [uid, authLoading]);

  // Seller command-center aggregation (server-side; read-only). This complements the client reads above.
  useEffect(() => {
    let cancelled = false;
    async function loadDashboard() {
      if (!user || authLoading) return;
      setDashboardLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/seller/dashboard', { headers: { authorization: `Bearer ${token}` } });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          // Non-fatal: overview remains usable.
          if (!cancelled) setDashboardData(null);
          return;
        }
        if (!cancelled) setDashboardData((json?.data || null) as any);
      } catch {
        if (!cancelled) setDashboardData(null);
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    }
    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const sellerQueues = useMemo(() => {
    const pendingReviewListings = listings.filter(
      (l) => (l.status === 'pending' || (l as any).complianceStatus === 'pending_review') && l.status !== 'removed'
    );

    const isOpenDispute = (o: any) => ['open', 'needs_evidence', 'under_review'].includes(String(o?.disputeStatus || ''));

    const ordersNeedingDeliveryUpdate = orders.filter((o: any) => {
      const paidish = ['paid', 'paid_held', 'in_transit'].includes(String(o.status || ''));
      const hasDelivered = !!o.deliveredAt || !!o.deliveryConfirmedAt;
      return paidish && !hasDelivered;
    });

    const ordersNeedingDocs = orders.filter((o: any) => {
      const missing = Array.isArray(o?.complianceDocsStatus?.missing) ? o.complianceDocsStatus.missing : [];
      return missing.length > 0 && !['cancelled', 'refunded', 'completed'].includes(String(o.status || ''));
    });

    const ordersWithIssues = orders.filter((o: any) => {
      return o.adminHold === true || String(o.status || '') === 'disputed' || isOpenDispute(o);
    });

    const ordersNeedingAnyActionIds = new Set<string>([
      ...ordersNeedingDeliveryUpdate.map((o) => o.id),
      ...ordersNeedingDocs.map((o) => o.id),
      ...ordersWithIssues.map((o) => o.id),
    ]);

    return {
      pendingReviewListingsCount: pendingReviewListings.length,
      ordersNeedingDeliveryUpdateCount: ordersNeedingDeliveryUpdate.length,
      ordersNeedingDocsCount: ordersNeedingDocs.length,
      ordersWithIssuesCount: ordersWithIssues.length,
      ordersNeedingAnyActionCount: ordersNeedingAnyActionIds.size,
    };
  }, [listings, orders]);

  // Calculate stats from real data
  const stats = useMemo(() => {
    const nowMs = Date.now();
    const activeListings = listings.filter((l) => getEffectiveListingStatus(l, nowMs) === 'active');
    const auctionsEndingSoon = activeListings.filter((l) => {
      if (l.type !== 'auction' || !l.endsAt) return false;
      const endsAt = toDateSafe((l as any).endsAt);
      if (!endsAt) return false;
      const hoursUntilEnd = (endsAt.getTime() - Date.now()) / (1000 * 60 * 60);
      return hoursUntilEnd > 0 && hoursUntilEnd <= 24;
    });

    const completedOrders = orders.filter((o) => o.status === 'paid' || o.status === 'completed');
    const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.sellerAmount || o.amount - o.platformFee), 0);
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const revenue30Days = completedOrders
      .filter((o) => {
        const createdAt = toDateSafe((o as any).createdAt);
        return createdAt ? createdAt >= thirtyDaysAgo : false;
      })
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

  const setupChecklist = useMemo(() => {
    const profileOk = !!userProfile && isProfileComplete(userProfile);
    const emailOk = user?.emailVerified === true;
    const payoutsOk =
      !!userProfile &&
      userProfile.stripeOnboardingStatus === 'complete' &&
      userProfile.payoutsEnabled === true &&
      userProfile.chargesEnabled === true;

    const steps = [profileOk, emailOk, payoutsOk];
    const done = steps.filter(Boolean).length;
    const total = steps.length;
    const isComplete = done === total;

    return { profileOk, emailOk, payoutsOk, done, total, isComplete };
  }, [user?.emailVerified, userProfile]);

  // Generate alerts from real data
  const alerts = useMemo((): SellerAlert[] => {
    const alertsList: SellerAlert[] = [];
    
    // Check for auctions ending soon (within 24 hours)
    listings.forEach((listing) => {
      const endsAt = toDateSafe((listing as any).endsAt);
      if (listing.type === 'auction' && listing.status === 'active' && endsAt) {
        const hoursUntilEnd = (endsAt.getTime() - Date.now()) / (1000 * 60 * 60);
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

    // Sales requiring seller action (delivery updates, documents, issues)
    orders.forEach((order: any) => {
      const status = String(order?.status || '');
      const hasDelivered = !!order.deliveredAt || !!order.deliveryConfirmedAt;
      const paidish = ['paid', 'paid_held', 'in_transit'].includes(status);
      const missingDocs = Array.isArray(order?.complianceDocsStatus?.missing) ? order.complianceDocsStatus.missing : [];
      const hasOpenDispute = ['open', 'needs_evidence', 'under_review'].includes(String(order?.disputeStatus || ''));
      const hasIssue = order.adminHold === true || status === 'disputed' || hasOpenDispute;

      if (hasIssue) {
        alertsList.push({
          id: `sale-issue-${order.id}`,
          type: 'sale_issue',
          priority: 'high',
          title: `Sale needs attention`,
          description:
            order.adminHold === true
              ? 'This sale is on admin hold.'
              : hasOpenDispute || status === 'disputed'
                ? 'There is an open issue/dispute on this sale.'
                : 'This sale needs attention.',
          listingId: order.listingId,
          listingTitle: order.listingSnapshot?.title,
          timestamp: new Date(),
          action: 'view',
          actionUrl: `/seller/orders/${order.id}`,
        });
        return;
      }

      if (missingDocs.length > 0) {
        alertsList.push({
          id: `sale-docs-${order.id}`,
          type: 'sale_documents',
          priority: 'high',
          title: `Upload required documents`,
          description: `Missing: ${missingDocs.join(', ')}`,
          listingId: order.listingId,
          listingTitle: order.listingSnapshot?.title,
          timestamp: new Date(),
          action: 'complete',
          actionUrl: `/seller/orders/${order.id}`,
        });
      }

      if (paidish && !hasDelivered) {
        alertsList.push({
          id: `sale-delivery-${order.id}`,
          type: 'sale_delivery_update',
          priority: 'medium',
          title: `Update delivery status`,
          description: status === 'in_transit' ? 'Mark delivered when complete.' : 'Mark in transit / delivered when applicable.',
          listingId: order.listingId,
          listingTitle: order.listingSnapshot?.title,
          timestamp: new Date(),
          action: 'complete',
          actionUrl: `/seller/orders/${order.id}`,
        });
      }
    });

    // Aggregate listing pending review signal (avoid spamming per listing)
    const pendingReviewCount = listings.filter(
      (l) => l.status === 'pending' || (l as any).complianceStatus === 'pending_review'
    ).length;
    if (pendingReviewCount > 0) {
      alertsList.push({
        id: `listings-pending-review`,
        type: 'listings_pending_review',
        priority: 'low',
        title: `${pendingReviewCount} listing${pendingReviewCount !== 1 ? 's' : ''} pending review`,
        description: 'Your listing is waiting on admin/compliance review. No action needed unless we request documents.',
        timestamp: new Date(),
        action: 'view',
        actionUrl: '/seller/listings',
      });
    }

    // Sort by priority and timestamp
    alertsList.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

    return alertsList.slice(0, 8);
  }, [listings, orders]);

  // Generate activities from real data
  const activities = useMemo((): SellerActivity[] => {
    const activitiesList: SellerActivity[] = [];
    
    // Add listing creation activities (most recent first)
    [...listings]
      .sort((a, b) => {
        const aD = toDateSafe((a as any).createdAt)?.getTime() ?? 0;
        const bD = toDateSafe((b as any).createdAt)?.getTime() ?? 0;
        return bD - aD;
      })
      .slice(0, 10)
      .forEach((listing) => {
        activitiesList.push({
          id: `listing-${listing.id}`,
          type: 'listing_created',
          title: `Created listing: ${listing.title}`,
          description: `${listing.type} listing in ${listing.category}`,
          timestamp: (toDateSafe((listing as any).createdAt) || new Date()) as any,
          listingId: listing.id,
        });
      });

    // Add completed sales
    [...orders]
      .filter((o) => o.status === 'paid' || o.status === 'completed')
      .sort((a, b) => {
        const aD = toDateSafe((a as any).createdAt)?.getTime() ?? 0;
        const bD = toDateSafe((b as any).createdAt)?.getTime() ?? 0;
        return bD - aD;
      })
      .slice(0, 5)
      .forEach((order) => {
        activitiesList.push({
          id: `sale-${order.id}`,
          type: 'sale_completed',
          title: `Sale completed`,
          description: `Order #${order.id.slice(0, 8)} - $${order.amount.toLocaleString()}`,
          timestamp: (toDateSafe((order as any).completedAt) || toDateSafe((order as any).createdAt) || new Date()) as any,
          listingId: order.listingId,
        });
      });

    // Sort by timestamp (most recent first)
    activitiesList.sort((a, b) => {
      const aD = toDateSafe((a as any).timestamp)?.getTime() ?? 0;
      const bD = toDateSafe((b as any).timestamp)?.getTime() ?? 0;
      return bD - aD;
    });
    
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

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Error loading overview</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
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
          <div className="flex items-center gap-2 flex-wrap" data-tour="seller-create-listing">
            <NotificationSettingsDialog
              triggerLabel="Notifications"
              triggerVariant="outline"
              triggerSize="default"
              className="min-h-[44px] font-semibold"
            />
            <CreateListingGateButton href="/dashboard/listings/new" className="min-h-[44px] font-semibold gap-2">
              <Package className="h-4 w-4" />
              Create Listing
            </CreateListingGateButton>
          </div>
        </div>

        {/* KPI Snapshot (always first) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6" data-tour="seller-stats">
          {stats.map((stat) => {
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
                  <div
                    className={cn(
                      'w-10 h-10 rounded-lg border-2 flex items-center justify-center',
                      stat.bgColor,
                      stat.borderColor,
                      'group-hover:bg-primary/20 group-hover:border-primary/30'
                    )}
                  >
                    <Icon className={cn('h-5 w-5', stat.color)} />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl md:text-3xl font-extrabold text-foreground mb-1">{stat.value}</div>
                  <p className="text-xs text-muted-foreground font-medium">{stat.subtext}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Seller command center (additive): most important operational signals for sellers */}
        <Card className="border-2 border-border/50 bg-card">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <CardTitle className="text-xl font-extrabold">Today</CardTitle>
                <CardDescription>Fast links + the key things that can block payout.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="default" size="sm" className="font-semibold">
                  <Link href="/seller/sales">Open Sales</Link>
                </Button>
                <Button asChild variant="default" size="sm" className="font-semibold">
                  <Link href="/seller/payouts">Open Payouts</Link>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sales needing action</div>
                      <div className="text-2xl font-extrabold mt-1">{sellerQueues.ordersNeedingAnyActionCount}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {sellerQueues.ordersNeedingDocsCount} docs · {sellerQueues.ordersNeedingDeliveryUpdateCount} delivery · {sellerQueues.ordersWithIssuesCount} issues
                      </div>
                    </div>
                    <AlertCircle className="h-5 w-5 text-primary" />
                  </div>
                  <Button asChild variant="outline" className="w-full mt-3">
                    <Link href="/seller/sales">
                      View sales
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="border border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Listings pending review</div>
                      <div className="text-2xl font-extrabold mt-1">{sellerQueues.pendingReviewListingsCount}</div>
                      <div className="text-xs text-muted-foreground mt-1">Admin/compliance review queue</div>
                    </div>
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <Button asChild variant="outline" className="w-full mt-3">
                    <Link href="/seller/listings">
                      View listings
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="border border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Open offers</div>
                      <div className="text-2xl font-extrabold mt-1">
                        {dashboardData?.totals?.offers?.open ?? '—'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {dashboardLoading ? 'Loading…' : 'Review and respond quickly'}
                      </div>
                    </div>
                    <DollarSign className="h-5 w-5 text-primary" />
                  </div>
                  <Button asChild variant="outline" className="w-full mt-3">
                    <Link href="/dashboard/bids-offers">
                      View offers
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="border border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payouts held (gross)</div>
                      <div className="text-2xl font-extrabold mt-1">
                        {typeof dashboardData?.totals?.revenue?.held === 'number'
                          ? `$${dashboardData.totals.revenue.held.toLocaleString()}`
                          : '—'}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Held until timeline + compliance checks complete</div>
                    </div>
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <Button asChild variant="outline" className="w-full mt-3">
                    <Link href="/seller/payouts">
                      View payouts
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        {/* Seller Setup Checklist (dual-role account: enables seller capability without splitting accounts) */}
        {user && setupChecklist.isComplete !== true && (
          <Card className="border-2 border-border/50 bg-card" data-tour="seller-setup-checklist">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-xl font-extrabold">Seller Setup Checklist</CardTitle>
                  <CardDescription>
                    Complete these steps to publish listings and get paid. (Buyers can still browse and save listings anytime.)
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="font-semibold">
                  {`${setupChecklist.done}/${setupChecklist.total} complete`}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const { profileOk, emailOk, payoutsOk } = setupChecklist;

                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className={cn('rounded-lg border-2 p-4', profileOk ? 'border-primary/25 bg-primary/5' : 'border-border/50 bg-background/40')}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-foreground">1) Profile</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Full name, phone number, and location.
                          </p>
                        </div>
                        {profileOk ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <Clock className="h-5 w-5 text-muted-foreground" />}
                      </div>
                      <div className="mt-3">
                        <Button asChild variant={profileOk ? 'outline' : 'default'} className="w-full min-h-[40px] font-semibold">
                          <Link href="/dashboard/account">{profileOk ? 'View Profile' : 'Complete Profile'}</Link>
                        </Button>
                      </div>
                    </div>

                    <div className={cn('rounded-lg border-2 p-4', emailOk ? 'border-primary/25 bg-primary/5' : 'border-border/50 bg-background/40')}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-foreground">2) Verify Email</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Required before publishing and checkout actions.
                          </p>
                        </div>
                        {emailOk ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <Clock className="h-5 w-5 text-muted-foreground" />}
                      </div>
                      <div className="mt-3 space-y-2">
                        <Button
                          variant={emailOk ? 'outline' : 'default'}
                          className="w-full min-h-[40px] font-semibold"
                          onClick={async () => {
                            try {
                              if (emailOk) {
                                await reloadCurrentUser();
                                toast({ title: 'Account refreshed', description: 'Your verification status has been refreshed.' });
                                return;
                              }
                              await resendVerificationEmail();
                              toast({ title: 'Verification email sent', description: 'Check your inbox (and spam folder).' });
                            } catch (e: any) {
                              toast({
                                title: 'Could not send verification email',
                                description: e?.message || 'Please try again.',
                                variant: 'destructive',
                              });
                            }
                          }}
                        >
                          {emailOk ? 'Refresh Status' : 'Resend Verification Email'}
                        </Button>
                        {!emailOk && (
                          <p className="text-xs text-muted-foreground">
                            Tip: after you click the link in your email, come back here and press “Refresh Status”.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className={cn('rounded-lg border-2 p-4', payoutsOk ? 'border-primary/25 bg-primary/5' : 'border-border/50 bg-background/40')}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-foreground">3) Payouts</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Connect Stripe to receive payouts.
                          </p>
                        </div>
                        {payoutsOk ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <Clock className="h-5 w-5 text-muted-foreground" />}
                      </div>
                      <div className="mt-3">
                        {payoutsOk ? (
                          <Button asChild variant="outline" className="w-full min-h-[40px] font-semibold">
                            <Link href="/seller/payouts">View Payouts</Link>
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="default"
                            className="w-full min-h-[40px] font-semibold"
                            disabled={connectingStripe}
                            onClick={async () => {
                              if (!user) {
                                toast({
                                  title: 'Sign in required',
                                  description: 'Please sign in to connect Stripe payouts.',
                                  variant: 'destructive',
                                });
                                return;
                              }
                              try {
                                setConnectingStripe(true);
                                // Ensure seller has a Connect account, then send them directly to Stripe onboarding.
                                if (!userProfile?.stripeAccountId) {
                                  await createStripeAccount();
                                }
                                const { url } = await createAccountLink();
                                window.location.href = url;
                              } catch (e: any) {
                                toast({
                                  title: 'Could not connect Stripe',
                                  description: e?.message || 'Please try again.',
                                  variant: 'destructive',
                                });
                              } finally {
                                setConnectingStripe(false);
                              }
                            }}
                          >
                            {connectingStripe ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Redirecting…
                              </>
                            ) : (
                              'Connect Stripe'
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Payout Readiness */}
        {user && userProfile && (
          <div className="grid grid-cols-1 gap-6 md:gap-8">
            <div data-tour="seller-payout-readiness">
              <PayoutReadinessCard 
                userProfile={userProfile} 
                onRefresh={async () => {
                  const profile = await getUserProfile(user.uid);
                  setUserProfile(profile);
                }} 
              />
            </div>
          </div>
        )}

        {/* Seller-level compliance (whitetail breeders): TPWD breeder permit */}
        {uid && !hideBreederPermitOnOverview ? (
          <div className="relative">
            <div className="absolute right-2 top-2 z-10">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                aria-label="Hide breeder permit card"
                onClick={() => {
                  setHideBreederPermitOnOverview(true);
                  if (typeof window !== 'undefined') {
                    try {
                      window.localStorage.setItem(breederPermitDismissKey(uid), '1');
                    } catch {
                      // ignore
                    }
                  }
                  toast({
                    title: 'Hidden',
                    description: 'Breeder permit card hidden on Overview.',
                  });
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <BreederPermitCard compactWhenVerified showDismissHint />
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
          {/* Action Required Panel + Performance */}
          <div className="space-y-4">
            <Card className="border-2 border-border/50 bg-card" data-tour="seller-action-required">
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
                          'flex flex-col sm:flex-row items-start gap-4 p-4 rounded-lg border-2',
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
                          className="min-h-[36px] px-3 font-semibold flex-shrink-0 w-full sm:w-auto"
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

            {/* Performance (Lightweight) */}
            <Card className="border-2 border-border/50 bg-card" data-tour="seller-performance">
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

          {/* Recent Activity & Performance */}
          <div className="space-y-4">
            <Card className="border-2 border-border/50 bg-card" data-tour="seller-recent-activity">
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

          </div>
        </div>
      </div>
    </div>
  );
}
