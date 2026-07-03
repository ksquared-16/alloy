"use client";

/**
 * Presentation Runtime V2 — WS.PROCESS_SUMMARY_CARD.
 *
 * The Workspace Process Surface template, instantiated by the runtime once per configured
 * process. The card grammar is FIXED and domain-neutral:
 *
 *   Identity            — process name + the Primary Signal's state
 *   Primary Signal      — the ONE configured Operational Answer (answer sentence is the hero,
 *                         the value supports it). The renderer does not decide what matters —
 *                         Surface Builder selects the signal; the calculation owns the meaning.
 *   Supporting Context  — text only (the calculation's target; trend when the data supplies it).
 *                         Never a fabricated trend or sparkline.
 *   Today's Work        — the configured Work Views with LIVE counts (behavior-configurable).
 *   Open Process        — drills to the signal's target (falls back to the process entry).
 *
 * The card renders whatever answer is supplied — percent, currency, count, score, ratio — and
 * never branches on value type or assumes "health". Semantic Alloy color only; no decorative
 * color. The card body is inert: only the Work View rows and Open → respond to the pointer.
 */

import { useMemo } from "react";
import Link from "next/link";
import type { ProcessTileModel, SignalState } from "@/lib/presentation/runtime";
import {
    applyTodaysWorkConfig,
    type WorkspaceProcessSurfaceConfig,
} from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import {
    parseOperatorWorkUnitEntryHref,
    warmWorkUnitSlugRoute,
} from "@/lib/admin/operatorWorkUnitEntryWarm";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";
import { WorkViewList } from "./WorkViewList";

/** Display word for each state — localization of the canonical enum, not a classification. */
const STATE_WORD: Record<SignalState, string> = {
    healthy: "On track",
    caution: "Needs attention",
    critical: "Action required",
    neutral: "No signal",
};

const STATE_DOT: Record<SignalState, string> = {
    healthy: "bg-alloy-juniper",
    caution: "bg-alloy-ember",
    critical: "bg-alloy-firewood",
    neutral: "bg-alloy-midnight/35",
};
const STATE_TEXT: Record<SignalState, string> = {
    healthy: "text-alloy-juniper",
    caution: "text-alloy-ember",
    critical: "text-alloy-firewood",
    neutral: "text-alloy-midnight/55",
};
const STATE_RAIL: Record<SignalState, string> = {
    healthy: "border-l-alloy-juniper/70",
    caution: "border-l-alloy-ember/70",
    critical: "border-l-alloy-firewood/70",
    neutral: "border-l-alloy-midnight/25",
};

export function ProcessSummaryCard({
    process,
    config,
}: {
    process: ProcessTileModel;
    config: WorkspaceProcessSurfaceConfig;
}) {
    const signal = process.primarySignal;
    const state: SignalState = signal?.state ?? "neutral";
    const drillHref = signal?.drillHref ?? process.entryHref;

    const slug = useMemo(
        () => parseOperatorWorkUnitEntryHref(drillHref).workUnitSlug,
        [drillHref],
    );
    const warm = () => {
        if (slug) void warmWorkUnitSlugRoute(slug, "workspace_tile");
    };

    const todaysWork = useMemo(
        () => applyTodaysWorkConfig(process.workViews, config),
        [process.workViews, config],
    );
    const showTodaysWork = config.todaysWork.visible && todaysWork.length > 0;

    return (
        <article
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.processTile)}
            data-alloy-section="WS.PROCESS_SUMMARY_CARD"
            data-process-id={process.id}
            className={`flex h-full min-h-[13rem] flex-col overflow-hidden rounded-xl border border-alloy-stone/18 border-l-[4px] ${STATE_RAIL[state]} bg-white shadow-[0_1px_4px_rgba(15,23,42,0.05)]`}
        >
            <div className="flex flex-1 flex-col gap-3 px-5 pb-4 pt-4">
                {/* Identity */}
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="min-w-0 truncate text-[17px] font-semibold leading-snug text-alloy-midnight">
                            {process.label}
                        </h3>
                        {process.description ? (
                            <p className="mt-0.5 line-clamp-1 text-xs leading-relaxed text-alloy-midnight/55">
                                {process.description}
                            </p>
                        ) : null}
                    </div>
                    <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-alloy-midnight/[0.04] px-2.5 py-1 text-[11px] font-semibold ${STATE_TEXT[state]}`}
                        data-process-status
                    >
                        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[state]}`} />
                        {STATE_WORD[state]}
                    </span>
                </div>

                {/* Primary Signal — the configured Operational Answer. Answer is the hero; the
                    value supports it. Domain-neutral: the value may be percent / currency / count
                    / score / ratio and the card never branches on it. */}
                {signal ? (
                    <div data-process-answer>
                        <p className={`text-[19px] font-bold leading-tight tracking-[-0.01em] ${STATE_TEXT[state]}`}>
                            {signal.answer}
                        </p>
                        {signal.value ? (
                            <p className="mt-1 text-sm font-semibold tabular-nums text-alloy-midnight/70">
                                {signal.value}
                            </p>
                        ) : null}
                    </div>
                ) : (
                    <div data-process-answer>
                        <p className="text-sm font-medium text-alloy-midnight/55">
                            No signal configured yet
                        </p>
                    </div>
                )}

                {/* Supporting Context — text only (target; trend when the data supplies it). */}
                {signal && (signal.supportingContext || signal.trend) ? (
                    <p className="-mt-1 text-xs text-alloy-midnight/55" data-process-context>
                        {[signal.trend, signal.supportingContext].filter(Boolean).join(" · ")}
                    </p>
                ) : null}

                {/* Today's Work — live work views (behavior configured; content is runtime data). */}
                {showTodaysWork ? (
                    <div className="mt-1 border-t border-alloy-midnight/8 pt-2.5" data-process-todays-work>
                        <p className="mb-1 text-[9px] font-bold uppercase tracking-[0.1em] text-alloy-midnight/45">
                            Today's Work
                        </p>
                        <WorkViewList workViews={todaysWork} showCounts={config.todaysWork.showCounts} />
                    </div>
                ) : null}

                {/* Open Process — drills to the signal's target, else the process entry. */}
                <div className="mt-auto flex items-center justify-between gap-3 border-t border-alloy-midnight/8 pt-2.5">
                    {process.activeRecordCount != null ? (
                        <span className="text-[11px] text-alloy-midnight/45">
                            <span className="font-semibold tabular-nums text-alloy-midnight/60">
                                {process.activeRecordCount.toLocaleString()}
                            </span>{" "}
                            active
                        </span>
                    ) : (
                        <span aria-hidden />
                    )}
                    <Link
                        href={drillHref}
                        aria-label={`Open ${process.label}`}
                        onPointerEnter={warm}
                        onPointerDown={warm}
                        onFocus={warm}
                        className="shrink-0 rounded-md border border-alloy-juniper/35 bg-alloy-juniper/10 px-3 py-1.5 text-xs font-bold tracking-wide text-alloy-juniper no-underline transition-colors hover:border-alloy-juniper hover:bg-alloy-juniper hover:text-white active:bg-alloy-juniper/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alloy-juniper"
                    >
                        Open process →
                    </Link>
                </div>
            </div>
        </article>
    );
}
