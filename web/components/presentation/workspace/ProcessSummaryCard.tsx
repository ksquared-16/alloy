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
    type ProcessCardIcon,
    type WorkspaceProcessSurfaceConfig,
} from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import { PROCESS_CARD_ACCENT_STYLES } from "@/lib/presentation/runtime/processCardAccentStyles";
import {
    formatProcessSummaryMetric,
    PROCESS_SUMMARY_METRIC_EMPTY,
    sameMetricPhrase,
} from "@/lib/presentation/runtime/processSummaryMetricPresentation";
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
 * Identity-chip classes per operator-chosen accent — uses brand-correct Alloy tokens
 * (Bend Pine for `pine`, not the legacy alloy-pine alias).
 */
const NEUTRAL_CHIP = "bg-alloy-midnight/[0.04] text-alloy-midnight/55";
const DEFAULT_CTA =
    "border-alloy-juniper/35 bg-alloy-juniper/10 text-alloy-juniper hover:border-alloy-juniper hover:bg-alloy-juniper hover:text-white focus-visible:outline-alloy-juniper";
const DEFAULT_METRIC_TEXT = "text-alloy-juniper";
const DEFAULT_METRIC_TINT = "bg-alloy-juniper/[0.06]";

export type ProcessSummaryBuilderField =
    | "title"
    | "subtitle"
    | "identity"
    | "primaryMetricTitle"
    | "supportingMetricTitle"
    | "cta";

export type ProcessSummaryCardBuilderProps = {
    activeField: ProcessSummaryBuilderField | null;
    onFieldClick: (field: ProcessSummaryBuilderField) => void;
};

function builderRing(active: boolean): string {
    return active ? "ring-2 ring-alloy-bend-pine/45 ring-offset-1 rounded-md" : "";
}

function BuilderHit({
    field,
    builder,
    className,
    children,
}: {
    field: ProcessSummaryBuilderField;
    builder?: ProcessSummaryCardBuilderProps;
    className?: string;
    children: ReactNode;
}) {
    if (!builder) return <>{children}</>;
    const active = builder.activeField === field;
    return (
        <button
            type="button"
            className={`cursor-pointer text-left transition-shadow ${builderRing(active)} ${className ?? ""}`}
            data-builder-field={field}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                builder.onFieldClick(field);
            }}
        >
            {children}
        </button>
    );
}

