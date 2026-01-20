// Mock data for Seller Portal
// This will be replaced with Firestore data later

export interface SellerAlert {
  id: string;
  type: 'auction_ending' | 'transport_request' | 'insurance_pending' | 'message' | 'bid';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  listingId?: string;
  listingTitle?: string;
  timestamp: Date;
  action: 'view' | 'respond' | 'complete';
  actionUrl: string;
}

export interface SellerActivity {
  id: string;
  type: 'listing_created' | 'bid_placed' | 'message_received' | 'sale_completed' | 'verification_complete';
  title: string;
  description: string;
  timestamp: Date;
  listingId?: string;
}

export interface SellerListing {
  id: string;
  title: string;
  description?: string;
  type: 'auction' | 'fixed' | 'classified';
  category?: 'cattle' | 'horses' | 'wildlife' | 'equipment' | 'land' | 'other';
  status: 'draft' | 'active' | 'ending_soon' | 'sold' | 'archived';
  price?: number;
  currentBid?: number;
  startingBid?: number;
  reservePrice?: number;
  location: { city: string; state: string; zip?: string };
  images?: string[];
  views: number;
  watchers: number;
  bids: number;
  endsAt?: Date;
  verificationStatus: 'eligible' | 'pending' | 'verified' | 'not_requested';
  insuranceStatus: 'available' | 'active' | 'not_selected';
  transportStatus: 'quote_requested' | 'scheduled' | 'complete' | 'not_requested';
}

export interface Sale {
  id: string;
  listingId: string;
  listingTitle: string;
  buyer: {
    name: string;
    location: string;
  };
  price: number;
  status: 'pending_payment' | 'pending_verification' | 'in_transit' | 'completed';
  paymentStatus: 'pending' | 'completed';
  insuranceStatus: 'available' | 'active' | 'not_selected';
  transportStatus: 'quote_requested' | 'scheduled' | 'complete' | 'not_requested';
  createdAt: Date;
}

export interface Conversation {
  id: string;
  listingId: string;
  listingTitle: string;
  buyer: {
    name: string;
    location: string;
    avatar?: string;
  };
  lastMessage: string;
  lastMessageTime: Date;
  unreadCount: number;
  messages: Message[];
}

export interface Message {
  id: string;
  sender: 'seller' | 'buyer';
  content: string;
  timestamp: Date;
}

export interface Payout {
  id: string;
  amount: number;
  status: 'available' | 'pending' | 'completed';
  saleId: string;
  saleTitle: string;
  fees: {
    transaction: number;
    subscription: number;
    services: number;
    total: number;
  };
  netAmount: number;
  scheduledDate?: Date;
  completedDate?: Date;
}

// Mock Data
export const mockSellerAlerts: SellerAlert[] = [
  {
    id: '1',
    type: 'auction_ending',
    priority: 'high',
    title: 'Auction ending in 2 hours',
    description: '4 bidders watching • 12 active bids',
    listingId: '1',
    listingTitle: 'Premium Whitetail Buck',
    timestamp: new Date(Date.now() - 30 * 60 * 1000),
    action: 'view',
    actionUrl: '/seller/listings/1',
  },
  {
    id: '2',
    type: 'transport_request',
    priority: 'medium',
    title: 'Buyer requested delivery details',
    description: 'Axis Deer Herd • Buyer in Dallas, TX',
    listingId: '2',
    listingTitle: 'Axis Deer Herd',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
    action: 'respond',
    actionUrl: '/seller/logistics/2',
  },
  {
    id: '3',
    type: 'insurance_pending',
    priority: 'medium',
    title: 'Insurance verification pending',
    description: 'Axis Deer Herd • Awaiting documentation',
    listingId: '2',
    listingTitle: 'Axis Deer Herd',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
    action: 'complete',
    actionUrl: '/seller/logistics/2',
  },
  {
    id: '4',
    type: 'message',
    priority: 'low',
    title: 'New message from buyer',
    description: 'Mason, TX • Question about health certificates',
    listingId: '3',
    listingTitle: 'Blackbuck Antelope',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
    action: 'respond',
    actionUrl: '/seller/messages/3',
  },
];

export const mockSellerActivities: SellerActivity[] = [
  {
    id: '1',
    type: 'bid_placed',
    title: 'New bid placed',
    description: '$12,500 on Premium Whitetail Buck',
    timestamp: new Date(Date.now() - 45 * 60 * 1000),
    listingId: '1',
  },
  {
    id: '2',
    type: 'listing_created',
    title: 'Listing created',
    description: 'Axis Deer Herd published',
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    listingId: '2',
  },
  {
    id: '3',
    type: 'message_received',
    title: 'Message received',
    description: 'From buyer in Mason, TX',
    timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    listingId: '3',
  },
  {
    id: '4',
    type: 'sale_completed',
    title: 'Sale completed',
    description: 'Fallow Deer Herd • $8,500',
    timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    listingId: '4',
  },
];

