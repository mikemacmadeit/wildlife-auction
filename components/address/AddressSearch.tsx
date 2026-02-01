'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Label } from '@/components/ui/label';
import { getGoogleMapsApi } from '@/lib/google-maps/loader';
import { parseGooglePlace, type ParsedGoogleAddress } from '@/lib/address/parseGooglePlace';
import { cn } from '@/lib/utils';

const DEBOUNCE_MS = 250;

export interface AddressSearchProps {
  onSelect: (address: ParsedGoogleAddress) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function AddressSearch({
  onSelect,
  placeholder = 'Search for an address…',
  disabled = false,
  className = '',
}: AddressSearchProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);
  const placesDivRef = useRef<HTMLDivElement | null>(null);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectingRef = useRef(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Load Google APIs and create services
  useEffect(() => {
    let cancelled = false;
    getGoogleMapsApi()
      .then((g) => {
        if (cancelled) return;
        autocompleteServiceRef.current = new g.maps.places.AutocompleteService();
        const div = document.createElement('div');
        div.setAttribute('aria-hidden', 'true');
        div.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
        document.body.appendChild(div);
        placesDivRef.current = div;
        placesServiceRef.current = new g.maps.places.PlacesService(div);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Failed to load maps');
      });
    return () => {
      cancelled = true;
      if (placesDivRef.current?.parentNode) {
        placesDivRef.current.parentNode.removeChild(placesDivRef.current);
      }
      placesDivRef.current = null;
      autocompleteServiceRef.current = null;
      placesServiceRef.current = null;
    };
  }, []);

  // Fetch suggestions when query changes
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const svc = autocompleteServiceRef.current;
      if (!svc) return;
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new google.maps.places.AutocompleteSessionToken();
      }
      setLoading(true);
      setError(null);
      svc.getPlacePredictions(
        {
          input: query,
          sessionToken: sessionTokenRef.current,
          types: ['address'],
        },
        (predictions, status) => {
          setLoading(false);
          if (status === google.maps.places.PlacesServiceStatus.OK && predictions?.length) {
            setSuggestions(predictions);
            setOpen(true);
          } else {
            setSuggestions([]);
          }
        }
      );
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Update dropdown position when open
  useEffect(() => {
    if (!open || !suggestions.length || !inputRef.current) {
      setDropdownRect(null);
      return;
    }
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 280),
    });
  }, [open, suggestions.length]);

  useEffect(() => {
    if (!open || !suggestions.length) return;
    const onScroll = () => {
      if (inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect();
        setDropdownRect({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 280) });
      }
    };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, suggestions.length]);

  useEffect(() => () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
  }, []);

  const selectPlace = useCallback((placeId: string) => {
    const ps = placesServiceRef.current;
    if (!ps || selectingRef.current) return;
    selectingRef.current = true;
    if (blurTimerRef.current) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setLoading(true);
    setError(null);
    ps.getDetails(
      {
        placeId,
        fields: ['place_id', 'formatted_address', 'address_components', 'geometry'],
      },
      (place, status) => {
        selectingRef.current = false;
        setLoading(false);
        setOpen(false);
        setSuggestions([]);
        sessionTokenRef.current = null;
        if (status === google.maps.places.PlacesServiceStatus.OK && place) {
          const parsed = parseGooglePlace({
            place_id: place.place_id,
            formatted_address: place.formatted_address,
            address_components: place.address_components,
            geometry: place.geometry,
          });
          setQuery(parsed.formattedAddress);
          onSelectRef.current(parsed);
        } else {
          setError('Could not load address details');
        }
      }
    );
  }, []);

  const onBlur = useCallback(() => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    if (selectingRef.current) return;
    // Close dropdown after delay so user can click a suggestion (blur fires before mousedown)
    blurTimerRef.current = setTimeout(() => {
      blurTimerRef.current = null;
      if (selectingRef.current) return;
      setOpen(false);
    }, 400);
  }, []);

  const dropdownContent =
    open &&
    suggestions.length > 0 &&
    dropdownRect &&
    typeof document !== 'undefined' && (
      <ul
        role="listbox"
        aria-label="Address suggestions"
        className="fixed z-[99999] max-h-60 overflow-auto rounded-md border border-input bg-popover py-1 shadow-lg"
        data-address-dropdown
        style={{
          top: dropdownRect.top,
          left: dropdownRect.left,
          width: dropdownRect.width,
          minWidth: 200,
          pointerEvents: 'auto',
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        {suggestions.map((p) => (
          <li
            key={p.place_id}
            role="option"
            aria-selected="false"
            className="cursor-pointer px-3 py-3 min-h-[48px] text-sm hover:bg-accent focus:bg-accent outline-none touch-manipulation flex flex-col justify-center"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              selectPlace(p.place_id);
            }}
          >
            <div className="font-medium">{p.structured_formatting?.main_text ?? p.description}</div>
            {p.structured_formatting?.secondary_text && (
              <div className="text-xs text-muted-foreground mt-0.5">
                {p.structured_formatting.secondary_text}
              </div>
            )}
          </li>
        ))}
      </ul>
    );

  // Render dropdown in a portal so it isn't clipped by modal overflow (e.g. Set delivery address dialog)
  const dropdown =
    typeof document !== 'undefined' && dropdownContent
      ? createPortal(dropdownContent, document.body)
      : null;

  return (
    <div className={cn('space-y-1', className)}>
      <Label className="text-sm">Address</Label>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={onBlur}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          aria-label="Search for an address"
          aria-autocomplete="list"
          className={cn(
            'flex h-10 md:h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm ring-offset-background min-h-[48px] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'
          )}
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            Searching…
          </span>
        )}
      </div>
      {dropdown}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
