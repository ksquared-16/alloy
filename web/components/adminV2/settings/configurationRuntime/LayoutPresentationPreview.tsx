/**
 * CSS preview thumbnails for layout assignments (Concept A — UX-4).
 * Visual affordance only until EB preview API exists.
 */

export function QueueLayoutPreviewThumbnail({ label }: { label: string }) {
    return (
        <div
            className="w-[7.5rem] rounded-lg border border-alloy-pine/15 bg-white p-2.5 shadow-sm"
            aria-label={`Queue layout preview: ${label}`}
            data-testid="presentation-queue-preview"
        >
            <p className="mb-2 truncate text-[9px] font-semibold uppercase tracking-wide text-alloy-pine/70">{label}</p>
            <div className="space-y-1.5">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-1.5 rounded border border-alloy-forge/8 bg-alloy-stone/[0.03] px-1.5 py-1">
                        <div className="h-1.5 w-10 rounded bg-alloy-midnight/15" />
                        <div className="h-1.5 w-6 rounded bg-alloy-pine/30" />
                        <div className="ml-auto h-1.5 w-8 rounded bg-alloy-stone/35" />
                    </div>
                ))}
            </div>
        </div>
    );
}

export function FocusPanelLayoutPreviewThumbnail({ label }: { label: string }) {
    return (
        <div
            className="w-[7.5rem] rounded-lg border border-alloy-pine/15 bg-white p-2.5 shadow-sm"
            aria-label={`Focus Panel layout preview: ${label}`}
            data-testid="presentation-focus-panel-preview"
        >
            <p className="mb-2 truncate text-[9px] font-semibold uppercase tracking-wide text-alloy-pine/70">{label}</p>
            <div className="mb-1.5 h-2 w-20 rounded bg-alloy-midnight/20" />
            <div className="grid grid-cols-2 gap-1">
                <div className="h-7 rounded border border-alloy-forge/10 bg-alloy-stone/[0.03]" />
                <div className="h-7 rounded border border-alloy-forge/10 bg-alloy-stone/[0.03]" />
            </div>
            <div className="mt-1 h-5 rounded border border-alloy-forge/10 bg-alloy-stone/[0.03]" />
        </div>
    );
}
