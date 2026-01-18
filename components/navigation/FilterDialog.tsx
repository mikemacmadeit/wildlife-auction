'use client';

import { useState, useEffect } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { FilterState, ListingType } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  BROWSE_CATEGORIES as categories,
  BROWSE_TYPES as types,
  BROWSE_SPECIES as species,
  BROWSE_STATES as states,
  BROWSE_QUANTITY_OPTIONS as quantityOptions,
  BROWSE_HEALTH_STATUS_OPTIONS as healthStatusOptions,
} from '@/components/browse/filters/constants';

interface FilterDialogProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  className?: string;
}

export function FilterDialog({
  filters,
  onFiltersChange,
  className,
}: FilterDialogProps) {
  const [open, setOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<FilterState>(filters);

  // Sync local filters when external filters change (when dialog is closed)
  useEffect(() => {
    if (!open) {
      setLocalFilters(filters);
    }
  }, [filters, open]);

  const handleApply = () => {
    onFiltersChange(localFilters);
    setOpen(false);
  };

  const handleReset = () => {
    const resetFilters: FilterState = {};
    setLocalFilters(resetFilters);
    onFiltersChange(resetFilters);
    setOpen(false);
  };

  const handleSpeciesChange = (speciesValue: string, checked: boolean) => {
    const currentSpecies = localFilters.species || [];
    if (checked) {
      setLocalFilters({
        ...localFilters,
        species: [...currentSpecies, speciesValue],
      });
    } else {
      setLocalFilters({
        ...localFilters,
        species: currentSpecies.filter(s => s !== speciesValue),
      });
    }
  };

  const handleHealthStatusChange = (status: string, checked: boolean) => {
    const currentStatus = localFilters.healthStatus || [];
    if (checked) {
      setLocalFilters({
        ...localFilters,
        healthStatus: [...currentStatus, status],
      });
    } else {
      setLocalFilters({
        ...localFilters,
        healthStatus: currentStatus.filter(s => s !== status),
      });
    }
  };

  const showSpeciesFilter =
    !localFilters.category ||
    localFilters.category === 'wildlife_exotics' ||
    localFilters.category === 'whitetail_breeder';

  // Count active filters
  const activeFilterCount = 
    (filters.category ? 1 : 0) +
    (filters.type ? 1 : 0) +
    (filters.location?.state ? 1 : 0) +
    (filters.location?.city ? 1 : 0) +
    (filters.minPrice ? 1 : 0) +
    (filters.maxPrice ? 1 : 0) +
    (filters.species?.length || 0) +
    (filters.quantity ? 1 : 0) +
    (filters.healthStatus?.length || 0) +
    (filters.papers ? 1 : 0) +
    (filters.verifiedSeller ? 1 : 0) +
    (filters.transportReady ? 1 : 0) +
    (filters.endingSoon ? 1 : 0) +
    (filters.newlyListed ? 1 : 0) +
    (filters.featured ? 1 : 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'gap-2 min-h-[44px] px-4',
            activeFilterCount > 0 && 'border-primary bg-primary/5',
            className
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 rounded-full bg-primary text-primary-foreground text-xs px-1.5 py-0.5 min-w-[20px]">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 gap-0 overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-border/50 flex-shrink-0">
          <DialogHeader>
            <DialogTitle className="text-2xl">Filter Listings</DialogTitle>
            <DialogDescription>
              Refine your search with detailed filters to find exactly what you're looking for
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="overflow-y-auto px-6 space-y-6 py-6 max-h-[calc(90vh-180px)]">
          {/* Basic Filters - Category & Type */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Basic Filters</h3>
            
            {/* Category Filter */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Category</Label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {categories.map((category) => (
                  <div key={category.value} className="flex items-center space-x-3 min-h-[44px]">
                    <Checkbox
                      id={`category-${category.value}`}
                      checked={localFilters.category === category.value}
                      onCheckedChange={(checked) => {
                        setLocalFilters({
                          ...localFilters,
                          category: checked ? category.value : undefined,
                        });
                      }}
                    />
                    <Label
                      htmlFor={`category-${category.value}`}
                      className="text-sm font-normal cursor-pointer flex-1"
                    >
                      {category.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Type Filter */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Listing Type</Label>
                {localFilters.type && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLocalFilters({
                        ...localFilters,
                        type: undefined,
                      });
                    }}
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </Button>
                )}
              </div>
              <RadioGroup
                value={localFilters.type || ''}
                onValueChange={(value) => {
                  setLocalFilters({
                    ...localFilters,
                    type: value ? (value as ListingType) : undefined,
                  });
                }}
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {types.map((type) => (
                    <div key={type.value} className="flex items-center space-x-3 min-h-[44px]">
                      <RadioGroupItem value={type.value} id={`type-${type.value}`} />
                      <Label htmlFor={`type-${type.value}`} className="text-sm font-normal cursor-pointer flex-1">
                        {type.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            </div>
          </div>

          <Separator />

          {/* Price Range */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Price Range</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="min-price" className="text-sm font-semibold">Minimum Price ($)</Label>
                <Input
                  id="min-price"
                  type="number"
                  placeholder="0"
                  value={localFilters.minPrice || ''}
                  onChange={(e) => {
                    const value = e.target.value ? parseFloat(e.target.value) : undefined;
                    setLocalFilters({
                      ...localFilters,
                      minPrice: value && value > 0 ? value : undefined,
                    });
                  }}
                  className="min-h-[44px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-price" className="text-sm font-semibold">Maximum Price ($)</Label>
                <Input
                  id="max-price"
                  type="number"
                  placeholder="No limit"
                  value={localFilters.maxPrice || ''}
                  onChange={(e) => {
                    const value = e.target.value ? parseFloat(e.target.value) : undefined;
                    setLocalFilters({
                      ...localFilters,
                      maxPrice: value && value > 0 ? value : undefined,
                    });
                  }}
                  className="min-h-[44px]"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Location */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Location</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="state" className="text-sm font-semibold">State</Label>
                  {localFilters.location?.state && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setLocalFilters({
                          ...localFilters,
                          location: {
                            ...localFilters.location,
                            state: undefined,
                          },
                        });
                      }}
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <Select
                  value={localFilters.location?.state || undefined}
                  onValueChange={(value) => {
                    setLocalFilters({
                      ...localFilters,
                      location: {
                        ...localFilters.location,
                        state: value || undefined,
                      },
                    });
                  }}
                >
                  <SelectTrigger id="state" className="min-h-[44px]">
                    <SelectValue placeholder="All States" />
                  </SelectTrigger>
                  <SelectContent>
                    {states.map((state) => (
                      <SelectItem key={state.value} value={state.value}>
                        {state.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="city" className="text-sm font-semibold">City (Optional)</Label>
                <Input
                  id="city"
                  type="text"
                  placeholder="Enter city name"
                  value={localFilters.location?.city || ''}
                  onChange={(e) => {
                    setLocalFilters({
                      ...localFilters,
                      location: {
                        ...localFilters.location,
                        city: e.target.value || undefined,
                      },
                    });
                  }}
                  className="min-h-[44px]"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Species (animals) */}
          {showSpeciesFilter ? (
            <>
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Species</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {species.map((spec) => (
                    <div key={spec.value} className="flex items-center space-x-3 min-h-[44px]">
                      <Checkbox
                        id={`species-${spec.value}`}
                        checked={localFilters.species?.includes(spec.value) || false}
                        onCheckedChange={(checked) => handleSpeciesChange(spec.value, checked as boolean)}
                      />
                      <Label
                        htmlFor={`species-${spec.value}`}
                        className="text-sm font-normal cursor-pointer flex-1"
                      >
                        {spec.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
            </>
          ) : null}

          {/* Quantity */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Quantity</h3>
              {localFilters.quantity && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setLocalFilters({
                      ...localFilters,
                      quantity: undefined,
                    });
                  }}
                  className="h-7 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </Button>
              )}
            </div>
            <RadioGroup
              value={localFilters.quantity || ''}
              onValueChange={(value) => {
                setLocalFilters({
                  ...localFilters,
                  quantity: value ? (value as FilterState['quantity']) : undefined,
                });
              }}
            >
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {quantityOptions.map((option) => (
                  <div key={option.value} className="flex items-center space-x-3 min-h-[44px]">
                    <RadioGroupItem value={option.value} id={`quantity-${option.value}`} />
                    <Label htmlFor={`quantity-${option.value}`} className="text-sm font-normal cursor-pointer flex-1">
                      {option.label}
                    </Label>
                  </div>
                ))}
              </div>
            </RadioGroup>
          </div>

          <Separator />

          {/* Health Status */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Health Status</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {healthStatusOptions.map((status) => (
                <div key={status.value} className="flex items-center space-x-3 min-h-[44px]">
                  <Checkbox
                    id={`health-${status.value}`}
                    checked={localFilters.healthStatus?.includes(status.value) || false}
                    onCheckedChange={(checked) => handleHealthStatusChange(status.value, checked as boolean)}
                  />
                  <Label
                    htmlFor={`health-${status.value}`}
                    className="text-sm font-normal cursor-pointer flex-1"
                  >
                    {status.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Additional Options */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Additional Options</h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-3 min-h-[44px]">
                <Checkbox
                  id="papers"
                  checked={localFilters.papers || false}
                  onCheckedChange={(checked) => {
                    setLocalFilters({
                      ...localFilters,
                      papers: checked ? true : undefined,
                    });
                  }}
                />
                <Label htmlFor="papers" className="text-sm font-normal cursor-pointer flex-1">
                  Has Registration/Papers
                </Label>
              </div>
              <div className="flex items-center space-x-3 min-h-[44px]">
                <Checkbox
                  id="verified-seller"
                  checked={localFilters.verifiedSeller || false}
                  onCheckedChange={(checked) => {
                    setLocalFilters({
                      ...localFilters,
                      verifiedSeller: checked ? true : undefined,
                    });
                  }}
                />
                <Label htmlFor="verified-seller" className="text-sm font-normal cursor-pointer flex-1">
                  Verified Sellers Only
                </Label>
              </div>
              <div className="flex items-center space-x-3 min-h-[44px]">
                <Checkbox
                  id="transport-ready"
                  checked={localFilters.transportReady || false}
                  onCheckedChange={(checked) => {
                    setLocalFilters({
                      ...localFilters,
                      transportReady: checked ? true : undefined,
                    });
                  }}
                />
                <Label htmlFor="transport-ready" className="text-sm font-normal cursor-pointer flex-1">
                  Transport Ready
                </Label>
              </div>
            </div>
          </div>

          <Separator />

          {/* Time & Status Filters */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Time & Status</h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-3 min-h-[44px]">
                <Checkbox
                  id="ending-soon"
                  checked={localFilters.endingSoon || false}
                  onCheckedChange={(checked) => {
                    setLocalFilters({
                      ...localFilters,
                      endingSoon: checked ? true : undefined,
                    });
                  }}
                />
                <Label htmlFor="ending-soon" className="text-sm font-normal cursor-pointer flex-1">
                  Ending Soon (within 24 hours)
                </Label>
              </div>
              <div className="flex items-center space-x-3 min-h-[44px]">
                <Checkbox
                  id="newly-listed"
                  checked={localFilters.newlyListed || false}
                  onCheckedChange={(checked) => {
                    setLocalFilters({
                      ...localFilters,
                      newlyListed: checked ? true : undefined,
                    });
                  }}
                />
                <Label htmlFor="newly-listed" className="text-sm font-normal cursor-pointer flex-1">
                  Newly Listed (within 7 days)
                </Label>
              </div>
              <div className="flex items-center space-x-3 min-h-[44px]">
                <Checkbox
                  id="featured"
                  checked={localFilters.featured || false}
                  onCheckedChange={(checked) => {
                    setLocalFilters({
                      ...localFilters,
                      featured: checked ? true : undefined,
                    });
                  }}
                />
                <Label htmlFor="featured" className="text-sm font-normal cursor-pointer flex-1">
                  Featured Listings Only
                </Label>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4 border-t border-border/50 bg-card/50 flex gap-3 flex-shrink-0">
          <Button
            variant="outline"
            onClick={handleReset}
            className="flex-1 min-h-[48px] font-semibold"
          >
            Reset All
          </Button>
          <Button
            onClick={handleApply}
            className="flex-1 min-h-[48px] font-semibold"
          >
            Apply Filters ({activeFilterCount})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
