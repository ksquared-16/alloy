"use client";
import type { MouseEvent as ReactMouseEvent } from "react";

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
import { PROCESS_CARD_ACCENT_STYLES, processTileAccentBorderHover, processTileAccentTopBorder, processTileIdentityWellClass } from "@/lib/presentation/runtime/processCardAccentStyles";
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
import { useRuntimeKernelOptional } from "@/lib/runtime/kernel/RuntimeKernelContext";
import { ATTENTION_SCOPE } from "@/lib/runtime/kernel/attention";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { ProcessCardGlyph } from "./ProcessCardGlyph";
import {
    WS_KPI_CARD_CHROME,
    WS_METRIC_UNIT_CHROME,
    WS_PROCESS_TILE_CHROME,
    WS_PROCESS_TILE_CHROME_HOVER,
} from "@/components/workspace/workspaceTokens";

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
    dataAttr,
    role = "primary",
}: {
    formatted: FormattedProcessSummaryMetric;
    dataAttr?: string;
    role?: "primary" | "supporting";
}) {
    const value =
        formatted.kind === "value" ? formatted.displayValue : PROCESS_SUMMARY_METRIC_EMPTY;
    return (
        <div className={WS_METRIC_UNIT_CHROME} {...(dataAttr ? { [dataAttr]: true } : {})}>
            <p
                className="text-[24px] font-semibold tabular-nums leading-none tracking-[-0.03em] text-alloy-midnight"
                {...(role === "primary"
                    ? { "data-process-metric-value": true }
                    : { "data-process-supporting-metric-value": true })}
            >
                {value}
            </p>
            <p
                className="mt-1.5 text-[11px] font-medium leading-snug text-alloy-midnight/42"
                {...(role === "primary"
                    ? { "data-process-metric-title": true }
                    : { "data-process-supporting-metric-title": true })}
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
    const identityWellClasses =
        showChip && accentStyle ? `${processTileIdentityWellClass(identity.accent)} ${accentStyle.metricText}` : NEUTRAL_CHIP;
    const accentTopBorder = processTileAccentTopBorder(identity.accent);
    const accentBorderHover = processTileAccentBorderHover(identity.accent);
    const ctaClasses = accentStyle ? `${accentStyle.metricText} hover:opacity-80` : DEFAULT_CTA;

    const slug = useMemo(
        () => parseOperatorWorkUnitEntryHref(drillHref).workUnitSlug,
        [drillHref],
    );
    const warm = () => {
        if (slug) void warmWorkUnitSlugRoute(slug, "workspace_tile");
    };

    // ── THE OPERATOR GESTURE — K1, not the router. ──
    // Normal activation is an ATTENTION MOVEMENT: it is accepted and acknowledged synchronously,
    // K2 begins preparing immediately, and the Workspace yields — all before any navigation could
    // have committed. The router is never allowed to reveal the destination; reveal belongs to K3
    // and only a K2 terminal may cause it.
    // Modifier/middle clicks fall through to the browser deliberately: opening a new tab is a
    // request for a NEW DOCUMENT, which hydrates its own attention from the URL on cold load
    // (Art 2.4). Keyboard activation arrives here as a click, so pointer and keyboard share this
    // one adapter.
    const kernel = useRuntimeKernelOptional();
    const { orgId, principalUserId } = useWorkspaceOrg();
    const onGesture = (e: ReactMouseEvent<HTMLAnchorElement>) => {
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        // No attention yet (the Workspace has not hydrated) → let the browser navigate. A gesture is
        // never a URL read, so it must not hydrate; the destination document will hydrate itself.
        if (!kernel || !slug || !orgId || !kernel.attention.get()) return;
        e.preventDefault();
        const lens = new URL(drillHref, "http://x").searchParams.get("work_view_id");
        kernel.attention.move({ scope: ATTENTION_SCOPE.SURFACE, target: slug, lens, source: "pointer" });
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
            className={`flex h-full min-h-[9rem] flex-col overflow-hidden ${WS_PROCESS_TILE_CHROME} ${WS_PROCESS_TILE_CHROME_HOVER} ${accentTopBorder} ${accentBorderHover}`}
        >
            <div className="flex flex-1 flex-col gap-3 px-3.5 pb-3.5 pt-3.5">
                {/* Header — identity + subtle health */}
                <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                        {(showChip || builder) ? (
                            <BuilderHit field="identity" builder={builder} className="shrink-0 rounded-xl">
                                <span
                                    data-process-identity-chip={showChip ? true : undefined}
                                    data-process-icon={identity.icon}
                                    className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${identityWellClasses}`}
                                >
                                    <ProcessCardGlyph icon={identity.icon} className="h-[15px] w-[15px]" />
                                </span>
                            </BuilderHit>
                        ) : null}
                        <div className="min-w-0 pt-0.5">
                            <BuilderHit field="title" builder={builder} className="block w-full">
                                <h3
                                    data-process-title
                                    className="min-w-0 truncate text-[15px] font-semibold leading-snug tracking-[-0.01em] text-alloy-midnight"
                                >
                                    {title}
                                </h3>
                            </BuilderHit>
                            {subtitle ? (
                                <BuilderHit field="subtitle" builder={builder} className="mt-1 block w-full">
                                    <p
                                        data-process-subtitle
                                        className="line-clamp-2 text-[13px] leading-relaxed text-alloy-midnight/42"
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
                        className="inline-flex shrink-0 items-center gap-1.5 pt-0.5 text-[11px] font-medium text-alloy-midnight/40"
                        data-process-status
                    >
                        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[state]}`} />
                        {STATE_WORD[state]}
                    </span>
                </div>

                {/* Metrics — numbers hero, labels support; no colored banner */}
                {signal && primaryFormatted ? (
                    <div className="space-y-3" data-process-answer>
                        {showInlineMetricPair && supportingFormatted ? (
                            <div
                                className="grid grid-cols-2 items-stretch gap-2.5"
                                data-process-metrics-inline
                                data-process-composite-metric
                            >
                                <BuilderHit field="primaryMetricTitle" builder={builder} className="block h-full min-w-0">
                                    <MetricUnit formatted={primaryFormatted} dataAttr="data-process-primary-metric" />
                                </BuilderHit>
                                <BuilderHit field="supportingMetricTitle" builder={builder} className="block h-full min-w-0">
                                    <MetricUnit formatted={supportingFormatted} dataAttr="data-process-supporting-metric" role="supporting" />
                                </BuilderHit>
                            </div>
                        ) : (
                            <>
                                <BuilderHit field="primaryMetricTitle" builder={builder} className="block w-full">
                                    <MetricUnit formatted={primaryFormatted} dataAttr="data-process-primary-metric" />
                                </BuilderHit>
                                {showStackedSupporting && supportingFormatted ? (
                                    <BuilderHit field="supportingMetricTitle" builder={builder} className="block w-full">
                                        <div data-process-supporting-signal>
                                            <MetricUnit formatted={supportingFormatted} dataAttr="data-process-supporting-metric" role="supporting" />
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
                        <p className="text-sm font-medium text-alloy-midnight/40">No signal configured yet</p>
                    </div>
                )}

                {/* Supporting context — target/trend text only when the calculation supplies it */}
                {signal && (signal.supportingContext || signal.trend) ? (
                    <p className="-mt-2 text-[12px] leading-relaxed text-alloy-midnight/38" data-process-context>
                        {[signal.trend, signal.supportingContext].filter(Boolean).join(" · ")}
                    </p>
                ) : null}

                {/* Today's Work */}
                {showTodaysWork ? (
                    <div className="border-t border-alloy-stone/22 pt-3" data-process-todays-work>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/35">
                            Today&apos;s Work
                        </p>
                        <WorkViewList
                            workViews={todaysWork}
                            showCounts={config.todaysWork.showCounts}
                            processAccent={identity.accent}
                        />
                    </div>
                ) : null}

                {/* Open workspace — text affordance, bottom-right continuation */}
                <div className="mt-auto flex justify-end border-t border-alloy-stone/22 pt-2.5">
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
                            // The href stays: it is the honest ADDRESS of the destination, so
                            // copy-link, open-in-new-tab and modifier-click keep working through the
                            // browser (a new document hydrates attention from the URL on cold load —
                            // Art 2.4). But normal in-app activation is an ATTENTION MOVEMENT, not a
                            // navigation: `onGesture` preventDefaults and enters K1 instead. The
                            // router must never reveal the Work Unit, because reveal belongs to K3
                            // and only a K2 terminal may cause it.
                            prefetch={false}
                            aria-label={`Open ${process.label}`}
                            data-process-cta
                            onClick={onGesture}
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
