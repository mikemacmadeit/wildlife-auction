'use client';

import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

export type SearchableSelectOption = {
  value: string;
  label: string;
};

export function SearchableSelect(props: {
  value: string | null | undefined;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
}) {
  const {
    value,
    onChange,
    options,
    placeholder = 'Select…',
    searchPlaceholder = 'Search…',
    disabled,
    className,
    buttonClassName,
  } = props;

  const [open, setOpen] = React.useState(false);

  const selected = React.useMemo(() => {
    const v = String(value || '');
    return options.find((o) => o.value === v) || null;
  }, [options, value]);
  const rawValue = React.useMemo(() => String(value || '').trim(), [value]);
  const displayLabel = selected ? selected.label : rawValue ? `${rawValue} (custom)` : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between min-h-[48px] text-base', buttonClassName)}
        >
          <span className={cn('truncate text-left', !selected && !rawValue && 'text-muted-foreground')}>
            {displayLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('w-[--radix-popover-trigger-width] p-0', className)} align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>No results.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', selected?.value === opt.value ? 'opacity-100' : 'opacity-0')} />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

