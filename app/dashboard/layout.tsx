'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  LayoutDashboard,
  LayoutGrid,
  Package,
  DollarSign,
  FileCheck,
  MessageSquare,
  CreditCard,
  Award,
  Settings,
  Menu,
  X,
  PlusCircle,
  ShoppingBag,
  Gavel,
  ChevronLeft,
  ChevronRight,
  User,
  LogOut,
  ChevronDown,
  Search,
  Heart,
  Shield,
  CheckCircle,
  HeartPulse,
  Mail,
  Bell,
  HelpCircle,
  Users,
  LifeBuoy,
  Compass,
  Home,
  ListTodo,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/hooks/use-auth';
import { useAdmin } from '@/hooks/use-admin';
import { signOutUser } from '@/lib/firebase/auth';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BrandLogoText } from '@/components/navigation/BrandLogoText';
import { LayoutBottomNav } from '@/components/navigation/LayoutBottomNav';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { DashboardBadgesProvider } from '@/contexts/DashboardBadgesContext';
import { ProfileCompletionGate } from '@/components/auth/ProfileCompletionGate';
import { ProductionErrorBoundary } from '@/components/error-boundary/ProductionErrorBoundary';
import {
  markNotificationsAsReadByTypes,
  subscribeToUnreadCount,
  subscribeToUnreadCountByCategory,
  subscribeToUnreadCountByType,
  subscribeToUnreadCountByTypes,
} from '@/lib/firebase/notifications';
import type { NotificationType } from '@/lib/types';
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { filterActionItems, type ActionItemNotification } from '@/lib/notifications/actionItems';

interface SellerNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  shortLabel?: string;
}

// Base nav items (always visible) - handles both /dashboard/* and /seller/* routes
const baseNavItems: SellerNavItem[] = [
  { href: '/seller/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/seller/todo', label: 'To-Do', icon: ListTodo },
  { href: '/browse', label: 'Browse', icon: Compass },
  { href: '/seller/listings', label: 'My Listings', icon: Package },
  { href: '/dashboard/watchlist', label: 'Watchlist', icon: Heart },
  { href: '/dashboard/saved-searches', label: 'Saved Searches', icon: Search },
  { href: '/dashboard/notifications', label: 'Notifications', icon: Bell },
  { href: '/dashboard/bids-offers', label: 'Bids & Offers', icon: Gavel },
  { href: '/dashboard/orders', label: 'Purchases', icon: ShoppingBag },
  { href: '/seller/sales', label: 'Sold', icon: DollarSign },
  { href: '/dashboard/messages', label: 'Messages', icon: MessageSquare },
  { href: '/seller/payouts', label: 'Payouts', icon: CreditCard },
  { href: '/seller/reputation', label: 'Reputation', icon: Award },
  { href: '/dashboard/support', label: 'Support', icon: LifeBuoy },
  { href: '/dashboard/account', label: 'Settings', icon: Settings },
];

