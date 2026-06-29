/**
 * Operational Intelligence — Surface Definition (consumer #2 of the platform builder).
 *
 * Operational Intelligence is NOT a special builder; it is a definition handed to the
 * one platform `SurfaceBuilder`. Content comes from the Operational Calculations
 * registry; card types map to the metric renderers; placement ("Promote to") and the
 * persistence store are the only surface-specific I/O. No builder code lives here.
 */

import {
    listOperationalCalculations,
    findOperationalCalculation,
} from "@/lib/analytics/calculations/registry";
import type { OperationalCalculation } from "@/lib/analytics/calculations/types";
import { MetricCardShell, MetricCardValue } from "@/components/admin/metrics/MetricCardShell";
import type {
    SurfaceDefinition,
    SurfacePersistenceAdapter,
    ContentDefinition,
    ContentSourceProvider,
    CardDefinition,
    RendererDefinition,
    InspectorSchema,
    SurfaceRuntimeRenderer,
} from "@/lib/platform/surfaceBuilder/surfaceDefinition";

const BUSINESS_PROCESS_LABEL: Record<OperationalCalculation["businessProcess"], string> = {
    enrollment: "Enrollment",
    communications: "Communications",
    forms: "Forms",
    operational_health: "Operations",
    capacity: "Capacity",
    financial: "Financial",
};

/** Content = the Operational Calculations registry. The operator never sees "metric definition". */
export function operationalIntelligenceContentSource(): ContentSourceProvider {
    const items: ContentDefinition[] = listOperationalCalculations().map((calc) => ({
        id: calc.key,
        label: calc.label,
        question: calc.questionAnswered,
        group: BUSINESS_PROCESS_LABEL[calc.businessProcess] ?? "Other",
        availability: calc.status === "active" ? "live" : "available",
    }));
    const byId = new Map(items.map((i) => [i.id, i]));
    return {
        list: () => items,
        resolveLabel: (id) => byId.get(id)?.label ?? id,
    };
}

export const OPERATIONAL_INTELLIGENCE_CARD_TYPES: readonly CardDefinition[] = [
    { key: "kpi", label: "KPI", icon: "▦", rendererKey: "kpi_card", group: "Measure" },
    { key: "trend", label: "Trend", icon: "📈", rendererKey: "trend_card", group: "Measure" },
    { key: "gauge", label: "Gauge", icon: "◔", rendererKey: "gauge", group: "Measure" },
    { key: "comparison", label: "Comparison", icon: "⇄", rendererKey: "comparison", group: "Measure" },
    { key: "breakdown", label: "Breakdown", icon: "▥", rendererKey: "bar_chart", group: "Understand" },
    { key: "table", label: "Table", icon: "≣", rendererKey: "table", group: "Understand" },
    { key: "health", label: "Health", icon: "✓", rendererKey: "scorecard", group: "Understand" },
    { key: "affected_work", label: "Affected work", icon: "⚑", rendererKey: "affected_work", group: "Operational" },
];

export const OPERATIONAL_INTELLIGENCE_RENDERERS: readonly RendererDefinition[] = [
    { key: "kpi_card", label: "KPI value" },
    { key: "trend_card", label: "Trend" },
    { key: "gauge", label: "Health gauge" },
    { key: "comparison", label: "Comparison" },
    { key: "bar_chart", label: "Bars" },
    { key: "table", label: "Table" },
    { key: "scorecard", label: "Scorecard" },
    { key: "chip", label: "Chip" },
];

/** Surfaces an OI card can be promoted to (placement, named for operators). */
export const OPERATIONAL_INTELLIGENCE_PROMOTE_TARGETS = [
    { value: "operational_intelligence", label: "Operational Intelligence" },
    { value: "workspace_header", label: "Workspace header" },
    { value: "work_unit_header", label: "Work unit header" },
    { value: "executive_performance", label: "Executive Performance" },
    { value: "enrollment_intelligence", label: "Enrollment Intelligence" },
    { value: "report", label: "Reports" },
] as const;

export const OPERATIONAL_INTELLIGENCE_INSPECTOR: InspectorSchema = {
    tabs: [
        {
            key: "card",
            label: "Card",
            fields: [
                { key: "title", label: "Title", kind: "text" },
                { key: "description", label: "Description", kind: "textarea" },
                { key: "visibility", label: "Visible on the surface", kind: "toggle" },
            ],
        },
        {
            key: "content",
            label: "Content",
            fields: [
                { key: "contentId", label: "Metric / calculation", kind: "content" },
                { key: "question", label: "Question it answers", kind: "textarea" },
            ],
        },
        { key: "renderer", label: "Renderer", fields: [{ key: "rendererKey", label: "Renderer", kind: "renderer" }] },
        {
            key: "behavior",
            label: "Behavior",
            fields: [
                { key: "thresholds", label: "Tone thresholds", kind: "thresholds" },
                {
                    key: "comparison",
                    label: "Comparison",
                    kind: "select",
                    options: [
                        { value: "off", label: "Off" },
                        { value: "prior", label: "Prior period" },
                        { value: "target", label: "Target" },
                    ],
                },
                { key: "drill", label: "Drill to", kind: "select", options: [{ value: "default", label: "Default queue" }] },
                {
                    key: "refresh",
                    label: "Refresh",
                    kind: "select",
                    options: [
                        { value: "live", label: "Live" },
                        { value: "hourly", label: "Hourly" },
                        { value: "daily", label: "Daily" },
                    ],
                },
            ],
        },
        {
            key: "placement",
            label: "Placement",
            fields: [
                { key: "promotedTo", label: "Where this appears", kind: "promote", options: OPERATIONAL_INTELLIGENCE_PROMOTE_TARGETS },
            ],
        },
    ],
};

