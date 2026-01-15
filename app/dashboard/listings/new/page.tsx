'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StepperForm } from '@/components/forms/StepperForm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, X, Loader2, ArrowLeft, Save } from 'lucide-react';
import { ListingType, ListingCategory } from '@/lib/types';
import { BottomNav } from '@/components/navigation/BottomNav';
import { useAuth } from '@/hooks/use-auth';
import { createListingDraft, publishListing, updateListing } from '@/lib/firebase/listings';
import { useToast } from '@/hooks/use-toast';
import { AuthPromptModal } from '@/components/auth/AuthPromptModal';
import { uploadListingImage } from '@/lib/firebase/storage';
import Image from 'next/image';
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ListingAttributes, WildlifeAttributes, CattleAttributes, EquipmentAttributes, WhitetailBreederAttributes } from '@/lib/types';
import { AlertCircle } from 'lucide-react';
import { CategoryAttributeForm } from '@/components/listings/CategoryAttributeForm';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
// Exposure Plans model: no listing limits.

function NewListingPageContent() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  // (No listing-limit gating in Exposure Plans model)
  const [sellerAttestationAccepted, setSellerAttestationAccepted] = useState(false);
  const [formData, setFormData] = useState<{
    category: ListingCategory | '';
    type: ListingType | '';
    title: string;
    description: string;
    price: string;
    startingBid: string;
    reservePrice: string;
    endsAt: string;
    location: { city: string; state: string; zip: string };
    images: string[];
    verification: boolean;
    insurance: boolean;
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
    attributes: Partial<WildlifeAttributes | CattleAttributes | EquipmentAttributes | WhitetailBreederAttributes>;
  }>({
    category: '',
    type: '',
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
    insurance: false,
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
  const [listingId, setListingId] = useState<string | null>(null); // Store draft listing ID for image uploads

  const steps = [
    {
      id: 'category',
      title: 'Category',
      description: 'Choose what you\'re listing',
      content: (
        <div className="space-y-6">
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>Texas-Only:</strong> All animal transactions (whitetail breeder, exotics, cattle) are restricted to Texas residents only. Equipment listings can be multi-state.
            </AlertDescription>
          </Alert>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card
              className={`cursor-pointer transition-all border-2 ${
                formData.category === 'whitetail_breeder'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
              onClick={() => {
                setFormData({ 
                  ...formData, 
                  category: 'whitetail_breeder',
                  location: { ...formData.location, state: 'TX' } // Force TX for animals
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
              }`}
              onClick={() => {
                setFormData({ 
                  ...formData, 
                  category: 'wildlife_exotics',
                  location: { ...formData.location, state: 'TX' } // Force TX for animals
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
              }`}
              onClick={() => {
                setFormData({ 
                  ...formData, 
                  category: 'cattle_livestock',
                  location: { ...formData.location, state: 'TX' } // Force TX for animals
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
              }`}
              onClick={() => setFormData({ ...formData, category: 'ranch_equipment' })}
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
      ),
      validate: () => !!formData.category,
    },
    {
      id: 'type',
      title: 'Listing Type',
      description: 'Choose how you want to sell',
      content: (
        <div className="space-y-6">
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>Single Mode:</strong> Each listing must be either Auction, Fixed Price, or Classified. 
              No hybrid "auction + buy now" listings are allowed.
            </AlertDescription>
          </Alert>
          <div className="space-y-3">
            <Label className="text-base font-semibold">Listing Type</Label>
            <RadioGroup
              value={formData.type}
              onValueChange={(value) => {
                // Clear conflicting pricing fields when switching types
                const newData: any = { ...formData, type: value as ListingType };
                if (value === 'auction') {
                  newData.price = ''; // Clear fixed price
                } else if (value === 'fixed' || value === 'classified') {
                  newData.startingBid = ''; // Clear auction fields
                  newData.reservePrice = '';
                  newData.endsAt = '';
                }
                setFormData(newData);
              }}
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
        </div>
      ),
      validate: () => !!formData.type,
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
            errors={(() => {
              if (formData.category === 'whitetail_breeder') {
                const attrs = formData.attributes as Partial<WhitetailBreederAttributes>;
                const errs: string[] = [];
                if (!attrs.tpwdBreederPermitNumber?.trim()) errs.push('TPWD Breeder Permit Number');
                if (!attrs.breederFacilityId?.trim()) errs.push('Breeder Facility ID');
                if (!attrs.deerIdTag?.trim()) errs.push('Deer ID Tag');
                if (!(attrs as any).tpwdPermitExpirationDate) errs.push('Permit Expiration Date');
                if (!attrs.sex) errs.push('Sex');
                if (!attrs.quantity || attrs.quantity < 1) errs.push('Quantity (must be at least 1)');
                if (!attrs.cwdDisclosureChecklist?.cwdAware) errs.push('CWD Awareness acknowledgment');
                if (!attrs.cwdDisclosureChecklist?.cwdCompliant) errs.push('CWD Compliance confirmation');
                return errs;
              }
              return [];
            })()}
          />

          {formData.category === 'whitetail_breeder' && (
            <div className={`space-y-3 p-4 border rounded-lg ${!sellerAttestationAccepted ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted/30'}`}>
              <Label className="text-base font-semibold">
                Seller Attestation <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="seller-attestation"
                  checked={sellerAttestationAccepted}
                  onCheckedChange={(checked) => setSellerAttestationAccepted(checked === true)}
                />
                <Label htmlFor="seller-attestation" className="cursor-pointer flex-1">
                  <div className="font-medium">
                    I certify that all permit information entered is accurate and that the uploaded TPWD Deer Breeder Permit is valid and current.
                  </div>
                </Label>
              </div>
              {!sellerAttestationAccepted && (
                <p className="text-sm text-destructive">
                  You must accept the seller attestation to submit a whitetail breeder listing.
                </p>
              )}
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
        if (formData.category === 'whitetail_breeder') {
          const attrs = formData.attributes as Partial<WhitetailBreederAttributes>;
          const errors: string[] = [];
          
          if (!attrs.tpwdBreederPermitNumber?.trim()) errors.push('TPWD Breeder Permit Number');
          if (!attrs.breederFacilityId?.trim()) errors.push('Breeder Facility ID');
          if (!attrs.deerIdTag?.trim()) errors.push('Deer ID Tag');
          if (!(attrs as any).tpwdPermitExpirationDate) errors.push('Permit Expiration Date');
          if (!attrs.sex) errors.push('Sex');
          if (!attrs.quantity || attrs.quantity < 1) errors.push('Quantity (must be at least 1)');
          if (!attrs.cwdDisclosureChecklist?.cwdAware) errors.push('CWD Awareness acknowledgment');
          if (!attrs.cwdDisclosureChecklist?.cwdCompliant) errors.push('CWD Compliance confirmation');

          // Permit expiration hard block (seller-side UX; server enforces too)
          const exp: any = (attrs as any).tpwdPermitExpirationDate;
          const expDate: Date | null = exp?.toDate?.() || (exp instanceof Date ? exp : null);
          if (expDate && expDate.getTime() < Date.now()) {
            toast({
              title: 'Permit expired',
              description: 'Your TPWD Deer Breeder Permit is expired. Renew before submitting.',
              variant: 'destructive',
            });
            return false;
          }

          if (!sellerAttestationAccepted) {
            toast({
              title: 'Seller attestation required',
              description: 'Please accept the seller attestation to proceed.',
              variant: 'destructive',
            });
            return false;
          }
          
          if (errors.length > 0) {
            toast({
              title: 'Missing Required Fields',
              description: `Please complete: ${errors.join(', ')}`,
              variant: 'destructive',
            });
            return false;
          }
          return true;
        }
        if (formData.category === 'wildlife_exotics') {
          const attrs = formData.attributes as Partial<WildlifeAttributes>;
          return !!(
            attrs.speciesId &&
            attrs.sex &&
            attrs.quantity &&
            attrs.quantity >= 1 &&
            attrs.animalIdDisclosure &&
            attrs.healthDisclosure &&
            attrs.transportDisclosure
          );
        }
        if (formData.category === 'cattle_livestock') {
          const attrs = formData.attributes as Partial<CattleAttributes>;
          return !!(
            attrs.breed &&
            attrs.sex &&
            attrs.registered !== undefined &&
            attrs.quantity &&
            attrs.quantity >= 1 &&
            attrs.identificationDisclosure &&
            attrs.healthDisclosure &&
            (attrs.age || attrs.weightRange)
          );
        }
        if (formData.category === 'ranch_equipment') {
          const attrs = formData.attributes as Partial<EquipmentAttributes>;
          const vehiclesRequiringTitle = ['utv', 'atv', 'trailer', 'truck'];
          const requiresTitle = attrs.equipmentType && vehiclesRequiringTitle.includes(attrs.equipmentType.toLowerCase());
          const baseValid = !!(attrs.equipmentType && attrs.condition && attrs.quantity && attrs.quantity >= 1);
          if (requiresTitle) {
            return baseValid && attrs.hasTitle !== undefined && !!attrs.vinOrSerial;
          }
          return baseValid;
        }
        return false;
      },
    },
    {
      id: 'details',
      title: 'Details',
      description: 'Describe what you\'re selling',
      content: (
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-base font-semibold">Title</Label>
            <Input
              id="title"
              placeholder="e.g., Registered Texas Longhorn Bull"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="min-h-[48px] text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-base font-semibold">Description</Label>
            <Textarea
              id="description"
              placeholder="Provide detailed information about your listing..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="min-h-[120px] text-base"
            />
          </div>

          {formData.type === 'fixed' && (
            <div className="space-y-2">
              <Label htmlFor="price" className="text-base font-semibold">Price</Label>
              <Input
                id="price"
                type="number"
                placeholder="0.00"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="min-h-[48px] text-base"
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
                  className="min-h-[48px] text-base"
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
                  className="min-h-[48px] text-base"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum price you'll accept. Won't be shown to bidders.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="auction-end" className="text-base font-semibold">
                  Auction End Date & Time
                </Label>
                <Input
                  id="auction-end"
                  type="datetime-local"
                  value={formData.endsAt}
                  onChange={(e) => setFormData({ ...formData, endsAt: e.target.value })}
                  className="min-h-[48px] text-base"
                  min={new Date().toISOString().slice(0, 16)}
                />
                <p className="text-xs text-muted-foreground">
                  When should this auction end? Must be in the future.
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
                className="min-h-[48px] text-base"
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
                className="min-h-[48px] text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state" className="text-base font-semibold">State</Label>
              {['whitetail_breeder', 'wildlife_exotics', 'cattle_livestock'].includes(formData.category) ? (
                <>
                  <Input
                    id="state"
                    value="TX"
                    disabled
                    className="min-h-[48px] text-base bg-muted"
                  />
                  <Alert className="bg-blue-50 border-blue-200">
                    <AlertCircle className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800 text-xs">
                      Animal listings must be located in Texas (TX) per compliance requirements.
                    </AlertDescription>
                  </Alert>
                </>
              ) : (
                <Input
                  id="state"
                  placeholder="State"
                  value={formData.location.state}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      location: { ...formData.location, state: e.target.value },
                    })
                  }
                  className="min-h-[48px] text-base"
                />
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="zip" className="text-base font-semibold">ZIP Code (Optional)</Label>
            <Input
              id="zip"
              placeholder="12345"
              value={formData.location.zip}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  location: { ...formData.location, zip: e.target.value },
                })
              }
              className="min-h-[48px] text-base"
            />
          </div>
        </div>
      ),
      validate: () => {
        return !!formData.title &&
          !!formData.description &&
          (formData.type === 'fixed' || formData.type === 'classified'
            ? !!formData.price
            : !!formData.startingBid) &&
          (formData.type !== 'auction' || !!formData.endsAt);
      },
    },
    {
      id: 'media',
      title: 'Photos',
      description: 'Upload photos of your listing (required)',
      content: (
        <div className="space-y-4">
          {/* Upload Area */}
          <Card className="border-2 border-dashed p-8 text-center min-h-[200px] flex items-center justify-center">
            <div className="space-y-4 w-full">
              <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <Input
                  id="images"
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  disabled={formData.images.length >= 8 || uploadingImages.size > 0}
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length === 0) return;

                    // Check total count
                    const totalImages = formData.images.length + files.length;
                    if (totalImages > 8) {
                      toast({
                        title: 'Too many images',
                        description: 'You can upload a maximum of 8 photos per listing.',
                        variant: 'destructive',
                      });
                      return;
                    }

                    // Ensure user is authenticated
                    if (!user) {
                      toast({
                        title: 'Authentication required',
                        description: 'Please sign in to upload images.',
                        variant: 'destructive',
                      });
                      return;
                    }

                    // Create draft listing if it doesn't exist yet
                    let currentListingId = listingId;
                    if (!currentListingId) {
                      try {
                        const draftData: any = {
                          title: formData.title || 'Draft Listing',
                          description: formData.description || '',
                          type: (formData.type || 'fixed') as 'auction' | 'fixed' | 'classified',
                          category: (formData.category || 'other') as ListingCategory,
                          location: formData.location,
                          images: [],
                          trust: {
                            verified: formData.verification,
                            insuranceAvailable: formData.insurance,
                            transportReady: formData.transport,
                          },
                          protectedTransactionEnabled: formData.protectedTransactionEnabled,
                          protectedTransactionDays: formData.protectedTransactionDays,
                          attributes: formData.attributes as ListingAttributes,
                        };

                        // Whitetail-only seller attestation (required even for draft creation)
                        if (formData.category === 'whitetail_breeder') {
                          draftData.sellerAttestationAccepted = sellerAttestationAccepted === true;
                          if (sellerAttestationAccepted) {
                            draftData.sellerAttestationAcceptedAt = new Date();
                          }
                        }
                        
                        // Only include protectedTermsVersion if protectedTransactionEnabled is true
                        if (formData.protectedTransactionEnabled) {
                          draftData.protectedTermsVersion = 'v1';
                        }

                        if (formData.type === 'fixed' || formData.type === 'classified') {
                          draftData.price = parseFloat(formData.price || '0');
                          if (formData.bestOffer.enabled) {
                            draftData.bestOfferSettings = {
                              enabled: true,
                              minPrice: formData.bestOffer.minPrice ? parseFloat(formData.bestOffer.minPrice) : undefined,
                              autoAcceptPrice: formData.bestOffer.autoAcceptPrice ? parseFloat(formData.bestOffer.autoAcceptPrice) : undefined,
                              allowCounter: formData.bestOffer.allowCounter !== false,
                              offerExpiryHours: formData.bestOffer.offerExpiryHours || 48,
                            };
                          } else {
                            draftData.bestOfferSettings = { enabled: false, allowCounter: true, offerExpiryHours: 48 };
                          }
                        } else if (formData.type === 'auction') {
                          if (formData.startingBid) {
                            draftData.startingBid = parseFloat(formData.startingBid || '0');
                          }
                          if (formData.reservePrice) {
                            draftData.reservePrice = parseFloat(formData.reservePrice);
                          }
                          if (formData.endsAt) {
                            draftData.endsAt = new Date(formData.endsAt);
                          }
                        }

                        currentListingId = await createListingDraft(user.uid, draftData);
                        setListingId(currentListingId);
                        
                        // Wait longer and verify listing exists before allowing upload
                        // Storage rules check Firestore, so we need to ensure propagation
                        let retries = 0;
                        let listingVerified = false;
                        while (retries < 5 && !listingVerified) {
                          await new Promise(resolve => setTimeout(resolve, 500));
                          try {
                            // Verify listing exists by trying to read it
                            const { getListingById } = await import('@/lib/firebase/listings');
                            const listing = await getListingById(currentListingId);
                            if (listing && listing.sellerId === user.uid) {
                              listingVerified = true;
                            }
                          } catch (err) {
                            console.log(`Verification attempt ${retries + 1} failed, retrying...`);
                          }
                          retries++;
                        }
                        
                        if (!listingVerified) {
                          toast({
                            title: 'Verification failed',
                            description: 'Listing created but could not verify. Please try uploading again.',
                            variant: 'destructive',
                          });
                          // Still allow upload attempt - rules might work anyway
                        }
                        
                        toast({
                          title: 'Draft created',
                          description: 'Listing draft created. You can now upload images.',
                        });
                      } catch (error: any) {
                        console.error('Error creating draft listing:', error);
                        toast({
                          title: 'Error creating draft',
                          description: error.message || 'Failed to create listing draft. Please try again.',
                          variant: 'destructive',
                        });
                        return;
                      }
                    }

                    // Upload each file
                    for (const file of files) {
                      const fileId = `${Date.now()}-${Math.random()}`;
                      setUploadingImages((prev) => new Set(prev).add(fileId));
                      setUploadProgress((prev) => ({ ...prev, [fileId]: 0 }));

                      try {
                        const result = await uploadListingImage(
                          currentListingId!,
                          file,
                          (progress) => {
                            setUploadProgress((prev) => ({
                              ...prev,
                              [fileId]: progress.progress,
                            }));
                          }
                        );

                        // Add URL to images array
                        const newImages = [...formData.images, result.url];
                        setFormData((prev) => ({
                          ...prev,
                          images: newImages,
                        }));

                        // Update listing document with new image URL
                        try {
                          await updateListing(user.uid, currentListingId!, {
                            images: newImages,
                          } as any);
                        } catch (updateError: any) {
                          console.error('Error updating listing with image:', updateError);
                          // Don't fail the upload if update fails - images are already in formData
                          toast({
                            title: 'Image uploaded',
                            description: 'Image uploaded successfully, but failed to update listing. Please try refreshing.',
                            variant: 'default',
                          });
                        }

                        toast({
                          title: 'Upload successful',
                          description: `${file.name} uploaded successfully.`,
                        });
                      } catch (error: any) {
                        console.error('Error uploading image:', error);
                        
                        // Provide more specific error messages
                        let errorMessage = `Failed to upload ${file.name}.`;
                        if (error.code === 'storage/unauthorized') {
                          errorMessage = 'You are not authorized to upload images. Please ensure you are logged in and try again.';
                        } else if (error.code === 'storage/quota-exceeded') {
                          errorMessage = 'Storage quota exceeded. Please contact support.';
                        } else if (error.code === 'storage/unauthenticated') {
                          errorMessage = 'Please sign in to upload images.';
                        } else if (error.message) {
                          errorMessage = error.message;
                        }
                        
                        toast({
                          title: 'Upload failed',
                          description: errorMessage,
                          variant: 'destructive',
                        });
                      } finally {
                        setUploadingImages((prev) => {
                          const next = new Set(prev);
                          next.delete(fileId);
                          return next;
                        });
                        setUploadProgress((prev) => {
                          const next = { ...prev };
                          delete next[fileId];
                          return next;
                        });
                      }
                    }

                    // Reset file input
                    e.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[48px] min-w-[200px]"
                  disabled={formData.images.length >= 8 || uploadingImages.size > 0}
                  onClick={() => {
                    const input = document.getElementById('images') as HTMLInputElement;
                    if (input) {
                      input.click();
                    }
                  }}
                >
                  {uploadingImages.size > 0 ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload Photos
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Upload up to 8 photos (JPG, PNG, WebP)
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Images are automatically compressed and optimized
                </p>
              </div>
            </div>
          </Card>

          {/* Image Grid */}
          {(formData.images.length > 0 || uploadingImages.size > 0) && (
            <div className="grid grid-cols-3 gap-2">
              {/* Uploaded Images */}
              {formData.images.map((img, idx) => (
                <div key={idx} className="relative aspect-square rounded-md overflow-hidden border group">
                  <Image
                    src={img}
                    alt={`Upload ${idx + 1}`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 33vw, 200px"
                    unoptimized
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
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
              ))}

              {/* Uploading Images (Placeholders) */}
              {Array.from(uploadingImages).map((fileId) => (
                <div key={fileId} className="relative aspect-square rounded-md overflow-hidden border bg-muted flex items-center justify-center">
                  <div className="text-center space-y-2 p-4">
                    <Loader2 className="h-6 w-6 mx-auto animate-spin text-primary" />
                    <p className="text-xs text-muted-foreground">
                      {Math.round(uploadProgress[fileId] || 0)}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ),
      validate: () => formData.images.length > 0, // At least 1 image required
      errorMessage: 'Please upload at least one photo',
    },
    {
      id: 'verification',
      title: 'Verification & Add-ons',
      description: 'Optional: Add verification and protection',
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
            <div className="flex items-start space-x-3 min-h-[44px]">
              <Checkbox
                id="insurance"
                checked={formData.insurance}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, insurance: checked as boolean })
                }
              />
              <Label htmlFor="insurance" className="cursor-pointer flex-1">
                <div className="font-medium mb-1">Offer Insurance to Buyers</div>
                <div className="text-sm text-muted-foreground">
                  Buyers can purchase insurance at checkout. No cost to you.
                </div>
              </Label>
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
        </div>
      ),
      validate: () => true, // Verification options are optional
    },
    {
      id: 'review',
      title: 'Review & Publish',
      description: 'Review your listing before publishing',
      content: (
        <div className="space-y-6">
          <Card>
            <div className="p-4 space-y-4">
              <div>
                <div className="text-sm text-muted-foreground">Type</div>
                <div className="font-medium capitalize">{formData.type}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Category</div>
                <div className="font-medium capitalize">{formData.category}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Title</div>
                <div className="font-medium">{formData.title}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Description</div>
                <div className="text-sm whitespace-pre-line">{formData.description}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Location</div>
                <div className="font-medium">
                  {formData.location.city}, {formData.location.state}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Price/Bid</div>
                <div className="font-medium">
                  {formData.type === 'auction'
                    ? `Starting: $${parseFloat(formData.startingBid || '0').toLocaleString()}`
                    : `$${parseFloat(formData.price || '0').toLocaleString()}`}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Photos</div>
                <div className="font-medium">{formData.images.length} photos</div>
              </div>
              {formData.location.zip && (
                <div>
                  <div className="text-sm text-muted-foreground">ZIP Code</div>
                  <div className="font-medium">{formData.location.zip}</div>
                </div>
              )}
              {formData.type === 'auction' && formData.endsAt && (
                <div>
                  <div className="text-sm text-muted-foreground">Auction Ends</div>
                  <div className="font-medium">
                    {new Date(formData.endsAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
              )}
              {formData.category && Object.keys(formData.attributes).length > 0 && (
                <div>
                  <div className="text-sm text-muted-foreground">Specifications</div>
                  <div className="text-sm space-y-1 mt-1">
                    {formData.category === 'wildlife_exotics' && (
                      <>
                        {(formData.attributes as Partial<WildlifeAttributes>).speciesId && (
                          <div>Species: {(formData.attributes as Partial<WildlifeAttributes>).speciesId}</div>
                        )}
                        {(formData.attributes as Partial<WildlifeAttributes>).sex && (
                          <div>Sex: {(formData.attributes as Partial<WildlifeAttributes>).sex}</div>
                        )}
                        {(formData.attributes as Partial<WildlifeAttributes>).quantity && (
                          <div>Quantity: {(formData.attributes as Partial<WildlifeAttributes>).quantity}</div>
                        )}
                      </>
                    )}
                    {formData.category === 'cattle_livestock' && (
                      <>
                        {(formData.attributes as Partial<CattleAttributes>).breed && (
                          <div>Breed: {(formData.attributes as Partial<CattleAttributes>).breed}</div>
                        )}
                        {(formData.attributes as Partial<CattleAttributes>).sex && (
                          <div>Sex: {(formData.attributes as Partial<CattleAttributes>).sex}</div>
                        )}
                        {(formData.attributes as Partial<CattleAttributes>).registered !== undefined && (
                          <div>Registered: {(formData.attributes as Partial<CattleAttributes>).registered ? 'Yes' : 'No'}</div>
                        )}
                        {(formData.attributes as Partial<CattleAttributes>).quantity && (
                          <div>Quantity: {(formData.attributes as Partial<CattleAttributes>).quantity}</div>
                        )}
                      </>
                    )}
                    {formData.category === 'ranch_equipment' && (
                      <>
                        {(formData.attributes as Partial<EquipmentAttributes>).equipmentType && (
                          <div>Type: {(formData.attributes as Partial<EquipmentAttributes>).equipmentType}</div>
                        )}
                        {(formData.attributes as Partial<EquipmentAttributes>).condition && (
                          <div>Condition: {(formData.attributes as Partial<EquipmentAttributes>).condition}</div>
                        )}
                        {(formData.attributes as Partial<EquipmentAttributes>).year && (
                          <div>Year: {(formData.attributes as Partial<EquipmentAttributes>).year}</div>
                        )}
                        {(formData.attributes as Partial<EquipmentAttributes>).quantity && (
                          <div>Quantity: {(formData.attributes as Partial<EquipmentAttributes>).quantity}</div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      ),
      validate: () => true, // Review step always valid
    },
  ];

  const handleComplete = async (data: Record<string, unknown>) => {
    // Check if user is authenticated - if not, save form data and show auth prompt modal
    if (!user) {
      // Save form data to sessionStorage so we can restore it after authentication
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('listingFormData', JSON.stringify(formData));
      }
      setShowAuthModal(true);
      return;
    }

    // Validate images
    if (formData.images.length === 0) {
      toast({
        title: 'Images required',
        description: 'Please upload at least one photo before publishing.',
        variant: 'destructive',
      });
      return;
    }

    if (formData.images.length > 8) {
      toast({
        title: 'Too many images',
        description: 'You can upload a maximum of 8 photos per listing.',
        variant: 'destructive',
      });
      return;
    }

    // Check if images are still uploading
    if (uploadingImages.size > 0) {
      toast({
        title: 'Upload in progress',
        description: 'Please wait for all images to finish uploading.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare listing data
      const locationData: any = {
        city: formData.location.city,
        state: formData.location.state,
      };
      // Only include zip if it has a value (Firestore doesn't allow undefined)
      if (formData.location.zip && formData.location.zip.trim()) {
        locationData.zip = formData.location.zip.trim();
      }

      const listingData = {
        title: formData.title,
        description: formData.description,
        type: formData.type as 'auction' | 'fixed' | 'classified',
        category: formData.category as ListingCategory,
        location: locationData,
        images: formData.images, // Firebase Storage URLs
        trust: {
          verified: formData.verification,
          insuranceAvailable: formData.insurance,
          transportReady: formData.transport,
        },
        protectedTransactionEnabled: formData.protectedTransactionEnabled,
        protectedTransactionDays: formData.protectedTransactionDays,
        ...(formData.protectedTransactionEnabled && { protectedTermsVersion: 'v1' }),
        attributes: formData.attributes as ListingAttributes,
        // Whitetail-only seller attestation
        ...(formData.category === 'whitetail_breeder' && {
          sellerAttestationAccepted: sellerAttestationAccepted === true,
          sellerAttestationAcceptedAt: sellerAttestationAccepted ? new Date() : undefined,
        }),
      } as any;

      // Add pricing based on type
      if (formData.type === 'fixed' || formData.type === 'classified') {
        listingData.price = parseFloat(formData.price || '0');
        listingData.bestOfferSettings = formData.bestOffer.enabled
          ? {
              enabled: true,
              minPrice: formData.bestOffer.minPrice ? parseFloat(formData.bestOffer.minPrice) : undefined,
              autoAcceptPrice: formData.bestOffer.autoAcceptPrice ? parseFloat(formData.bestOffer.autoAcceptPrice) : undefined,
              allowCounter: formData.bestOffer.allowCounter !== false,
              offerExpiryHours: formData.bestOffer.offerExpiryHours || 48,
            }
          : { enabled: false, allowCounter: true, offerExpiryHours: 48 };
      } else if (formData.type === 'auction') {
        listingData.startingBid = parseFloat(formData.startingBid || '0');
        if (formData.reservePrice) {
          listingData.reservePrice = parseFloat(formData.reservePrice);
        }
        // Add auction end date
        if (formData.endsAt) {
          listingData.endsAt = new Date(formData.endsAt);
        }
      }

      // Use existing draft listing ID if available, otherwise create new
      let finalListingId = listingId;
      if (!finalListingId) {
        finalListingId = await createListingDraft(user.uid, listingData);
      } else {
        // Update existing draft with final data
        const { updateListing } = await import('@/lib/firebase/listings');
        await updateListing(user.uid, finalListingId, listingData);
      }

      // Publish immediately (user clicked "Publish" in the form)
      const publishResult = await publishListing(user.uid, finalListingId);

      if (publishResult?.pendingReview) {
        toast({
          title: 'Listing submitted for review',
          description: 'Your listing has been submitted and is pending admin compliance review. You will be notified once it\'s approved.',
        });
      } else {
        toast({
          title: 'Listing created successfully!',
          description: 'Your listing has been published and is now live.',
        });
      }

      // Redirect to seller listings dashboard so they can see their new listing
      router.push('/seller/listings');
    } catch (error: any) {
      console.error('Error creating listing:', error);
      toast({
        title: 'Error creating listing',
        description: error.message || 'An error occurred while creating your listing. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check if user just returned from authentication and restore form data
  useEffect(() => {
    if (user && typeof window !== 'undefined') {
      // Check if we have form data in sessionStorage to restore
      const savedFormData = sessionStorage.getItem('listingFormData');
      if (savedFormData) {
        try {
          const parsed = JSON.parse(savedFormData);
          setFormData(parsed);
          sessionStorage.removeItem('listingFormData');
          toast({
            title: 'Welcome back!',
            description: 'Your listing information has been restored. You can now publish it.',
          });
        } catch (e) {
          console.error('Failed to restore form data:', e);
        }
      }
    }
  }, [user, toast]);

  // Show loading state while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const handleSaveDraft = async () => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'You must be signed in to save a draft.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const locationData: any = {
        city: formData.location.city,
        state: formData.location.state,
      };
      if (formData.location.zip && formData.location.zip.trim()) {
        locationData.zip = formData.location.zip.trim();
      }

      const listingData = {
        title: formData.title || 'Draft Listing',
        description: formData.description || '',
        type: (formData.type || 'fixed') as 'auction' | 'fixed' | 'classified',
        category: (formData.category || 'other') as ListingCategory,
        location: locationData,
        images: formData.images,
        trust: {
          verified: formData.verification,
          insuranceAvailable: formData.insurance,
          transportReady: formData.transport,
        },
        protectedTransactionEnabled: formData.protectedTransactionEnabled,
        protectedTransactionDays: formData.protectedTransactionDays,
        ...(formData.protectedTransactionEnabled && { protectedTermsVersion: 'v1' }),
        attributes: formData.attributes as ListingAttributes,
      } as any;

      if (formData.type === 'fixed' || formData.type === 'classified') {
        listingData.price = parseFloat(formData.price || '0');
      } else if (formData.type === 'auction') {
        listingData.startingBid = parseFloat(formData.startingBid || '0');
        if (formData.reservePrice) {
          listingData.reservePrice = parseFloat(formData.reservePrice);
        }
        if (formData.endsAt) {
          listingData.endsAt = new Date(formData.endsAt);
        }
      }

      let draftId = listingId;
      if (!draftId) {
        draftId = await createListingDraft(user.uid, listingData);
        setListingId(draftId);
      } else {
        await updateListing(user.uid, draftId, listingData);
      }

      toast({
        title: 'Draft saved',
        description: 'Your listing has been saved as a draft. You can continue editing it later.',
      });
    } catch (error: any) {
      console.error('Error saving draft:', error);
      toast({
        title: 'Failed to save draft',
        description: error.message || 'An error occurred while saving your draft.',
        variant: 'destructive',
      });
    }
  };

  const hasFormData = formData.type || formData.category || formData.title || formData.description || formData.images.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Custom Header with Navigation */}
      <div className="sticky top-0 z-50 bg-card/95 backdrop-blur-sm border-b border-border/50 shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Left: Back Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (hasFormData) {
                  setShowExitDialog(true);
                } else {
                  router.back();
                }
              }}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back</span>
            </Button>

            {/* Center: Title */}
            <div className="flex-1 text-center">
              <h1 className="text-lg font-bold">Create New Listing</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Step-by-step listing creation
              </p>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2">
              {user && hasFormData && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveDraft}
                  className="gap-2 hidden sm:flex"
                >
                  <Save className="h-4 w-4" />
                  Save Draft
                </Button>
              )}
              <Link href="/browse">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0"
                  title="Exit to Browse"
                >
                  <X className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-4xl">
        {/* Show a subtle banner if not authenticated */}
        {!user && (
          <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-lg">
            <p className="text-sm text-foreground">
              <span className="font-semibold">💡 Tip:</span> You can fill out the form now, but you'll need to sign in to publish your listing.
            </p>
          </div>
        )}

        {/* Mobile Save Draft Button */}
        {user && hasFormData && (
          <div className="mb-4 sm:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveDraft}
              className="w-full gap-2"
            >
              <Save className="h-4 w-4" />
              Save Draft
            </Button>
          </div>
        )}
        
        <div className="bg-card rounded-lg border border-border/50 shadow-sm p-6 md:p-8">
          <StepperForm 
            steps={steps} 
            onComplete={handleComplete}
          />
        </div>
      </div>

      <BottomNav />
      
      {/* Exit Confirmation Dialog */}
      <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exit Listing Creation?</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Do you want to save as a draft before leaving, or exit without saving?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {user && (
              <Button
                variant="default"
                onClick={() => {
                  handleSaveDraft();
                  setShowExitDialog(false);
                  setTimeout(() => router.back(), 500);
                }}
                className="w-full sm:w-auto"
              >
                <Save className="h-4 w-4 mr-2" />
                Save Draft & Exit
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                setShowExitDialog(false);
                router.back();
              }}
              className="w-full sm:w-auto"
            >
              Exit Without Saving
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowExitDialog(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Authentication Prompt Modal */}
      <AuthPromptModal
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
        title="Sign in to publish your listing"
        description="You've filled out your listing! Sign in or create an account to publish it. Don't worry - your information will be saved."
        onAuthSuccess={() => {
          setShowAuthModal(false);
        }}
      />
    </div>
  );
}

export default function NewListingPage() {
  return <NewListingPageContent />;
}