export const mockSellerListings: SellerListing[] = [
  {
    id: '1',
    title: 'Premium Whitetail Buck',
    description: 'Exceptional large-frame whitetail buck, estimated 5.5 years old, impressive 12-point rack. Proven breeder with excellent genetics. Game-farmed, fully acclimated. Health certificate and papers included.',
    type: 'auction',
    category: 'wildlife',
    status: 'ending_soon',
    currentBid: 12500,
    startingBid: 10000,
    reservePrice: 15000,
    location: { city: 'Kerrville', state: 'TX', zip: '78028' },
    images: ['/images/Buck_1.webp', '/images/IMG-0423.webp'],
    views: 247,
    watchers: 12,
    bids: 8,
    endsAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    verificationStatus: 'verified',
    insuranceStatus: 'active',
    transportStatus: 'not_requested',
  },
  {
    id: '2',
    title: 'Axis Deer Herd',
    description: 'Premium axis deer breeding herd: mature buck with impressive antlers and three proven does. Excellent genetics, established breeders. All health papers current, transport-ready.',
    type: 'fixed',
    category: 'wildlife',
    status: 'active',
    price: 15000,
    location: { city: 'Fredericksburg', state: 'TX', zip: '78624' },
    images: ['/images/bino.webp', '/images/bow_2.webp'],
    views: 189,
    watchers: 7,
    bids: 0,
    verificationStatus: 'pending',
    insuranceStatus: 'available',
    transportStatus: 'quote_requested',
  },
  {
    id: '3',
    title: 'Blackbuck Antelope',
    description: 'Proven blackbuck antelope breeding pair: mature buck with spiral horns and proven doe. Excellent genetics, established breeders. Health papers current.',
    type: 'classified',
    category: 'wildlife',
    status: 'active',
    price: 8500,
    location: { city: 'Mason', state: 'TX', zip: '76856' },
    images: ['/images/Pic_1.webp'],
    views: 156,
    watchers: 5,
    bids: 0,
    verificationStatus: 'verified',
    insuranceStatus: 'not_selected',
    transportStatus: 'not_requested',
  },
  {
    id: '4',
    title: 'Fallow Deer Herd',
    description: 'European fallow deer breeding herd: impressive stag with palmated antlers and three proven does. Excellent genetics, established breeders. All health certificates current.',
    type: 'fixed',
    category: 'wildlife',
    status: 'sold',
    price: 8500,
    location: { city: 'Bandera', state: 'TX', zip: '78003' },
    images: ['/images/Buck_1.webp'],
    views: 203,
    watchers: 0,
    bids: 0,
    verificationStatus: 'verified',
    insuranceStatus: 'active',
    transportStatus: 'complete',
  },
  {
    id: '5',
    title: 'Large Whitetail Buck (Draft)',
    description: 'Large-frame whitetail buck, estimated 6 years old. Currently in draft status - complete listing details to publish.',
    type: 'auction',
    category: 'wildlife',
    status: 'draft',
    price: 0,
    startingBid: 12000,
    location: { city: 'Kerrville', state: 'TX', zip: '78028' },
    images: [],
    views: 0,
    watchers: 0,
    bids: 0,
    verificationStatus: 'not_requested',
    insuranceStatus: 'not_selected',
    transportStatus: 'not_requested',
  },
];

export const mockSales: Sale[] = [
  {
    id: '1',
    listingId: '1',
    listingTitle: 'Premium Whitetail Buck',
    buyer: { name: 'John Smith', location: 'Dallas, TX' },
    price: 12500,
    status: 'pending_payment',
    paymentStatus: 'pending',
    insuranceStatus: 'active',
    transportStatus: 'not_requested',
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
  },
  {
    id: '2',
    listingId: '4',
    listingTitle: 'Fallow Deer Herd',
    buyer: { name: 'Sarah Johnson', location: 'Houston, TX' },
    price: 8500,
    status: 'completed',
    paymentStatus: 'completed',
    insuranceStatus: 'active',
    transportStatus: 'complete',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  },
];

export const mockConversations: Conversation[] = [
  {
    id: '1',
    listingId: '1',
    listingTitle: 'Premium Whitetail Buck',
    buyer: { name: 'John Smith', location: 'Dallas, TX' },
    lastMessage: 'When can we schedule pickup?',
    lastMessageTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
    unreadCount: 1,
    messages: [
      {
        id: '1',
        sender: 'buyer',
        content: 'Is the buck still available?',
        timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
      },
      {
        id: '2',
        sender: 'seller',
        content: 'Yes, it\'s available. The auction ends in 2 hours.',
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
      },
      {
        id: '3',
        sender: 'buyer',
        content: 'When can we schedule pickup?',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    ],
  },
  {
    id: '2',
    listingId: '3',
    listingTitle: 'Blackbuck Antelope',
    buyer: { name: 'Mike Wilson', location: 'Mason, TX' },
    lastMessage: 'Do you have health certificates?',
    lastMessageTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
    unreadCount: 0,
    messages: [
      {
        id: '4',
        sender: 'buyer',
        content: 'Do you have health certificates?',
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    ],
  },
];

export const mockPayouts: Payout[] = [
  {
    id: '1',
    amount: 8500,
    status: 'available',
    saleId: '2',
    saleTitle: 'Fallow Deer Herd',
    fees: {
      transaction: 425,
      subscription: 0,
      services: 250,
      total: 675,
    },
    netAmount: 7825,
    scheduledDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
  },
  {
    id: '2',
    amount: 12500,
    status: 'pending',
    saleId: '1',
    saleTitle: 'Premium Whitetail Buck',
    fees: {
      transaction: 625,
      subscription: 0,
      services: 0,
      total: 625,
    },
    netAmount: 11875,
  },
];

export const mockSellerStats = {
  totalListings: 12,
  activeListings: 3,
  endingSoon: 2,
  totalRevenue: 45000,
  revenue30Days: 12500,
  views7Days: 892,
  conversionRate: 12.5,
  completionRate: 98,
  responseTime: '2 hours',
  verifiedAnimals: 8,
};
