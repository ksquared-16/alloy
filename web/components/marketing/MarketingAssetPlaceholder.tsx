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
    <figure className={`flex flex-col ${className}`.trim()}>
      <div
        role="img"
        aria-label={alt}
        data-marketing-asset-key={assetKey}
        className={`relative w-full overflow-hidden rounded-2xl border border-alloy-midnight-forge/10 bg-alloy-stone ${aspectClassName}`}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
          <span className="font-mono text-[11px] font-medium tracking-wide text-alloy-bend-pine">
            {assetKey}
          </span>
          <span className="text-sm font-medium text-alloy-midnight-forge/55">Asset pending approval</span>
          <span className="max-w-xs text-xs leading-relaxed text-alloy-midnight-forge/40">{alt}</span>
        </div>
      </div>
    </figure>
  );
}
