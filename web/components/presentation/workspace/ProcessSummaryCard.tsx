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

type AnswerState = "healthy" | "caution" | "critical" | "info" | "neutral";

/** Map an OIP status string to a semantic Alloy state (no decorative color). */
function statusToState(status: string | null | undefined): AnswerState {
    const s = (status ?? "").toLowerCase();
    if (!s) return "neutral";
    if (/(healthy|on track|ahead|good|strong|met|complete)/.test(s)) return "healthy";
    if (/(attention|warn|behind|due|pending|at risk|watch)/.test(s)) return "caution";
    if (/(critical|overdue|blocked|fail|risk)/.test(s)) return "critical";
    if (/(improv|new|info|active)/.test(s)) return "info";
    return "neutral";
}

const STATE_DOT: Record<AnswerState, string> = {
    healthy: "bg-alloy-juniper",
    caution: "bg-alloy-ember",
    critical: "bg-alloy-firewood",
    info: "bg-alloy-blue",
    neutral: "bg-alloy-midnight/35",
};
const STATE_TEXT: Record<AnswerState, string> = {
    healthy: "text-alloy-juniper",
    caution: "text-alloy-ember",
    critical: "text-alloy-firewood",
    info: "text-alloy-blue",
    neutral: "text-alloy-midnight/55",
};
const STATE_RAIL: Record<AnswerState, string> = {
    healthy: "border-l-alloy-juniper/70",
    caution: "border-l-alloy-ember/70",
    critical: "border-l-alloy-firewood/70",
    info: "border-l-alloy-blue/70",
    neutral: "border-l-alloy-midnight/25",
};

/** Resolve the card's operational answer + evidence from the process's live data. */
function resolveAnswer(process: ProcessTileModel): {
    state: AnswerState;
    figure: string | null;
    answerLabel: string;
    evidence: string | null;
} {
    const primary = process.performanceMetrics[0] ?? null;
    const attention = typeof process.needsAttentionCount === "number" && process.needsAttentionCount > 0
        ? process.needsAttentionCount
        : null;

    // Operational Answer — prefer the configured primary metric; else an attention/calm answer.
    if (primary) {
        const state = statusToState(primary.status);
        const evidenceParts: string[] = [];
        if (primary.status) evidenceParts.push(primary.status);
        if (primary.target) evidenceParts.push(`target ${primary.target}`);
        return {
            state,
            figure: primary.value,
            answerLabel: primary.label,
            evidence: evidenceParts.length ? evidenceParts.join(" · ") : null,
        };
    }

    if (attention != null) {
        return {
            state: "caution",
            figure: attention.toLocaleString(),
            answerLabel: "Need attention",
            evidence: "Records waiting in this process",
        };
    }
    return {
        state: "healthy",
        figure: null,
        answerLabel: "On track",
        evidence: "No urgent work in this process",
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
                        {answer.answerLabel}
                    </span>
                </div>

                {/* Operational Answer + Evidence (text only — never a fabricated trend). */}
                <div className="flex items-baseline gap-2.5" data-process-answer>
                    {answer.figure ? (
                        <span className={`text-[30px] font-bold leading-none tabular-nums tracking-tight ${STATE_TEXT[answer.state]}`}>
                            {answer.figure}
                        </span>
                    ) : null}
                    <span className="text-xs font-medium text-alloy-midnight/55">{answer.answerLabel}</span>
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
