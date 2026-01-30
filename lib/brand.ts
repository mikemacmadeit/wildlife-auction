/**
 * Single source of truth for product brand. Use these everywhere instead of
 * hardcoding "Wildlife Exchange" or "Agchange" so the app never shows old branding.
 */
export const BRAND_DISPLAY_NAME = 'Agchange';

export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@agchange.app';
