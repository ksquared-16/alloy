/**
 * CSS preview thumbnails for layout assignments (Concept A — UX-4).
 * Not live layout render; visual affordance only until EB preview API exists.
 */

export function QueueLayoutPreviewThumbnail({ label }: { label: string }) {
    return (
        <div
            className="rounded-md border border-alloy-forge/12 bg-[#FAFBFC] p-2"
            aria-label={`Queue layout preview: ${label}`}
            data-testid="presentation-queue-preview"
        >
            <div className="space-y-1.5">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-2 rounded border border-alloy-forge/8 bg-white px-2 py-1">
                        <div className="h-1.5 w-14 rounded bg-alloy-midnight/15" />
                        <div className="h-1.5 w-8 rounded bg-alloy-pine/25" />
                        <div className="ml-auto h-1.5 w-10 rounded bg-alloy-stone/30" />
                    </div>
                ))}
            </div>
        </div>
    );
}

export function FocusPanelLayoutPreviewThumbnail({ label }: { label: string }) {
    return (
        <div
            className="rounded-md border border-alloy-forge/12 bg-[#FAFBFC] p-2"
            aria-label={`Focus Panel layout preview: ${label}`}
            data-testid="presentation-focus-panel-preview"
        >
            <div className="mb-1.5 h-2 w-24 rounded bg-alloy-midnight/20" />
            <div className="grid grid-cols-2 gap-1">
                <div className="h-8 rounded border border-alloy-forge/10 bg-white" />
                <div className="h-8 rounded border border-alloy-forge/10 bg-white" />
            </div>
            <div className="mt-1 h-6 rounded border border-alloy-forge/10 bg-white" />
        </div>
    );
}
