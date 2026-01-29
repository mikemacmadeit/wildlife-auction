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

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const BUYING: NavItem[] = [
  { href: '/dashboard/watchlist', label: 'Watchlist', icon: Heart },
  { href: '/dashboard/saved-searches', label: 'Saved Searches', icon: Search },
  { href: '/dashboard/orders', label: 'Purchases', icon: ShoppingBag },
  { href: '/dashboard/bids-offers', label: 'Bids & Offers', icon: Gavel },
  { href: '/dashboard/notifications', label: 'Notifications', icon: Bell },
];

const SELLING: NavItem[] = [
  { href: '/seller/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/seller/listings', label: 'My Listings', icon: Package },
  { href: '/seller/sales', label: 'Sold', icon: DollarSign },
  { href: '/dashboard/messages', label: 'Messages', icon: MessageSquare },
  { href: '/seller/payouts', label: 'Payouts', icon: CreditCard },
  { href: '/seller/reputation', label: 'Reputation', icon: Award },
];

const ACCOUNT: NavItem[] = [
  { href: '/dashboard/support', label: 'Support', icon: LifeBuoy },
  { href: '/dashboard/account', label: 'Settings', icon: Settings },
];

const ADMIN: NavItem[] = [
  { href: '/dashboard/admin/users', label: 'Users', icon: Users },
  { href: '/dashboard/admin/health', label: 'System Health', icon: HeartPulse },
  { href: '/dashboard/admin/ops', label: 'Admin Ops', icon: Shield },
  { href: '/dashboard/admin/compliance', label: 'Compliance', icon: Shield },
  { href: '/dashboard/admin/reconciliation', label: 'Reconciliation', icon: Search },
  { href: '/dashboard/admin/revenue', label: 'Revenue', icon: DollarSign },
  { href: '/dashboard/admin/listings', label: 'Approve Listings', icon: CheckCircle },
  { href: '/dashboard/admin/messages', label: 'Flagged Messages', icon: MessageSquare },
  { href: '/dashboard/admin/support', label: 'Support', icon: HelpCircle },
  { href: '/dashboard/admin/email-templates', label: 'Email Templates', icon: Mail },
  { href: '/dashboard/admin/notifications', label: 'Notifications', icon: Bell },
];

function Section({ title, items }: { title: string; items: NavItem[] }) {
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
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 min-h-[48px] border-b border-border/50 last:border-b-0',
                'hover:bg-muted/40 active:bg-muted/60 transition-colors',
                active && 'bg-primary/10 text-primary'
              )}
            >
              <Icon className={cn('h-5 w-5 shrink-0', active ? 'text-primary' : 'text-muted-foreground')} />
              <span className="flex-1 font-medium text-sm">{item.label}</span>
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
  const showAdmin = isAdmin === true || isSuperAdmin === true;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <h1 className="we-h2 mb-6">Dashboard</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Shopping, selling, and account – all in one place.
        </p>

        <Section title="Buying" items={BUYING} />
        <Section title="Selling" items={SELLING} />
        <Section title="Account" items={ACCOUNT} />
        {showAdmin ? <Section title="Admin" items={ADMIN} /> : null}
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
