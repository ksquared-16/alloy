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

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import type { ProcessTileModel, SignalState } from "@/lib/presentation/runtime";
import {
    applyTodaysWorkConfig,
    resolveProcessCardConfig,
    type ProcessCardAccent,
    type ProcessCardIcon,
    type WorkspaceProcessSurfaceConfig,
} from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import { businessProcessForProcessKey } from "@/lib/presentation/runtime/workspaceProcessSignal";
import { stripLegacyArtifactMarker } from "@/lib/admin/buildOperatorLifecycleLanding";
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

/**
 * Identity-chip classes per operator-chosen accent — Alloy tokens ONLY (static literals for the
 * Tailwind JIT). This colors the IDENTITY glyph; the semantic state rail above stays owned by the
 * operational signal, so an accent never masquerades as a health color.
 */
const ACCENT_CHIP: Record<ProcessCardAccent, string> = {
    pine: "bg-alloy-pine/10 text-alloy-pine",
    juniper: "bg-alloy-juniper/10 text-alloy-juniper",
    ember: "bg-alloy-ember/10 text-alloy-ember",
    firewood: "bg-alloy-firewood/10 text-alloy-firewood",
    midnight: "bg-alloy-midnight/[0.06] text-alloy-midnight",
    stone: "bg-alloy-stone/15 text-alloy-midnight/70",
};
const NEUTRAL_CHIP = "bg-alloy-midnight/[0.04] text-alloy-midnight/55";

/** Closed identity-glyph vocabulary → a single-color inline icon (currentColor; no decorative fill). */
const ICON_GLYPH: Record<ProcessCardIcon, ReactNode> = {
    leads: <path d="M7 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM3 15a4 4 0 018 0M13 6v4M11 8h4" />,
    enrollment: <path d="M4 10l3 3 6-7" />,
    billing: <path d="M10 3v14M13 6a3 3 0 00-3-2c-1.7 0-3 1-3 2.3 0 3 6 1.7 6 4.7C13 12.5 11.6 14 10 14a3 3 0 01-3-2" />,
    roster: <path d="M4 5h9M4 10h9M4 15h6M16 5h.01M16 10h.01M16 15h.01" />,
    tour: <path d="M4 6h12v10H4zM4 6l0-2M16 6l0-2M4 9h12" />,
    waitlist: <path d="M10 5v5l3 2M10 17a7 7 0 100-14 7 7 0 000 14z" />,
    generic: <path d="M5 5h4v4H5zM11 5h4v4h-4zM5 11h4v4H5zM11 11h4v4h-4z" />,
};

function IdentityGlyph({ icon }: { icon: ProcessCardIcon }) {
    return (
        <svg
            viewBox="0 0 20 20"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
        >
            {ICON_GLYPH[icon]}
        </svg>
    );
}

export function ProcessSummaryCard({
    process,
    config,
}: {
    process: ProcessTileModel;
    config: WorkspaceProcessSurfaceConfig;
}) {
    const signal = process.primarySignal;
    const state: SignalState = signal?.state ?? "neutral";
    // Opening a process always lands in the process's Work Unit runtime (its default configured
    // Work View when perspectives are enabled) — the SAME runtime the Work View pills navigate to,
    // so the pills/filter/queue chrome render regardless of arrival path. We deliberately do NOT
    // route "Open process" through the primary signal's metric drill href, which resolved to a
    // bare queue-key slug with no configured Work Views (no pills).
    const drillHref = process.entryHref;

    // Operator-owned card identity (title / subtitle / accent / icon / CTA label). Keyed by the
    // process's business process — the SAME key the Primary Signal picker uses.
    const identity = useMemo(
        () => resolveProcessCardConfig(config, businessProcessForProcessKey(process.processKey)),
        [config, process.processKey],
    );
    // Render-boundary guard: a dirty legacy-suffixed process name never prints on the workspace card.
    const title = stripLegacyArtifactMarker(identity.title ?? process.label) ?? "";
    const subtitle = identity.subtitle ?? process.description;
    const showChip = identity.accent != null || identity.icon !== "generic";
    const ctaLabel = identity.ctaLabel ?? "Open process";
    const supporting = process.supportingSignal;

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
            className={`flex h-full min-h-[13rem] flex-col overflow-hidden rounded-xl border border-alloy-stone/12 border-l-[3px] ${STATE_RAIL[state]} bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]`}
        >
            <div className="flex flex-1 flex-col gap-3.5 px-5 pb-4 pt-4">
                {/* Identity — configured title/subtitle + optional accent glyph chip (identity only). */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                        {showChip ? (
                            <span
                                data-process-identity-chip
                                data-process-accent={identity.accent ?? "none"}
                                data-process-icon={identity.icon}
                                className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                                    identity.accent ? ACCENT_CHIP[identity.accent] : NEUTRAL_CHIP
                                }`}
                            >
                                <IdentityGlyph icon={identity.icon} />
                            </span>
                        ) : null}
                        <div className="min-w-0">
                            <h3
                                data-process-title
                                className="min-w-0 truncate text-[17px] font-semibold leading-snug text-alloy-midnight"
                            >
                                {title}
                            </h3>
                            {subtitle ? (
                                <p
                                    data-process-subtitle
                                    className="mt-0.5 line-clamp-1 text-xs leading-relaxed text-alloy-midnight/55"
                                >
                                    {subtitle}
                                </p>
                            ) : null}
                        </div>
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
                        <p className={`text-[20px] font-bold leading-[1.15] tracking-[-0.015em] ${STATE_TEXT[state]}`}>
                            {signal.answer}
                        </p>
                        {signal.value ? (
                            <p className="mt-1.5 text-[13px] font-semibold tabular-nums text-alloy-midnight/60">
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

                {/* Supporting Signal — the optional SECOND configured calculation, text only. */}
                {supporting ? (
                    <p className="-mt-1 text-xs text-alloy-midnight/55" data-process-supporting-signal>
                        {supporting.value
                            ? `${supporting.label}: ${supporting.value}`
                            : supporting.answer}
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
                        data-process-cta
                        onPointerEnter={warm}
                        onPointerDown={warm}
                        onFocus={warm}
                        className="shrink-0 rounded-md border border-alloy-juniper/35 bg-alloy-juniper/10 px-3 py-1.5 text-xs font-bold tracking-wide text-alloy-juniper no-underline transition-colors hover:border-alloy-juniper hover:bg-alloy-juniper hover:text-white active:bg-alloy-juniper/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alloy-juniper"
                    >
                        {ctaLabel} →
                    </Link>
                </div>
            </div>
        </article>
    );
}
