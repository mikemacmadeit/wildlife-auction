'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
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
  Home,
  Heart,
  Shield,
  CheckCircle,
  HeartPulse,
  Mail,
  Bell,
  HelpCircle,
  LifeBuoy,
  Users,
  Compass,
  Handshake,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { LoadingSkeleton } from '@/components/ui/LoadingSkeleton';
import { QuickSetupTour } from '@/components/onboarding/QuickSetupTour';
import { useQuickSetupTour } from '@/hooks/use-quick-setup-tour';
import { useAdmin } from '@/hooks/use-admin';
import { useAuth } from '@/hooks/use-auth';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { SafeImage } from '@/components/shared/SafeImage';
import {
  subscribeToUnreadCount,
  subscribeToUnreadCountByType,
  subscribeToUnreadCountByTypes,
} from '@/lib/firebase/notifications';
import type { NotificationType } from '@/lib/types';

interface DashboardNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

const baseNavItems: DashboardNavItem[] = [
  { href: '/dashboard/orders', label: 'Overview', icon: LayoutDashboard },
  { href: '/browse', label: 'Browse', icon: Search },
  { href: '/dashboard/listings', label: 'My Listings', icon: Package },
  { href: '/dashboard/offers', label: 'My Offers', icon: Handshake },
  { href: '/dashboard/bids-offers', label: 'Bids & Offers', icon: Gavel },
  { href: '/dashboard/messages', label: 'Messages', icon: MessageSquare },
  { href: '/dashboard/watchlist', label: 'Watchlist', icon: Heart },
  { href: '/dashboard/notifications', label: 'Notifications', icon: Bell },
  { href: '/dashboard/account', label: 'Settings', icon: Settings },
  { href: '/dashboard/support', label: 'Support', icon: LifeBuoy },
];

