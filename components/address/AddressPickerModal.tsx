'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, MapPin, Plus, Check } from 'lucide-react';
import { getAddresses, saveAddress, setCheckoutDeliveryAddress, getCheckoutDeliveryAddress } from '@/lib/firebase/addresses';
import { getUserProfile } from '@/lib/firebase/users';
import type { SavedAddress } from '@/lib/types';
import { AddressSearch } from './AddressSearch';
import { AddressMapConfirm } from './AddressMapConfirm';
import type { ParsedGoogleAddress } from '@/lib/address/parseGooglePlace';
import { cn } from '@/lib/utils';

export interface SetDeliveryAddressPayload {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  deliveryInstructions?: string;
  lat?: number;
  lng?: number;
  pinLabel?: string;
}

const initialManualForm = {
  line1: '',
  line2: '',
  city: '',
  state: '',
  zip: '',
  deliveryInstructions: '',
  lat: undefined as number | undefined,
  lng: undefined as number | undefined,
  pinLabel: '',
};

export interface AddressPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  /** When set, also set delivery address on this order (e.g. order page after payment). */
  orderId?: string;
  /** When orderId is set, called with the selected/saved address payload to persist on the order. */
  onSetDeliveryAddress?: (orderId: string, payload: SetDeliveryAddressPayload) => Promise<void>;
  /** When order has an existing delivery address, used to pre-select the matching saved address (avoids checkout/order mismatch). */
  existingDeliveryAddress?: SetDeliveryAddressPayload | null;
  onSuccess?: () => void;
  /** When true, skip Google Places + map; show saved addresses + manual form only (same modal look). */
  manualOnly?: boolean;
  /** When set (e.g. from listing page before checkout), stored in checkout/current so webhook only applies address to this listing. */
  listingId?: string;
}

function savedToPayload(a: SavedAddress): SetDeliveryAddressPayload {
  return {
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    state: a.state,
    zip: a.postalCode,
    deliveryInstructions: a.notes,
    lat: a.lat,
    lng: a.lng,
    pinLabel: a.label !== 'Address' ? a.label : undefined,
  };
}

/** Returns true if a saved address matches the existing delivery payload (for pre-selection). */
function addressMatchesPayload(addr: SavedAddress, payload: SetDeliveryAddressPayload): boolean {
  const n = (s: string) => (s ?? '').trim().toLowerCase();
  return (
    n(addr.line1) === n(payload.line1) &&
    n(addr.city) === n(payload.city) &&
    n(addr.state) === n(payload.state) &&
    n(addr.postalCode) === n(payload.zip)
  );
}