const CARD_TYPE_DEFAULT_RENDERER: Record<string, string> = {
    kpi: "kpi_card",
    trend: "trend_card",
    gauge: "gauge",
    comparison: "comparison",
    breakdown: "bar_chart",
    table: "table",
    health: "scorecard",
    affected_work: "affected_work",
};

/** Renderer-specific body — the canvas reacts the instant the renderer changes. */
function rendererBody(renderer: string, showCompare: boolean) {
    const compare = showCompare ? (
        <p className="text-[11px] font-medium text-alloy-midnight/40">vs prior period</p>
    ) : null;
    switch (renderer) {
        case "trend_card":
        case "sparkline":
        case "line_chart":
        case "area_chart":
            return (
                <>
                    <MetricCardValue value="—" />
                    <svg viewBox="0 0 220 40" preserveAspectRatio="none" className="h-9 w-full">
                        <polyline points="0,28 40,22 80,26 120,16 160,22 200,12 220,16" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-alloy-pine/40" />
                    </svg>
                    {compare}
                </>
            );
        case "gauge":
            return (
                <div className="flex items-center gap-3">
                    <svg width="56" height="56" viewBox="0 0 56 56"><circle cx="28" cy="28" r="22" fill="none" strokeWidth="7" className="stroke-alloy-stone/15" /><circle cx="28" cy="28" r="22" fill="none" strokeWidth="7" strokeDasharray="138" strokeDashoffset="48" strokeLinecap="round" transform="rotate(-90 28 28)" className="stroke-alloy-pine/45" /></svg>
                    <MetricCardValue value="—" />
                </div>
            );
        case "bar_chart":
            return (
                <div className="flex flex-col gap-1.5 pt-1">
                    {[70, 90, 55].map((w, i) => (
                        <div key={i} className="h-2 rounded-full bg-alloy-stone/10"><div className="h-full rounded-full bg-alloy-pine/35" style={{ width: `${w}%` }} /></div>
                    ))}
                </div>
            );
        case "comparison":
            return (
                <>
                    <MetricCardValue value="—" />
                    <p className="text-[11px] font-medium text-alloy-midnight/40">vs prior period</p>
                </>
            );
        case "table":
            return (
                <div className="flex flex-col gap-1.5 pt-1">
                    {[0, 1, 2].map((i) => (
                        <div key={i} className="flex items-center justify-between border-b border-alloy-stone/10 pb-1 text-[11px] text-alloy-midnight/40"><span>Row {i + 1}</span><span>—</span></div>
                    ))}
                </div>
            );
        case "scorecard":
            return (
                <div className="flex items-center gap-2 pt-1">
                    <span className="h-2.5 w-2.5 rounded-full bg-alloy-pine/40" />
                    <span className="text-[12px] font-medium text-alloy-midnight/45">Status</span>
                    <MetricCardValue value="—" />
                </div>
            );
        case "affected_work":
            return (
                <div className="flex items-center gap-2 pt-1 text-[12px] font-medium text-alloy-midnight/45">
                    <span>⚑</span> Affected work panel
                </div>
            );
        default:
            return (
                <>
                    <MetricCardValue value="—" />
                    {compare}
                </>
            );
    }
}

/**
 * Live preview that honors the card's config — renderer, title, question, and comparison
 * all change the canvas card instantly (the inspector edits, the canvas reacts). Values
 * are dashes at author time; real values render in the runtime.
 */
const runtimeRenderer: SurfaceRuntimeRenderer = {
    renderCard: (instance, ctx) => {
        const calc = instance.contentId ? findOperationalCalculation(instance.contentId) : null;
        const cfg = (instance.config ?? {}) as Record<string, unknown>;
        const renderer = String(cfg.rendererKey ?? CARD_TYPE_DEFAULT_RENDERER[instance.cardTypeKey] ?? "kpi_card");
        const title = String((typeof cfg.title === "string" && cfg.title) || ctx.contentLabel || "Choose content");
        const question = (typeof cfg.question === "string" && cfg.question) ? cfg.question : (calc?.questionAnswered ?? null);
        const dimmed = cfg.visibility === "off";
        return (
            <div className={dimmed ? "opacity-45" : undefined}>
                <MetricCardShell label={title} visual={`metric_${renderer}`} question={question} status="unknown" showHealthChip={false}>
                    {rendererBody(renderer, cfg.comparison === "prior" || cfg.comparison === "target")}
                </MetricCardShell>
            </div>
        );
    },
};

/**
 * Build the Operational Intelligence surface definition. The persistence adapter is
 * injected (the `metric_placements` adapter is wired in the next slice; use the in-memory
 * adapter for preview/tests).
 */
export function operationalIntelligenceSurfaceDefinition(
    persistence: SurfacePersistenceAdapter,
): SurfaceDefinition {
    return {
        surfaceType: "operational_intelligence",
        title: "Operational Intelligence",
        sections: "authorable",
        cardTypes: OPERATIONAL_INTELLIGENCE_CARD_TYPES,
        renderers: OPERATIONAL_INTELLIGENCE_RENDERERS,
        contentSource: operationalIntelligenceContentSource(),
        inspectorSchema: OPERATIONAL_INTELLIGENCE_INSPECTOR,
        runtimeRenderer,
        persistence,
        immediatePersist: true,
        appearsIn: "Workspace → Analytics modal",
        runtimeHref: "/workspace?workspaceModal=analytics",
    };
}
