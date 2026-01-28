'use client';

import { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { FilterState, ListingType } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  BROWSE_CATEGORIES_FOR_DISPLAY as categories,
  BROWSE_TYPES as types,
  BROWSE_STATES as states,
  BROWSE_EQUIPMENT_CONDITION_OPTIONS as equipmentConditionOptions,
  BROWSE_SPECIES as species,
  BROWSE_QUANTITY_OPTIONS as quantityOptions,
  DELIVERY_TIMEFRAME_OPTIONS as deliveryTimeframeOptions,
} from '@/components/browse/filters/constants';

interface MobileBrowseFilterSheetProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  className?: string;
}

function countActiveFilters(filters: FilterState): number {
  return (
    (filters.category ? 1 : 0) +
    (filters.type ? 1 : 0) +
    (filters.location?.state ? 1 : 0) +
    (filters.location?.city ? 1 : 0) +
    (filters.minPrice !== undefined ? 1 : 0) +
    (filters.maxPrice !== undefined ? 1 : 0) +
    (filters.species?.length || 0) +
    (filters.quantity ? 1 : 0) +
    (filters.category === 'ranch_equipment' || filters.category === 'ranch_vehicles' || filters.category === 'hunting_outfitter_assets'
      ? (filters.healthStatus?.length || 0)
      : 0) +
    (filters.papers !== undefined ? 1 : 0) +
    (filters.verifiedSeller ? 1 : 0) +
    (filters.transportReady ? 1 : 0) +
    (filters.deliveryTimeframe ? 1 : 0) +
    (filters.endingSoon ? 1 : 0) +
    (filters.newlyListed ? 1 : 0) +
    (filters.featured ? 1 : 0)
  );
}

