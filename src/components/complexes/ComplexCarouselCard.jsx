'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Card from '@/components/ui/Card';
import SlotBox from '@/components/SlotBox';

function hashString(value) {
  return value.split('').reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 100000, 7);
}

/**
 * ComplexCarouselCard - Display complex (жилой комплекс) with image carousel
 *
 * Builder Edit Mode:
 * - Set NEXT_PUBLIC_BUILDER_EDIT=true in .env to enable edit mode
 * - In edit mode, all 3 image slots are displayed simultaneously in a grid
 * - Each slot can be clicked and edited individually in Builder
 *
 * Normal Mode:
 * - Auto-slides through images every 3 seconds (staggered by complex ID)
 * - Pauses on hover
 */
export default function ComplexCarouselCard({ complex }) {
  const isEditMode = process.env.NEXT_PUBLIC_BUILDER_EDIT === 'true';
  const slidesCount = complex.photos.length;
  const seed = useMemo(() => hashString(complex.id), [complex.id]);
  const initialIndex = seed % slidesCount;
  const initialDelay = (seed % 2000) + 200;

  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setActiveIndex(initialIndex);
  }, [initialIndex]);

  useEffect(() => {
    // Skip autoplay in edit mode
    if (isEditMode || paused) return undefined;

    let timer;
    const startTimeout = setTimeout(() => {
      timer = setInterval(() => {
        setActiveIndex((prev) => (prev + 1) % slidesCount);
      }, 3000);
    }, initialDelay);

    return () => {
      clearTimeout(startTimeout);
      if (timer) clearInterval(timer);
    };
  }, [initialDelay, paused, slidesCount, isEditMode]);

  return (
    <Card
      className="reveal h-full p-4"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Edit Mode: Show all 3 image slots in a grid */}
      {isEditMode ? (
        <div className="space-y-2">
          <p className="text-xs text-[color:var(--muted)] mb-2 font-medium">📸 Photo Slots (Click to Edit):</p>
          <div className="space-y-2">
            {complex.photos.map((photoKey, index) => (
              <div key={photoKey} className="rounded-xl overflow-hidden border border-[color:var(--border)]">
                <SlotBox
                  kind="image"
                  slotKey={`complex-${complex.id}-photo-${index + 1}`}
                  fileHint={`complex-${complex.id}-photo-${index + 1}.jpg`}
                  className="h-32"
                  backgroundImage={
                    Array.isArray(complex.backgroundImages)
                      ? complex.backgroundImages[index]
                      : complex.backgroundImage
                  }
                />
                <p className="text-xs text-[color:var(--muted)] px-2 py-1 bg-[color:var(--bg2)]">Slot {index + 1}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-[color:var(--border)]">
            <h3 className="text-lg tracking-tight">{complex.title}</h3>
            <p className="mt-2 text-sm text-[color:var(--muted)]">{complex.subtitle}</p>
          </div>
        </div>
      ) : (
        /* Normal Mode: Auto-carousel slider */
        <>
          <div className="relative h-48 overflow-hidden rounded-2xl">
            {/* Render all image slots in DOM, but hide inactive ones with opacity */}
            {complex.photos.map((photoKey, index) => (
              <div
                key={photoKey}
                className={`absolute inset-0 transition-opacity duration-300 ${
                  index === activeIndex ? 'opacity-100' : 'opacity-0'
                }`}
                style={{ pointerEvents: index === activeIndex ? 'auto' : 'none' }}
              >
                {index === activeIndex && (
                  <SlotBox
                    kind="image"
                    slotKey={`complex-${complex.id}-photo-${index + 1}`}
                    fileHint={`complex-${complex.id}-photo-${index + 1}.jpg`}
                    className="h-full"
                    backgroundImage={
                      Array.isArray(complex.backgroundImages)
                        ? complex.backgroundImages[index]
                        : complex.backgroundImage
                    }
                  >
                    {complex.extraImage?.srcSet && (
                      <Image
                        src={complex.extraImage.srcSet}
                        alt=""
                        width={640}
                        height={450}
                        sizes="(max-width: 768px) 100vw, 33vw"
                        loading="lazy"
                        className="mt-5 h-auto w-full min-h-[20px] min-w-[20px] overflow-hidden object-cover object-center"
                      />
                    )}
                  </SlotBox>
                )}
              </div>
            ))}

            {/* Navigation dots */}
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {complex.photos.map((photoKey, index) => (
                <button
                  key={`${photoKey}-dot`}
                  type="button"
                  className={`h-1.5 w-1.5 rounded-full ${index === activeIndex ? 'bg-white' : 'bg-white/55'}`}
                  onClick={() => setActiveIndex(index)}
                  aria-label={`Слайд ${index + 1}`}
                />
              ))}
            </div>
          </div>

          <h3 className="mt-4 text-xl font-bold tracking-tight">{complex.title}</h3>
          {complex.keyAdvantage && (
            <p className="mt-1 text-sm font-medium text-[color:var(--accent2)]">✓ {complex.keyAdvantage}</p>
          )}
          <p className="mt-1.5 text-sm text-[color:var(--muted)]">{complex.subtitle}</p>
        </>
      )}

      {/* Always show tags and link (normal mode only) */}
      {!isEditMode && (
        <>
          <div className="mt-3 flex flex-wrap gap-2">
            {complex.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-[color:var(--border)] px-2.5 py-1 text-xs text-[color:var(--muted)]">
                {tag}
              </span>
            ))}
          </div>
          <a href="#lead-form" className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--accent2)] px-4 py-2 text-sm font-medium text-[color:var(--accent2)] transition hover:bg-[color:var(--accent2)] hover:text-white">
            Узнать цены и планировки →
          </a>
        </>
      )}
    </Card>
  );
}
