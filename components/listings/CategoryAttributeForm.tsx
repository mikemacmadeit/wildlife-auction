/**
 * Category-specific attribute form fields
 * Renders different fields based on selected category
 */

'use client';

import { ListingCategory, WildlifeAttributes, CattleAttributes, EquipmentAttributes, WhitetailBreederAttributes, EXOTIC_SPECIES } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { getPermitExpirationStatus } from '@/lib/compliance/validation';

type ListingAttributes =
  | WildlifeAttributes
  | CattleAttributes
  | EquipmentAttributes
  | WhitetailBreederAttributes;

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
          <Label htmlFor="whitetail-age" className="text-base font-semibold">Age (Optional)</Label>
          <Input
            id="whitetail-age"
            placeholder="e.g., 3 years, 18 months"
            value={(attributes as Partial<WhitetailBreederAttributes>).age || ''}
            onChange={(e) => updateAttribute('age', e.target.value)}
            className="min-h-[48px] text-base"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="whitetail-quantity" className="text-base font-semibold">
            Quantity <span className="text-destructive">*</span>
          </Label>
          <Input
            id="whitetail-quantity"
            type="number"
            min="1"
            value={(attributes as Partial<WhitetailBreederAttributes>).quantity || 1}
            onChange={(e) => updateAttribute('quantity', parseInt(e.target.value) || 1)}
            className={`min-h-[48px] text-base ${hasError('Quantity (must be at least 1)') ? 'border-destructive border-2 ring-2 ring-destructive/25 ring-offset-2 ring-offset-background' : ''}`}
            required
          />
          {hasError('Quantity (must be at least 1)') && (
            <p className="text-sm text-destructive">Quantity must be at least 1</p>
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
            <strong>TAHC Compliance:</strong> Exotic animal transactions are Texas-only. You must provide identification, health, and transport disclosures.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="species-id" className="text-base font-semibold">
            Species <span className="text-destructive">*</span>
          </Label>
          <Select
            value={(attributes as Partial<WildlifeAttributes>).speciesId || ''}
            onValueChange={(value) => updateAttribute('speciesId', value)}
          >
            <SelectTrigger id="species-id" className="min-h-[48px]">
              <SelectValue placeholder="Select species" />
            </SelectTrigger>
            <SelectContent>
              {EXOTIC_SPECIES.map((species) => (
                <SelectItem key={species} value={species}>
                  {species === 'other_exotic' ? 'Other Exotic (Requires Admin Review)' : species.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Note: Whitetail deer must be listed under "Whitetail Breeder" category
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="wildlife-sex" className="text-base font-semibold">
            Sex <span className="text-destructive">*</span>
          </Label>
          <Select
            value={(attributes as Partial<WildlifeAttributes>).sex || 'unknown'}
            onValueChange={(value) => updateAttribute('sex', value)}
          >
            <SelectTrigger id="wildlife-sex" className="min-h-[48px]">
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
          <Label htmlFor="wildlife-age" className="text-base font-semibold">Age (Optional)</Label>
          <Input
            id="wildlife-age"
            placeholder="e.g., 3 years, 18 months"
            value={(attributes as Partial<WildlifeAttributes>).age || ''}
            onChange={(e) => updateAttribute('age', e.target.value)}
            className="min-h-[48px] text-base"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="wildlife-quantity" className="text-base font-semibold">
            Quantity <span className="text-destructive">*</span>
          </Label>
          <Input
            id="wildlife-quantity"
            type="number"
            min="1"
            value={(attributes as Partial<WildlifeAttributes>).quantity || 1}
            onChange={(e) => updateAttribute('quantity', parseInt(e.target.value) || 1)}
            className="min-h-[48px] text-base"
            required
          />
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

        <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
          <Label className="text-base font-semibold">
            TAHC Compliance Disclosures <span className="text-destructive">*</span>
          </Label>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="animal-id-disclosure"
                checked={(attributes as Partial<WildlifeAttributes>).animalIdDisclosure || false}
                onCheckedChange={(checked) => updateAttribute('animalIdDisclosure', checked)}
              />
              <Label htmlFor="animal-id-disclosure" className="cursor-pointer flex-1">
                <div className="font-medium mb-1">Animal Identification Disclosure</div>
                <div className="text-sm text-muted-foreground">
                  I confirm that animals are properly identified/tagged as required by TAHC regulations
                </div>
              </Label>
            </div>
            <div className="flex items-start space-x-3">
              <Checkbox
                id="health-disclosure"
                checked={(attributes as Partial<WildlifeAttributes>).healthDisclosure || false}
                onCheckedChange={(checked) => updateAttribute('healthDisclosure', checked)}
              />
              <Label htmlFor="health-disclosure" className="cursor-pointer flex-1">
                <div className="font-medium mb-1">Health Disclosure</div>
                <div className="text-sm text-muted-foreground">
                  I acknowledge health disclosure requirements for exotic animals
                </div>
              </Label>
            </div>
            <div className="flex items-start space-x-3">
              <Checkbox
                id="transport-disclosure"
                checked={(attributes as Partial<WildlifeAttributes>).transportDisclosure || false}
                onCheckedChange={(checked) => updateAttribute('transportDisclosure', checked)}
              />
              <Label htmlFor="transport-disclosure" className="cursor-pointer flex-1">
                <div className="font-medium mb-1">Transport Disclosure (Texas-Only)</div>
                <div className="text-sm text-muted-foreground">
                  I confirm that transfer is Texas-only unless otherwise permitted by regulations
                </div>
              </Label>
            </div>
          </div>
        </div>
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
          <Input
            id="breed"
            placeholder="e.g., Angus, Hereford, Texas Longhorn"
            value={(attributes as Partial<CattleAttributes>).breed || ''}
            onChange={(e) => updateAttribute('breed', e.target.value)}
            className="min-h-[48px] text-base"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="cattle-sex" className="text-base font-semibold">
            Sex <span className="text-destructive">*</span>
          </Label>
          <Select
            value={(attributes as Partial<CattleAttributes>).sex || 'unknown'}
            onValueChange={(value) => updateAttribute('sex', value)}
          >
            <SelectTrigger id="cattle-sex" className="min-h-[48px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bull">Bull</SelectItem>
              <SelectItem value="cow">Cow</SelectItem>
              <SelectItem value="heifer">Heifer</SelectItem>
              <SelectItem value="steer">Steer</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cattle-age" className="text-base font-semibold">Age (Optional)</Label>
          <Input
            id="cattle-age"
            placeholder="e.g., 3 years, 18 months"
            value={(attributes as Partial<CattleAttributes>).age || ''}
            onChange={(e) => updateAttribute('age', e.target.value)}
            className="min-h-[48px] text-base"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-start space-x-3 min-h-[44px]">
            <Checkbox
              id="registered"
              checked={(attributes as Partial<CattleAttributes>).registered || false}
              onCheckedChange={(checked) => updateAttribute('registered', checked)}
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
          <Label htmlFor="cattle-quantity" className="text-base font-semibold">
            Quantity <span className="text-destructive">*</span>
          </Label>
          <Input
            id="cattle-quantity"
            type="number"
            min="1"
            value={(attributes as Partial<CattleAttributes>).quantity || 1}
            onChange={(e) => updateAttribute('quantity', parseInt(e.target.value) || 1)}
            className="min-h-[48px] text-base"
            required
          />
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

        <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
          <Label className="text-base font-semibold">
            Compliance Disclosures <span className="text-destructive">*</span>
          </Label>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="identification-disclosure"
                checked={(attributes as Partial<CattleAttributes>).identificationDisclosure || false}
                onCheckedChange={(checked) => updateAttribute('identificationDisclosure', checked)}
              />
              <Label htmlFor="identification-disclosure" className="cursor-pointer flex-1">
                <div className="font-medium mb-1">Identification Disclosure</div>
                <div className="text-sm text-muted-foreground">
                  I confirm that animals have proper ear tags/brand identification as required
                </div>
              </Label>
            </div>
            <div className="flex items-start space-x-3">
              <Checkbox
                id="cattle-health-disclosure"
                checked={(attributes as Partial<CattleAttributes>).healthDisclosure || false}
                onCheckedChange={(checked) => updateAttribute('healthDisclosure', checked)}
              />
              <Label htmlFor="cattle-health-disclosure" className="cursor-pointer flex-1">
                <div className="font-medium mb-1">Health Disclosure</div>
                <div className="text-sm text-muted-foreground">
                  I acknowledge health disclosure requirements for livestock
                </div>
              </Label>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (category === 'ranch_equipment') {
    const equipmentType = (attributes as Partial<EquipmentAttributes>).equipmentType;
    const vehiclesRequiringTitle = ['utv', 'atv', 'trailer', 'truck'];
    const requiresTitle = equipmentType && vehiclesRequiringTitle.includes(equipmentType.toLowerCase());

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="equipment-type" className="text-base font-semibold">
            Equipment Type <span className="text-destructive">*</span>
          </Label>
          <Select
            value={equipmentType || ''}
            onValueChange={(value) => updateAttribute('equipmentType', value)}
          >
            <SelectTrigger id="equipment-type" className="min-h-[48px]">
              <SelectValue placeholder="Select equipment type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tractor">Tractor</SelectItem>
              <SelectItem value="trailer">Trailer</SelectItem>
              <SelectItem value="utv">UTV</SelectItem>
              <SelectItem value="atv">ATV</SelectItem>
              <SelectItem value="skidsteer">Skid Steer</SelectItem>
              <SelectItem value="implement">Implement</SelectItem>
              <SelectItem value="feeder">Feeder</SelectItem>
              <SelectItem value="fencing">Fencing</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="make" className="text-base font-semibold">Make (Optional)</Label>
            <Input
              id="make"
              placeholder="e.g., John Deere, Kubota"
              value={(attributes as Partial<EquipmentAttributes>).make || ''}
              onChange={(e) => updateAttribute('make', e.target.value)}
              className="min-h-[48px] text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model" className="text-base font-semibold">Model (Optional)</Label>
            <Input
              id="model"
              placeholder="e.g., 5075E, SVL75"
              value={(attributes as Partial<EquipmentAttributes>).model || ''}
              onChange={(e) => updateAttribute('model', e.target.value)}
              className="min-h-[48px] text-base"
            />
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
            <SelectTrigger id="equipment-condition" className="min-h-[48px]">
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
          <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
            <Label className="text-base font-semibold">
              Title & VIN Information <span className="text-destructive">*</span>
            </Label>
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="has-title"
                  checked={(attributes as Partial<EquipmentAttributes>).hasTitle || false}
                  onCheckedChange={(checked) => updateAttribute('hasTitle', checked)}
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
                  className="min-h-[48px] text-base"
                  required={requiresTitle}
                />
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
            className="min-h-[48px] text-base"
            required
          />
        </div>
      </div>
    );
  }

  return null;
}
