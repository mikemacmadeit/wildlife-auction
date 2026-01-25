'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StepperForm } from '@/components/forms/StepperForm';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, X, Loader2, ArrowLeft, Save, CheckCircle2 } from 'lucide-react';
import { ListingType, ListingCategory } from '@/lib/types';
import { BottomNav } from '@/components/navigation/BottomNav';
import { useAuth } from '@/hooks/use-auth';
import { createEmptyListingDraft, createListingDraft, publishListing, updateListing } from '@/lib/firebase/listings';
import { useToast } from '@/hooks/use-toast';
import { AuthPromptModal } from '@/components/auth/AuthPromptModal';
import { ListingPhotoPicker, type ListingPhotoSnapshot } from '@/components/photos/ListingPhotoPicker';
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  ListingAttributes,
  WildlifeAttributes,
  CattleAttributes,
  EquipmentAttributes,
  WhitetailBreederAttributes,
  SportingWorkingDogAttributes,
} from '@/lib/types';
import { AlertCircle } from 'lucide-react';
import { CategoryAttributeForm } from '@/components/listings/CategoryAttributeForm';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { HelpTooltip } from '@/components/help/HelpTooltip';
import { ImageGallery } from '@/components/listing/ImageGallery';
import { KeyFactsPanel } from '@/components/listing/KeyFactsPanel';
import { Separator } from '@/components/ui/separator';
import { getUserProfile } from '@/lib/firebase/users';
import { UserProfile } from '@/lib/types';
import { PayoutReadinessCard } from '@/components/seller/PayoutReadinessCard';
import { cn } from '@/lib/utils';
import { formatDateTimeLocal, isFutureDateTimeLocalString, parseDateTimeLocal } from '@/lib/datetime/datetimeLocal';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { isAnimalCategory } from '@/lib/compliance/requirements';
import { ALLOWED_DURATION_DAYS, isValidDurationDays } from '@/lib/listings/duration';
// Seller Tiers model: no listing limits.

// Helper function to format number with commas for display
function formatPriceWithCommas(value: string): string {
  if (!value || value.trim() === '') return '';
  // Remove all non-digit characters except decimal point
  const cleaned = value.replace(/[^\d.]/g, '');
  if (!cleaned) return '';
  // Split by decimal point
  const parts = cleaned.split('.');
  // Format the integer part with commas
  const integerPart = parts[0] || '0';
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // Rejoin with decimal part if it exists (limit to 2 decimal places)
  if (parts.length > 1) {
    const decimalPart = parts[1].slice(0, 2); // Limit to 2 decimal places
    return `${formattedInteger}.${decimalPart}`;
  }
  return formattedInteger;
}

// Helper function to parse price string (remove commas) for saving
function parsePriceString(value: string): string {
  // Remove all commas and other non-numeric characters except decimal point
  return value.replace(/[^\d.]/g, '');
}

// Helper function to check if a category requires quantity
function categoryRequiresQuantity(category: ListingCategory | ''): boolean {
  return (
    category === 'whitetail_breeder' ||
    category === 'wildlife_exotics' ||
    category === 'cattle_livestock' ||
    category === 'horse_equestrian' ||
    category === 'sporting_working_dogs' ||
    category === 'hunting_outfitter_assets' ||
    category === 'ranch_equipment' ||
    category === 'ranch_vehicles'
  );
}

function NewListingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [showPendingApprovalModal, setShowPendingApprovalModal] = useState(false);
  const [submittedListingId, setSubmittedListingId] = useState<string | null>(null);
  // (No listing-limit gating in Seller Tiers model)
  const [sellerAttestationAccepted, setSellerAttestationAccepted] = useState(false);
  const [sellerAnimalAttestationAccepted, setSellerAnimalAttestationAccepted] = useState(false);
  const sellerAnimalAckForceRef = useRef(false);
  const [sellerAnimalAckModalOpen, setSellerAnimalAckModalOpen] = useState(false);
  const [sellerAnimalAckModalChecked, setSellerAnimalAckModalChecked] = useState(false);
  const pendingPublishPayloadRef = useRef<Record<string, unknown> | null>(null);
  const [tourRequestedStep, setTourRequestedStep] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    category: ListingCategory | '';
    type: ListingType | '';
    title: string;
    description: string;
    price: string;
    startingBid: string;
    reservePrice: string;
    endsAt: string;
    durationDays: 1 | 3 | 5 | 7 | 10;
    location: { city: string; state: string; zip: string };
    images: string[];
    photoIds: string[];
    photos: ListingPhotoSnapshot[];
    coverPhotoId?: string;
    verification: boolean;
    transportType: 'seller' | 'buyer' | null;
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
    attributes: Partial<WildlifeAttributes | CattleAttributes | SportingWorkingDogAttributes | EquipmentAttributes | WhitetailBreederAttributes>;
  }>({
    category: '',
    type: '',
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
    photoIds: [],
    photos: [],
    coverPhotoId: undefined,
    verification: false,
    transportType: null as 'seller' | 'buyer' | null,
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
  const [listingId, setListingId] = useState<string | null>(null); // Store draft listing ID for image uploads
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [tpwdPermit, setTpwdPermit] = useState<null | {
    status: 'pending' | 'verified' | 'rejected';
    rejectionReason?: string | null;
    expiresAt?: string | null;
    uploadedAt?: string | null;
    reviewedAt?: string | null;
  }>(null);
  const [payoutsGateOpen, setPayoutsGateOpen] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState<Record<string, boolean>>({});
  const [resumeDraftOpen, setResumeDraftOpen] = useState(false);
  const [resumeDraftPayload, setResumeDraftPayload] = useState<{
    formData: any;
    sellerAttestationAccepted?: boolean;
    sellerAnimalAttestationAccepted?: boolean;
    listingId?: string | null;
    savedAtMs?: number;
  } | null>(null);

  // Crop settings selected during photo upload/crop (used to match review preview to chosen crop).
  const focalPointsByUrl = useMemo(() => {
    const m: Record<string, { x: number; y: number; zoom?: number }> = {};
    const photos = Array.isArray(formData.photos) ? formData.photos : [];
    for (const p of photos) {
      const url = typeof (p as any)?.url === 'string' ? String((p as any).url) : '';
      const fp = (p as any)?.focalPoint;
      if (!url || !fp) continue;
      if (typeof fp?.x === 'number' && typeof fp?.y === 'number') {
        const zRaw = (p as any)?.cropZoom;
        const zoom = typeof zRaw === 'number' && Number.isFinite(zRaw) ? Math.max(1, Math.min(3, zRaw)) : undefined;
        m[url] = { x: fp.x, y: fp.y, zoom };
      }
    }
    return m;
  }, [formData.photos]);

  // Autosave: local (always) + server (only once we have a draftId).
  const [autoSaveState, setAutoSaveState] = useState<{
    status: 'idle' | 'saving' | 'saved' | 'error';
    lastSavedAtMs?: number;
  }>({ status: 'idle' });
  const localSaveTimerRef = useRef<any>(null);
  const serverSaveTimerRef = useRef<any>(null);
  const lastServerSaveSigRef = useRef<string>('');
  const restoredOnceRef = useRef(false);
  const exitingWithoutSavingRef = useRef(false);

  const hasAnyProgress = useMemo(() => {
    return Boolean(
      formData.type ||
        formData.category ||
        formData.title ||
        formData.description ||
        (formData.images?.length || 0) > 0 ||
        (formData.photoIds?.length || 0) > 0
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.type, formData.category, formData.title, formData.description, formData.images?.length, formData.photoIds?.length]);

  const autosaveSig = useMemo(() => {
    // Only include stable primitives / plain objects (no File handles).
    return JSON.stringify({
      category: formData.category,
      type: formData.type,
      title: formData.title,
      description: formData.description,
      price: formData.price,
      startingBid: formData.startingBid,
      reservePrice: formData.reservePrice,
      durationDays: formData.durationDays,
      location: formData.location,
      photoIds: formData.photoIds,
      coverPhotoId: formData.coverPhotoId,
      verification: formData.verification,
      transportType: formData.transportType,
      protectedTransactionEnabled: formData.protectedTransactionEnabled,
      protectedTransactionDays: formData.protectedTransactionDays,
      bestOffer: formData.bestOffer,
      attributes: formData.attributes,
      sellerAttestationAccepted,
      sellerAnimalAttestationAccepted,
      listingId,
    });
  }, [formData, sellerAttestationAccepted, sellerAnimalAttestationAccepted, listingId]);

  const autosaveKey = (uid: string | null) => `we:create_listing_autosave:v1:${uid || 'anon'}`;
  const fresh = searchParams?.get('fresh') === '1';

  // Restore autosaved progress (localStorage) on first mount.
  useEffect(() => {
    if (authLoading) return;
    if (typeof window === 'undefined') return;
    if (restoredOnceRef.current) return;
    // When coming from "start new listing" entry points (e.g. homepage CTA),
    // do NOT auto-restore a previous draft.
    if (fresh) {
      restoredOnceRef.current = true;
      return;
    }
    if (hasAnyProgress) return;

    const keyUser = autosaveKey(user?.uid || null);
    const keyAnon = autosaveKey(null);
    const raw = window.localStorage.getItem(keyUser) || window.localStorage.getItem(keyAnon);
    if (!raw) {
      restoredOnceRef.current = true;
      return;
    }

    try {
      // IMPORTANT: do not auto-restore silently (it makes "new listing" feel broken).
      // Instead, prompt the user to resume the prior draft or start fresh.
      const parsed = JSON.parse(raw) as any;
      if (parsed?.formData) {
        setResumeDraftPayload({
          formData: parsed.formData,
          sellerAttestationAccepted: typeof parsed?.sellerAttestationAccepted === 'boolean' ? parsed.sellerAttestationAccepted : undefined,
          sellerAnimalAttestationAccepted:
            typeof parsed?.sellerAnimalAttestationAccepted === 'boolean' ? parsed.sellerAnimalAttestationAccepted : undefined,
          listingId: typeof parsed?.listingId === 'string' ? parsed.listingId.trim() : null,
          savedAtMs: typeof parsed?.savedAtMs === 'number' ? parsed.savedAtMs : undefined,
        });
        setResumeDraftOpen(true);
      } else {
        restoredOnceRef.current = true;
      }
    } catch {
      // ignore
    } finally {
      // Do not mark restored until the user chooses an action (resume vs fresh).
    }
  }, [authLoading, hasAnyProgress, user?.uid, fresh]);

  // Local autosave (fast, reliable). Runs even if the user isn't signed in yet.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (exitingWithoutSavingRef.current) return;
    if (!hasAnyProgress) return;

    if (localSaveTimerRef.current) clearTimeout(localSaveTimerRef.current);
    localSaveTimerRef.current = setTimeout(() => {
      try {
        const savedAtMs = Date.now();
        window.localStorage.setItem(
          autosaveKey(user?.uid || null),
          JSON.stringify({
            formData,
            sellerAttestationAccepted,
            sellerAnimalAttestationAccepted,
            listingId,
            savedAtMs,
          })
        );
        setAutoSaveState((s) => ({ ...s, status: 'saved', lastSavedAtMs: savedAtMs }));
      } catch {
        // ignore
      }
    }, 400);

    return () => {
      if (localSaveTimerRef.current) clearTimeout(localSaveTimerRef.current);
    };
  }, [formData, sellerAttestationAccepted, sellerAnimalAttestationAccepted, listingId, user?.uid, hasAnyProgress]);

  // Server autosave (debounced). Only updates an existing draft to avoid duplicates.
  useEffect(() => {
    if (!user?.uid) return;
    if (exitingWithoutSavingRef.current) return;
    if (!listingId) return;
    if (!hasAnyProgress) return;
    // Whitetail drafts are gated on attestation.
    if (formData.category === 'whitetail_breeder' && !sellerAttestationAccepted) return;

    // Avoid spamming the network if nothing changed since last successful save.
    if (autosaveSig === lastServerSaveSigRef.current) return;

    if (serverSaveTimerRef.current) clearTimeout(serverSaveTimerRef.current);
    serverSaveTimerRef.current = setTimeout(async () => {
      try {
        setAutoSaveState((s) => ({ ...s, status: 'saving' }));

        // Safety: the "new listing" flow must never server-autosave onto an already-published listing.
        // If localStorage restores a stale listingId (active/sold/expired), Firestore rules can deny the write
        // and we also risk mutating a live listing unintentionally.
        try {
          const snap = await getDoc(doc(db, 'listings', listingId));
          const status = snap.exists() ? String((snap.data() as any)?.status || '') : '';
          if (status && status !== 'draft' && status !== 'pending') {
            setListingId(null);
            setAutoSaveState((s) => ({ ...s, status: 'idle' }));
            return;
          }
        } catch {
          // Best-effort guard: if we can't verify, skip server autosave rather than risk a rules-denied write.
          setAutoSaveState((s) => ({ ...s, status: 'idle' }));
          return;
        }

        const locationData: any = {
          city: formData.location.city,
          state: formData.location.state,
        };
        if (formData.location.zip && formData.location.zip.trim()) {
          locationData.zip = formData.location.zip.trim();
        }

        const listingData: any = {
          title: formData.title || 'Draft Listing',
          description: formData.description || '',
          // Classified listings are deprecated; treat any legacy value as fixed.
          type: ((formData.type === 'classified' ? 'fixed' : formData.type) || 'fixed') as 'auction' | 'fixed',
          category: formData.category as any,
          durationDays: formData.durationDays,
          location: locationData,
          images: formData.images,
          photoIds: formData.photoIds,
          photos: formData.photos,
          coverPhotoId: formData.coverPhotoId,
          trust: {
            verified: formData.verification,
            insuranceAvailable: false,
            transportReady: formData.transportType !== null,
            sellerOffersDelivery: formData.transportType === 'seller',
          },
          protectedTransactionEnabled: formData.protectedTransactionEnabled,
          protectedTransactionDays: formData.protectedTransactionDays,
          ...(formData.protectedTransactionEnabled && { protectedTermsVersion: 'v1' }),
          attributes: formData.attributes as ListingAttributes,
          ...(formData.category === 'whitetail_breeder' && sellerAttestationAccepted && {
            sellerAttestationAccepted: true,
            sellerAttestationAcceptedAt: new Date(),
          }),
          ...(formData.category &&
            isAnimalCategory(formData.category as any) &&
            formData.category !== 'whitetail_breeder' &&
            sellerAnimalAttestationAccepted && {
              sellerAnimalAttestationAccepted: true,
              sellerAnimalAttestationAcceptedAt: new Date(),
            }),
        };

        if (formData.type === 'fixed') {
          listingData.price = parseFloat(parsePriceString(formData.price || '0') || '0');
        } else if (formData.type === 'auction') {
          listingData.startingBid = parseFloat(parsePriceString(formData.startingBid || '0') || '0');
          if (formData.reservePrice) {
            listingData.reservePrice = parseFloat(parsePriceString(formData.reservePrice));
          }
        }

        await updateListing(user.uid, listingId, listingData);
        lastServerSaveSigRef.current = autosaveSig;
        setAutoSaveState((s) => ({ ...s, status: 'saved', lastSavedAtMs: Date.now() }));
      } catch {
        // Best-effort: local autosave still protects the user.
        setAutoSaveState((s) => ({ ...s, status: 'error' }));
      }
    }, 2000);

    return () => {
      if (serverSaveTimerRef.current) clearTimeout(serverSaveTimerRef.current);
    };
  }, [autosaveSig, formData, hasAnyProgress, listingId, sellerAttestationAccepted, sellerAnimalAttestationAccepted, user?.uid]);

  const refreshUserProfile = async () => {
    if (!user) return;
    try {
      const profile = await getUserProfile(user.uid);
      setUserProfile(profile);
    } catch (e) {
      // Best-effort; don't block listing creation UX on profile fetch
      console.warn('Failed to load user profile for payouts readiness', e);
    }
  };

  // Listen for tour step advancement requests
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleTourAdvance = (e: CustomEvent<{ stepId: string }>) => {
      setTourRequestedStep(e.detail.stepId);
    };
    window.addEventListener('tour:advance-form-step', handleTourAdvance as EventListener);
    return () => {
      window.removeEventListener('tour:advance-form-step', handleTourAdvance as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setUserProfile(null);
      setTpwdPermit(null);
      return;
    }
    refreshUserProfile();
    
    // Real-time listener for TPWD permit status (controls whitetail category gating in Create Listing)
    // This ensures the category becomes available immediately when a permit is approved
    const permitRef = doc(db, 'sellerPermits', user.uid);
    const unsubscribe = onSnapshot(
      permitRef,
      (snap) => {
        if (!snap.exists()) {
          setTpwdPermit(null);
          return;
        }
        const data = snap.data() as any;
        if (!data?.status) {
          setTpwdPermit(null);
          return;
        }
        setTpwdPermit({
          status: data.status,
          rejectionReason: data.rejectionReason || null,
          expiresAt: data.expiresAt?.toDate ? data.expiresAt.toDate().toISOString() : (data.expiresAt instanceof Date ? data.expiresAt.toISOString() : null),
          uploadedAt: data.uploadedAt?.toDate ? data.uploadedAt.toDate().toISOString() : (data.uploadedAt instanceof Date ? data.uploadedAt.toISOString() : null),
          reviewedAt: data.reviewedAt?.toDate ? data.reviewedAt.toDate().toISOString() : (data.reviewedAt instanceof Date ? data.reviewedAt.toISOString() : null),
        });
      },
      (error) => {
        console.error('Error listening to breeder permit:', error);
        setTpwdPermit(null);
      }
    );
    
    return () => unsubscribe();
  }, [user?.uid]);

  const payoutsReady =
    !!userProfile?.stripeAccountId &&
    userProfile?.stripeOnboardingStatus === 'complete' &&
    userProfile?.payoutsEnabled === true &&
    userProfile?.chargesEnabled === true;

  const whitetailPermitStatus = tpwdPermit?.status || null;
  
  // Check if permit is verified AND not expired
  const isPermitExpired = tpwdPermit?.expiresAt 
    ? new Date(tpwdPermit.expiresAt).getTime() < Date.now()
    : false;
  
  const canSelectWhitetail = whitetailPermitStatus === 'verified' && !isPermitExpired;

  const numberFromInput = (raw: string): number | null => {
    const s = String(raw || '').trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  const isPositiveMoney = (raw: string): boolean => {
    // Remove commas before validation
    const cleaned = parsePriceString(raw);
    const n = numberFromInput(cleaned);
    return typeof n === 'number' && n > 0;
  };

  const isFutureDateString = (raw: string): boolean => {
    // Back-compat helper still used by legacy UIs; duration model supersedes this for listing expiry.
    // datetime-local strings should be interpreted as LOCAL time.
    return isFutureDateTimeLocalString(raw, 60_000);
  };

  const steps = [
    {
      id: 'category',
      title: 'Category',
      description: 'Choose what you\'re listing',
      content: (
        <div className="space-y-6" data-tour="listing-category-step">
          {validationAttempted.category && !formData.category ? (
            <Alert className="bg-destructive/10 border-destructive/20">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-destructive">
                Please select a category to continue.
              </AlertDescription>
            </Alert>
          ) : null}
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>Texas-Only:</strong> All animal transactions (whitetail breeder, exotics, cattle, horses, dogs) are restricted to Texas residents only. Equipment/asset listings can be multi-state.
            </AlertDescription>
          </Alert>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card
              role="button"
              tabIndex={canSelectWhitetail ? 0 : -1}
              aria-pressed={formData.category === 'whitetail_breeder'}
              aria-disabled={!canSelectWhitetail}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (!canSelectWhitetail) {
                    toast({
                      title: 'TPWD Required',
                      description: 'Upload and verify your TPWD breeder permit to create Whitetail listings.',
                    });
                    return;
                  }
                  setFormData({
                    ...formData,
                    category: 'whitetail_breeder',
                    location: { ...formData.location, state: 'TX' }, // Force TX for animals
                    attributes: {
                      ...formData.attributes,
                      quantity: 1, // Initialize quantity to 1 immediately
                    },
                  });
                }
              }}
              className={`relative transition-all border-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                formData.category === 'whitetail_breeder'
                  ? 'border-primary bg-primary/15 ring-4 ring-primary/30 ring-offset-2 ring-offset-background shadow-lg shadow-primary/10 scale-[1.01]'
                  : canSelectWhitetail
                    ? 'border-border cursor-pointer hover:border-primary/60 hover:bg-muted/30 hover:shadow-sm'
                    : 'border-border bg-muted/20 opacity-60 grayscale cursor-not-allowed'
              }`}
              onClick={() => {
                if (!canSelectWhitetail) {
                  toast({
                    title: 'TPWD Required',
                    description: 'Upload and verify your TPWD breeder permit to create Whitetail listings.',
                  });
                  return;
                }
                setFormData({ 
                  ...formData, 
                  category: 'whitetail_breeder',
                  location: { ...formData.location, state: 'TX' }, // Force TX for animals
                  attributes: {
                    ...formData.attributes,
                    quantity: 1, // Initialize quantity to 1 immediately
                  },
                });
              }}
            >
              <CardContent className="p-4">
                {formData.category === 'whitetail_breeder' && (
                  <div className="absolute top-3 right-3">
                    <div className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  </div>
                )}
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
                      <Badge
                        variant="outline"
                        className="text-[11px] whitespace-nowrap px-2"
                      >
                        TPWD REQUIRED
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              role="button"
              tabIndex={0}
              aria-pressed={formData.category === 'wildlife_exotics'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFormData({
                    ...formData,
                    category: 'wildlife_exotics',
                    location: { ...formData.location, state: 'TX' }, // Force TX for animals
                    attributes: {
                      ...formData.attributes,
                      quantity: 1, // Initialize quantity to 1 immediately
                    },
                  });
                }
              }}
              className={`relative cursor-pointer transition-all border-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                formData.category === 'wildlife_exotics'
                  ? 'border-primary bg-primary/15 ring-4 ring-primary/30 ring-offset-2 ring-offset-background shadow-lg shadow-primary/10 scale-[1.01]'
                  : 'border-border hover:border-primary/60 hover:bg-muted/30 hover:shadow-sm'
              }`}
              onClick={() => {
                setFormData({ 
                  ...formData, 
                  category: 'wildlife_exotics',
                  location: { ...formData.location, state: 'TX' }, // Force TX for animals
                  attributes: {
                    ...formData.attributes,
                    quantity: 1, // Initialize quantity to 1 immediately
                  },
                });
              }}
            >
              <CardContent className="p-4">
                {formData.category === 'wildlife_exotics' && (
                  <div className="absolute top-3 right-3">
                    <div className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  </div>
                )}
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
                    <h3 className="text-base font-bold leading-tight">Wildlife &amp; Exotics</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      Axis deer, blackbuck, fallow deer, and other exotic species
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              role="button"
              tabIndex={0}
              aria-pressed={formData.category === 'horse_equestrian'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFormData({
                    ...formData,
                    category: 'horse_equestrian',
                    attributes: { ...(formData.attributes as any), speciesId: 'horse', quantity: 1 }, // Initialize quantity to 1 immediately
                    location: { ...formData.location, state: 'TX' }, // Force TX for horses
                  });
                }
              }}
              className={`relative cursor-pointer transition-all border-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                formData.category === 'horse_equestrian'
                  ? 'border-primary bg-primary/15 ring-4 ring-primary/30 ring-offset-2 ring-offset-background shadow-lg shadow-primary/10 scale-[1.01]'
                  : 'border-border hover:border-primary/60 hover:bg-muted/30 hover:shadow-sm'
              }`}
              onClick={() => {
                setFormData({
                  ...formData,
                  category: 'horse_equestrian',
                  attributes: { ...(formData.attributes as any), speciesId: 'horse', quantity: 1 }, // Initialize quantity to 1 immediately
                  location: { ...formData.location, state: 'TX' }, // Force TX for horses
                });
              }}
            >
              <CardContent className="p-4">
                {formData.category === 'horse_equestrian' && (
                  <div className="absolute top-3 right-3">
                    <div className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  </div>
                )}
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

            <Card
              role="button"
              tabIndex={0}
              aria-pressed={formData.category === 'sporting_working_dogs'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFormData({
                    ...formData,
                    category: 'sporting_working_dogs',
                    attributes: { ...(formData.attributes as any), speciesId: 'dog' },
                    location: { ...formData.location, state: 'TX' }, // Force TX for animals
                  });
                }
              }}
              className={`relative cursor-pointer transition-all border-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                formData.category === 'sporting_working_dogs'
                  ? 'border-primary bg-primary/15 ring-4 ring-primary/30 ring-offset-2 ring-offset-background shadow-lg shadow-primary/10 scale-[1.01]'
                  : 'border-border hover:border-primary/60 hover:bg-muted/30 hover:shadow-sm'
              }`}
              onClick={() => {
                setFormData({
                  ...formData,
                  category: 'sporting_working_dogs',
                  attributes: { ...(formData.attributes as any), speciesId: 'dog', quantity: 1 }, // Initialize quantity to 1 immediately
                  location: { ...formData.location, state: 'TX' }, // Force TX for animals
                });
              }}
            >
              <CardContent className="p-4">
                {formData.category === 'sporting_working_dogs' && (
                  <div className="absolute top-3 right-3">
                    <div className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  </div>
                )}
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

            <Card
              role="button"
              tabIndex={0}
              aria-pressed={formData.category === 'cattle_livestock'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFormData({
                    ...formData,
                    category: 'cattle_livestock',
                    location: { ...formData.location, state: 'TX' }, // Force TX for animals
                    attributes: {
                      ...formData.attributes,
                      quantity: 1, // Initialize quantity to 1 immediately
                    },
                  });
                }
              }}
              className={`relative cursor-pointer transition-all border-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                formData.category === 'cattle_livestock'
                  ? 'border-primary bg-primary/15 ring-4 ring-primary/30 ring-offset-2 ring-offset-background shadow-lg shadow-primary/10 scale-[1.01]'
                  : 'border-border hover:border-primary/60 hover:bg-muted/30 hover:shadow-sm'
              }`}
              onClick={() => {
                setFormData({ 
                  ...formData, 
                  category: 'cattle_livestock',
                  location: { ...formData.location, state: 'TX' }, // Force TX for animals
                  attributes: {
                    ...formData.attributes,
                    quantity: 1, // Initialize quantity to 1 immediately
                  },
                });
              }}
            >
              <CardContent className="p-4">
                {formData.category === 'cattle_livestock' && (
                  <div className="absolute top-3 right-3">
                    <div className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  </div>
                )}
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
                    <h3 className="text-base font-bold leading-tight">Cattle &amp; Livestock</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      Cattle, bulls, cows, heifers, and registered livestock
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              role="button"
              tabIndex={0}
              aria-pressed={formData.category === 'hunting_outfitter_assets'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFormData({ 
                    ...formData, 
                    category: 'hunting_outfitter_assets',
                    attributes: {
                      ...formData.attributes,
                      quantity: 1, // Initialize quantity to 1 immediately
                    },
                  });
                }
              }}
              className={`relative cursor-pointer transition-all border-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                formData.category === 'hunting_outfitter_assets'
                  ? 'border-primary bg-primary/15 ring-4 ring-primary/30 ring-offset-2 ring-offset-background shadow-lg shadow-primary/10 scale-[1.01]'
                  : 'border-border hover:border-primary/60 hover:bg-muted/30 hover:shadow-sm'
              }`}
              onClick={() => setFormData({ 
                ...formData, 
                category: 'hunting_outfitter_assets',
                attributes: {
                  ...formData.attributes,
                  quantity: 1, // Initialize quantity to 1 immediately
                },
              })}
            >
              <CardContent className="p-4">
                {formData.category === 'hunting_outfitter_assets' && (
                  <div className="absolute top-3 right-3">
                    <div className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  </div>
                )}
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

            <Card
              role="button"
              tabIndex={0}
              aria-pressed={formData.category === 'ranch_equipment'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFormData({ 
                    ...formData, 
                    category: 'ranch_equipment',
                    attributes: {
                      ...formData.attributes,
                      quantity: 1, // Initialize quantity to 1 immediately
                    },
                  });
                }
              }}
              className={`relative cursor-pointer transition-all border-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                formData.category === 'ranch_equipment'
                  ? 'border-primary bg-primary/15 ring-4 ring-primary/30 ring-offset-2 ring-offset-background shadow-lg shadow-primary/10 scale-[1.01]'
                  : 'border-border hover:border-primary/60 hover:bg-muted/30 hover:shadow-sm'
              }`}
              onClick={() => setFormData({ 
                ...formData, 
                category: 'ranch_equipment',
                attributes: {
                  ...formData.attributes,
                  quantity: 1, // Initialize quantity to 1 immediately
                },
              })}
            >
              <CardContent className="p-4">
                {formData.category === 'ranch_equipment' && (
                  <div className="absolute top-3 right-3">
                    <div className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  </div>
                )}
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

            <Card
              role="button"
              tabIndex={0}
              aria-pressed={formData.category === 'ranch_vehicles'}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setFormData({ 
                    ...formData, 
                    category: 'ranch_vehicles',
                    attributes: {
                      ...formData.attributes,
                      quantity: 1, // Initialize quantity to 1 immediately
                    },
                  });
                }
              }}
              className={`relative cursor-pointer transition-all border-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                formData.category === 'ranch_vehicles'
                  ? 'border-primary bg-primary/15 ring-4 ring-primary/30 ring-offset-2 ring-offset-background shadow-lg shadow-primary/10 scale-[1.01]'
                  : 'border-border hover:border-primary/60 hover:bg-muted/30 hover:shadow-sm'
              }`}
              onClick={() => setFormData({ 
                ...formData, 
                category: 'ranch_vehicles',
                attributes: {
                  ...formData.attributes,
                  quantity: 1, // Initialize quantity to 1 immediately
                },
              })}
            >
              <CardContent className="p-4">
                {formData.category === 'ranch_vehicles' && (
                  <div className="absolute top-3 right-3">
                    <div className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-primary/20">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  </div>
                )}
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
          {validationAttempted.type && !formData.type ? (
            <Alert className="bg-destructive/10 border-destructive/20">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-destructive">
                Please select a listing type to continue.
              </AlertDescription>
            </Alert>
          ) : null}
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>Single Mode:</strong> Each listing must be either Auction or Fixed Price.
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
                } else if (value === 'fixed') {
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
              if (formData.category === 'wildlife_exotics') {
                const attrs = formData.attributes as Partial<WildlifeAttributes>;
                const errs: string[] = [];
                if (!attrs.speciesId) errs.push('Species');
                if (!attrs.sex) errs.push('Sex');
                if (!attrs.quantity || attrs.quantity < 1) errs.push('Quantity (must be at least 1)');
                if (attrs.animalIdDisclosure !== true) errs.push('Animal Identification Disclosure');
                if (attrs.healthDisclosure !== true) errs.push('Health Disclosure');
                if (attrs.transportDisclosure !== true) errs.push('Transport Disclosure');
                return errs;
              }
              if (formData.category === 'cattle_livestock') {
                const attrs = formData.attributes as Partial<CattleAttributes>;
                const errs: string[] = [];
                if (!attrs.breed?.trim()) errs.push('Breed');
                if (!attrs.sex) errs.push('Sex');
                // Registered is modeled as a checkbox; defaulting to false is acceptable, but if it's still unset, flag it.
                if ((attrs as any).registered !== true && (attrs as any).registered !== false) errs.push('Registered');
                if (!attrs.quantity || attrs.quantity < 1) errs.push('Quantity (must be at least 1)');
                if (!attrs.identificationDisclosure) errs.push('Identification Disclosure');
                if (!attrs.healthDisclosure) errs.push('Health Disclosure');
                const hasAge =
                  typeof (attrs as any).age === 'number'
                    ? Number.isFinite((attrs as any).age)
                    : !!String((attrs as any).age || '').trim();
                const hasWeight = !!String(attrs.weightRange || '').trim();
                if (!hasAge && !hasWeight) errs.push('Age or Weight Range');
                return errs;
              }
              if (formData.category === 'horse_equestrian') {
                const attrs: any = formData.attributes as any;
                const errs: string[] = [];
                if (attrs.speciesId !== 'horse') errs.push('Species');
                if (!attrs.sex) errs.push('Sex');
                if (attrs.registered !== true && attrs.registered !== false) errs.push('Registered');
                if (attrs.registered === true && !String(attrs.registrationNumber || '').trim()) errs.push('Registration Number');
                if (!attrs.quantity || attrs.quantity < 1) errs.push('Quantity (must be at least 1)');
                const d = attrs.disclosures || {};
                if (!d.identificationDisclosure) errs.push('Identification Disclosure');
                if (!d.healthDisclosure) errs.push('Health Disclosure');
                if (!d.transportDisclosure) errs.push('Transport Disclosure');
                if (!d.titleOrLienDisclosure) errs.push('Title/Lien Disclosure');
                return errs;
              }
              if (formData.category === 'sporting_working_dogs') {
                const attrs = formData.attributes as Partial<SportingWorkingDogAttributes>;
                const errs: string[] = [];
                if ((attrs as any).speciesId !== 'dog') errs.push('Species');
                if (!attrs.breed?.trim()) errs.push('Breed');
                if (!attrs.sex) errs.push('Sex');
                if (!attrs.quantity || attrs.quantity < 1) errs.push('Quantity (must be at least 1)');
                if (!attrs.identificationDisclosure) errs.push('Identification Disclosure');
                if (!attrs.healthDisclosure) errs.push('Health Disclosure');
                if (!attrs.transportDisclosure) errs.push('Transport Disclosure');
                return errs;
              }
              if (formData.category === 'ranch_equipment' || formData.category === 'ranch_vehicles' || formData.category === 'hunting_outfitter_assets') {
                const attrs = formData.attributes as Partial<EquipmentAttributes>;
                const errs: string[] = [];
                const vehiclesRequiringTitle = ['utv', 'atv', 'trailer', 'truck'];
                const requiresTitle = attrs.equipmentType && vehiclesRequiringTitle.includes(attrs.equipmentType.toLowerCase());
                if (!attrs.equipmentType) errs.push('Equipment Type');
                if (!attrs.condition) errs.push('Condition');
                if (!attrs.quantity || attrs.quantity < 1) errs.push('Quantity (must be at least 1)');
                if (requiresTitle) {
                  if (!attrs.hasTitle) errs.push('Has Title');
                  if (!attrs.vinOrSerial?.trim()) errs.push('VIN or Serial Number');
                }
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

          {/* Seller animal acknowledgment is collected at publish-time (modal) for a cleaner flow. */}
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
          const errors: string[] = [];
          if (!attrs.speciesId) errors.push('Species');
          if (!attrs.sex) errors.push('Sex');
          if (!attrs.quantity || attrs.quantity < 1) errors.push('Quantity (must be at least 1)');
          if (attrs.animalIdDisclosure !== true) errors.push('Animal Identification Disclosure');
          if (attrs.healthDisclosure !== true) errors.push('Health Disclosure');
          if (attrs.transportDisclosure !== true) errors.push('Transport Disclosure');
          if (errors.length) {
            toast({
              title: 'Missing Required Fields',
              description: `Please complete: ${errors.join(', ')}`,
              variant: 'destructive',
            });
            return false;
          }
          return true;
        }
        if (formData.category === 'cattle_livestock') {
          const attrs = formData.attributes as Partial<CattleAttributes>;
          const errors: string[] = [];
          if (!attrs.breed?.trim()) errors.push('Breed');
          if (!attrs.sex) errors.push('Sex');
          if ((attrs as any).registered !== true && (attrs as any).registered !== false) errors.push('Registered');
          if (!attrs.quantity || attrs.quantity < 1) errors.push('Quantity (must be at least 1)');
          if (!attrs.identificationDisclosure) errors.push('Identification Disclosure');
          if (!attrs.healthDisclosure) errors.push('Health Disclosure');
          const hasAge =
            typeof (attrs as any).age === 'number'
              ? Number.isFinite((attrs as any).age)
              : !!String((attrs as any).age || '').trim();
          const hasWeight = !!String(attrs.weightRange || '').trim();
          if (!hasAge && !hasWeight) errors.push('Age or Weight Range');
          if (errors.length) {
            toast({
              title: 'Missing Required Fields',
              description: `Please complete: ${errors.join(', ')}`,
              variant: 'destructive',
            });
            return false;
          }
          return true;
        }
        if (formData.category === 'horse_equestrian') {
          const attrs: any = formData.attributes as any;
          const errors: string[] = [];
          if (attrs.speciesId !== 'horse') errors.push('Species');
          if (!attrs.sex) errors.push('Sex');
          if (attrs.registered !== true && attrs.registered !== false) errors.push('Registered');
          if (attrs.registered === true && !String(attrs.registrationNumber || '').trim()) errors.push('Registration Number');
          if (!attrs.quantity || attrs.quantity < 1) errors.push('Quantity (must be at least 1)');
          const d = attrs.disclosures || {};
          if (!d.identificationDisclosure) errors.push('Identification Disclosure');
          if (!d.healthDisclosure) errors.push('Health Disclosure');
          if (!d.transportDisclosure) errors.push('Transport Disclosure');
          if (!d.titleOrLienDisclosure) errors.push('Title/Lien Disclosure');
          if (errors.length) {
            toast({
              title: 'Missing Required Fields',
              description: `Please complete: ${errors.join(', ')}`,
              variant: 'destructive',
            });
            return false;
          }
          return true;
        }
        if (formData.category === 'sporting_working_dogs') {
          const attrs: any = formData.attributes as any;
          const errors: string[] = [];
          if (attrs.speciesId !== 'dog') errors.push('Species');
          if (!String(attrs.breed || '').trim()) errors.push('Breed');
          if (!attrs.sex) errors.push('Sex');
          if (!attrs.quantity || attrs.quantity < 1) errors.push('Quantity (must be at least 1)');
          if (!attrs.identificationDisclosure) errors.push('Identification Disclosure');
          if (!attrs.healthDisclosure) errors.push('Health Disclosure');
          if (!attrs.transportDisclosure) errors.push('Transport Disclosure');
          if (errors.length) {
            toast({
              title: 'Missing Required Fields',
              description: `Please complete: ${errors.join(', ')}`,
              variant: 'destructive',
            });
            return false;
          }
          return true;
        }
        if (formData.category === 'ranch_equipment') {
          const attrs = formData.attributes as Partial<EquipmentAttributes>;
          const vehiclesRequiringTitle = ['utv', 'atv', 'trailer', 'truck'];
          const requiresTitle = attrs.equipmentType && vehiclesRequiringTitle.includes(attrs.equipmentType.toLowerCase());
          const errors: string[] = [];
          if (!attrs.equipmentType) errors.push('Equipment Type');
          if (!attrs.condition) errors.push('Condition');
          if (!attrs.quantity || attrs.quantity < 1) errors.push('Quantity (must be at least 1)');
          if (requiresTitle) {
            if (!attrs.hasTitle) errors.push('Has Title');
            if (!attrs.vinOrSerial?.trim()) errors.push('VIN or Serial Number');
          }
          if (errors.length) {
            toast({
              title: 'Missing Required Fields',
              description: `Please complete: ${errors.join(', ')}`,
              variant: 'destructive',
            });
            return false;
          }
          return true;
        }
        if (formData.category === 'ranch_vehicles' || formData.category === 'hunting_outfitter_assets') {
          const attrs = formData.attributes as Partial<EquipmentAttributes>;
          const vehiclesRequiringTitle = ['utv', 'atv', 'trailer', 'truck'];
          const requiresTitle = attrs.equipmentType && vehiclesRequiringTitle.includes(String(attrs.equipmentType).toLowerCase());
          const errors: string[] = [];
          if (!attrs.equipmentType) errors.push('Equipment Type');
          if (!attrs.condition) errors.push('Condition');
          if (!attrs.quantity || attrs.quantity < 1) errors.push('Quantity (must be at least 1)');
          if (requiresTitle) {
            if (!attrs.hasTitle) errors.push('Has Title');
            if (!attrs.vinOrSerial?.trim()) errors.push('VIN or Serial Number');
          }
          if (formData.category === 'hunting_outfitter_assets' && attrs.equipmentType === 'camera_system') {
            if (!String(attrs.make || '').trim()) errors.push('Make');
            if (!String(attrs.model || '').trim()) errors.push('Model');
          }
          if (errors.length) {
            toast({
              title: 'Missing Required Fields',
              description: `Please complete: ${errors.join(', ')}`,
              variant: 'destructive',
            });
            return false;
          }
          return true;
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
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="title" className="text-base font-semibold">Title</Label>
              <HelpTooltip
                side="left"
                className="hidden md:inline-flex"
                text="Be specific: species/breed, sex/quantity, and a key selling point. Great titles get more clicks."
              />
            </div>
            <Input
              id="title"
              data-tour="listing-title"
              placeholder="e.g., Registered Texas Longhorn Bull"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className={cn(
                "min-h-[48px] text-base",
                validationAttempted.details &&
                  String(formData.title || '').trim().length === 0 &&
                  'border-destructive ring-2 ring-destructive/20 focus-visible:ring-destructive'
              )}
            />
            {validationAttempted.details && String(formData.title || '').trim().length === 0 ? (
              <div className="text-sm text-destructive">Title is required.</div>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="description" className="text-base font-semibold">Description</Label>
              <HelpTooltip
                side="left"
                className="hidden md:inline-flex"
                text="Include health, genetics/papers, transport details, and anything a buyer needs to decide without messaging."
              />
            </div>
            <Textarea
              id="description"
              placeholder="Provide detailed information about your listing..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={cn(
                "min-h-[120px] text-base",
                validationAttempted.details &&
                  String(formData.description || '').trim().length === 0 &&
                  'border-destructive ring-2 ring-destructive/20 focus-visible:ring-destructive'
              )}
            />
            {validationAttempted.details && String(formData.description || '').trim().length === 0 ? (
              <div className="text-sm text-destructive">Description is required.</div>
            ) : null}
          </div>

          {formData.type === 'fixed' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="price" className="text-base font-semibold">Price</Label>
                <HelpTooltip
                  side="left"
                  className="hidden md:inline-flex"
                  text="This is the Buy Now price buyers will pay at checkout. Be realistic—better detail supports higher prices."
                />
              </div>
              <Input
                id="price"
                type="text"
                inputMode="decimal"
                data-tour="listing-price"
                placeholder="0.00"
                value={formatPriceWithCommas(formData.price)}
                onChange={(e) => {
                  const parsed = parsePriceString(e.target.value);
                  setFormData({ ...formData, price: parsed });
                }}
                className={cn(
                  "min-h-[48px] text-base",
                  validationAttempted.details && !isPositiveMoney(formData.price) && 'border-destructive ring-2 ring-destructive/20 focus-visible:ring-destructive'
                )}
              />
              {validationAttempted.details && !isPositiveMoney(formData.price) ? (
                <div className="text-sm text-destructive">Price is required.</div>
              ) : null}
            </div>
          )}

          {formData.type === 'auction' && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="starting-bid" className="text-base font-semibold">Starting Bid</Label>
                  <HelpTooltip
                    side="left"
                    className="hidden md:inline-flex"
                    text="Your auction starts here. Lower starts can drive bidding, but ensure you’re comfortable with the risk."
                  />
                </div>
                <Input
                  id="starting-bid"
                  type="text"
                  inputMode="decimal"
                  data-tour="listing-price"
                  placeholder="0.00"
                  value={formatPriceWithCommas(formData.startingBid)}
                  onChange={(e) => {
                    const parsed = parsePriceString(e.target.value);
                    setFormData({ ...formData, startingBid: parsed });
                  }}
                  className={cn(
                    "min-h-[48px] text-base",
                    validationAttempted.details &&
                      !isPositiveMoney(formData.startingBid) &&
                      'border-destructive ring-2 ring-destructive/20 focus-visible:ring-destructive'
                  )}
                />
                {validationAttempted.details && !isPositiveMoney(formData.startingBid) ? (
                  <div className="text-sm text-destructive">Starting bid is required.</div>
                ) : null}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="reserve-price" className="text-base font-semibold">
                    Reserve Price (Optional)
                  </Label>
                  <HelpTooltip
                    side="left"
                    className="hidden md:inline-flex"
                    text="Your private minimum. If bids don’t reach it, you’re not forced to sell. Buyers won’t see this."
                  />
                </div>
                <Input
                  id="reserve-price"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={formatPriceWithCommas(formData.reservePrice)}
                  onChange={(e) => {
                    const parsed = parsePriceString(e.target.value);
                    setFormData({ ...formData, reservePrice: parsed });
                  }}
                  className="min-h-[48px] text-base"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum price you'll accept. Won't be shown to bidders.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="listing-duration" className="text-base font-semibold">
                    Listing duration
                  </Label>
                  <HelpTooltip
                    side="left"
                    className="hidden md:inline-flex"
                    text="eBay-style: listings can run up to 10 days. Duration starts when the listing goes live."
                  />
                </div>
                <Select
                  value={String(formData.durationDays)}
                  onValueChange={(v) => {
                    const n = Number(v);
                    if (isValidDurationDays(n)) setFormData({ ...formData, durationDays: n });
                  }}
                >
                  <SelectTrigger id="listing-duration" className="min-h-[48px] text-base">
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
                <p className="text-xs text-muted-foreground">Listings can run up to 10 days. Default is 7.</p>
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
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={formatPriceWithCommas(formData.bestOffer.minPrice)}
                      onChange={(e) => {
                        const parsed = parsePriceString(e.target.value);
                        setFormData({ ...formData, bestOffer: { ...formData.bestOffer, minPrice: parsed } });
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
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={formatPriceWithCommas(formData.bestOffer.autoAcceptPrice)}
                      onChange={(e) => {
                        const parsed = parsePriceString(e.target.value);
                        setFormData({
                          ...formData,
                          bestOffer: { ...formData.bestOffer, autoAcceptPrice: parsed },
                        });
                      }}
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
                      value={formData.bestOffer.offerExpiryHours > 0 ? String(formData.bestOffer.offerExpiryHours) : ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Allow empty string during editing, only convert to number when there's a value
                        const numValue = value === '' ? 0 : Number(value);
                        setFormData({
                          ...formData,
                          bestOffer: { ...formData.bestOffer, offerExpiryHours: numValue },
                        });
                      }}
                      onBlur={(e) => {
                        // When user leaves the field, default to 48 if empty or invalid
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
                className={cn(
                  "min-h-[48px] text-base",
                  validationAttempted.details &&
                    String(formData.location.city || '').trim().length === 0 &&
                    'border-destructive ring-2 ring-destructive/20 focus-visible:ring-destructive'
                )}
              />
              {validationAttempted.details && String(formData.location.city || '').trim().length === 0 ? (
                <div className="text-sm text-destructive">City is required.</div>
              ) : null}
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
                  className={cn(
                    "min-h-[48px] text-base",
                    validationAttempted.details &&
                      String(formData.location.state || '').trim().length === 0 &&
                      'border-destructive ring-2 ring-destructive/20 focus-visible:ring-destructive'
                  )}
                />
              )}
              {validationAttempted.details && String(formData.location.state || '').trim().length === 0 ? (
                <div className="text-sm text-destructive">State is required.</div>
              ) : null}
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
        const titleOk = String(formData.title || '').trim().length > 0;
        const descOk = String(formData.description || '').trim().length > 0;
        const cityOk = String(formData.location.city || '').trim().length > 0;
        const stateOk = String(formData.location.state || '').trim().length > 0;

        const priceOk = formData.type === 'fixed' ? isPositiveMoney(formData.price) : isPositiveMoney(formData.startingBid);

        const durationOk = isValidDurationDays(formData.durationDays);

        // Note: ZIP remains optional.
        return titleOk && descOk && cityOk && stateOk && priceOk && durationOk;
      },
    },
    {
      id: 'media',
      title: 'Photos',
      description: 'Upload + select photos (required)',
      content: (
        <div className="space-y-4">
          {validationAttempted.media && formData.photoIds.length === 0 ? (
            <Alert className="bg-destructive/10 border-destructive/20">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-destructive">
                Please add at least one photo to continue.
              </AlertDescription>
            </Alert>
          ) : null}
          {user ? (
            <div
              className={cn(
                validationAttempted.media && formData.photoIds.length === 0 && 'rounded-xl ring-2 ring-destructive/30'
              )}
            >
              <ListingPhotoPicker
                uid={user.uid}
                selected={formData.photos}
                coverPhotoId={formData.coverPhotoId}
                max={8}
                onChange={({ selected, coverPhotoId }) => {
                  const normalized = selected.map((p, i) => ({ ...p, sortOrder: i }));
                  setFormData((prev) => ({
                    ...prev,
                    photos: normalized,
                    photoIds: normalized.map((p) => p.photoId),
                    coverPhotoId,
                    images: normalized.map((p) => p.url),
                  }));
                }}
              />
            </div>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                <div className="font-semibold">Sign in to add photos</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Create an account to upload and reuse photos across listings.
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      ),
      validate: () => formData.photoIds.length > 0,
      errorMessage: 'Please select at least one photo',
    },
    {
      id: 'verification',
      title: 'Verification & Transportation',
      description: 'Optional: Add verification and set transportation',
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

          {/* Transportation Section */}
          <Card className="p-4 border-2">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-base mb-1">Transportation</h3>
                <p className="text-sm text-muted-foreground">
                  Select who will handle transportation. Buyer and seller coordinate directly; Wildlife Exchange does not arrange transport.
                </p>
              </div>
              <RadioGroup
                value={formData.transportType || ''}
                onValueChange={(value) =>
                  setFormData({ ...formData, transportType: value === 'seller' || value === 'buyer' ? value : null })
                }
                className="space-y-3"
              >
                <div className="flex items-start space-x-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                  <RadioGroupItem value="seller" id="transport-seller" className="mt-1" />
                  <Label htmlFor="transport-seller" className="cursor-pointer flex-1">
                    <div className="font-medium mb-1">Seller Transport</div>
                    <div className="text-sm text-muted-foreground">
                      You (the seller) will deliver. Buyer and seller coordinate delivery details directly.
                    </div>
                  </Label>
                </div>
                <div className="flex items-start space-x-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                  <RadioGroupItem value="buyer" id="transport-buyer" className="mt-1" />
                  <Label htmlFor="transport-buyer" className="cursor-pointer flex-1">
                    <div className="font-medium mb-1">Buyer Transport</div>
                    <div className="text-sm text-muted-foreground">
                      Buyer must handle transportation. Buyer arranges pickup/delivery.
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </Card>
        </div>
      ),
      validate: () => true, // Verification and transportation options are optional
    },
    {
      id: 'review',
      title: 'Review & Publish',
      description: 'Review your listing before publishing',
      content: (
        <div className="space-y-6">
          {/* Payout gating is already surfaced earlier in the flow; keep review step clean. */}

          <Alert className="bg-muted/40 border-border/60">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This is a <strong>preview</strong> of what buyers will see. If anything looks off, hit <strong>Back</strong> and edit it before publishing.
            </AlertDescription>
          </Alert>

          {/* Listing Preview (photos + primary info) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <ImageGallery images={formData.images} title={formData.title || 'Listing'} focalPointsByUrl={focalPointsByUrl} />
              <div className="text-xs text-muted-foreground">
                {formData.images.length} photo{formData.images.length === 1 ? '' : 's'} will appear on the listing.
              </div>
            </div>

            <Card className="border-2 border-border/50">
              <CardContent className="p-5 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-2xl font-bold leading-tight">
                        {formData.title || 'Untitled listing'}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {formData.type && (
                          <Badge variant="secondary" className="capitalize">
                            {formData.type}
                          </Badge>
                        )}
                        {formData.category && (
                          <Badge variant="outline" className="capitalize">
                            {String(formData.category).replaceAll('_', ' ')}
                          </Badge>
                        )}
                        {formData.verification && <Badge>Verification</Badge>}
                        {formData.transportType === 'seller' && <Badge variant="outline">Seller Transport</Badge>}
                        {formData.transportType === 'buyer' && <Badge variant="outline">Buyer Transport</Badge>}
                        {formData.protectedTransactionEnabled && (
                          <Badge variant="outline">
                            Protected ({formData.protectedTransactionDays ?? '—'} days)
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {formData.location.city ? `${formData.location.city}, ` : ''}
                    {formData.location.state || '—'}
                    {formData.location.zip ? ` • ${formData.location.zip}` : ''}
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="text-sm text-muted-foreground">Pricing</div>
                  {formData.type === 'auction' ? (
                    <div className="space-y-1">
                      <div className="text-lg font-bold">
                        Starting bid: ${Number(parseFloat(formData.startingBid || '0') || 0).toLocaleString()}
                      </div>
                      {formData.reservePrice ? (
                        <div className="text-sm">
                          Reserve price: <span className="font-semibold">${Number(parseFloat(formData.reservePrice) || 0).toLocaleString()}</span>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">Reserve price: none</div>
                      )}
                      <div className="text-sm">
                        Duration: <span className="font-semibold">{formData.durationDays} day{formData.durationDays === 1 ? '' : 's'}</span>
                        <span className="text-muted-foreground"> (starts when live)</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="text-lg font-bold">
                        ${Number(parseFloat(formData.price || '0') || 0).toLocaleString()}
                      </div>
                      {formData.type === 'fixed' && (
                        <div className="text-sm">
                          Best Offer:{' '}
                          <span className="font-semibold">{formData.bestOffer.enabled ? 'Enabled' : 'Off'}</span>
                          {formData.bestOffer.enabled && (
                            <span className="text-muted-foreground">
                              {' '}
                              • min {formData.bestOffer.minPrice ? `$${Number(parseFloat(formData.bestOffer.minPrice) || 0).toLocaleString()}` : '—'}
                              {' '}
                              • auto-accept {formData.bestOffer.autoAcceptPrice ? `$${Number(parseFloat(formData.bestOffer.autoAcceptPrice) || 0).toLocaleString()}` : '—'}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {formData.category === 'whitetail_breeder' && (
                  <>
                    <Separator />
                    <div className="space-y-1 text-sm">
                      <div className="text-sm text-muted-foreground">Whitetail breeder attestation</div>
                      <div className="font-semibold">
                        {sellerAttestationAccepted ? 'Accepted' : 'Not accepted'}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Description */}
          <Card className="border-2 border-border/50">
            <CardContent className="p-5 space-y-2">
              <div className="text-sm font-semibold">Description</div>
              <div className="text-sm whitespace-pre-line text-muted-foreground">
                {formData.description || '—'}
              </div>
            </CardContent>
          </Card>

          {/* Key Facts (matches the style used on the public listing page) */}
          <KeyFactsPanel
            listing={{
              id: listingId || 'preview',
              title: formData.title || 'Listing',
              description: formData.description || '',
              type: (formData.type || 'fixed') as any,
              category: (formData.category || 'wildlife_exotics') as any,
              status: 'draft' as any,
              price: formData.type !== 'auction' ? Number(parseFloat(parsePriceString(formData.price || '0') || '0') || 0) : undefined,
              startingBid: formData.type === 'auction' ? Number(parseFloat(parsePriceString(formData.startingBid || '0') || '0') || 0) : undefined,
              reservePrice: formData.type === 'auction' && formData.reservePrice ? Number(parseFloat(parsePriceString(formData.reservePrice) || '0') || 0) : undefined,
              images: formData.images || [],
              location: formData.location,
              sellerId: user?.uid || 'preview',
              trust: {
                verified: !!formData.verification,
                insuranceAvailable: false,
                transportReady: formData.transportType !== null,
                sellerOffersDelivery: formData.transportType === 'seller',
              },
              attributes: (formData.attributes || {}) as any,
              durationDays: formData.durationDays,
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: user?.uid || 'preview',
              updatedBy: user?.uid || 'preview',
              metrics: { views: 0, favorites: 0, bidCount: 0 },
            } as any}
          />

          {/* Full “everything we will save” snapshot (so nothing is hidden on review) */}
          <Card className="border-2 border-border/50">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-semibold">All listing details (review)</div>
                  <div className="text-xs text-muted-foreground">
                    This section shows every field that will be saved/published.
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border bg-muted/30 p-3">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Basics</div>
                  <div className="mt-2 space-y-1">
                    <div><span className="text-muted-foreground">Type:</span> <span className="font-medium capitalize">{formData.type || '—'}</span></div>
                    <div><span className="text-muted-foreground">Category:</span> <span className="font-medium capitalize">{String(formData.category || '—').replaceAll('_', ' ')}</span></div>
                    <div><span className="text-muted-foreground">Title:</span> <span className="font-medium">{formData.title || '—'}</span></div>
                    <div><span className="text-muted-foreground">Location:</span> <span className="font-medium">{formData.location.city || '—'}, {formData.location.state || '—'} {formData.location.zip ? `(${formData.location.zip})` : ''}</span></div>
                  </div>
                </div>

                <div className="rounded-md border bg-muted/30 p-3">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Options</div>
                  <div className="mt-2 space-y-1">
                    <div><span className="text-muted-foreground">Verification:</span> <span className="font-medium">{formData.verification ? 'Yes' : 'No'}</span></div>
                    <div><span className="text-muted-foreground">Transportation:</span> <span className="font-medium">
                      {formData.transportType === 'seller' ? 'Seller Transport' : formData.transportType === 'buyer' ? 'Buyer Transport' : 'Not specified'}
                    </span></div>
                    <div><span className="text-muted-foreground">Protected transaction:</span> <span className="font-medium">{formData.protectedTransactionEnabled ? `Yes (${formData.protectedTransactionDays ?? '—'} days)` : 'No'}</span></div>
                    {formData.type === 'fixed' && (
                      <div><span className="text-muted-foreground">Best Offer:</span> <span className="font-medium">{formData.bestOffer.enabled ? 'Enabled' : 'Off'}</span></div>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-md border bg-background p-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Specifications (all fields)</div>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  {Object.entries(formData.attributes || {})
                    .filter(([, v]) => v !== undefined && v !== null && String(v).trim?.() !== '')
                    .map(([k, v]) => {
                      const label = k
                        .replaceAll('_', ' ')
                        .replace(/([a-z])([A-Z])/g, '$1 $2')
                        .replace(/\s+/g, ' ')
                        .trim();
                      const isObject = typeof v === 'object';
                      return (
                        <div key={k} className="rounded-md border bg-muted/30 p-2">
                          <div className="text-xs font-semibold text-muted-foreground">{label}</div>
                          <div className="mt-1 font-medium break-words">
                            {isObject ? (
                              <pre className="text-xs whitespace-pre-wrap leading-relaxed">{JSON.stringify(v, null, 2)}</pre>
                            ) : (
                              String(v)
                            )}
                          </div>
                        </div>
                      );
                    })}
                  {Object.keys(formData.attributes || {}).length === 0 && (
                    <div className="text-sm text-muted-foreground">—</div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ),
      validate: () => true, // Review step always valid
    },
  ];

  const handleComplete = async (data: Record<string, unknown>) => {
    // Hard guard: prevents double click / double submit creating duplicate drafts.
    if (submittingRef.current) return;
    submittingRef.current = true;
    // Check if user is authenticated - if not, save form data and show auth prompt modal
    if (!user) {
      // Save form data to sessionStorage so we can restore it after authentication
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('listingFormData', JSON.stringify(formData));
      }
      setShowAuthModal(true);
      submittingRef.current = false;
      return;
    }

    const requiresSellerAnimalAck =
      formData.category &&
      isAnimalCategory(formData.category as any) &&
      formData.category !== 'whitetail_breeder';
    const sellerAnimalAckAcceptedNow =
      sellerAnimalAttestationAccepted === true || sellerAnimalAckForceRef.current === true;

    // Whitetail-only hard gate (required even for draft creation)
    if (formData.category === 'whitetail_breeder' && !sellerAttestationAccepted) {
      toast({
        title: 'Seller attestation required',
        description: 'Please accept the seller attestation before saving or publishing a whitetail breeder listing.',
        variant: 'destructive',
      });
      submittingRef.current = false;
      return;
    }

    // Seller acknowledgment is requested at publish-time (modal), not as a step.
    if (requiresSellerAnimalAck && !sellerAnimalAckAcceptedNow) {
      // Only show modal if we don't already have a pending payload (prevents double-opening)
      if (!pendingPublishPayloadRef.current) {
        pendingPublishPayloadRef.current = data;
        setSellerAnimalAckModalChecked(false);
        setSellerAnimalAckModalOpen(true);
      }
      submittingRef.current = false;
      return;
    }
    
    // Clear pending payload if acknowledgment is accepted
    if (requiresSellerAnimalAck && sellerAnimalAckAcceptedNow) {
      pendingPublishPayloadRef.current = null;
    }

    // Validate photos
    if (formData.photoIds.length === 0) {
      toast({
        title: 'Images required',
        description: 'Please upload at least one photo before publishing.',
        variant: 'destructive',
      });
      submittingRef.current = false;
      return;
    }

    if (!formData.category) {
      toast({
        title: 'Select a category',
        description: 'Please choose a category before publishing a listing.',
        variant: 'destructive',
      });
      submittingRef.current = false;
      return;
    }

    if (formData.photoIds.length > 8) {
      toast({
        title: 'Too many images',
        description: 'You can upload a maximum of 8 photos per listing.',
        variant: 'destructive',
      });
      submittingRef.current = false;
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

      const normalizedAttributes: any = { ...(formData.attributes as any) };
      if (formData.category === 'horse_equestrian') normalizedAttributes.speciesId = 'horse';
      if (formData.category === 'sporting_working_dogs') normalizedAttributes.speciesId = 'dog';

      const listingData = {
        title: formData.title,
        description: formData.description,
        // Classified listings are deprecated; treat any legacy value as fixed.
        type: (formData.type === 'classified' ? 'fixed' : (formData.type as any)) as 'auction' | 'fixed',
        category: formData.category as ListingCategory,
        durationDays: formData.durationDays,
        location: locationData,
        // Back-compat: `images` is derived from the cached snapshot.
        images: formData.images,
        // Phase 1 (Uploads library): reference user photos.
        photoIds: formData.photoIds,
        photos: formData.photos.map((p, i) => ({ ...p, sortOrder: i })),
        coverPhotoId: formData.coverPhotoId || formData.photos[0]?.photoId,
        trust: {
          verified: formData.verification,
          insuranceAvailable: false,
          transportReady: formData.transportType !== null,
          sellerOffersDelivery: formData.transportType === 'seller',
        },
        protectedTransactionEnabled: formData.protectedTransactionEnabled,
        protectedTransactionDays: formData.protectedTransactionDays,
        ...(formData.protectedTransactionEnabled && { protectedTermsVersion: 'v1' }),
        attributes: normalizedAttributes as ListingAttributes,
        // Whitetail-only seller attestation
        ...(formData.category === 'whitetail_breeder' && {
          sellerAttestationAccepted: sellerAttestationAccepted === true,
          sellerAttestationAcceptedAt: sellerAttestationAccepted ? new Date() : undefined,
        }),
        ...(formData.category &&
          isAnimalCategory(formData.category as any) &&
          formData.category !== 'whitetail_breeder' && {
            sellerAnimalAttestationAccepted: sellerAnimalAckAcceptedNow === true,
            sellerAnimalAttestationAcceptedAt: sellerAnimalAckAcceptedNow ? new Date() : undefined,
          }),
      } as any;

      // Add pricing based on type
      if (formData.type === 'fixed') {
        listingData.price = parseFloat(parsePriceString(formData.price || '0') || '0');
        if (formData.bestOffer.enabled) {
          const bo: any = {
            enabled: true,
            allowCounter: formData.bestOffer.allowCounter !== false,
            offerExpiryHours: formData.bestOffer.offerExpiryHours || 48,
          };
          if (formData.bestOffer.minPrice) bo.minPrice = parseFloat(parsePriceString(formData.bestOffer.minPrice));
          if (formData.bestOffer.autoAcceptPrice) bo.autoAcceptPrice = parseFloat(parsePriceString(formData.bestOffer.autoAcceptPrice));
          listingData.bestOfferSettings = bo;
        } else {
          listingData.bestOfferSettings = { enabled: false, allowCounter: true, offerExpiryHours: 48 };
        }
      } else if (formData.type === 'auction') {
        listingData.startingBid = parseFloat(parsePriceString(formData.startingBid || '0') || '0');
        if (formData.reservePrice) {
          listingData.reservePrice = parseFloat(parsePriceString(formData.reservePrice));
        }
      }

      // Use existing draft listing ID if available, otherwise create new
      let finalListingId = listingId;
      if (finalListingId) {
        // Guard: autosave may have restored a listingId that was already published.
        // In "new listing" flow, we must NOT update an active listing.
        try {
          const snap = await getDoc(doc(db, 'listings', finalListingId));
          const status = snap.exists() ? String((snap.data() as any)?.status || '') : '';
          if (status && status !== 'draft' && status !== 'pending') {
            // Treat as stale; create a new draft instead.
            finalListingId = null;
          }
        } catch {
          // If we can't verify, fail safe by creating a new draft.
          finalListingId = null;
        }
      }

      if (!finalListingId) {
        finalListingId = await createListingDraft(user.uid, listingData);
      } else {
        // Update existing draft with final data
        const { updateListing } = await import('@/lib/firebase/listings');
        await updateListing(user.uid, finalListingId, listingData);
      }

      // Critical: persist the draft ID immediately.
      // If publish is blocked (e.g. payouts not ready), the user may click "Save draft" from the dialog.
      // Without setting this, we’d create a SECOND draft listing (duplicate).
      setListingId(finalListingId);

      // Publish immediately (user clicked "Publish" in the form)
      const publishResult = await publishListing(user.uid, finalListingId);

      if (publishResult?.pendingReview) {
        // Stop the spinner overlay before showing the submitted modal (clean transition).
        setIsSubmitting(false);
        setSubmittedListingId(finalListingId);
        setShowPendingApprovalModal(true);
        toast({
          title: 'Submitted for approval',
          description: 'Your listing is in the review queue.',
        });
        // Clear local autosave so a newly-submitted listing isn't restored as a "new listing" later.
        clearAutosave();
      } else {
        toast({
          title: 'Listing created successfully!',
          description: 'Your listing has been published and is now live.',
        });
        // Clear local autosave so a published listing isn't restored as a "new listing" later.
        clearAutosave();
        // Redirect to seller listings dashboard so they can see their new listing
        router.push('/seller/listings');
      }
    } catch (error: any) {
      console.error('Error creating listing:', error);

      if (error?.code === 'SELLER_ANIMAL_ACK_REQUIRED') {
        pendingPublishPayloadRef.current = data;
        setSellerAnimalAckModalChecked(false);
        setSellerAnimalAckModalOpen(true);
        toast({
          title: 'Seller acknowledgment required',
          description: 'Please accept the seller acknowledgment to publish this animal listing.',
          variant: 'destructive',
        });
        return;
      }

      // UX: If the server blocks publish because payouts aren't ready, show a friendly action dialog.
      if (error?.code === 'PAYOUTS_NOT_READY' || String(error?.message || '').toLowerCase().includes('connect stripe payouts')) {
        setPayoutsGateOpen(true);
        toast({
          title: 'Connect payouts to publish',
          description: 'You can still save this as a draft right now.',
        });
        return;
      }

      toast({
        title: 'Error creating listing',
        description: error.message || 'An error occurred while creating your listing. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
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

  const clearAutosave = () => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(autosaveKey(user?.uid || null));
      window.localStorage.removeItem(autosaveKey(null));
      // Also clear the auth-restore buffer if it exists.
      sessionStorage.removeItem('listingFormData');
    } catch {
      // ignore
    }
  };

  const handleSaveDraft = async (): Promise<boolean> => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'You must be signed in to save a draft.',
        variant: 'destructive',
      });
      return false;
    }

    // Whitetail-only hard gate (required even for draft creation)
    if (formData.category === 'whitetail_breeder' && !sellerAttestationAccepted) {
      toast({
        title: 'Seller attestation required',
        description: 'Please accept the seller attestation before saving a whitetail breeder listing draft.',
        variant: 'destructive',
      });
      return false;
    }

    try {
      // Draft-first UX: allow starting a draft even before category/type selection.
      // This avoids Firestore rules rejects caused by invalid placeholder categories.
      if (!formData.category) {
        const draftId = listingId || (await createEmptyListingDraft(user.uid));
        setListingId(draftId);
        toast({
          title: 'Draft saved',
          description: 'Draft started. Choose a category to continue building your listing.',
        });
        return true;
      }

      const locationData: any = {
        city: formData.location.city,
        state: formData.location.state,
      };
      if (formData.location.zip && formData.location.zip.trim()) {
        locationData.zip = formData.location.zip.trim();
      }

      const normalizedAttributes: any = { ...(formData.attributes as any) };
      if (formData.category === 'horse_equestrian') normalizedAttributes.speciesId = 'horse';
      if (formData.category === 'sporting_working_dogs') normalizedAttributes.speciesId = 'dog';

      const listingData = {
        title: formData.title || 'Draft Listing',
        description: formData.description || '',
        // Classified listings are deprecated; treat any legacy value as fixed.
        type: ((formData.type === 'classified' ? 'fixed' : formData.type) || 'fixed') as 'auction' | 'fixed',
        category: formData.category as ListingCategory,
        durationDays: formData.durationDays,
        location: locationData,
        images: formData.images,
        trust: {
          verified: formData.verification,
          insuranceAvailable: false,
          transportReady: formData.transportType !== null,
          sellerOffersDelivery: formData.transportType === 'seller',
        },
        protectedTransactionEnabled: formData.protectedTransactionEnabled,
        protectedTransactionDays: formData.protectedTransactionDays,
        ...(formData.protectedTransactionEnabled && { protectedTermsVersion: 'v1' }),
        attributes: normalizedAttributes as ListingAttributes,
        // Whitetail-only seller attestation (draft creation requires it)
        ...(formData.category === 'whitetail_breeder' && {
          sellerAttestationAccepted: true,
          sellerAttestationAcceptedAt: new Date(),
        }),
        ...(formData.category &&
          isAnimalCategory(formData.category as any) &&
          formData.category !== 'whitetail_breeder' &&
          sellerAnimalAttestationAccepted && {
            sellerAnimalAttestationAccepted: true,
            sellerAnimalAttestationAcceptedAt: new Date(),
          }),
      } as any;

      if (formData.type === 'fixed') {
        listingData.price = parseFloat(parsePriceString(formData.price || '0') || '0');
      } else if (formData.type === 'auction') {
        listingData.startingBid = parseFloat(parsePriceString(formData.startingBid || '0') || '0');
        if (formData.reservePrice) {
          listingData.reservePrice = parseFloat(parsePriceString(formData.reservePrice));
        }
      }

      let draftId = listingId;
      if (draftId) {
        // Guard: don't "save draft" onto an already-active listing restored from autosave.
        try {
          const snap = await getDoc(doc(db, 'listings', draftId));
          const status = snap.exists() ? String((snap.data() as any)?.status || '') : '';
          if (status && status !== 'draft' && status !== 'pending') {
            draftId = null;
          }
        } catch {
          draftId = null;
        }
      }

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
      return true;
    } catch (error: any) {
      console.error('Error saving draft:', error);
      toast({
        title: 'Failed to save draft',
        description: error.message || 'An error occurred while saving your draft.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const hasFormData = hasAnyProgress;

  return (
    <div className="min-h-screen bg-background pb-bottom-nav-safe md:pb-6">
      {/* Resume draft prompt (prevents "new listing" from being prefilled unexpectedly) */}
      <Dialog
        open={resumeDraftOpen}
        onOpenChange={(open) => {
          setResumeDraftOpen(open);
          if (!open) {
            // If user dismisses, default to start fresh for safety.
            clearAutosave();
            setResumeDraftPayload(null);
            restoredOnceRef.current = true;
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Resume your last draft?</DialogTitle>
            <DialogDescription>
              We found an autosaved draft. You can resume it, or start a fresh listing.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Category</span>
              <span className="font-medium">
                {String(resumeDraftPayload?.formData?.category || '—').replaceAll('_', ' ')}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium">{String(resumeDraftPayload?.formData?.type || '—')}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Title</span>
              <span className="font-medium text-right truncate max-w-[260px]">
                {String(resumeDraftPayload?.formData?.title || 'Draft Listing')}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Location</span>
              <span className="font-medium text-right truncate max-w-[260px]">
                {String(resumeDraftPayload?.formData?.location?.city || '—')},{' '}
                {String(resumeDraftPayload?.formData?.location?.state || '—')}
              </span>
            </div>
            {resumeDraftPayload?.savedAtMs ? (
              <div className="text-xs text-muted-foreground pt-1">
                Last saved: {new Date(resumeDraftPayload.savedAtMs).toLocaleString()}
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                clearAutosave();
                setResumeDraftPayload(null);
                setResumeDraftOpen(false);
                restoredOnceRef.current = true;
              }}
            >
              Start fresh
            </Button>
            <Button
              type="button"
              onClick={async () => {
                const p = resumeDraftPayload;
                if (p?.formData) {
                  // Back-compat: classified listings are deprecated; coerce old drafts to fixed.
                  const t = (p.formData as any)?.type;
                  const next = { ...p.formData, ...(t === 'classified' ? { type: 'fixed' } : {}) };
                  setFormData(next);
                }
                if (typeof p?.sellerAttestationAccepted === 'boolean') setSellerAttestationAccepted(p.sellerAttestationAccepted);
                if (typeof p?.sellerAnimalAttestationAccepted === 'boolean') setSellerAnimalAttestationAccepted(p.sellerAnimalAttestationAccepted);
                if (typeof p?.listingId === 'string' && p.listingId.trim()) {
                  const id = p.listingId.trim();
                  // If the saved listingId is already active, don't try to publish it again from the "new listing" flow.
                  try {
                    const snap = await getDoc(doc(db, 'listings', id));
                    const status = snap.exists() ? String((snap.data() as any)?.status || '') : '';
                    if (status === 'active') {
                      toast({
                        title: 'That listing is already live',
                        description: 'Opening it in your listings so you can edit if needed.',
                      });
                      clearAutosave();
                      setResumeDraftOpen(false);
                      restoredOnceRef.current = true;
                      router.push(`/seller/listings/${id}/edit`);
                      return;
                    }
                  } catch {
                    // ignore and fall through
                  }
                  setListingId(id);
                }
                if (typeof p?.savedAtMs === 'number') setAutoSaveState({ status: 'saved', lastSavedAtMs: p.savedAtMs });
                setResumeDraftOpen(false);
                restoredOnceRef.current = true;
              }}
            >
              Resume draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payouts Gate Dialog (publish blocker, not draft blocker) */}
      <Dialog open={payoutsGateOpen} onOpenChange={setPayoutsGateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Connect payouts to publish</DialogTitle>
            <DialogDescription>
              You can create drafts anytime. To <strong>publish</strong> a listing (go live), you must connect Stripe payouts so buyers can pay and you can get paid.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <PayoutReadinessCard userProfile={userProfile} onRefresh={refreshUserProfile} />

            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
              <div className="font-semibold text-foreground">Founder-friendly guidance</div>
              <div className="mt-1">
                Best practice is: <strong>let sellers draft listings first</strong>, but make payout setup obvious early and required only at publish.
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                await handleSaveDraft();
                setPayoutsGateOpen(false);
              }}
            >
              Save draft
            </Button>
            <Button type="button" variant="outline" onClick={() => setPayoutsGateOpen(false)}>
              Continue editing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Seller acknowledgment (publish-time) for animal listings (non-whitetail) */}
      <Dialog
        open={sellerAnimalAckModalOpen}
        onOpenChange={(open) => {
          setSellerAnimalAckModalOpen(open);
          if (!open && !sellerAnimalAckForceRef.current) {
            // Only reset checkbox if modal is closed without accepting (e.g., Cancel or outside click)
            // Don't reset if we're closing because user accepted (sellerAnimalAckForceRef will be true)
            setSellerAnimalAckModalChecked(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Seller acknowledgment</DialogTitle>
            <DialogDescription>
              You must accept this acknowledgment to publish an animal listing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="seller-animal-ack-modal"
                  checked={Boolean(sellerAnimalAckModalChecked)}
                  onCheckedChange={(checked) => setSellerAnimalAckModalChecked(Boolean(checked))}
                />
                <Label htmlFor="seller-animal-ack-modal" className="cursor-pointer leading-relaxed">
                  I acknowledge I am solely responsible for all representations, permits/records, and legal compliance for this animal listing, and that
                  Wildlife Exchange does not take custody of animals.
                </Label>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              After you publish, your listing will be submitted for review and approval.
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSellerAnimalAckModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!Boolean(sellerAnimalAckModalChecked)}
              onClick={async () => {
                // Set ref first to prevent onOpenChange from resetting checkbox
                sellerAnimalAckForceRef.current = true;
                setSellerAnimalAttestationAccepted(true);
                const payload = pendingPublishPayloadRef.current;
                // Close modal - onOpenChange won't reset checkbox because ref is true
                setSellerAnimalAckModalOpen(false);
                // Clear pending payload to prevent re-triggering
                pendingPublishPayloadRef.current = null;
                // Re-run publish using the original submit payload (so we don't lose stepper state)
                if (payload) {
                  // Use setTimeout to ensure state updates have propagated
                  setTimeout(() => {
                    void handleComplete(payload);
                  }, 0);
                }
              }}
            >
              I agree &amp; continue to publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showPendingApprovalModal}
        onOpenChange={(open) => {
          setShowPendingApprovalModal(open);
          if (!open) {
            router.push('/seller/listings');
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Listing submitted for approval</DialogTitle>
            <DialogDescription>
              Your listing is pending compliance review. Most approvals complete in <strong>30–60 minutes</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div>
              <span className="font-semibold text-foreground">What happens next:</span> our team verifies required documents and
              confirms the listing meets category rules. You’ll be notified when it’s approved.
            </div>
            <div>
              <span className="font-semibold text-foreground">You can:</span> keep browsing, or head to your seller listings to track status.
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {submittedListingId && (
              <Button
                variant="outline"
                onClick={() => router.push(`/seller/listings/${submittedListingId}/edit`)}
              >
                Edit listing
              </Button>
            )}
            <Button onClick={() => router.push('/seller/listings')}>Go to seller listings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              {hasFormData && (
                <div className="hidden sm:block text-xs text-muted-foreground mr-2">
                  {autoSaveState.status === 'saving'
                    ? 'Saving…'
                    : autoSaveState.status === 'error'
                    ? 'Autosave issue (saved locally)'
                    : autoSaveState.lastSavedAtMs
                    ? `Saved`
                    : 'Autosave on'}
                </div>
              )}
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
      <div className="container mx-auto px-4 py-4 sm:py-6 md:py-8 max-w-4xl">
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
        
        <div className="bg-card rounded-lg border border-border/50 shadow-sm p-4 sm:p-6 md:p-8">
          {/* Publish loading overlay: show a centered spinner so users don't double-click Publish */}
          {isSubmitting ? (
            <div className="fixed inset-0 z-[100] bg-background/60 backdrop-blur-sm flex items-center justify-center">
              <div className="rounded-xl border border-border/60 bg-card shadow-lg px-6 py-5 flex flex-col items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <div className="text-sm font-semibold">Publishing…</div>
                <div className="text-xs text-muted-foreground text-center max-w-[320px]">
                  Please don’t close this window.
                </div>
              </div>
            </div>
          ) : null}

          {/* Better placement: keep the payout callout inside the form container so it feels native to the flow. */}
          {!authLoading && user && !payoutsReady ? (
            <div className="mb-6">
              <PayoutsNotReadyCallout
                onConnect={() => setPayoutsGateOpen(true)}
                onChecklist={() => router.push('/seller/overview')}
              />
            </div>
          ) : null}
          <StepperForm 
            steps={steps} 
            onComplete={handleComplete}
            saving={isSubmitting}
            showSavingBar={false}
            suppressValidationToast={true}
            completeButtonDataTour="listing-publish"
            activeStepId={tourRequestedStep}
            onValidationError={(stepId) => {
              setValidationAttempted((prev) => ({ ...prev, [stepId]: true }));
            }}
            onStepChange={(stepId) => {
              // Clear tour request after step changes
              if (tourRequestedStep === stepId) {
                setTourRequestedStep(null);
              }
            }}
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
                onClick={async () => {
                  const ok = await handleSaveDraft();
                  if (!ok) return;
                  setShowExitDialog(false);
                  setTimeout(() => router.back(), 250);
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
                // User explicitly chose to leave without saving: clear local autosave immediately
                // and suppress any in-flight autosave timers from re-writing it during navigation.
                exitingWithoutSavingRef.current = true;
                if (localSaveTimerRef.current) clearTimeout(localSaveTimerRef.current);
                if (serverSaveTimerRef.current) clearTimeout(serverSaveTimerRef.current);
                clearAutosave();
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

function PayoutsNotReadyCallout(props: {
  compact?: boolean;
  onConnect: () => void;
  onChecklist: () => void;
}) {
  const { compact, onConnect, onChecklist } = props;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('ui:payouts-not-ready-callout:v1');
      if (raw === 'dismissed') setDismissed(true);
    } catch {
      // ignore
    }
  }, []);

  if (dismissed) return null;

  return (
    <Alert className="border-primary/20 bg-primary/10">
      <AlertCircle className="h-4 w-4 text-primary" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <AlertTitle className="text-sm font-semibold text-foreground">
            Connect payouts to publish
          </AlertTitle>
          <AlertDescription className="text-muted-foreground">
            You can create drafts anytime. To publish (go live) and get paid, connect Stripe payouts.
          </AlertDescription>

          <div className={compact ? 'mt-3 flex flex-wrap gap-2' : 'mt-4 flex flex-wrap gap-2'}>
            <Button type="button" className="min-h-[44px]" onClick={onConnect}>
              Connect payouts
            </Button>
            <Button type="button" variant="secondary" className="min-h-[44px]" onClick={onChecklist}>
              Seller checklist
            </Button>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="h-9 w-9 p-0 text-muted-foreground"
          aria-label="Dismiss"
          onClick={() => {
            setDismissed(true);
            try {
              window.localStorage.setItem('ui:payouts-not-ready-callout:v1', 'dismissed');
            } catch {
              // ignore
            }
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </Alert>
  );
}
