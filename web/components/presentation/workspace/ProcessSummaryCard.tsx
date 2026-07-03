"use client";

/**
 * Presentation Runtime V2 — WS.PROCESS_SUMMARY_CARD.
 *
 * The Workspace Process Surface template, instantiated by the runtime once per configured
 * business process. The card grammar is FIXED and domain-neutral:
 *
 *   Identity          — process name + health status
 *   Operational Answer — the process's primary answer (figure + plain-language state)
 *   Evidence          — text evidence only (delta / target / "no urgent work"); never a
 *                        fabricated trend or sparkline
 *   Today's Work      — the configured Work Views with LIVE counts (behavior-configurable:
 *                        visible / max rows / sort / show counts)
 *   CTA               — Open process →
 *
 * Content is live runtime data (`ProcessTileModel`); the operator configures only Today's
 * Work behavior (`WorkspaceProcessSurfaceConfig`). Semantic Alloy color only — Bend Pine /
 * Ember / River Stone / Coastal Current on the state dot + answer text; no decorative color.
 *
 * The card body is inert: only the Work View rows and Open → respond to the pointer.
 */

import { useMemo } from "react";
import Link from "next/link";
import type { ProcessTileModel } from "@/lib/presentation/runtime";
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

type AnswerState = "healthy" | "caution" | "critical" | "neutral";

/**
 * Localize the CANONICAL operational health state to the card's display state. `health` is
 * the OIP/Operational Calculation health enum (`MetricHealthState`: healthy | warning |
 * critical | unknown) already classified upstream and carried on the metric's `status`. This
 * is display localization ONLY — a fixed enum→enum map, NO value inspection, NO thresholds,
 * NO classification. The card never decides whether a process is healthy; it only renders the
 * state the calculation layer determined.
 */
function answerStateFromHealth(health: string | null | undefined): AnswerState {
    switch (health) {
        case "healthy":
            return "healthy";
        case "warning":
            return "caution";
        case "critical":
            return "critical";
        default:
            // "unknown" / unset → no operational state (never fabricated).
            return "neutral";
    }
}

/** Display word for each state — localization of the canonical enum, not a classification. */
const STATE_WORD: Record<AnswerState, string> = {
    healthy: "On track",
    caution: "Needs attention",
    critical: "Action required",
    neutral: "No signal",
};

const STATE_DOT: Record<AnswerState, string> = {
    healthy: "bg-alloy-juniper",
    caution: "bg-alloy-ember",
    critical: "bg-alloy-firewood",
    neutral: "bg-alloy-midnight/35",
};
const STATE_TEXT: Record<AnswerState, string> = {
    healthy: "text-alloy-juniper",
    caution: "text-alloy-ember",
    critical: "text-alloy-firewood",
    neutral: "text-alloy-midnight/55",
};
const STATE_RAIL: Record<AnswerState, string> = {
    healthy: "border-l-alloy-juniper/70",
    caution: "border-l-alloy-ember/70",
    critical: "border-l-alloy-firewood/70",
    neutral: "border-l-alloy-midnight/25",
};

/**
 * Read the process's operational answer straight from its live calculation data. The state,
 * value, and label ALL come from the primary Operational Calculation (`performanceMetrics[0]`,
 * server-resolved); evidence is the calculation's own target. When no calculation is resolved
 * there is no operational answer — the card renders a neutral no-signal state and never
 * manufactures one from record counts or any card-side rule.
 */
function resolveAnswer(process: ProcessTileModel): {
    state: AnswerState;
    figure: string | null;
    metricLabel: string | null;
    evidence: string | null;
} {
    const primary = process.performanceMetrics[0] ?? null;
    if (!primary) {
        return { state: "neutral", figure: null, metricLabel: null, evidence: null };
    }
    return {
        state: answerStateFromHealth(primary.status),
        figure: primary.value,
        metricLabel: primary.label,
        evidence: primary.target ? `Target ${primary.target}` : null,
    };
}

export function ProcessSummaryCard({
    process,
    config,
}: {
    process: ProcessTileModel;
    config: WorkspaceProcessSurfaceConfig;
}) {
    const slug = useMemo(
        () => parseOperatorWorkUnitEntryHref(process.entryHref).workUnitSlug,
        [process.entryHref],
    );
    const warm = () => {
        if (slug) void warmWorkUnitSlugRoute(slug, "workspace_tile");
    };

    const answer = useMemo(() => resolveAnswer(process), [process]);
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
            className={`flex h-full min-h-[13rem] flex-col overflow-hidden rounded-xl border border-alloy-stone/18 border-l-[4px] ${STATE_RAIL[answer.state]} bg-white shadow-[0_1px_4px_rgba(15,23,42,0.05)]`}
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
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-alloy-midnight/[0.04] px-2.5 py-1 text-[11px] font-semibold ${STATE_TEXT[answer.state]}`}
                        data-process-status
                    >
                        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[answer.state]}`} />
                        {STATE_WORD[answer.state]}
                    </span>
                </div>

                {/* Operational Answer + Evidence — value + label from the Operational Calculation;
                    text evidence only, never a fabricated trend. Neutral no-signal when no
                    calculation is resolved (the card never invents a value or state). */}
                <div className="flex items-baseline gap-2.5" data-process-answer>
                    {answer.figure ? (
                        <span className={`text-[30px] font-bold leading-none tabular-nums tracking-tight ${STATE_TEXT[answer.state]}`}>
                            {answer.figure}
                        </span>
                    ) : null}
                    <span className="text-xs font-medium text-alloy-midnight/55">
                        {answer.metricLabel ?? "No operational signal configured yet"}
                    </span>
                </div>
                {answer.evidence ? (
                    <p className="-mt-1 text-xs text-alloy-midnight/55" data-process-evidence>
                        {answer.evidence}
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

                {/* CTA */}
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
                        href={process.entryHref}
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
