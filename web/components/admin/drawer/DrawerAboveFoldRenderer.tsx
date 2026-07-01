"use client";

import { JobDrawerV2SignalsStrip } from "@/components/admin/drawer/JobDrawerV2";
import type { DrawerAboveFoldRenderModel } from "@/lib/adminV2/drawerPipeline/types";

function SignalStripSkeleton() {
    return (
        <div className="skeleton-pulse rounded-xl bg-alloy-stone/15 h-14 min-w-[140px] flex-1" aria-hidden />
    );
}

export type DrawerAboveFoldRendererProps = {
    model: DrawerAboveFoldRenderModel | null | undefined;
};

/**
 * Generic above-fold slot renderer — shell-owned placement; adapters supply slot values only.
 * Opportunity inquiry summary remains in AdminEntityDrawer until extracted as a slot component.
 */
export default function DrawerAboveFoldRenderer({ model }: DrawerAboveFoldRendererProps) {
    const signals = model?.header_signals;
    if (!signals?.reserved) return null;

    if (signals.value_phase === "skeleton" || !signals.lines) {
        return (
            <div
                className="flex min-h-[3.25rem] w-full gap-2"
                aria-hidden
                data-shell-slot-placeholder="header_signals"
            >
                <SignalStripSkeleton />
                <SignalStripSkeleton />
                <SignalStripSkeleton />
            </div>
        );
    }

    return (
        <JobDrawerV2SignalsStrip
            {...signals.lines}
            presentation={signals.presentation === "cleaningRecordModal" ? "cleaningRecordModal" : "default"}
        />
    );
}
