'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
  LayoutDashboard,
  Package,
  DollarSign,
  Truck,
  MessageSquare,
  CreditCard,
  Award,
  Settings,
  Menu,
  X,
  PlusCircle,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  User,
  LogOut,
  ChevronDown,
  Heart,
  Shield,
  CheckCircle,
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
import { useAuth } from '@/hooks/use-auth';
import { useAdmin } from '@/hooks/use-admin';
import { signOutUser } from '@/lib/firebase/auth';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { subscribeToUnreadCountByType } from '@/lib/firebase/notifications';

interface SellerNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

// Base nav items (always visible)
const baseNavItems: SellerNavItem[] = [
  { href: '/seller/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/seller/listings', label: 'Listings', icon: Package },
  { href: '/dashboard/watchlist', label: 'Watchlist', icon: Heart },
  { href: '/seller/sales', label: 'Sales & Bids', icon: DollarSign },
  { href: '/dashboard/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/seller/logistics', label: 'Logistics', icon: Truck },
  { href: '/seller/messages', label: 'Messages', icon: MessageSquare },
  { href: '/seller/payouts', label: 'Payouts', icon: CreditCard },
  { href: '/seller/reputation', label: 'Reputation', icon: Award },
  { href: '/dashboard/account', label: 'Settings', icon: Settings },
];

// Admin nav items (only visible to admins)
const adminNavItems: SellerNavItem[] = [
  { href: '/dashboard/admin/listings', label: 'Approve Listings', icon: CheckCircle },
  { href: '/dashboard/admin/payouts', label: 'Manage Payouts', icon: Shield },
];

export default function SellerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState<number>(0);

  // Real-time unread badge for Messages (same source of truth as notifications)
  useEffect(() => {
    if (!user?.uid) {
      setUnreadMessagesCount(0);
      return;
    }

    try {
      const unsub = subscribeToUnreadCountByType(user.uid, 'message_received', (count) => {
        setUnreadMessagesCount(count || 0);
      });
      return () => unsub();
    } catch (e) {
      console.error('Failed to subscribe to unread message count:', e);
      setUnreadMessagesCount(0);
      return;
    }
  }, [user?.uid]);

  // Combine nav items - add admin items if user is admin
  const navItems = useMemo(() => {
    if (adminLoading) {
      return baseNavItems.map((item) =>
        item.href === '/seller/messages'
          ? { ...item, badge: unreadMessagesCount > 0 ? unreadMessagesCount : undefined }
          : item
      ); // Show base items while loading
    }

    const withBadges = baseNavItems.map((item) =>
      item.href === '/seller/messages'
        ? { ...item, badge: unreadMessagesCount > 0 ? unreadMessagesCount : undefined }
        : item
    );

    return isAdmin ? [...withBadges, ...adminNavItems] : withBadges;
  }, [isAdmin, adminLoading, unreadMessagesCount]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const isActive = useCallback((href: string) => {
    if (href === '/seller/overview') {
      return pathname === '/seller' || pathname === '/seller/overview';
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
              {baseNavItems.map((item) => {
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
          {!adminLoading && isAdmin && adminNavItems.length > 0 && (
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
              {adminNavItems.map((item) => {
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
                <nav className="flex-1 overflow-y-auto p-4 space-y-1">
                  {baseNavItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
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
                  
                  {/* Admin Section in Mobile Menu */}
                  {!adminLoading && isAdmin && adminNavItems.length > 0 && (
                    <>
                      <div className="px-3 py-2 mt-2">
                        <Separator className="mb-2" />
                        <div className="px-3 py-1.5">
                          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                            Admin
                          </span>
                        </div>
                      </div>
                      {adminNavItems.map((item) => {
                        const Icon = item.icon;
                        const active = isActive(item.href);
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMobileMenuOpen(false)}
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
                    </>
                  )}
                </nav>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Main Content Area */}
      <div className={cn(
        'flex-1 flex flex-col',
        'md:ml-64',
        sidebarCollapsed && 'md:ml-20'
      )}>
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
                  prefetch={true}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1',
                    'hover:bg-background/50 active:bg-background',
                    'min-h-[44px] touch-manipulation',
                    active && 'text-primary'
                  )}
                >
                  <div className="relative">
                    <Icon className={cn(
                      'h-5 w-5',
                      active ? 'text-primary' : 'text-muted-foreground'
                    )} />
                    {item.badge && item.badge > 0 && (
                      <Badge variant="destructive" className="absolute -top-2 -right-2 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                        {item.badge}
                      </Badge>
                    )}
                  </div>
                  <span className={cn(
                    'text-[10px] font-medium',
                    active ? 'text-primary' : 'text-muted-foreground'
                  )}>
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
