'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel';
const AD_SLIDES = [
  { src: '/ADS/Heavy%20rack%201280.jpg', alt: 'Heavy Rack' },
  { src: '/ADS/Kleensite%201280.jpg', alt: 'Kleensite' },
  { src: '/ADS/Sanstone%201280.jpg', alt: 'Sanstone' },
] as const;

const AUTOPLAY_INTERVAL_MS = 5000;

// Ad container dimensions (inner slide):
// - Width: 100% of page container (same as listing rows; typically ~100vw - 32px on mobile, max ~1280px on xl if Tailwind container is set).
// - Height: min( width / 2.5, 280px ) — aspect ratio 2.5:1, capped at 280px.
// So at 1280px width → 280px tall; at 700px width → 280px tall; at 400px width → 160px tall.

export function HomepageAdCarousel() {
  const [api, setApi] = useState<CarouselApi | null>(null);

  const scrollNext = useCallback(() => {
    api?.scrollNext();
    if (api?.canScrollNext()) return;
    api?.scrollTo(0);
  }, [api]);

  useEffect(() => {
    if (!api) return;
    const t = setInterval(scrollNext, AUTOPLAY_INTERVAL_MS);
    return () => clearInterval(t);
  }, [api, scrollNext]);

  return (
    <section
      className="py-1.5 sm:py-3 md:py-6 border-b border-border/50 bg-card/30 overflow-x-hidden"
      aria-label="Partner ads"
    >
      <div className="container mx-auto px-3 sm:px-4 w-full max-w-full min-w-0">
        <Carousel
          setApi={setApi}
          opts={{
            loop: true,
            align: 'center',
            skipSnaps: false,
            containScroll: 'trimSnaps',
            dragFree: false,
          }}
          className="w-full min-w-0"
        >
          <CarouselContent className="-ml-0">
            {AD_SLIDES.map((slide, index) => (
              <CarouselItem key={index} className="basis-full pl-0 min-w-0">
                <div
                  className="relative w-full min-w-0 overflow-hidden bg-muted rounded-lg
                    aspect-[2.5/1] max-h-[130px] min-h-[100px]
                    sm:aspect-[2.2/1] sm:max-h-[180px] sm:min-h-0
                    md:aspect-[2.5/1] md:max-h-[280px] md:min-h-0"
                >
                  <Image
                    src={slide.src}
                    alt={slide.alt}
                    fill
                    className="object-contain object-center sm:object-contain md:object-cover"
                    sizes="(max-width: 640px) 100vw, (max-width: 1280px) 100vw, 1280px"
                    unoptimized
                    priority={index === 0}
                  />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>
    </section>
  );
}
