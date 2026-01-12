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
import { Card } from '@/components/ui/card';
import { Upload, X } from 'lucide-react';
import { ListingType, ListingCategory } from '@/lib/types';
import { BottomNav } from '@/components/navigation/BottomNav';
import { useAuth } from '@/hooks/use-auth';
import { createListingDraft, publishListing } from '@/lib/firebase/listings';
import { useToast } from '@/hooks/use-toast';
import { AuthPromptModal } from '@/components/auth/AuthPromptModal';

function NewListingPageContent() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [formData, setFormData] = useState({
    type: '' as ListingType | '',
    category: '' as ListingCategory | '',
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
        </div>
      ),
      validate: () => !!formData.type && !!formData.category,
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
                className="min-h-[48px] text-base"
              />
            </div>
          </div>
        </div>
      ),
      validate: () => {
        return !!formData.title &&
          !!formData.description &&
          (formData.type === 'fixed' || formData.type === 'classified'
            ? !!formData.price
            : !!formData.startingBid);
      },
    },
    {
      id: 'media',
      title: 'Photos',
      description: 'Upload photos of your listing',
      content: (
        <div className="space-y-4">
          <Card className="border-2 border-dashed p-8 text-center min-h-[200px] flex items-center justify-center">
            <div className="space-y-4">
              <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <Label htmlFor="images" className="cursor-pointer">
                  <Button variant="outline" className="min-h-[48px] min-w-[200px]">
                    Upload Photos
                  </Button>
                </Label>
                <Input
                  id="images"
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    // TODO: Upload to Firebase Storage and get URLs
                    // For now, store placeholder URLs - image upload will be implemented later
                    const files = Array.from(e.target.files || []);
                    setFormData({
                      ...formData,
                      images: files.map((f) => URL.createObjectURL(f)),
                    });
                  }}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Upload up to 10 photos (JPG, PNG)
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Note: Image upload to Firebase Storage will be implemented in a future update
                </p>
              </div>
            </div>
          </Card>

          {formData.images.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {formData.images.map((img, idx) => (
                <div key={idx} className="relative aspect-square rounded-md overflow-hidden border">
                  <img src={img} alt={`Upload ${idx + 1}`} className="w-full h-full object-cover" />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6"
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
          )}
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

    setIsSubmitting(true);

    try {
      // Prepare listing data
      const listingData = {
        title: formData.title,
        description: formData.description,
        type: formData.type as 'auction' | 'fixed' | 'classified',
        category: formData.category as ListingCategory,
        location: {
          city: formData.location.city,
          state: formData.location.state,
          zip: formData.location.zip || undefined,
        },
        images: formData.images, // TODO: Replace with Firebase Storage URLs when upload is implemented
        trust: {
          verified: formData.verification,
          insuranceAvailable: formData.insurance,
          transportReady: formData.transport,
        },
        metadata: {},
      } as any;

      // Add pricing based on type
      if (formData.type === 'fixed' || formData.type === 'classified') {
        listingData.price = parseFloat(formData.price || '0');
      } else if (formData.type === 'auction') {
        listingData.startingBid = parseFloat(formData.startingBid || '0');
        if (formData.reservePrice) {
          listingData.reservePrice = parseFloat(formData.reservePrice);
        }
      }

      // Create listing as draft
      const listingId = await createListingDraft(user.uid, listingData);

      // Publish immediately (user clicked "Publish" in the form)
      await publishListing(user.uid, listingId);

      toast({
        title: 'Listing created successfully!',
        description: 'Your listing has been published and is now live.',
      });

      router.push(`/listing/${listingId}`);
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

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-4">
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        {/* Show a subtle banner if not authenticated */}
        {!user && (
          <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-lg">
            <p className="text-sm text-foreground">
              <span className="font-semibold">💡 Tip:</span> You can fill out the form now, but you'll need to sign in to publish your listing.
            </p>
          </div>
        )}
        
        <StepperForm 
          steps={steps} 
          onComplete={handleComplete}
        />
      </div>
      <BottomNav />
      
      {/* Authentication Prompt Modal */}
      <AuthPromptModal
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
        title="Sign in to publish your listing"
        description="You've filled out your listing! Sign in or create an account to publish it. Don't worry - your information will be saved."
        onAuthSuccess={() => {
          // After successful auth, the user will be redirected back
          // and can submit again
          setShowAuthModal(false);
        }}
      />
    </div>
  );
}

export default function NewListingPage() {
  return <NewListingPageContent />;
}
