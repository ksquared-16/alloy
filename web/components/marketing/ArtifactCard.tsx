import Image from "next/image";

interface ArtifactCardProps {
  src: string;
  alt: string;
  /** Optional caption below the artifact */
  caption?: string;
  className?: string;
  priority?: boolean;
}

export default function ArtifactCard({
  src,
  alt,
  caption,
  className = "",
  priority = false,
}: ArtifactCardProps) {
  return (
    <figure className={`flex flex-col items-center ${className}`.trim()}>
      <div className="relative w-full overflow-hidden rounded-2xl border border-alloy-forge/8 bg-alloy-stone/30 shadow-sm">
        <div className="relative aspect-[4/3] w-full sm:aspect-[16/10]">
          <Image
            src={src}
            alt={alt}
            fill
            priority={priority}
            className="object-contain p-6 sm:p-8"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        </div>
      </div>
      {caption ? (
        <figcaption className="mt-4 text-center text-sm text-alloy-forge/60">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
