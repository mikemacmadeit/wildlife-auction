'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
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
  Mail,
  ShoppingBag,
  Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatUserFacingError } from '@/lib/format-user-facing-error';
import { SellerOverviewSkeleton } from '@/components/skeletons/SellerOverviewSkeleton';
import { CreateListingGateButton } from '@/components/listings/CreateListingGate';
import { useAuth } from '@/hooks/use-auth';
import { listSellerListings } from '@/lib/firebase/listings';
import { getOrdersForUser, filterSellerRelevantOrders } from '@/lib/firebase/orders';
import { Listing, Order, UserProfile } from '@/lib/types';
import { getUserProfile, isProfileComplete, updateUserProfile } from '@/lib/firebase/users';
import { getEffectiveListingStatus } from '@/lib/listings/effectiveStatus';
import { PayoutReadinessCard } from '@/components/seller/PayoutReadinessCard';
import { BreederPermitCard } from '@/components/seller/BreederPermitCard';
import { useToast } from '@/hooks/use-toast';
import { resendVerificationEmail } from '@/lib/firebase/auth';
import { createStripeAccount, createAccountLink } from '@/lib/stripe/api';
import type { SellerDashboardData } from '@/lib/seller/getSellerDashboardData';
import { NotificationSettingsDialog } from '@/components/settings/NotificationSettingsDialog';
import { BusinessOverviewChart } from '@/components/seller/BusinessOverviewChart';

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
  /** Optional: e.g. "4h", "<1h", "45m" — shown as urgency badge for auction_ending */
  countdownText?: string;
  /** Optional: thumbnail URL for auction_ending cards */
  listingImageUrl?: string;
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
  const pathname = usePathname();
  const { user, loading: authLoading, refreshUser } = useAuth();
  const uid = user?.uid || null;
  const [listings, setListings] = useState<Listing[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [buyerOrders, setBuyerOrders] = useState<Order[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [dashboardData, setDashboardData] = useState<SellerDashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [hideBreederPermitOnOverview, setHideBreederPermitOnOverview] = useState(false);
  const [hidePayoutReadinessOnOverview, setHidePayoutReadinessOnOverview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingStripe, setConnectingStripe] = useState(false);
  const [sendingVerificationEmail, setSendingVerificationEmail] = useState(false);

  const breederPermitDismissKey = (sellerId: string) => `we:ui:dismissed:breeder_permit_overview:v1:${sellerId}`;
  const payoutReadinessDismissKey = (sellerId: string) => `we:ui:dismissed:payout_readiness_overview:v1:${sellerId}`;

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

  const payoutsReady = useMemo(() => {
    return Boolean(
      userProfile?.stripeAccountId &&
        userProfile?.stripeOnboardingStatus === 'complete' &&
        userProfile?.chargesEnabled === true &&
        userProfile?.payoutsEnabled === true &&
        userProfile?.stripeDetailsSubmitted === true
    );
  }, [userProfile]);

  // Allow sellers to dismiss payout readiness ONLY once they are fully payout-ready (Overview only).
  useEffect(() => {
    if (!uid) return;
    if (typeof window === 'undefined') return;
    if (!payoutsReady) {
      // Never hide when not ready; this card is actionable and should remain visible.
      setHidePayoutReadinessOnOverview(false);
      return;
    }
    try {
      const raw = window.localStorage.getItem(payoutReadinessDismissKey(uid));
      setHidePayoutReadinessOnOverview(raw === '1');
    } catch {
      // ignore
    }
  }, [payoutsReady, uid]);

  // Fetch listings and orders
  useEffect(() => {
    let cancelled = false;

    const fetchData = async (sellerId: string) => {
      try {
        setLoading(true);
        setError(null);

        const [listingsRes, sellerOrdersRes, buyerOrdersRes, profileRes] = await Promise.allSettled([
          listSellerListings(sellerId),
          getOrdersForUser(sellerId, 'seller'),
          getOrdersForUser(sellerId, 'buyer'),
          getUserProfile(sellerId),
        ]);

        if (cancelled) return;

        if (listingsRes.status === 'rejected') {
          const e: any = listingsRes.reason;
          throw new Error(`Failed to load listings: ${e?.message || e?.code || 'Unknown error'}`);
        }

        setListings(listingsRes.value);

        if (sellerOrdersRes.status === 'fulfilled') {
          setOrders(filterSellerRelevantOrders(sellerOrdersRes.value));
        } else {
          setOrders([]);
        }

        if (buyerOrdersRes.status === 'fulfilled') {
          setBuyerOrders(buyerOrdersRes.value);
        } else {
          setBuyerOrders([]);
        }

        if (profileRes.status === 'fulfilled') {
          setUserProfile(profileRes.value);
        } else {
          setUserProfile(null);
        }
      } catch (err: any) {
        if (cancelled) return;
        setError(formatUserFacingError(err, 'Failed to load seller data'));
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

  // When tab gains focus, refresh auth + profile so verification status updates without manual refresh.
  useEffect(() => {
    if (!uid) return;
    const onVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        refreshUser()
          .then(() => getUserProfile(uid))
          .then(setUserProfile)
          .catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [uid, refreshUser]);

  // When this page is shown (e.g. after navigating from account where user verified), refetch so checklist and top reminder reflect verified.
  useEffect(() => {
    if (!uid || pathname !== '/seller/overview') return;
    refreshUser()
      .then(() => getUserProfile(uid))
      .then(setUserProfile)
      .catch(() => {});
  }, [pathname, uid, refreshUser]);

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

    // Include all paid orders: paid, completed, paid_held, and any with paidAt
    const completedOrders = orders.filter((o) => {
      const status = o.status;
      const hasPaidAt = !!(o as any).paidAt;
      return (
        status === 'paid' || 
        status === 'completed' || 
        status === 'paid_held' || 
        status === 'buyer_confirmed' || 
        hasPaidAt
      );
    });
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

  // Seller financials for Business overview — what you're making (dollars first)
  const sellerFinancialStats = useMemo(() => {
    const completedOrders = orders.filter((o) => {
      const status = o.status;
      const hasPaidAt = !!(o as any).paidAt;
      return (
        status === 'paid' ||
        status === 'completed' ||
        status === 'paid_held' ||
        status === 'buyer_confirmed' ||
        hasPaidAt
      );
    });
    const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.sellerAmount ?? o.amount - (o.platformFee ?? 0)), 0);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const revenue30Days = completedOrders
      .filter((o) => {
        const createdAt = toDateSafe((o as any).createdAt);
        return createdAt ? createdAt >= thirtyDaysAgo : false;
      })
      .reduce((sum, o) => sum + (o.sellerAmount ?? o.amount - (o.platformFee ?? 0)), 0);
    const activeListingsCount = listings.filter((l) => getEffectiveListingStatus(l) === 'active').length;

    return [
      {
        label: 'Total revenue',
        value: `$${totalRevenue.toLocaleString()}`,
        subtext: 'All-time from sales',
        icon: DollarSign,
        color: 'text-primary',
        bgColor: 'bg-primary/10',
        borderColor: 'border-primary/20',
      },
      {
        label: 'Revenue (30 days)',
        value: `$${revenue30Days.toLocaleString()}`,
        subtext: 'Last 30 days',
        icon: TrendingUp,
        color: 'text-primary',
        bgColor: 'bg-primary/10',
        borderColor: 'border-primary/20',
      },
      {
        label: 'Completed sales',
        value: completedOrders.length.toString(),
        subtext: `$${totalRevenue.toLocaleString()} total`,
        icon: CheckCircle2,
        color: 'text-primary',
        bgColor: 'bg-primary/10',
        borderColor: 'border-primary/20',
      },
      {
        label: 'Active listings',
        value: activeListingsCount.toString(),
        subtext: 'Currently for sale',
        icon: Package,
        color: 'text-primary',
        bgColor: 'bg-primary/10',
        borderColor: 'border-primary/20',
      },
    ];
  }, [listings, orders]);

  // Buyer-side financials for Business overview — what you're spending (dollars first)
  const buyerStats = useMemo(() => {
    const completedBuyerOrders = buyerOrders.filter((o) => {
      const status = o.status;
      const hasPaidAt = !!(o as any).paidAt;
      return (
        status === 'paid' ||
        status === 'completed' ||
        status === 'paid_held' ||
        status === 'buyer_confirmed' ||
        hasPaidAt
      );
    });
    const totalSpent = completedBuyerOrders.reduce((sum, o) => sum + (o.amount ?? 0), 0);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const ordersLast30Days = buyerOrders.filter((o) => {
      const createdAt = toDateSafe((o as any).createdAt);
      return createdAt ? createdAt >= thirtyDaysAgo : false;
    });
    const spentLast30Days = ordersLast30Days.reduce((sum, o) => sum + (o.amount ?? 0), 0);

    const inProgress = buyerOrders.filter((o) => {
      const status = o.status;
      const hasPaidAt = !!(o as any).paidAt;
      const delivered = !!(o as any).deliveredAt;
      const completed = status === 'completed' || status === 'buyer_confirmed';
      return (hasPaidAt || status === 'paid' || status === 'paid_held') && !delivered && !completed;
    });

    return [
      {
        label: 'Total spent',
        value: `$${totalSpent.toLocaleString()}`,
        subtext: 'All-time on purchases',
        icon: DollarSign,
        color: 'text-emerald-600 dark:text-emerald-400',
        bgColor: 'bg-emerald-500/10',
        borderColor: 'border-emerald-500/20',
      },
      {
        label: 'Spent (30 days)',
        value: `$${spentLast30Days.toLocaleString()}`,
        subtext: 'Last 30 days',
        icon: TrendingUp,
        color: 'text-emerald-600 dark:text-emerald-400',
        bgColor: 'bg-emerald-500/10',
        borderColor: 'border-emerald-500/20',
      },
      {
        label: 'Total orders',
        value: buyerOrders.length.toString(),
        subtext: `${completedBuyerOrders.length} completed · $${totalSpent.toLocaleString()} spent`,
        icon: ShoppingBag,
        color: 'text-emerald-600 dark:text-emerald-400',
        bgColor: 'bg-emerald-500/10',
        borderColor: 'border-emerald-500/20',
      },
      {
        label: 'In progress',
        value: inProgress.length.toString(),
        subtext: inProgress.length === 0 ? 'All caught up' : inProgress.length === 1 ? '1 awaiting delivery' : `${inProgress.length} awaiting delivery`,
        icon: Clock,
        color: 'text-emerald-600 dark:text-emerald-400',
        bgColor: 'bg-emerald-500/10',
        borderColor: 'border-emerald-500/20',
      },
    ];
  }, [buyerOrders]);

  // P&L: revenue (sales) − costs (purchases) for Business overview
  const businessPL = useMemo(() => {
    const completedSeller = orders.filter((o) => {
      const status = o.status;
      const hasPaidAt = !!(o as any).paidAt;
      return status === 'paid' || status === 'completed' || status === 'paid_held' || status === 'buyer_confirmed' || hasPaidAt;
    });
    const revenue = completedSeller.reduce((sum, o) => sum + (o.sellerAmount ?? o.amount - (o.platformFee ?? 0)), 0);

    const completedBuyer = buyerOrders.filter((o) => {
      const status = o.status;
      const hasPaidAt = !!(o as any).paidAt;
      return status === 'paid' || status === 'completed' || status === 'paid_held' || status === 'buyer_confirmed' || hasPaidAt;
    });
    const costs = completedBuyer.reduce((sum, o) => sum + (o.amount ?? 0), 0);

    const net = revenue - costs;
    return { revenue, costs, net };
  }, [orders, buyerOrders]);

  const setupChecklist = useMemo(() => {
    const profileOk = !!userProfile && isProfileComplete(userProfile);
    // Only show "verify email" complete when user actually completed our flow (landed on ?verified=1).
    // Fallback: email/password users who verified before we added emailVerificationCompletedAt.
    const isPasswordUser = user?.providerData?.some((p) => p?.providerId === 'password') ?? false;
    const emailOk =
      !!userProfile?.emailVerificationCompletedAt ||
      (user?.emailVerified === true && isPasswordUser);
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
  }, [user?.emailVerified, user?.providerData, userProfile, userProfile?.emailVerificationCompletedAt]);

  // Generate alerts from real data
  const alerts = useMemo((): SellerAlert[] => {
    const alertsList: SellerAlert[] = [];
    
    // Check for auctions ending soon (within 24 hours)
    listings.forEach((listing) => {
      const endsAt = toDateSafe((listing as any).endsAt);
      if (listing.type === 'auction' && listing.status === 'active' && endsAt) {
        const hoursUntilEnd = (endsAt.getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursUntilEnd > 0 && hoursUntilEnd <= 24) {
          const minsUntilEnd = Math.floor(hoursUntilEnd * 60);
          const countdownText =
            hoursUntilEnd < 1 / 60
              ? '<1m'
              : hoursUntilEnd < 1
                ? `${minsUntilEnd}m`
                : `${Math.round(hoursUntilEnd)}h`;
          const description =
            hoursUntilEnd <= 1
              ? 'Ending in less than 1 hour'
              : `Ending in ${Math.round(hoursUntilEnd)} hours`;
          const imgUrl =
            (listing as any).images?.[0] ??
            (listing as any).photos?.[0]?.url ??
            undefined;
          alertsList.push({
            id: `auction-ending-${listing.id}`,
            type: 'auction_ending',
            priority: hoursUntilEnd <= 6 ? 'high' : hoursUntilEnd <= 12 ? 'medium' : 'low',
            title: listing.title,
            description,
            countdownText,
            listingImageUrl: imgUrl,
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
      .filter((o) => {
        const status = o.status;
        const hasPaidAt = !!(o as any).paidAt;
        return (
          status === 'paid' || 
          status === 'completed' || 
          status === 'paid_held' || 
          status === 'buyer_confirmed' || 
          hasPaidAt
        );
      })
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

  // Loading state — use layout-matched skeleton so content loads in the same place (no flash)
  if (authLoading || loading) {
    return <SellerOverviewSkeleton />;
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
    <div className="min-h-screen bg-background pb-20 md:pb-6 overflow-x-hidden">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-8 max-w-7xl space-y-4 sm:space-y-6 md:space-y-8">
        {/* Header — mobile: stacked, touch-friendly buttons */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-foreground mb-1 sm:mb-2">
              Seller Overview
            </h1>
            <p className="text-sm sm:text-base md:text-lg text-muted-foreground">
              Daily briefing and action items for your listings
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto min-w-0" data-tour="seller-create-listing">
            <NotificationSettingsDialog
              triggerLabel="Notifications"
              triggerVariant="outline"
              triggerSize="default"
              className="min-h-[44px] font-semibold w-full sm:w-auto"
            />
            <CreateListingGateButton href="/dashboard/listings/new" className="min-h-[44px] font-semibold gap-2 w-full sm:w-auto">
              <Package className="h-4 w-4" />
              Create Listing
            </CreateListingGateButton>
          </div>
        </div>

        {/* KPI Snapshot — mobile: 2x2, tighter gap, responsive value size */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 min-w-0" data-tour="seller-stats">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card
                key={stat.label}
                className={cn(
                  'rounded-xl border border-border/50 bg-card hover:border-border/70 overflow-hidden',
                  'hover:shadow-sm cursor-pointer group transition-colors active:scale-[0.99]',
                  'max-lg:min-h-[100px] sm:min-h-[120px] max-lg:flex max-lg:flex-col max-lg:justify-between'
                )}
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 pt-3 sm:pb-3 sm:px-4 sm:pt-4">
                  <CardTitle className="text-xs sm:text-sm font-bold uppercase tracking-wide text-muted-foreground leading-tight flex-1 min-w-0 pr-2 line-clamp-2">
                    {stat.label}
                  </CardTitle>
                  <div
                    className={cn(
                      'w-8 h-8 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-lg border-2 flex items-center justify-center shrink-0',
                      stat.bgColor,
                      stat.borderColor,
                      'group-hover:bg-primary/20 group-hover:border-primary/30'
                    )}
                  >
                    <Icon className={cn('h-4 w-4 sm:h-4 sm:w-4 lg:h-5 lg:w-5', stat.color)} />
                  </div>
                </CardHeader>
                <CardContent className="px-3 pb-3 pt-0 sm:px-4 sm:pb-4">
                  <div className="text-xl max-sm:text-lg sm:text-2xl md:text-3xl font-extrabold text-foreground mb-0.5 tabular-nums break-words">{stat.value}</div>
                  <p className="text-[11px] sm:text-xs text-muted-foreground font-medium leading-relaxed line-clamp-2">{stat.subtext}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Seller command center — mobile: stacked header, touch-friendly buttons */}
        <Card className="rounded-xl border border-border/50 bg-card overflow-hidden">
          <CardHeader className="pb-4 px-3 sm:px-6 pt-4 sm:pt-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
              <div className="min-w-0">
                <CardTitle className="text-lg sm:text-xl font-extrabold">Today</CardTitle>
                <CardDescription className="text-sm sm:text-base">Fast links + the key things that can block payout.</CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <Button asChild variant="default" size="sm" className="min-h-[44px] sm:min-h-9 font-semibold w-full sm:w-auto">
                  <Link href="/seller/sales">Open Sales</Link>
                </Button>
                <Button asChild variant="default" size="sm" className="min-h-[44px] sm:min-h-9 font-semibold w-full sm:w-auto">
                  <Link href="/seller/payouts">Open Payouts</Link>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 px-3 sm:px-6 pb-4 sm:pb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <Card className="rounded-xl border border-border/60 border-l-4 border-l-amber-500 bg-amber-500/5">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-2 sm:gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] sm:text-xs font-semibold text-amber-800 dark:text-amber-200 uppercase tracking-wide">Sales needing action</div>
                      <div className="text-xl sm:text-2xl font-extrabold mt-0.5 sm:mt-1 text-foreground tabular-nums">{sellerQueues.ordersNeedingAnyActionCount}</div>
                      <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1 line-clamp-2">
                        {sellerQueues.ordersNeedingDocsCount} docs · {sellerQueues.ordersNeedingDeliveryUpdateCount} delivery · {sellerQueues.ordersWithIssuesCount} issues
                      </div>
                    </div>
                    <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                  </div>
                  <Button asChild variant="outline" className="w-full mt-2 sm:mt-3 min-h-[44px] sm:min-h-9 font-semibold">
                    <Link href="/seller/sales">
                      View sales
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-xl border border-border/60 border-l-4 border-l-blue-500 bg-blue-500/5">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-2 sm:gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] sm:text-xs font-semibold text-blue-800 dark:text-blue-200 uppercase tracking-wide">Listings pending review</div>
                      <div className="text-xl sm:text-2xl font-extrabold mt-0.5 sm:mt-1 text-foreground tabular-nums">{sellerQueues.pendingReviewListingsCount}</div>
                      <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">Admin/compliance review queue</div>
                    </div>
                    <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400 shrink-0" />
                  </div>
                  <Button asChild variant="outline" className="w-full mt-2 sm:mt-3 min-h-[44px] sm:min-h-9 font-semibold">
                    <Link href="/seller/listings">
                      View listings
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-xl border border-border/60 border-l-4 border-l-violet-500 bg-violet-500/5">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-2 sm:gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] sm:text-xs font-semibold text-violet-800 dark:text-violet-200 uppercase tracking-wide">Open offers</div>
                      <div className="text-xl sm:text-2xl font-extrabold mt-0.5 sm:mt-1 text-foreground tabular-nums">
                        {dashboardData?.totals?.offers?.open ?? '—'}
                      </div>
                      <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
                        {dashboardLoading ? 'Loading…' : 'Review and respond quickly'}
                      </div>
                    </div>
                    <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 text-violet-600 dark:text-violet-400 shrink-0" />
                  </div>
                  <Button asChild variant="outline" className="w-full mt-2 sm:mt-3 min-h-[44px] sm:min-h-9 font-semibold">
                    <Link href="/dashboard/bids-offers">
                      View offers
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-xl border border-border/60 border-l-4 border-l-emerald-600 bg-emerald-500/5">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-2 sm:gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] sm:text-xs font-semibold text-emerald-800 dark:text-emerald-200 uppercase tracking-wide">Revenue (gross)</div>
                      <div className="text-xl sm:text-2xl font-extrabold mt-0.5 sm:mt-1 text-foreground tabular-nums break-all">
                        {typeof dashboardData?.totals?.revenue?.held === 'number'
                          ? `$${dashboardData.totals.revenue.held.toLocaleString()}`
                          : '—'}
                      </div>
                      <div className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">From sales via Stripe</div>
                    </div>
                    <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  </div>
                  <Button asChild variant="outline" className="w-full mt-2 sm:mt-3 min-h-[44px] sm:min-h-9 font-semibold">
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

        {/* Business overview: what you sell and what you buy */}
        <Card className="rounded-xl border border-border/50 bg-card overflow-hidden" data-tour="seller-business-overview">
          <CardHeader className="pb-4 px-3 sm:px-6">
            <CardTitle className="text-lg sm:text-xl font-extrabold">Business overview</CardTitle>
            <CardDescription className="text-sm sm:text-base max-w-xl">
              What you&apos;re making (selling) and what you&apos;re spending (buying) — business financials at a glance
            </CardDescription>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-4 sm:pb-8 overflow-x-hidden">
            {/* P&L — one row: Earned | Spent | Margin | Net, same size, even spacing; mobile-friendly */}
            <div
              className={cn(
                'rounded-xl border-2 p-3 sm:p-4 md:p-6 mb-4 sm:mb-6 md:mb-8 relative overflow-hidden',
                'bg-muted/40 dark:bg-muted/20',
                businessPL.net > 0 && 'border-emerald-500/50 dark:border-emerald-400/40 shadow-[0_0_20px_-5px] shadow-emerald-500/10 dark:shadow-emerald-400/10',
                businessPL.net < 0 && 'border-border/60',
                businessPL.net === 0 && 'border-border/60'
              )}
              data-tour="seller-pl"
            >
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-muted-foreground/80">
                  P&amp;L
                </span>
                <Badge
                  variant="secondary"
                  className={cn(
                    'font-bold uppercase tracking-wide text-[10px] sm:text-xs',
                    businessPL.net > 0 && 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
                    businessPL.net < 0 && 'bg-muted text-muted-foreground border-border',
                    businessPL.net === 0 && 'bg-muted text-muted-foreground'
                  )}
                >
                  {businessPL.net > 0 ? 'Net gain' : businessPL.net < 0 ? 'Net position' : 'Even'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 md:gap-8">
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-muted-foreground/80 mb-0.5">
                    Earned
                  </p>
                  <p className="text-sm sm:text-base md:text-lg font-extrabold text-foreground tabular-nums break-all">
                    ${businessPL.revenue.toLocaleString()}
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">From sales</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-muted-foreground/80 mb-0.5">
                    Spent
                  </p>
                  <p className="text-sm sm:text-base md:text-lg font-extrabold text-foreground tabular-nums break-all">
                    ${businessPL.costs.toLocaleString()}
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Purchases</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-muted-foreground/80 mb-0.5">
                    Margin
                  </p>
                  <p
                    className={cn(
                      'text-sm sm:text-base md:text-lg font-extrabold tabular-nums break-all',
                      businessPL.revenue > 0 && businessPL.net > 0 && 'text-emerald-600 dark:text-emerald-400',
                      businessPL.revenue > 0 && businessPL.net <= 0 && 'text-foreground'
                    )}
                  >
                    {businessPL.revenue > 0
                      ? `${Math.round((businessPL.net / businessPL.revenue) * 100)}%`
                      : '—'}
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Net ÷ revenue</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-muted-foreground/80 mb-0.5">
                    Net
                  </p>
                  <p
                    className={cn(
                      'text-sm sm:text-base md:text-lg font-extrabold tabular-nums break-all',
                      businessPL.net > 0 && 'text-emerald-600 dark:text-emerald-400',
                      businessPL.net < 0 && 'text-foreground',
                      businessPL.net === 0 && 'text-muted-foreground'
                    )}
                  >
                    {businessPL.net > 0 && `$${businessPL.net.toLocaleString()}`}
                    {businessPL.net < 0 && `−$${Math.abs(businessPL.net).toLocaleString()}`}
                    {businessPL.net === 0 && '—'}
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Sales − purchases</p>
                </div>
              </div>

              {/* Earned vs spent over time — interactive chart; mobile-friendly */}
              <BusinessOverviewChart
                sellerOrders={orders}
                buyerOrders={buyerOrders}
                className="mt-4 sm:mt-6 md:mt-8 pt-4 sm:pt-6 border-t border-border/50 min-w-0"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8 min-w-0">
              {/* Selling (outs) — what you're making: dollars first */}
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Package className="h-5 w-5 text-primary shrink-0" />
                    <h3 className="font-semibold text-foreground truncate">What you&apos;re making</h3>
                  </div>
                  <div className="flex gap-2 w-full sm:w-auto shrink-0">
                    <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-initial min-h-[44px] sm:min-h-9 font-semibold">
                      <Link href="/seller/listings">Listings</Link>
                    </Button>
                    <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-initial min-h-[44px] sm:min-h-9 font-semibold">
                      <Link href="/seller/sales">Sales</Link>
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4" data-tour="seller-business-overview-selling">
                  {sellerFinancialStats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                      <Card
                        key={stat.label}
                        className={cn(
                          'rounded-xl border border-border/50 bg-card hover:border-border/70',
                          'hover:shadow-sm transition-colors active:scale-[0.98]',
                          'min-h-[112px] sm:min-h-[108px] flex flex-col justify-between'
                        )}
                      >
                        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-1.5 px-3 pt-3 sm:pb-2 sm:px-4 sm:pt-4">
                          <CardTitle className="text-[11px] sm:text-xs font-bold uppercase tracking-wide text-muted-foreground leading-tight line-clamp-2 min-w-0 pr-2">
                            {stat.label}
                          </CardTitle>
                          <div
                            className={cn(
                              'w-8 h-8 sm:w-9 sm:h-9 rounded-lg border-2 flex items-center justify-center shrink-0',
                              stat.bgColor,
                              stat.borderColor
                            )}
                          >
                            <Icon className={cn('h-3.5 w-3.5 sm:h-4 sm:w-4', stat.color)} />
                          </div>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 pt-0 sm:px-4 sm:pb-4">
                          <div className="text-lg sm:text-xl md:text-2xl font-extrabold text-foreground mb-0.5 tabular-nums min-w-0 break-words">
                            {stat.value}
                          </div>
                          <p className="text-[11px] sm:text-xs text-muted-foreground font-medium line-clamp-2 leading-snug">
                            {stat.subtext}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

              {/* Buying (ins) — KPI cards like seller stats; mobile: full-bleed border, padded content */}
              <div className="space-y-4 pt-6 border-t border-border/60 lg:pt-0 lg:border-t-0 lg:border-l lg:border-border/50 lg:pl-6 lg:ml-0 -mx-3 px-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ShoppingBag className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <h3 className="font-semibold text-foreground truncate">What you&apos;re spending</h3>
                  </div>
                  <Button asChild variant="outline" size="sm" className="w-full sm:w-auto min-h-[44px] sm:min-h-9 font-semibold shrink-0">
                    <Link href="/dashboard/orders">
                      My orders
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Link>
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4" data-tour="seller-business-overview-buying">
                  {buyerStats.map((stat) => {
                    const Icon = stat.icon;
                    return (
                      <Card
                        key={stat.label}
                        className={cn(
                          'rounded-xl border border-border/50 bg-card hover:border-border/70',
                          'hover:shadow-sm transition-colors active:scale-[0.98]',
                          'min-h-[112px] sm:min-h-[108px] flex flex-col justify-between'
                        )}
                      >
                        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-1.5 px-3 pt-3 sm:pb-2 sm:px-4 sm:pt-4">
                          <CardTitle className="text-[11px] sm:text-xs font-bold uppercase tracking-wide text-muted-foreground leading-tight line-clamp-2 min-w-0 pr-2">
                            {stat.label}
                          </CardTitle>
                          <div
                            className={cn(
                              'w-8 h-8 sm:w-9 sm:h-9 rounded-lg border-2 flex items-center justify-center shrink-0',
                              stat.bgColor,
                              stat.borderColor
                            )}
                          >
                            <Icon className={cn('h-3.5 w-3.5 sm:h-4 sm:w-4', stat.color)} />
                          </div>
                        </CardHeader>
                        <CardContent className="px-3 pb-3 pt-0 sm:px-4 sm:pb-4">
                          <div className="text-lg sm:text-xl md:text-2xl font-extrabold text-foreground mb-0.5 tabular-nums min-w-0 break-words">
                            {stat.value}
                          </div>
                          <p className="text-[11px] sm:text-xs text-muted-foreground font-medium line-clamp-2 leading-snug">
                            {stat.subtext}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Seller Setup Checklist — mobile: stacked, touch-friendly buttons */}
        {user && setupChecklist.isComplete !== true && (
          <Card className="rounded-xl border border-border/50 bg-card overflow-hidden" data-tour="seller-setup-checklist">
            <CardHeader className="px-3 sm:px-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                <div className="min-w-0">
                  <CardTitle className="text-lg sm:text-xl font-extrabold">Seller Setup Checklist</CardTitle>
                  <CardDescription className="text-sm sm:text-base">
                    Complete these steps to publish listings and get paid. (Buyers can still browse and save listings anytime.)
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="font-semibold shrink-0 w-fit">
                  {`${setupChecklist.done}/${setupChecklist.total} complete`}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 px-3 sm:px-6 pb-4 sm:pb-6">
              {(() => {
                const { profileOk, emailOk, payoutsOk } = setupChecklist;

                return (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                    {/* 1) Verify Email — matches top-of-page card and profile-completion flow */}
                    <div className={cn('rounded-lg border-2 p-3 sm:p-4', emailOk ? 'border-primary/25 bg-primary/5' : 'border-border/50 bg-background/40')}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-foreground">1) Verify Email</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Required before publishing and checkout actions.
                          </p>
                        </div>
                        {emailOk ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <Clock className="h-5 w-5 text-muted-foreground" />}
                      </div>
                      <div className="mt-3 space-y-2">
                        <Button
                          variant={emailOk ? 'outline' : 'default'}
                          className="w-full min-h-[44px] font-semibold touch-manipulation"
                          disabled={sendingVerificationEmail}
                          onClick={async () => {
                            if (emailOk) {
                              try {
                                await refreshUser();
                                const profile = uid ? await getUserProfile(uid) : null;
                                setUserProfile(profile);
                                toast({ title: 'Account refreshed', description: 'Your verification status has been refreshed.' });
                              } catch (e: any) {
                                toast({ title: 'Refresh failed', description: formatUserFacingError(e, 'Please try again.'), variant: 'destructive' });
                              }
                              return;
                            }
                            setSendingVerificationEmail(true);
                            try {
                              const result = await resendVerificationEmail();
                              if (result?.alreadyVerified) {
                                // Sync Firestore so checklist shows complete (needed for OAuth and so UI matches API).
                                if (uid) {
                                  await updateUserProfile(uid, {
                                    emailVerified: true,
                                    emailVerificationCompletedAt: new Date(),
                                  } as any);
                                }
                                await refreshUser();
                                const profile = uid ? await getUserProfile(uid) : null;
                                setUserProfile(profile);
                                toast({ title: 'Already verified', description: 'Your email is already verified. Status updated.' });
                              } else {
                                toast({ title: 'Verification email sent', description: 'Check your inbox (and spam folder).' });
                              }
                            } catch (e: any) {
                              toast({
                                title: 'Could not send verification email',
                                description: formatUserFacingError(
                                  e,
                                  'If you already verified, click "Refresh Status"; otherwise try again in a moment.'
                                ),
                                variant: 'destructive',
                              });
                            } finally {
                              setSendingVerificationEmail(false);
                            }
                          }}
                        >
                          {sendingVerificationEmail ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Sending…
                            </>
                          ) : emailOk ? (
                            'Refresh Status'
                          ) : (
                            'Send Verification Email'
                          )}
                        </Button>
                        {!emailOk && (
                          <p className="text-xs text-muted-foreground">
                            Tip: after you click the link in your email, come back here and press &quot;Refresh Status&quot;.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className={cn('rounded-lg border-2 p-3 sm:p-4', profileOk ? 'border-primary/25 bg-primary/5' : 'border-border/50 bg-background/40')}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-foreground">2) Profile</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Full name, phone number, and location.
                          </p>
                        </div>
                        {profileOk ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <Clock className="h-5 w-5 text-muted-foreground" />}
                      </div>
                      <div className="mt-3">
                        <Button asChild variant={profileOk ? 'outline' : 'default'} className="w-full min-h-[44px] font-semibold touch-manipulation">
                          <Link href="/dashboard/account">{profileOk ? 'View Profile' : 'Complete Profile'}</Link>
                        </Button>
                      </div>
                    </div>

                    <div className={cn('rounded-lg border-2 p-3 sm:p-4', payoutsOk ? 'border-primary/25 bg-primary/5' : 'border-border/50 bg-background/40')}>
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
                          <Button asChild variant="outline" className="w-full min-h-[44px] font-semibold touch-manipulation">
                            <Link href="/seller/payouts">View Payouts</Link>
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="default"
                            className="w-full min-h-[44px] font-semibold touch-manipulation"
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
                                if (!userProfile?.stripeAccountId) {
                                  await createStripeAccount();
                                }
                                const { url } = await createAccountLink();
                                window.location.href = url;
                              } catch (e: any) {
                                toast({
                                  title: 'Could not connect Stripe',
                                  description: formatUserFacingError(e, 'Please try again.'),
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

        {/* Payout Readiness — mobile: full width, no overflow */}
        {user && userProfile && !hidePayoutReadinessOnOverview && (
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:gap-8 min-w-0">
            <div data-tour="seller-payout-readiness">
              <div className="relative">
                {uid && payoutsReady ? (
                  <div className="absolute right-2 top-2 z-10">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 min-h-[44px] min-w-[44px] touch-manipulation"
                      aria-label="Hide payout readiness card"
                      onClick={() => {
                        setHidePayoutReadinessOnOverview(true);
                        if (typeof window !== 'undefined') {
                          try {
                            window.localStorage.setItem(payoutReadinessDismissKey(uid), '1');
                          } catch {
                            // ignore
                          }
                        }
                        toast({
                          title: 'Hidden',
                          description: 'Payout readiness card hidden on Overview.',
                        });
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
                <PayoutReadinessCard
                  userProfile={userProfile}
                  onRefresh={async () => {
                    const profile = await getUserProfile(user.uid);
                    setUserProfile(profile);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Seller-level compliance (whitetail breeders): TPWD breeder permit */}
        {uid && !hideBreederPermitOnOverview ? (
          <div className="relative min-w-0">
            <div className="absolute right-2 top-2 z-10">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11 min-h-[44px] min-w-[44px] touch-manipulation"
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 md:gap-8 min-w-0">
          {/* Action Required Panel + Performance — mobile: padded, touch-friendly */}
          <div className="space-y-4 min-w-0">
            <Card className="rounded-xl border border-border/50 bg-card overflow-hidden" data-tour="seller-action-required">
              <CardHeader className="px-3 sm:px-6">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                    <CardTitle className="text-lg sm:text-xl font-extrabold truncate">Action Required</CardTitle>
                  </div>
                  <Badge variant="secondary" className="font-semibold shrink-0">
                    {alerts.length} items
                  </Badge>
                </div>
                <CardDescription className="text-sm sm:text-base">
                  Items that need your attention
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-3 sm:px-6 pb-4 sm:pb-6">
                {alerts.length === 0 ? (
                  <div className="py-8 sm:py-12 text-center">
                    <CheckCircle2 className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mx-auto mb-3 sm:mb-4 opacity-50" />
                    <p className="text-muted-foreground font-medium text-sm sm:text-base">No actions required</p>
                    <p className="text-xs sm:text-sm text-muted-foreground mt-1">You're all caught up!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {alerts.map((alert) => {
                      const Icon = getAlertIcon(alert.type);
                      const isAuctionEnding = alert.type === 'auction_ending';
                      const showCountdownBadge = isAuctionEnding && alert.countdownText;
                      const timeLabel = showCountdownBadge
                        ? `Ends in ${alert.countdownText}`
                        : formatTimeAgo(alert.timestamp);
                      const showListingTitle = alert.listingTitle && !isAuctionEnding;

                      return (
                        <Link
                          key={alert.id}
                          href={alert.actionUrl}
                          className={cn(
                            'flex flex-col sm:flex-row items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-lg border-2 transition-shadow group min-h-[44px] sm:min-h-0',
                            getAlertColor(alert.priority),
                            'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2'
                          )}
                        >
                          {/* Thumbnail (auction) or icon */}
                          {isAuctionEnding && alert.listingImageUrl ? (
                            <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0 border border-border/50">
                              <Image
                                src={alert.listingImageUrl}
                                alt=""
                                fill
                                className="object-cover"
                                sizes="64px"
                              />
                              {showCountdownBadge && (
                                <div
                                  className={cn(
                                    'absolute bottom-0 inset-x-0 py-0.5 text-[10px] font-bold text-white text-center',
                                    alert.priority === 'high'
                                      ? 'bg-destructive/90'
                                      : alert.priority === 'medium'
                                        ? 'bg-amber-600/90'
                                        : 'bg-muted-foreground/80'
                                  )}
                                >
                                  {alert.countdownText}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div
                              className={cn(
                                'w-10 h-10 rounded-lg border-2 flex items-center justify-center flex-shrink-0',
                                alert.priority === 'high'
                                  ? 'bg-destructive/10 border-destructive/20'
                                  : alert.priority === 'medium'
                                    ? 'bg-primary/10 border-primary/20'
                                    : 'bg-background/50 border-border/50'
                              )}
                            >
                              <Icon
                                className={cn(
                                  'h-5 w-5',
                                  alert.priority === 'high'
                                    ? 'text-destructive'
                                    : alert.priority === 'medium'
                                      ? 'text-primary'
                                      : 'text-muted-foreground'
                                )}
                              />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            {isAuctionEnding && (
                              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5 block">
                                Auction ending soon
                              </span>
                            )}
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h3 className="font-semibold text-foreground line-clamp-2 group-hover:text-primary">
                                {alert.title}
                              </h3>
                              {!showCountdownBadge && (
                                <span className="text-xs text-muted-foreground font-medium whitespace-nowrap flex-shrink-0">
                                  {timeLabel}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {alert.description}
                            </p>
                            {showListingTitle && (
                              <p className="text-xs text-muted-foreground font-medium mt-1">
                                {alert.listingTitle}
                              </p>
                            )}
                            {showCountdownBadge && !alert.listingImageUrl && (
                              <Badge
                                variant={alert.priority === 'high' ? 'destructive' : 'secondary'}
                                className="mt-2 text-xs font-semibold"
                              >
                                <Clock className="h-3 w-3 mr-1" />
                                Ends in {alert.countdownText}
                              </Badge>
                            )}
                          </div>

                          <span
                            className={cn(
                              'inline-flex items-center justify-center min-h-[44px] px-3 rounded-md border border-input bg-background font-semibold text-sm flex-shrink-0 w-full sm:w-auto touch-manipulation',
                              'group-hover:bg-accent group-hover:text-accent-foreground'
                            )}
                          >
                            {alert.action === 'view' ? 'View' : alert.action === 'respond' ? 'Respond' : 'Complete'}
                            <ArrowRight className="h-3 w-3 ml-1" />
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Performance (Lightweight) — mobile: padded, touch-friendly */}
            <Card className="rounded-xl border border-border/50 bg-card overflow-hidden" data-tour="seller-performance">
              <CardHeader className="px-3 sm:px-6">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                  <CardTitle className="text-lg sm:text-xl font-extrabold">Performance</CardTitle>
                </div>
                <CardDescription className="text-sm sm:text-base">
                  Quick metrics overview
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-3 sm:px-6 pb-4 sm:pb-6">
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
                  className="w-full min-h-[44px] font-semibold touch-manipulation"
                >
                  <Link href="/seller/reputation">
                    View Full Stats
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity — mobile: padded, touch-friendly */}
          <div className="space-y-4 min-w-0">
            <Card className="rounded-xl border border-border/50 bg-card overflow-hidden" data-tour="seller-recent-activity">
              <CardHeader className="px-3 sm:px-6">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
                  <CardTitle className="text-lg sm:text-xl font-extrabold">Recent Activity</CardTitle>
                </div>
                <CardDescription className="text-sm sm:text-base">
                  Latest updates on your listings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-3 sm:px-6 pb-4 sm:pb-6">
                {activities.length === 0 ? (
                  <div className="py-6 sm:py-8 text-center">
                    <Activity className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground mx-auto mb-2 sm:mb-3 opacity-50" />
                    <p className="text-xs sm:text-sm text-muted-foreground font-medium">No recent activity</p>
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

