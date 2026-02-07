/**
 * Mobile Dashboard menu – eBay-style grouped links (Buying, Selling, Account, Admin).
 * Replaces the sidebar sheet on mobile. Desktop unchanged (sidebar only).
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  Heart,
  Search,
  Bell,
  Gavel,
  ShoppingBag,
  DollarSign,
  MessageSquare,
  CreditCard,
  Award,
  LifeBuoy,
  Settings,
  Users,
  HeartPulse,
  Shield,
  CheckCircle,
  HelpCircle,
  Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useAdmin } from '@/hooks/use-admin';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useDashboardBadges } from '@/contexts/DashboardBadgesContext';

type NavItem = { href: string; label: string; subtext: string; icon: React.ComponentType<{ className?: string }> };

const BUYING: NavItem[] = [
  { href: '/dashboard/watchlist', label: 'Watchlist', subtext: 'Saved listings and sellers you follow.', icon: Heart },
  { href: '/dashboard/saved-searches', label: 'Saved Searches', subtext: 'Alerts when new listings match your criteria.', icon: Search },
  { href: '/dashboard/orders', label: 'Purchases', subtext: 'Orders you bought and delivery status.', icon: ShoppingBag },
  { href: '/dashboard/bids-offers', label: 'Bids & Offers', subtext: 'Your bids, offers, and auction activity.', icon: Gavel },
  { href: '/dashboard/notifications', label: 'Notifications', subtext: 'Alerts for outbid, wins, and messages.', icon: Bell },
];

const SELLING: NavItem[] = [
  { href: '/seller/overview', label: 'Overview', subtext: 'Sales summary and quick actions.', icon: LayoutDashboard },
  { href: '/seller/listings', label: 'My Listings', subtext: 'Active and draft listings you created.', icon: Package },
  { href: '/seller/sales', label: 'Sold', subtext: 'Completed sales and order fulfillment.', icon: DollarSign },
  { href: '/dashboard/messages', label: 'Messages', subtext: 'Conversations with buyers and sellers.', icon: MessageSquare },
  { href: '/seller/payouts', label: 'Payouts', subtext: 'Earnings and payout history.', icon: CreditCard },
  { href: '/seller/reputation', label: 'Reputation', subtext: 'Reviews and seller rating.', icon: Award },
];

const ACCOUNT: NavItem[] = [
  { href: '/dashboard/support', label: 'Support', subtext: 'Help, FAQs, and contact support.', icon: LifeBuoy },
  { href: '/dashboard/account', label: 'Settings', subtext: 'Profile, security, and preferences.', icon: Settings },
];

const ADMIN: NavItem[] = [
  { href: '/dashboard/admin/users', label: 'Users', subtext: 'Manage user accounts and roles.', icon: Users },
  { href: '/dashboard/admin/listings', label: 'Approve Listings', subtext: 'Review and approve new listings.', icon: CheckCircle },
  { href: '/dashboard/admin/messages', label: 'Flagged Messages', subtext: 'Review reported conversations.', icon: MessageSquare },
  { href: '/dashboard/admin/health', label: 'System Health', subtext: 'Platform status and diagnostics.', icon: HeartPulse },
  { href: '/dashboard/admin/ops', label: 'Admin Ops', subtext: 'Fulfillment, disputes, and operations.', icon: Shield },
  { href: '/dashboard/admin/compliance', label: 'Compliance', subtext: 'Listings, orders, and breeder permits.', icon: Shield },
  { href: '/dashboard/admin/reconciliation', label: 'Reconciliation', subtext: 'Transaction and payout reconciliation.', icon: Search },
  { href: '/dashboard/admin/revenue', label: 'Revenue', subtext: 'Fees, revenue, and financial reports.', icon: DollarSign },
  { href: '/dashboard/admin/support', label: 'Support', subtext: 'Support tickets and responses.', icon: HelpCircle },
  { href: '/dashboard/admin/email-templates', label: 'Email Templates', subtext: 'Manage notification email content.', icon: Mail },
  { href: '/dashboard/admin/notifications', label: 'Notifications', subtext: 'Events and notification delivery.', icon: Bell },
];

function Section({ title, items, badgeByHref }: { title: string; items: NavItem[]; badgeByHref?: Record<string, number> }) {
  const pathname = usePathname();
  return (
    <section className="mb-6">
      <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-4 mb-2">
        {title}
      </h2>
      <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
        {items.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname?.startsWith(item.href + '/');
          const badgeCount = badgeByHref?.[item.href] ?? 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 min-h-[56px] border-b border-border/50 last:border-b-0',
                'hover:bg-muted/40 active:bg-muted/60 transition-colors',
                active && 'bg-primary/10 text-primary'
              )}
            >
              <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', active ? 'text-primary' : 'text-muted-foreground')} />
              <div className="flex-1 min-w-0 py-0.5">
                <div className={cn('font-medium text-sm', active && 'text-primary')}>{item.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{item.subtext}</div>
              </div>
              {badgeCount > 0 && (
                <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-xs shrink-0">
                  {badgeCount}
                </Badge>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function DashboardMenuPageContent() {
  const { isAdmin, isSuperAdmin } = useAdmin();
  const badges = useDashboardBadges();
  const showAdmin = isAdmin === true || isSuperAdmin === true;

  const badgeByHref: Record<string, number> = {
    '/dashboard/bids-offers': badges.offers,
    '/dashboard/notifications': badges.notifications,
    '/dashboard/messages': badges.messages,
    '/dashboard/admin/listings': badges.pendingApprovals,
    '/dashboard/admin/notifications': isSuperAdmin ? badges.adminNotifications : 0,
    '/dashboard/admin/support': isAdmin ? badges.supportTickets : 0,
    '/dashboard/admin/compliance': isAdmin ? badges.pendingBreederPermits : 0,
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <h1 className="we-h2 mb-6">Dashboard</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Shopping, selling, and account – all in one place.
        </p>

        <Section title="Buying" items={BUYING} badgeByHref={badgeByHref} />
        <Section title="Selling" items={SELLING} badgeByHref={badgeByHref} />
        <Section title="Account" items={ACCOUNT} badgeByHref={badgeByHref} />
        {showAdmin ? <Section title="Admin" items={ADMIN} badgeByHref={badgeByHref} /> : null}
      </div>
    </div>
  );
}

export default function DashboardMenuPage() {
  return (
    <RequireAuth>
      <DashboardMenuPageContent />
    </RequireAuth>
  );
}
