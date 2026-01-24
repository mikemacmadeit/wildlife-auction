'use client';

import React, { useState, forwardRef } from 'react';
import NextImage from 'next/image';
import { cn } from '@/lib/utils';

interface SafeImageProps {
  src?: string | null | undefined;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  className?: string;
  sizes?: string;
  priority?: boolean;
  quality?: number;
  loading?: 'eager' | 'lazy';
  placeholder?: 'blur' | 'empty';
  blurDataURL?: string;
  style?: React.CSSProperties;
  onLoad?: () => void;
  onError?: () => void;
  unoptimized?: boolean;
}

// Fallback placeholder component
const ImagePlaceholder = forwardRef<HTMLDivElement, { 
  className?: string; 
  alt: string; 
  fill?: boolean;
  width?: number;
  height?: number;
}>(({ className, alt, fill, width, height }, ref) => (
  <div
    ref={ref}
    className={cn(
      'bg-muted flex items-center justify-center text-muted-foreground text-sm font-medium',
      fill ? 'absolute inset-0' : '',
      className
    )}
    style={!fill ? { width, height } : undefined}
    role="img"
    aria-label={alt || 'Image placeholder'}
  >
    <span className="text-xs">No Image</span>
  </div>
));
ImagePlaceholder.displayName = 'ImagePlaceholder';

export const SafeImage = forwardRef<HTMLImageElement, SafeImageProps>(({
  src,
  alt,
  fill,
  width,
  height,
  className,
  sizes,
  priority = false,
  quality,
  loading = 'lazy',
  placeholder,
  blurDataURL,
  style,
  onLoad,
  onError,
  unoptimized,
}, ref) => {
  const [hasError, setHasError] = useState(false);
  const [isValidSrc, setIsValidSrc] = useState(() => {
    // Validate src at initial render
    if (!src || typeof src !== 'string') return false;
    try {
      new URL(src);
      return true;
    } catch {
      return false;
    }
  });

  // If src is invalid or we had an error, show placeholder
  if (!isValidSrc || hasError) {
    return (
      <ImagePlaceholder 
        className={className}
        alt={alt}
        fill={fill}
        width={width}
        height={height}
      />
    );
  }

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  const handleLoad = () => {
    onLoad?.();
  };

  // Auto-detect Firebase Storage URLs and bypass Next.js Image completely for them
  const isFirebaseStorageUrl = src?.includes('firebasestorage.googleapis.com') || src?.includes('.firebasestorage.app');
  
  // For Firebase Storage URLs, use native img tag to avoid Next.js image optimization issues
  if (isFirebaseStorageUrl) {
    return (
      <img
        ref={ref as any}
        src={src}
        alt={alt}
        className={fill ? `absolute inset-0 w-full h-full object-cover ${className || ''}` : className}
        style={fill ? { ...style, objectFit: 'cover' } : { ...style, width, height }}
        loading={loading}
        onLoad={handleLoad}
        onError={handleError}
      />
    );
  }

  // For non-Firebase URLs, use Next.js Image with optimization
  const shouldBeUnoptimized = unoptimized || false;

  try {
    return (
      <NextImage
        ref={ref}
        src={src}
        alt={alt}
        fill={fill}
        width={width}
        height={height}
        className={className}
        sizes={sizes}
        priority={priority}
        quality={quality}
        loading={loading}
        placeholder={placeholder}
        blurDataURL={blurDataURL}
        style={style}
        onLoad={handleLoad}
        onError={handleError}
        unoptimized={shouldBeUnoptimized}
      />
    );
  } catch (error) {
    // If Image component throws during render, catch and show placeholder
    console.warn('SafeImage: Caught render error:', error);
    return (
      <ImagePlaceholder 
        className={className}
        alt={alt}
        fill={fill}
        width={width}
        height={height}
      />
    );
  }
});

SafeImage.displayName = 'SafeImage';