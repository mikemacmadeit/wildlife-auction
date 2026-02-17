import type { HelpKey } from '@/lib/help/helpKeys';

export type TourStep = {
  id: string;
  title: string;
  body: string;
  /**
   * Use stable selectors: `[data-tour="..."]`
   */
  selector: string;
  placement?: 'top' | 'right' | 'bottom' | 'left';
};

export type TourDefinition = {
  key: HelpKey;
  title: string;
  steps: TourStep[];
};

export const TOURS: Partial<Record<HelpKey, TourDefinition>> = {
  seller_overview: {
    key: 'seller_overview',
    title: 'Seller Overview Tour',
    steps: [
      {
        id: 'setup-checklist',
        title: 'Complete Verification Process',
        body: 'Complete these steps (profile, email verification, payouts) to publish and get paid.',
        selector: '[data-tour="seller-setup-checklist"]',
        placement: 'bottom',
      },
      {
        id: 'create-listing',
        title: 'Create your first listing',
        body: 'Start with a draft listing. Great photos + clear specs = faster sales.',
        selector: '[data-tour="seller-create-listing"]',
        placement: 'bottom',
      },
      {
        id: 'stats',
        title: 'Daily snapshot',
        body: 'These cards show what’s working: active listings, revenue, views, and conversion. Use them to spot weak listings quickly.',
        selector: '[data-tour="seller-stats"]',
        placement: 'bottom',
      },
      {
        id: 'action-required',
        title: 'Action Required',
        body: 'These are your highest-leverage tasks (ending auctions, new messages, transport requests). Clear this daily.',
        selector: '[data-tour="seller-action-required"]',
        placement: 'bottom',
      },
      {
        id: 'payouts',
        title: 'Payout readiness',
        body: 'Stripe payouts must be connected and complete before you can publish and receive payouts.',
        selector: '[data-tour="seller-payout-readiness"]',
        placement: 'bottom',
      },
      {
        id: 'exposure-plans',
        title: 'Exposure plans (optional)',
        body: 'Plans affect placement and badges—not compliance. You can stay on Standard and still sell.',
        selector: '[data-tour="seller-exposure-plans"]',
        placement: 'bottom',
      },
      {
        id: 'recent-activity',
        title: 'Recent activity',
        body: 'A quick feed of what just happened so you can respond fast (bids, messages, sales).',
        selector: '[data-tour="seller-recent-activity"]',
        placement: 'bottom',
      },
      {
        id: 'performance',
        title: 'Performance',
        body: 'A lightweight health check. Over time, we’ll use this to nudge faster responses and better conversion.',
        selector: '[data-tour="seller-performance"]',
        placement: 'bottom',
      },
    ],
  },
  dashboard_listing_create: {
    key: 'dashboard_listing_create',
    title: 'Create Listing Tour',
    steps: [
      {
        id: 'category',
        title: 'Pick a category',
        body: 'Choose the category that matches what you’re selling. Animal categories are TX-only.',
        selector: '[data-tour="listing-category-step"]',
        placement: 'bottom',
      },
      {
        id: 'title',
        title: 'Write a strong title',
        body: 'Use breed/species + key selling point + quantity. Keep it clear and searchable.',
        selector: '[data-tour="listing-title"]',
        placement: 'bottom',
      },
      {
        id: 'pricing',
        title: 'Set pricing',
        body: 'Buy Now uses price; Auctions use starting bid and end time. Set realistic numbers.',
        selector: '[data-tour="listing-price"]',
        placement: 'bottom',
      },
      {
        id: 'publish',
        title: 'Publish when ready',
        body: 'Publishing requires verified email, completed profile, and Stripe payouts connected.',
        selector: '[data-tour="listing-publish"]',
        placement: 'top',
      },
    ],
  },
  dashboard_orders: {
    key: 'dashboard_orders',
    title: 'Orders Tour',
    steps: [
      {
        id: 'orders-list',
        title: 'Your orders',
        body: 'Each order shows status and a timeline. Expand one to see details.',
        selector: '[data-tour="orders-list"]',
        placement: 'bottom',
      },
    ],
  },
};

