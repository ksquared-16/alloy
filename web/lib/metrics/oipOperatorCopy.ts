import type { MetricPackDefinition } from "@/lib/metrics/packs";
import { getMetricDefinition } from "@/lib/metrics/registry";
import { listKpiPlacementCatalog } from "@/lib/metrics/kpiPlacementCatalog";
import { kpiPlacementSurfaceOperatorLabel } from "@/lib/metrics/kpiPlacementCatalog";

/** Short labels for executive summary row. */
export const OIP_SUMMARY_LABELS: Record<string, string> = {
    "enrollment.tour_conversion_rate": "Tour Conversion",
    "enrollment.time_to_schedule_tour": "Time To Tour",
    "forms.completion_rate": "Forms Completion",
    "ops.work_overdue_count": "Overdue Work",
    "ops.needs_attention_count": "Needs Attention",
};

export function oipSummaryLabel(metricKey: string): string {
    return OIP_SUMMARY_LABELS[metricKey] ?? getMetricDefinition(metricKey as Parameters<typeof getMetricDefinition>[0]).label;
}

/** One-line purpose for operational playbook cards. */
export function packOperatorPurpose(pack: MetricPackDefinition): string {
    switch (pack.key) {
        case "enrollment":
            return "Measure how efficiently families move from inquiry to enrollment.";
        case "communications":
            return "Measure whether families receive and respond to your outreach.";
        case "forms":
            return "Measure how completely families finish required enrollment paperwork.";
        case "operational_health":
            return "Surface overdue work and attention signals before items slip.";
        default:
            return pack.description;
    }
}

/** Operator-facing copy for performance packs — no internal keys. */
export function packOperatorWhyItMatters(pack: MetricPackDefinition): string {
    switch (pack.key) {
        case "enrollment":
            return "Shows how quickly families move from inquiry to tour and how often tours convert — the heartbeat of your pipeline.";
        case "communications":
            return "Tracks whether outbound messages reach families and whether conversations stay active.";
        case "forms":
            return "Measures how completely families finish required enrollment paperwork.";
        case "operational_health":
            return "Surfaces overdue work and attention signals so nothing slips through the cracks.";
        default:
            return pack.description;
    }
}

export function packOperatorSurfaces(packKey: string): string[] {
    const catalog = listKpiPlacementCatalog().filter((r) => r.pack === packKey);
    const surfaces = new Set<string>();
    for (const row of catalog) {
        for (const s of row.surfaces) {
            surfaces.add(kpiPlacementSurfaceOperatorLabel(s));
        }
    }
    return [...surfaces];
}

export function packOperatorIndicators(pack: MetricPackDefinition): { label: string; description: string }[] {
    return pack.metricKeys.map((key) => {
        const def = getMetricDefinition(key);
        return { label: def.label, description: def.description };
    });
}
