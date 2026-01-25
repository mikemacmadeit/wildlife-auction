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
import { RequireAuth } from '@/components/auth/RequireAuth';
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
import { collection, onSnapshot, query, where } from 'firebase/firestore';

interface SellerNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

// Base nav items (always visible) - handles both /dashboard/* and /seller/* routes
const baseNavItems: SellerNavItem[] = [
  { href: '/seller/overview', label: 'Overview', icon: LayoutDashboard },
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
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number>(0);
  const [unreadOffersCount, setUnreadOffersCount] = useState<number>(0);
  const [unreadAdminNotificationsCount, setUnreadAdminNotificationsCount] = useState<number>(0);
  const [unreadSupportTicketsCount, setUnreadSupportTicketsCount] = useState<number>(0);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);
  const [adminEverTrue, setAdminEverTrue] = useState(false);
  const [userNavOpen, setUserNavOpen] = useState(true);
  const [adminNavOpen, setAdminNavOpen] = useState(true);
  const [navPrefsLoaded, setNavPrefsLoaded] = useState(false);

  useEffect(() => {
    setAdminEverTrue(false);
    setPendingApprovalsCount(0);
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
        return { ...item, badge: unreadMessagesCount > 0 ? unreadMessagesCount : undefined };
      }
      if (item.href === '/dashboard/notifications') {
        return { ...item, badge: unreadNotificationsCount > 0 ? unreadNotificationsCount : undefined };
      }
      if (item.href === '/dashboard/bids-offers') {
        return { ...item, badge: unreadOffersCount > 0 ? unreadOffersCount : undefined };
      }
      return item;
    });
  }, [unreadMessagesCount, unreadNotificationsCount, unreadOffersCount]);

  const adminNavWithBadges = useMemo(() => {
    return adminNavItems.map((item) => {
      if (item.href === '/dashboard/admin/listings') {
        return { ...item, badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined };
      }
      if (item.href === '/dashboard/admin/notifications') {
        return {
          ...item,
          badge: isSuperAdmin && unreadAdminNotificationsCount > 0 ? unreadAdminNotificationsCount : undefined,
        };
      }
      if (item.href === '/dashboard/admin/support') {
        const badge = isAdmin && unreadSupportTicketsCount > 0 ? unreadSupportTicketsCount : undefined;
        return {
          ...item,
          badge,
        };
      }
      return item;
    });
  }, [pendingApprovalsCount, isSuperAdmin, unreadAdminNotificationsCount, isAdmin, unreadSupportTicketsCount]);

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
    if (!user?.uid) {
      setUnreadMessagesCount(0);
      setUnreadNotificationsCount(0);
      setUnreadOffersCount(0);
      setUnreadAdminNotificationsCount(0);
      setUnreadSupportTicketsCount(0);
      return;
    }

    try {
      const unsubs: Array<() => void> = [];
      unsubs.push(
        subscribeToUnreadCountByType(user.uid, 'message_received', (count) => {
          setUnreadMessagesCount(count || 0);
        })
      );
      unsubs.push(
        subscribeToUnreadCount(user.uid, (count) => {
          setUnreadNotificationsCount(count || 0);
        })
      );

      if (showAdminNav && isSuperAdmin) {
        unsubs.push(
          subscribeToUnreadCountByCategory(user.uid, 'admin', (count) => {
            setUnreadAdminNotificationsCount(count || 0);
          })
        );
      }

      if (showAdminNav && isAdmin) {
        // Subscribe to support ticket notifications
        unsubs.push(
          subscribeToUnreadCountByTypes(user.uid, ['admin_support_ticket_submitted'], (count) => {
            console.log('[Dashboard Layout] Support tickets notification count:', count);
            setUnreadSupportTicketsCount(count || 0);
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
          setUnreadOffersCount(count || 0);
        })
      );
      return () => unsubs.forEach((fn) => fn());
    } catch (e) {
      console.error('Failed to subscribe to unread message count:', e);
      setUnreadMessagesCount(0);
      setUnreadNotificationsCount(0);
      setUnreadOffersCount(0);
      setUnreadSupportTicketsCount(0);
      return;
    }
  }, [user?.uid, showAdminNav, isSuperAdmin, isAdmin]);

  useEffect(() => {
    if (!showAdminNav) return;
    try {
      const qPending = query(collection(db, 'listings'), where('status', '==', 'pending'));
      const unsub = onSnapshot(
        qPending,
        (snap) => setPendingApprovalsCount(snap.size || 0),
        () => setPendingApprovalsCount(0)
      );
      return () => unsub();
    } catch {
      setPendingApprovalsCount(0);
      return;
    }
  }, [showAdminNav]);

  const navItems = useMemo(() => {
    return showAdminNav ? [...baseNavWithBadges, ...adminNavWithBadges] : baseNavWithBadges;
  }, [showAdminNav, baseNavWithBadges, adminNavWithBadges]);

  const mobileBottomNavItems = useMemo(() => {
    const byHref = new Map(navItems.map((n) => [n.href, n] as const));
    const pick = (href: string, fallback: SellerNavItem) => byHref.get(href) || fallback;
    return [
      pick('/seller/overview', { href: '/seller/overview', label: 'Overview', icon: LayoutDashboard }),
      pick('/seller/listings', { href: '/seller/listings', label: 'Listings', icon: Package }),
      pick('/browse', { href: '/browse', label: 'Browse', icon: Compass }),
      pick('/dashboard/messages', { href: '/dashboard/messages', label: 'Messages', icon: MessageSquare }),
      pick('/dashboard/notifications', { href: '/dashboard/notifications', label: 'Alerts', icon: Bell }),
    ];
  }, [navItems]);

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
      <div className="min-h-screen bg-background flex flex-col md:flex-row relative" style={{ isolation: 'isolate' }}>
      {/* Desktop Sidebar - fixed on desktop to stay above content */}
      <aside
        className={cn(
          'hidden md:flex md:flex-col',
          sidebarCollapsed ? 'md:w-20' : 'md:w-64',
          'border-r border-border/50 bg-card',
          'md:fixed md:inset-y-0 md:left-0'
        )}
        style={{ pointerEvents: 'auto', zIndex: 10000, isolation: 'isolate' }}
      >
            {/* Logo Section */}
            <div className="flex items-center justify-between h-20 px-4 border-b border-border/50">
              <Link href="/" prefetch className="flex items-center gap-3 group flex-shrink-0">
            <div className="relative h-10 w-10">
              <div className="relative h-full w-full">
                <div className="h-full w-full dark:hidden">
                  <Image
                    src="/images/Kudu.png"
                    alt="Wildlife Exchange Logo"
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
                <span className="text-lg font-extrabold text-foreground leading-tight whitespace-nowrap">
                  Wildlife Exchange
                </span>
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
        <nav className="flex-1 overflow-y-auto pl-0 pr-3 py-4 space-y-1">
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
            <div className="space-y-1">
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
                </>
              )}
            </div>
          )}
        </nav>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between h-16 px-4 border-b border-border/50 bg-card">
        <Link href="/" className="flex items-center gap-2">
          <div className="relative h-8 w-8">
            <Image
              src="/images/Kudu.png"
              alt="Wildlife Exchange"
              width={32}
              height={32}
              className="h-full w-full object-contain"
            />
          </div>
          <span className="text-lg font-bold">Wildlife Exchange</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0">
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between p-4 border-b border-border/50">
                  <span className="text-lg font-bold">Menu</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                <nav className="flex-1 overflow-y-auto p-4 space-y-2">
                  {showAdminNav ? (
                    <>
                      <div className="px-3 pt-1 mb-2">
                        <Separator />
                        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-2 mb-1">
                          User
                        </div>
                      </div>
                      {baseNavWithBadges.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            prefetch={true}
                            onClick={() => setMobileMenuOpen(false)}
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
                      <div className="px-3 pt-1 mt-4 mb-2">
                        <Separator />
                        <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-2 mb-1">
                          Admin
                        </div>
                      </div>
                      {adminNavWithBadges.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            prefetch={true}
                            onClick={(e) => {
                              setMobileMenuOpen(false);
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
                    </>
                  ) : (
                    <div className="space-y-1">
                      {baseNavWithBadges.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            prefetch={true}
                            onClick={() => setMobileMenuOpen(false)}
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
                    </div>
                  )}
                </nav>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Main Content Area - flex-1 takes remaining space, margin for fixed sidebar */}
      <div className={cn(
        'flex-1 flex flex-col min-w-0 min-h-0',
        sidebarCollapsed ? 'md:ml-20' : 'md:ml-64'
      )}>
        {/* Page Content */}
        <main className="flex-1 overflow-y-auto min-h-0 min-w-0 pb-20 md:pb-0 relative" style={{ zIndex: 0 }}>
          <ProductionErrorBoundary>
            <div className="relative" style={{ zIndex: 0 }}>
              {children}
            </div>
          </ProductionErrorBoundary>
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 bg-card/80 backdrop-blur-md">
          <div className="grid grid-cols-5 h-16">
            {mobileBottomNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1',
                    'hover:bg-background/50 active:bg-background',
                    'min-h-[44px] touch-manipulation',
                    active && 'text-primary'
                  )}
                >
                  <div className="relative">
                    <Icon
                      className={cn('h-5 w-5', active ? 'text-primary' : 'text-muted-foreground')}
                    />
                    {item.badge && item.badge > 0 && (
                      <Badge
                        variant="destructive"
                        className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center text-[10px]"
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-[10px] font-medium',
                      active ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    {item.label.split(' ')[0]}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
      </div>
    </RequireAuth>
  );
}

