import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { OipMetricKey } from "@/lib/metrics/types";

/** Approved workspace operational pulse — max four cross-cutting signals. */
export const OPERATIONAL_PULSE_STRIP_KEYS: readonly string[] = [
    "oip.enrollment.tour_conversion_rate",
    "oip.ops.needs_attention_count",
    "oip.ops.work_overdue_count",
    "oip.forms.completion_rate",
];

export const OPERATIONAL_PULSE_METRIC_KEYS: readonly OipMetricKey[] = [
    "enrollment.tour_conversion_rate",
    "ops.needs_attention_count",
    "ops.work_overdue_count",
    "forms.completion_rate",
];

export const MAX_OPERATIONAL_PULSE_METRICS = 4;

export function sortPerformanceKpis(kpis: KPIVm[]): KPIVm[] {
    const order = new Map(OPERATIONAL_PULSE_STRIP_KEYS.map((id, i) => [id, i]));
    return [...kpis].sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
}

const INVENTORY_NEEDS_ATTENTION_KEYS = new Set([
    "ctx.wu.needs_attention_count",
    "ctx.dept.needs_attention_count",
    "baseline.ctx.wu.needs_attention_count",
    "baseline.ctx.dept.needs_attention_count",
]);

/** Split workspace strip into pipeline inventory vs operational intelligence performance. */
export function splitWorkspaceKpiBands(kpis: KPIVm[]): { inventory: KPIVm[]; performance: KPIVm[] } {
    const performance = kpis.filter((k) => k.id.startsWith("oip."));
    const hasOipNeedsAttention = performance.some((k) => k.id === "oip.ops.needs_attention_count");

    const inventory = kpis.filter((k) => {
        if (k.id.startsWith("oip.")) return false;
        if (hasOipNeedsAttention && INVENTORY_NEEDS_ATTENTION_KEYS.has(k.id)) return false;
        if (hasOipNeedsAttention && k.label.toLowerCase().includes("needs attention")) return false;
        return true;
    });

    return { inventory, performance };
}

export function filterPerformanceKpis(kpis: KPIVm[]): KPIVm[] {
    return kpis.filter((k) => k.id.startsWith("oip."));
}

/** Operational pulse row — capped at four approved metrics, ordered consistently. */
export function filterOperationalPulseKpis(kpis: KPIVm[]): KPIVm[] {
    const allowed = new Set(OPERATIONAL_PULSE_STRIP_KEYS);
    const pulse = filterPerformanceKpis(kpis).filter((k) => allowed.has(k.id));
    return sortPerformanceKpis(pulse).slice(0, MAX_OPERATIONAL_PULSE_METRICS);
}

export function isOipKpiCell(kpi: KPIVm): boolean {
    return kpi.id.startsWith("oip.");
}
