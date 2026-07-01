"use client";

import { useCallback, useState, type ReactNode } from "react";

import type {
    AffectedWorkItem,
    DrillDestination,
    FilterDimension,
    NarrativeInsight,
    Recommendation,
} from "./types";
import { DRILL_META, TONE_BG, TONE_RAIL, TONE_SOFT, TONE_TEXT, tone } from "./tokens";

/**
 * Slice 2 surface primitives — reusable, Alloy-native composition pieces that
 * move Analytics beyond KPI tiles: sections, insight/diagnostic panels, affected
 * work, recommendations, command panels, report sections, forecast, filter bar.
 *
 * Presentation only. Drill handlers are fixture-backed in the preview.
 */

// ── Section ──────────────────────────────────────────────────────────────────

export function AnalyticsSection({
    eyebrow,
    title,
    description,
    children,
    id,
}: {
    eyebrow: string;
    title: string;
    description?: string;
    children: ReactNode;
    id?: string;
}) {
    return (
        <section className="rounded-2xl border border-alloy-stone/15 bg-white shadow-sm" data-analytics-preview-surface={id}>
            <header className="border-b border-alloy-stone/15 px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-pine">{eyebrow}</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-alloy-midnight">{title}</h2>
                {description ? <p className="mt-1 max-w-3xl text-sm text-alloy-midnight/55">{description}</p> : null}
            </header>
            <div className="space-y-5 bg-alloy-stone/[0.04] p-5">{children}</div>
        </section>
    );
}

// ── Base panel ───────────────────────────────────────────────────────────────

