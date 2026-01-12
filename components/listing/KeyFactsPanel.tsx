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
  Gavel
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Listing } from '@/lib/types';

interface KeyFactsPanelProps {
  listing: Listing;
  className?: string;
}

export function KeyFactsPanel({ listing, className }: KeyFactsPanelProps) {
  // Guard clause: return null if listing is not provided
  if (!listing) {
    return null;
  }

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
    listing.metadata?.breed && {
      icon: Package,
      label: 'Breed/Species',
      value: listing.metadata.breed,
      detail: listing.metadata.age || undefined,
    },
    listing.metadata?.quantity && {
      icon: Package,
      label: 'Quantity',
      value: `${listing.metadata.quantity} ${listing.metadata.quantity === 1 ? 'item' : 'items'}`,
    },
    listing.metadata?.healthStatus && {
      icon: Heart,
      label: 'Health Status',
      value: listing.metadata.healthStatus,
      badge: listing.metadata.healthStatus.toLowerCase().includes('excellent') 
        ? { variant: 'default' as const, label: 'Excellent', color: 'bg-accent/20 text-accent border-accent/40' }
        : undefined,
    },
    listing.metadata?.papers && {
      icon: FileText,
      label: 'Papers',
      value: 'Yes - Registered',
      badge: { variant: 'default' as const, label: 'Certified', color: 'bg-primary/20 text-primary border-primary/40' },
    },
    listing.trust?.insuranceAvailable && {
      icon: Shield,
      label: 'Insurance',
      value: 'Available',
      badge: { variant: 'outline' as const, label: 'Optional', color: '' },
    },
    listing.trust?.transportReady && {
      icon: Truck,
      label: 'Transport',
      value: 'Ready',
      badge: { variant: 'outline' as const, label: 'Coordinated', color: '' },
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
