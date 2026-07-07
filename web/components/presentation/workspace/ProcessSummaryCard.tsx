"use client";

/**
 * Presentation Runtime V2 — WS.PROCESS_SUMMARY_CARD.
 *
 * The Workspace Process Surface template, instantiated by the runtime once per configured
 * process. The card grammar is FIXED and domain-neutral:
 *
 *   Identity            — process name + subtle health (dot + word; no filled pill)
 *   Primary Metrics     — large midnight numbers with supporting labels below; no colored banner
 *   Supporting Context  — text only (target/trend when the calculation supplies it)
 *   Today's Work        — scannable rows: icon → name → mission → count → attention signal
 *   Open Process        — text link affordance (falls back to process entry)
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
    type WorkspaceProcessSurfaceConfig,
} from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import { PROCESS_CARD_ACCENT_STYLES } from "@/lib/presentation/runtime/processCardAccentStyles";
import {
    formatProcessSummaryMetric,
    PROCESS_SUMMARY_METRIC_EMPTY,
    sameMetricPhrase,
    type FormattedProcessSummaryMetric,
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
import { ProcessCardGlyph } from "./ProcessCardGlyph";

/** Display word for each state — localization of the canonical enum, not a classification. */
const STATE_WORD: Record<SignalState, string> = {
    healthy: "On track",
    caution: "Needs attention",
    critical: "Action required",
    neutral: "No signal",
};

const STATE_DOT: Record<SignalState, string> = {
    healthy: "bg-alloy-bend-pine",
    caution: "bg-alloy-ember",
    critical: "bg-alloy-ember",
    neutral: "bg-alloy-midnight/30",
};

/** Neutral identity well — accent tints the glyph only, not the card body. */
const NEUTRAL_CHIP = "bg-alloy-midnight/[0.04] text-alloy-midnight/50";
const DEFAULT_CTA = "text-alloy-bend-pine hover:text-alloy-bend-pine/80 focus-visible:outline-alloy-bend-pine";

