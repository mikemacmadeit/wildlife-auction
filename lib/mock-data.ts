import { Listing, InsuranceTier } from './types';

export const mockListings: Listing[] = [
  {
    id: '1',
    title: 'Trophy Whitetail Buck - 180+ Class Score',
    description: 'Exceptional large-frame whitetail buck, estimated 5.5 years old, impressive 12-point rack. Proven breeder with excellent genetics. Game-farmed, fully acclimated. Health certificate and papers included.',
    type: 'auction',
    category: 'wildlife',
    currentBid: 18500,
    startingBid: 15000,
    reservePrice: 20000,
    images: [
      '/images/Buck_1.webp'
    ],
    location: { city: 'Kerrville', state: 'TX', zip: '78028' },
    endsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    featured: true,
    featuredUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    seller: {
      id: 'usalandspecialist@gmail.com',
      name: 'USA Land Specialist',
      rating: 4.8,
      responseTime: '2 hours',
      verified: true,
    },
    trust: {
      verified: true,
      insuranceAvailable: true,
      transportReady: true,
    },
    metadata: {
      quantity: 1,
      breed: 'Whitetail Deer',
      age: '5.5 years',
      healthStatus: 'Excellent',
      papers: true,
    },
  },
  {
    id: '10',
    title: 'Scimitar-Horned Oryx Bull - Distinctive Curved Horns',
    description: 'Rare scimitar-horned oryx bull with distinctive curved horns. Excellent genetics, proven breeder. All health certificates and permits current. Transport-ready.',
    type: 'fixed',
    category: 'wildlife',
    price: 9500,
    images: [
      '/images/Scimitar-horned oryx.webp'
    ],
    location: { city: 'Menard', state: 'TX', zip: '76859' },
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
    seller: {
      id: 'usalandspecialist@gmail.com',
      name: 'USA Land Specialist',
      rating: 4.9,
      responseTime: '1 hour',
      verified: true,
    },
    trust: {
      verified: true,
      insuranceAvailable: true,
      transportReady: true,
    },
    metadata: {
      quantity: 1,
      breed: 'Scimitar-Horned Oryx',
      age: '6 years',
      healthStatus: 'Excellent',
      papers: true,
    },
  },
  {
    id: '11',
    title: 'Addax Antelope Bull - Distinctive Twisted Horns',
    description: 'Rare addax antelope bull with distinctive twisted horns. Critically endangered species with excellent genetics. All health certificates and permits current. Transport-ready.',
    type: 'auction',
    category: 'wildlife',
    currentBid: 8200,
    startingBid: 7500,
    reservePrice: 9000,
    images: [
      '/images/Addax.webp',
      '/images/Addax 2.webp'
    ],
    location: { city: 'Menard', state: 'TX', zip: '76859' },
    endsAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000), // 6 days
    createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    featured: true,
    featuredUntil: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
    seller: {
      id: 'usalandspecialist@gmail.com',
      name: 'USA Land Specialist',
      rating: 4.9,
      responseTime: '1 hour',
      verified: true,
    },
    trust: {
      verified: true,
      insuranceAvailable: true,
      transportReady: true,
    },
    metadata: {
      quantity: 1,
      breed: 'Addax Antelope',
      age: '6 years',
      healthStatus: 'Excellent',
      papers: true,
    },
  },
  {
    id: '12',
    title: 'Greater Kudu Bull - Magnificent Spiral Horns',
    description: 'Impressive greater kudu bull with magnificent spiral horns. Excellent genetics, proven breeder. One of the largest antelope species with impressive size. All health certificates current.',
    type: 'fixed',
    category: 'wildlife',
    price: 12000,
    images: [
      '/images/Greater kudu.webp'
    ],
    location: { city: 'Junction', state: 'TX', zip: '76849' },
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    featured: true,
    featuredUntil: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
    seller: {
      id: 'usalandspecialist@gmail.com',
      name: 'USA Land Specialist',
      rating: 4.9,
      responseTime: '2 hours',
      verified: true,
    },
    trust: {
      verified: true,
      insuranceAvailable: true,
      transportReady: true,
    },
    metadata: {
      quantity: 1,
      breed: 'Greater Kudu',
      age: '6 years',
      healthStatus: 'Excellent',
      papers: true,
    },
  },
  {
    id: '13',
    title: 'Red Stag - Trophy Stag',
    description: 'Impressive trophy red stag with massive antlers. Mature, proven breeder with excellent genetics. Large frame, fully acclimated. Health certificate and papers included. Ready for breeding or trophy hunting.',
    type: 'auction',
    category: 'wildlife',
    currentBid: 19500,
    startingBid: 17000,
    reservePrice: 21000,
    images: [
      '/images/Stag.webp'
    ],
    location: { city: 'Bandera', state: 'TX', zip: '78003' },
    endsAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), // 4 days
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    seller: {
      id: 'usalandspecialist@gmail.com',
      name: 'USA Land Specialist',
      rating: 4.8,
      responseTime: '3 hours',
      verified: true,
    },
    trust: {
      verified: true,
      insuranceAvailable: true,
      transportReady: true,
    },
    metadata: {
      quantity: 1,
      breed: 'Red Stag',
      age: '6 years',
      healthStatus: 'Excellent',
      papers: true,
    },
  },
];

export const insuranceTiers: InsuranceTier[] = [
  {
    id: 'basic',
    name: 'Basic Coverage',
    coverage: 'Health & Transport ($5,000)',
    price: 250,
    description: 'Coverage for health issues and transport accidents up to $5,000',
  },
  {
    id: 'standard',
    name: 'Standard Coverage',
    coverage: 'Full Protection ($15,000)',
    price: 500,
    description: 'Comprehensive coverage including health, transport, and mortality up to $15,000',
  },
  {
    id: 'premium',
    name: 'Premium Coverage',
    coverage: 'Complete Protection ($50,000)',
    price: 1000,
    description: 'Maximum coverage for all risks including mortality, health, transport, and loss of use up to $50,000',
  },
];
