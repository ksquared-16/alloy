"use client";

import type { LayoutRuntimeBodyRenderStats } from "@/lib/layout/runtime/layoutRuntimeBodyRenderStats";

type Props = {
    layoutSource: string | null;
    stats: LayoutRuntimeBodyRenderStats;
    surface: string;
    lastError?: string | null;
};

/** Staging-only layout runtime body diagnostic strip. */
export default function DrawerLayoutRuntimeStagingDiagnostic({
    layoutSource,
    stats,
    surface,
    lastError,
}: Props) {
    return (
        <div
            className="rounded-md border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-[11px] text-amber-950"
            data-layout-runtime-staging-diagnostic="true"
            data-layout-runtime-surface={surface}
        >
            <div className="font-semibold">Layout runtime · staging diagnostic</div>
            <dl className="mt-1 grid gap-0.5 sm:grid-cols-2">
                <div>
                    <dt className="inline text-amber-900/70">Source: </dt>
                    <dd className="inline font-medium">{layoutSource ?? "—"}</dd>
                </div>
                <div>
                    <dt className="inline text-amber-900/70">Sections: </dt>
                    <dd className="inline font-medium">{stats.sectionCount}</dd>
                </div>
                <div>
                    <dt className="inline text-amber-900/70">Renderable items: </dt>
                    <dd className="inline font-medium">{stats.renderableItemCount}</dd>
                </div>
                <div>
                    <dt className="inline text-amber-900/70">Items with data: </dt>
                    <dd className="inline font-medium">{stats.itemsWithValueCount}</dd>
                </div>
                {stats.fallbackReason ?
                    <div className="sm:col-span-2">
                        <dt className="inline text-amber-900/70">Fallback reason: </dt>
                        <dd className="inline font-medium">{stats.fallbackReason}</dd>
                    </div>
                :   null}
                {lastError ?
                    <div className="sm:col-span-2">
                        <dt className="inline text-amber-900/70">Last error: </dt>
                        <dd className="inline font-medium">{lastError}</dd>
                    </div>
                :   null}
            </dl>
        </div>
    );
}