function MetricUnit({
    formatted,
    size = "primary",
    dataAttr,
}: {
    formatted: FormattedProcessSummaryMetric;
    size?: "primary" | "supporting";
    dataAttr?: string;
}) {
    const value =
        formatted.kind === "value" ? formatted.displayValue : PROCESS_SUMMARY_METRIC_EMPTY;
    return (
        <div {...(dataAttr ? { [dataAttr]: true } : {})}>
            <p
                className={`font-bold tabular-nums tracking-[-0.03em] text-alloy-midnight ${
                    size === "primary" ? "text-[28px] leading-none" : "text-[22px] leading-none"
                }`}
                data-process-metric-value={size === "primary" ? true : undefined}
                data-process-supporting-metric-value={size === "supporting" ? true : undefined}
            >
                {value}
            </p>
            <p
                className={`mt-1.5 font-medium text-alloy-midnight/50 ${
                    size === "primary" ? "text-[13px] leading-snug" : "text-[12px] leading-snug"
                }`}
                data-process-metric-title={size === "primary" ? true : undefined}
                data-process-supporting-metric-title={size === "supporting" ? true : undefined}
            >
                {formatted.title}
            </p>
        </div>
    );
}

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
    const chipClasses = accentStyle?.chip ?? NEUTRAL_CHIP;
    const ctaClasses = accentStyle ? `${accentStyle.metricText} hover:opacity-80` : DEFAULT_CTA;

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
    const supportingFormatted = supporting
        ? formatProcessSummaryMetric({
              configuredTitle: supportingMetricLabel,
              definitionLabel: supporting.label,
              value: supporting.value,
          })
        : null;
    const shouldShowPrimaryMetricLabel =
        primaryFormatted != null &&
        signal != null &&
        primaryFormatted.kind === "empty";
    const showInlineMetricPair =
        identity.metricPresentation === "inline" &&
        primaryFormatted?.kind === "value" &&
        supportingFormatted?.kind === "value";
    const showStackedSupporting = supporting != null && !showInlineMetricPair;

    return (
        <article
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.processTile)}
            data-alloy-section="WS.PROCESS_SUMMARY_CARD"
            data-process-id={process.id}
            data-process-accent={identity.accent ?? "none"}
            data-process-metric-presentation={identity.metricPresentation}
            className="flex h-full min-h-[14rem] flex-col overflow-hidden rounded-xl border border-alloy-stone/15 bg-white transition-shadow hover:shadow-[0_2px_10px_rgba(15,23,42,0.05)]"
        >
            <div className="flex flex-1 flex-col gap-5 px-5 pb-5 pt-5">
                {/* Header — identity + subtle health */}
                <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                        {(showChip || builder) ? (
                            <BuilderHit field="identity" builder={builder} className="shrink-0 rounded-xl">
                                <span
                                    data-process-identity-chip={showChip ? true : undefined}
                                    data-process-icon={identity.icon}
                                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${
                                        showChip ? chipClasses : NEUTRAL_CHIP
                                    }`}
                                >
                                    <ProcessCardGlyph icon={identity.icon} className="h-[18px] w-[18px]" />
                                </span>
                            </BuilderHit>
                        ) : null}
                        <div className="min-w-0 pt-0.5">
                            <BuilderHit field="title" builder={builder} className="block w-full">
                                <h3
                                    data-process-title
                                    className="min-w-0 truncate text-[18px] font-semibold leading-snug tracking-[-0.01em] text-alloy-midnight"
                                >
                                    {title}
                                </h3>
                            </BuilderHit>
                            {subtitle ? (
                                <BuilderHit field="subtitle" builder={builder} className="mt-1 block w-full">
                                    <p
                                        data-process-subtitle
                                        className="line-clamp-2 text-[13px] leading-relaxed text-alloy-midnight/50"
                                    >
                                        {subtitle}
                                    </p>
                                </BuilderHit>
                            ) : builder ? (
                                <BuilderHit field="subtitle" builder={builder} className="mt-1 block w-full">
                                    <p className="text-[13px] italic text-alloy-midnight/35">Add subtitle…</p>
                                </BuilderHit>
                            ) : null}
                        </div>
                    </div>
                    <span
                        className="inline-flex shrink-0 items-center gap-1.5 pt-0.5 text-[11px] font-medium text-alloy-midnight/50"
                        data-process-status
                    >
                        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[state]}`} />
                        {STATE_WORD[state]}
                    </span>
                </div>

                {/* Metrics — numbers hero, labels support; no colored banner */}
                {signal && primaryFormatted ? (
                    <div className="space-y-4" data-process-answer>
                        {showInlineMetricPair && supportingFormatted ? (
                            <div
                                className="grid grid-cols-2 gap-6"
                                data-process-metrics-inline
                                data-process-composite-metric
                            >
                                <BuilderHit field="primaryMetricTitle" builder={builder}>
                                    <MetricUnit formatted={primaryFormatted} size="primary" />
                                </BuilderHit>
                                <BuilderHit field="supportingMetricTitle" builder={builder}>
                                    <MetricUnit formatted={supportingFormatted} size="supporting" />
                                </BuilderHit>
                            </div>
                        ) : (
                            <>
                                <BuilderHit field="primaryMetricTitle" builder={builder} className="block w-full">
                                    <MetricUnit formatted={primaryFormatted} size="primary" />
                                </BuilderHit>
                                {showStackedSupporting && supportingFormatted ? (
                                    <BuilderHit field="supportingMetricTitle" builder={builder} className="block w-full">
                                        <div data-process-supporting-signal>
                                            <MetricUnit formatted={supportingFormatted} size="supporting" />
                                        </div>
                                    </BuilderHit>
                                ) : builder ? (
                                    <BuilderHit field="supportingMetricTitle" builder={builder} className="block w-full">
                                        <p className="text-xs italic text-alloy-midnight/35">Supporting metric…</p>
                                    </BuilderHit>
                                ) : null}
                            </>
                        )}
                        {shouldShowPrimaryMetricLabel && builder ? (
                            <p className="text-xs italic text-alloy-midnight/35">Primary metric resolves without a value</p>
                        ) : null}
                    </div>
                ) : (
                    <div data-process-answer>
                        <p className="text-sm font-medium text-alloy-midnight/45">No signal configured yet</p>
                    </div>
                )}

                {/* Supporting context — target/trend text only when the calculation supplies it */}
                {signal && (signal.supportingContext || signal.trend) ? (
                    <p className="-mt-2 text-[12px] leading-relaxed text-alloy-midnight/45" data-process-context>
                        {[signal.trend, signal.supportingContext].filter(Boolean).join(" · ")}
                    </p>
                ) : null}

                {/* Today's Work */}
                {showTodaysWork ? (
                    <div className="border-t border-alloy-stone/20 pt-5" data-process-todays-work>
                        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/40">
                            Today&apos;s Work
                        </p>
                        <WorkViewList workViews={todaysWork} showCounts={config.todaysWork.showCounts} />
                    </div>
                ) : null}

                {/* Open workspace — text affordance, not a heavy button */}
                <div className="mt-auto border-t border-alloy-stone/20 pt-4">
                    {builder ? (
                        <BuilderHit field="cta" builder={builder}>
                            <span
                                className={`inline-flex items-center gap-1 text-[13px] font-semibold ${ctaClasses}`}
                                data-process-cta
                            >
                                {ctaLabel}
                                <span aria-hidden className="text-alloy-midnight/35">→</span>
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
                            className={`inline-flex items-center gap-1 text-[13px] font-semibold no-underline transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${ctaClasses}`}
                        >
                            {ctaLabel}
                            <span aria-hidden className="text-alloy-midnight/35">→</span>
                        </Link>
                    )}
                </div>
            </div>
        </article>
    );
}