export function Panel({
    eyebrow,
    title,
    subtitle,
    toneKey = "neutral",
    headerRight,
    footer,
    children,
    accentRail = true,
    dataPanel,
}: {
    eyebrow?: string;
    title: string;
    subtitle?: string;
    toneKey?: AffectedWorkItem["tone"];
    headerRight?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
    accentRail?: boolean;
    dataPanel?: string;
}) {
    return (
        <div
            className={`flex min-w-0 flex-col rounded-xl border border-alloy-stone/15 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)] ${accentRail ? `border-l-[3px] ${TONE_RAIL[tone(toneKey)]}` : ""}`}
            data-analytics-panel={dataPanel}
        >
            <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
                <div className="min-w-0">
                    {eyebrow ? <p className={`text-[10px] font-semibold uppercase tracking-wide ${TONE_TEXT[tone(toneKey)]}`}>{eyebrow}</p> : null}
                    <h3 className="truncate text-sm font-semibold text-alloy-midnight">{title}</h3>
                    {subtitle ? <p className="mt-0.5 text-xs text-alloy-midnight/55">{subtitle}</p> : null}
                </div>
                {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
            </div>
            <div className="px-4 py-3">{children}</div>
            {footer ? <div className="border-t border-alloy-stone/12 px-4 py-2.5 text-xs">{footer}</div> : null}
        </div>
    );
}

// ── Drill destination chip + drill log ───────────────────────────────────────

export function DrillChip({
    destination,
    onDrill,
    emphasis = false,
}: {
    destination: DrillDestination;
    onDrill?: (d: DrillDestination) => void;
    emphasis?: boolean;
}) {
    const meta = DRILL_META[destination.kind];
    return (
        <button
            type="button"
            onClick={onDrill ? () => onDrill(destination) : undefined}
            data-drill-kind={destination.kind}
            className={
                emphasis
                    ? "inline-flex items-center gap-1.5 rounded-lg bg-alloy-pine px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-alloy-pine/90"
                    : "inline-flex items-center gap-1.5 rounded-lg border border-alloy-stone/20 bg-white px-2.5 py-1.5 text-xs font-semibold text-alloy-pine hover:bg-alloy-stone/[0.06]"
            }
        >
            <span aria-hidden="true" className="text-[11px] opacity-80">{meta.glyph}</span>
            <span>{destination.label}</span>
        </button>
    );
}

export type DrillLog = {
    last: DrillDestination | null;
    onDrill: (d: DrillDestination) => void;
    clear: () => void;
};

export function useDrillLog(): DrillLog {
    const [last, setLast] = useState<DrillDestination | null>(null);
    const onDrill = useCallback((d: DrillDestination) => setLast(d), []);
    const clear = useCallback(() => setLast(null), []);
    return { last, onDrill, clear };
}

export function DrillBanner({ log }: { log: DrillLog }) {
    return (
        <div
            className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-alloy-pine/30 bg-alloy-pine/[0.05] px-3 py-2"
            data-drill-banner="true"
            aria-live="polite"
        >
            {log.last ? (
                <p className="min-w-0 text-xs text-alloy-midnight/75">
                    <span className="font-semibold text-alloy-pine">Drill →</span>{" "}
                    <span className="font-semibold text-alloy-midnight">{DRILL_META[log.last.kind].kindLabel}</span>{" "}
                    <span className="text-alloy-midnight/70">{log.last.label}</span>
                    {log.last.scope ? <span className="text-alloy-midnight/45"> · scope: {log.last.scope}</span> : null}
                    <span className="ml-1 rounded bg-white px-1 py-0.5 font-mono text-[10px] text-alloy-midnight/50">{log.last.target}</span>
                </p>
            ) : (
                <p className="text-xs text-alloy-midnight/45">Click any chart mark, row, or action below — its deterministic drill destination shows here.</p>
            )}
            {log.last ? (
                <button type="button" onClick={log.clear} className="shrink-0 text-[11px] font-medium text-alloy-midnight/45 hover:text-alloy-midnight/70">Clear</button>
            ) : null}
        </div>
    );
}

// ── Insight / narrative ──────────────────────────────────────────────────────

export function InsightPanel({ insight, onDrill }: { insight: NarrativeInsight; onDrill?: (d: DrillDestination) => void }) {
    return (
        <div className={`rounded-xl border border-l-[3px] ${TONE_RAIL[tone(insight.tone)]} border-alloy-stone/15 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]`} data-analytics-panel="insight">
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${TONE_TEXT[tone(insight.tone)]}`}>{insight.eyebrow}</p>
            <p className="mt-1 text-sm leading-snug text-alloy-midnight">{insight.headline}</p>
            <div className="mt-2 flex items-baseline gap-2">
                {insight.value ? <span className="text-2xl font-semibold tabular-nums text-alloy-midnight">{insight.value}</span> : null}
                {insight.movement ? <span className={`text-xs font-semibold ${TONE_TEXT[tone(insight.tone)]}`}>{insight.movement}</span> : null}
            </div>
            {insight.drill ? (
                <div className="mt-3">
                    <DrillChip destination={insight.drill} onDrill={onDrill} />
                </div>
            ) : null}
        </div>
    );
}

// ── Affected work ────────────────────────────────────────────────────────────

export function AffectedWorkPanel({
    title,
    subtitle,
    items,
    onDrill,
    emptyHint,
}: {
    title: string;
    subtitle?: string;
    items: AffectedWorkItem[];
    onDrill?: (d: DrillDestination) => void;
    emptyHint?: string;
}) {
    return (
        <Panel title={title} subtitle={subtitle} eyebrow="Affected work" toneKey="critical" dataPanel="affected-work">
            {items.length ? (
                <ul className="space-y-1.5" data-affected-count={items.length}>
                    {items.map((item) => (
                        <li key={item.id}>
                            <button
                                type="button"
                                onClick={onDrill ? () => onDrill(item.drill) : undefined}
                                className="flex w-full items-center gap-3 rounded-lg border border-alloy-stone/12 px-3 py-2 text-left hover:bg-alloy-stone/[0.05]"
                                data-drill-kind={item.drill.kind}
                            >
                                <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${TONE_BG[tone(item.tone)]}`} />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-alloy-midnight">{item.title}</span>
                                    <span className="block truncate text-xs text-alloy-midnight/55">{item.detail}</span>
                                </span>
                                {item.badge ? <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE_SOFT[tone(item.tone)]} border ${TONE_TEXT[tone(item.tone)]}`}>{item.badge}</span> : null}
                                <span aria-hidden="true" className="shrink-0 text-alloy-midnight/30">›</span>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="py-3 text-center text-xs text-alloy-midnight/45">{emptyHint ?? "Select an insight or chart mark to see affected work."}</p>
            )}
        </Panel>
    );
}

// ── Recommendations ──────────────────────────────────────────────────────────

export function RecommendationPanel({
    title,
    recommendations,
    onDrill,
}: {
    title: string;
    recommendations: Recommendation[];
    onDrill?: (d: DrillDestination) => void;
}) {
    return (
        <Panel title={title} eyebrow="Recommended" toneKey="healthy" dataPanel="recommendation">
            <ul className="space-y-2.5">
                {recommendations.map((rec) => (
                    <li key={rec.id} className="rounded-lg border border-alloy-stone/12 p-3">
                        <p className="text-sm font-medium text-alloy-midnight">{rec.title}</p>
                        <p className="mt-0.5 text-xs text-alloy-midnight/55">{rec.rationale}</p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            {rec.projectedImpact ? (
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_SOFT[tone(rec.tone ?? "healthy")]} border ${TONE_TEXT[tone(rec.tone ?? "healthy")]}`}>
                                    {rec.projectedImpact}
                                </span>
                            ) : <span />}
                            <DrillChip destination={rec.action} onDrill={onDrill} emphasis />
                        </div>
                    </li>
                ))}
            </ul>
        </Panel>
    );
}

// ── Command panel ────────────────────────────────────────────────────────────