export function MobileBrowseFilterSheet({ filters, onFiltersChange, className }: MobileBrowseFilterSheetProps) {
  const [open, setOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<FilterState>(filters);

  useEffect(() => {
    if (!open) setLocalFilters(filters);
  }, [filters, open]);

  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);
  const showSpeciesFilter =
    !localFilters.category ||
    localFilters.category === 'wildlife_exotics' ||
    localFilters.category === 'whitetail_breeder';
  const showConditionFilter =
    localFilters.category === 'ranch_equipment' ||
    localFilters.category === 'ranch_vehicles' ||
    localFilters.category === 'hunting_outfitter_assets';

  const handleApply = () => {
    onFiltersChange(localFilters);
    setOpen(false);
  };

  const handleReset = () => {
    // Include `type` key (as undefined) so Browse can reliably reset the top tabs to "All".
    const resetFilters: FilterState = { type: undefined };
    setLocalFilters(resetFilters);
    onFiltersChange(resetFilters);
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'h-10 px-3 rounded-full font-semibold gap-2 whitespace-nowrap',
            activeFilterCount > 0 && 'border-primary bg-primary/5',
            className
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filter
          {activeFilterCount > 0 ? (
            <span className="ml-0.5 rounded-full bg-primary text-primary-foreground text-xs px-1.5 py-0.5 min-w-[20px] text-center">
              {activeFilterCount}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[92vw] sm:max-w-md p-0">
        <div className="px-4 pt-5 pb-4 border-b border-border/50">
          <SheetHeader>
            <SheetTitle>Filter</SheetTitle>
            <SheetDescription>Refine results like eBay: fast, clear, and focused.</SheetDescription>
          </SheetHeader>
        </div>

        <div className="px-4 py-4 space-y-6">
          {/* Category */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Category</Label>
            <Select
              value={localFilters.category || '__any__'}
              onValueChange={(v) =>
                setLocalFilters((p) => ({
                  ...p,
                  category: v === '__any__' ? undefined : (v as any),
                }))
              }
            >
              <SelectTrigger className="min-h-[44px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Listing Type */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Listing Type</Label>
            <RadioGroup
              value={localFilters.type || ''}
              onValueChange={(value) => setLocalFilters((p) => ({ ...p, type: value ? (value as ListingType) : undefined }))}
              className="space-y-2"
            >
              {types.map((t) => (
                <div key={t.value} className="flex items-center gap-3 min-h-[40px]">
                  <RadioGroupItem value={t.value} id={`m-type-${t.value}`} />
                  <Label htmlFor={`m-type-${t.value}`} className="text-sm font-normal cursor-pointer flex-1">
                    {t.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Location */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Item Location</Label>
            <SearchableSelect
              value={localFilters.location?.state || null}
              onChange={(v) =>
                setLocalFilters((p) => ({
                  ...p,
                  location: { ...(p.location || {}), state: v === '__any__' ? undefined : v },
                }))
              }
              options={[{ value: '__any__', label: 'Any state' }, ...states]}
              placeholder="State"
              searchPlaceholder="Search states…"
              buttonClassName="min-h-[44px]"
            />
          </div>

          {/* Price */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Price</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="m-minPrice" className="text-xs text-muted-foreground">
                  Min
                </Label>
                <Input
                  id="m-minPrice"
                  type="number"
                  inputMode="numeric"
                  placeholder="0"
                  value={localFilters.minPrice ?? ''}
                  onChange={(e) => {
                    const n = e.target.value ? Number(e.target.value) : undefined;
                    setLocalFilters((p) => ({ ...p, minPrice: n && n > 0 ? n : undefined }));
                  }}
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-maxPrice" className="text-xs text-muted-foreground">
                  Max
                </Label>
                <Input
                  id="m-maxPrice"
                  type="number"
                  inputMode="numeric"
                  placeholder="No limit"
                  value={localFilters.maxPrice ?? ''}
                  onChange={(e) => {
                    const n = e.target.value ? Number(e.target.value) : undefined;
                    setLocalFilters((p) => ({ ...p, maxPrice: n && n > 0 ? n : undefined }));
                  }}
                  className="min-h-[44px]"
                />
              </div>
            </div>
          </div>

          {/* Condition (equipment only) */}
          {showConditionFilter ? (
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Condition</Label>
              <Select
                value={(localFilters.healthStatus && localFilters.healthStatus.length ? localFilters.healthStatus[0] : '__any__') as any}
                onValueChange={(v) => setLocalFilters((p) => ({ ...p, healthStatus: v === '__any__' ? undefined : [v] }))}
              >
                <SelectTrigger className="min-h-[44px]">
                  <SelectValue placeholder="Condition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">Any condition</SelectItem>
                  {equipmentConditionOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {/* Species (animals) */}
          {showSpeciesFilter ? (
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Species</Label>
              <SearchableMultiSelect
                values={localFilters.species || []}
                onChange={(vals) => setLocalFilters((p) => ({ ...p, species: vals.length ? vals : undefined }))}
                options={species}
                placeholder="Select species…"
                searchPlaceholder="Search species…"
                buttonClassName="min-h-[44px]"
              />
            </div>
          ) : null}

          {/* Quantity */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Quantity</Label>
            <Select
              value={localFilters.quantity || '__any__'}
              onValueChange={(v) =>
                setLocalFilters((p) => ({
                  ...p,
                  quantity: v === '__any__' ? undefined : (v as any),
                }))
              }
            >
              <SelectTrigger className="min-h-[44px]">
                <SelectValue placeholder="Quantity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">Any quantity</SelectItem>
                {quantityOptions.map((q) => (
                  <SelectItem key={q.value} value={q.value}>
                    {q.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Delivery timeframe */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Delivery timeframe</Label>
            <Select
              value={localFilters.deliveryTimeframe || '__any__'}
              onValueChange={(v) =>
                setLocalFilters((p) => ({
                  ...p,
                  deliveryTimeframe: v === '__any__' ? undefined : v,
                }))
              }
            >
              <SelectTrigger className="min-h-[44px]">
                <SelectValue placeholder="Any" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">Any</SelectItem>
                {deliveryTimeframeOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Toggles */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">More</Label>
            <div className="space-y-2">
              <div className="flex items-center gap-3 min-h-[40px]">
                <Checkbox
                  id="m-verified"
                  checked={Boolean(localFilters.verifiedSeller)}
                  onCheckedChange={(checked) => setLocalFilters((p) => ({ ...p, verifiedSeller: checked ? true : undefined }))}
                />
                <Label htmlFor="m-verified" className="text-sm font-normal cursor-pointer flex-1">
                  Verified seller
                </Label>
              </div>
              <div className="flex items-center gap-3 min-h-[40px]">
                <Checkbox
                  id="m-transport"
                  checked={Boolean(localFilters.transportReady)}
                  onCheckedChange={(checked) => setLocalFilters((p) => ({ ...p, transportReady: checked ? true : undefined }))}
                />
                <Label htmlFor="m-transport" className="text-sm font-normal cursor-pointer flex-1">
                  Transport ready
                </Label>
              </div>
              <div className="flex items-center gap-3 min-h-[40px]">
                <Checkbox
                  id="m-endingSoon"
                  checked={Boolean(localFilters.endingSoon)}
                  onCheckedChange={(checked) =>
                    setLocalFilters((p) => ({
                      ...p,
                      endingSoon: checked ? true : undefined,
                      // Mutual exclusive with newlyListed (eBay-style quick toggle behavior)
                      ...(checked ? { newlyListed: undefined } : {}),
                    }))
                  }
                />
                <Label htmlFor="m-endingSoon" className="text-sm font-normal cursor-pointer flex-1">
                  Ending soon
                </Label>
              </div>
              <div className="flex items-center gap-3 min-h-[40px]">
                <Checkbox
                  id="m-new"
                  checked={Boolean(localFilters.newlyListed)}
                  onCheckedChange={(checked) =>
                    setLocalFilters((p) => ({
                      ...p,
                      newlyListed: checked ? true : undefined,
                      // Mutual exclusive with endingSoon
                      ...(checked ? { endingSoon: undefined } : {}),
                    }))
                  }
                />
                <Label htmlFor="m-new" className="text-sm font-normal cursor-pointer flex-1">
                  Newly listed
                </Label>
              </div>
              <div className="flex items-center gap-3 min-h-[40px]">
                <Checkbox
                  id="m-featured"
                  checked={Boolean(localFilters.featured)}
                  onCheckedChange={(checked) => setLocalFilters((p) => ({ ...p, featured: checked ? true : undefined }))}
                />
                <Label htmlFor="m-featured" className="text-sm font-normal cursor-pointer flex-1">
                  Featured
                </Label>
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 border-t bg-background px-4 py-4 flex gap-3">
          <Button variant="outline" onClick={handleReset} className="flex-1 min-h-[48px]">
            Reset
          </Button>
          <Button onClick={handleApply} className="flex-1 min-h-[48px]">
            Apply
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