// Admin nav items (only visible to admins)
const adminNavItems: SellerNavItem[] = [
  { href: '/dashboard/admin/users', label: 'Users', icon: Users },
  { href: '/dashboard/admin/listings', label: 'Approve Listings', icon: CheckCircle },
  { href: '/dashboard/admin/messages', label: 'Flagged Messages', icon: MessageSquare },
  { href: '/dashboard/admin/health', label: 'System Health', icon: HeartPulse },
  { href: '/dashboard/admin/ops', label: 'Admin Ops', icon: Shield },
  { href: '/dashboard/admin/compliance', label: 'Compliance', icon: Shield },
  { href: '/dashboard/admin/reconciliation', label: 'Reconciliation', icon: Search },
  { href: '/dashboard/admin/revenue', label: 'Revenue', icon: DollarSign },
  { href: '/dashboard/admin/support', label: 'Support', icon: HelpCircle },
  { href: '/dashboard/admin/email-templates', label: 'Email Templates', icon: Mail },
  { href: '/dashboard/admin/notifications', label: 'Notifications', icon: Bell },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { isAdmin, isSuperAdmin } = useAdmin();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Phase 2A: single badges state to batch subscription updates and reduce layout re-renders
  const [badges, setBadges] = useState({
    messages: 0,
    notifications: 0,
    offers: 0,
    todo: 0,
    adminNotifications: 0,
    supportTickets: 0,
    pendingApprovals: 0,
    pendingBreederPermits: 0,
  });
  const [adminEverTrue, setAdminEverTrue] = useState(false);
  const [userNavOpen, setUserNavOpen] = useState(true);
  const [adminNavOpen, setAdminNavOpen] = useState(true);
  const [navPrefsLoaded, setNavPrefsLoaded] = useState(false);

  useEffect(() => {
    setAdminEverTrue(false);
    setBadges((prev) => ({ ...prev, pendingApprovals: 0 }));
  }, [user?.uid]);

  useEffect(() => {
    if (isAdmin === true) setAdminEverTrue(true);
  }, [isAdmin]);

  const showAdminNav = isAdmin === true || adminEverTrue;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const userOpen = window.localStorage.getItem('we:nav:v1:seller:user_open');
      const adminOpen = window.localStorage.getItem('we:nav:v1:seller:admin_open');
      if (userOpen !== null) setUserNavOpen(userOpen === '1');
      if (adminOpen !== null) setAdminNavOpen(adminOpen === '1');
      setNavPrefsLoaded(true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!navPrefsLoaded) return;
    try {
      window.localStorage.setItem('we:nav:v1:seller:user_open', userNavOpen ? '1' : '0');
      window.localStorage.setItem('we:nav:v1:seller:admin_open', adminNavOpen ? '1' : '0');
    } catch {
      // ignore
    }
  }, [showAdminNav, navPrefsLoaded, userNavOpen, adminNavOpen]);

  const baseNavWithBadges = useMemo(() => {
    return baseNavItems.map((item) => {
      if (item.href === '/dashboard/messages') {
        return { ...item, badge: badges.messages > 0 ? badges.messages : undefined };
      }
      if (item.href === '/dashboard/notifications') {
        return { ...item, badge: badges.notifications > 0 ? badges.notifications : undefined };
      }
      if (item.href === '/dashboard/bids-offers') {
        return { ...item, badge: badges.offers > 0 ? badges.offers : undefined };
      }
      if (item.href === '/seller/todo') {
        return { ...item, badge: badges.todo > 0 ? badges.todo : undefined };
      }
      return item;
    });
  }, [badges.messages, badges.notifications, badges.offers, badges.todo]);

  const adminNavWithBadges = useMemo(() => {
    return adminNavItems.map((item) => {
      if (item.href === '/dashboard/admin/listings') {
        return { ...item, badge: badges.pendingApprovals > 0 ? badges.pendingApprovals : undefined };
      }
      if (item.href === '/dashboard/admin/notifications') {
        return {
          ...item,
          badge: isSuperAdmin && badges.adminNotifications > 0 ? badges.adminNotifications : undefined,
        };
      }
      if (item.href === '/dashboard/admin/support') {
        const badge = isAdmin && badges.supportTickets > 0 ? badges.supportTickets : undefined;
        return {
          ...item,
          badge,
        };
      }
      if (item.href === '/dashboard/admin/compliance') {
        return {
          ...item,
          badge: isAdmin && badges.pendingBreederPermits > 0 ? badges.pendingBreederPermits : undefined,
        };
      }
      return item;
    });
  }, [badges.pendingApprovals, badges.adminNotifications, badges.supportTickets, badges.pendingBreederPermits, isSuperAdmin, isAdmin]);

  useEffect(() => {
    if (!user?.uid) return;
    if (!pathname?.startsWith('/dashboard/messages')) return;
    void markNotificationsAsReadByTypes(user.uid, ['message_received']);
  }, [pathname, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    if (!pathname?.startsWith('/dashboard/admin/support')) return;
    void markNotificationsAsReadByTypes(user.uid, ['admin_support_ticket_submitted']);
  }, [pathname, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    if (!pathname?.startsWith('/dashboard/admin/compliance')) return;
    void markNotificationsAsReadByTypes(user.uid, ['admin_breeder_permit_submitted']);
  }, [pathname, user?.uid]);

  useEffect(() => {
    if (!user?.uid) {
      setBadges((prev) => ({
        ...prev,
        messages: 0,
        notifications: 0,
        offers: 0,
        todo: 0,
        adminNotifications: 0,
        supportTickets: 0,
        pendingBreederPermits: 0,
      }));
      return;
    }

    try {
      const unsubs: Array<() => void> = [];
      unsubs.push(
        subscribeToUnreadCountByType(user.uid, 'message_received', (count) => {
          setBadges((prev) => ({ ...prev, messages: count || 0 }));
        })
      );
      unsubs.push(
        subscribeToUnreadCount(user.uid, (count) => {
          setBadges((prev) => ({ ...prev, notifications: count || 0 }));
        })
      );

      if (showAdminNav && isSuperAdmin) {
        unsubs.push(
          subscribeToUnreadCountByCategory(user.uid, 'admin', (count) => {
            setBadges((prev) => ({ ...prev, adminNotifications: count || 0 }));
          })
        );
      }

      if (showAdminNav && isAdmin) {
        unsubs.push(
          subscribeToUnreadCountByTypes(user.uid, ['admin_support_ticket_submitted'], (count) => {
            setBadges((prev) => ({ ...prev, supportTickets: count || 0 }));
          })
        );
        unsubs.push(
          subscribeToUnreadCountByType(user.uid, 'admin_breeder_permit_submitted', (count) => {
            setBadges((prev) => ({ ...prev, pendingBreederPermits: count || 0 }));
          })
        );
      }

      const offerTypes: NotificationType[] = [
        'bid_outbid',
        'bid_received',
        'offer_received',
        'offer_countered',
        'offer_accepted',
        'offer_declined',
        'offer_expired',
      ];
      unsubs.push(
        subscribeToUnreadCountByTypes(user.uid, offerTypes, (count) => {
          setBadges((prev) => ({ ...prev, offers: count || 0 }));
        })
      );

      const notificationsRef = collection(db, 'users', user.uid, 'notifications');
      const notificationsQuery = query(
        notificationsRef,
        orderBy('createdAt', 'desc'),
        limit(100)
      );
      unsubs.push(
        onSnapshot(notificationsQuery, (snap) => {
          const items = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as object),
          })) as ActionItemNotification[];
          const todoCount = filterActionItems(items, 50).length;
          setBadges((prev) => ({ ...prev, todo: todoCount }));
        })
      );

      return () => unsubs.forEach((fn) => fn());
    } catch (e) {
      console.error('Failed to subscribe to unread message count:', e);
      setBadges((prev) => ({
        ...prev,
        messages: 0,
        notifications: 0,
        offers: 0,
        supportTickets: 0,
      }));
      return;
    }
  }, [user?.uid, showAdminNav, isSuperAdmin, isAdmin]);

  useEffect(() => {
    if (!showAdminNav) return;
    try {
      const qPending = query(collection(db, 'listings'), where('status', '==', 'pending'));
      const unsub = onSnapshot(
        qPending,
        (snap) => setBadges((prev) => ({ ...prev, pendingApprovals: snap.size || 0 })),
        () => setBadges((prev) => ({ ...prev, pendingApprovals: 0 }))
      );
      return () => unsub();
    } catch {
      setBadges((prev) => ({ ...prev, pendingApprovals: 0 }));
      return;
    }
  }, [showAdminNav]);

  const navItems = useMemo(() => {
    return showAdminNav ? [...baseNavWithBadges, ...adminNavWithBadges] : baseNavWithBadges;
  }, [showAdminNav, baseNavWithBadges, adminNavWithBadges]);

  const mobileBottomNavItems = useMemo(() => {
    const byHref = new Map(navItems.map((n) => [n.href, n] as const));
    const pick = (href: string, fallback: SellerNavItem) => byHref.get(href) || fallback;
    const alertsTotal = badges.notifications + badges.messages + badges.offers;
    const items = [
      { href: '/', label: 'Home', icon: Home, shortLabel: 'Home' },
      { href: '/dashboard/menu', label: 'Dashboard', icon: LayoutGrid, shortLabel: 'Dashboard' },
      { href: '/dashboard/listings/new', label: 'Sell', icon: PlusCircle, shortLabel: 'Sell' },
      { ...pick('/browse', { href: '/browse', label: 'Buy', icon: Compass, shortLabel: 'Buy' }), label: 'Buy', shortLabel: 'Buy' },
      { ...pick('/dashboard/notifications', { href: '/dashboard/notifications', label: 'Notifications', icon: Bell, shortLabel: 'Notifications' }), badge: alertsTotal > 0 ? alertsTotal : undefined },
    ];
    return items.map((item) => ({ ...item, shortLabel: (item as { shortLabel?: string }).shortLabel ?? item.label }));
  }, [navItems, badges.notifications, badges.messages, badges.offers]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const isActive = useCallback((href: string) => {
    if (href === '/seller/overview') {
      return pathname === '/seller' || pathname === '/seller/overview' || pathname === '/dashboard';
    }
    return pathname?.startsWith(href);
  }, [pathname]);

  const handleSignOut = async () => {
    try {
      await signOutUser();
      router.push('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Protect all seller routes - require authentication
  return (
    <RequireAuth>
      <ProfileCompletionGate />
      <DashboardBadgesProvider value={badges}>
      <div
        className={cn(
          'bg-background flex flex-col md:flex-row relative',
          pathname?.startsWith('/dashboard/messages')
            ? 'fixed inset-0 h-[100dvh] max-h-[100dvh] min-h-0 overflow-hidden flex flex-col justify-start'
            : 'min-h-screen md:h-screen md:overflow-hidden'
        )}
        style={{ isolation: 'isolate' }}
      >
      {/* Desktop Sidebar - fixed on desktop to stay above content */}
      <aside
        className={cn(
          'hidden md:flex md:flex-col',
          sidebarCollapsed ? 'md:w-20' : 'md:w-64',
          'border-r border-border/50 bg-card',
          'dark:border-r dark:border-white/10 dark:shadow-[inset_-1px_0_0_0_rgba(255,255,255,0.05)]',
          'md:fixed md:inset-y-0 md:left-0'
        )}
        style={{ pointerEvents: 'auto', zIndex: 10000, isolation: 'isolate' }}
      >
            {/* Logo Section */}
            <div className={cn('flex items-center justify-between h-20 border-b border-border/50 dark:border-white/10', sidebarCollapsed ? 'px-2' : 'px-4')}>
              <Link href="/" prefetch className="flex items-center gap-3 group flex-shrink-0">
            <div className="relative h-10 w-10">
              <div className="relative h-full w-full">
                <div className="h-full w-full dark:hidden">
                  <Image
                    src="/images/Kudu.png"
                    alt="Agchange Logo"
                    width={40}
                    height={40}
                    className="h-full w-full object-contain opacity-90"
                    style={{
                      filter: 'brightness(0) saturate(100%) invert(31%) sepia(12%) saturate(1200%) hue-rotate(75deg) brightness(95%) contrast(90%)',
                    }}
                  />
                </div>
                <div 
                  className="hidden dark:block h-full w-full bg-primary"
                  style={{
                    maskImage: 'url(/images/Kudu.png)',
                    maskSize: 'contain',
                    maskRepeat: 'no-repeat',
                    maskPosition: 'center',
                    WebkitMaskImage: 'url(/images/Kudu.png)',
                    WebkitMaskSize: 'contain',
                    WebkitMaskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                  }}
                />
              </div>
            </div>
            {!sidebarCollapsed && (
              <div className="flex flex-col overflow-hidden">
                <BrandLogoText className="text-lg font-extrabold tracking-tight font-barletta-inline text-foreground leading-tight whitespace-nowrap" />
                <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                  Dashboard
                </span>
              </div>
            )}
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Navigation */}
        <nav className={cn('flex-1 overflow-y-auto py-4 space-y-1 we-scrollbar-hover', sidebarCollapsed ? 'px-2' : 'pl-0 pr-3')}>
          {showAdminNav && !sidebarCollapsed ? (
            <div className="space-y-2">
              <Collapsible open={userNavOpen} onOpenChange={setUserNavOpen}>
                <div className="px-3 pt-1">
                  <Separator className="mb-2" />
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'w-full flex items-center justify-between rounded-lg px-2 py-2',
                        'text-xs font-bold text-muted-foreground uppercase tracking-wider',
                        'hover:bg-background/50'
                      )}
                    >
                      <span>User</span>
                      <ChevronDown className={cn('h-4 w-4 transition-transform', userNavOpen ? 'rotate-180' : 'rotate-0')} />
                    </button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="space-y-1">
                  {baseNavWithBadges.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={true}
                        className={cn(
                          'flex items-center gap-3 pl-0 pr-3 py-2.5 rounded-lg text-base font-semibold',
                          'hover:bg-background/50',
                          'min-h-[44px]',
                          active && 'bg-primary/10 text-primary border-l-4 border-primary'
                        )}
                      >
                        <Icon className={cn('h-5 w-5 flex-shrink-0 ml-3', active && 'text-primary')} />
                        <span className="flex-1">{item.label}</span>
                        {item.badge && item.badge > 0 && (
                          <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-xs">
                            {item.badge}
                          </Badge>
                        )}
                      </Link>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>

              <Collapsible open={adminNavOpen} onOpenChange={setAdminNavOpen}>
                <div className="px-3 pt-1">
                  <Separator className="mb-2" />
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'w-full flex items-center justify-between rounded-lg px-2 py-2',
                        'text-xs font-bold text-muted-foreground uppercase tracking-wider',
                        'hover:bg-background/50'
                      )}
                    >
                      <span>Admin</span>
                      <ChevronDown className={cn('h-4 w-4 transition-transform', adminNavOpen ? 'rotate-180' : 'rotate-0')} />
                    </button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="space-y-1">
                  {adminNavWithBadges.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={true}
                        onClick={(e) => {
                          const pathnameBefore = typeof window !== 'undefined' ? window.location.pathname : '';
                          // Track navigation result after a short delay
                          setTimeout(() => {
                            const pathnameAfter = typeof window !== 'undefined' ? window.location.pathname : '';
                            const navigationOccurred = pathnameBefore !== pathnameAfter;
                            }, 100);
                        }}
                        className={cn(
                          'flex items-center gap-3 pl-0 pr-3 py-2.5 rounded-lg text-base font-semibold',
                          'hover:bg-background/50',
                          'min-h-[44px]',
                          active && 'bg-primary/10 text-primary border-l-4 border-primary'
                        )}
                      >
                        <Icon className={cn('h-5 w-5 flex-shrink-0 ml-3', active && 'text-primary')} />
                        <span className="flex-1">{item.label}</span>
                        {item.badge && item.badge > 0 && (
                          <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-xs">
                            {item.badge}
                          </Badge>
                        )}
                      </Link>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            </div>
          ) : (
            <div className={cn('space-y-1', sidebarCollapsed && 'flex flex-col items-center px-2')}>
              {baseNavWithBadges.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={true}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={cn(
                      'flex items-center rounded-lg text-base font-semibold',
                      'hover:bg-background/50',
                      sidebarCollapsed && 'relative',
                      sidebarCollapsed
                        ? 'justify-center p-2.5 min-h-[40px] w-10'
                        : 'gap-3 pl-0 pr-3 py-2.5 min-h-[44px] border-l-4 border-transparent',
                      active && 'bg-primary/10 text-primary',
                      active && !sidebarCollapsed && 'border-primary'
                    )}
                  >
                    <Icon className={cn('h-5 w-5 flex-shrink-0', !sidebarCollapsed && 'ml-3', active && 'text-primary')} />
                    {!sidebarCollapsed && <span className="flex-1">{item.label}</span>}
                    {!sidebarCollapsed && item.badge && item.badge > 0 && (
                      <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-xs">
                        {item.badge}
                      </Badge>
                    )}
                    {sidebarCollapsed && item.badge && item.badge > 0 && (
                      <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" aria-hidden />
                    )}
                  </Link>
                );
              })}
              {showAdminNav && (
                <>
                  <Separator className="my-2" />
                  {adminNavWithBadges.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch={true}
                        title={sidebarCollapsed ? item.label : undefined}
                        onClick={(e) => {
                          const pathnameBefore = typeof window !== 'undefined' ? window.location.pathname : '';
                          setTimeout(() => {
                            const pathnameAfter = typeof window !== 'undefined' ? window.location.pathname : '';
                            const navigationOccurred = pathnameBefore !== pathnameAfter;
                          }, 100);
                        }}
                        className={cn(
                          'flex items-center rounded-lg text-base font-semibold',
                          'hover:bg-background/50',
                          sidebarCollapsed && 'relative',
                          sidebarCollapsed
                            ? 'justify-center p-2.5 min-h-[40px] w-10'
                            : 'gap-3 pl-0 pr-3 py-2.5 min-h-[44px] border-l-4 border-transparent',
                          active && 'bg-primary/10 text-primary',
                          active && !sidebarCollapsed && 'border-primary'
                        )}
                      >
                        <Icon className={cn('h-5 w-5 flex-shrink-0', !sidebarCollapsed && 'ml-3', active && 'text-primary')} />
                        {!sidebarCollapsed && <span className="flex-1">{item.label}</span>}
                        {!sidebarCollapsed && item.badge && item.badge > 0 && (
                          <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-xs">
                            {item.badge}
                          </Badge>
                        )}
                        {sidebarCollapsed && item.badge && item.badge > 0 && (
                          <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" aria-hidden />
                        )}
                      </Link>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </nav>

        {/* User Account Section - Bottom of Sidebar */}
        <div className={cn('mt-auto border-t border-border/50 dark:border-white/10', sidebarCollapsed ? 'p-2' : 'p-4')}>
          {!sidebarCollapsed ? (
            <div className="space-y-2">
              <Link
                href="/dashboard/account"
                className="flex items-center gap-3 pl-0 pr-3 py-2 rounded-lg hover:bg-background/50 transition-colors group"
              >
                <User className="h-5 w-5 text-muted-foreground group-hover:text-foreground ml-3" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">
                    {user?.displayName || user?.email?.split('@')[0] || 'Account'}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {user?.email || 'View Profile'}
                  </div>
                </div>
              </Link>
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 pl-0 pr-3 py-2 h-auto ml-0"
                onClick={handleSignOut}
              >
                <LogOut className="h-5 w-5 text-muted-foreground ml-3" />
                <span className="text-sm font-semibold">Sign out</span>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Link
                href="/dashboard/account"
                className="p-2 rounded-lg hover:bg-background/50 transition-colors"
                title={user?.displayName || user?.email || 'Account'}
              >
                <User className="h-5 w-5 text-muted-foreground" />
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={handleSignOut}
                title="Sign out"
              >
                <LogOut className="h-5 w-5 text-muted-foreground" />
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between h-16 px-4 border-b border-border/50 bg-card dark:border-white/10">
        <Link href="/" className="flex items-center gap-2">
          <div className="relative h-8 w-8 flex-shrink-0">
            <span
              role="img"
              aria-label="Agchange"
              className="block h-full w-full bg-primary"
              style={{
                maskImage: 'url(/images/Kudu.png)',
                maskSize: 'contain',
                maskRepeat: 'no-repeat',
                maskPosition: 'center',
                WebkitMaskImage: 'url(/images/Kudu.png)',
                WebkitMaskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
              }}
            />
          </div>
          <span className="font-bold tracking-tight font-barletta-inline text-foreground dark:text-[hsl(37,27%,70%)]" style={{ fontSize: 'clamp(1.25rem, 5.5vw, 1.625rem)' }}>
            <BrandLogoText className="text-inherit" />
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="min-w-[40px] min-h-[40px] rounded-lg"
                aria-label="Account menu"
              >
                <User className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link href="/dashboard/account" className="flex items-center gap-2 cursor-pointer">
                  <Settings className="h-4 w-4" />
                  Account settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ThemeToggle />
          {/* Mobile: nav links live on Dashboard bottom-nav item (/dashboard/menu); no hamburger. Desktop: sidebar only. */}
        </div>
      </div>

      {/* Main Content Area - flex-1 takes remaining space, margin for fixed sidebar */}
      <div className={cn(
        'flex-1 flex flex-col min-w-0 min-h-0',
        sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'
      )}>
        {/* Page Content - no outer scroll on messages */}
        <main
          id="dashboard-main-scroll"
          className={cn(
            'flex-1 min-h-0 min-w-0 pb-20 md:pb-0 relative',
            pathname?.startsWith('/dashboard/messages') ? 'overflow-hidden' : 'overflow-y-auto we-scrollbar-hover'
          )}
          style={{ zIndex: 0 }}
        >
          <ProductionErrorBoundary>
            <div
              className={cn(
                'relative',
                pathname?.startsWith('/dashboard/messages') && 'h-full min-h-0 flex flex-col items-stretch'
              )}
              style={{ zIndex: 0 }}
            >
              {children}
            </div>
          </ProductionErrorBoundary>
        </main>

        {/* Mobile Bottom Nav (portaled, safe area, design tokens) */}
        <LayoutBottomNav items={mobileBottomNavItems} />
      </div>
      </div>
      </DashboardBadgesProvider>
    </RequireAuth>
  );
}

