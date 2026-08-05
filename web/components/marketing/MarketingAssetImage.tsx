import Image from "next/image";

/**
 * Approved marketing illustration / product image.
 * Use only when the production asset exists under public/marketing/.
 */
export default function MarketingAssetImage({
  src,
  alt,
  aspectClassName = "aspect-[5/3]",
  className = "",
  priority = false,
  sizes = "(max-width: 768px) 100vw, 50vw",
}: {
  src: string;
  alt: string;
  aspectClassName?: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <figure className={`flex flex-col ${className}`.trim()}>
      <div className={`relative w-full overflow-hidden ${aspectClassName}`}>
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          className="object-contain object-center"
          sizes={sizes}
        />
      </div>
    </figure>
  );
}
