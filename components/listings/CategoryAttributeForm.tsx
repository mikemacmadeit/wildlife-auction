/**
 * Category-specific attribute form fields
 * Renders different fields based on selected category
 */

'use client';

import { useEffect } from 'react';
import {
  ListingCategory,
  WildlifeAttributes,
  CattleAttributes,
  EquipmentAttributes,
  WhitetailBreederAttributes,
  HorseAttributes,
  SportingWorkingDogAttributes,
} from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AlertCircle } from 'lucide-react';
import { getPermitExpirationStatus } from '@/lib/compliance/validation';
import { cn } from '@/lib/utils';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { CATTLE_BREED_OPTIONS } from '@/lib/taxonomy/cattle-breeds';
import { DOG_BREED_OPTIONS } from '@/lib/taxonomy/dog-breeds';
import { getEquipmentMakeOptions, getEquipmentModelSuggestions } from '@/lib/taxonomy/equipment-makes';
import { EXOTIC_SPECIES_OPTIONS } from '@/lib/taxonomy/exotic-species';

type ListingAttributes =
  | WildlifeAttributes
  | CattleAttributes
  | EquipmentAttributes
  | WhitetailBreederAttributes
  | HorseAttributes
  | SportingWorkingDogAttributes;

interface CategoryAttributeFormProps {
  category: ListingCategory;
  // Union (not intersection): each category has its own attribute shape.
  attributes: Partial<ListingAttributes>;
  onChange: (attributes: Partial<ListingAttributes>) => void;
  errors?: string[];
}

