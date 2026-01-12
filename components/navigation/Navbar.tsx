'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Search, Menu, User, PlusCircle, ChevronDown, LogIn, LayoutDashboard, ShoppingBag, LogOut } from 'lucide-react';
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
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { signOutUser } from '@/lib/firebase/auth';
import { useToast } from '@/hooks/use-toast';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
    { href: '/pricing', label: 'Pricing' },
  ];

  return (
    <motion.nav
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80 shadow-sm"
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="relative flex h-20 items-center justify-between gap-6">
          {/* Logo Section - Larger with better spacing */}
          <Link href="/" className="flex items-center gap-3 group flex-shrink-0 z-10">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/10 blur-xl rounded-full group-hover:bg-primary/20 transition-colors" />
              <div className="relative h-10 w-10 md:h-11 md:w-11 group-hover:scale-110 transition-transform">
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
            <span className="text-xl md:text-2xl font-extrabold whitespace-nowrap tracking-tight font-barletta-inline text-[hsl(75,8%,13%)] dark:text-[hsl(37,27%,70%)]">
              Wildlife Exchange
            </span>
          </Link>

          {/* Desktop Navigation - Centered */}
          <div className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
            {navLinks.map((link) => {
              const isActive = pathname === link.href || 
                (link.href !== '/' && pathname?.startsWith(link.href + '/'));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'px-5 py-2.5 rounded-lg text-base font-semibold transition-all duration-200 relative',
                    'hover:bg-muted/50 hover:text-foreground',
                    isActive && 'text-primary dark:text-[hsl(37,27%,70%)]'
                  )}
                >
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

          {/* Right Side Actions - Better spacing */}
          <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
            {/* Search Icon - Links to browse page where full search is available */}
            <Button
              variant="ghost"
              size="icon"
              className="min-w-[44px] min-h-[44px] rounded-lg hover:bg-muted/50"
              asChild
            >
              <Link href="/browse">
                <Search className="h-5 w-5" />
                <span className="sr-only">Search listings</span>
              </Link>
            </Button>

            {/* Divider */}
            <div className="hidden md:block w-px h-6 bg-border/50" />

            {/* Theme Toggle */}
            <ThemeToggle />

            {/* Desktop Actions - User Menu */}
            <div className="hidden md:flex items-center gap-2">
              <Button
                asChild
                size="default"
                className="h-10 px-4 gap-2 text-sm font-semibold dark:bg-primary dark:text-primary-foreground"
                style={{
                  backgroundColor: 'hsl(90 12% 45%)',
                  color: 'hsl(40 30% 93%)',
                }}
              >
                <Link href="/dashboard/listings/new">
                  <PlusCircle className="h-4 w-4" />
                  <span className="hidden lg:inline">List an Animal</span>
                  <span className="lg:hidden">Sell</span>
                </Link>
              </Button>
              
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="max-w-[180px] lg:max-w-[220px]">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="default"
                            className="h-10 px-3 gap-2 text-sm font-semibold w-full"
                          >
                            <User className="h-4 w-4 flex-shrink-0" />
                            <span className="hidden lg:inline truncate">
                              {user?.displayName || (user?.email ? user.email.split('@')[0] : 'Account')}
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
                  className="md:hidden min-w-[44px] min-h-[44px] rounded-lg"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[300px] sm:w-[400px]">
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
                    Wildlife Exchange
                  </SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-2 mt-6">
                  {navLinks.map((link) => {
                    const isActive = pathname === link.href || 
                      (link.href !== '/' && pathname?.startsWith(link.href + '/'));
                    return (
                      <SheetClose key={link.href} asChild>
                        <Link
                          href={link.href}
                          className={cn(
                            'px-4 py-3 rounded-lg text-base font-semibold transition-all',
                            'hover:bg-muted active:bg-muted',
                            isActive && 'bg-primary/10 text-primary dark:text-[hsl(37,27%,70%)] border-l-4 border-primary dark:border-[hsl(37,27%,70%)]'
                          )}
                        >
                          {link.label}
                        </Link>
                      </SheetClose>
                    );
                  })}
                  <div className="pt-2 mt-2 border-t border-border/50 space-y-2">
                    <SheetClose asChild>
                      <Button asChild className="w-full justify-start gap-2 font-semibold h-11 dark:bg-primary dark:text-primary-foreground" style={{
                        backgroundColor: 'hsl(90 12% 45%)',
                        color: 'hsl(40 30% 93%)',
                      }}>
                        <Link href="/dashboard/listings/new">
                          <PlusCircle className="h-4 w-4" />
                          List an Animal
                        </Link>
                      </Button>
                    </SheetClose>
                    <SheetClose asChild>
                      <Button asChild variant="outline" className="w-full justify-start gap-2 font-semibold h-11">
                        <Link href="/register">
                          <User className="h-4 w-4" />
                          Sign Up
                        </Link>
                      </Button>
                    </SheetClose>
                    <SheetClose asChild>
                      <Button asChild variant="outline" className="w-full justify-start gap-2 font-semibold h-11">
                        <Link href="/dashboard/account">
                          <LogIn className="h-4 w-4" />
                          Sign In
                        </Link>
                      </Button>
                    </SheetClose>
                    <SheetClose asChild>
                      <Button asChild className="w-full justify-start gap-2 font-semibold h-11">
                        <Link href="/seller/overview">
                          <LayoutDashboard className="h-4 w-4" />
                          Dashboard
                        </Link>
                      </Button>
                    </SheetClose>
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
