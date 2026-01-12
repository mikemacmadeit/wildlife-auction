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
import { Upload, X, Loader2 } from 'lucide-react';
import { ListingType, ListingCategory } from '@/lib/types';
import { BottomNav } from '@/components/navigation/BottomNav';
import { useAuth } from '@/hooks/use-auth';
import { createListingDraft, publishListing, updateListing } from '@/lib/firebase/listings';
import { useToast } from '@/hooks/use-toast';
import { AuthPromptModal } from '@/components/auth/AuthPromptModal';
import { uploadListingImage } from '@/lib/firebase/storage';
import Image from 'next/image';

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
    images: [] as string[], // Array of image URLs (Firebase Storage URLs or local paths)
    verification: false,
    insurance: false,
    transport: false,
  });
  const [uploadingImages, setUploadingImages] = useState<Set<string>>(new Set());
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [listingId, setListingId] = useState<string | null>(null); // Store draft listing ID for image uploads

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
      description: 'Upload photos of your listing (required)',
      content: (
        <div className="space-y-4">
          {/* Upload Area */}
          <Card className="border-2 border-dashed p-8 text-center min-h-[200px] flex items-center justify-center">
            <div className="space-y-4 w-full">
              <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
              <div>
                <Label htmlFor="images" className="cursor-pointer">
                  <Button 
                    variant="outline" 
                    className="min-h-[48px] min-w-[200px]"
                    disabled={formData.images.length >= 8 || uploadingImages.size > 0}
                  >
                    {uploadingImages.size > 0 ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      'Upload Photos'
                    )}
                  </Button>
                </Label>
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
                        const draftData = {
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
                          metadata: {},
                        } as any;

                        if (formData.type === 'fixed' || formData.type === 'classified') {
                          draftData.price = parseFloat(formData.price || '0');
                        } else if (formData.type === 'auction') {
                          draftData.startingBid = parseFloat(formData.startingBid || '0');
                        }

                        currentListingId = await createListingDraft(user.uid, draftData);
                        setListingId(currentListingId);
                      } catch (error: any) {
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
                        } catch (updateError) {
                          console.error('Error updating listing with image:', updateError);
                          // Don't fail the upload if update fails - images are already in formData
                        }
                      } catch (error: any) {
                        console.error('Error uploading image:', error);
                        toast({
                          title: 'Upload failed',
                          description: error.message || `Failed to upload ${file.name}. Please try again.`,
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
        images: formData.images, // Firebase Storage URLs
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
      await publishListing(user.uid, finalListingId);

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
