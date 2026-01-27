'use client';

import { useEffect, useState } from 'react';
import { X, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { FilterState, ListingType } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  BROWSE_CATEGORIES_FOR_DISPLAY as categories,
  BROWSE_TYPES as types,
} from '@/components/browse/filters/constants';

interface FilterBottomSheetProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  className?: string;
}

export function FilterBottomSheet({
  filters,
  onFiltersChange,
  className,
}: FilterBottomSheetProps) {
  const [open, setOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<FilterState>(filters);

  // Sync local filters when external filters change (when sheet is closed)
  useEffect(() => {
    if (!open) setLocalFilters(filters);
  }, [filters, open]);

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

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
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
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filter Listings</SheetTitle>
          <SheetDescription>
            Narrow down your search to find exactly what you're looking for
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-8">
          {/* Category Filter */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Category</Label>
            <div className="grid grid-cols-2 gap-3">
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
            <Label className="text-base font-semibold">Listing Type</Label>
            <RadioGroup
              value={localFilters.type || ''}
              onValueChange={(value) => {
                setLocalFilters({
                  ...localFilters,
                  type: value as ListingType | undefined,
                });
              }}
            >
              {types.map((type) => (
                <div key={type.value} className="flex items-center space-x-3 min-h-[44px]">
                  <RadioGroupItem value={type.value} id={`type-${type.value}`} />
                  <Label htmlFor={`type-${type.value}`} className="text-sm font-normal cursor-pointer flex-1">
                    {type.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Ending Soon Filter */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Time</Label>
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
                Ending Soon
              </Label>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex gap-3 pt-4 border-t sticky bottom-0 bg-background pb-4">
          <Button
            variant="outline"
            onClick={handleReset}
            className="flex-1 min-h-[48px]"
          >
            Reset
          </Button>
          <Button
            onClick={handleApply}
            className="flex-1 min-h-[48px]"
          >
            Apply Filters
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
