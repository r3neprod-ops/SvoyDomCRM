import Image from 'next/image';
import { extractUrlFromBackground, withBuilderImageParams } from '@/lib/image';

export default function SlotBox({
  className = '',
  kind = 'image',
  slotKey,
  fileHint,
  debug = false,
  backgroundImage = null,
  children = null,
}) {
  if (!debug) {
    const imageUrl = extractUrlFromBackground(backgroundImage);
    const optimizedSrc = withBuilderImageParams(imageUrl, { width: 640, quality: 60 });
    const style = {};

    // Use slot-box-with-image class when backgroundImage is provided
    // This prevents the placeholder gradient from overlaying the actual image
    const slotClass = backgroundImage
      ? `slot-box-with-image ${className}`
      : `slot-box ${className}`;

    return (
      <div className={`${slotClass} relative overflow-hidden`} aria-hidden="true" style={style}>
        {optimizedSrc && (
          <Image
            src={optimizedSrc}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            loading="lazy"
            className="object-cover object-center"
          />
        )}
        {children}
      </div>
    );
  }

  return (
    <div
      className={`slot-box border border-dashed border-[color:var(--borderStrong)] p-2 ${className}`}
      data-kind={kind}
      data-slot-key={slotKey}
      data-file-hint={fileHint}
      aria-label={slotKey || fileHint || 'slot'}
    >
      <p className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--muted)]">
        {slotKey || 'slot'}
      </p>
      {fileHint && <p className="mt-1 text-[11px] text-[color:var(--muted)]">{fileHint}</p>}
    </div>
  );
}
