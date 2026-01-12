'use client';

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
import { Upload, X, ArrowLeft, Save } from 'lucide-react';
import { ListingType, ListingCategory } from '@/lib/types';
import { mockSellerListings, SellerListing } from '@/lib/seller-mock-data';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function EditListingPage() {
  const router = useRouter();
  const params = useParams();
  const listingId = params.id as string;

  // Find the listing to edit
  const existingListing = mockSellerListings.find((l) => l.id === listingId);

  const [formData, setFormData] = useState({
    type: '' as ListingType | '',
    category: 'wildlife' as ListingCategory,
    title: '',
    description: '',
    price: '',
    startingBid: '',
    reservePrice: '',
    location: {
      city: '',
      state: 'TX',
      zip: '',
    },
    images: [] as string[],
    verification: false,
    insurance: false,
    transport: false,
    status: 'draft' as 'draft' | 'active' | 'ending_soon' | 'sold' | 'archived',
  });

  // Load existing listing data
  useEffect(() => {
    if (existingListing) {
      setFormData({
        type: existingListing.type,
        category: existingListing.category || 'wildlife',
        title: existingListing.title,
        description: existingListing.description || '',
        price: existingListing.price?.toString() || '',
        startingBid: existingListing.startingBid?.toString() || existingListing.currentBid?.toString() || '',
        reservePrice: existingListing.reservePrice?.toString() || '',
        location: {
          city: existingListing.location.city,
          state: existingListing.location.state,
          zip: existingListing.location.zip || '',
        },
        images: existingListing.images || [],
        verification: existingListing.verificationStatus !== 'not_requested',
        insurance: existingListing.insuranceStatus !== 'not_selected',
        transport: existingListing.transportStatus !== 'not_requested',
        status: existingListing.status,
      });
    }
  }, [existingListing]);

  // If listing not found, redirect
  useEffect(() => {
    if (!existingListing && listingId) {
      toast.error('Listing not found');
      router.push('/seller/listings');
    }
  }, [existingListing, listingId, router]);

  if (!existingListing) {
    return (
      <div className="min-h-screen bg-background pb-20 md:pb-6 flex items-center justify-center">
        <Card className="border-2 border-border/50 bg-card max-w-md">
          <CardContent className="pt-12 pb-12 px-6 text-center">
            <p className="text-lg font-semibold text-foreground mb-2">Listing not found</p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/seller/listings">Back to Listings</Link>
            </Button>
          </CardContent>
        </Card>
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
              onValueChange={(value) => setFormData({ ...formData, type: value as ListingType })}
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

          <div className="space-y-3">
            <Label htmlFor="category" className="text-base font-semibold">Category</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value as ListingCategory })}
            >
              <SelectTrigger id="category" className="min-h-[48px]">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cattle">Cattle</SelectItem>
                <SelectItem value="horses">Horses</SelectItem>
                <SelectItem value="wildlife">Wildlife</SelectItem>
                <SelectItem value="equipment">Equipment</SelectItem>
                <SelectItem value="land">Land</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status - Read-only for active listings with bids */}
          {existingListing.status === 'active' && existingListing.bids > 0 && (
            <Card className="border-2 border-primary/20 bg-primary/5">
              <CardContent className="pt-4 pb-4 px-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-foreground mb-1">Limited Editing</p>
                    <p className="text-sm text-muted-foreground">
                      This listing has {existingListing.bids} bid(s). You can edit description, photos, and add-ons, but type and pricing cannot be changed.
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
          {existingListing.status === 'active' && existingListing.bids > 0 ? (
            <Card className="border-2 border-border/50 bg-background/50">
              <CardContent className="pt-4 pb-4 px-4">
                <p className="text-sm text-muted-foreground font-medium mb-2">Current Listing Status:</p>
                {formData.type === 'auction' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Current Bid:</span>
                      <span className="font-bold text-foreground">${existingListing.currentBid?.toLocaleString() || 'No bids'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Bids:</span>
                      <Badge variant="secondary">{existingListing.bids}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Pricing cannot be changed while listing has active bids.
                    </p>
                  </div>
                )}
                {formData.type === 'fixed' && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Price:</span>
                    <span className="font-bold text-foreground">${existingListing.price?.toLocaleString() || 'N/A'}</span>
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
                      className="min-h-[48px] text-base bg-background"
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum price you'll accept. Won't be shown to bidders.
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
                    className="min-h-[48px] text-base bg-background"
                  />
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
            : true) // Starting bid optional if listing has bids
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
                {formData.insurance && (
                  <Badge variant="secondary" className="font-semibold">Insurance Available</Badge>
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

  const handleComplete = (data: Record<string, unknown>) => {
    // Prepare updated listing data
    const updatedListing = {
      id: listingId,
      title: formData.title,
      description: formData.description,
      type: formData.type as ListingType,
      category: formData.category,
      price: formData.type === 'fixed' || formData.type === 'classified' 
        ? parseFloat(formData.price || '0') 
        : undefined,
      startingBid: formData.type === 'auction' 
        ? parseFloat(formData.startingBid || '0') 
        : undefined,
      reservePrice: formData.type === 'auction' 
        ? parseFloat(formData.reservePrice || '0') || undefined
        : undefined,
      location: formData.location,
      images: formData.images,
      verificationStatus: formData.verification 
        ? (existingListing.verificationStatus === 'verified' ? 'verified' : 'pending' as const)
        : ('not_requested' as const),
      insuranceStatus: formData.insurance 
        ? ('available' as const)
        : ('not_selected' as const),
      transportStatus: formData.transport 
        ? ('quote_requested' as const)
        : ('not_requested' as const),
    };

    // Mock: Update listing (in real app, this would be an API call)
    console.log('Listing updated:', updatedListing);
    
    // Find and update in mockSellerListings array
    // Note: In a real app, this would be an API call to update the database
    const listingIndex = mockSellerListings.findIndex((l) => l.id === listingId);
    if (listingIndex !== -1) {
      // Update the listing while preserving read-only fields (views, watchers, bids, status)
      mockSellerListings[listingIndex] = {
        ...mockSellerListings[listingIndex],
        ...updatedListing,
        // Preserve these fields
        views: existingListing.views,
        watchers: existingListing.watchers,
        bids: existingListing.bids,
        status: existingListing.status,
        currentBid: existingListing.currentBid, // Don't override current bid
        endsAt: existingListing.endsAt,
      };
    }
    
    toast.success('Listing updated successfully!', {
      description: 'Your changes have been saved.',
    });
    
    // Redirect back to listings page
    setTimeout(() => {
      router.push('/seller/listings');
    }, 1500);
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
          <Badge variant={existingListing.status === 'active' ? 'default' : 'outline'} className="font-semibold text-sm">
            {existingListing.status.replace('_', ' ')}
          </Badge>
        </div>

        {/* Listing Info Banner */}
        <Card className="border-2 border-border/50 bg-card">
          <CardContent className="pt-6 pb-6 px-4 md:px-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm text-muted-foreground font-medium mb-1">Editing</p>
                <h2 className="text-xl font-bold text-foreground mb-2">{existingListing.title}</h2>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{existingListing.views} views</span>
                  {existingListing.type === 'auction' && (
                    <>
                      <span>{existingListing.watchers} watchers</span>
                      <span>{existingListing.bids} bids</span>
                    </>
                  )}
                </div>
              </div>
              <Button variant="outline" asChild className="min-h-[44px] font-semibold">
                <Link href={`/listing/${listingId}`} target="_blank">
                  View Live Listing
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stepper Form */}
        <Card className="border-2 border-border/50 bg-card">
          <CardContent className="pt-6 pb-6 px-4 md:px-6">
            <StepperForm steps={steps} onComplete={handleComplete} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