/** Closed identity-glyph vocabulary → a single-color inline icon (currentColor; no decorative fill). */
const ICON_GLYPH: Record<ProcessCardIcon, ReactNode> = {
    grid: <path d="M5 5h4v4H5zM11 5h4v4h-4zM5 11h4v4H5zM11 11h4v4h-4z" />,
    spark: <path d="M10 3l1.2 4.2L15 8l-3.8 1.2L10 14l-1.2-4.8L5 8l3.8-0.8L10 3z" />,
    route: <path d="M4 6c0-1.1 1-2 2.2-2 1.5 0 2.5 1.2 2.8 2.6M16 14c0 1.1-1 2-2.2 2-1.5 0-2.5-1.2-2.8-2.6M6.5 8.5l7 3M6.5 11.5l7-3" />,
    users: <path d="M7 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM3 15a4 4 0 018 0M13 6v4M11 8h4" />,
    calendar: <path d="M4 6h12v10H4zM4 6l0-2M16 6l0-2M4 9h12" />,
    clipboard: <path d="M7 4h6v2H7zM5 6h10v10H5z" />,
    chart: <path d="M5 14V8M10 14V5M15 14v-4" />,
    message: <path d="M4 5h12v8H8l-4 3V5z" />,
    shield: <path d="M10 3l6 2v5c0 3.5-2.5 5.8-6 7-3.5-1.2-6-3.5-6-7V5l6-2z" />,
    book: <path d="M6 4h8v12H6zM6 4c0 0 2-1 4-1s4 1 4 1" />,
    bolt: <path d="M11 3L6 11h4l-1 6 6-9h-4l0-5z" />,
    layers: <path d="M10 4l7 3.5L10 11 3 7.5 10 4zM3 12.5L10 16l7-3.5M3 16.5L10 20l7-3.5" />,
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
    builder,
}: {
    process: ProcessTileModel;
    config: WorkspaceProcessSurfaceConfig;
    /** When set, the card is the builder canvas — regions are clickable for direct manipulation. */
    builder?: ProcessSummaryCardBuilderProps;
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
    const configuredSubtitle = identity.subtitle?.trim() || null;
    const descriptionFallback = process.description?.trim() || null;
    const subtitle =
        configuredSubtitle ??
        (descriptionFallback && !sameMetricPhrase(title, descriptionFallback) ? descriptionFallback : null);
    const showChip = identity.accent != null || identity.icon !== "grid";
    const ctaLabel = identity.ctaLabel ?? "Open process";
    const supporting = process.supportingSignal;
    const primaryMetricLabel = identity.primarySignalLabel ?? signal?.label ?? null;
    const supportingMetricLabel = identity.supportingSignalLabel ?? supporting?.label ?? null;

    const accentStyle = identity.accent ? PROCESS_CARD_ACCENT_STYLES[identity.accent] : null;
    const leftRail = accentStyle?.rail ?? STATE_RAIL[state];
    const hoverAccent = accentStyle?.hover ?? "hover:shadow-[0_3px_10px_rgba(15,23,42,0.08)]";
    const ctaClasses = accentStyle?.cta ?? DEFAULT_CTA;
    const chipClasses = accentStyle?.chip ?? NEUTRAL_CHIP;
    const metricText = accentStyle?.metricText ?? DEFAULT_METRIC_TEXT;
    const metricTint = accentStyle?.metricTint ?? DEFAULT_METRIC_TINT;
    const statusChipClasses = accentStyle?.statusChip
        ? `${accentStyle.statusChip} font-semibold`
        : `${STATE_TEXT[state]} bg-alloy-midnight/[0.04] font-semibold`;

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
    const primaryFormatted = signal
        ? formatProcessSummaryMetric({
              configuredTitle: primaryMetricLabel,
              definitionLabel: signal.label,
              value: signal.value,
          })
        : null;
    const shouldShowPrimaryMetricLabel =
        primaryFormatted != null &&
        (primaryFormatted.kind === "empty" ||
            (!sameMetricPhrase(primaryFormatted.title, primaryFormatted.displayValue) &&
                !sameMetricPhrase(primaryFormatted.title, signal.answer)));
    const supportingFormatted = supporting
        ? formatProcessSummaryMetric({
              configuredTitle: supportingMetricLabel,
              definitionLabel: supporting.label,
              value: supporting.value,
          })
        : null;

    return (
        <article
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.processTile)}
            data-alloy-section="WS.PROCESS_SUMMARY_CARD"
            data-process-id={process.id}
            data-process-accent={identity.accent ?? "none"}
            className={`flex h-full min-h-[13rem] flex-col overflow-hidden rounded-xl border border-alloy-stone/12 border-l-[3px] ${leftRail} bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow ${hoverAccent}`}
        >
            <div className="flex flex-1 flex-col gap-3.5 px-5 pb-4 pt-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                        {(showChip || builder) ? (
                            <BuilderHit field="identity" builder={builder} className="mt-0.5 shrink-0 rounded-lg">
                                <span
                                    data-process-identity-chip={showChip ? true : undefined}
                                    data-process-icon={identity.icon}
                                    className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${
                                        showChip ? chipClasses : NEUTRAL_CHIP
                                    }`}
                                >
                                    <IdentityGlyph icon={identity.icon} />
                                </span>
                            </BuilderHit>
                        ) : null}
                        <div className="min-w-0">
                            <BuilderHit field="title" builder={builder} className="block w-full">
                                <h3
                                    data-process-title
                                    className="min-w-0 truncate text-[17px] font-semibold leading-snug text-alloy-midnight"
                                >
                                    {title}
                                </h3>
                            </BuilderHit>
                            {subtitle ? (
                                <BuilderHit field="subtitle" builder={builder} className="mt-0.5 block w-full">
                                    <p
                                        data-process-subtitle
                                        className="line-clamp-1 text-xs leading-relaxed text-alloy-midnight/55"
                                    >
                                        {subtitle}
                                    </p>
                                </BuilderHit>
                            ) : builder ? (
                                <BuilderHit field="subtitle" builder={builder} className="mt-0.5 block w-full">
                                    <p className="text-xs italic text-alloy-midnight/35">Add subtitle…</p>
                                </BuilderHit>
                            ) : null}
                        </div>
                    </div>
                    <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ${statusChipClasses}`}
                        data-process-status
                    >
                        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[state]}`} />
                        {STATE_WORD[state]}
                    </span>
                </div>

                {/* Primary Signal — metric label + value/title, suppressing repeated phrases. */}
                {signal && primaryFormatted ? (
                    <div className={`rounded-lg px-3 py-2.5 ${metricTint}`} data-process-answer>
                        {shouldShowPrimaryMetricLabel ? (
                            <BuilderHit field="primaryMetricTitle" builder={builder} className="mb-1 block w-full">
                                <p
                                    className="text-[11px] font-bold uppercase tracking-[0.08em] text-alloy-midnight/55"
                                    data-process-metric-title
                                >
                                    {primaryFormatted.title}
                                </p>
                            </BuilderHit>
                        ) : builder ? (
                            <BuilderHit field="primaryMetricTitle" builder={builder} className="mb-1 block w-full">
                                <p
                                    className="text-[11px] font-bold uppercase tracking-[0.08em] text-alloy-midnight/45"
                                    data-process-metric-title
                                >
                                    {primaryFormatted.title || "Primary metric title"}
                                </p>
                            </BuilderHit>
                        ) : null}
                        {primaryFormatted.kind === "value" ? (
                            <p
                                className={`text-[27px] font-bold leading-none tracking-[-0.035em] tabular-nums ${metricText}`}
                                data-process-metric-value
                            >
                                {primaryFormatted.displayValue}
                            </p>
                        ) : (
                            <p
                                className={`text-[27px] font-bold leading-none tracking-[-0.035em] tabular-nums ${metricText}`}
                                data-process-metric-value
                            >
                                {PROCESS_SUMMARY_METRIC_EMPTY}
                            </p>
                        )}
                        {primaryFormatted.kind === "value" && signal.answer ? (
                            <p
                                className="mt-1 text-[14px] font-semibold leading-snug text-alloy-midnight/75"
                                data-process-metric-answer
                            >
                                {signal.answer}
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
                {supportingFormatted ? (
                    <BuilderHit field="supportingMetricTitle" builder={builder} className="-mt-1 block w-full">
                        {supportingFormatted.kind === "value" ? (
                            <p className="text-[13px] font-semibold text-alloy-midnight/65" data-process-supporting-signal>
                                <span className={metricText}>
                                    {supportingFormatted.title}: {supportingFormatted.displayValue}
                                </span>
                            </p>
                        ) : (
                            <div className="text-[13px] font-semibold text-alloy-midnight/65" data-process-supporting-signal>
                                <p data-process-supporting-metric-title>{supportingFormatted.title}</p>
                                <p className={`tabular-nums ${metricText}`} data-process-supporting-metric-value>
                                    {PROCESS_SUMMARY_METRIC_EMPTY}
                                </p>
                            </div>
                        )}
                    </BuilderHit>
                ) : builder ? (
                    <BuilderHit field="supportingMetricTitle" builder={builder} className="-mt-1 block w-full">
                        <p className="text-xs italic text-alloy-midnight/35">Supporting metric…</p>
                    </BuilderHit>
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
                    {builder ? (
                        <BuilderHit field="cta" builder={builder}>
                            <span
                                className={`inline-block shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold tracking-wide ${ctaClasses}`}
                                data-process-cta
                            >
                                {ctaLabel} →
                            </span>
                        </BuilderHit>
                    ) : (
                        <Link
                            href={drillHref}
                            aria-label={`Open ${process.label}`}
                            data-process-cta
                            onPointerEnter={warm}
                            onPointerDown={warm}
                            onFocus={warm}
                            className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-bold tracking-wide no-underline transition-colors active:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${ctaClasses}`}
                        >
                            {ctaLabel} →
                        </Link>
                    )}
                </div>
            </div>
        </article>
    );
}
