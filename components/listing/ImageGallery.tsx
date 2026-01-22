'use client';

import { useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface ImageGalleryProps {
  images: string[];
  title: string;
  className?: string;
  /**
   * Optional crop settings keyed by image URL.
   * When provided, we apply `object-position` (and optional zoom) so `object-cover` matches the crop chosen in upload.
   */
  focalPointsByUrl?: Record<string, { x: number; y: number; zoom?: number }>;
}

export function ImageGallery({ images, title, className, focalPointsByUrl }: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const getObjectPosition = (url: string): string => {
    const fp = url && focalPointsByUrl ? focalPointsByUrl[url] : undefined;
    if (!fp || !Number.isFinite(fp.x) || !Number.isFinite(fp.y)) return '50% 50%';
    const x = Math.max(0, Math.min(1, fp.x));
    const y = Math.max(0, Math.min(1, fp.y));
    return `${Math.round(x * 100)}% ${Math.round(y * 100)}%`;
  };

  const getZoom = (url: string): number => {
    const fp = url && focalPointsByUrl ? focalPointsByUrl[url] : undefined;
    const z = typeof fp?.zoom === 'number' && Number.isFinite(fp.zoom) ? fp.zoom : 1;
    return Math.max(1, Math.min(3, z));
  };

  if (!images || images.length === 0) {
    return (
      <div className={cn(
        'relative aspect-video w-full bg-gradient-to-br from-muted via-muted/90 to-muted/80',
        'flex items-center justify-center rounded-lg overflow-hidden',
        className
      )}>
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-primary" />
          </div>
          <span className="text-muted-foreground font-medium">No Images Available</span>
        </div>
      </div>
    );
  }

  const nextImage = () => {
    setSelectedIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setSelectedIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <>
      {/* Main Image */}
      <div
        className={cn('relative aspect-video w-full rounded-lg overflow-hidden group cursor-pointer', className)}
        role="button"
        tabIndex={0}
        onClick={() => setIsDialogOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsDialogOpen(true);
          }
        }}
        aria-label="Open image viewer"
      >
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-0 transition-transform duration-500"
            style={{
              transform: `scale(${getZoom(images[selectedIndex] || '')})`,
              transformOrigin: getObjectPosition(images[selectedIndex] || ''),
            }}
          >
            <Image
              src={images[selectedIndex]}
              alt={`${title} - Image ${selectedIndex + 1}`}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              style={{ objectPosition: getObjectPosition(images[selectedIndex] || '') }}
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
              unoptimized
              priority={selectedIndex === 0}
            />
          </div>
        </div>
        
        {/* Gradient Overlay on Hover */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        
        {/* Navigation Arrows */}
        {images.length > 1 && (
          <>
            <Button
              variant="secondary"
              size="icon"
              className={cn(
                'absolute left-2 top-1/2 -translate-y-1/2 z-10',
                'min-w-[44px] min-h-[44px]',
                'bg-card/90 backdrop-blur-xl border border-border/50 shadow-warm',
                'opacity-0 group-hover:opacity-100 transition-opacity',
                'shadow-lg hover:bg-background'
              )}
              onClick={(e) => {
                e.stopPropagation();
                prevImage();
              }}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className={cn(
                'absolute right-2 top-1/2 -translate-y-1/2 z-10',
                'min-w-[44px] min-h-[44px]',
                'bg-card/90 backdrop-blur-xl border border-border/50 shadow-warm',
                'opacity-0 group-hover:opacity-100 transition-opacity',
                'shadow-lg hover:bg-background'
              )}
              onClick={(e) => {
                e.stopPropagation();
                nextImage();
              }}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </>
        )}

        {/* Image Counter */}
        {images.length > 1 && (
          <div className="absolute bottom-4 left-4 px-3 py-1.5 rounded-full bg-card/90 backdrop-blur-sm border border-border/50 text-sm font-semibold shadow-warm">
            {selectedIndex + 1} / {images.length}
          </div>
        )}

        {/* Click to Expand Hint */}
        <div className="pointer-events-none absolute bottom-4 right-4 px-3 py-1.5 rounded-full bg-card/90 backdrop-blur-sm border border-border/50 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity shadow-warm">
          Click to expand
        </div>
      </div>

      {/* Thumbnail Gallery */}
      {images.length > 1 && (
        <div className="grid grid-cols-4 md:grid-cols-6 gap-2 mt-3">
          {images.slice(0, 6).map((image, index) => (
            <motion.button
              key={index}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedIndex(index)}
              className={cn(
                'relative aspect-square rounded-md overflow-hidden border-2 transition-all',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                selectedIndex === index
                  ? 'border-primary shadow-lg shadow-primary/20'
                  : 'border-border/50 hover:border-primary/50'
              )}
            >
              <div className="absolute inset-0 overflow-hidden">
                <div
                  className="absolute inset-0"
                  style={{
                    transform: `scale(${getZoom(image)})`,
                    transformOrigin: getObjectPosition(image),
                  }}
                >
                  <Image
                    src={image}
                    alt={`Thumbnail ${index + 1}`}
                    fill
                    className="object-cover"
                    style={{ objectPosition: getObjectPosition(image) }}
                    sizes="(max-width: 768px) 25vw, 150px"
                    unoptimized
                  />
                </div>
              </div>
              {selectedIndex === index && (
                <div className="absolute inset-0 bg-primary/20 border-2 border-primary rounded-md" />
              )}
            </motion.button>
          ))}
          {images.length > 6 && (
            <button
              onClick={() => setIsDialogOpen(true)}
              className={cn(
                'relative aspect-square rounded-md overflow-hidden border-2 border-border/50',
                'bg-muted hover:bg-muted/80 transition-colors',
                'flex items-center justify-center text-sm font-semibold',
                'hover:border-primary/50'
              )}
            >
              +{images.length - 6}
            </button>
          )}
        </div>
      )}

      {/* Fullscreen Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-7xl w-full h-[90vh] p-0 gap-0 bg-black/95">
          <div className="relative w-full h-full flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedIndex}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.3 }}
                className="relative w-full h-full flex items-center justify-center p-4"
              >
                <Image
                  src={images[selectedIndex]}
                  alt={`${title} - Image ${selectedIndex + 1}`}
                  width={1200}
                  height={800}
                  className="max-w-full max-h-full object-contain"
                  unoptimized
                />
              </motion.div>
            </AnimatePresence>

            {/* Fullscreen Navigation */}
            {images.length > 1 && (
              <>
                <Button
                  variant="secondary"
                  size="icon"
                  className={cn(
                    'absolute left-4 top-1/2 -translate-y-1/2 z-20',
                    'min-w-[48px] min-h-[48px]',
                    'bg-card/90 backdrop-blur-xl border border-border/50 shadow-warm',
                    'hover:bg-background shadow-xl'
                  )}
                  onClick={prevImage}
                >
                  <ChevronLeft className="h-6 w-6" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className={cn(
                    'absolute right-4 top-1/2 -translate-y-1/2 z-20',
                    'min-w-[48px] min-h-[48px]',
                    'bg-card/90 backdrop-blur-xl border border-border/50 shadow-warm',
                    'hover:bg-background shadow-xl'
                  )}
                  onClick={nextImage}
                >
                  <ChevronRight className="h-6 w-6" />
                </Button>
              </>
            )}

            {/* Image Counter in Fullscreen */}
            {images.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-card/90 backdrop-blur-sm border border-border/50 text-sm font-semibold shadow-warm">
                {selectedIndex + 1} / {images.length}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