export function CommandPanel({
    title,
    subtitle,
    commands,
    onDrill,
}: {
    title: string;
    subtitle?: string;
    commands: DrillDestination[];
    onDrill?: (d: DrillDestination) => void;
}) {
    return (
        <Panel title={title} subtitle={subtitle} eyebrow="Take action" toneKey="neutral" dataPanel="command">
            <div className="flex flex-wrap gap-2">
                {commands.map((cmd) => (
                    <DrillChip key={cmd.target} destination={cmd} onDrill={onDrill} />
                ))}
            </div>
        </Panel>
    );
}

// ── Diagnostic panel (chart + caption) ───────────────────────────────────────

export function DiagnosticPanel({
    title,
    question,
    caption,
    toneKey = "warning",
    headerRight,
    footer,
    children,
}: {
    title: string;
    question: string;
    caption?: string;
    toneKey?: AffectedWorkItem["tone"];
    headerRight?: ReactNode;
    footer?: ReactNode;
    children: ReactNode;
}) {
    return (
        <Panel title={title} eyebrow={question} subtitle={caption} toneKey={toneKey} headerRight={headerRight} footer={footer} dataPanel="diagnostic">
            {children}
        </Panel>
    );
}

// ── Report section (less operational, business-cycle output) ─────────────────

export function ReportSection({
    title,
    period,
    children,
    footnote,
}: {
    title: string;
    period: string;
    children: ReactNode;
    footnote?: string;
}) {
    return (
        <div className="rounded-xl border border-alloy-stone/20 bg-white" data-analytics-panel="report">
            <div className="flex items-baseline justify-between border-b border-alloy-stone/15 px-4 py-3">
                <h3 className="text-sm font-semibold text-alloy-midnight">{title}</h3>
                <span className="text-xs text-alloy-midnight/50">{period}</span>
            </div>
            <div className="px-4 py-3">{children}</div>
            {footnote ? <p className="border-t border-alloy-stone/12 px-4 py-2 text-[11px] text-alloy-midnight/45">{footnote}</p> : null}
        </div>
    );
}

// ── Forecast panel ───────────────────────────────────────────────────────────

export function ForecastPanel({
    title,
    currentLabel,
    currentValue,
    projectedLabel,
    projectedValue,
    note,
    toneKey = "healthy",
    children,
    onDrill,
    action,
}: {
    title: string;
    currentLabel: string;
    currentValue: string;
    projectedLabel: string;
    projectedValue: string;
    note?: string;
    toneKey?: AffectedWorkItem["tone"];
    children?: ReactNode;
    onDrill?: (d: DrillDestination) => void;
    action?: DrillDestination;
}) {
    return (
        <Panel
            title={title}
            eyebrow="Forecast"
            toneKey={toneKey}
            dataPanel="forecast"
            footer={action ? <DrillChip destination={action} onDrill={onDrill} /> : undefined}
        >
            <div className="flex items-end gap-6">
                <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">{currentLabel}</p>
                    <p className="text-xl font-semibold tabular-nums text-alloy-midnight/70">{currentValue}</p>
                </div>
                <span aria-hidden="true" className="pb-1 text-alloy-midnight/30">→</span>
                <div>
                    <p className={`text-[10px] font-medium uppercase tracking-wide ${TONE_TEXT[tone(toneKey)]}`}>{projectedLabel}</p>
                    <p className="text-2xl font-semibold tabular-nums text-alloy-midnight">{projectedValue}</p>
                </div>
            </div>
            {note ? <p className="mt-2 text-xs text-alloy-midnight/55">{note}</p> : null}
            {children ? <div className="mt-3">{children}</div> : null}
        </Panel>
    );
}

// ── Analytics Context Filter Bar ─────────────────────────────────────────────

export function AnalyticsFilterBar({
    dimensions,
    scopeSummary,
}: {
    dimensions: FilterDimension[];
    scopeSummary?: string;
}) {
    const [selected, setSelected] = useState<Record<string, string>>(
        () => Object.fromEntries(dimensions.map((d) => [d.kind, d.value])),
    );

    const summary = scopeSummary ?? dimensions.map((d) => selected[d.kind]).filter(Boolean).join(" · ");

    return (
        <div className="rounded-xl border border-alloy-stone/15 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)]" data-analytics-filter-bar="true">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-pine">Scope</span>
                {dimensions.map((d) => (
                    <label key={d.kind} className="inline-flex items-center gap-1 rounded-lg border border-alloy-stone/20 bg-alloy-stone/[0.04] px-2 py-1 text-xs" data-filter-dimension={d.kind}>
                        <span className="text-alloy-midnight/45">{d.label}:</span>
                        <select
                            value={selected[d.kind]}
                            onChange={(e) => setSelected((prev) => ({ ...prev, [d.kind]: e.target.value }))}
                            className="bg-transparent font-semibold text-alloy-midnight focus:outline-none"
                        >
                            {d.options.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </label>
                ))}
            </div>
            <p className="mt-2 text-[11px] text-alloy-midnight/50">
                <span className="font-semibold text-alloy-midnight/70">Showing:</span> {summary} — filters flow into every card, chart, table, affected-work panel, and drill destination on this surface.
            </p>
        </div>
    );
}
