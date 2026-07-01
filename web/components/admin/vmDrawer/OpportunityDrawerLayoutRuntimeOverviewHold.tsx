"use client";

/** C1b — coordinated hold placeholder while layout runtime body resolves (no VM flash). */

export default function OpportunityDrawerLayoutRuntimeOverviewHold() {
    return (
        <div
            className="space-y-4"
            data-drawer-layout-runtime-overview-hold="true"
            aria-busy="true"
            aria-label="Loading overview layout"
        >
            <div className="rounded-lg border border-alloy-stone/15 bg-alloy-stone/5 p-4">
                <div className="mb-3 h-3 w-32 animate-pulse rounded bg-alloy-stone/20" />
                <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                        <div className="h-2.5 w-24 animate-pulse rounded bg-alloy-stone/15" />
                        <div className="h-8 animate-pulse rounded bg-alloy-stone/10" />
                    </div>
                    <div className="space-y-2">
                        <div className="h-2.5 w-20 animate-pulse rounded bg-alloy-stone/15" />
                        <div className="h-8 animate-pulse rounded bg-alloy-stone/10" />
                    </div>
                </div>
            </div>
            <div className="rounded-lg border border-alloy-stone/15 bg-alloy-stone/5 p-4">
                <div className="mb-2 h-3 w-28 animate-pulse rounded bg-alloy-stone/20" />
                <div className="h-16 animate-pulse rounded bg-alloy-stone/10" />
            </div>
        </div>
    );
}
