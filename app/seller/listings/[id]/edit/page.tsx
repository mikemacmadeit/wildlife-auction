'use client';

/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { StepperForm } from '@/components/forms/StepperForm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Upload, X, ArrowLeft, Save, Loader2, AlertCircle, Send } from 'lucide-react';
import {
  ListingType,
  ListingCategory,
  ListingAttributes,
  WildlifeAttributes,
  CattleAttributes,
  EquipmentAttributes,
  WhitetailBreederAttributes,
} from '@/lib/types';
import { cn } from '@/lib/utils';
import { formatDateTimeLocal, parseDateTimeLocal } from '@/lib/datetime/datetimeLocal';
import { ALLOWED_DURATION_DAYS, isValidDurationDays } from '@/lib/listings/duration';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getListingById, updateListing, publishListing } from '@/lib/firebase/listings';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { SellerContentSkeleton } from '@/components/skeletons/SellerContentSkeleton';
import { CategoryAttributeForm } from '@/components/listings/CategoryAttributeForm';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DocumentUpload } from '@/components/compliance/DocumentUpload';
import { uploadListingImage } from '@/lib/firebase/storage';
import { getDocuments } from '@/lib/firebase/documents';
import { isAnimalCategory } from '@/lib/compliance/requirements';
import { HIDE_HORSE_AS_OPTION, HIDE_HUNTING_OUTFITTER_AS_OPTION, HIDE_RANCH_EQUIPMENT_AS_OPTION, HIDE_RANCH_VEHICLES_AS_OPTION, HIDE_SPORTING_WORKING_DOGS_AS_OPTION, DELIVERY_TIMEFRAME_OPTIONS } from '@/components/browse/filters/constants';

