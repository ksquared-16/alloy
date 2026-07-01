"use client";

type Density = "compact" | "comfortable";

/**
 * Subtle placeholder for relationship-heavy drawer panels during fetch / full-record hydrate.
 * No spinner — static shimmer bars (matches AdminV2 transition guidelines).
 */
export function DrawerRelationshipPanelSkeleton({
    density = "comfortable",
    rows = 3,
    label,
}: {
    density?: Density;
    rows?: number;
    /** Screen-reader only context */
    label?: string;
}) {
    const n = Math.max(1, Math.min(rows, 6));
    const rowClass =
        density === "compact"
            ? "space-y-1.5 rounded-md border border-alloy-stone/12 bg-white/40 px-2 py-2"
            : "space-y-2 rounded-lg border border-alloy-stone/15 bg-white/50 px-3 py-2.5";
    const barMuted = density === "compact" ? "bg-alloy-stone/16" : "bg-alloy-stone/18";
    return (
        <div
            className="adminv2-drawer-rel-skeleton text-left"
            aria-busy="true"
            aria-label={label ?? "Loading relationships"}
        >
            {Array.from({ length: n }, (_, i) => (
                <div key={i} className={rowClass}>
                    <div className={`adminv2-shimmer-bar mb-2 h-3.5 rounded ${barMuted} ${density === "compact" ? "w-[55%]" : "w-[48%]"}`} />
                    <div className={`adminv2-shimmer-bar h-2.5 rounded ${barMuted} w-[88%] opacity-80`} />
                    <div className={`adminv2-shimmer-bar mt-1.5 h-2.5 rounded ${barMuted} w-[72%] opacity-70`} />
                </div>
            ))}
        </div>
    );
}
