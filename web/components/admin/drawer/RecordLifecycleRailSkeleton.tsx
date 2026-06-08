"use client";

import { ADMINV2_DRAWER_OPPORTUNITY_TIMELINE_MIN_H } from "@/lib/ui-v2/adminV2LoadingGeometry";

function SkeletonBar({ className }: { className: string }) {
    return <div className={`skeleton-pulse rounded bg-alloy-stone/12 ${className}`} />;
}

/** Lightweight lifecycle rail reserve — does not block drawer body reveal. */
export default function RecordLifecycleRailSkeleton({ stepCount = 6 }: { stepCount?: number }) {
    return (
        <div
            className="rounded-lg border border-alloy-stone/12 bg-white/60 px-2.5 py-2 ring-1 ring-alloy-stone/10"
            style={{ minHeight: ADMINV2_DRAWER_OPPORTUNITY_TIMELINE_MIN_H }}
            aria-busy="true"
            data-testid="record-lifecycle-rail-skeleton"
            data-record-lifecycle-rail-skeleton="true"
        >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {Array.from({ length: stepCount }).map((_, i) => (
                    <div key={i} className="flex min-w-0 items-center gap-1.5">
                        <SkeletonBar className="h-5 w-5 shrink-0 rounded-full" />
                        <SkeletonBar className="h-3 w-14" />
                        {i < stepCount - 1 ? <SkeletonBar className="mx-0.5 h-0.5 w-4 rounded-full opacity-70" /> : null}
                    </div>
                ))}
            </div>
        </div>
    );
}
