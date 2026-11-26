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
import { useCallback, useEffect, useRef, useState } from "react";
import { MOTION_SETTLE } from "@/lib/motion/motionTokens";
import { useAcknowledgeOnActive } from "@/lib/motion/useMotionAcknowledge";
import { alloySectionDomAttrs } from "@/lib/perf/alloySectionMap";
import { markPerceived } from "@/lib/perf/perceivedPerf";

/**
 * One work-view pill. Its own component so `acknowledge` fires per-pill on the rising edge
 * of `isActive` — the confidence signal that the pill switch registered. The live-count
 * badge `settle`s (opacity-only) when its value changes, so a deferred/updated count fills
 * in place below the threshold of attention rather than snapping.
 */
function WorkViewPill({
    view,
    selected,
    awaitingDestination,
    onSelect,
    onPrefetch,
}: {
    view: WorkViewLinkModel;
    /** Selected as the operator sees it — their intent until the model agrees. */
    selected: boolean;
    /** This pill is the one they asked for, and the destination has not resolved yet. */
    awaitingDestination: boolean;
    onSelect: (id: string) => void;
    onPrefetch?: (id: string) => void;
}) {
    const ack = useAcknowledgeOnActive(selected);

    const wasActiveRef = useRef(selected);
    useEffect(() => {
        if (selected && !wasActiveRef.current) {
            markPerceived("pill_switch", "acknowledge", { view_id: view.id });
        }
        wasActiveRef.current = selected;
    }, [selected, view.id]);

    const warm = onPrefetch
        ? () => {
              markPerceived("pill_switch", "warm", { view_id: view.id, warm_seam: "pill_hover" });
              onPrefetch(view.id);
          }
        : undefined;

    return (
        <button
            type="button"
            role="tab"
            aria-selected={selected}
            aria-busy={awaitingDestination || undefined}
            data-work-view-id={view.id}
            /*
             * The requested view, not yet resolved. Explicit so the state is legible rather than a
             * lie: the control says "you chose this and it is still coming", and a test can assert
             * that acknowledgement never pretends the destination is loaded.
             */
            data-work-view-intent={awaitingDestination ? "pending" : undefined}
            onPointerEnter={warm}
            onFocus={warm}
            onClick={() => onSelect(view.id)}
            className={`motion-control inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs min-w-[6.75rem] ${
                selected
                    ? "border-alloy-juniper bg-alloy-juniper font-semibold text-white shadow-sm"
                    : "border-alloy-midnight/20 bg-white font-semibold text-alloy-midnight/80 hover:border-alloy-juniper/45 hover:bg-alloy-juniper/[0.03]"
            }${ack.className ? ` ${ack.className}` : ""}`}
        >
            <span>{view.label}</span>
            <span
                aria-hidden={view.count == null}
                // Settlement fills this count AFTER commit (U-S6). Reserve a STABLE width that holds the
                // settled value (up to 3 digits) so the badge never widens when the number lands — a
                // widening badge shifts the pill and registers as settlement reflow. `tabular-nums` keeps
                // every digit the same width; `min-w-[2rem]` is the reserved geometry, not "0"'s width.
                className={`${MOTION_SETTLE.className} inline-flex min-w-[2rem] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
                    view.isActive ? "bg-white/20 text-white" : "bg-alloy-stone/15 text-alloy-midnight/70"
                } ${view.count == null ? "invisible" : ""}`}
            >
                {view.count ?? 0}
            </span>
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
    /*
     * ── ACKNOWLEDGE THE OPERATOR BEFORE THE DESTINATION RESOLVES ────────────────────────────────
     *
     * `view.isActive` is computed from the RESOLVED snapshot's active view, so the pill could not
     * look selected until the whole transition finished. Measured on deployed staging: a normal
     * click took ~5.0 s, an immediate repeat ~6.3 s, and every milestone landed in the same frame —
     * nothing, then everything. The operator had no evidence their click had registered.
     *
     * Intent is not data. This holds the id the operator asked for and renders the control from it,
     * while the model stays the only source of truth for routing, the queue and the Focus Panel.
     * Nothing is optimistically claimed about the destination: the chosen pill is marked
     * `data-work-view-intent="pending"` and `aria-busy` until the model agrees, so the acknowledgement
     * can never be mistaken for loaded content.
     *
     * Intent is spent as soon as the model MOVES — whether it lands where the operator asked or
     * somewhere else, which is how a refused or redirected move takes the highlight back. The latest
     * click simply replaces the previous one, so rapid switching acknowledges the last intent.
     */
    const modelActiveId = workViews.find((v) => v.isActive)?.id ?? null;
    const [intent, setIntent] = useState<{ id: string; modelAtClick: string | null } | null>(null);
    useEffect(() => {
        setIntent((prev) => (prev && prev.modelAtClick !== modelActiveId ? null : prev));
    }, [modelActiveId]);
    const select = useCallback(
        (id: string) => {
            setIntent({ id, modelAtClick: modelActiveId });
            onSelect(id);
        },
        [modelActiveId, onSelect],
    );
    const selectedId = intent?.id ?? modelActiveId;

    if (!workViews.length) return null;
    return (
        <div
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.workViewPillStrip)}
            {...alloySectionDomAttrs("WU-03")}
            role="tablist"
            aria-label="Work views"
            className="flex items-center gap-2 overflow-x-auto pb-0"
        >
            {workViews.map((view) => (
                <WorkViewPill
                    key={view.id}
                    view={view}
                    selected={view.id === selectedId}
                    awaitingDestination={intent?.id === view.id && modelActiveId !== view.id}
                    onSelect={select}
                    onPrefetch={onPrefetch}
                />
            ))}
        </div>
    );
}
