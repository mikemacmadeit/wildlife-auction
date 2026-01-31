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
  { src: '/ADS/Heavy%20rack%201280.jpg', alt: 'Heavy Rack Outfitters', href: 'https://heavyrackoutfitters.com/' },
  { src: '/ADS/Kleensite%201280.jpg', alt: 'Kleensite', href: 'https://kleensite.com/' },
  { src: '/ADS/Sanstone%201280.jpg', alt: 'Sandstone Mountain Ranch', href: 'https://sandstonemountainranch.com/' },
] as const;

const AUTOPLAY_INTERVAL_MS = 5000;

// Ad container: same width as listing rows (Recent Listings, Ending Soon, etc.) — container mx-auto px-4.
// Height: aspect 2.5:1, with responsive max-height so ads scale on desktop.

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
      <div className="container mx-auto px-4 w-full min-w-0">
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
                <a
                  href={slide.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block relative w-full min-w-0 overflow-hidden bg-muted rounded-lg
                    aspect-[2.5/1] max-h-[130px] min-h-[100px]
                    sm:aspect-[2.2/1] sm:max-h-[180px] sm:min-h-0
                    md:aspect-[2.5/1] md:max-h-[200px] md:min-h-0
                    lg:max-h-[240px] xl:max-h-[280px]
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label={`${slide.alt} — opens in new tab`}
                >
                  <Image
                    src={slide.src}
                    alt={slide.alt}
                    fill
                    className="object-contain object-center sm:object-contain md:object-cover"
                    sizes="(max-width: 640px) 100vw, (max-width: 768px) 100vw, (max-width: 1024px) 100vw, (max-width: 1280px) 100vw, 1280px"
                    unoptimized
                    priority={index === 0}
                  />
                </a>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>
    </section>
  );
}
