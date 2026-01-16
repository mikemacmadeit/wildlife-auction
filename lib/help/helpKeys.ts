export type HelpKey =
  | 'public_browse'
  | 'public_home'
  | 'public_how_it_works'
  | 'dashboard_orders'
  | 'dashboard_listing_create'
  | 'seller_overview';

/**
 * Resolve the best help key for a given pathname.
 * This is the single routing glue layer so help content stays easy to edit.
 */
export function getHelpKeyForPathname(pathname: string | null | undefined): HelpKey | null {
  if (!pathname) return null;

  // Exact matches first
  if (pathname === '/') return 'public_home';
  if (pathname === '/browse') return 'public_browse';
  if (pathname === '/how-it-works') return 'public_how_it_works';

  // Authenticated app pages
  if (pathname === '/dashboard/orders') return 'dashboard_orders';
  if (pathname === '/dashboard/listings/new') return 'dashboard_listing_create';

  // Dashboard root redirects to seller overview in this repo
  if (pathname === '/dashboard' || pathname === '/seller' || pathname === '/seller/overview') return 'seller_overview';

  // Prefix fallbacks
  if (pathname.startsWith('/browse')) return 'public_browse';
  if (pathname.startsWith('/dashboard/orders')) return 'dashboard_orders';
  if (pathname.startsWith('/dashboard/listings/new')) return 'dashboard_listing_create';
  if (pathname.startsWith('/seller/overview')) return 'seller_overview';

  return null;
}

