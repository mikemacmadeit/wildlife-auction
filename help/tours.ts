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
        title: 'Seller setup checklist',
        body: 'Complete these steps (profile, email verification, payouts) to publish and get paid.',
        selector: '[data-tour="seller-setup-checklist"]',
        placement: 'bottom',
      },
      {
        id: 'create-listing',
        title: 'Create your first listing',
        body: 'Start with a draft listing—photos and details matter.',
        selector: '[data-tour="seller-create-listing"]',
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