const adminNavItems: DashboardNavItem[] = [
  { href: '/dashboard/admin/users', label: 'Users', icon: Users },
  { href: '/dashboard/admin/listings', label: 'Listings', icon: Package },
  { href: '/dashboard/admin/ops', label: 'Operations', icon: Shield },
  { href: '/dashboard/admin/reconciliation', label: 'Reconciliation', icon: CheckCircle },
  { href: '/dashboard/admin/payouts', label: 'Payouts', icon: DollarSign },
  { href: '/dashboard/admin/revenue', label: 'Revenue', icon: Award },
  { href: '/dashboard/admin/compliance', label: 'Compliance', icon: Shield },
  { href: '/dashboard/admin/support', label: 'Support Admin', icon: LifeBuoy },
  { href: '/dashboard/admin/messages', label: 'Message Admin', icon: MessageSquare },
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
  const { isAdmin, isSuperAdmin, loading: adminLoading, role } = useAdmin();
  const { shouldShow: showTour, markDismissed, markCompleted } = useQuickSetupTour();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number>(0);
  const [unreadOffersCount, setUnreadOffersCount] = useState<number>(0);

  // Admin nav state - show immediately if admin, don't wait for loading
  // This prevents tabs from being hidden during initial load
  const showAdminNav = Boolean(isAdmin || isSuperAdmin);

  // Add sign out handler
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push('/');
    } catch (error) {
      // Sign out error - silently fail
    }
  };

  // Check if a navigation item is active
  const isActive = useCallback((href: string) => {
    if (!pathname) return false;
    if (href === '/dashboard/orders') {
      return pathname === '/dashboard' || pathname === '/dashboard/' || pathname === '/dashboard/orders';
    }
    if (href.startsWith('/dashboard')) {
      return pathname.startsWith(href);
    }
    // For non-dashboard routes (like /browse), exact match
    return pathname === href;
  }, [pathname]);

  // Add badges to nav items - use undefined (not 0) when no count
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
    return adminNavItems.map(item => ({
      ...item,
      badge: undefined // Admin nav items don't have badges
    }));
  }, []);

  // Real-time unread badge subscriptions
  useEffect(() => {
    if (!user?.uid) {
      setUnreadMessagesCount(0);
      setUnreadNotificationsCount(0);
      setUnreadOffersCount(0);
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
      
      // Bids & Offers badge: count offer-related notifications
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
      // Failed to subscribe to unread counts - reset to 0
      setUnreadMessagesCount(0);
      setUnreadNotificationsCount(0);
      setUnreadOffersCount(0);
      return;
    }
  }, [user?.uid]);

  // Don't show dashboard layout for listing creation page
  if (pathname === '/dashboard/listings/new') {
    return (
      <RequireAuth>
        {children}
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
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
              <div className="relative h-10 w-10 flex-shrink-0">
                <div className="relative h-full w-full">
                  <div className="h-full w-full dark:hidden">
                    <SafeImage
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

          {/* Navigation - Always render immediately, no conditional hiding */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
            {baseNavWithBadges.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold min-w-0 border-l-4 border-transparent',
                    'hover:bg-background/50 hover:text-foreground transition-all duration-200 ease-in-out',
                    'min-h-[44px]',
                    active && 'bg-primary/10 text-primary border-primary'
                  )}
                >
                  <Icon className={cn('h-5 w-5 flex-shrink-0', active && 'text-primary')} />
                  {!sidebarCollapsed && (
                    <span className="flex-1 min-w-0 flex items-center justify-between gap-2">
                      <span className="truncate whitespace-nowrap">{item.label}</span>
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
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold min-w-0 border-l-4 border-transparent',
                        'hover:bg-background/50 hover:text-foreground transition-all duration-200 ease-in-out',
                        'min-h-[44px]',
                        active && 'bg-primary/10 text-primary border-primary'
                      )}
                    >
                      <Icon className={cn('h-5 w-5 flex-shrink-0', active && 'text-primary')} />
                      {!sidebarCollapsed && (
                        <span className="flex-1 min-w-0 flex items-center justify-between gap-2">
                          <span className="truncate whitespace-nowrap">{item.label}</span>
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
            <Link href="/" className="flex items-center gap-3 group">
              <div
                aria-hidden="true"
                className="h-9 w-9 opacity-95 group-hover:opacity-100 transition-opacity"
                style={{
                  backgroundColor: 'hsl(var(--primary))',
                  WebkitMaskImage: "url('/images/Kudu.png')",
                  maskImage: "url('/images/Kudu.png')",
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskPosition: 'center',
                  maskPosition: 'center',
                  WebkitMaskSize: 'contain',
                  maskSize: 'contain',
                }}
              />
              <div className="flex flex-col">
                <span className="text-base font-extrabold text-foreground leading-tight group-hover:text-primary transition-colors">
                  Wildlife Exchange
                </span>
                <span className="text-[10px] text-muted-foreground font-medium">
                  Dashboard
                </span>
              </div>
            </Link>
            <div className="flex items-center gap-1">
              <Link href="/" prefetch={false}>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Home">
                  <Home className="h-5 w-5" />
                </Button>
              </Link>
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
                      <div className="space-y-1">
                        {[...baseNavWithBadges, ...(showAdminNav ? adminNavWithBadges : [])].map((item) => {
                          const Icon = item.icon;
                          const active = isActive(item.href);
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              prefetch={false}
                              onClick={() => setMobileMenuOpen(false)}
                              className={cn(
                                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-base font-semibold min-w-0 border-l-4 border-transparent',
                                'hover:bg-background/50 transition-all duration-200 ease-in-out',
                                'min-h-[44px]',
                                active && 'bg-primary/10 text-primary border-primary'
                              )}
                            >
                              <Icon className={cn('h-5 w-5 flex-shrink-0', active && 'text-primary')} />
                              <span className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                <span className="truncate whitespace-nowrap">{item.label}</span>
                                {item.badge && item.badge > 0 && (
                                  <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-xs">
                                    {item.badge}
                                  </Badge>
                                )}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </nav>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
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
          <main className="flex-1 overflow-y-auto transition-all duration-200 ease-in-out">
            <div className="min-h-full">
              <Suspense fallback={<div className="p-6"><LoadingSkeleton height="h-64" /></div>}>
                {children}
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </RequireAuth>
  );
}