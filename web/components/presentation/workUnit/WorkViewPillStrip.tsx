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
import { MOTION_SETTLE } from "@/lib/motion/motionTokens";
import { useAcknowledgeOnActive } from "@/lib/motion/useMotionAcknowledge";

/**
 * One work-view pill. Its own component so `acknowledge` fires per-pill on the rising edge
 * of `isActive` — the confidence signal that the pill switch registered. The live-count
 * badge `settle`s (opacity-only) when its value changes, so a deferred/updated count fills
 * in place below the threshold of attention rather than snapping.
 */
function WorkViewPill({
    view,
    onSelect,
    onPrefetch,
}: {
    view: WorkViewLinkModel;
    onSelect: (id: string) => void;
    onPrefetch?: (id: string) => void;
}) {
    const ack = useAcknowledgeOnActive(view.isActive);
    return (
        <button
            type="button"
            role="tab"
            aria-selected={view.isActive}
            data-work-view-id={view.id}
            onPointerEnter={onPrefetch ? () => onPrefetch(view.id) : undefined}
            onFocus={onPrefetch ? () => onPrefetch(view.id) : undefined}
            onClick={() => onSelect(view.id)}
            className={`motion-control inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold ${
                view.isActive
                    ? "border-alloy-juniper bg-alloy-juniper text-white shadow-sm"
                    : "border-alloy-midnight/20 bg-white text-alloy-midnight/80 hover:border-alloy-juniper/45 hover:bg-alloy-juniper/[0.03]"
            }${ack.className ? ` ${ack.className}` : ""}`}
        >
            <span>{view.label}</span>
            {view.count != null ? (
                <span
                    // Keyed by value so a changed count replays the `settle` opacity ramp.
                    key={view.count}
                    className={`${MOTION_SETTLE.className} rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                        view.isActive ? "bg-white/20 text-white" : "bg-alloy-stone/15 text-alloy-midnight/70"
                    }`}
                >
                    {view.count}
                </span>
            ) : null}
        </button>
    );
}

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
            className="flex items-center gap-2 overflow-x-auto pb-0"
        >
            {workViews.map((view) => (
                <WorkViewPill key={view.id} view={view} onSelect={onSelect} onPrefetch={onPrefetch} />
            ))}
        </div>
    );
}
