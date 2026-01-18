'use client';

/* eslint-disable @next/next/no-img-element */

import { useState, useEffect } from 'react';
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
import { ListingType, ListingCategory, ListingAttributes, WildlifeAttributes, CattleAttributes, EquipmentAttributes, WhitetailBreederAttributes } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { getListingById, updateListing, publishListing } from '@/lib/firebase/listings';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { CategoryAttributeForm } from '@/components/listings/CategoryAttributeForm';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DocumentUpload } from '@/components/compliance/DocumentUpload';
import { uploadListingImage } from '@/lib/firebase/storage';
import { getDocuments } from '@/lib/firebase/documents';

function EditListingPageContent() {
  const router = useRouter();
  const params = useParams();
  const listingId = params.id as string;
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [listingData, setListingData] = useState<{ metrics?: { bidCount?: number; views?: number; favorites?: number }; status?: string; currentBid?: number; type?: string } | null>(null);
  const [formData, setFormData] = useState<{
    type: ListingType | '';
    category: ListingCategory | '';
    title: string;
    description: string;
    price: string;
    startingBid: string;
    reservePrice: string;
    endsAt: string;
    location: { city: string; state: string; zip: string };
    images: string[];
    verification: boolean;
    transport: boolean;
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
    location: {
      city: '',
      state: 'TX',
      zip: '',
    },
    images: [],
    verification: false,
    transport: false,
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
            description: 'The listing you are trying to edit does not exist.',
            variant: 'destructive',
          });
          router.push('/seller/listings');
          return;
        }

        // Verify ownership
        if (user && listing.sellerId !== user.uid) {
          toast({
            title: 'Unauthorized',
            description: 'You can only edit your own listings.',
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
          type: listing.type,
          category: listing.category,
          title: listing.title,
          description: listing.description,
          price: listing.price?.toString() || '',
          startingBid: listing.startingBid?.toString() || '',
          reservePrice: listing.reservePrice?.toString() || '',
          endsAt: listing.endsAt ? new Date(listing.endsAt).toISOString().slice(0, 16) : '',
          location: {
            city: listing.location?.city ?? '',
            state: listing.location?.state ?? 'TX',
            zip: listing.location?.zip ?? '',
          },
          images: listing.images || [],
          verification: listing.trust?.verified || false,
          transport: listing.trust?.transportReady || false,
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
          endsAt: listing.endsAt ? new Date(listing.endsAt).toISOString() : null,
          location: listing.location,
          images: listing.images || [],
          verification: listing.trust?.verified || false,
          transport: listing.trust?.transportReady || false,
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
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
          <p className="text-muted-foreground">Loading listing...</p>
        </div>
      </div>
    );
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
              disabled={listingData?.status === 'active' && (listingData?.metrics?.bidCount || 0) > 0}
            >
              {[
                { value: 'auction', label: 'Auction', desc: 'Bidders compete, highest bid wins' },
                { value: 'fixed', label: 'Fixed Price', desc: 'Set a price, buyer pays immediately' },
                { value: 'classified', label: 'Classified', desc: 'Contact seller to negotiate price' },
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

          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>Texas-Only:</strong> All animal transactions (whitetail breeder, exotics, cattle) are restricted to Texas residents only. Equipment listings can be multi-state.
            </AlertDescription>
          </Alert>
          <div className="space-y-3">
            <Label className="text-base font-semibold">Category</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card
                className={`cursor-pointer transition-all border-2 ${
                  formData.category === 'whitetail_breeder'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                } ${listingData?.status === 'active' && (listingData?.metrics?.bidCount || 0) > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  if (listingData?.status === 'active' && (listingData?.metrics?.bidCount || 0) > 0) return;
                  setFormData({ 
                    ...formData, 
                    category: 'whitetail_breeder',
                    location: { ...formData.location, state: 'TX' }
                  });
                }}
              >
                <CardContent className="p-6 text-center space-y-3">
                  <div className="flex justify-center">
                    <div 
                      className="w-16 h-16"
                      style={{
                        WebkitMaskImage: `url('/images/whitetail breeder icon.png')`,
                        WebkitMaskSize: 'contain',
                        WebkitMaskRepeat: 'no-repeat',
                        WebkitMaskPosition: 'center',
                        maskImage: `url('/images/whitetail breeder icon.png')`,
                        maskSize: 'contain',
                        maskRepeat: 'no-repeat',
                        maskPosition: 'center',
                        backgroundColor: 'hsl(var(--primary))'
                      }}
                    />
                  </div>
                  <h3 className="text-lg font-bold">Whitetail Breeder</h3>
                  <p className="text-sm text-muted-foreground">
                    TPWD-permitted whitetail deer breeding facilities
                  </p>
                  <Badge variant="outline" className="text-xs">TPWD Required</Badge>
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer transition-all border-2 ${
                  formData.category === 'wildlife_exotics'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                } ${listingData?.status === 'active' && (listingData?.metrics?.bidCount || 0) > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  if (listingData?.status === 'active' && (listingData?.metrics?.bidCount || 0) > 0) return;
                  setFormData({ 
                    ...formData, 
                    category: 'wildlife_exotics',
                    location: { ...formData.location, state: 'TX' }
                  });
                }}
              >
                <CardContent className="p-6 text-center space-y-3">
                  <div className="flex justify-center">
                    <div 
                      className="w-16 h-16"
                      style={{
                        WebkitMaskImage: `url('/images/Fallow Icon.png')`,
                        WebkitMaskSize: 'contain',
                        WebkitMaskRepeat: 'no-repeat',
                        WebkitMaskPosition: 'center',
                        maskImage: `url('/images/Fallow Icon.png')`,
                        maskSize: 'contain',
                        maskRepeat: 'no-repeat',
                        maskPosition: 'center',
                        backgroundColor: 'hsl(var(--primary))'
                      }}
                    />
                  </div>
                  <h3 className="text-lg font-bold">Wildlife & Exotics</h3>
                  <p className="text-sm text-muted-foreground">
                    Axis deer, blackbuck, fallow deer, and other exotic species
                  </p>
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer transition-all border-2 ${
                  formData.category === 'cattle_livestock'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                } ${listingData?.status === 'active' && (listingData?.metrics?.bidCount || 0) > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  if (listingData?.status === 'active' && (listingData?.metrics?.bidCount || 0) > 0) return;
                  setFormData({ 
                    ...formData, 
                    category: 'cattle_livestock',
                    location: { ...formData.location, state: 'TX' }
                  });
                }}
              >
                <CardContent className="p-6 text-center space-y-3">
                  <div className="flex justify-center">
                    <div 
                      className="w-16 h-16"
                      style={{
                        WebkitMaskImage: `url('/images/Bull Icon.png')`,
                        WebkitMaskSize: 'contain',
                        WebkitMaskRepeat: 'no-repeat',
                        WebkitMaskPosition: 'center',
                        maskImage: `url('/images/Bull Icon.png')`,
                        maskSize: 'contain',
                        maskRepeat: 'no-repeat',
                        maskPosition: 'center',
                        backgroundColor: 'hsl(var(--primary))'
                      }}
                    />
                  </div>
                  <h3 className="text-lg font-bold">Cattle & Livestock</h3>
                  <p className="text-sm text-muted-foreground">
                    Cattle, bulls, cows, heifers, and registered livestock
                  </p>
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer transition-all border-2 ${
                  formData.category === 'ranch_equipment'
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                } ${listingData?.status === 'active' && (listingData?.metrics?.bidCount || 0) > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  if (listingData?.status === 'active' && (listingData?.metrics?.bidCount || 0) > 0) return;
                  setFormData({ 
                    ...formData, 
                    category: 'ranch_equipment',
                    // Equipment can be multi-state, so don't force TX
                  });
                }}
              >
                <CardContent className="p-6 text-center space-y-3">
                  <div className="flex justify-center">
                    <div 
                      className="w-16 h-16"
                      style={{
                        WebkitMaskImage: `url('/images/Tractor Icon.png')`,
                        WebkitMaskSize: 'contain',
                        WebkitMaskRepeat: 'no-repeat',
                        WebkitMaskPosition: 'center',
                        maskImage: `url('/images/Tractor Icon.png')`,
                        maskSize: 'contain',
                        maskRepeat: 'no-repeat',
                        maskPosition: 'center',
                        backgroundColor: 'hsl(var(--primary))'
                      }}
                    />
                  </div>
                  <h3 className="text-lg font-bold">Ranch Equipment</h3>
                  <p className="text-sm text-muted-foreground">
                    Tractors, skid steers, UTVs, trailers, and ranch equipment
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Status - Read-only for active listings with bids */}
          {listingData?.status === 'active' && (listingData?.metrics?.bidCount || 0) > 0 && (
            <Card className="border-2 border-primary/20 bg-primary/5">
              <CardContent className="pt-4 pb-4 px-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-foreground mb-1">Limited Editing</p>
                    <p className="text-sm text-muted-foreground">
                      This listing has {listingData.metrics?.bidCount || 0} bid(s). You can edit description, photos, and add-ons, but type and pricing cannot be changed.
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
              className="min-h-[48px] text-base bg-background"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-base font-semibold">Description</Label>
            <Textarea
              id="description"
              placeholder="Provide detailed information about your listing..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="min-h-[120px] text-base bg-background"
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
                      disabled={listingData?.status === 'active' && (listingData?.metrics?.bidCount || 0) > 0}
                      className="min-h-[48px] text-base bg-background"
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
                      disabled={listingData?.status === 'active' && (listingData?.metrics?.bidCount || 0) > 0}
                      className="min-h-[48px] text-base bg-background"
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
                      disabled={listingData?.status === 'active' && (listingData?.metrics?.bidCount || 0) > 0}
                      className="min-h-[48px] text-base bg-background"
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum price you'll accept. Won't be shown to bidders.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ends-at" className="text-base font-semibold">
                      Auction End Date & Time <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="ends-at"
                      type="datetime-local"
                      value={formData.endsAt}
                      onChange={(e) => setFormData({ ...formData, endsAt: e.target.value })}
                      disabled={listingData?.status === 'active' && (listingData?.metrics?.bidCount || 0) > 0}
                      className="min-h-[48px] text-base bg-background"
                      min={new Date().toISOString().slice(0, 16)}
                    />
                    <p className="text-xs text-muted-foreground">
                      When the auction will end. Must be in the future.
                    </p>
                  </div>
                </>
              )}

              {formData.type === 'classified' && (
                <div className="space-y-2">
                  <Label htmlFor="asking-price" className="text-base font-semibold">Asking Price</Label>
                  <Input
                    id="asking-price"
                    type="number"
                    placeholder="0.00"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    disabled={listingData?.status === 'active' && (listingData?.metrics?.bidCount || 0) > 0}
                    className="min-h-[48px] text-base bg-background"
                  />
                </div>
              )}

              {/* Best Offer (Fixed/Classified) */}
              {(formData.type === 'fixed' || formData.type === 'classified') && (
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
                          onChange={(e) =>
                            setFormData({ ...formData, bestOffer: { ...formData.bestOffer, minPrice: e.target.value } })
                          }
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
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              bestOffer: { ...formData.bestOffer, autoAcceptPrice: e.target.value },
                            })
                          }
                          className="min-h-[44px]"
                        />
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
                          value={String(formData.bestOffer.offerExpiryHours)}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              bestOffer: { ...formData.bestOffer, offerExpiryHours: Number(e.target.value || 48) },
                            })
                          }
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
                className="min-h-[48px] text-base bg-background"
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
                disabled={['whitetail_breeder', 'wildlife_exotics', 'cattle_livestock'].includes(formData.category)}
                className="min-h-[48px] text-base bg-background"
              />
              {['whitetail_breeder', 'wildlife_exotics', 'cattle_livestock'].includes(formData.category) && (
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
                className="min-h-[48px] text-base bg-background"
              />
            </div>
          </div>
        </div>
      ),
      validate: () => {
        return (
          !!formData.title &&
          (formData.type === 'fixed' || formData.type === 'classified'
            ? true // Price optional for existing listings
            : !!formData.startingBid) && // Starting bid required for auctions
          (formData.type !== 'auction' || !!formData.endsAt) // endsAt required for auctions
        );
      },
    },
    {
      id: 'media',
      title: 'Photos',
      description: 'Update photos for your listing',
      content: (
        <div className="space-y-4">
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
                <Label htmlFor="images" className="cursor-pointer">
                  <Button variant="outline" className="min-h-[48px] min-w-[200px]">
                    {formData.images.length > 0 ? 'Add More Photos' : 'Upload Photos'}
                  </Button>
                </Label>
                <Input
                  id="images"
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    const newImages = files.map((f) => URL.createObjectURL(f));
                    setFormData({
                      ...formData,
                      images: [...formData.images, ...newImages].slice(0, 10), // Limit to 10 images
                    });
                  }}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Upload up to 10 photos (JPG, PNG). {formData.images.length}/10 uploaded.
                </p>
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
        <CategoryAttributeForm
          category={formData.category}
          attributes={formData.attributes}
          onChange={(attrs) => setFormData({ ...formData, attributes: attrs })}
        />
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          Please select a category first
        </div>
      ),
      validate: () => {
        if (!formData.category) return false;
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
              />
              <Label htmlFor="verification" className="cursor-pointer flex-1">
                <div className="font-medium mb-1">Professional Verification ($100)</div>
                <div className="text-sm text-muted-foreground">
                  We&apos;ll verify your listing details and seller credentials. Builds buyer trust.
                </div>
              </Label>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-muted-foreground">
              Note: Buyer protection is available via <strong>Protected Transaction</strong> when enabled.
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-start space-x-3 min-h-[44px]">
              <Checkbox
                id="transport"
                checked={formData.transport}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, transport: checked as boolean })
                }
              />
              <Label htmlFor="transport" className="cursor-pointer flex-1">
                <div className="font-medium mb-1">Transport Ready</div>
                <div className="text-sm text-muted-foreground">
                  I can help arrange or coordinate transport for buyers.
                </div>
              </Label>
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
                {formData.transport && (
                  <Badge variant="secondary" className="font-semibold">Transport Ready</Badge>
                )}
              </div>
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
        transportReady: formData.transport,
      },
      attributes: formData.attributes as ListingAttributes,
      protectedTransactionEnabled: formData.protectedTransactionEnabled,
      protectedTransactionDays: formData.protectedTransactionDays,
    };

    // Add pricing based on type
    if (formData.type === 'fixed' || formData.type === 'classified') {
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
      if (formData.endsAt) {
        updates.endsAt = new Date(formData.endsAt);
      }
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
        title: 'Authentication required',
        description: 'You must be signed in to save changes.',
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
      endsAt: formData.endsAt || null,
      location: formData.location,
      images: formData.images || [],
      verification: formData.verification,
      transport: formData.transport,
      protectedTransactionEnabled: formData.protectedTransactionEnabled,
      protectedTransactionDays: formData.protectedTransactionDays,
      bestOffer: formData.bestOffer,
      attributes: formData.attributes,
    });
    if (initialSignature && currentSignature === initialSignature) {
      toast({
        title: 'No changes yet',
        description: 'Make at least one change before saving.',
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
              // Only change status to pending if it's currently draft
              if (currentListing.status === 'draft') {
                updates.status = 'pending';
              }
              console.log('Setting complianceStatus to pending_review');
            } else if (currentListing.complianceStatus === 'none' || !currentListing.complianceStatus) {
              // If no compliance status set yet, set it to pending_review
              updates.complianceStatus = 'pending_review';
              if (currentListing.status === 'draft') {
                updates.status = 'pending';
              }
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
        title: 'Error saving changes',
        description: err.message || 'Failed to save changes. Please try again.',
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

    setSaving(true);

    try {
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
      toast({
        title: listingData?.status === 'draft' ? 'Error publishing listing' : 'Error updating listing',
        description: err.message || 'Failed to update listing. Please try again.',
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
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-4xl space-y-6">
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