export function CategoryAttributeForm({ category, attributes, onChange, errors = [] }: CategoryAttributeFormProps) {
  const updateAttribute = (key: string, value: any) => {
    onChange({ ...attributes, [key]: value });
  };
  
  const hasError = (fieldName: string) => errors.includes(fieldName);

  // IMPORTANT: Some required fields (like Quantity) visually default to 1, but were not being written into state
  // until the user interacted. This caused validation failures with no obvious missing input.
  const currentQuantity = (attributes as any)?.quantity;
  useEffect(() => {
    const needsQuantity =
      category === 'whitetail_breeder' ||
      category === 'wildlife_exotics' ||
      category === 'cattle_livestock' ||
      category === 'horse_equestrian' ||
      category === 'sporting_working_dogs' ||
      category === 'hunting_outfitter_assets' ||
      category === 'ranch_equipment' ||
      category === 'ranch_vehicles';

    if (!needsQuantity) return;
    // Always set quantity to 1 if it's not already a valid number >= 1
    // This ensures quantity is in state immediately when category is selected
    if (typeof currentQuantity !== 'number' || !Number.isFinite(currentQuantity) || currentQuantity < 1) {
      // Default to 1 (and persist it into parent form state)
      updateAttribute('quantity', 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]); // Only depend on category, not currentQuantity, to ensure it runs immediately when category changes

  const currentRegistered = (attributes as any)?.registered;
  useEffect(() => {
    if (category !== 'cattle_livestock') return;
    if (currentRegistered === true || currentRegistered === false) return;
    // Unchecked checkbox should mean "false" by default; persist so validation doesn't treat it as missing.
    updateAttribute('registered', false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, currentRegistered]);

  const currentSpeciesId = (attributes as any)?.speciesId;
  useEffect(() => {
    if (category !== 'horse_equestrian') return;
    if (currentSpeciesId === 'horse') return;
    // Persist fixed speciesId for server-authoritative validation + downstream docs (Bill of Sale).
    updateAttribute('speciesId', 'horse');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, currentSpeciesId]);

  useEffect(() => {
    if (category !== 'sporting_working_dogs') return;
    if (currentSpeciesId === 'dog') return;
    updateAttribute('speciesId', 'dog');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, currentSpeciesId]);

  // Cattle: migrate legacy single quantity into quantity-by-sex (bull/cow/heifer/steer)
  useEffect(() => {
    if (category !== 'cattle_livestock') return;
    const c = attributes as Partial<CattleAttributes>;
    const hasBreakdown =
      c.quantityBull !== undefined ||
      c.quantityCow !== undefined ||
      c.quantityHeifer !== undefined ||
      c.quantitySteer !== undefined;
    if (hasBreakdown) return;
    const total = typeof c.quantity === 'number' && c.quantity >= 1 ? c.quantity : 1;
    const sex = c.sex || 'cow';
    // Put legacy total in the matching sex bucket; if unknown, use cow so total is preserved
    const putIn = sex === 'bull' ? 'bull' : sex === 'heifer' ? 'heifer' : sex === 'steer' ? 'steer' : 'cow';
    onChange({
      ...attributes,
      quantity: total,
      quantityBull: putIn === 'bull' ? total : 0,
      quantityCow: putIn === 'cow' ? total : 0,
      quantityHeifer: putIn === 'heifer' ? total : 0,
      quantitySteer: putIn === 'steer' ? total : 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Whitetail, Wildlife, Horse, Dogs: migrate legacy single quantity into quantityMale/quantityFemale
  useEffect(() => {
    const maleFemaleCategories = ['whitetail_breeder', 'wildlife_exotics', 'horse_equestrian', 'sporting_working_dogs'] as const;
    if (!maleFemaleCategories.includes(category)) return;
    const a = attributes as any;
    const hasBreakdown = a.quantityMale !== undefined || a.quantityFemale !== undefined;
    if (hasBreakdown) return;
    const total = typeof a.quantity === 'number' && a.quantity >= 1 ? a.quantity : 1;
    const sex = a.sex ?? 'unknown';
    // Map sex to male/female. Horse: stallion/gelding -> male, mare -> female.
    const isMale = sex === 'male' || sex === 'stallion' || sex === 'gelding';
    const isFemale = sex === 'female' || sex === 'mare';
    onChange({
      ...attributes,
      quantity: total,
      quantityMale: isMale ? total : isFemale ? 0 : total,
      quantityFemale: isFemale ? total : isMale ? 0 : 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Disclosures are now handled in the final seller acknowledgment step, not in the attributes form


  if (category === 'horse_equestrian') {
    return (
      <div className="space-y-4">
        <Alert className="bg-blue-50 border-blue-200">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Horse / Equestrian:</strong> Provide clear identification and required disclosures. Texas-only transfers apply on this platform.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label className="text-base font-semibold">
            Species <span className="text-destructive">*</span>
          </Label>
          <Input value="Horse" disabled className="min-h-[48px] text-base bg-muted" />
          <p className="text-xs text-muted-foreground">Species is fixed as Horse for this category.</p>
        </div>

        <div className="space-y-2">
          <Label className="text-base font-semibold">Group or individual</Label>
          <RadioGroup
            value={(attributes as Partial<HorseAttributes>).quantityMode || 'individual'}
            onValueChange={(v: 'group' | 'individual') => updateAttribute('quantityMode', v)}
            className="flex flex-col gap-2"
          >
            <div className="flex items-start space-x-3 rounded-lg border p-3">
              <RadioGroupItem value="individual" id="horse-qty-individual" className="mt-0.5" />
              <Label htmlFor="horse-qty-individual" className="cursor-pointer flex-1">
                <div className="font-medium">Individual</div>
                <div className="text-sm text-muted-foreground">Buyers may choose how many to purchase.</div>
              </Label>
            </div>
            <div className="flex items-start space-x-3 rounded-lg border p-3">
              <RadioGroupItem value="group" id="horse-qty-group" className="mt-0.5" />
              <Label htmlFor="horse-qty-group" className="cursor-pointer flex-1">
                <div className="font-medium">Group</div>
                <div className="text-sm text-muted-foreground">This is a group listing. All will be purchased together for the listed price.</div>
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="horse-sex" className="text-base font-semibold">
            Sex <span className="text-destructive">*</span>
          </Label>
          <Select value={(attributes as Partial<HorseAttributes>).sex || 'unknown'} onValueChange={(value) => updateAttribute('sex', value)}>
            <SelectTrigger id="horse-sex" className={cn('min-h-[48px]', hasError('Sex') ? 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background' : '')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stallion">Stallion</SelectItem>
              <SelectItem value="mare">Mare</SelectItem>
              <SelectItem value="gelding">Gelding</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
          {hasError('Sex') ? <p className="text-sm text-destructive">Sex selection is required</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="horse-age" className="text-base font-semibold">Age (years, optional)</Label>
          <Input
            id="horse-age"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            placeholder="e.g., 4 or 7.5"
            value={(() => {
              const v = (attributes as Partial<HorseAttributes>).age as any;
              return typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
            })()}
            onChange={(e) => {
              const raw = e.target.value;
              if (!raw) {
                updateAttribute('age', undefined);
                return;
              }
              const n = Number(raw);
              updateAttribute('age', Number.isFinite(n) ? n : undefined);
            }}
            className="min-h-[48px] text-base"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="horse-registered" className="text-base font-semibold">
            Registered <span className="text-destructive">*</span>
          </Label>
          <div className={cn('flex items-center gap-2 rounded-lg border p-3 bg-background/40', hasError('Registered') ? 'border-destructive border-2' : 'border-border/60')}>
            <Checkbox
              id="horse-registered"
              checked={Boolean((attributes as Partial<HorseAttributes>).registered)}
              onCheckedChange={(v) => updateAttribute('registered', Boolean(v))}
            />
            <Label htmlFor="horse-registered" className="text-sm">
              This horse is registered with an organization
            </Label>
          </div>
        </div>

        {Boolean((attributes as Partial<HorseAttributes>).registered) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="horse-reg-org" className="text-base font-semibold">Registration Org (optional)</Label>
              <Input
                id="horse-reg-org"
                placeholder="e.g., AQHA"
                value={(attributes as any)?.registrationOrg || ''}
                onChange={(e) => updateAttribute('registrationOrg', e.target.value)}
                className="min-h-[48px] text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="horse-reg-number" className="text-base font-semibold">
                Registration Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="horse-reg-number"
                placeholder="Registration number"
                value={(attributes as any)?.registrationNumber || ''}
                onChange={(e) => updateAttribute('registrationNumber', e.target.value)}
                className={cn('min-h-[48px] text-base', hasError('Registration Number') ? 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background' : '')}
              />
              {hasError('Registration Number') ? <p className="text-sm text-destructive">Registration number is required when registered.</p> : null}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label className="text-base font-semibold">Identification (recommended)</Label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="horse-microchip" className="text-sm font-semibold">Microchip (optional)</Label>
              <Input
                id="horse-microchip"
                placeholder="Microchip number"
                value={(attributes as any)?.identification?.microchip || ''}
                onChange={(e) => updateAttribute('identification', { ...(attributes as any)?.identification, microchip: e.target.value })}
                className="min-h-[48px] text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="horse-brand" className="text-sm font-semibold">Brand (optional)</Label>
              <Input
                id="horse-brand"
                placeholder="Brand description"
                value={(attributes as any)?.identification?.brand || ''}
                onChange={(e) => updateAttribute('identification', { ...(attributes as any)?.identification, brand: e.target.value })}
                className="min-h-[48px] text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="horse-tattoo" className="text-sm font-semibold">Tattoo (optional)</Label>
              <Input
                id="horse-tattoo"
                placeholder="Tattoo"
                value={(attributes as any)?.identification?.tattoo || ''}
                onChange={(e) => updateAttribute('identification', { ...(attributes as any)?.identification, tattoo: e.target.value })}
                className="min-h-[48px] text-base"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="horse-markings" className="text-sm font-semibold">Markings (optional)</Label>
              <Input
                id="horse-markings"
                placeholder="Markings/description"
                value={(attributes as any)?.identification?.markings || ''}
                onChange={(e) => updateAttribute('identification', { ...(attributes as any)?.identification, markings: e.target.value })}
                className="min-h-[48px] text-base"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">At least one identifier is strongly recommended (microchip/brand/tattoo/markings).</p>
        </div>

        {/* Disclosures are now handled in the final seller acknowledgment step, not in the attributes form */}

        <div className="space-y-2">
          <Label className="text-base font-semibold">
            Quantity by sex <span className="text-destructive">*</span>
          </Label>
          <p className="text-xs text-muted-foreground">
            Enter how many male (stallion/gelding) and female (mare).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="horse-qty-male" className="text-sm font-medium text-muted-foreground">Male</Label>
              <Input
                id="horse-qty-male"
                type="number"
                min={0}
                value={typeof (attributes as Partial<HorseAttributes>).quantityMale === 'number' ? (attributes as Partial<HorseAttributes>).quantityMale : ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
                  const curr = attributes as Partial<HorseAttributes>;
                  const next = { ...curr, quantityMale: v, quantityFemale: curr.quantityFemale ?? 0 };
                  const total = (Number(next.quantityMale) || 0) + (Number(next.quantityFemale) || 0);
                  onChange({ ...next, quantity: total });
                }}
                className={cn('min-h-[48px] text-base', hasError('Quantity (must be at least 1)') && 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background')}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="horse-qty-female" className="text-sm font-medium text-muted-foreground">Female</Label>
              <Input
                id="horse-qty-female"
                type="number"
                min={0}
                value={typeof (attributes as Partial<HorseAttributes>).quantityFemale === 'number' ? (attributes as Partial<HorseAttributes>).quantityFemale : ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
                  const curr = attributes as Partial<HorseAttributes>;
                  const next = { ...curr, quantityFemale: v, quantityMale: curr.quantityMale ?? 0 };
                  const total = (Number(next.quantityMale) || 0) + (Number(next.quantityFemale) || 0);
                  onChange({ ...next, quantity: total });
                }}
                className={cn('min-h-[48px] text-base', hasError('Quantity (must be at least 1)') && 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background')}
              />
            </div>
          </div>
          <p className="text-sm font-medium text-foreground">
            Total: {(attributes as Partial<HorseAttributes>).quantity ?? 0}
          </p>
          {hasError('Quantity (must be at least 1)') ? <p className="text-sm text-destructive">Total quantity must be at least 1</p> : null}
        </div>
      </div>
    );
  }

  if (category === 'whitetail_breeder') {
    const expStatus = getPermitExpirationStatus(
      (attributes as Partial<WhitetailBreederAttributes>).tpwdPermitExpirationDate
    );

    return (
      <div className="space-y-4">
        <Alert className="bg-yellow-50 border-yellow-200">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            <strong>TPWD Compliance Required:</strong> Whitetail breeder listings require TPWD Breeder Permit verification before going live. You must upload your TPWD Breeder Permit document.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="whitetail-species" className="text-base font-semibold">
            Species <span className="text-destructive">*</span>
          </Label>
          <Input
            id="whitetail-species"
            value="Whitetail Deer"
            disabled
            className="min-h-[48px] text-base bg-muted"
          />
          <p className="text-xs text-muted-foreground">Species is fixed as Whitetail Deer for breeder listings</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tpwd-permit-number" className="text-base font-semibold">
            TPWD Breeder Permit Number <span className="text-destructive">*</span>
          </Label>
          <Input
            id="tpwd-permit-number"
            placeholder="Enter your TPWD Breeder Permit Number"
            value={(attributes as Partial<WhitetailBreederAttributes>).tpwdBreederPermitNumber || ''}
            onChange={(e) => updateAttribute('tpwdBreederPermitNumber', e.target.value)}
            className={`min-h-[48px] text-base ${hasError('TPWD Breeder Permit Number') ? 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background' : ''}`}
            required
          />
          {hasError('TPWD Breeder Permit Number') && (
            <p className="text-sm text-destructive">TPWD Breeder Permit Number is required</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="tpwd-permit-expiration" className="text-base font-semibold">
            Permit Expiration Date <span className="text-destructive">*</span>
          </Label>
          <Input
            id="tpwd-permit-expiration"
            type="date"
            value={(() => {
              const raw: any = (attributes as Partial<WhitetailBreederAttributes>).tpwdPermitExpirationDate;
              const d: Date | null = raw?.toDate?.() || (raw instanceof Date ? raw : null);
              if (!d) return '';
              // yyyy-mm-dd for <input type="date">
              return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
            })()}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) {
                updateAttribute('tpwdPermitExpirationDate', undefined);
                return;
              }
              // Store as Date; Firestore will persist it as Timestamp.
              updateAttribute('tpwdPermitExpirationDate', new Date(`${v}T00:00:00`));
            }}
            className={`min-h-[48px] text-base ${hasError('Permit Expiration Date') ? 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background' : ''}`}
            required
          />
          {hasError('Permit Expiration Date') && (
            <p className="text-sm text-destructive">Permit expiration date is required</p>
          )}
          {expStatus.expired && (
            <Alert className="border-destructive bg-destructive/5">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-destructive">
                Your permit expiration date is in the past. You must renew before submitting.
              </AlertDescription>
            </Alert>
          )}
          {!expStatus.expired && expStatus.expiringSoon && expStatus.daysRemaining !== null && (
            <Alert className="border-yellow-200 bg-yellow-50">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                <strong>Heads up:</strong> Your permit expires in {expStatus.daysRemaining} days. You can still submit, but renew soon.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="breeder-facility-id" className="text-base font-semibold">
            Breeder Facility ID <span className="text-destructive">*</span>
          </Label>
          <Input
            id="breeder-facility-id"
            placeholder="Enter your Breeder Facility ID"
            value={(attributes as Partial<WhitetailBreederAttributes>).breederFacilityId || ''}
            onChange={(e) => updateAttribute('breederFacilityId', e.target.value)}
            className={`min-h-[48px] text-base ${hasError('Breeder Facility ID') ? 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background' : ''}`}
            required
          />
          {hasError('Breeder Facility ID') && (
            <p className="text-sm text-destructive">Breeder Facility ID is required</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="deer-id-tag" className="text-base font-semibold">
            Deer ID Tag <span className="text-destructive">*</span>
          </Label>
          <Input
            id="deer-id-tag"
            placeholder="Enter the Deer ID Tag"
            value={(attributes as Partial<WhitetailBreederAttributes>).deerIdTag || ''}
            onChange={(e) => updateAttribute('deerIdTag', e.target.value)}
            className={`min-h-[48px] text-base ${hasError('Deer ID Tag') ? 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background' : ''}`}
            required
          />
          {hasError('Deer ID Tag') && (
            <p className="text-sm text-destructive">Deer ID Tag is required</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="whitetail-sex" className="text-base font-semibold">
            Sex <span className="text-destructive">*</span>
          </Label>
          <Select
            value={(attributes as Partial<WhitetailBreederAttributes>).sex || 'unknown'}
            onValueChange={(value) => updateAttribute('sex', value)}
          >
            <SelectTrigger id="whitetail-sex" className={`min-h-[48px] ${hasError('Sex') ? 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background' : ''}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
          {hasError('Sex') && (
            <p className="text-sm text-destructive">Sex selection is required</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="whitetail-age" className="text-base font-semibold">Age (years, optional)</Label>
          <Input
            id="whitetail-age"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            placeholder="e.g., 3 or 5.5"
            value={(() => {
              const v = (attributes as Partial<WhitetailBreederAttributes>).age as any;
              return typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
            })()}
            onChange={(e) => {
              const raw = e.target.value;
              if (!raw) {
                updateAttribute('age', undefined);
                return;
              }
              const n = Number(raw);
              updateAttribute('age', Number.isFinite(n) ? n : undefined);
            }}
            className="min-h-[48px] text-base"
          />
          <p className="text-xs text-muted-foreground">Numbers only (decimals ok). Stored as a number for filtering.</p>
        </div>

        <div className="space-y-2">
          <Label className="text-base font-semibold">Group or individual</Label>
          <RadioGroup
            value={(attributes as Partial<WhitetailBreederAttributes>).quantityMode || 'individual'}
            onValueChange={(v: 'group' | 'individual') => updateAttribute('quantityMode', v)}
            className="flex flex-col gap-2"
          >
            <div className="flex items-start space-x-3 rounded-lg border p-3">
              <RadioGroupItem value="individual" id="whitetail-qty-individual" className="mt-0.5" />
              <Label htmlFor="whitetail-qty-individual" className="cursor-pointer flex-1">
                <div className="font-medium">Individual</div>
                <div className="text-sm text-muted-foreground">Buyers may choose how many to purchase.</div>
              </Label>
            </div>
            <div className="flex items-start space-x-3 rounded-lg border p-3">
              <RadioGroupItem value="group" id="whitetail-qty-group" className="mt-0.5" />
              <Label htmlFor="whitetail-qty-group" className="cursor-pointer flex-1">
                <div className="font-medium">Group</div>
                <div className="text-sm text-muted-foreground">This is a group listing. All will be purchased together for the listed price.</div>
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label className="text-base font-semibold">
            Quantity by sex <span className="text-destructive">*</span>
          </Label>
          <p className="text-xs text-muted-foreground">
            Enter how many male and female.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="whitetail-qty-male" className="text-sm font-medium text-muted-foreground">Male</Label>
              <Input
                id="whitetail-qty-male"
                type="number"
                min={0}
                value={typeof (attributes as Partial<WhitetailBreederAttributes>).quantityMale === 'number' ? (attributes as Partial<WhitetailBreederAttributes>).quantityMale : ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
                  const curr = attributes as Partial<WhitetailBreederAttributes>;
                  const next = { ...curr, quantityMale: v, quantityFemale: curr.quantityFemale ?? 0 };
                  const total = (Number(next.quantityMale) || 0) + (Number(next.quantityFemale) || 0);
                  onChange({ ...next, quantity: total });
                }}
                className={cn('min-h-[48px] text-base', hasError('Quantity (must be at least 1)') && 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background')}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="whitetail-qty-female" className="text-sm font-medium text-muted-foreground">Female</Label>
              <Input
                id="whitetail-qty-female"
                type="number"
                min={0}
                value={typeof (attributes as Partial<WhitetailBreederAttributes>).quantityFemale === 'number' ? (attributes as Partial<WhitetailBreederAttributes>).quantityFemale : ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
                  const curr = attributes as Partial<WhitetailBreederAttributes>;
                  const next = { ...curr, quantityFemale: v, quantityMale: curr.quantityMale ?? 0 };
                  const total = (Number(next.quantityMale) || 0) + (Number(next.quantityFemale) || 0);
                  onChange({ ...next, quantity: total });
                }}
                className={cn('min-h-[48px] text-base', hasError('Quantity (must be at least 1)') && 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background')}
              />
            </div>
          </div>
          <p className="text-sm font-medium text-foreground">
            Total: {(attributes as Partial<WhitetailBreederAttributes>).quantity ?? 0}
          </p>
          {hasError('Quantity (must be at least 1)') && (
            <p className="text-sm text-destructive">Total quantity must be at least 1</p>
          )}
        </div>

        <div className={`space-y-4 p-4 border rounded-lg bg-muted/50 ${hasError('CWD Awareness acknowledgment') || hasError('CWD Compliance confirmation') ? 'border-destructive border-2' : ''}`}>
          <Label className="text-base font-semibold">
            CWD Disclosure Checklist <span className="text-destructive">*</span>
          </Label>
          {(hasError('CWD Awareness acknowledgment') || hasError('CWD Compliance confirmation')) && (
            <p className="text-sm text-destructive">Both CWD acknowledgments are required</p>
          )}
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="cwd-aware"
                checked={(attributes as Partial<WhitetailBreederAttributes>).cwdDisclosureChecklist?.cwdAware || false}
                onCheckedChange={(checked) => {
                  const current = (attributes as Partial<WhitetailBreederAttributes>).cwdDisclosureChecklist || {};
                  updateAttribute('cwdDisclosureChecklist', { ...current, cwdAware: checked });
                }}
                className={hasError('CWD Awareness acknowledgment') ? 'border-destructive' : ''}
              />
              <Label htmlFor="cwd-aware" className="cursor-pointer flex-1">
                <div className="font-medium mb-1">I acknowledge CWD (Chronic Wasting Disease) rules and regulations</div>
                <div className="text-sm text-muted-foreground">
                  I understand the TPWD requirements for CWD testing and reporting
                </div>
              </Label>
            </div>
            <div className="flex items-start space-x-3">
              <Checkbox
                id="cwd-compliant"
                checked={(attributes as Partial<WhitetailBreederAttributes>).cwdDisclosureChecklist?.cwdCompliant || false}
                onCheckedChange={(checked) => {
                  const current = (attributes as Partial<WhitetailBreederAttributes>).cwdDisclosureChecklist || {};
                  updateAttribute('cwdDisclosureChecklist', { ...current, cwdCompliant: checked });
                }}
                className={hasError('CWD Compliance confirmation') ? 'border-destructive' : ''}
              />
              <Label htmlFor="cwd-compliant" className="cursor-pointer flex-1">
                <div className="font-medium mb-1">I confirm compliance with CWD regulations</div>
                <div className="text-sm text-muted-foreground">
                  I confirm that this animal and facility comply with all applicable CWD regulations
                </div>
              </Label>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="whitetail-health-notes" className="text-base font-semibold">Health Notes (Optional)</Label>
          <Textarea
            id="whitetail-health-notes"
            placeholder="Any health information or notes"
            value={(attributes as Partial<WhitetailBreederAttributes>).healthNotes || ''}
            onChange={(e) => updateAttribute('healthNotes', e.target.value)}
            className="min-h-[100px] text-base"
          />
        </div>
      </div>
    );
  }

  if (category === 'wildlife_exotics') {
    return (
      <div className="space-y-4">
        <Alert className="bg-blue-50 border-blue-200">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>TAHC Compliance:</strong> Registered livestock transactions are Texas-only. You must provide identification, health, and transport disclosures.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="species-id" className="text-base font-semibold">
            Species <span className="text-destructive">*</span>
          </Label>
          <SearchableSelect
            value={(attributes as Partial<WildlifeAttributes>).speciesId || null}
            onChange={(value) => updateAttribute('speciesId', value)}
            options={EXOTIC_SPECIES_OPTIONS}
            placeholder="Select species…"
            searchPlaceholder="Search species…"
          />
          <p className="text-xs text-muted-foreground">
            Note: Whitetail deer must be listed under "Whitetail Breeder" category.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-base font-semibold">Group or individual</Label>
          <RadioGroup
            value={(attributes as Partial<WildlifeAttributes>).quantityMode || 'individual'}
            onValueChange={(v: 'group' | 'individual') => updateAttribute('quantityMode', v)}
            className="flex flex-col gap-2"
          >
            <div className="flex items-start space-x-3 rounded-lg border p-3">
              <RadioGroupItem value="individual" id="wildlife-qty-individual" className="mt-0.5" />
              <Label htmlFor="wildlife-qty-individual" className="cursor-pointer flex-1">
                <div className="font-medium">Individual</div>
                <div className="text-sm text-muted-foreground">Buyers may choose how many to purchase.</div>
              </Label>
            </div>
            <div className="flex items-start space-x-3 rounded-lg border p-3">
              <RadioGroupItem value="group" id="wildlife-qty-group" className="mt-0.5" />
              <Label htmlFor="wildlife-qty-group" className="cursor-pointer flex-1">
                <div className="font-medium">Group</div>
                <div className="text-sm text-muted-foreground">This is a group listing. All will be purchased together for the listed price.</div>
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="wildlife-sex" className="text-base font-semibold">
            Sex <span className="text-destructive">*</span>
          </Label>
          <Select
            value={(attributes as Partial<WildlifeAttributes>).sex || 'unknown'}
            onValueChange={(value) => updateAttribute('sex', value)}
          >
            <SelectTrigger
              id="wildlife-sex"
              className={cn(
                'min-h-[48px]',
                hasError('Sex') && 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background'
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="wildlife-age" className="text-base font-semibold">Age (years, optional)</Label>
          <Input
            id="wildlife-age"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            placeholder="e.g., 3 or 5.5"
            value={(() => {
              const v = (attributes as Partial<WildlifeAttributes>).age as any;
              return typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
            })()}
            onChange={(e) => {
              const raw = e.target.value;
              if (!raw) {
                updateAttribute('age', undefined);
                return;
              }
              const n = Number(raw);
              updateAttribute('age', Number.isFinite(n) ? n : undefined);
            }}
            className="min-h-[48px] text-base"
          />
          <p className="text-xs text-muted-foreground">Numbers only (decimals ok). Stored as a number for filtering.</p>
        </div>

        <div className="space-y-2">
          <Label className="text-base font-semibold">
            Quantity by sex <span className="text-destructive">*</span>
          </Label>
          <p className="text-xs text-muted-foreground">
            Enter how many male and female.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="wildlife-qty-male" className="text-sm font-medium text-muted-foreground">Male</Label>
              <Input
                id="wildlife-qty-male"
                type="number"
                min={0}
                value={typeof (attributes as Partial<WildlifeAttributes>).quantityMale === 'number' ? (attributes as Partial<WildlifeAttributes>).quantityMale : ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
                  const curr = attributes as Partial<WildlifeAttributes>;
                  const next = { ...curr, quantityMale: v, quantityFemale: curr.quantityFemale ?? 0 };
                  const total = (Number(next.quantityMale) || 0) + (Number(next.quantityFemale) || 0);
                  onChange({ ...next, quantity: total });
                }}
                className={cn('min-h-[48px] text-base', hasError('Quantity (must be at least 1)') && 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background')}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="wildlife-qty-female" className="text-sm font-medium text-muted-foreground">Female</Label>
              <Input
                id="wildlife-qty-female"
                type="number"
                min={0}
                value={typeof (attributes as Partial<WildlifeAttributes>).quantityFemale === 'number' ? (attributes as Partial<WildlifeAttributes>).quantityFemale : ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
                  const curr = attributes as Partial<WildlifeAttributes>;
                  const next = { ...curr, quantityFemale: v, quantityMale: curr.quantityMale ?? 0 };
                  const total = (Number(next.quantityMale) || 0) + (Number(next.quantityFemale) || 0);
                  onChange({ ...next, quantity: total });
                }}
                className={cn('min-h-[48px] text-base', hasError('Quantity (must be at least 1)') && 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background')}
              />
            </div>
          </div>
          <p className="text-sm font-medium text-foreground">
            Total: {(attributes as Partial<WildlifeAttributes>).quantity ?? 0}
          </p>
          {hasError('Quantity (must be at least 1)') ? <p className="text-sm text-destructive">Total quantity must be at least 1</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="wildlife-location-type" className="text-base font-semibold">Location Type (Optional)</Label>
          <Select
            value={(attributes as Partial<WildlifeAttributes>).locationType || ''}
            onValueChange={(value) => updateAttribute('locationType', value)}
          >
            <SelectTrigger id="wildlife-location-type" className="min-h-[48px]">
              <SelectValue placeholder="Select location type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="seller_location">Seller Location</SelectItem>
              <SelectItem value="facility">Facility</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="wildlife-health-notes" className="text-base font-semibold">Health Notes (Optional)</Label>
          <Textarea
            id="wildlife-health-notes"
            placeholder="Any health information or notes"
            value={(attributes as Partial<WildlifeAttributes>).healthNotes || ''}
            onChange={(e) => updateAttribute('healthNotes', e.target.value)}
            className="min-h-[100px] text-base"
          />
        </div>

        {/* Disclosures are now handled in the final seller acknowledgment step, not in the attributes form */}
      </div>
    );
  }

  if (category === 'cattle_livestock') {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="breed" className="text-base font-semibold">
            Breed <span className="text-destructive">*</span>
          </Label>
          <SearchableSelect
            value={(attributes as any)?.breed || null}
            onChange={(v) => updateAttribute('breed', v)}
            options={CATTLE_BREED_OPTIONS}
            placeholder="Select breed…"
            searchPlaceholder="Search breeds…"
            buttonClassName={cn(
              hasError('Breed') ? 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background' : ''
            )}
          />
          {String((attributes as any)?.breed || '') === 'other' ? (
            <div className="mt-2 space-y-2">
              <Label htmlFor="cattle-breed-other" className="text-sm font-semibold">
                Breed (Other) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cattle-breed-other"
                placeholder="Type the breed"
                value={(attributes as any)?.breedOther || ''}
                onChange={(e) => updateAttribute('breedOther', e.target.value)}
                className={cn(
                  'min-h-[48px] text-base',
                  hasError('Breed') ? 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background' : ''
                )}
              />
            </div>
          ) : null}
          {hasError('Breed') ? <p className="text-sm text-destructive">Breed is required</p> : null}
        </div>

        <div className="space-y-2">
          <Label className="text-base font-semibold">Group or individual</Label>
          <RadioGroup
            value={(attributes as Partial<CattleAttributes>).quantityMode || 'individual'}
            onValueChange={(v: 'group' | 'individual') => updateAttribute('quantityMode', v)}
            className="flex flex-col gap-2"
          >
            <div className="flex items-start space-x-3 rounded-lg border p-3">
              <RadioGroupItem value="individual" id="cattle-qty-individual" className="mt-0.5" />
              <Label htmlFor="cattle-qty-individual" className="cursor-pointer flex-1">
                <div className="font-medium">Individual</div>
                <div className="text-sm text-muted-foreground">Buyers may choose how many to purchase.</div>
              </Label>
            </div>
            <div className="flex items-start space-x-3 rounded-lg border p-3">
              <RadioGroupItem value="group" id="cattle-qty-group" className="mt-0.5" />
              <Label htmlFor="cattle-qty-group" className="cursor-pointer flex-1">
                <div className="font-medium">Group</div>
                <div className="text-sm text-muted-foreground">This is a group listing. All will be purchased together for the listed price.</div>
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label className="text-base font-semibold">
            Quantity by sex <span className="text-destructive">*</span>
          </Label>
          <p className="text-xs text-muted-foreground">
            Enter the number of head for each sex in this listing (e.g. 5 bulls, 5 heifers).
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: 'quantityBull' as const, label: 'Bull', id: 'cattle-qty-bull' },
              { key: 'quantityCow' as const, label: 'Cow', id: 'cattle-qty-cow' },
              { key: 'quantityHeifer' as const, label: 'Heifer', id: 'cattle-qty-heifer' },
              { key: 'quantitySteer' as const, label: 'Steer', id: 'cattle-qty-steer' },
            ].map(({ key, label, id }) => {
              const c = attributes as Partial<CattleAttributes>;
              const val = c[key] ?? 0;
              return (
                <div key={key} className="space-y-1">
                  <Label htmlFor={id} className="text-sm font-medium text-muted-foreground">
                    {label}
                  </Label>
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    value={typeof val === 'number' && val >= 0 ? val : ''}
                    onChange={(e) => {
                      const v = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
                      const curr = attributes as Partial<CattleAttributes>;
                      const next = { ...curr, [key]: v };
                      const total =
                        (Number(next.quantityBull) || 0) +
                        (Number(next.quantityCow) || 0) +
                        (Number(next.quantityHeifer) || 0) +
                        (Number(next.quantitySteer) || 0);
                      onChange({ ...next, quantity: total });
                    }}
                    className={cn(
                      'min-h-[48px] text-base',
                      hasError('Quantity (must be at least 1)') &&
                        'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background'
                    )}
                  />
                </div>
              );
            })}
          </div>
          <p className="text-sm font-medium text-foreground">
            Total: {(attributes as Partial<CattleAttributes>).quantity ?? 0} head
          </p>
          {hasError('Quantity (must be at least 1)') ? (
            <p className="text-sm text-destructive">Total quantity must be at least 1</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="cattle-sex" className="text-base font-semibold">
            Primary sex <span className="text-muted-foreground font-normal">(for search when all same)</span>
          </Label>
          <Select
            value={(attributes as Partial<CattleAttributes>).sex || 'unknown'}
            onValueChange={(value) => updateAttribute('sex', value)}
          >
            <SelectTrigger
              id="cattle-sex"
              className={cn(
                'min-h-[48px]',
                hasError('Sex') && 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background'
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bull">Bull</SelectItem>
              <SelectItem value="cow">Cow</SelectItem>
              <SelectItem value="heifer">Heifer</SelectItem>
              <SelectItem value="steer">Steer</SelectItem>
              <SelectItem value="unknown">Unknown / Mixed</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Used for filtering when all head are the same sex; use &quot;Unknown / Mixed&quot; when you have more than one sex above.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cattle-age" className="text-base font-semibold">Age (years, optional)</Label>
          <Input
            id="cattle-age"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.1"
            placeholder="e.g., 3 or 5.5"
            value={(() => {
              const v = (attributes as Partial<CattleAttributes>).age as any;
              return typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
            })()}
            onChange={(e) => {
              const raw = e.target.value;
              if (!raw) {
                updateAttribute('age', undefined);
                return;
              }
              const n = Number(raw);
              updateAttribute('age', Number.isFinite(n) ? n : undefined);
            }}
            className="min-h-[48px] text-base"
          />
          <p className="text-xs text-muted-foreground">Numbers only (decimals ok). Stored as a number for filtering.</p>
        </div>

        <div className="space-y-2">
          <div className={cn('flex items-start space-x-3 min-h-[44px]', hasError('Registered') && 'rounded-lg border-2 border-destructive p-3')}>
            <Checkbox
              id="registered"
              checked={(attributes as Partial<CattleAttributes>).registered || false}
              onCheckedChange={(checked) => updateAttribute('registered', checked)}
              className={hasError('Registered') ? 'border-destructive' : ''}
            />
            <Label htmlFor="registered" className="cursor-pointer flex-1">
              <div className="font-medium mb-1">
                Registered <span className="text-destructive">*</span>
              </div>
              <div className="text-sm text-muted-foreground">
                This animal has official registration papers
              </div>
            </Label>
          </div>
          {hasError('Registered') ? <p className="text-sm text-destructive">Please confirm registered yes/no</p> : null}
        </div>

        {(attributes as Partial<CattleAttributes>).registered && (
          <div className="space-y-2">
            <Label htmlFor="registration-number" className="text-base font-semibold">Registration Number (Optional)</Label>
            <Input
              id="registration-number"
              placeholder="Registration number"
              value={(attributes as Partial<CattleAttributes>).registrationNumber || ''}
              onChange={(e) => updateAttribute('registrationNumber', e.target.value)}
              className="min-h-[48px] text-base"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="weight-range" className="text-base font-semibold">Weight Range (Optional)</Label>
          <Input
            id="weight-range"
            placeholder="e.g., 1100-1250 lbs"
            value={(attributes as Partial<CattleAttributes>).weightRange || ''}
            onChange={(e) => updateAttribute('weightRange', e.target.value)}
            className="min-h-[48px] text-base"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-start space-x-3 min-h-[44px]">
            <Checkbox
              id="preg-checked"
              checked={(attributes as Partial<CattleAttributes>).pregChecked || false}
              onCheckedChange={(checked) => updateAttribute('pregChecked', checked)}
            />
            <Label htmlFor="preg-checked" className="cursor-pointer flex-1">
              <div className="font-medium mb-1">Pregnancy Checked</div>
              <div className="text-sm text-muted-foreground">
                This animal has been pregnancy checked
              </div>
            </Label>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cattle-health-notes" className="text-base font-semibold">Health Notes (Optional)</Label>
          <Textarea
            id="cattle-health-notes"
            placeholder="Any health information or notes"
            value={(attributes as Partial<CattleAttributes>).healthNotes || ''}
            onChange={(e) => updateAttribute('healthNotes', e.target.value)}
            className="min-h-[100px] text-base"
          />
        </div>

        {/* Disclosures are now handled in the final seller acknowledgment step, not in the attributes form */}
      </div>
    );
  }

  if (category === 'sporting_working_dogs') {
    return (
      <div className="space-y-4">
        <Alert className="bg-blue-50 border-blue-200">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Sporting &amp; Working Dogs:</strong> Texas-only transfers apply on this platform. Provide accurate details and required disclosures.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label className="text-base font-semibold">
            Species <span className="text-destructive">*</span>
          </Label>
          <Input value="Dog" disabled className="min-h-[48px] text-base bg-muted" />
          <p className="text-xs text-muted-foreground">Species is fixed as Dog for this category.</p>
        </div>

        <div className="space-y-2">
          <Label className="text-base font-semibold">Group or individual</Label>
          <RadioGroup
            value={(attributes as Partial<SportingWorkingDogAttributes>).quantityMode || 'individual'}
            onValueChange={(v: 'group' | 'individual') => updateAttribute('quantityMode', v)}
            className="flex flex-col gap-2"
          >
            <div className="flex items-start space-x-3 rounded-lg border p-3">
              <RadioGroupItem value="individual" id="dog-qty-individual" className="mt-0.5" />
              <Label htmlFor="dog-qty-individual" className="cursor-pointer flex-1">
                <div className="font-medium">Individual</div>
                <div className="text-sm text-muted-foreground">Buyers may choose how many to purchase.</div>
              </Label>
            </div>
            <div className="flex items-start space-x-3 rounded-lg border p-3">
              <RadioGroupItem value="group" id="dog-qty-group" className="mt-0.5" />
              <Label htmlFor="dog-qty-group" className="cursor-pointer flex-1">
                <div className="font-medium">Group</div>
                <div className="text-sm text-muted-foreground">This is a group listing. All will be purchased together for the listed price.</div>
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dog-sex" className="text-base font-semibold">
            Sex <span className="text-destructive">*</span>
          </Label>
          <Select
            value={(attributes as Partial<SportingWorkingDogAttributes>).sex || 'unknown'}
            onValueChange={(value) => updateAttribute('sex', value)}
          >
            <SelectTrigger
              id="dog-sex"
              className={cn(
                'min-h-[48px]',
                hasError('Sex') ? 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background' : ''
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Male</SelectItem>
              <SelectItem value="female">Female</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
          {hasError('Sex') ? <p className="text-sm text-destructive">Sex selection is required</p> : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="dog-breed" className="text-base font-semibold">
              Breed <span className="text-destructive">*</span>
            </Label>
            <SearchableSelect
              value={(attributes as any)?.breed || null}
              onChange={(v) => updateAttribute('breed', v)}
              options={DOG_BREED_OPTIONS}
              placeholder="Select breed…"
              searchPlaceholder="Search breeds…"
              buttonClassName={cn(
                hasError('Breed') ? 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background' : ''
              )}
            />
            {String((attributes as any)?.breed || '') === 'other' ? (
              <div className="mt-2 space-y-2">
                <Label htmlFor="dog-breed-other" className="text-sm font-semibold">
                  Breed (Other) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="dog-breed-other"
                  placeholder="Type the breed"
                  value={(attributes as any)?.breedOther || ''}
                  onChange={(e) => updateAttribute('breedOther', e.target.value)}
                  className={cn(
                    'min-h-[48px] text-base',
                    hasError('Breed') ? 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background' : ''
                  )}
                />
              </div>
            ) : null}
            {hasError('Breed') ? <p className="text-sm text-destructive">Breed is required</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="dog-age" className="text-base font-semibold">
              Age (years, optional)
            </Label>
            <Input
              id="dog-age"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              placeholder="e.g., 1.5"
              value={(() => {
                const v = (attributes as Partial<SportingWorkingDogAttributes>).age as any;
                return typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
              })()}
              onChange={(e) => {
                const raw = e.target.value;
                if (!raw) {
                  updateAttribute('age', undefined);
                  return;
                }
                const n = Number(raw);
                updateAttribute('age', Number.isFinite(n) ? n : undefined);
              }}
              className="min-h-[48px] text-base"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dog-training" className="text-base font-semibold">Training / Notes (optional)</Label>
          <Textarea
            id="dog-training"
            placeholder="Training level, titles, work history, temperament, etc."
            value={(attributes as any)?.trainingDescription || ''}
            onChange={(e) => updateAttribute('trainingDescription', e.target.value)}
            className="min-h-[120px] text-base"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-base font-semibold">
            Quantity by sex <span className="text-destructive">*</span>
          </Label>
          <p className="text-xs text-muted-foreground">
            Enter how many male and female.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="dog-qty-male" className="text-sm font-medium text-muted-foreground">Male</Label>
              <Input
                id="dog-qty-male"
                type="number"
                min={0}
                value={typeof (attributes as Partial<SportingWorkingDogAttributes>).quantityMale === 'number' ? (attributes as Partial<SportingWorkingDogAttributes>).quantityMale : ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
                  const curr = attributes as Partial<SportingWorkingDogAttributes>;
                  const next = { ...curr, quantityMale: v, quantityFemale: curr.quantityFemale ?? 0 };
                  const total = (Number(next.quantityMale) || 0) + (Number(next.quantityFemale) || 0);
                  onChange({ ...next, quantity: total });
                }}
                className={cn('min-h-[48px] text-base', hasError('Quantity') && 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background')}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dog-qty-female" className="text-sm font-medium text-muted-foreground">Female</Label>
              <Input
                id="dog-qty-female"
                type="number"
                min={0}
                value={typeof (attributes as Partial<SportingWorkingDogAttributes>).quantityFemale === 'number' ? (attributes as Partial<SportingWorkingDogAttributes>).quantityFemale : ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
                  const curr = attributes as Partial<SportingWorkingDogAttributes>;
                  const next = { ...curr, quantityFemale: v, quantityMale: curr.quantityMale ?? 0 };
                  const total = (Number(next.quantityMale) || 0) + (Number(next.quantityFemale) || 0);
                  onChange({ ...next, quantity: total });
                }}
                className={cn('min-h-[48px] text-base', hasError('Quantity') && 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background')}
              />
            </div>
          </div>
          <p className="text-sm font-medium text-foreground">
            Total: {(attributes as Partial<SportingWorkingDogAttributes>).quantity ?? 0}
          </p>
          {hasError('Quantity') ? <p className="text-sm text-destructive">Total quantity must be at least 1</p> : null}
        </div>

        {/* Disclosures are now handled in the final seller acknowledgment step, not in the attributes form */}
      </div>
    );
  }

  if (category === 'ranch_equipment' || category === 'ranch_vehicles' || category === 'hunting_outfitter_assets') {
    const equipmentType = (attributes as Partial<EquipmentAttributes>).equipmentType;
    const makeOptions = getEquipmentMakeOptions({ category, equipmentType: equipmentType || null });
    const modelSuggestions = getEquipmentModelSuggestions({
      category,
      equipmentType: equipmentType || null,
      make: String((attributes as any)?.make || '') || null,
    });
    const modelListId = `equipment-models-${category}-${String(equipmentType || 'none')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '-')}-${String((attributes as any)?.make || 'none')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '-')}`;
    const vehiclesRequiringTitle = ['utv', 'atv', 'trailer', 'truck'];
    const requiresTitle = equipmentType && vehiclesRequiringTitle.includes(equipmentType.toLowerCase());
    const legacyVehicleTypes = ['truck', 'utv', 'atv', 'trailer'];
    const legacyVehicleSelected =
      category === 'ranch_equipment' &&
      typeof equipmentType === 'string' &&
      legacyVehicleTypes.includes(equipmentType.toLowerCase());

    return (
      <div className="space-y-4">
        {category === 'ranch_vehicles' ? (
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>Ranch Vehicles &amp; Trailers:</strong> Ranch-use vehicles and transport equipment (trucks, UTVs, stock trailers, goosenecks, flatbeds, utility trailers).
            </AlertDescription>
          </Alert>
        ) : category === 'hunting_outfitter_assets' ? (
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>Hunting &amp; Outfitter Assets:</strong> Property assets like camera systems, blinds, and water/well systems (not vehicles).
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="bg-blue-50 border-blue-200">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>Ranch Equipment &amp; Attachments:</strong> Tractors, skid steers, machinery, and attachments/implements. Vehicles and trailers are listed separately under Ranch Vehicles &amp; Trailers.
            </AlertDescription>
          </Alert>
        )}
        <div className="space-y-2">
          <Label htmlFor="equipment-type" className="text-base font-semibold">
            {category === 'ranch_vehicles'
              ? 'Vehicle / Trailer Type'
              : category === 'hunting_outfitter_assets'
                ? 'Asset Type'
                : 'Equipment / Attachment Type'}{' '}
            <span className="text-destructive">*</span>
          </Label>
          <Select
            value={equipmentType || ''}
            onValueChange={(value) => updateAttribute('equipmentType', value)}
          >
            <SelectTrigger
              id="equipment-type"
              className={cn(
                'min-h-[48px]',
                hasError('Equipment Type') && 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background'
              )}
            >
              <SelectValue placeholder="Select equipment type" />
            </SelectTrigger>
            <SelectContent>
              {category === 'ranch_vehicles' ? (
                <>
                  <SelectItem value="truck">Truck</SelectItem>
                  <SelectItem value="utv">UTV</SelectItem>
                  <SelectItem value="atv">ATV</SelectItem>
                  <SelectItem value="stock_trailer">Stock Trailer</SelectItem>
                  <SelectItem value="gooseneck_trailer">Gooseneck Trailer</SelectItem>
                  <SelectItem value="flatbed_trailer">Flatbed Trailer</SelectItem>
                  <SelectItem value="utility_trailer">Utility Trailer</SelectItem>
                  <SelectItem value="dump_trailer">Dump Trailer</SelectItem>
                  <SelectItem value="horse_trailer">Horse Trailer</SelectItem>
                  <SelectItem value="equipment_trailer">Equipment Trailer</SelectItem>
                  <SelectItem value="trailer">Trailer (other)</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </>
              ) : category === 'hunting_outfitter_assets' ? (
                <>
                  <SelectItem value="camera_system">Camera System</SelectItem>
                  <SelectItem value="surveillance_system">Surveillance System</SelectItem>
                  <SelectItem value="thermal_optics">Thermal / Optics</SelectItem>
                  <SelectItem value="blind">Blind (tower / box / enclosure)</SelectItem>
                  <SelectItem value="water_system">Water / Well System</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value="tractor">Tractor</SelectItem>
                  <SelectItem value="skidsteer">Skid Steer</SelectItem>
                  <SelectItem value="attachment">Attachment</SelectItem>
                  <SelectItem value="implement">Implement</SelectItem>
                  <SelectItem value="baler">Baler</SelectItem>
                  <SelectItem value="brush_cutter">Brush Cutter</SelectItem>
                  <SelectItem value="shredder">Shredder</SelectItem>
                  <SelectItem value="plow">Plow</SelectItem>
                  <SelectItem value="disc">Disc</SelectItem>
                  <SelectItem value="sprayer">Sprayer</SelectItem>
                  <SelectItem value="post_hole_digger">Post Hole Digger</SelectItem>
                  <SelectItem value="auger">Auger</SelectItem>
                  <SelectItem value="grapple">Grapple</SelectItem>
                  <SelectItem value="bucket">Bucket</SelectItem>
                  <SelectItem value="forks">Forks</SelectItem>
                  <SelectItem value="feeder">Feeder</SelectItem>
                  <SelectItem value="fencing">Fencing</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                  {legacyVehicleSelected ? (
                    <>
                      <SelectItem value="truck">Truck (legacy — consider moving to Vehicles)</SelectItem>
                      <SelectItem value="utv">UTV (legacy — consider moving to Vehicles)</SelectItem>
                      <SelectItem value="atv">ATV (legacy — consider moving to Vehicles)</SelectItem>
                      <SelectItem value="trailer">Trailer (legacy — consider moving to Vehicles)</SelectItem>
                    </>
                  ) : null}
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="make" className="text-base font-semibold">Make (Optional)</Label>
            <SearchableSelect
              value={(attributes as any)?.make || null}
              onChange={(v) => updateAttribute('make', v)}
              options={makeOptions}
              placeholder="Select make…"
              searchPlaceholder="Search makes…"
            />
            {String((attributes as any)?.make || '') === 'other' ? (
              <div className="mt-2 space-y-2">
                <Label htmlFor="equipment-make-other" className="text-sm font-semibold">
                  Make (Other)
                </Label>
                <Input
                  id="equipment-make-other"
                  placeholder="Type the make"
                  value={(attributes as any)?.makeOther || ''}
                  onChange={(e) => updateAttribute('makeOther', e.target.value)}
                  className="min-h-[48px] text-base"
                />
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="model" className="text-base font-semibold">Model (Optional)</Label>
            <Input
              id="model"
              placeholder="e.g., 5075E, SVL75"
              list={modelSuggestions.length > 0 ? modelListId : undefined}
              value={(attributes as Partial<EquipmentAttributes>).model || ''}
              onChange={(e) => updateAttribute('model', e.target.value)}
              className="min-h-[48px] text-base"
            />
            {modelSuggestions.length > 0 ? (
              <datalist id={modelListId}>
                {modelSuggestions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="year" className="text-base font-semibold">Year (Optional)</Label>
            <Input
              id="year"
              type="number"
              placeholder="e.g., 2020"
              min="1900"
              max={new Date().getFullYear() + 1}
              value={(attributes as Partial<EquipmentAttributes>).year || ''}
              onChange={(e) => updateAttribute('year', e.target.value ? parseInt(e.target.value) : undefined)}
              className="min-h-[48px] text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hours" className="text-base font-semibold">Hours (Optional)</Label>
            <Input
              id="hours"
              type="number"
              placeholder="e.g., 500"
              min="0"
              value={(attributes as Partial<EquipmentAttributes>).hours || ''}
              onChange={(e) => updateAttribute('hours', e.target.value ? parseInt(e.target.value) : undefined)}
              className="min-h-[48px] text-base"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="equipment-condition" className="text-base font-semibold">
            Condition <span className="text-destructive">*</span>
          </Label>
          <Select
            value={(attributes as Partial<EquipmentAttributes>).condition || 'good'}
            onValueChange={(value) => updateAttribute('condition', value)}
          >
            <SelectTrigger
              id="equipment-condition"
              className={cn(
                'min-h-[48px]',
                hasError('Condition') && 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background'
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="excellent">Excellent</SelectItem>
              <SelectItem value="good">Good</SelectItem>
              <SelectItem value="fair">Fair</SelectItem>
              <SelectItem value="for_parts">For Parts</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="serial-number" className="text-base font-semibold">Serial Number (Optional)</Label>
          <Input
            id="serial-number"
            placeholder="Serial number"
            value={(attributes as Partial<EquipmentAttributes>).serialNumber || ''}
            onChange={(e) => updateAttribute('serialNumber', e.target.value)}
            className="min-h-[48px] text-base"
          />
        </div>

        {requiresTitle && (
          <div
            className={cn(
              'space-y-4 p-4 border rounded-lg bg-muted/50',
              (hasError('Has Title') || hasError('VIN or Serial Number')) && 'border-destructive border-2'
            )}
          >
            <Label className="text-base font-semibold">
              Title & VIN Information <span className="text-destructive">*</span>
            </Label>
            {(hasError('Has Title') || hasError('VIN or Serial Number')) ? (
              <p className="text-sm text-destructive">Title + VIN are required for this equipment type</p>
            ) : null}
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="has-title"
                  checked={(attributes as Partial<EquipmentAttributes>).hasTitle || false}
                  onCheckedChange={(checked) => updateAttribute('hasTitle', checked)}
                  className={hasError('Has Title') ? 'border-destructive' : ''}
                />
                <Label htmlFor="has-title" className="cursor-pointer flex-1">
                  <div className="font-medium mb-1">Has Title</div>
                  <div className="text-sm text-muted-foreground">
                    I confirm that this vehicle has a valid title
                  </div>
                </Label>
              </div>
              <div className="space-y-2">
                <Label htmlFor="vin-serial" className="text-base font-semibold">
                  VIN or Serial Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="vin-serial"
                  placeholder="Enter VIN or Serial Number"
                  value={(attributes as Partial<EquipmentAttributes>).vinOrSerial || ''}
                  onChange={(e) => updateAttribute('vinOrSerial', e.target.value)}
                  className={cn(
                    'min-h-[48px] text-base',
                    hasError('VIN or Serial Number') && 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background'
                  )}
                  required={requiresTitle}
                />
                {hasError('VIN or Serial Number') ? (
                  <p className="text-sm text-destructive">VIN or Serial Number is required</p>
                ) : null}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="equipment-quantity" className="text-base font-semibold">
            Quantity <span className="text-destructive">*</span>
          </Label>
          <Input
            id="equipment-quantity"
            type="number"
            min="1"
            value={(attributes as Partial<EquipmentAttributes>).quantity || 1}
            onChange={(e) => updateAttribute('quantity', parseInt(e.target.value) || 1)}
            className={cn(
              'min-h-[48px] text-base',
              hasError('Quantity (must be at least 1)') && 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background'
            )}
            required
          />
          {hasError('Quantity (must be at least 1)') ? <p className="text-sm text-destructive">Quantity must be at least 1</p> : null}
        </div>
      </div>
    );
  }

  return null;
}
