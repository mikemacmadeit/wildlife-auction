'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { StepperForm } from '@/components/forms/StepperForm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, X, ArrowLeft } from 'lucide-react';
import { ListingType, ListingCategory } from '@/lib/types';
import { toast } from 'sonner';
import { mockSellerListings } from '@/lib/seller-mock-data';

export default function NewSellerListingPage() {
  const router = useRouter();
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
  });

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
              <SelectTrigger id="category" className="min-h-[48px] bg-background">
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
        </div>
      ),
      validate: () => !!formData.type && !!formData.category,
      errorMessage: 'Please select a listing type and category before continuing.',
    },
    {
      id: 'details',
      title: 'Listing Details',
      description: 'Describe what you\'re selling',
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
        const hasTitle = !!formData.title?.trim();
        const hasDescription = !!formData.description?.trim();
        const hasCity = !!formData.location.city?.trim();
        const hasState = !!formData.location.state?.trim();
        
        let hasPrice = true;
        if (formData.type === 'fixed' || formData.type === 'classified') {
          hasPrice = !!formData.price && parseFloat(formData.price) > 0;
        } else if (formData.type === 'auction') {
          hasPrice = !!formData.startingBid && parseFloat(formData.startingBid) > 0;
        }
        
        return hasTitle && hasDescription && hasCity && hasState && hasPrice;
      },
      errorMessage: 'Please complete all required fields (title, description, location, and price/bid) before continuing.',
    },
    {
      id: 'media',
      title: 'Photos',
      description: 'Upload photos of your listing',
      content: (
        <div className="space-y-4">
          {formData.images.length > 0 && (
            <div>
              <Label className="text-base font-semibold mb-2 block">Uploaded Photos</Label>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {formData.images.map((img, idx) => (
                  <div key={idx} className="relative aspect-square rounded-md overflow-hidden border-2 border-border/50 group">
                    <img 
                      src={img}
                      alt={`Photo ${idx + 1}`} 
                      className="w-full h-full object-cover"
                    />
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
                ))}
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
      description: 'Optional: Add verification and protection',
      content: (
        <div className="space-y-6">
          <Card className="p-4 border-2 border-border/50 bg-card">
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

          <Card className="p-4 border-2 border-border/50 bg-card">
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

          <Card className="p-4 border-2 border-border/50 bg-card">
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
          <Card className="border-2 border-border/50 bg-card">
            <CardContent className="pt-6 pb-6 px-4 md:px-6 space-y-4">
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
                    {formData.images.slice(0, 4).map((img, idx) => (
                      <div key={idx} className="relative w-full aspect-square rounded-md overflow-hidden border border-border/50">
                        <img 
                          src={img} 
                          alt={`Preview ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
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
                  <span className="px-2 py-1 text-xs font-semibold rounded bg-primary/10 text-primary">Verification</span>
                )}
                {formData.insurance && (
                  <span className="px-2 py-1 text-xs font-semibold rounded bg-primary/10 text-primary">Insurance Available</span>
                )}
                {formData.transport && (
                  <span className="px-2 py-1 text-xs font-semibold rounded bg-primary/10 text-primary">Transport Ready</span>
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
    // Note: data parameter from StepperForm is empty, we use formData directly
    try {
      // Validate required fields
      if (!formData.type || !formData.category) {
        toast.error('Please select a listing type and category');
        return;
      }

      if (!formData.title || !formData.description) {
        toast.error('Please enter a title and description');
        return;
      }

      if (formData.type === 'auction' && !formData.startingBid) {
        toast.error('Please enter a starting bid for auction listings');
        return;
      }

      if ((formData.type === 'fixed' || formData.type === 'classified') && !formData.price) {
        toast.error('Please enter a price for this listing type');
        return;
      }

      if (!formData.location.city || !formData.location.state) {
        toast.error('Please enter a city and state');
        return;
      }

      // Generate a new listing ID
      const newId = `listing-${Date.now()}`;
      
      // Create new listing object matching SellerListing interface
      const newListing = {
        id: newId,
        title: formData.title.trim(),
        description: formData.description.trim(),
        type: formData.type as ListingType,
        category: formData.category,
        status: 'draft' as const,
        price: formData.type === 'fixed' || formData.type === 'classified' 
          ? parseFloat(formData.price || '0') 
          : undefined,
        startingBid: formData.type === 'auction' 
          ? parseFloat(formData.startingBid || '0') 
          : undefined,
        reservePrice: formData.type === 'auction' && formData.reservePrice
          ? parseFloat(formData.reservePrice)
          : undefined,
        currentBid: formData.type === 'auction' 
          ? parseFloat(formData.startingBid || '0') 
          : undefined,
        location: {
          city: formData.location.city.trim(),
          state: formData.location.state.trim(),
          zip: formData.location.zip?.trim() || undefined,
        },
        images: formData.images,
        views: 0,
        watchers: 0,
        bids: 0,
        verificationStatus: formData.verification ? ('pending' as const) : ('not_requested' as const),
        insuranceStatus: formData.insurance ? ('available' as const) : ('not_selected' as const),
        transportStatus: formData.transport ? ('quote_requested' as const) : ('not_requested' as const),
      };

      // Add to mockSellerListings array (in a real app, this would be an API call to Firestore)
      mockSellerListings.push(newListing);

      console.log('Listing created:', newListing);
      
      toast.success('Listing created successfully!', {
        description: 'Your listing has been saved as a draft. You can publish it from your listings page.',
      });

      // Redirect to listings page after a short delay
      setTimeout(() => {
        router.push('/seller/listings');
      }, 1500);
    } catch (error) {
      console.error('Error creating listing:', error);
      toast.error('Failed to create listing', {
        description: 'Please try again or contact support if the problem persists.',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-6">
      <div className="container mx-auto px-4 py-6 md:py-8 max-w-4xl space-y-6">
        {/* Header */}
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
              Create New Listing
            </h1>
            <p className="text-base md:text-lg text-muted-foreground">
              Add a new listing to your seller profile
            </p>
          </div>
        </div>

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
