"use client";

import RecordLifecycleRailSkeleton from "@/components/admin/drawer/RecordLifecycleRailSkeleton";

function SkeletonBar({ className }: { className: string }) {
    return <div className={`skeleton-pulse rounded bg-alloy-stone/12 ${className}`} />;
}

/** Compact child drawer loading — lifecycle rail + summary shape, no blank cards. */
export default function PersonDrawerChildOverviewSkeleton() {
    return (
        <div className="space-y-2 pt-0" data-person-drawer-child-overview-skeleton="true" aria-busy="true">
            <RecordLifecycleRailSkeleton stepCount={4} />
            <div className="rounded-xl border border-alloy-stone/12 border-l-[3px] border-l-[rgb(0,162,131)]/40 bg-gradient-to-br from-emerald-50/30 via-white to-white px-2 py-2 shadow-sm">
                <SkeletonBar className="mb-2 h-3 w-24" />
                <div className="flex items-start gap-3">
                    <SkeletonBar className="h-11 w-11 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <SkeletonBar className="h-9 rounded-md" />
                        <SkeletonBar className="h-9 rounded-md" />
                    </div>
                </div>
            </div>
            <SkeletonBar className="h-24 w-full rounded-lg border border-alloy-stone/10" />
        </div>
    );
}