export function AddressPickerModal({
  open,
  onOpenChange,
  orderId,
  userId,
  onSetDeliveryAddress,
  existingDeliveryAddress,
  onSuccess,
  manualOnly = false,
  listingId,
}: AddressPickerModalProps) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [addingNew, setAddingNew] = useState(false);
  const [searchResult, setSearchResult] = useState<ParsedGoogleAddress | null>(null);
  const [manualForm, setManualForm] = useState(initialManualForm);
  const [newAddressLabel, setNewAddressLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [profileLocation, setProfileLocation] = useState<{
    line1: string;
    city: string;
    state: string;
    zip: string;
    formattedAddress: string;
  } | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);

  const permissionErrorHint =
    'Try signing out and back in. If you manage this project, deploy Firestore rules: firebase deploy --only firestore:rules';

  const existingKey = useMemo(
    () =>
      existingDeliveryAddress
        ? `${existingDeliveryAddress.line1}|${existingDeliveryAddress.city}|${existingDeliveryAddress.state}|${existingDeliveryAddress.zip}`
        : '',
    [
      existingDeliveryAddress?.line1,
      existingDeliveryAddress?.city,
      existingDeliveryAddress?.state,
      existingDeliveryAddress?.zip,
    ]
  );

  const loadAddresses = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    setProfileLocation(null);
    try {
      const [list, checkout, profile] = await Promise.all([
        getAddresses(userId),
        getCheckoutDeliveryAddress(userId),
        getUserProfile(userId).catch(() => null),
      ]);
      setAddresses(list);
      // Pre-select: when we have order context and existing address, match to saved address; else use checkout
      let initialSelected: string | null = checkout?.deliveryAddressId ?? null;
      if (orderId && existingDeliveryAddress && list.length > 0) {
        const match = list.find((a) => addressMatchesPayload(a, existingDeliveryAddress));
        if (match) initialSelected = match.id;
      }
      // Ensure selected ID exists in list (e.g. address was deleted elsewhere)
      if (initialSelected && !list.some((a) => a.id === initialSelected)) {
        initialSelected = null;
      }
      setSelectedAddressId(initialSelected);
      const loc = profile?.profile?.location;
      if (
        list.length === 0 &&
        loc &&
        (loc.address || loc.city) &&
        loc.state &&
        loc.zip
      ) {
        const line1 = (loc.address || '').trim() || (loc.city || '').trim() || 'Address';
        const city = (loc.city || '').trim();
        const state = (loc.state || '').trim();
        const zip = (loc.zip || '').trim();
        setProfileLocation({
          line1,
          city,
          state,
          zip,
          formattedAddress: [line1, city, `${state} ${zip}`.trim()].filter(Boolean).join(', '),
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isPermission = msg.toLowerCase().includes('missing or insufficient permissions');
      setError(isPermission ? `Couldn't load your addresses. ${permissionErrorHint}` : msg || 'Failed to load addresses');
    } finally {
      setLoading(false);
    }
  }, [userId, orderId, existingKey, existingDeliveryAddress]);

  useEffect(() => {
    if (open && userId && !saving) loadAddresses();
  }, [open, userId, loadAddresses, saving]);

  const handleSelectSaved = (address: SavedAddress) => {
    setSelectedAddressId(address.id);
  };

  const handleConfirmSelectedAddress = async () => {
    if (!selectedAddressId) return;
    const address = addresses.find((a) => a.id === selectedAddressId);
    if (!address) return;
    setSaving(true);
    setError(null);
    try {
      await setCheckoutDeliveryAddress(userId, address.id, listingId);
      if (orderId && onSetDeliveryAddress) {
        await onSetDeliveryAddress(orderId, savedToPayload(address));
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isPermission = msg.toLowerCase().includes('missing or insufficient permissions');
      setError(isPermission ? `Couldn't save. ${permissionErrorHint}` : msg || 'Failed to set address');
    } finally {
      setSaving(false);
    }
  };

  const handleSearchSelect = (address: ParsedGoogleAddress) => {
    setSearchResult(address);
  };

  const handleMapConfirm = async (result: {
    lat: number;
    lng: number;
    formattedAddress: string;
  }) => {
    if (!searchResult) return;
    setSaving(true);
    setError(null);
    try {
      const label = newAddressLabel.trim() || 'Address';
      const newAddress: Omit<SavedAddress, 'id' | 'createdAt' | 'updatedAt'> = {
        label,
        isDefault: addresses.length === 0,
        formattedAddress: result.formattedAddress,
        line1: searchResult.line1,
        line2: searchResult.line2,
        city: searchResult.city,
        state: searchResult.state,
        postalCode: searchResult.postalCode,
        country: searchResult.country,
        lat: result.lat,
        lng: result.lng,
        provider: 'google',
        placeId: searchResult.placeId,
      };
      const saved = await saveAddress(userId, newAddress, {
        makeDefault: addresses.length === 0,
      });
      await setCheckoutDeliveryAddress(userId, saved.id, listingId);
      if (orderId && onSetDeliveryAddress) {
        await onSetDeliveryAddress(orderId, {
          line1: saved.line1,
          line2: saved.line2,
          city: saved.city,
          state: saved.state,
          zip: saved.postalCode,
          deliveryInstructions: saved.notes,
          lat: saved.lat,
          lng: saved.lng,
        });
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isPermission = msg.toLowerCase().includes('missing or insufficient permissions');
      setError(isPermission ? `Couldn't save address. ${permissionErrorHint}` : msg || 'Failed to save address');
    } finally {
      setSaving(false);
    }
  };

  const handleBackToSearch = () => {
    setSearchResult(null);
  };

  const handleBackToList = () => {
    setAddingNew(false);
    setSearchResult(null);
    setManualForm(initialManualForm);
    setNewAddressLabel('');
    setShowManualEntry(false);
  };

  const handleUseProfileLocation = async () => {
    if (!profileLocation) return;
    setSaving(true);
    setError(null);
    try {
      const newAddress: Omit<SavedAddress, 'id' | 'createdAt' | 'updatedAt'> = {
        label: 'Profile location',
        isDefault: true,
        formattedAddress: profileLocation.formattedAddress,
        line1: profileLocation.line1,
        city: profileLocation.city,
        state: profileLocation.state,
        postalCode: profileLocation.zip,
        country: 'US',
        lat: 0,
        lng: 0,
        provider: 'manual',
        placeId: '',
      };
      const saved = await saveAddress(userId, newAddress, { makeDefault: true });
      await setCheckoutDeliveryAddress(userId, saved.id, listingId);
      if (orderId && onSetDeliveryAddress) {
        await onSetDeliveryAddress(orderId, {
          line1: saved.line1,
          line2: saved.line2,
          city: saved.city,
          state: saved.state,
          zip: saved.postalCode,
          deliveryInstructions: saved.notes,
          lat: saved.lat,
          lng: saved.lng,
        });
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isPermission = msg.toLowerCase().includes('missing or insufficient permissions');
      setError(isPermission ? `Couldn't save. ${permissionErrorHint}` : msg || 'Failed to set address');
    } finally {
      setSaving(false);
    }
  };

  const handleManualSubmit = async () => {
    const { line1, line2, city, state, zip, deliveryInstructions, lat, lng, pinLabel } = manualForm;
    if (!line1.trim() || !city.trim() || !state.trim() || !zip.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const label = newAddressLabel.trim() || 'Address';
      const formattedAddress = [line1, line2, city, `${state} ${zip}`].filter(Boolean).join(', ');
      const newAddress: Omit<SavedAddress, 'id' | 'createdAt' | 'updatedAt'> = {
        label,
        isDefault: addresses.length === 0,
        formattedAddress,
        line1: line1.trim(),
        line2: line2?.trim() || undefined,
        city: city.trim(),
        state: state.trim(),
        postalCode: zip.trim(),
        country: 'US',
        lat: lat ?? 0,
        lng: lng ?? 0,
        provider: 'manual',
        placeId: '',
        notes: deliveryInstructions?.trim() || undefined,
      };
      const saved = await saveAddress(userId, newAddress, {
        makeDefault: addresses.length === 0,
      });
      await setCheckoutDeliveryAddress(userId, saved.id, listingId);
      if (orderId && onSetDeliveryAddress) {
        await onSetDeliveryAddress(orderId, {
          line1: saved.line1,
          line2: saved.line2,
          city: saved.city,
          state: saved.state,
          zip: saved.postalCode,
          deliveryInstructions: saved.notes,
          lat: saved.lat,
          lng: saved.lng,
          pinLabel: pinLabel || undefined,
        });
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isPermission = msg.toLowerCase().includes('missing or insufficient permissions');
      setError(isPermission ? `Couldn't save address. ${permissionErrorHint}` : msg || 'Failed to save address');
    } finally {
      setSaving(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Location is not available in this browser.');
      return;
    }
    setLocationLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setManualForm((f) => ({
          ...f,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          pinLabel: 'My location',
        }));
        setLocationLoading(false);
      },
      () => {
        setError('Could not get location. Check permissions or enter address manually.');
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  // Reset modal state when opening so we always start fresh
  useEffect(() => {
    if (open) {
      setError(null);
      setManualForm(initialManualForm);
      setNewAddressLabel('');
      setAddingNew(false);
      setSearchResult(null);
      setShowManualEntry(false);
    }
  }, [open]);

  const manualValid =
    manualForm.line1.trim() &&
    manualForm.city.trim() &&
    manualForm.state.trim() &&
    manualForm.zip.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="max-sm:z-[70] sm:z-50"
        className={cn(
          'flex flex-col overflow-hidden border-2 bg-background shadow-lg',
          'gap-3 sm:gap-4 pt-4 sm:pt-6 pb-4 sm:pb-6',
          'max-h-[85dvh] sm:max-h-[85vh]',
          'w-[calc(100%-2rem)] max-w-xl',
          'rounded-xl px-4 sm:px-6',
          'max-sm:z-[70] sm:z-50'
        )}
      >
        <DialogHeader className="flex-shrink-0 space-y-1.5 text-left pr-10 sm:pr-10">
          <DialogTitle className="text-base sm:text-lg">Set delivery address</DialogTitle>
          <DialogDescription className="text-left text-xs sm:text-sm">
            {manualOnly
              ? 'Manual entry only. Enable Maps + Places on your API key (NEXT_PUBLIC_GOOGLE_MAPS_KEY or NEXT_PUBLIC_FIREBASE_API_KEY) and restart to use address search and map (HEB-style).'
              : 'Choose a saved address or add a new one. Use search and map to confirm. The seller will use it to propose a delivery date.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden space-y-4 overscroll-contain touch-pan-y pb-4 max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]">
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{error}</p>
          )}

          {!addingNew ? (
            <>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : addresses.length > 0 || profileLocation ? (
                <div className="space-y-2">
                  {profileLocation && addresses.length === 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">From your profile</p>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-start text-left h-auto min-h-[48px] py-3 px-3 touch-manipulation"
                        disabled={saving}
                        onClick={handleUseProfileLocation}
                      >
                        <MapPin className="h-4 w-4 shrink-0 mr-2 text-muted-foreground" />
                        <span className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
                          <span className="font-medium">Use profile location</span>
                          <span className="text-xs text-muted-foreground truncate w-full">
                            {profileLocation.formattedAddress}
                          </span>
                        </span>
                        {saving && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                      </Button>
                      <p className="text-xs text-muted-foreground">Or add a new address below.</p>
                    </div>
                  )}
                  {addresses.length > 0 && (
                    <>
                      <p className="text-sm font-medium text-muted-foreground">Saved addresses</p>
                      <p className="text-xs text-muted-foreground">Tap an address to select it, then confirm below.</p>
                      <ul className="space-y-2">
                        {addresses.map((a) => (
                          <li key={a.id}>
                            <Button
                              type="button"
                              variant={selectedAddressId === a.id ? 'secondary' : 'outline'}
                              className="w-full justify-start text-left h-auto min-h-[48px] py-3 px-3 touch-manipulation"
                              disabled={saving}
                              onClick={() => handleSelectSaved(a)}
                            >
                              <MapPin className="h-4 w-4 shrink-0 mr-2 text-muted-foreground" />
                              <span className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
                                <span className="font-medium flex items-center gap-2">
                                  {a.label}
                                  {a.isDefault && (
                                    <span className="text-xs font-normal text-muted-foreground">(default)</span>
                                  )}
                                  {selectedAddressId === a.id && (
                                    <Check className="h-4 w-4 text-primary shrink-0" aria-hidden />
                                  )}
                                </span>
                                <span className="text-xs text-muted-foreground truncate w-full">
                                  {a.formattedAddress}
                                </span>
                              </span>
                            </Button>
                          </li>
                        ))}
                      </ul>
                      {selectedAddressId && addresses.some((a) => a.id === selectedAddressId) && (
                        <Button
                          type="button"
                          className="w-full min-h-[48px] touch-manipulation"
                          disabled={saving}
                          onClick={handleConfirmSelectedAddress}
                        >
                          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                          Use this address
                        </Button>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No saved addresses yet.</p>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full min-h-[48px] touch-manipulation"
                onClick={() => setAddingNew(true)}
                disabled={saving}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add new address
              </Button>
            </>
          ) : manualOnly ? (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground rounded-md bg-muted/50 p-2 border border-border">
                Address search (Google Places) and map with draggable pin use your API key: set <code className="text-[10px] bg-muted px-1 rounded">NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> or enable Maps + Places on <code className="text-[10px] bg-muted px-1 rounded">NEXT_PUBLIC_FIREBASE_API_KEY</code>. Restart the app after changing env.
              </p>
              <p className="text-sm font-medium text-muted-foreground">New address</p>
              <div className="space-y-3">
                <div>
                  <label className="font-medium text-foreground text-sm">Name (e.g. Home, Ranch)</label>
                  <Input
                    value={newAddressLabel}
                    onChange={(e) => setNewAddressLabel(e.target.value)}
                    placeholder="Home, Ranch, Office…"
                    className="mt-1 w-full min-w-0 min-h-[48px]"
                  />
                </div>
                <div>
                  <label className="font-medium text-foreground text-sm">Street address *</label>
                  <Input
                    value={manualForm.line1}
                    onChange={(e) => setManualForm((f) => ({ ...f, line1: e.target.value }))}
                    placeholder="123 Main St"
                    className="mt-1 w-full min-w-0 min-h-[48px]"
                  />
                </div>
                <div>
                  <label className="font-medium text-foreground text-sm">Apt, suite, etc. (optional)</label>
                  <Input
                    value={manualForm.line2}
                    onChange={(e) => setManualForm((f) => ({ ...f, line2: e.target.value }))}
                    placeholder="Unit 4"
                    className="mt-1 w-full min-w-0 min-h-[48px]"
                  />
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-3 sm:gap-x-2">
                  <div className="flex-1 min-w-0 sm:min-w-[120px]">
                    <label className="font-medium text-foreground text-sm">City *</label>
                    <Input
                      value={manualForm.city}
                      onChange={(e) => setManualForm((f) => ({ ...f, city: e.target.value }))}
                      placeholder="City"
                      className="mt-1 w-full min-w-0 min-h-[48px]"
                    />
                  </div>
                  <div className="w-16 shrink-0">
                    <label className="font-medium text-foreground text-sm">State *</label>
                    <Input
                      value={manualForm.state}
                      onChange={(e) => setManualForm((f) => ({ ...f, state: e.target.value.toUpperCase().slice(0, 2) }))}
                      placeholder="TX"
                      className="mt-1 w-full min-h-[48px]"
                    />
                  </div>
                  <div className="w-24 shrink-0">
                    <label className="font-medium text-foreground text-sm">ZIP *</label>
                    <Input
                      value={manualForm.zip}
                      onChange={(e) => setManualForm((f) => ({ ...f, zip: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                      placeholder="12345"
                      className="mt-1 w-full min-h-[48px]"
                    />
                  </div>
                </div>
                <div>
                  <label className="font-medium text-foreground text-sm">Delivery instructions (optional)</label>
                  <Input
                    value={manualForm.deliveryInstructions}
                    onChange={(e) => setManualForm((f) => ({ ...f, deliveryInstructions: e.target.value }))}
                    placeholder="Gate code, gate left open, etc."
                    className="mt-1 w-full min-w-0 min-h-[48px]"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto min-h-[48px] touch-manipulation"
                  disabled={locationLoading || saving}
                  onClick={useMyLocation}
                >
                  {locationLoading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin mr-2" /> : <MapPin className="h-4 w-4 shrink-0 mr-2" />}
                  Use my location (add pin for seller)
                </Button>
                {(manualForm.lat != null && manualForm.lng != null) && (
                  <p className="text-xs text-muted-foreground">
                    Pin set: {manualForm.pinLabel || `${manualForm.lat.toFixed(4)}, ${manualForm.lng.toFixed(4)}`}
                  </p>
                )}
              </div>
              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:flex-wrap">
                <Button type="button" variant="ghost" className="min-h-[48px] touch-manipulation w-full sm:w-auto" onClick={handleBackToList}>
                  Back to list
                </Button>
                <Button
                  type="button"
                  disabled={!manualValid || saving}
                  className="min-h-[48px] touch-manipulation w-full sm:w-auto"
                  onClick={handleManualSubmit}
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Save and use address
                </Button>
              </div>
            </div>
          ) : !searchResult ? (
            <div className="space-y-4">
              <AddressSearch
                onSelect={handleSearchSelect}
                placeholder="Search for an address…"
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                Or{' '}
                <button
                  type="button"
                  className="text-primary underline font-medium hover:no-underline"
                  onClick={() => setShowManualEntry(true)}
                >
                  enter address manually
                </button>
              </p>
              {showManualEntry ? (
                <div className="space-y-3 pt-2 border-t">
                  <p className="text-sm font-medium text-foreground">Enter address manually</p>
                  <div className="space-y-3">
                    <div>
                      <label className="font-medium text-foreground text-sm">Name (e.g. Home, Ranch)</label>
                      <Input value={newAddressLabel} onChange={(e) => setNewAddressLabel(e.target.value)} placeholder="Home, Ranch, Office…" className="mt-1 w-full min-w-0 min-h-[48px]" />
                    </div>
                    <div>
                      <label className="font-medium text-foreground text-sm">Street address *</label>
                      <Input value={manualForm.line1} onChange={(e) => setManualForm((f) => ({ ...f, line1: e.target.value }))} placeholder="123 Main St" className="mt-1 w-full min-w-0 min-h-[48px]" />
                    </div>
                    <div>
                      <label className="font-medium text-foreground text-sm">Apt, suite, etc. (optional)</label>
                      <Input value={manualForm.line2} onChange={(e) => setManualForm((f) => ({ ...f, line2: e.target.value }))} placeholder="Unit 4" className="mt-1 w-full min-w-0 min-h-[48px]" />
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-3 sm:gap-x-2">
                      <div className="flex-1 min-w-0 sm:min-w-[120px]">
                        <label className="font-medium text-foreground text-sm">City *</label>
                        <Input value={manualForm.city} onChange={(e) => setManualForm((f) => ({ ...f, city: e.target.value }))} placeholder="City" className="mt-1 w-full min-w-0 min-h-[48px]" />
                      </div>
                      <div className="w-16 shrink-0">
                        <label className="font-medium text-foreground text-sm">State *</label>
                        <Input value={manualForm.state} onChange={(e) => setManualForm((f) => ({ ...f, state: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="TX" className="mt-1 w-full min-h-[48px]" />
                      </div>
                      <div className="w-24 shrink-0">
                        <label className="font-medium text-foreground text-sm">ZIP *</label>
                        <Input value={manualForm.zip} onChange={(e) => setManualForm((f) => ({ ...f, zip: e.target.value.replace(/\D/g, '').slice(0, 10) }))} placeholder="12345" className="mt-1 w-full min-h-[48px]" />
                      </div>
                    </div>
                    <div>
                      <label className="font-medium text-foreground text-sm">Delivery instructions (optional)</label>
                      <Input value={manualForm.deliveryInstructions} onChange={(e) => setManualForm((f) => ({ ...f, deliveryInstructions: e.target.value }))} placeholder="Gate code, etc." className="mt-1 w-full min-w-0 min-h-[48px]" />
                    </div>
                    <Button type="button" disabled={!manualValid || saving} className="min-h-[48px] w-full sm:w-auto" onClick={handleManualSubmit}>
                      {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Save and use address
                    </Button>
                  </div>
                </div>
              ) : null}
              <Button type="button" variant="ghost" className="min-h-[48px] touch-manipulation w-full sm:w-auto" onClick={handleBackToList}>
                Back to list
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="font-medium text-foreground text-sm">Name this address (e.g. Home, Ranch)</label>
                <Input
                  value={newAddressLabel}
                  onChange={(e) => setNewAddressLabel(e.target.value)}
                  placeholder="Home, Ranch, Office…"
                  className="mt-1 w-full min-w-0 min-h-[48px]"
                />
              </div>
              <AddressMapConfirm
                lat={searchResult.lat}
                lng={searchResult.lng}
                formattedAddress={searchResult.formattedAddress}
                onConfirm={handleMapConfirm}
                secondaryAction={
                  <Button type="button" variant="ghost" className="min-h-[48px] touch-manipulation w-full sm:w-auto" onClick={handleBackToSearch}>
                    Back to search
                  </Button>
                }
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
