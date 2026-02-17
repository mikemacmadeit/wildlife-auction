import type { HelpKey } from '@/lib/help/helpKeys';

export type HelpQuickAction = {
  label: string;
  href: string;
};

export type HelpContent = {
  key: HelpKey;
  title: string;
  oneLiner: string;
  checklist: string[];
  commonMistakes?: string[];
  quickActions?: HelpQuickAction[];
};

/**
 * Help content registry (edit me).
 *
 * Add a new page:
 * - Add a key in `lib/help/helpKeys.ts`
 * - Add an entry here
 * - (Optional) add tour steps in `help/tours.ts`
 */
export const HELP_CONTENT: Record<HelpKey, HelpContent> = {
  public_home: {
    key: 'public_home',
    title: 'Home',
    oneLiner: 'Discover the marketplace and get to the right place fast: browse, sell, or manage your account.',
    checklist: ['Browse listings by category', 'Create an account to save listings', 'Create a listing when you’re ready'],
    commonMistakes: ['Trying to message or transact before verifying email', 'Skipping profile details (phone + location) if you plan to sell'],
    quickActions: [
      { label: 'Browse listings', href: '/browse' },
      { label: 'Create listing', href: '/dashboard/listings/new' },
    ],
  },
  public_browse: {
    key: 'public_browse',
    title: 'Browse Listings',
    oneLiner: 'Search and filter active listings, then save favorites so you can come back later.',
    checklist: ['Use filters to narrow down results', 'Open a listing to see details', 'Click the heart to save to your watchlist'],
    commonMistakes: ['Not being signed in when trying to save/watchlist', 'Forgetting to switch listing type (auction vs buy now)'],
    quickActions: [{ label: 'View watchlist', href: '/dashboard/watchlist' }],
  },
  public_how_it_works: {
    key: 'public_how_it_works',
    title: 'How It Works',
    oneLiner: 'Learn the buyer and seller flow: listings, offers/auctions, and protected transactions.',
    checklist: ['Understand listing types', 'See how checkout and payout holds work', 'Learn what sellers must complete before publishing'],
  },
  seller_overview: {
    key: 'seller_overview',
    title: 'Seller Overview',
    oneLiner: 'Your command center: verification process, listings status, and action items.',
    checklist: ['Complete your profile (name, phone, location)', 'Verify your email', 'Connect Stripe payouts', 'Create a draft listing, then publish'],
    commonMistakes: ['Trying to publish before Stripe payouts are connected', 'Ignoring email verification (blocks publish/checkout/actions)'],
    quickActions: [
      { label: 'Create listing', href: '/dashboard/listings/new' },
      { label: 'Connect payouts', href: '/seller/payouts' },
      { label: 'Account settings', href: '/dashboard/account' },
    ],
  },
  dashboard_listing_create: {
    key: 'dashboard_listing_create',
    title: 'Create Listing',
    oneLiner: 'Create a draft listing step-by-step, upload great photos, then publish when ready.',
    checklist: [
      'Pick the correct category and listing type',
      'Write a clear title and detailed description',
      'Set pricing (or auction rules)',
      'Upload high-quality photos',
      'Save draft often, then publish',
    ],
    commonMistakes: [
      'Pricing too low/high without enough detail',
      'Not adding location (buyers need it)',
      'Publishing without completing verification (profile, email verification, payouts)',
    ],
    quickActions: [
      { label: 'Seller overview', href: '/seller/overview' },
      { label: 'Payout setup', href: '/seller/payouts' },
    ],
  },
  dashboard_orders: {
    key: 'dashboard_orders',
    title: 'Orders',
    oneLiner: 'Track your purchases, confirm delivery, and handle disputes if needed.',
    checklist: ['Open an order to see timeline', 'Confirm delivery when you receive the item/animal', 'Open a dispute only if there’s a real issue'],
    commonMistakes: ['Waiting too long to confirm delivery', 'Starting a dispute without including clear notes/evidence'],
  },
};

