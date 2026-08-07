/**
 * Intentional placeholder for marketing assets not yet approved.
 * Labeled by asset key — do not invent final art.
 */
export default function MarketingAssetPlaceholder({
  assetKey,
  alt,
  aspectClassName = "aspect-[16/10]",
  className = "",
  priority: _priority = false,
}: {
  assetKey: string;
  alt: string;
  aspectClassName?: string;
  className?: string;
  /** Accepted for API parity with image slots; unused until a real asset ships. */
  priority?: boolean;
}) {
  return (
    <figure className={`marketing-asset-frame flex flex-col ${className}`.trim()}>
      <div
        role="img"
        aria-label={alt}
        data-marketing-asset-key={assetKey}
        className={`relative w-full overflow-hidden rounded-[1.25rem] border border-alloy-midnight-forge/[0.08] bg-alloy-stone/70 ${aspectClassName}`}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 px-8 text-center">
          <span className="font-mono text-[10px] font-medium tracking-wide text-alloy-bend-pine/90">
            {assetKey}
          </span>
          <span className="text-sm font-medium text-alloy-midnight-forge/45">Pending</span>
          <span className="max-w-[16rem] text-xs leading-relaxed text-alloy-midnight-forge/35">
            {alt}
          </span>
        </div>
      </div>
    </figure>
  );
}
