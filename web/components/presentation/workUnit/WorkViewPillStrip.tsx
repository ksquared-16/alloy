"use client";

/**
 * Presentation Runtime V2 — WU.WORK_VIEW_PILLS.
 *
 * Horizontal pill strip of the configured Work Views for the process (`work_views_v1`,
 * resolved by the runtime). Selection is in-page — no navigation, no query-string writes.
 * No hardcoded view names, no process-specific branches.
 */

import type { WorkViewLinkModel } from "@/lib/presentation/runtime";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";

export function WorkViewPillStrip({
    workViews,
    onSelect,
    onPrefetch,
}: {
    workViews: WorkViewLinkModel[];
    onSelect: (id: string) => void;
    /** Hover/focus intent — warm the view's target route before the click. */
    onPrefetch?: (id: string) => void;
}) {
    if (!workViews.length) return null;
    return (
        <div
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.workViewPillStrip)}
            data-alloy-section="WU.WORK_VIEW_PILLS"
            role="tablist"
            aria-label="Work views"
            className="flex items-center gap-2 overflow-x-auto pb-0.5"
        >
            {workViews.map((view) => (
                <button
                    key={view.id}
                    type="button"
                    role="tab"
                    aria-selected={view.isActive}
                    data-work-view-id={view.id}
                    onPointerEnter={onPrefetch ? () => onPrefetch(view.id) : undefined}
                    onFocus={onPrefetch ? () => onPrefetch(view.id) : undefined}
                    onClick={() => onSelect(view.id)}
                    className={`motion-control inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium ${
                        view.isActive
                            ? "border-alloy-juniper bg-alloy-juniper text-white"
                            : "border-alloy-stone/30 bg-white text-alloy-midnight hover:border-alloy-juniper/50"
                    }`}
                >
                    <span>{view.label}</span>
                    {view.count != null ? (
                        <span
                            className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                                view.isActive ? "bg-white/20 text-white" : "bg-alloy-stone/15 text-alloy-midnight/70"
                            }`}
                        >
                            {view.count}
                        </span>
                    ) : null}
                </button>
            ))}
        </div>
    );
}
