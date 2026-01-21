'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  LayoutDashboard,
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
  Home,
  Heart,
  Shield,
  CheckCircle,
  HeartPulse,
  Mail,
  Bell,
  HelpCircle,
  Users,
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
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { subscribeToUnreadCount, subscribeToUnreadCountByType, subscribeToUnreadCountByTypes } from '@/lib/firebase/notifications';
import type { NotificationType } from '@/lib/types';

interface DashboardNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

// Base nav items (always visible)
const baseNavItems: DashboardNavItem[] = [
  { href: '/seller/overview', label: 'Overview', icon: LayoutDashboard },
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
  { href: '/dashboard/account', label: 'Settings', icon: Settings },
];

// Admin nav items (only visible to admins)
const adminNavItems: DashboardNavItem[] = [
  { href: '/dashboard/admin/users', label: 'Users', icon: Users },
  { href: '/dashboard/admin/listings', label: 'Approve Listings', icon: CheckCircle },
  { href: '/dashboard/admin/ops', label: 'Admin Ops', icon: Shield },
  { href: '/dashboard/admin/compliance', label: 'Compliance', icon: Shield },
  { href: '/dashboard/admin/reconciliation', label: 'Reconciliation', icon: Search },
  { href: '/dashboard/admin/revenue', label: 'Revenue', icon: DollarSign },
  { href: '/dashboard/admin/messages', label: 'Flagged Messages', icon: MessageSquare },
  { href: '/dashboard/admin/support', label: 'Support', icon: HelpCircle },
  { href: '/dashboard/admin/email-templates', label: 'Email Templates', icon: Mail },
  { href: '/dashboard/admin/notifications', label: 'Notifications', icon: Bell },
  { href: '/dashboard/admin/health', label: 'System Health', icon: HeartPulse },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { isAdmin, loading: adminLoading, role } = useAdmin();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number>(0);
  const [unreadOffersCount, setUnreadOffersCount] = useState<number>(0);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);
  const [userNavOpen, setUserNavOpen] = useState(true);
  const [adminNavOpen, setAdminNavOpen] = useState(true);
  const [navPrefsLoaded, setNavPrefsLoaded] = useState(false);

  // IMPORTANT: Don't gate admin nav rendering on adminLoading/authLoading.
  // We only show admin items once isAdmin flips true, and we keep them visible thereafter.
  const showAdminNav = isAdmin === true;

  const baseNavWithBadges = useMemo(() => {
    return baseNavItems.map((item) => {
      if (item.href === '/seller/messages') {
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
      return item;
    });
  }, [pendingApprovalsCount]);

  // Real-time badges (unread messages/notifications + pending approvals)
  useEffect(() => {
    if (!user?.uid) {
      setUnreadMessagesCount(0);
      setUnreadNotificationsCount(0);
      setUnreadOffersCount(0);
      setPendingApprovalsCount(0);
      return;
    }

    const unsubs: Array<() => void> = [];

    // 1) Messages badge: unread MESSAGE notifications only (keeps sidebar consistent with Messages page)
    try {
      unsubs.push(
        subscribeToUnreadCountByType(user.uid, 'message_received', (count) => {
          setUnreadMessagesCount(count || 0);
        })
      );
    } catch (e) {
      console.error('Failed to subscribe to unread notifications count:', e);
    }

    // 1b) Notifications badge: all unread (includes messages; acceptable for now)
    try {
      unsubs.push(
        subscribeToUnreadCount(user.uid, (count) => {
          setUnreadNotificationsCount(count || 0);
        })
      );
    } catch (e) {
      console.error('Failed to subscribe to unread total notifications count:', e);
    }

    // 1c) Bids & Offers badge: unread bid/offer notifications (eBay-like: "you have activity")
    try {
      const bidOfferTypes: NotificationType[] = [
        // bids (from auction events)
        'bid_outbid',
        'bid_received',
        // offers
        'offer_received',
        'offer_countered',
        'offer_accepted',
        'offer_declined',
        'offer_expired',
      ];
      unsubs.push(
        subscribeToUnreadCountByTypes(user.uid, bidOfferTypes, (count) => {
          setUnreadOffersCount(count || 0);
        })
      );
    } catch (e) {
      console.error('Failed to subscribe to unread offer notifications count:', e);
    }

    // 2) Admin badge: pending listing approvals (drops as listings are approved/rejected)
    if (showAdminNav) {
      try {
        const qPending = query(collection(db, 'listings'), where('status', '==', 'pending'));
        unsubs.push(
          onSnapshot(
            qPending,
            (snap) => setPendingApprovalsCount(snap.size || 0),
            (err) => {
              console.error('Failed to subscribe to pending listings:', err);
              setPendingApprovalsCount(0);
            }
          )
        );
      } catch (e) {
        console.error('Failed to subscribe to pending listings:', e);
      }
    }

    return () => {
      unsubs.forEach((fn) => {
        try {
          fn();
        } catch {}
      });
    };
  }, [user?.uid, showAdminNav]);

  // Combine nav items - add admin items if user is admin
  // Use useMemo to ensure it updates when isAdmin changes
  const navItems = useMemo(() => {
    // Always include base items
    const items = baseNavWithBadges.slice();
    
    // Add admin items as soon as we know the user is admin.
    // Do NOT wait on adminLoading here; it can lag behind isAdmin due to authLoading.
    if (showAdminNav) {
      items.push(...adminNavWithBadges);
    }
    
    return items;
  }, [showAdminNav, baseNavWithBadges, adminNavWithBadges]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  // Persist admin-only nav grouping collapse state (per device)
  useEffect(() => {
    if (!showAdminNav) return;
    if (typeof window === 'undefined') return;
    try {
      const rawUser = window.localStorage.getItem('we:nav:v1:dashboard:user_open');
      const rawAdmin = window.localStorage.getItem('we:nav:v1:dashboard:admin_open');
      if (rawUser === '0' || rawUser === '1') setUserNavOpen(rawUser === '1');
      if (rawAdmin === '0' || rawAdmin === '1') setAdminNavOpen(rawAdmin === '1');
    } catch {
      // ignore
    }
    // Mark loaded so we don't overwrite saved prefs with defaults on first admin render.
    setNavPrefsLoaded(true);
    // only run when admin nav becomes available
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdminNav]);

  useEffect(() => {
    if (!showAdminNav) return;
    if (!navPrefsLoaded) return;
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('we:nav:v1:dashboard:user_open', userNavOpen ? '1' : '0');
      window.localStorage.setItem('we:nav:v1:dashboard:admin_open', adminNavOpen ? '1' : '0');
    } catch {
      // ignore
    }
  }, [showAdminNav, navPrefsLoaded, userNavOpen, adminNavOpen]);

  const isActive = useCallback(
    (href: string) => {
      if (href === '/seller/overview') {
        return pathname === '/seller' || pathname === '/seller/overview' || pathname === '/dashboard';
      }
      return pathname?.startsWith(href);
    },
    [pathname]
  );

  const handleSignOut = async () => {
    try {
      await signOutUser();
      router.push('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Workaround: some environments intermittently fail to fetch the Next.js RSC payload during client navigation,
  // which spams console with "Failed to fetch RSC payload ... Falling back to browser navigation".
  // Since the runtime already falls back, we proactively do a hard navigation for dashboard sidebar links.
  const hardNavigate = useCallback((e: any, href: string) => {
    try {
      if (!href) return;
      // Allow opening in new tab/window or with modifier keys.
      if (e?.defaultPrevented) return;
      if (e?.button !== undefined && e.button !== 0) return;
      if (e?.metaKey || e?.ctrlKey || e?.shiftKey || e?.altKey) return;
      e?.preventDefault?.();
      if (typeof window !== 'undefined') window.location.href = href;
    } catch {
      // best-effort
    }
  }, []);

  // Don't show dashboard layout for listing creation page
  if (pathname === '/dashboard/listings/new') {
    return (
      <RequireAuth>
        <ProfileCompletionGate />
        {children}
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <ProfileCompletionGate />
      <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Desktop Sidebar */}
      <aside
        className={cn(
          'hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 md:left-0 md:z-40',
          'border-r border-border/50 bg-card',
          sidebarCollapsed && 'md:w-20'
        )}
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
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {/* Admin-only: split into collapsible "User" + "Admin" sections to keep the toolbar compact */}
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
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold',
                          'hover:bg-background/50 hover:text-foreground',
                          'min-h-[44px]',
                          active && 'bg-primary/10 text-primary border-l-4 border-primary'
                        )}
                      >
                        <Icon className={cn('h-5 w-5 flex-shrink-0', active && 'text-primary')} />
                        <span className="flex-1 flex items-center justify-between">
                          <span>{item.label}</span>
                          {item.badge && item.badge > 0 && (
                            <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-xs font-semibold">
                              {item.badge}
                            </Badge>
                          )}
                        </span>
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
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold',
                          'hover:bg-background/50 hover:text-foreground',
                          'min-h-[44px]',
                          active && 'bg-primary/10 text-primary border-l-4 border-primary'
                        )}
                      >
                        <Icon className={cn('h-5 w-5 flex-shrink-0', active && 'text-primary')} />
                        <span className="flex-1 flex items-center justify-between">
                          <span>{item.label}</span>
                          {item.badge && item.badge > 0 && (
                            <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-xs font-semibold">
                              {item.badge}
                            </Badge>
                          )}
                        </span>
                      </Link>
                    );
                  })}
                </CollapsibleContent>
              </Collapsible>
            </div>
          ) : (
            <>
              {baseNavWithBadges.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={true}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold',
                      'hover:bg-background/50 hover:text-foreground',
                      'min-h-[44px]',
                      active && 'bg-primary/10 text-primary border-l-4 border-primary'
                    )}
                  >
                    <Icon className={cn('h-5 w-5 flex-shrink-0', active && 'text-primary')} />
                    {!sidebarCollapsed && (
                      <span className="flex-1 flex items-center justify-between">
                        <span>{item.label}</span>
                        {item.badge && item.badge > 0 && (
                          <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-xs font-semibold">
                            {item.badge}
                          </Badge>
                        )}
                      </span>
                    )}
                  </Link>
                );
              })}
          
          {/* Admin Section */}
          {showAdminNav && (
            <>
              {!sidebarCollapsed && (
                <div className="px-3 py-2 mt-2">
                  <Separator className="mb-2" />
                  <div className="px-3 py-1.5">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Admin
                    </span>
                  </div>
                </div>
              )}
              {sidebarCollapsed && (
                <div className="px-3 py-2 mt-2">
                  <Separator />
                </div>
              )}
              {adminNavWithBadges.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={true}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold',
                      'hover:bg-background/50 hover:text-foreground',
                      'min-h-[44px]',
                      active && 'bg-primary/10 text-primary border-l-4 border-primary'
                    )}
                  >
                    <Icon className={cn('h-5 w-5 flex-shrink-0', active && 'text-primary')} />
                    {!sidebarCollapsed && (
                      <span className="flex-1 flex items-center justify-between">
                        <span>{item.label}</span>
                        {item.badge && item.badge > 0 && (
                          <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-xs font-semibold">
                            {item.badge}
                          </Badge>
                        )}
                      </span>
                    )}
                  </Link>
                );
              })}
            </>
          )}
            </>
          )}
        </nav>

        {/* Theme Toggle */}
        <div className="px-3 pb-3 border-t border-border/50 pt-3">
          <div className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg',
            'min-h-[44px]',
            sidebarCollapsed && 'justify-center'
          )}>
            {!sidebarCollapsed && (
              <span className="text-sm font-semibold text-muted-foreground whitespace-nowrap">
                Theme
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>

        {/* User Profile Section */}
        <div className="p-3 border-t border-border/50">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className={cn(
                  'w-full min-h-[44px] font-semibold gap-2 justify-start',
                  sidebarCollapsed && 'px-0 justify-center'
                )}
              >
                <User className="h-5 w-5 flex-shrink-0" />
                {!sidebarCollapsed && (
                  <div className="flex flex-col items-start flex-1 min-w-0">
                    <span className="text-sm font-semibold truncate w-full">
                      {user?.displayName || user?.email?.split('@')[0] || 'Account'}
                    </span>
                    {user?.email && (
                      <span className="text-xs text-muted-foreground truncate w-full">
                        {user.email}
                      </span>
                    )}
                  </div>
                )}
                {!sidebarCollapsed && <ChevronDown className="h-4 w-4 flex-shrink-0 opacity-50" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start" className="w-56">
              {user ? (
                <>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {user.displayName || 'User'}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground truncate">
                        {user.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/dashboard/account" className="flex items-center gap-2 cursor-pointer">
                      <Settings className="h-4 w-4" />
                      Account Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleSignOut}
                    className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem asChild>
                    <Link href="/register" className="flex items-center gap-2 cursor-pointer">
                      <User className="h-4 w-4" />
                      Sign Up
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/login" className="flex items-center gap-2 cursor-pointer">
                      <User className="h-4 w-4" />
                      Sign In
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <div className="md:hidden sticky top-0 z-50 border-b border-border/50 bg-card">
        <div className="flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-3">
            <Image
              src="/images/Kudu.png"
              alt="Wildlife Exchange"
              width={36}
              height={36}
              className="h-9 w-9 object-contain opacity-90"
              priority
              loading="eager"
              style={{
                filter: 'brightness(0) saturate(100%) invert(31%) sepia(12%) saturate(1200%) hue-rotate(75deg) brightness(95%) contrast(90%)',
              }}
            />
            <div className="flex flex-col">
              <span className="text-base font-extrabold text-foreground leading-tight">
                Wildlife Exchange
              </span>
              <span className="text-[10px] text-muted-foreground font-medium">
                Dashboard
              </span>
            </div>
          </div>
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0">
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between p-4 border-b border-border/50">
                  <span className="text-lg font-extrabold text-foreground">Menu</span>
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
                      <Collapsible open={userNavOpen} onOpenChange={setUserNavOpen}>
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-bold text-muted-foreground uppercase tracking-wider hover:bg-background/50"
                          >
                            <span>User</span>
                            <ChevronDown className={cn('h-4 w-4 transition-transform', userNavOpen ? 'rotate-180' : 'rotate-0')} />
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-1 pt-1">
                          {baseNavWithBadges.map((item) => {
                            const Icon = item.icon;
                            const active = isActive(item.href);
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                prefetch={false}
                                onClick={(e) => {
                                  setMobileMenuOpen(false);
                                  hardNavigate(e, item.href);
                                }}
                                className={cn(
                                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-base font-semibold',
                                  'hover:bg-background/50',
                                  'min-h-[44px]',
                                  active && 'bg-primary/10 text-primary border-l-4 border-primary'
                                )}
                              >
                                <Icon className={cn('h-5 w-5 flex-shrink-0', active && 'text-primary')} />
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
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-xs font-bold text-muted-foreground uppercase tracking-wider hover:bg-background/50"
                          >
                            <span>Admin</span>
                            <ChevronDown className={cn('h-4 w-4 transition-transform', adminNavOpen ? 'rotate-180' : 'rotate-0')} />
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-1 pt-1">
                          {adminNavWithBadges.map((item) => {
                            const Icon = item.icon;
                            const active = isActive(item.href);
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                prefetch={false}
                                onClick={(e) => {
                                  setMobileMenuOpen(false);
                                  hardNavigate(e, item.href);
                                }}
                                className={cn(
                                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-base font-semibold',
                                  'hover:bg-background/50',
                                  'min-h-[44px]',
                                  active && 'bg-primary/10 text-primary border-l-4 border-primary'
                                )}
                              >
                                <Icon className={cn('h-5 w-5 flex-shrink-0', active && 'text-primary')} />
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
                    </>
                  ) : (
                    <div className="space-y-1">
                      {navItems.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            prefetch={false}
                            onClick={(e) => {
                              setMobileMenuOpen(false);
                              hardNavigate(e, item.href);
                            }}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-base font-semibold',
                              'hover:bg-background/50',
                              'min-h-[44px]',
                              active && 'bg-primary/10 text-primary border-l-4 border-primary'
                            )}
                          >
                            <Icon className={cn('h-5 w-5 flex-shrink-0', active && 'text-primary')} />
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

      {/* Main Content Area */}
      <div
        className={cn(
          'flex-1 flex flex-col',
          'md:ml-64',
          sidebarCollapsed && 'md:ml-20'
        )}
      >
        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-card">
          <div className="grid grid-cols-5 h-16">
            {navItems.slice(0, 5).map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1',
                    'hover:bg-background/50 active:bg-background',
                    'min-h-[44px] touch-manipulation',
                    active && 'text-primary'
                  )}
                  onClick={(e) => hardNavigate(e, item.href)}
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