function EditListingPageContent() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const listingId = typeof params?.id === 'string' ? params.id : '';
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listingData, setListingData] = useState<{ metrics?: { bidCount?: number; views?: number; favorites?: number }; status?: string; currentBid?: number; type?: string; currentBidderId?: string } | null>(null);
  
  // Helper to determine if listing has bids (eBay rule: once bids exist, more fields are locked)
  const hasBids = (() => {
    if (!listingData) return false;
    const bidCount = listingData.metrics?.bidCount || 0;
    const hasBidder = Boolean(listingData.currentBidderId);
    const hasCurrentBid = Number(listingData.currentBid || 0) > 0;
    return bidCount > 0 || hasBidder || hasCurrentBid;
  })();
  
  const isActiveAuction = listingData?.status === 'active' && listingData?.type === 'auction';
  const isActiveAuctionWithBids = isActiveAuction && hasBids;
  const isActiveListing = listingData?.status === 'active';
  const [formData, setFormData] = useState<{
    type: ListingType | '';
    category: ListingCategory | '';
    title: string;
    description: string;
    price: string;
    startingBid: string;
    reservePrice: string;
    endsAt: string;
    durationDays: 1 | 3 | 5 | 7 | 10;
    location: { city: string; state: string; zip: string };
    images: string[];
    verification: boolean;
    transportType: 'seller' | 'buyer' | null;
    deliveryDetails: {
      maxDeliveryRadiusMiles: number | '';
      deliveryTimeframe: string;
      deliveryStatusExplanation: string;
      deliveryNotes: string;
    };
    protectedTransactionEnabled: boolean;
    protectedTransactionDays: 7 | 14 | null;
    bestOffer: {
      enabled: boolean;
      minPrice: string;
      autoAcceptPrice: string;
      allowCounter: boolean;
      offerExpiryHours: number;
    };
    // Union (not intersection): attributes vary by category.
    attributes: Partial<ListingAttributes>;
  }>({
    type: '',
    category: '',
    title: '',
    description: '',
    price: '',
    startingBid: '',
    reservePrice: '',
    endsAt: '',
    durationDays: 7,
    location: {
      city: '',
      state: 'TX',
      zip: '',
    },
    images: [],
    verification: false,
    transportType: 'seller' as 'seller' | 'buyer' | null,
    deliveryDetails: {
      maxDeliveryRadiusMiles: '' as number | '',
      deliveryTimeframe: '',
      deliveryStatusExplanation: '',
      deliveryNotes: '',
    },
    protectedTransactionEnabled: false,
    protectedTransactionDays: null,
    bestOffer: {
      enabled: false,
      minPrice: '',
      autoAcceptPrice: '',
      allowCounter: true,
      offerExpiryHours: 48,
    },
    attributes: {},
  });
  const [uploadingImages, setUploadingImages] = useState<Set<string>>(new Set());
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [existingDocuments, setExistingDocuments] = useState<any[]>([]);
  const [hasPendingDocument, setHasPendingDocument] = useState(false);
  const [triggerDocumentUpload, setTriggerDocumentUpload] = useState(false);
  const [fullListing, setFullListing] = useState<any | null>(null);
  const [initialSignature, setInitialSignature] = useState<string>('');
  const [hasSavedEditsSinceRejection, setHasSavedEditsSinceRejection] = useState(false);
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [publishMissingFields, setPublishMissingFields] = useState<string[]>([]);
  const [publishMissingStepIds, setPublishMissingStepIds] = useState<string[]>([]);
  const [requestedStepId, setRequestedStepId] = useState<string | null>(null);
  const publishFocusFieldRef = useRef<string | null>(null);
  const [sellerAnimalAttestationAccepted, setSellerAnimalAttestationAccepted] = useState(false);
  const imagesInputRef = useRef<HTMLInputElement | null>(null);

  // Load existing listing data from Firestore
  useEffect(() => {
    const fetchListing = async () => {
      if (!listingId) return;
      
      try {
        setLoading(true);
        const listing = await getListingById(listingId);
        
        if (!listing) {
          toast({
            title: 'Listing not found',
            description: 'We couldn\'t find this listing. It may have been removed or the link may be wrong.',
            variant: 'destructive',
          });
          router.push('/seller/listings');
          return;
        }

        // Verify ownership
        if (user && listing.sellerId !== user.uid) {
          toast({
            title: 'You can\'t edit this listing',
            description: 'You can only edit listings that you created. Please sign in with the account that owns this listing.',
            variant: 'destructive',
          });
          router.push('/seller/listings');
          return;
        }

        // Store full listing data for reference
        setListingData({
          metrics: listing.metrics,
          status: listing.status,
          currentBid: listing.currentBid,
          type: listing.type,
        });
        setFullListing(listing as any);
        setHasSavedEditsSinceRejection(false);

        // Populate form with existing data
        setFormData({
          // Back-compat: classified listings are deprecated; treat as fixed for editing.
          type: listing.type === 'classified' ? 'fixed' : listing.type,
          category: listing.category,
          title: listing.title,
          description: listing.description,
          price: listing.price?.toString() || '',
          startingBid: listing.startingBid?.toString() || '',
          reservePrice: listing.reservePrice?.toString() || '',
          endsAt: listing.endsAt ? formatDateTimeLocal(new Date(listing.endsAt as any)) : '',
          durationDays: isValidDurationDays((listing as any).durationDays) ? (listing as any).durationDays : 7,
          location: {
            city: listing.location?.city ?? '',
            state: listing.location?.state ?? 'TX',
            zip: listing.location?.zip ?? '',
          },
          images: listing.images || [],
          verification: listing.trust?.verified || false,
          transportType: 'seller', // Seller always arranges delivery; no buyer-transport option.
          deliveryDetails: {
            maxDeliveryRadiusMiles: (listing as any).deliveryDetails?.maxDeliveryRadiusMiles ?? ('' as number | ''),
            deliveryTimeframe: (listing as any).deliveryDetails?.deliveryTimeframe ?? '',
            deliveryStatusExplanation: (listing as any).deliveryDetails?.deliveryStatusExplanation ?? '',
            deliveryNotes: (listing as any).deliveryDetails?.deliveryNotes ?? '',
          },
          protectedTransactionEnabled: listing.protectedTransactionEnabled || false,
          protectedTransactionDays: listing.protectedTransactionDays || null,
          bestOffer: {
            enabled: Boolean(listing.bestOfferSettings?.enabled ?? listing.bestOfferEnabled),
            minPrice:
              listing.bestOfferSettings?.minPrice !== undefined
                ? String(listing.bestOfferSettings.minPrice)
                : (listing.bestOfferMinPrice !== undefined ? String(listing.bestOfferMinPrice) : ''),
            autoAcceptPrice:
              listing.bestOfferSettings?.autoAcceptPrice !== undefined
                ? String(listing.bestOfferSettings.autoAcceptPrice)
                : (listing.bestOfferAutoAcceptPrice !== undefined ? String(listing.bestOfferAutoAcceptPrice) : ''),
            allowCounter: listing.bestOfferSettings?.allowCounter !== false,
            offerExpiryHours: listing.bestOfferSettings?.offerExpiryHours ?? 48,
          },
          attributes: (listing.attributes || {}) as Partial<ListingAttributes>,
        });

        // Used to require a real edit before resubmitting a rejected listing.
        const sig = JSON.stringify({
          type: listing.type,
          category: listing.category,
          title: listing.title,
          description: listing.description,
          price: listing.price ?? null,
          startingBid: listing.startingBid ?? null,
          reservePrice: listing.reservePrice ?? null,
          durationDays: isValidDurationDays((listing as any).durationDays) ? (listing as any).durationDays : 7,
          location: listing.location,
          images: listing.images || [],
          verification: listing.trust?.verified || false,
          transportType: 'seller',
          deliveryDetails: (listing as any).deliveryDetails ?? { maxDeliveryRadiusMiles: '', deliveryTimeframe: '', deliveryStatusExplanation: '', deliveryNotes: '' },
          protectedTransactionEnabled: listing.protectedTransactionEnabled || false,
          protectedTransactionDays: listing.protectedTransactionDays || null,
          bestOffer: {
            enabled: Boolean(listing.bestOfferSettings?.enabled ?? listing.bestOfferEnabled),
            minPrice: listing.bestOfferSettings?.minPrice ?? listing.bestOfferMinPrice ?? null,
            autoAcceptPrice: listing.bestOfferSettings?.autoAcceptPrice ?? listing.bestOfferAutoAcceptPrice ?? null,
            allowCounter: listing.bestOfferSettings?.allowCounter !== false,
            offerExpiryHours: listing.bestOfferSettings?.offerExpiryHours ?? 48,
          },
          attributes: listing.attributes || {},
        });
        setSellerAnimalAttestationAccepted((listing as any)?.sellerAnimalAttestationAccepted === true);
        setInitialSignature(sig);

        // Load existing documents
        try {
          const docs = await getDocuments('listing', listingId);
          setExistingDocuments(docs);
        } catch (docError) {
          console.error('Error loading documents:', docError);
          setExistingDocuments([]);
        }
      } catch (err: any) {
        console.error('Error fetching listing:', err);
        toast({
          title: 'Error loading listing',
          description: err.message || 'Failed to load listing. Please try again.',
          variant: 'destructive',
        });
        router.push('/seller/listings');
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      fetchListing();
    }
  }, [listingId, user, authLoading, router, toast]);

  if (authLoading || loading) {
    return <SellerContentSkeleton />;
  }

  const steps = [
    {
      id: 'type-category',
      title: 'Listing Type & Category',
      description: 'Choose what type of listing you want to create',
      content: (
        <div className="space-y-6">
          <div className="space-y-3">
            <Label className="text-base font-semibold">Listing Type</Label>
            <RadioGroup
              value={formData.type}
              onValueChange={(value) => {
                const nextType = value as ListingType;
                const next: any = { ...formData, type: nextType };
                // Smooth type switching: clear incompatible fields immediately so save/publish never fails.
                if (nextType === 'auction') {
                  next.price = '';
                  next.bestOffer = { ...next.bestOffer, enabled: false, minPrice: '', autoAcceptPrice: '' };
                } else {
                  next.startingBid = '';
                  next.reservePrice = '';
                  next.endsAt = '';
                }
                setFormData(next);
              }}
              disabled={isActiveListing}
            >
              {[
              { value: 'auction', label: 'Auction', desc: 'Bidders compete, highest bid wins' },
              { value: 'fixed', label: 'Fixed Price', desc: 'Set a price, buyer pays immediately' },
              ].map((option) => (
                <div key={option.value} className="flex items-start space-x-3 min-h-[44px]">
                  <RadioGroupItem value={option.value} id={option.value} className="mt-1" />
                  <Label htmlFor={option.value} className="cursor-pointer flex-1">
                    <div className="font-medium">{option.label}</div>
                    <div className="text-sm text-muted-foreground">{option.desc}</div>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <Label className="text-base font-semibold">Category</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card
                className={`cursor-pointer transition-all border-2 ${
                  formData.category === 'whitetail_breeder'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                } ${isActiveAuctionWithBids ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  if (isActiveAuctionWithBids) return;
                  setFormData({ 
                    ...formData, 
                    category: 'whitetail_breeder',
                    location: { ...formData.location, state: 'TX' }
                  });
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4 md:flex-col md:gap-3 md:text-center">
                    <div className="flex-shrink-0">
                      <div
                        className="w-12 h-12"
                        style={{
                          WebkitMaskImage: `url('/images/whitetail breeder icon.png')`,
                          WebkitMaskSize: 'contain',
                          WebkitMaskRepeat: 'no-repeat',
                          WebkitMaskPosition: 'center',
                          maskImage: `url('/images/whitetail breeder icon.png')`,
                          maskSize: 'contain',
                          maskRepeat: 'no-repeat',
                          maskPosition: 'center',
                          backgroundColor: 'hsl(var(--primary))',
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-base font-bold leading-tight">Whitetail Breeder</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        TPWD-permitted whitetail deer breeding facilities
                      </p>
                      <div className="flex flex-wrap gap-2 justify-start md:justify-center">
                        <Badge variant="outline" className="text-[11px]">TPWD Required</Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer transition-all border-2 ${
                  formData.category === 'wildlife_exotics'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                } ${isActiveAuctionWithBids ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  if (isActiveAuctionWithBids) return;
                  setFormData({ 
                    ...formData, 
                    category: 'wildlife_exotics',
                    location: { ...formData.location, state: 'TX' }
                  });
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4 md:flex-col md:gap-3 md:text-center">
                    <div className="flex-shrink-0">
                      <div
                        className="w-12 h-12"
                        style={{
                          WebkitMaskImage: `url('/images/Fallow Icon.png')`,
                          WebkitMaskSize: 'contain',
                          WebkitMaskRepeat: 'no-repeat',
                          WebkitMaskPosition: 'center',
                          maskImage: `url('/images/Fallow Icon.png')`,
                          maskSize: 'contain',
                          maskRepeat: 'no-repeat',
                          maskPosition: 'center',
                          backgroundColor: 'hsl(var(--primary))',
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-base font-bold leading-tight">Registered &amp; Specialty Livestock</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        Axis deer, blackbuck, fallow deer, and other registered ranch species
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {!HIDE_HORSE_AS_OPTION && (
              <Card
                className={`cursor-pointer transition-all border-2 ${
                  formData.category === 'horse_equestrian'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                } ${isActiveAuctionWithBids ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  if (isActiveAuctionWithBids) return;
                  setFormData({
                    ...formData,
                    category: 'horse_equestrian',
                    location: { ...formData.location, state: 'TX' },
                  });
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4 md:flex-col md:gap-3 md:text-center">
                    <div className="flex-shrink-0">
                      <div
                        className="w-12 h-12"
                        style={{
                          WebkitMaskImage: `url('/images/Horse.png')`,
                          WebkitMaskSize: 'contain',
                          WebkitMaskRepeat: 'no-repeat',
                          WebkitMaskPosition: 'center',
                          maskImage: `url('/images/Horse.png')`,
                          maskSize: 'contain',
                          maskRepeat: 'no-repeat',
                          maskPosition: 'center',
                          backgroundColor: 'hsl(var(--primary))',
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-base font-bold leading-tight">Horse &amp; Equestrian</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">Horses, tack, and equestrian-related listings</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              )}

              {!HIDE_SPORTING_WORKING_DOGS_AS_OPTION && (
              <Card
                className={`cursor-pointer transition-all border-2 ${
                  formData.category === 'sporting_working_dogs'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                } ${isActiveAuctionWithBids ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  if (isActiveAuctionWithBids) return;
                  setFormData({
                    ...formData,
                    category: 'sporting_working_dogs',
                    location: { ...formData.location, state: 'TX' },
                  });
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4 md:flex-col md:gap-3 md:text-center">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 icon-primary-color mask-icon-dog" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-base font-bold leading-tight">Sporting &amp; Working Dogs</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        Bird dogs, hog dogs, tracking dogs, and other working/sporting dogs
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              )}

              <Card
                className={`cursor-pointer transition-all border-2 ${
                  formData.category === 'cattle_livestock'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                } ${isActiveAuctionWithBids ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  if (isActiveAuctionWithBids) return;
                  setFormData({ 
                    ...formData, 
                    category: 'cattle_livestock',
                    location: { ...formData.location, state: 'TX' }
                  });
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4 md:flex-col md:gap-3 md:text-center">
                    <div className="flex-shrink-0">
                      <div
                        className="w-12 h-12"
                        style={{
                          WebkitMaskImage: `url('/images/Bull Icon.png')`,
                          WebkitMaskSize: 'contain',
                          WebkitMaskRepeat: 'no-repeat',
                          WebkitMaskPosition: 'center',
                          maskImage: `url('/images/Bull Icon.png')`,
                          maskSize: 'contain',
                          maskRepeat: 'no-repeat',
                          maskPosition: 'center',
                          backgroundColor: 'hsl(var(--primary))',
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-base font-bold leading-tight">Cattle</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        Bulls, cows, heifers, and steers
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer transition-all border-2 ${
                  formData.category === 'farm_animals'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                } ${isActiveAuctionWithBids ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  if (isActiveAuctionWithBids) return;
                  setFormData({
                    ...formData,
                    category: 'farm_animals',
                    location: { ...formData.location, state: 'TX' }
                  });
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4 md:flex-col md:gap-3 md:text-center">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 icon-primary-color mask-icon-fallow" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-base font-bold leading-tight">Farm Animals</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        Goats, sheep, pigs, alpacas, and other farm animals
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {!HIDE_HUNTING_OUTFITTER_AS_OPTION && (
              <Card
                className={`cursor-pointer transition-all border-2 ${
                  formData.category === 'hunting_outfitter_assets'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                } ${isActiveAuctionWithBids ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  if (isActiveAuctionWithBids) return;
                  setFormData({
                    ...formData,
                    category: 'hunting_outfitter_assets',
                    // Assets can be multi-state, so don't force TX
                  });
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4 md:flex-col md:gap-3 md:text-center">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 icon-primary-color mask-icon-hunting-blind" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-base font-bold leading-tight">Hunting &amp; Outfitter Assets</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        Camera systems, blinds, and water/well systems
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              )}

              {!HIDE_RANCH_EQUIPMENT_AS_OPTION && (
              <Card
                className={`cursor-pointer transition-all border-2 ${
                  formData.category === 'ranch_equipment'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                } ${isActiveAuctionWithBids ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  if (isActiveAuctionWithBids) return;
                  setFormData({ 
                    ...formData, 
                    category: 'ranch_equipment',
                    // Equipment can be multi-state, so don't force TX
                  });
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4 md:flex-col md:gap-3 md:text-center">
                    <div className="flex-shrink-0">
                      <div
                        className="w-12 h-12"
                        style={{
                          WebkitMaskImage: `url('/images/Tractor Icon.png')`,
                          WebkitMaskSize: 'contain',
                          WebkitMaskRepeat: 'no-repeat',
                          WebkitMaskPosition: 'center',
                          maskImage: `url('/images/Tractor Icon.png')`,
                          maskSize: 'contain',
                          maskRepeat: 'no-repeat',
                          maskPosition: 'center',
                          backgroundColor: 'hsl(var(--primary))',
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-base font-bold leading-tight">Ranch Equipment &amp; Attachments</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        Tractors, skid steers, machinery, and attachments/implements (vehicles &amp; trailers listed separately)
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              )}

              {!HIDE_RANCH_VEHICLES_AS_OPTION && (
              <Card
                className={`cursor-pointer transition-all border-2 ${
                  formData.category === 'ranch_vehicles'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                } ${isActiveAuctionWithBids ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  if (isActiveAuctionWithBids) return;
                  setFormData({
                    ...formData,
                    category: 'ranch_vehicles',
                    // Vehicles can be multi-state, so don't force TX
                  });
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4 md:flex-col md:gap-3 md:text-center">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 icon-primary-color mask-icon-top-drive" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-base font-bold leading-tight">Ranch Vehicles &amp; Trailers</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        Trucks, UTVs/ATVs, and trailers (stock, gooseneck, flatbed, utility)
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              )}
            </div>
          </div>

          {/* Status - Read-only for active listings with bids (eBay rules) */}
          {isActiveAuctionWithBids && (
            <Card className="border-2 border-primary/20 bg-primary/5">
              <CardContent className="pt-4 pb-4 px-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-foreground mb-1">Limited Editing (eBay Policy)</p>
                    <p className="text-sm text-muted-foreground">
                      This auction has {listingData.metrics?.bidCount || 0} bid(s). Following eBay rules, you can only edit:
                    </p>
                    <ul className="text-sm text-muted-foreground mt-2 ml-4 list-disc space-y-1">
                      <li>Description</li>
                      <li>Photos</li>
                      <li>Some attributes</li>
                    </ul>
                    <p className="text-sm text-muted-foreground mt-2">
                      <strong>Locked fields:</strong> Title, Category, Type, Starting Bid, Reserve Price, Duration, Location, Trust badges
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {isActiveAuction && !hasBids && (
            <Card className="border-2 border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/25">
              <CardContent className="pt-4 pb-4 px-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-foreground mb-1">Auction Started</p>
                    <p className="text-sm text-muted-foreground">
                      This auction is active. Once bids are placed, title, category, and pricing will be locked per eBay policy.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ),
      validate: () => !!formData.type && !!formData.category,
    },
    {
      id: 'details',
      title: 'Listing Details',
      description: 'Update your listing information',
      content: (
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-base font-semibold">Title</Label>
            <Input
              id="title"
              placeholder="e.g., Trophy Whitetail Buck"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              disabled={isActiveAuctionWithBids}
              className={cn(
                "min-h-[48px] text-base bg-background",
                publishMissingFields.includes('title') ? 'ring-2 ring-destructive border-destructive' : null,
                isActiveAuctionWithBids ? 'opacity-60 cursor-not-allowed' : ''
              )}
            />
            {isActiveAuctionWithBids && (
              <p className="text-xs text-muted-foreground">
                Title cannot be changed once an auction has bids (eBay policy).
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-base font-semibold">Description</Label>
            <Textarea
              id="description"
              placeholder="Provide detailed information about your listing..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={cn(
                "min-h-[120px] text-base bg-background",
                publishMissingFields.includes('description') ? 'ring-2 ring-destructive border-destructive' : null
              )}
            />
          </div>

          {/* Price fields - disabled if listing has bids */}
          {listingData?.status === 'active' && (listingData?.metrics?.bidCount || 0) > 0 ? (
            <Card className="border-2 border-border/50 bg-background/50">
              <CardContent className="pt-4 pb-4 px-4">
                <p className="text-sm text-muted-foreground font-medium mb-2">Current Listing Status:</p>
                {formData.type === 'auction' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Current Bid:</span>
                      <span className="font-bold text-foreground">${listingData.currentBid?.toLocaleString() || 'No bids'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Bids:</span>
                      <Badge variant="secondary">{listingData.metrics?.bidCount || 0}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Pricing cannot be changed while listing has active bids.
                    </p>
                  </div>
                )}
                {formData.type === 'fixed' && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Price:</span>
                    <span className="font-bold text-foreground">${formData.price ? parseFloat(formData.price).toLocaleString() : 'N/A'}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              {formData.type === 'fixed' && (
                  <div className="space-y-2">
                    <Label htmlFor="price" className="text-base font-semibold">Price</Label>
                    <Input
                      id="price"
                      type="number"
                      placeholder="0.00"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      disabled={isActiveListing}
                      className={cn(
                        "min-h-[48px] text-base bg-background",
                        publishMissingFields.includes('price') ? 'ring-2 ring-destructive border-destructive' : null
                      )}
                    />
                  </div>
              )}

              {formData.type === 'auction' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="starting-bid" className="text-base font-semibold">Starting Bid</Label>
                    <Input
                      id="starting-bid"
                      type="number"
                      placeholder="0.00"
                      value={formData.startingBid}
                      onChange={(e) => setFormData({ ...formData, startingBid: e.target.value })}
                      disabled={isActiveListing}
                      className={cn(
                        "min-h-[48px] text-base bg-background",
                        publishMissingFields.includes('startingBid') ? 'ring-2 ring-destructive border-destructive' : null
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reserve-price" className="text-base font-semibold">
                      Reserve Price (Optional)
                    </Label>
                    <Input
                      id="reserve-price"
                      type="number"
                      placeholder="0.00"
                      value={formData.reservePrice}
                      onChange={(e) => setFormData({ ...formData, reservePrice: e.target.value })}
                      disabled={isActiveListing}
                      className={cn(
                        "min-h-[48px] text-base bg-background",
                        publishMissingFields.includes('reservePrice') ? 'ring-2 ring-destructive border-destructive' : null
                      )}
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum price you'll accept. Won't be shown to bidders.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="listing-duration" className="text-base font-semibold">
                      Listing duration <span className="text-destructive">*</span>
                    </Label>
                    <Select
                      value={String(formData.durationDays)}
                      onValueChange={(v) => {
                        const n = Number(v);
                        if (isValidDurationDays(n)) setFormData({ ...formData, durationDays: n });
                      }}
                      disabled={listingData?.status === 'active'}
                    >
                      <SelectTrigger
                        id="listing-duration"
                        className={cn(
                          "min-h-[48px] text-base bg-background",
                          publishMissingFields.includes('durationDays') ? 'ring-2 ring-destructive border-destructive' : null
                        )}
                      >
                        <SelectValue placeholder="Select duration" />
                      </SelectTrigger>
                      <SelectContent>
                        {ALLOWED_DURATION_DAYS.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d} day{d === 1 ? '' : 's'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Listings can run up to 10 days. Duration starts when the listing goes live.</p>
                  </div>
                </>
              )}

              {/* Best Offer (Fixed) */}
              {formData.type === 'fixed' && (
                <div className="rounded-xl border bg-muted/10 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-extrabold tracking-tight">Or Best Offer</div>
                      <div className="text-xs text-muted-foreground">
                        Let buyers make offers. You can accept, counter, or decline.
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="best-offer-enabled"
                        checked={formData.bestOffer.enabled}
                        onCheckedChange={(v) =>
                          setFormData({
                            ...formData,
                            bestOffer: { ...formData.bestOffer, enabled: Boolean(v) },
                          })
                        }
                      />
                      <Label htmlFor="best-offer-enabled" className="text-sm cursor-pointer">
                        Enable
                      </Label>
                    </div>
                  </div>

                  {formData.bestOffer.enabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="best-offer-min" className="text-sm font-semibold">
                          Minimum offer (optional)
                        </Label>
                        <Input
                          id="best-offer-min"
                          type="number"
                          placeholder="0"
                          value={formData.bestOffer.minPrice}
                          onChange={(e) => {
                            const minPrice = parseFloat(e.target.value) || 0;
                            const autoAccept = parseFloat(formData.bestOffer.autoAcceptPrice) || 0;
                            
                            // If auto-accept is set and would be lower than new minimum, clear it
                            const newAutoAccept = autoAccept > 0 && autoAccept < minPrice ? '' : formData.bestOffer.autoAcceptPrice;
                            
                            setFormData({ 
                              ...formData, 
                              bestOffer: { 
                                ...formData.bestOffer, 
                                minPrice: e.target.value,
                                autoAcceptPrice: newAutoAccept
                              } 
                            });
                          }}
                          className="min-h-[44px]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="best-offer-auto" className="text-sm font-semibold">
                          Auto-accept at (optional)
                        </Label>
                        <Input
                          id="best-offer-auto"
                          type="number"
                          placeholder="0"
                          value={formData.bestOffer.autoAcceptPrice}
                          onChange={(e) => {
                            // Always update so user can type (e.g. "2000") without being blocked on intermediate values ("2", "20", "200")
                            setFormData({
                              ...formData,
                              bestOffer: { ...formData.bestOffer, autoAcceptPrice: e.target.value },
                            });
                          }}
                          className="min-h-[44px]"
                        />
                        {(() => {
                          const minPrice = parseFloat(formData.bestOffer.minPrice) || 0;
                          const autoAccept = parseFloat(formData.bestOffer.autoAcceptPrice) || 0;
                          if (minPrice > 0 && autoAccept > 0 && autoAccept < minPrice) {
                            return (
                              <p className="text-xs text-destructive font-medium">
                                Auto-accept price must be at least ${minPrice.toLocaleString()} (same as or higher than your minimum offer).
                              </p>
                            );
                          }
                          return null;
                        })()}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="best-offer-expiry" className="text-sm font-semibold">
                          Offer expiry (hours)
                        </Label>
                        <Input
                          id="best-offer-expiry"
                          type="number"
                          min={1}
                          max={168}
                          value={formData.bestOffer.offerExpiryHours > 0 ? String(formData.bestOffer.offerExpiryHours) : ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            const numValue = value === '' ? 0 : Number(value);
                            setFormData({
                              ...formData,
                              bestOffer: { ...formData.bestOffer, offerExpiryHours: numValue },
                            });
                          }}
                          onBlur={(e) => {
                            const value = e.target.value;
                            const numValue = Number(value);
                            if (!value || isNaN(numValue) || numValue < 1) {
                              setFormData({
                                ...formData,
                                bestOffer: { ...formData.bestOffer, offerExpiryHours: 48 },
                              });
                            }
                          }}
                          className="min-h-[44px]"
                        />
                        <div className="text-xs text-muted-foreground">Default: 48 hours</div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-sm font-semibold">Allow seller counters</div>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="best-offer-allow-counter"
                            checked={formData.bestOffer.allowCounter}
                            onCheckedChange={(v) =>
                              setFormData({
                                ...formData,
                                bestOffer: { ...formData.bestOffer, allowCounter: Boolean(v) },
                              })
                            }
                          />
                          <Label htmlFor="best-offer-allow-counter" className="text-sm cursor-pointer">
                            Allow counter offers
                          </Label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city" className="text-base font-semibold">City</Label>
              <Input
                id="city"
                placeholder="City"
                value={formData.location.city}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    location: { ...formData.location, city: e.target.value },
                  })
                }
                disabled={isActiveAuctionWithBids}
                className={cn(
                  "min-h-[48px] text-base bg-background",
                  publishMissingFields.includes('location.city') ? 'ring-2 ring-destructive border-destructive' : null,
                  isActiveAuctionWithBids ? 'opacity-60 cursor-not-allowed' : ''
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state" className="text-base font-semibold">State</Label>
              <Input
                id="state"
                placeholder="TX"
                value={formData.location.state}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    location: { ...formData.location, state: e.target.value },
                  })
                }
                disabled={['whitetail_breeder', 'wildlife_exotics', 'cattle_livestock', 'farm_animals'].includes(formData.category) || isActiveAuctionWithBids}
                className={cn(
                  "min-h-[48px] text-base bg-background",
                  publishMissingFields.includes('location.state') ? 'ring-2 ring-destructive border-destructive' : null,
                  isActiveAuctionWithBids ? 'opacity-60 cursor-not-allowed' : ''
                )}
              />
              {['whitetail_breeder', 'wildlife_exotics', 'cattle_livestock', 'farm_animals'].includes(formData.category) && (
                <p className="text-xs text-muted-foreground">
                  State is locked to TX for animal listings
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="zip" className="text-base font-semibold">ZIP Code</Label>
              <Input
                id="zip"
                placeholder="ZIP Code"
                value={formData.location.zip}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    location: { ...formData.location, zip: e.target.value },
                  })
                }
                disabled={isActiveAuctionWithBids}
                className={cn(
                  "min-h-[48px] text-base bg-background",
                  isActiveAuctionWithBids ? 'opacity-60 cursor-not-allowed' : ''
                )}
              />
            </div>
          </div>
        </div>
      ),
      validate: () => {
        return (
          !!formData.title &&
          (formData.type === 'fixed'
            ? true // Price optional for existing listings
            : !!formData.startingBid) && // Starting bid required for auctions
          isValidDurationDays(formData.durationDays)
        );
      },
    },
    {
      id: 'media',
      title: 'Photos',
      description: 'Update photos for your listing',
      content: (
        <div
          className={cn(
            "space-y-4",
            publishMissingFields.includes('photos') ? 'rounded-lg ring-2 ring-destructive p-2' : null
          )}
        >
          {formData.images.length > 0 && (
            <div>
              <Label className="text-base font-semibold mb-2 block">Current Photos</Label>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {formData.images.map((img, idx) => {
                  const isUrl = img.startsWith('/') || img.startsWith('http');
                  return (
                    <div key={idx} className="relative aspect-square rounded-md overflow-hidden border-2 border-border/50 group">
                      {isUrl ? (
                        <Image
                          src={img}
                          alt={`Photo ${idx + 1}`}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 33vw, 150px"
                          unoptimized={img.startsWith('http')}
                        />
                      ) : (
                        <img 
                          src={img}
                          alt={`Photo ${idx + 1}`} 
                          className="w-full h-full object-cover"
                        />
                      )}
                      {/* Upload progress overlay for in-flight uploads */}
                      {uploadingImages.has(img) ? (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                          <div className="text-center text-white">
                            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                            <div className="mt-2 text-xs font-semibold">
                              Uploading… {Math.round(Number(uploadProgress[img] || 0))}%
                            </div>
                          </div>
                        </div>
                      ) : null}
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 z-10"
                        onClick={() => {
                          setFormData({
                            ...formData,
                            images: formData.images.filter((_, i) => i !== idx),
                          });
                        }}
                        disabled={uploadingImages.has(img)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Card className="border-2 border-dashed p-8 text-center min-h-[200px] flex items-center justify-center">
            <div className="space-y-4">
              <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[48px] min-w-[200px]"
                  disabled={!listingId || uploadingImages.size > 0 || formData.images.length >= 10}
                  onClick={() => {
                    if (!listingId) {
                      toast({ title: 'Upload not ready', description: 'Please save your listing first, then you can add photos.', variant: 'destructive' });
                      return;
                    }
                    if (uploadingImages.size > 0) return;
                    if (formData.images.length >= 10) return;
                    imagesInputRef.current?.click();
                  }}
                >
                  {formData.images.length > 0 ? 'Add More Photos' : 'Upload Photos'}
                </Button>
                <Input
                  ref={imagesInputRef}
                  id="images"
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  disabled={!listingId || uploadingImages.size > 0 || formData.images.length >= 10}
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    // Allow re-selecting the same file after upload attempt.
                    e.currentTarget.value = '';

                    if (!listingId) {
                      toast({ title: 'Upload not ready', description: 'Please save your listing first, then you can add photos.', variant: 'destructive' });
                      return;
                    }
                    if (!user?.uid) {
                      toast({ title: 'Sign in required', description: 'You need to sign in to add photos. Please sign in and try again.', variant: 'destructive' });
                      return;
                    }

                    const remaining = Math.max(0, 10 - (formData.images?.length || 0));
                    const toUpload = files.slice(0, remaining);
                    if (toUpload.length === 0) return;

                    for (const file of toUpload) {
                      const key = `${file.name}:${file.size}:${file.lastModified}`;

                      // Add a placeholder token into the images list so we can show progress inline.
                      setUploadingImages((prev) => new Set(prev).add(key));
                      setUploadProgress((prev) => ({ ...prev, [key]: 0 }));
                      setFormData((prev) => ({
                        ...prev,
                        images: [...(prev.images || []), key].slice(0, 10),
                      }));

                      try {
                        const res = await uploadListingImage(listingId, file, (p) => {
                          setUploadProgress((prev) => ({ ...prev, [key]: p.progress }));
                        });

                        setFormData((prev) => ({
                          ...prev,
                          images: (prev.images || []).map((v) => (v === key ? res.url : v)).slice(0, 10),
                        }));
                      } catch (err: any) {
                        // Remove placeholder on failure
                        setFormData((prev) => ({
                          ...prev,
                          images: (prev.images || []).filter((v) => v !== key),
                        }));
                        toast({
                          title: 'Upload failed',
                          description: err?.message || 'Could not upload photo. Please try again.',
                          variant: 'destructive',
                        });
                      } finally {
                        setUploadingImages((prev) => {
                          const next = new Set(prev);
                          next.delete(key);
                          return next;
                        });
                        setUploadProgress((prev) => {
                          const next = { ...prev };
                          delete next[key];
                          return next;
                        });
                      }
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Upload up to 10 photos (JPG, PNG). {formData.images.length}/10 uploaded.
                </p>
                {formData.images.length >= 10 ? (
                  <p className="text-xs text-muted-foreground mt-1">You’ve reached the 10 photo limit.</p>
                ) : null}
              </div>
            </div>
          </Card>
        </div>
      ),
      validate: () => true, // Images are optional
    },
    {
      id: 'attributes',
      title: 'Specifications',
      description: 'Provide category-specific details',
      content: formData.category ? (
        <div className="space-y-4">
          <CategoryAttributeForm
            category={formData.category}
            attributes={formData.attributes}
            onChange={(attrs) => setFormData({ ...formData, attributes: attrs })}
          />

          {formData.category &&
            isAnimalCategory(formData.category as any) &&
            formData.category !== 'whitetail_breeder' && (
              <div
                className={`space-y-3 p-4 border rounded-lg ${
                  !sellerAnimalAttestationAccepted ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted/30'
                }`}
              >
                <Label className="text-base font-semibold">
                  Seller acknowledgment <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="seller-animal-attestation-edit"
                    checked={sellerAnimalAttestationAccepted}
                    onCheckedChange={(checked) => setSellerAnimalAttestationAccepted(checked === true)}
                  />
                  <Label htmlFor="seller-animal-attestation-edit" className="cursor-pointer flex-1">
                    <div className="font-medium">
                      I acknowledge I am solely responsible for all representations, permits/records, and legal compliance for this animal listing, and that
                      Agchange does not take custody of animals.
                    </div>
                  </Label>
                </div>
                {!sellerAnimalAttestationAccepted ? (
                  <p className="text-sm text-destructive">You must accept this acknowledgment to publish an animal listing.</p>
                ) : null}
              </div>
            )}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          Please select a category first
        </div>
      ),
      validate: () => {
        if (!formData.category) return false;
        if (formData.category !== 'whitetail_breeder' && isAnimalCategory(formData.category as any) && !sellerAnimalAttestationAccepted) {
          toast({
            title: 'Acknowledgment required',
            description: 'Please check the box to confirm you\'ve read and accept the seller acknowledgment for this animal listing.',
            variant: 'destructive',
          });
          return false;
        }
        if (formData.category === 'whitetail_breeder') {
          const attrs = formData.attributes as Partial<WhitetailBreederAttributes>;
          return !!(
            attrs.tpwdBreederPermitNumber?.trim() &&
            attrs.breederFacilityId?.trim() &&
            attrs.deerIdTag?.trim() &&
            attrs.sex &&
            attrs.quantity &&
            attrs.quantity >= 1 &&
            attrs.cwdDisclosureChecklist?.cwdAware &&
            attrs.cwdDisclosureChecklist?.cwdCompliant
          );
        }
        return true;
      },
    },
    {
      id: 'documents',
      title: 'Compliance Documents',
      description: 'Upload required compliance documents',
      content: formData.category === 'whitetail_breeder' ? (
        <div className="space-y-4">
          <Alert className="bg-yellow-50 border-yellow-200">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertDescription className="text-yellow-800">
              <strong>TPWD Breeder Permit Required:</strong> You must upload your TPWD Breeder Permit document. 
              The listing will be submitted for compliance review after you save.
            </AlertDescription>
          </Alert>
          <DocumentUpload
            entityType="listing"
            entityId={listingId}
            documentType="TPWD_BREEDER_PERMIT"
            onUploadComplete={async (documentUrl, documentId) => {
              console.log('onUploadComplete called with:', { documentUrl, documentId });
              
              // Clear pending file flag
              setHasPendingDocument(false);
              
              // Reload documents from Firestore to ensure we have the latest
              try {
                const docs = await getDocuments('listing', listingId);
                console.log('Documents after upload:', docs);
                setExistingDocuments(docs);
              } catch (error) {
                console.error('Error reloading documents:', error);
                // Fallback to updating state manually
                setExistingDocuments(prev => {
                  const existing = prev.find(d => d.type === 'TPWD_BREEDER_PERMIT');
                  if (existing) {
                    return prev.map(d => d.id === existing.id ? { ...d, url: documentUrl, id: documentId, type: 'TPWD_BREEDER_PERMIT' } : d);
                  }
                  return [...prev, { type: 'TPWD_BREEDER_PERMIT', url: documentUrl, id: documentId }];
                });
              }
              
              toast({
                title: 'Document uploaded',
                description: 'Your TPWD Breeder Permit has been uploaded successfully.',
              });
            }}
            permitNumber={(formData.attributes as Partial<WhitetailBreederAttributes>)?.tpwdBreederPermitNumber}
            onPermitNumberChange={(value) => {
              setFormData({
                ...formData,
                // Cast to avoid excess-property checks against a non-discriminated union.
                attributes: {
                  ...(formData.attributes as any),
                  tpwdBreederPermitNumber: value,
                } as any,
              });
            }}
            required={formData.category === 'whitetail_breeder'}
            existingDocumentUrl={existingDocuments.find(d => d.type === 'TPWD_BREEDER_PERMIT')?.url}
            existingDocumentId={existingDocuments.find(d => d.type === 'TPWD_BREEDER_PERMIT')?.id}
            onPendingFileChange={setHasPendingDocument}
            uploadTrigger={triggerDocumentUpload}
          />
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          No compliance documents required for this category.
        </div>
      ),
      validate: () => true, // Documents are handled separately
    },
    {
      id: 'verification',
      title: 'Verification & Add-ons',
      description: 'Update verification and protection options',
      content: (
        <div className="space-y-6">
          <Card className="p-4">
            <div className="flex items-start space-x-3 min-h-[44px]">
              <Checkbox
                id="verification"
                checked={formData.verification}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, verification: checked as boolean })
                }
                disabled={isActiveAuctionWithBids}
              />
              <Label htmlFor="verification" className="cursor-pointer flex-1">
                <div className="font-medium mb-1">Professional Verification ($100)</div>
                <div className="text-sm text-muted-foreground">
                  Admin review for marketplace workflow completeness. Builds buyer trust.
                </div>
              </Label>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-muted-foreground">
              Note: Buyer protection is available via <strong>Protected Transaction</strong> when enabled.
            </div>
          </Card>

          {/* Delivery — seller always arranges */}
          <Card className="p-4 border-2">
            <div className="space-y-2">
              <h3 className="font-semibold text-base">Delivery</h3>
              <p className="text-sm text-muted-foreground">
                You are responsible for scheduling delivery. You’ll propose a delivery window; the buyer agrees to that date. You coordinate until you agree. The buyer confirms receipt to complete the transaction. Agchange does not arrange transport.
              </p>
              <p className="text-xs text-muted-foreground pt-1">
                Seller arranges delivery · Buyer confirms receipt
              </p>
            </div>
          </Card>

          {/* Protected Transaction */}
          <Card className="p-4 border-2">
            <div className="space-y-4">
              <div className="flex items-start space-x-3 min-h-[44px]">
                <Checkbox
                  id="protected-transaction"
                  checked={formData.protectedTransactionEnabled}
                  onCheckedChange={(checked) =>
                    setFormData({ 
                      ...formData, 
                      protectedTransactionEnabled: checked as boolean,
                      protectedTransactionDays: checked ? 7 : null
                    })
                  }
                />
                <Label htmlFor="protected-transaction" className="cursor-pointer flex-1">
                  <div className="font-medium mb-1">Protected Transaction</div>
                  <div className="text-sm text-muted-foreground">
                    Enable buyer protection period. Buyer can request refund/dispute within selected days after delivery.
                  </div>
                </Label>
              </div>
              {formData.protectedTransactionEnabled && (
                <div className="ml-7 space-y-2">
                  <Label htmlFor="protected-days" className="text-sm font-semibold">Protection Period</Label>
                  <Select
                    value={formData.protectedTransactionDays?.toString() || '7'}
                    onValueChange={(value) =>
                      setFormData({ 
                        ...formData, 
                        protectedTransactionDays: parseInt(value) as 7 | 14 
                      })
                    }
                  >
                    <SelectTrigger id="protected-days" className="min-h-[48px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Buyer can request refund or dispute within {formData.protectedTransactionDays} days after delivery confirmation.
                  </p>
                </div>
              )}
            </div>
          </Card>
        </div>
      ),
      validate: () => true, // Verification options are optional
    },
    {
      id: 'transportation',
      title: 'Transportation',
      description: 'Delivery radius, timeframe & notes',
      content: (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Buyers see this when you offer delivery. It helps them decide before buying and sets clear expectations.
          </p>
          <Card className="p-4 border-2">
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-maxDeliveryRadiusMiles" className="font-medium">
                  Maximum delivery radius (miles)
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  How far you’re willing to deliver from your location. Leave blank if you prefer to discuss per buyer.
                </p>
                <Input
                  id="edit-maxDeliveryRadiusMiles"
                  type="number"
                  min={0}
                  max={500}
                  placeholder="e.g. 150"
                  className="mt-2 max-w-[140px]"
                  value={(formData.deliveryDetails?.maxDeliveryRadiusMiles === '' || formData.deliveryDetails?.maxDeliveryRadiusMiles === undefined) ? '' : formData.deliveryDetails?.maxDeliveryRadiusMiles}
                  onChange={(e) => {
                    const v = e.target.value;
                    const dd = formData.deliveryDetails ?? { maxDeliveryRadiusMiles: '' as number | '', deliveryTimeframe: '', deliveryStatusExplanation: '', deliveryNotes: '' };
                    setFormData({ ...formData, deliveryDetails: { ...dd, maxDeliveryRadiusMiles: v === '' ? '' : (parseInt(v, 10) || 0) } });
                  }}
                />
              </div>
              <div>
                <Label htmlFor="edit-deliveryTimeframe" className="font-medium">
                  Delivery timeframe
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When you plan to deliver. Buyers can filter by this on the browse page.
                </p>
                <Select
                  value={formData.deliveryDetails?.deliveryTimeframe ?? ''}
                  onValueChange={(v) => {
                    const dd = formData.deliveryDetails ?? { maxDeliveryRadiusMiles: '' as number | '', deliveryTimeframe: '', deliveryStatusExplanation: '', deliveryNotes: '' };
                    setFormData({ ...formData, deliveryDetails: { ...dd, deliveryTimeframe: v, ...(v !== '30_60' ? { deliveryStatusExplanation: '' } : {}) } });
                  }}
                >
                  <SelectTrigger id="edit-deliveryTimeframe" className="mt-2">
                    <SelectValue placeholder="Select timeframe" />
                  </SelectTrigger>
                  <SelectContent>
                    {DELIVERY_TIMEFRAME_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {formData.deliveryDetails?.deliveryTimeframe === '30_60' && (
                <div>
                  <Label htmlFor="edit-deliveryStatusExplanation" className="font-medium">
                    Delivery status explanation <span className="text-destructive">*</span>
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    For 30–60 day delivery, briefly explain why (e.g. custom order, seasonal availability, transport scheduling).
                  </p>
                  <Textarea
                    id="edit-deliveryStatusExplanation"
                    placeholder="e.g. Delivery scheduled after weaning. We coordinate a pickup window once the animal is ready."
                    className="mt-2 min-h-[80px]"
                    value={formData.deliveryDetails?.deliveryStatusExplanation ?? ''}
                    onChange={(e) => {
                      const dd = formData.deliveryDetails ?? { maxDeliveryRadiusMiles: '' as number | '', deliveryTimeframe: '', deliveryStatusExplanation: '', deliveryNotes: '' };
                      setFormData({ ...formData, deliveryDetails: { ...dd, deliveryStatusExplanation: e.target.value } });
                    }}
                  />
                </div>
              )}
              <div>
                <Label htmlFor="edit-deliveryNotes" className="font-medium">
                  Additional delivery notes
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Loading requirements, facility access, preferred contact times, or anything else buyers should know.
                </p>
                <Textarea
                  id="edit-deliveryNotes"
                  placeholder="e.g. Loading ramp available. Call when 30 minutes out."
                  className="mt-2 min-h-[80px]"
                  value={formData.deliveryDetails?.deliveryNotes ?? ''}
                  onChange={(e) => {
                    const dd = formData.deliveryDetails ?? { maxDeliveryRadiusMiles: '' as number | '', deliveryTimeframe: '', deliveryStatusExplanation: '', deliveryNotes: '' };
                    setFormData({ ...formData, deliveryDetails: { ...dd, deliveryNotes: e.target.value } });
                  }}
                />
              </div>
            </div>
          </Card>
        </div>
      ),
      validate: () => {
        const dd = formData.deliveryDetails ?? {};
        if ((dd.deliveryTimeframe ?? '') === '30_60') {
          const expl = (dd.deliveryStatusExplanation ?? '').trim();
          if (!expl) {
            toast({
              title: 'Explanation required',
              description: 'For 30–60 day delivery, please add a short explanation so buyers know the current status of the delivery.',
              variant: 'destructive',
            });
            return false;
          }
        }
        return true;
      },
    },
    {
      id: 'review',
      title: 'Review & Save',
      description: 'Review your changes before saving',
      content: (
        <div className="space-y-6">
          <Card className="border-2 border-border/50 bg-card">
            <CardHeader>
              <CardTitle className="text-xl font-extrabold">Listing Summary</CardTitle>
              <CardDescription>Review all changes before saving</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground font-medium mb-1">Type</div>
                  <div className="font-semibold text-foreground capitalize">{formData.type}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground font-medium mb-1">Category</div>
                  <div className="font-semibold text-foreground capitalize">{formData.category}</div>
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground font-medium mb-1">Title</div>
                <div className="font-semibold text-foreground">{formData.title}</div>
              </div>
              {formData.description && (
                <div>
                  <div className="text-sm text-muted-foreground font-medium mb-1">Description</div>
                  <div className="text-sm whitespace-pre-line text-foreground">{formData.description}</div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground font-medium mb-1">Location</div>
                  <div className="font-semibold text-foreground">
                    {formData.location.city}, {formData.location.state}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground font-medium mb-1">Price/Bid</div>
                  <div className="font-semibold text-foreground">
                    {formData.type === 'auction'
                      ? formData.startingBid
                        ? `Starting: $${parseFloat(formData.startingBid).toLocaleString()}`
                        : 'No starting bid set'
                      : formData.price
                      ? `$${parseFloat(formData.price).toLocaleString()}`
                      : 'No price set'}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground font-medium mb-1">Photos</div>
                <div className="font-semibold text-foreground">{formData.images.length} photo(s)</div>
                {formData.images.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {formData.images.slice(0, 4).map((img, idx) => {
                      const isUrl = img.startsWith('/') || img.startsWith('http');
                      return (
                        <div key={idx} className="relative w-full aspect-square rounded-md overflow-hidden border border-border/50">
                          {isUrl ? (
                            <Image
                              src={img}
                              alt={`Preview ${idx + 1}`}
                              fill
                              className="object-cover"
                              sizes="(max-width: 768px) 25vw, 100px"
                              unoptimized={img.startsWith('http')}
                            />
                          ) : (
                            <img 
                              src={img} 
                              alt={`Preview ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                      );
                    })}
                    {formData.images.length > 4 && (
                      <div className="w-full aspect-square rounded-md border border-border/50 bg-muted/50 flex items-center justify-center">
                        <span className="text-xs font-semibold text-muted-foreground">+{formData.images.length - 4}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
                {formData.verification && (
                  <Badge variant="secondary" className="font-semibold">Verification</Badge>
                )}
                <Badge variant="secondary" className="font-semibold">Seller arranges delivery</Badge>
              </div>
              {(() => {
                const dd = formData.deliveryDetails ?? { maxDeliveryRadiusMiles: '' as number | '', deliveryTimeframe: '', deliveryStatusExplanation: '', deliveryNotes: '' };
                const tf = (dd.deliveryTimeframe ?? '').trim();
                const hasAny = (dd.maxDeliveryRadiusMiles !== '' && dd.maxDeliveryRadiusMiles !== undefined) || tf || (dd.deliveryStatusExplanation ?? '').trim() || (dd.deliveryNotes ?? '').trim();
                const timeframeLabel = tf ? (DELIVERY_TIMEFRAME_OPTIONS.find((o) => o.value === tf)?.label ?? tf) : '';
                return hasAny ? (
                  <div className="pt-3 border-t border-border/50 space-y-1.5">
                    <div className="text-sm text-muted-foreground font-medium">Delivery details</div>
                    {dd.maxDeliveryRadiusMiles !== '' && dd.maxDeliveryRadiusMiles !== undefined && <div className="text-sm"><span className="text-muted-foreground">Max radius:</span> <span className="font-medium">{dd.maxDeliveryRadiusMiles} miles</span></div>}
                    {timeframeLabel && <div className="text-sm"><span className="text-muted-foreground">Timeframe:</span> <span className="font-medium">{timeframeLabel}</span></div>}
                    {(dd.deliveryStatusExplanation ?? '').trim() && <div className="text-sm"><span className="text-muted-foreground">Delivery status:</span> <span className="font-medium whitespace-pre-wrap">{(dd.deliveryStatusExplanation ?? '').trim()}</span></div>}
                    {(dd.deliveryNotes ?? '').trim() && <div className="text-sm"><span className="text-muted-foreground">Notes:</span> <span className="font-medium whitespace-pre-wrap">{(dd.deliveryNotes ?? '').trim()}</span></div>}
                  </div>
                ) : null;
              })()}
            </CardContent>
          </Card>
        </div>
      ),
      validate: () => true, // Review step always valid
    },
  ];

  // Helper function to prepare listing updates
  const prepareListingUpdates = () => {
    const updates: any = {
      title: formData.title,
      description: formData.description,
      type: formData.type as ListingType,
      category: formData.category,
      location: formData.location,
      images: formData.images,
      trust: {
        verified: formData.verification,
        insuranceAvailable: false,
        transportReady: true,
        sellerOffersDelivery: true,
      },
      transportOption: 'SELLER_TRANSPORT' as const,
      ...((() => {
        const dd = formData.deliveryDetails ?? { maxDeliveryRadiusMiles: '' as number | '', deliveryTimeframe: '', deliveryStatusExplanation: '', deliveryNotes: '' };
        const maxMiles = dd.maxDeliveryRadiusMiles === '' || dd.maxDeliveryRadiusMiles === undefined ? undefined : Number(dd.maxDeliveryRadiusMiles);
        const timeframe = (dd.deliveryTimeframe ?? '').trim() || undefined;
        const statusExpl = (dd.deliveryStatusExplanation ?? '').trim() || undefined;
        const notes = (dd.deliveryNotes ?? '').trim() || undefined;
        const hasAny = maxMiles !== undefined || timeframe !== undefined || statusExpl !== undefined || notes !== undefined;
        return hasAny ? { deliveryDetails: { ...(maxMiles !== undefined && { maxDeliveryRadiusMiles: maxMiles }), ...(timeframe && { deliveryTimeframe: timeframe }), ...(statusExpl && { deliveryStatusExplanation: statusExpl }), ...(notes && { deliveryNotes: notes }) } } : {};
      })()),
      attributes: formData.attributes as ListingAttributes,
      protectedTransactionEnabled: formData.protectedTransactionEnabled,
      protectedTransactionDays: formData.protectedTransactionDays,
    };

    if (
      formData.category &&
      isAnimalCategory(formData.category as any) &&
      formData.category !== 'whitetail_breeder'
    ) {
      updates.sellerAnimalAttestationAccepted = sellerAnimalAttestationAccepted === true;
      updates.sellerAnimalAttestationAcceptedAt = sellerAnimalAttestationAccepted ? new Date() : null;
    }

    // Add pricing based on type
    if (formData.type === 'fixed') {
      updates.price = parseFloat(formData.price || '0');
      if (formData.bestOffer.enabled) {
        const bo: any = {
          enabled: true,
          allowCounter: formData.bestOffer.allowCounter !== false,
          offerExpiryHours: formData.bestOffer.offerExpiryHours || 48,
        };
        if (formData.bestOffer.minPrice) bo.minPrice = parseFloat(formData.bestOffer.minPrice);
        if (formData.bestOffer.autoAcceptPrice) bo.autoAcceptPrice = parseFloat(formData.bestOffer.autoAcceptPrice);
        updates.bestOfferSettings = bo;
      } else {
        updates.bestOfferSettings = { enabled: false, allowCounter: true, offerExpiryHours: 48 };
      }
    } else if (formData.type === 'auction') {
      if (formData.startingBid) {
        updates.startingBid = parseFloat(formData.startingBid);
      }
      if (formData.reservePrice) {
        updates.reservePrice = parseFloat(formData.reservePrice);
      }
    }

    // Duration model: allow durationDays changes only while not active.
    if (listingData?.status !== 'active' && isValidDurationDays(formData.durationDays)) {
      updates.durationDays = formData.durationDays;
    }

    // Only include protectedTermsVersion if protected transaction is enabled
    if (formData.protectedTransactionEnabled) {
      updates.protectedTermsVersion = 'v1';
    }

    return updates;
  };

  // Save changes from any step (doesn't redirect)
  const handleSave = async () => {
    if (!user?.uid) {
      toast({
        title: 'Sign in required',
        description: 'You need to sign in to save changes. Please sign in and try again.',
        variant: 'destructive',
      });
      return;
    }

    // If there's a pending document, trigger upload first and wait for it
    if (hasPendingDocument && formData.category === 'whitetail_breeder') {
      console.log('Pending document detected, triggering upload...');
      setTriggerDocumentUpload(true);
      
      // Wait for upload to complete (check every 500ms, max 10 seconds)
      let attempts = 0;
      while (attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 500));
        try {
          const docs = await getDocuments('listing', listingId, 'TPWD_BREEDER_PERMIT');
          if (docs && docs.length > 0) {
            console.log('✅ Document upload completed, found:', docs.length, 'documents');
            const allDocs = await getDocuments('listing', listingId);
            setExistingDocuments(allDocs);
            setHasPendingDocument(false);
            setTriggerDocumentUpload(false);
            break;
          }
        } catch (error) {
          console.error('Error checking for uploaded document:', error);
        }
        attempts++;
      }
      
      if (attempts >= 20) {
        console.warn('⚠️ Upload timeout - document may still be uploading');
        setTriggerDocumentUpload(false);
      }
    }

    // Require at least one real change before saving (prevents empty resubmits).
    const currentSignature = JSON.stringify({
      type: formData.type,
      category: formData.category,
      title: formData.title,
      description: formData.description,
      price: formData.price || null,
      startingBid: formData.startingBid || null,
      reservePrice: formData.reservePrice || null,
      durationDays: formData.durationDays,
      location: formData.location,
      images: formData.images || [],
      verification: formData.verification,
      transportType: formData.transportType,
      deliveryDetails: formData.deliveryDetails ?? { maxDeliveryRadiusMiles: '', deliveryTimeframe: '', deliveryStatusExplanation: '', deliveryNotes: '' },
      protectedTransactionEnabled: formData.protectedTransactionEnabled,
      protectedTransactionDays: formData.protectedTransactionDays,
      bestOffer: formData.bestOffer,
      attributes: formData.attributes,
      sellerAnimalAttestationAccepted: sellerAnimalAttestationAccepted ? true : false,
    });
    if (initialSignature && currentSignature === initialSignature) {
      toast({
        title: 'No changes to save',
        description: 'Please make at least one change to your listing before saving.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    try {
      const updates = prepareListingUpdates();
      
      // Check if this is a whitetail breeder listing and if a TPWD document exists
      if (formData.category === 'whitetail_breeder') {
        // Always check Firestore directly to ensure we have the latest documents
        let hasTPWDDocument = false;
        try {
          const docs = await getDocuments('listing', listingId, 'TPWD_BREEDER_PERMIT');
          hasTPWDDocument = docs && docs.length > 0;
          console.log('TPWD documents found:', docs.length, docs);
          
          // Update existingDocuments state with latest from Firestore
          if (docs.length > 0) {
            const allDocs = await getDocuments('listing', listingId);
            setExistingDocuments(allDocs);
          }
        } catch (docError) {
          console.error('Error checking documents:', docError);
          // Fallback to state check
          hasTPWDDocument = existingDocuments.some(d => d.type === 'TPWD_BREEDER_PERMIT');
        }
        
        console.log('Has TPWD document:', hasTPWDDocument);
        
        // If TPWD document exists and listing isn't already approved, set to pending review
        if (hasTPWDDocument) {
          // Get current listing status
          const currentListing = await getListingById(listingId);
          console.log('Current listing status:', currentListing?.status, 'complianceStatus:', currentListing?.complianceStatus);
          
          // Only update status if listing is currently draft or active (not already pending)
          // Don't override if it's already approved or rejected
          if (currentListing) {
            if (currentListing.status !== 'pending' && 
                currentListing.complianceStatus !== 'approved' && 
                currentListing.complianceStatus !== 'rejected') {
              updates.complianceStatus = 'pending_review';
              // IMPORTANT: Do NOT set listing.status client-side.
              // Firestore rules restrict certain status transitions (e.g. whitetail breeder),
              // and publish/review status changes should be performed by server routes.
              console.log('Setting complianceStatus to pending_review');
            } else if (currentListing.complianceStatus === 'none' || !currentListing.complianceStatus) {
              // If no compliance status set yet, set it to pending_review
              updates.complianceStatus = 'pending_review';
              // IMPORTANT: Do NOT set listing.status client-side (see note above).
              console.log('Setting complianceStatus to pending_review (was none)');
            }
          }
        } else {
          console.log('No TPWD document found - listing will not be set to pending review');
        }
      }
      
      await updateListing(user.uid, listingId, updates);
      setInitialSignature(currentSignature);
      if (fullListing?.status === 'removed') {
        setHasSavedEditsSinceRejection(true);
      }

      // Immediately reload from Firestore so the UI reflects what actually persisted.
      // This prevents "Saved!" toasts when rules/normalization reverted some fields (e.g. endsAt).
      try {
        const refreshed = await getListingById(listingId);
        if (refreshed) {
          setFullListing(refreshed as any);
          setListingData((prev) => ({
            ...(prev || {}),
            metrics: (refreshed as any).metrics,
            status: (refreshed as any).status,
            currentBid: (refreshed as any).currentBid,
            type: (refreshed as any).type,
          }));
          setFormData((prev) => ({
            ...prev,
            type: (refreshed as any).type,
            category: (refreshed as any).category,
            title: String((refreshed as any).title || ''),
            description: String((refreshed as any).description || ''),
            price: (refreshed as any).price?.toString?.() || '',
            startingBid: (refreshed as any).startingBid?.toString?.() || '',
            reservePrice: (refreshed as any).reservePrice?.toString?.() || '',
            endsAt: (refreshed as any).endsAt ? formatDateTimeLocal(new Date((refreshed as any).endsAt)) : '',
          }));
        }
      } catch {
        // best-effort; don't block save UX
      }

      // Reload documents after save to ensure we have the latest state
      try {
        const docs = await getDocuments('listing', listingId);
        setExistingDocuments(docs);
        console.log('Documents after save:', docs);
      } catch (docError) {
        console.error('Error reloading documents after save:', docError);
      }

      // Show appropriate message based on whether it's going to review
      const isPendingReview = updates.complianceStatus === 'pending_review';
      toast({
        title: isPendingReview ? 'Changes saved - Submitted for review' : 'Changes saved!',
        description: isPendingReview 
          ? 'Your listing has been submitted for compliance review. An admin will review it shortly.'
          : 'Your changes have been saved successfully.',
      });
    } catch (err: any) {
      console.error('Error saving listing:', err);
      toast({
        title: 'Couldn\'t save changes',
        description: err.message || 'Something went wrong while saving. Please try again. If it keeps happening, contact support.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Complete and publish (redirects to listings page)
  const handleComplete = async (data: Record<string, unknown>) => {
    if (!user?.uid) {
      toast({
        title: 'Authentication required',
        description: 'You must be signed in to update listings.',
        variant: 'destructive',
      });
      return;
    }

    if (
      listingData?.status === 'draft' &&
      formData.category &&
      isAnimalCategory(formData.category as any) &&
      formData.category !== 'whitetail_breeder' &&
      !sellerAnimalAttestationAccepted
    ) {
      toast({
        title: 'Acknowledgment required',
        description: 'Please check the box to confirm you\'ve read and accept the seller acknowledgment before publishing this animal listing.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    try {
      // Clear any prior publish hints when they try again.
      setPublishMissingFields([]);
      setPublishMissingStepIds([]);
      publishFocusFieldRef.current = null;
      setRequestedStepId(null);

      const updates = prepareListingUpdates();
      await updateListing(user.uid, listingId, updates);

      // If this is still a draft, the primary action should actually publish it (go live).
      if (listingData?.status === 'draft') {
        const result = await publishListing(user.uid, listingId);
        toast({
          title: result?.pendingReview ? 'Submitted for review' : 'Listing published',
          description: result?.pendingReview
            ? 'Your listing is now pending compliance review.'
            : 'Your listing is now live.',
        });
      } else {
        toast({
          title: 'Changes saved',
          description: 'Your listing has been updated.',
        });
      }

      // Redirect back to listings page
      router.push('/seller/listings');
    } catch (err: any) {
      console.error('Error updating listing:', err);

      if (err?.code === 'LISTING_VALIDATION_FAILED' && Array.isArray(err?.missing) && err.missing.length > 0) {
        // Normalize server missing keys like "durationDays (invalid)" -> "durationDays"
        const rawMissing: string[] = err.missing.map((m: any) => String(m)).filter(Boolean);
        const missing = rawMissing.map((m: string) => m.split(' ')[0]).filter(Boolean);

        setPublishMissingFields(missing);

        const missingSet = new Set(missing);
        const stepsNeedingAttention: string[] = [];
        if (missingSet.has('type') || missingSet.has('category')) stepsNeedingAttention.push('type-category');
        // Photos required (server uses "photos")
        if (missingSet.has('photos')) stepsNeedingAttention.push('media');
        // Everything else in this server validation lives on details (title/desc/location/price/auction fields)
        const needsDetails = missing.some((m) =>
          ['title', 'description', 'price', 'startingBid', 'reservePrice', 'durationDays', 'location.city', 'location.state'].includes(m)
        );
        if (needsDetails) stepsNeedingAttention.push('details');

        setPublishMissingStepIds(stepsNeedingAttention);

        // Jump to the earliest relevant step so the user can fix in sequence.
        const stepOrder = ['type-category', 'details', 'media'];
        const targetStep = stepOrder.find((s) => stepsNeedingAttention.includes(s)) || stepsNeedingAttention[0] || 'details';
        setRequestedStepId(targetStep);

        // Focus the first missing field on that step (best-effort).
        const first = missing[0];
        const focusId =
          first === 'photos'
            ? 'photos'
            : first === 'location.city'
              ? 'city'
              : first === 'location.state'
                ? 'state'
                : first === 'startingBid'
                  ? 'starting-bid'
                  : first === 'reservePrice'
                    ? 'reserve-price'
                    : first === 'durationDays'
                      ? 'listing-duration'
                      : first;
        publishFocusFieldRef.current = focusId;
        setTimeout(() => {
          const el = document.getElementById(focusId);
          if (el && typeof (el as any).focus === 'function') (el as any).focus();
          if (el && typeof (el as any).scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 250);
      }

      toast({
        title: listingData?.status === 'draft' ? 'Couldn\'t publish listing' : 'Couldn\'t save changes',
        description: err.message || 'Something went wrong. Please try again. If it keeps happening, contact support.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const isRejected = fullListing?.status === 'removed';
  const rejectionReason = typeof fullListing?.rejectionReason === 'string' ? fullListing.rejectionReason : '';
  const rejectedAt: Date | null = fullListing?.rejectedAt instanceof Date ? fullListing.rejectedAt : null;
  const resubmittedForRejectionAt: Date | null =
    fullListing?.resubmittedForRejectionAt instanceof Date ? fullListing.resubmittedForRejectionAt : null;
  const alreadyResubmittedForThisRejection =
    rejectedAt && resubmittedForRejectionAt && rejectedAt.getTime() === resubmittedForRejectionAt.getTime();
  const canResubmit = isRejected && hasSavedEditsSinceRejection && !alreadyResubmittedForThisRejection;

  const handleResubmit = async () => {
    if (!user?.uid) return;
    setIsResubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/listings/${listingId}/resubmit`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok !== true) {
        const err: any = new Error(data?.message || data?.error || 'Failed to resubmit listing');
        err.code = data?.code;
        throw err;
      }
      toast({
        title: 'Resubmitted',
        description: 'Your listing was resubmitted for admin approval.',
      });
      router.push('/seller/listings');
    } catch (e: any) {
      toast({
        title: 'Couldn’t resubmit yet',
        description:
          e?.code === 'MUST_EDIT_BEFORE_RESUBMIT'
            ? 'Please edit and save the listing first, then resubmit.'
            : e?.message || 'Failed to resubmit listing.',
        variant: 'destructive',
      });
    } finally {
      setIsResubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-bottom-nav-safe md:pb-6">
      <div className="container mx-auto px-4 py-4 sm:py-6 md:py-8 max-w-4xl space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="min-h-[44px] min-w-[44px]"
              asChild
            >
              <Link href="/seller/listings">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold text-foreground mb-2">
                Edit Listing
              </h1>
              <p className="text-base md:text-lg text-muted-foreground">
                Update your listing information
              </p>
            </div>
          </div>
        </div>

        {isRejected && (
          <Alert className="bg-destructive/10 border-destructive/20">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <AlertDescription className="space-y-2">
              <div className="font-semibold text-destructive">This listing was rejected</div>
              {rejectionReason ? (
                <div className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">Reason:</span> {rejectionReason}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Make updates to the listing, then resubmit for review.
                </div>
              )}
              {alreadyResubmittedForThisRejection ? (
                <div className="text-sm text-muted-foreground">
                  This listing has already been resubmitted and is awaiting review.
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    type="button"
                    variant="outline"
                    className="font-semibold"
                    disabled={!canResubmit || isResubmitting}
                    onClick={handleResubmit}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {isResubmitting ? 'Resubmitting…' : 'Resubmit for approval'}
                  </Button>
                  {!hasSavedEditsSinceRejection && (
                    <div className="text-xs text-muted-foreground">
                      Make at least one change and click <span className="font-semibold">Save</span> first.
                    </div>
                  )}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Listing Info Banner */}
        {formData.title && (
          <Card className="border-2 border-border/50 bg-card">
            <CardContent className="pt-6 pb-6 px-4 md:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground font-medium mb-1">Editing</p>
                  <h2 className="text-xl font-bold text-foreground mb-2">{formData.title}</h2>
                </div>
                <Button variant="outline" asChild className="min-h-[44px] font-semibold">
                  <Link href={`/listing/${listingId}`} target="_blank">
                    View Live Listing
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stepper Form */}
        <Card className="border-2 border-border/50 bg-card">
          <CardContent className="pt-6 pb-6 px-4 md:px-6">
            <StepperForm 
              steps={steps} 
              onComplete={handleComplete} 
              allowStepJump={true}
              onSave={handleSave}
              saving={saving}
              showSaveButton={true}
              completeButtonLabel={listingData?.status === 'draft' ? 'Publish Listing' : 'Save Changes'}
              activeStepId={requestedStepId}
              attentionStepIds={publishMissingStepIds}
              onStepChange={() => {
                if (requestedStepId) setRequestedStepId(null);
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function EditListingPage() {
  return (
    <RequireAuth>
      <EditListingPageContent />
    </RequireAuth>
  );
}
