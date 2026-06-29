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
                { key: "question", label: "Question", kind: "textarea" },
            ],
        },
        { key: "content", label: "Content", fields: [{ key: "contentId", label: "Content", kind: "content" }] },
        { key: "renderer", label: "Renderer", fields: [{ key: "rendererKey", label: "Renderer", kind: "renderer" }] },
        {
            key: "configure",
            label: "Configure",
            fields: [
                { key: "thresholds", label: "Tone thresholds", kind: "thresholds" },
                {
                    key: "comparison",
                    label: "Comparison",
                    kind: "select",
                    options: [
                        { value: "off", label: "Off" },
                        { value: "prior", label: "Prior period" },
                    ],
                },
                { key: "drill", label: "Drill to", kind: "select", options: [{ value: "default", label: "Default queue" }] },
            ],
        },
        {
            key: "promote",
            label: "Promote",
            fields: [
                { key: "promotedTo", label: "Promote to", kind: "promote", options: OPERATIONAL_INTELLIGENCE_PROMOTE_TARGETS },
            ],
        },
    ],
};

/**
 * Renders the real Operational Intelligence card chrome (the runtime MetricCardShell)
 * so the builder canvas shows actual cards, not rectangles. Values are dashes in the
 * builder (no live resolution at author time); the live values render in the runtime.
 */
const runtimeRenderer: SurfaceRuntimeRenderer = {
    renderCard: (instance, ctx) => {
        const calc = instance.contentId ? findOperationalCalculation(instance.contentId) : null;
        return (
            <MetricCardShell
                label={ctx.contentLabel || "Choose content"}
                visual="metric_scorecard"
                question={calc?.questionAnswered ?? null}
                status="unknown"
                showHealthChip={false}
            >
                <MetricCardValue value="—" />
                <p className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/35">
                    {instance.cardTypeKey} · preview
                </p>
            </MetricCardShell>
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
    };
}
