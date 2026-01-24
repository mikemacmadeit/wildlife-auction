'use client';

import Link from 'next/link';
import { SafeImage } from '@/components/shared/SafeImage';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Menu, User, PlusCircle, ChevronDown, LogIn, LayoutDashboard, ShoppingBag, LogOut, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useAdmin } from '@/hooks/use-admin';
import { signOutUser } from '@/lib/firebase/auth';
import { useToast } from '@/hooks/use-toast';
import { NotificationsBell } from '@/components/navigation/NotificationsBell';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);

  // Real-time: show admin approval workload on the global navbar bell
  // so admins can see it while browsing (not just inside /dashboard).
  useEffect(() => {
    if (!user?.uid) {
      setPendingApprovalsCount(0);
      return;
    }
    if (adminLoading) return;
    if (!isAdmin) {
      setPendingApprovalsCount(0);
      return;
    }

    try {
      const qPending = query(collection(db, 'listings'), where('status', '==', 'pending'));
      return onSnapshot(
        qPending,
        (snap) => setPendingApprovalsCount(snap.size || 0),
        () => setPendingApprovalsCount(0)
      );
    } catch {
      setPendingApprovalsCount(0);
      return;
    }
  }, [adminLoading, isAdmin, user?.uid]);

  const handleSignOut = async () => {
    try {
      await signOutUser();
      toast({
        title: 'Signed out',
        description: 'You have been successfully signed out.',
      });
      router.push('/');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to sign out. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/browse', label: 'Browse' },
    { href: '/how-it-works', label: 'How It Works' },
    { href: '/field-notes', label: 'Field Notes' },
  ];

  const howItWorksItems = [
    { href: '/how-it-works', label: 'Overview' },
    { href: '/how-it-works/plans', label: 'Seller Tiers' },
    { href: '/how-it-works/trust', label: 'Trust & Compliance' },
  ];

  return (
    <motion.nav
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80 shadow-sm"
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid grid-cols-[auto_1fr_auto] lg:grid-cols-[1fr_auto_1fr] h-20 items-center gap-4">
          {/* Logo Section - Left side */}
          <Link href="/" className="flex items-center gap-2 md:gap-3 group flex-shrink-0 min-w-0 z-10" aria-label="Wildlife Exchange">
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 bg-primary/10 blur-xl rounded-full group-hover:bg-primary/20 transition-colors" />
              <div className="relative h-9 w-9 md:h-10 md:w-10 lg:h-11 lg:w-11 group-hover:scale-110 transition-transform">
                {/* Light mode: Olivewood color using mask */}
                <div 
                  className="h-full w-full dark:hidden"
                  style={{
                    backgroundColor: 'hsl(75 8% 13%)',
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
                {/* Dark mode: Beige sand color using mask */}
                <div 
                  className="hidden dark:block h-full w-full"
                  style={{
                    backgroundColor: 'hsl(37 27% 70%)',
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
            <span className="sr-only">Wildlife Exchange</span>
            {user && (
              <span className="hidden md:inline text-base sm:text-lg md:text-xl lg:text-2xl font-extrabold tracking-tight font-barletta-inline text-[hsl(75,8%,13%)] dark:text-[hsl(37,27%,70%)] truncate max-w-[170px] sm:max-w-none">
                Wildlife Exchange
              </span>
            )}
          </Link>

          {/* Desktop Navigation - Centered (only on large screens) */}
          <nav className="hidden lg:flex items-center justify-center gap-0.5 xl:gap-1 min-w-0 px-2 xl:px-4 overflow-hidden">
            <div className="flex items-center gap-0.5 xl:gap-1 flex-wrap justify-center max-w-full">
              {navLinks.map((link) => {
                const isActive = pathname === link.href || (link.href !== '/' && pathname?.startsWith(link.href + '/'));

                if (link.href === '/how-it-works') {
                  const isHowActive = pathname === '/how-it-works' || pathname?.startsWith('/how-it-works/');
                  return (
                    <DropdownMenu key={link.href}>
                      <DropdownMenuTrigger asChild>
                        <button
                          className={cn(
                            'px-2 xl:px-3 py-2.5 rounded-lg text-sm xl:text-base font-semibold transition-all duration-200 relative whitespace-nowrap flex-shrink-0',
                            'hover:bg-muted/50 hover:text-foreground inline-flex items-center gap-1.5',
                            isHowActive && 'text-primary dark:text-[hsl(37,27%,70%)]'
                          )}
                          type="button"
                        >
                          <span className="relative z-10">{link.label}</span>
                          <ChevronDown className="h-4 w-4 opacity-60" />
                          {isHowActive && (
                            <motion.div
                              layoutId="activeTab"
                              className="absolute bottom-1 left-0 right-0 h-0.5 bg-primary dark:bg-[hsl(37,27%,70%)] rounded-full"
                              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                            />
                          )}
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="center" className="w-56">
                        {howItWorksItems.map((it) => (
                          <DropdownMenuItem key={it.href} asChild>
                            <Link href={it.href} className="cursor-pointer">
                              {it.label}
                            </Link>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                }

                const isFieldNotes = link.href === '/field-notes';
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'px-2 xl:px-3 py-2.5 rounded-lg text-sm xl:text-base font-semibold transition-all duration-200 relative whitespace-nowrap flex-shrink-0',
                      'hover:bg-muted/50 hover:text-foreground',
                      isActive && 'text-primary dark:text-[hsl(37,27%,70%)]',
                      isFieldNotes && 'inline-flex items-center gap-2'
                    )}
                  >
                    {isFieldNotes ? <BookOpen className="h-4 w-4 opacity-70" /> : null}
                    <span className="relative z-10">{link.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute bottom-1 left-0 right-0 h-0.5 bg-primary dark:bg-[hsl(37,27%,70%)] rounded-full"
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* Right Side Actions */}
          <div className="flex items-center gap-1.5 md:gap-2 lg:gap-3 flex-shrink-0 min-w-0 justify-end">
            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Notifications (all sizes): includes admin pending-approval workload for admins */}
            {user?.uid ? (
              <NotificationsBell
                userId={user.uid}
                adminPendingApprovalsCount={pendingApprovalsCount}
                adminPendingApprovalsHref="/dashboard/admin/listings"
              />
            ) : null}

            {/* Desktop Actions - User Menu */}
            <div className="hidden md:flex items-center gap-1.5 lg:gap-2 flex-shrink-0">
              <Button
                asChild
                size="default"
                className="h-9 lg:h-10 px-2.5 lg:px-3 xl:px-4 gap-1.5 lg:gap-2 text-xs lg:text-sm font-semibold dark:bg-primary dark:text-primary-foreground whitespace-nowrap flex-shrink-0"
                style={{
                  backgroundColor: 'hsl(90 12% 45%)',
                  color: 'hsl(40 30% 93%)',
                }}
              >
                <Link href="/dashboard/listings/new">
                  <PlusCircle className="h-3.5 w-3.5 lg:h-4 lg:w-4 flex-shrink-0" />
                  <span className="hidden xl:inline">Create listing</span>
                  <span className="xl:hidden">Create</span>
                </Link>
              </Button>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="max-w-[120px] lg:max-w-[140px] xl:max-w-[180px] min-w-0 flex-shrink-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="default"
                            className="h-9 lg:h-10 px-2 lg:px-2.5 gap-1.5 lg:gap-2 text-xs lg:text-sm font-semibold w-full min-w-0"
                          >
                            <User className="h-3.5 w-3.5 lg:h-4 lg:w-4 flex-shrink-0" />
                            <span className="hidden xl:inline truncate min-w-0">
                              {user?.displayName || (user?.email ? user.email.split('@')[0] : 'Account')}
                            </span>
                            <span className="xl:hidden truncate min-w-0 text-xs">
                              {user?.displayName?.split(' ')[0] || (user?.email ? user.email.split('@')[0].substring(0, 6) : 'Acct')}
                            </span>
                            <ChevronDown className="h-3 w-3 opacity-50 flex-shrink-0" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
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
                        <Link href="/dashboard" className="flex items-center gap-2 cursor-pointer">
                          <LayoutDashboard className="h-4 w-4" />
                          Dashboard
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
                          <LogIn className="h-4 w-4" />
                          Sign In
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TooltipTrigger>
                  {user?.email && user.email.length > 20 && (
                    <TooltipContent side="bottom" align="end">
                      <p className="max-w-xs break-all text-xs">{user.email}</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Mobile Menu */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden min-w-[40px] min-h-[40px] rounded-lg flex-shrink-0"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2 font-barletta-inline text-[hsl(75,8%,13%)] dark:text-[hsl(37,27%,70%)]">
                    {/* Light mode: Olivewood color using mask */}
                    <div 
                      className="h-7 w-7 dark:hidden"
                      style={{
                        backgroundColor: 'hsl(75 8% 13%)',
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
                    {/* Dark mode: Beige sand color using mask */}
                    <div 
                      className="hidden dark:block h-7 w-7"
                      style={{
                        backgroundColor: 'hsl(37 27% 70%)',
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
                    <span className="sr-only">Wildlife Exchange</span>
                  </SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-2 mt-6 pb-4">
                  {navLinks.map((link) => {
                    const isActive = pathname === link.href || (link.href !== '/' && pathname?.startsWith(link.href + '/'));

                    if (link.href === '/how-it-works') {
                      const isHowActive = pathname === '/how-it-works' || pathname?.startsWith('/how-it-works/');
                      return (
                        <div key={link.href} className="space-y-1">
                          <SheetClose asChild>
                            <Link
                              href="/how-it-works"
                              className={cn(
                                'px-4 py-3 rounded-lg text-base font-semibold transition-all min-h-[48px] flex items-center w-full',
                                'hover:bg-muted active:bg-muted',
                                isHowActive && 'bg-primary/10 text-primary dark:text-[hsl(37,27%,70%)] border-l-4 border-primary dark:border-[hsl(37,27%,70%)]'
                              )}
                            >
                              <span className="truncate">How It Works</span>
                            </Link>
                          </SheetClose>
                          <div className="pl-4 space-y-1">
                            {howItWorksItems
                              .filter((it) => it.href !== '/how-it-works')
                              .map((it) => {
                                const subActive = pathname === it.href || pathname?.startsWith(it.href + '/');
                                return (
                                  <SheetClose key={it.href} asChild>
                                    <Link
                                      href={it.href}
                                      className={cn(
                                        'px-4 py-2 rounded-lg text-sm font-semibold transition-all min-h-[40px] flex items-center w-full',
                                        'hover:bg-muted/60 active:bg-muted',
                                        subActive && 'bg-primary/10 text-primary dark:text-[hsl(37,27%,70%)]'
                                      )}
                                    >
                                      <span className="truncate">{it.label}</span>
                                    </Link>
                                  </SheetClose>
                                );
                              })}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <SheetClose key={link.href} asChild>
                        <Link
                          href={link.href}
                          className={cn(
                            'px-4 py-3 rounded-lg text-base font-semibold transition-all min-h-[48px] flex items-center w-full',
                            'hover:bg-muted active:bg-muted',
                            isActive && 'bg-primary/10 text-primary dark:text-[hsl(37,27%,70%)] border-l-4 border-primary dark:border-[hsl(37,27%,70%)]'
                          )}
                        >
                          <span className="truncate">{link.label}</span>
                        </Link>
                      </SheetClose>
                    );
                  })}
                  <div className="pt-2 mt-2 border-t border-border/50 space-y-2">
                    {user ? (
                      <>
                        <SheetClose asChild>
                          <Button asChild className="w-full justify-start gap-2 font-semibold min-h-[48px] dark:bg-primary dark:text-primary-foreground" style={{
                            backgroundColor: 'hsl(90 12% 45%)',
                            color: 'hsl(40 30% 93%)',
                          }}>
                            <Link href="/dashboard/listings/new">
                              <PlusCircle className="h-4 w-4" />
                              Create listing
                            </Link>
                          </Button>
                        </SheetClose>
                        <SheetClose asChild>
                          <Button asChild variant="outline" className="w-full justify-start gap-2 font-semibold min-h-[48px]">
                            <Link href="/dashboard">
                              <LayoutDashboard className="h-4 w-4" />
                              Dashboard
                            </Link>
                          </Button>
                        </SheetClose>
                        <SheetClose asChild>
                          <Button 
                            variant="outline" 
                            className="w-full justify-start gap-2 font-semibold min-h-[48px] text-destructive hover:text-destructive"
                            onClick={handleSignOut}
                          >
                            <LogOut className="h-4 w-4" />
                            Sign Out
                          </Button>
                        </SheetClose>
                      </>
                    ) : (
                      <>
                        <SheetClose asChild>
                          <Button asChild className="w-full justify-start gap-2 font-semibold min-h-[48px] dark:bg-primary dark:text-primary-foreground" style={{
                            backgroundColor: 'hsl(90 12% 45%)',
                            color: 'hsl(40 30% 93%)',
                          }}>
                            <Link href="/dashboard/listings/new">
                              <PlusCircle className="h-4 w-4" />
                              Create listing
                            </Link>
                          </Button>
                        </SheetClose>
                        <SheetClose asChild>
                          <Button asChild variant="outline" className="w-full justify-start gap-2 font-semibold min-h-[48px]">
                            <Link href="/register">
                              <User className="h-4 w-4" />
                              Sign Up
                            </Link>
                          </Button>
                        </SheetClose>
                        <SheetClose asChild>
                          <Button asChild variant="outline" className="w-full justify-start gap-2 font-semibold min-h-[48px]">
                            <Link href="/login">
                              <LogIn className="h-4 w-4" />
                              Sign In
                            </Link>
                          </Button>
                        </SheetClose>
                      </>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </motion.nav>
  );
}
