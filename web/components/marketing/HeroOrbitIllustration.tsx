import Image from "next/image";
import { MARKETING_ASSETS } from "@/lib/marketing/artifactPaths";

/**
 * Hero hub artwork — icon labels omitted; composition lives in the asset.
 */

export default function HeroOrbitIllustration({ className = "" }: { className?: string }) {
  return (
    <figure
      className={`relative w-full ${className}`.trim()}
      aria-label={MARKETING_ASSETS.hero.alt}
    >
      <div className="relative aspect-[1024/564] w-full" style={{ aspectRatio: "1024 / 564" }}>
        <Image
          src={MARKETING_ASSETS.hero.src}
          alt=""
          fill
          priority
          unoptimized
          className="object-contain object-center"
          sizes="(max-width: 1023px) 100vw, 60vw"
        />
      </div>
    </figure>
  );
}
