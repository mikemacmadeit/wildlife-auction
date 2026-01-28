'use client';

import { motion } from 'framer-motion';
import { 
  MapPin, 
  Calendar, 
  Package, 
  CheckCircle2,
  FileText,
  Heart,
  Truck,
  Shield,
  Gavel,
  Hash
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Listing, WildlifeAttributes, WhitetailBreederAttributes, CattleAttributes, EquipmentAttributes, HorseAttributes, SportingWorkingDogAttributes } from '@/lib/types';
import { DELIVERY_TIMEFRAME_OPTIONS } from '@/components/browse/filters/constants';

interface KeyFactsPanelProps {
  listing: Listing;
  className?: string;
}

export function KeyFactsPanel({ listing, className }: KeyFactsPanelProps) {
  // Guard clause: return null if listing is not provided
  if (!listing) {
    return null;
  }

  const formatAge = (age: any): string | undefined => {
    if (age === null || age === undefined) return undefined;
    if (typeof age === 'number' && Number.isFinite(age)) return `${age} yr${age === 1 ? '' : 's'}`;
    const s = String(age).trim();
    return s ? s : undefined;
  };

  const facts = [
    listing.location && {
      icon: MapPin,
      label: 'Location',
      value: `${listing.location.city || 'Unknown'}, ${listing.location.state || 'Unknown'}`,
      detail: listing.location.zip ? `ZIP: ${listing.location.zip}` : undefined,
    },
    listing.createdAt && {
      icon: Calendar,
      label: 'Listed',
      value: new Date(listing.createdAt).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric' 
      }),
      detail: listing.createdAt 
        ? `${Math.floor((Date.now() - new Date(listing.createdAt).getTime()) / (1000 * 60 * 60 * 24))} days ago`
        : undefined,
    },
    // Category-specific attributes
    listing.attributes && listing.category === 'wildlife_exotics' && (listing.attributes as WildlifeAttributes).speciesId && {
      icon: Package,
      label: 'Species',
      value: (listing.attributes as WildlifeAttributes).speciesId,
      detail: formatAge((listing.attributes as WildlifeAttributes).age),
    },
    listing.attributes && listing.category === 'wildlife_exotics' && (listing.attributes as WildlifeAttributes).sex && {
      icon: Package,
      label: 'Sex',
      value: (listing.attributes as WildlifeAttributes).sex === 'male' ? 'Male' : (listing.attributes as WildlifeAttributes).sex === 'female' ? 'Female' : 'Unknown',
    },
    listing.attributes && listing.category === 'wildlife_exotics' && (listing.attributes as WildlifeAttributes).quantity && {
      icon: Package,
      label: 'Quantity',
      value: `${(listing.attributes as WildlifeAttributes).quantity} ${(listing.attributes as WildlifeAttributes).quantity === 1 ? 'item' : 'items'}`,
    },
    listing.attributes && listing.category === 'whitetail_breeder' && (listing.attributes as WhitetailBreederAttributes).quantity && {
      icon: Package,
      label: 'Quantity',
      value: `${(listing.attributes as WhitetailBreederAttributes).quantity} ${(listing.attributes as WhitetailBreederAttributes).quantity === 1 ? 'deer' : 'deer'}`,
    },
    listing.attributes && listing.category === 'cattle_livestock' && (listing.attributes as CattleAttributes).breed && {
      icon: Package,
      label: 'Breed',
      value: (listing.attributes as CattleAttributes).breed,
      detail: formatAge((listing.attributes as CattleAttributes).age) || (listing.attributes as CattleAttributes).weightRange || undefined,
    },
    listing.attributes && listing.category === 'cattle_livestock' && (listing.attributes as CattleAttributes).sex && {
      icon: Package,
      label: 'Sex',
      value: (listing.attributes as CattleAttributes).sex === 'bull' ? 'Bull' : 
             (listing.attributes as CattleAttributes).sex === 'cow' ? 'Cow' : 
             (listing.attributes as CattleAttributes).sex === 'heifer' ? 'Heifer' : 
             (listing.attributes as CattleAttributes).sex === 'steer' ? 'Steer' : 'Unknown',
    },
    listing.attributes && listing.category === 'cattle_livestock' && (listing.attributes as CattleAttributes).registered !== undefined && {
      icon: FileText,
      label: 'Registered',
      value: (listing.attributes as CattleAttributes).registered ? 'Yes' : 'No',
      badge: (listing.attributes as CattleAttributes).registered 
        ? { variant: 'default' as const, label: 'Certified', color: 'bg-primary/20 text-primary border-primary/40' }
        : undefined,
    },
    listing.attributes && listing.category === 'cattle_livestock' && (listing.attributes as CattleAttributes).quantity && {
      icon: Package,
      label: 'Quantity',
      value: `${(listing.attributes as CattleAttributes).quantity} ${(listing.attributes as CattleAttributes).quantity === 1 ? 'head' : 'head'}`,
    },
    listing.attributes && (listing.category === 'ranch_equipment' || listing.category === 'ranch_vehicles') && (listing.attributes as EquipmentAttributes).equipmentType && {
      icon: Package,
      label: listing.category === 'ranch_vehicles' ? 'Vehicle type' : 'Equipment type',
      value: (listing.attributes as EquipmentAttributes).equipmentType,
      detail: (listing.attributes as EquipmentAttributes).make && (listing.attributes as EquipmentAttributes).model 
        ? `${(listing.attributes as EquipmentAttributes).make} ${(listing.attributes as EquipmentAttributes).model}`
        : undefined,
    },
    listing.attributes && listing.category === 'hunting_outfitter_assets' && (listing.attributes as EquipmentAttributes).equipmentType && {
      icon: Package,
      label: 'Asset type',
      value: (listing.attributes as EquipmentAttributes).equipmentType,
      detail: (listing.attributes as EquipmentAttributes).make && (listing.attributes as EquipmentAttributes).model
        ? `${(listing.attributes as EquipmentAttributes).make} ${(listing.attributes as EquipmentAttributes).model}`
        : undefined,
    },
    listing.attributes && (listing.category === 'ranch_equipment' || listing.category === 'ranch_vehicles') && (listing.attributes as EquipmentAttributes).year && {
      icon: Calendar,
      label: 'Year',
      value: `${(listing.attributes as EquipmentAttributes).year}`,
    },
    listing.attributes && listing.category === 'hunting_outfitter_assets' && (listing.attributes as EquipmentAttributes).year && {
      icon: Calendar,
      label: 'Year',
      value: `${(listing.attributes as EquipmentAttributes).year}`,
    },
    listing.attributes && (listing.category === 'ranch_equipment' || listing.category === 'ranch_vehicles') && (listing.attributes as EquipmentAttributes).condition && {
      icon: Package,
      label: 'Condition',
      value: (listing.attributes as EquipmentAttributes).condition === 'new' ? 'New' :
             (listing.attributes as EquipmentAttributes).condition === 'excellent' ? 'Excellent' :
             (listing.attributes as EquipmentAttributes).condition === 'good' ? 'Good' :
             (listing.attributes as EquipmentAttributes).condition === 'fair' ? 'Fair' : 'For Parts',
      badge: (listing.attributes as EquipmentAttributes).condition === 'new' || (listing.attributes as EquipmentAttributes).condition === 'excellent'
        ? { variant: 'default' as const, label: (listing.attributes as EquipmentAttributes).condition === 'new' ? 'New' : 'Excellent', color: 'bg-accent/20 text-accent border-accent/40' }
        : undefined,
    },
    listing.attributes && listing.category === 'hunting_outfitter_assets' && (listing.attributes as EquipmentAttributes).condition && {
      icon: Package,
      label: 'Condition',
      value: (listing.attributes as EquipmentAttributes).condition === 'new' ? 'New' :
             (listing.attributes as EquipmentAttributes).condition === 'excellent' ? 'Excellent' :
             (listing.attributes as EquipmentAttributes).condition === 'good' ? 'Good' :
             (listing.attributes as EquipmentAttributes).condition === 'fair' ? 'Fair' : 'For Parts',
      badge: (listing.attributes as EquipmentAttributes).condition === 'new' || (listing.attributes as EquipmentAttributes).condition === 'excellent'
        ? { variant: 'default' as const, label: (listing.attributes as EquipmentAttributes).condition === 'new' ? 'New' : 'Excellent', color: 'bg-accent/20 text-accent border-accent/40' }
        : undefined,
    },
    listing.attributes && (listing.category === 'ranch_equipment' || listing.category === 'ranch_vehicles') && (listing.attributes as EquipmentAttributes).quantity && {
      icon: Package,
      label: 'Quantity',
      value: `${(listing.attributes as EquipmentAttributes).quantity} ${(listing.attributes as EquipmentAttributes).quantity === 1 ? 'item' : 'items'}`,
    },
    listing.attributes && listing.category === 'hunting_outfitter_assets' && (listing.attributes as EquipmentAttributes).quantity && {
      icon: Package,
      label: 'Quantity',
      value: `${(listing.attributes as EquipmentAttributes).quantity} ${(listing.attributes as EquipmentAttributes).quantity === 1 ? 'item' : 'items'}`,
    },
    // Sporting / Working Dogs
    listing.attributes && listing.category === 'sporting_working_dogs' && (listing.attributes as SportingWorkingDogAttributes).breed && {
      icon: Package,
      label: 'Breed',
      value: (listing.attributes as SportingWorkingDogAttributes).breed || '—',
      detail: formatAge((listing.attributes as SportingWorkingDogAttributes).age),
    },
    listing.attributes && listing.category === 'sporting_working_dogs' && (listing.attributes as SportingWorkingDogAttributes).sex && {
      icon: Package,
      label: 'Sex',
      value:
        (listing.attributes as SportingWorkingDogAttributes).sex === 'male' ? 'Male' :
        (listing.attributes as SportingWorkingDogAttributes).sex === 'female' ? 'Female' : 'Unknown',
    },
    listing.attributes && listing.category === 'sporting_working_dogs' && (listing.attributes as SportingWorkingDogAttributes).quantity && {
      icon: Package,
      label: 'Quantity',
      value: `${(listing.attributes as SportingWorkingDogAttributes).quantity} ${(listing.attributes as SportingWorkingDogAttributes).quantity === 1 ? 'dog' : 'dogs'}`,
    },
    // Horse / Equestrian
    listing.attributes && listing.category === 'horse_equestrian' && (listing.attributes as HorseAttributes).sex && {
      icon: Package,
      label: 'Sex',
      value:
        (listing.attributes as HorseAttributes).sex === 'stallion' ? 'Stallion' :
        (listing.attributes as HorseAttributes).sex === 'mare' ? 'Mare' :
        (listing.attributes as HorseAttributes).sex === 'gelding' ? 'Gelding' : 'Unknown',
      detail: formatAge((listing.attributes as HorseAttributes).age),
    },
    listing.attributes && listing.category === 'horse_equestrian' && (listing.attributes as HorseAttributes).quantity && {
      icon: Package,
      label: 'Quantity',
      value: `${(listing.attributes as HorseAttributes).quantity} ${(listing.attributes as HorseAttributes).quantity === 1 ? 'horse' : 'horses'}`,
    },
    listing.attributes && listing.category === 'horse_equestrian' && (listing.attributes as HorseAttributes).registered !== undefined && {
      icon: FileText,
      label: 'Registered',
      value: (listing.attributes as HorseAttributes).registered ? 'Yes' : 'No',
      badge: (listing.attributes as HorseAttributes).registered
        ? { variant: 'default' as const, label: 'Registered', color: 'bg-primary/20 text-primary border-primary/40' }
        : undefined,
    },
    listing.attributes && listing.category === 'horse_equestrian' && (listing.attributes as HorseAttributes).identification && {
      icon: Hash,
      label: 'Identification',
      value: (() => {
        const id = (listing.attributes as HorseAttributes).identification || {};
        const parts = [
          id.microchip ? `Microchip: ${id.microchip}` : null,
          id.brand ? `Brand: ${id.brand}` : null,
          id.tattoo ? `Tattoo: ${id.tattoo}` : null,
        ].filter(Boolean) as string[];
        return parts.length ? parts.join(' • ') : 'Provided';
      })(),
      detail: (() => {
        const id = (listing.attributes as HorseAttributes).identification || {};
        const markings = id.markings ? String(id.markings).trim() : '';
        return markings ? `Markings: ${markings}` : undefined;
      })(),
    },
    // Transport: seller delivery only
    (listing.transportOption === 'SELLER_TRANSPORT' || listing.transportOption === 'BUYER_TRANSPORT' || !listing.transportOption) && {
      icon: Truck,
      label: 'Transport',
      value: 'Seller arranges delivery',
      detail: 'Seller delivers; you coordinate after purchase.',
      badge: { variant: 'outline' as const, label: 'Seller delivery', color: '' },
    },
    listing.trust?.transportReady && !listing.transportOption && {
      icon: Truck,
      label: 'Transport',
      value: 'Ready',
      badge: { variant: 'outline' as const, label: 'Coordinated', color: '' },
    },
    listing.trust?.sellerOffersDelivery && !listing.transportOption && {
      icon: Truck,
      label: 'Delivery',
      value: 'Seller offers delivery',
      detail: 'Buyer & seller coordinate directly (platform does not arrange transport).',
      badge: { variant: 'outline' as const, label: 'Seller-provided', color: '' },
    },
    // Seller delivery details (radius, timeframe, notes) when set on the listing
    listing.deliveryDetails && (listing.deliveryDetails.maxDeliveryRadiusMiles != null || (listing.deliveryDetails.deliveryTimeframe || '').trim() || (listing.deliveryDetails.deliveryNotes || '').trim() || (listing.deliveryDetails.deliveryStatusExplanation || '').trim()) && {
      icon: Truck,
      label: 'Delivery details',
      value: [
        listing.deliveryDetails.maxDeliveryRadiusMiles != null ? `Up to ${listing.deliveryDetails.maxDeliveryRadiusMiles} miles` : null,
        (listing.deliveryDetails.deliveryTimeframe || '').trim()
          ? (DELIVERY_TIMEFRAME_OPTIONS.find((o) => o.value === listing.deliveryDetails!.deliveryTimeframe)?.label ?? (listing.deliveryDetails.deliveryTimeframe ?? '').replace(/_/g, '–'))
          : null,
      ].filter(Boolean).join(' · ') || 'Seller arranges delivery',
      detail: [listing.deliveryDetails.deliveryStatusExplanation, listing.deliveryDetails.deliveryNotes].filter(Boolean).join(' — ') || undefined,
      badge: { variant: 'outline' as const, label: 'From listing', color: '' },
    },
  ].filter(Boolean) as Array<{
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    value: string;
    detail?: string;
    badge?: { variant: 'default' | 'outline'; label: string; color: string };
  }>;

  return (
    <Card className={cn(
      'border-2 border-border/50 shadow-lg',
      'bg-gradient-to-br from-card via-card to-card/95',
      className
    )}>
      <CardHeader className="pb-3 border-b border-border/50">
        <CardTitle className="text-lg font-bold flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          Key Facts
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {facts.map((fact, index) => {
            const Icon = fact.icon;
            return (
              <motion.div
                key={fact.label}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg',
                  'bg-muted/30 border border-border/40',
                  'hover:bg-muted/50 hover:border-primary/30',
                  'transition-all duration-200 group'
                )}
              >
                <div className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                  'bg-primary/10 border border-primary/20',
                  'group-hover:bg-primary/20 transition-colors'
                )}>
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {fact.label}
                    </div>
                    {fact.badge && (
                      <Badge 
                        variant={fact.badge.variant}
                        className={cn(
                          'text-xs px-1.5 py-0',
                          fact.badge.color || ''
                        )}
                      >
                        {fact.badge.label}
                      </Badge>
                    )}
                  </div>
                  <div className="text-base font-bold text-foreground mt-0.5">
                    {fact.value}
                  </div>
                  {fact.detail && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {fact.detail}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
