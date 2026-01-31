'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MapPin, Plus, Loader2, Star, Pencil, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getAddresses, saveAddress, deleteAddress } from '@/lib/firebase/addresses';
import type { SavedAddress } from '@/lib/types';
import type { SavedAddressInput } from '@/lib/firebase/addresses';
import { AddressPickerModal } from '@/components/address/AddressPickerModal';

export interface SavedAddressesPanelProps {
  userId: string;
  /** Called when addresses load or default changes. Use to sync profile location from default address. */
  onDefaultAddressChange?: (address: SavedAddress | null) => void;
}

export function SavedAddressesPanel({ userId, onDefaultAddressChange }: SavedAddressesPanelProps) {
  const { toast } = useToast();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editAddress, setEditAddress] = useState<SavedAddress | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedAddress | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const onDefaultAddressChangeRef = useRef(onDefaultAddressChange);
  onDefaultAddressChangeRef.current = onDefaultAddressChange;

  const loadAddresses = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await getAddresses(userId);
      setAddresses(list);
      const defaultAddr = list.find((a) => a.isDefault) ?? null;
      onDefaultAddressChangeRef.current?.(defaultAddr);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({
        title: 'Could not load addresses',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [userId, toast]);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const handleSetDefault = async (address: SavedAddress) => {
    if (address.isDefault) return;
    setSaving(true);
    try {
      const payload: SavedAddressInput = {
        label: address.label,
        isDefault: true,
        formattedAddress: address.formattedAddress,
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        country: address.country,
        lat: address.lat,
        lng: address.lng,
        provider: address.provider,
        placeId: address.placeId,
        notes: address.notes,
        gateCode: address.gateCode,
      };
      await saveAddress(userId, payload, { addressId: address.id, makeDefault: true });
      await loadAddresses();
      onDefaultAddressChange?.(address);
      toast({ title: 'Default updated', description: 'This address is now your default location.' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: 'Could not set default', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const addr = deleteTarget;
    if (!addr || !userId) return;
    setDeleting(true);
    try {
      await deleteAddress(userId, addr.id);
      setDeleteTarget(null);
      await loadAddresses();
      toast({ title: 'Address removed', description: 'The address has been deleted.' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: 'Could not delete address', description: msg, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Card className="border-2 border-border/50 bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <MapPin className="h-5 w-5" />
            Locations
          </CardTitle>
          <CardDescription>
            Add and select your addresses. Your default is used for your profile and at checkout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : addresses.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/50 bg-muted/30 p-6 text-center">
              <MapPin className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">No locations yet</p>
              <p className="text-xs text-muted-foreground mb-4">
                Add an address to use for your profile and at checkout.
              </p>
              <Button onClick={() => setPickerOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Add address
              </Button>
            </div>
          ) : (
            <ul className="space-y-3">
              {addresses.map((addr) => (
                <li key={addr.id}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border border-border/50 bg-background/50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground">{addr.label}</span>
                        {addr.isDefault && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded">
                            <Star className="h-3 w-3 fill-current" />
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 truncate sm:whitespace-normal">
                        {addr.formattedAddress}
                      </p>
                      {(addr.notes || addr.gateCode) && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {[addr.notes, addr.gateCode && `Gate: ${addr.gateCode}`].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!addr.isDefault && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={saving}
                          onClick={() => handleSetDefault(addr)}
                          className="gap-1"
                          title="Set as default"
                        >
                          <Star className="h-3.5 w-3.5" />
                          Default
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditAddress(addr)}
                        className="gap-1"
                        title="Edit address"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteTarget(addr)}
                        title="Delete address"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!loading && addresses.length > 0 && (
            <Button variant="outline" onClick={() => setPickerOpen(true)} className="w-full sm:w-auto gap-2">
              <Plus className="h-4 w-4" />
              Add address
            </Button>
          )}
        </CardContent>
      </Card>

      <AddressPickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        userId={userId}
        onSuccess={loadAddresses}
      />

      {editAddress && (
        <EditAddressDialog
          address={editAddress}
          open={!!editAddress}
          onOpenChange={(open) => !open && setEditAddress(null)}
          userId={userId}
          onSaved={() => {
            setEditAddress(null);
            loadAddresses();
            toast({ title: 'Address updated', description: 'Your changes have been saved.' });
          }}
          onError={(msg) => toast({ title: 'Could not update address', description: msg, variant: 'destructive' })}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this address?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  This will remove &quot;{deleteTarget.label}&quot; ({deleteTarget.formattedAddress}) from your saved
                  addresses. You can add it again later.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface EditAddressDialogProps {
  address: SavedAddress;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onSaved: () => void;
  onError: (message: string) => void;
}

function EditAddressDialog({ address, open, onOpenChange, userId, onSaved, onError }: EditAddressDialogProps) {
  const [label, setLabel] = useState(address.label);
  const [line1, setLine1] = useState(address.line1);
  const [line2, setLine2] = useState(address.line2 ?? '');
  const [city, setCity] = useState(address.city);
  const [state, setState] = useState(address.state);
  const [postalCode, setPostalCode] = useState(address.postalCode);
  const [notes, setNotes] = useState(address.notes ?? '');
  const [gateCode, setGateCode] = useState(address.gateCode ?? '');
  const [saving, setSaving] = useState(false);

  // Reset form when address changes
  useEffect(() => {
    if (address) {
      setLabel(address.label);
      setLine1(address.line1);
      setLine2(address.line2 ?? '');
      setCity(address.city);
      setState(address.state);
      setPostalCode(address.postalCode);
      setNotes(address.notes ?? '');
      setGateCode(address.gateCode ?? '');
    }
  }, [address?.id]);

  const valid = line1.trim() && city.trim() && state.trim() && postalCode.trim();

  const handleSave = async () => {
    if (!valid || !userId) return;
    setSaving(true);
    try {
      const formattedAddress = [line1.trim(), line2.trim(), city.trim(), `${state.trim()} ${postalCode.trim()}`]
        .filter(Boolean)
        .join(', ');
      const payload: SavedAddressInput = {
        label: label.trim() || 'Address',
        isDefault: address.isDefault,
        formattedAddress,
        line1: line1.trim(),
        line2: line2.trim() || undefined,
        city: city.trim(),
        state: state.trim(),
        postalCode: postalCode.trim(),
        country: address.country,
        lat: address.lat,
        lng: address.lng,
        provider: address.provider,
        placeId: address.placeId,
        notes: notes.trim() || undefined,
        gateCode: gateCode.trim() || undefined,
      };
      await saveAddress(userId, payload, { addressId: address.id });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit address</DialogTitle>
          <DialogDescription>Update the details for this saved address.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="edit-label">Label</Label>
            <Input
              id="edit-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Home, Ranch, etc."
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-line1">Street address *</Label>
            <Input
              id="edit-line1"
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
              placeholder="123 Main St"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-line2">Apt, suite, etc. (optional)</Label>
            <Input
              id="edit-line2"
              value={line2}
              onChange={(e) => setLine2(e.target.value)}
              placeholder="Unit 4"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-city">City *</Label>
              <Input
                id="edit-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-state">State *</Label>
              <Input
                id="edit-state"
                value={state}
                onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="TX"
                maxLength={2}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-postal">ZIP *</Label>
              <Input
                id="edit-postal"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="12345"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-notes">Delivery instructions (optional)</Label>
            <Input
              id="edit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Gate code, special instructions"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-gate">Gate code (optional)</Label>
            <Input
              id="edit-gate"
              value={gateCode}
              onChange={(e) => setGateCode(e.target.value)}
              placeholder="1234"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={!valid || saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
