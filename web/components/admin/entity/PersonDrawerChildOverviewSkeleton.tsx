"use client";

function SkeletonBar({ className }: { className: string }) {
    return <div className={`skeleton-pulse rounded bg-alloy-stone/12 ${className}`} />;
}

/** Compact child drawer loading — summary shape only; family hydrates after. */
export default function PersonDrawerChildOverviewSkeleton() {
    return (
        <div className="space-y-2 pt-0" data-person-drawer-child-overview-skeleton="true" aria-busy="true">
            <div className="rounded-xl border border-alloy-stone/12 border-l-[3px] border-l-[rgb(0,162,131)]/40 bg-gradient-to-br from-emerald-50/30 via-white to-white px-2 py-2 shadow-sm">
                <SkeletonBar className="mb-2 h-3 w-24" />
                <div className="flex items-start gap-3">
                    <SkeletonBar className="h-14 w-14 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-2">
                        <SkeletonBar className="h-8 w-full max-w-[16rem] rounded-md" />
                        <div className="flex gap-2">
                            <SkeletonBar className="h-8 w-[8.5rem] rounded-md" />
                            <SkeletonBar className="h-8 w-[7.5rem] rounded-md" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
