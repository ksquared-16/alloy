import Image from "next/image";

/**
 * Approved marketing illustration / product image.
 * Use only when the production asset exists under public/marketing/.
 */
export default function MarketingAssetImage({
  src,
  alt,
  aspectClassName = "aspect-[5/3]",
  aspectRatio,
  className = "",
  priority = false,
  sizes = "(max-width: 768px) 100vw, 50vw",
  framed = false,
  imageClassName = "",
  unoptimized = false,
}: {
  src: string;
  alt: string;
  aspectClassName?: string;
  /** Inline aspect-ratio so layout never collapses if Tailwind JIT misses the class */
  aspectRatio?: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
  /** White elevated surface — for illustrations on River Stone backgrounds */
  framed?: boolean;
  imageClassName?: string;
  /** Bypass Next image optimizer (use for exact marketing illustration pixels) */
  unoptimized?: boolean;
}) {
  const media = (
    <div
      className={`relative w-full overflow-hidden ${aspectClassName}`}
      style={aspectRatio ? { aspectRatio } : undefined}
    >
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        unoptimized={unoptimized}
        className={`object-contain object-center ${imageClassName}`.trim()}
        sizes={sizes}
      />
    </div>
  );

  return (
    <figure className={`flex flex-col ${className}`.trim()}>
      {framed ? (
        <div className="rounded-xl border border-alloy-midnight-forge/[0.12] bg-white p-1.5 shadow-[0_10px_32px_rgba(39,63,82,0.12)] sm:p-2">
          {media}
        </div>
      ) : (
        media
      )}
    </figure>
  );
}
