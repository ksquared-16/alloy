import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import type { MetricPackDefinition } from "@/lib/metrics/packs";
import { listMetricPacks } from "@/lib/metrics/packs";

export type WorkspaceHealthStatus = "healthy" | "warning" | "critical" | "unknown";

export type WorkspaceHealthSummary = {
    business: WorkspaceHealthStatus;
    operational: WorkspaceHealthStatus;
    enrollment: WorkspaceHealthStatus;
};

function packHealthFromResolved(pack: MetricPackDefinition, resolved: ResolvedMetricMap): WorkspaceHealthStatus {
    if (pack.domainStatus !== "available" || !pack.metricKeys.length) return "unknown";
    const statuses = pack.metricKeys
        .map((k) => resolved[k]?.kpi?.status)
        .filter((s): s is string => Boolean(s && s !== "unknown"));
    if (!statuses.length) return "unknown";
    if (statuses.some((s) => s === "critical")) return "critical";
    if (statuses.some((s) => s === "warning")) return "warning";
    if (statuses.every((s) => s === "healthy")) return "healthy";
    return "unknown";
}

function worstStatus(a: WorkspaceHealthStatus, b: WorkspaceHealthStatus): WorkspaceHealthStatus {
    const rank: Record<WorkspaceHealthStatus, number> = { critical: 3, warning: 2, healthy: 1, unknown: 0 };
    return rank[a] >= rank[b] ? a : b;
}

export function computeWorkspaceHealthSummary(resolved: ResolvedMetricMap): WorkspaceHealthSummary {
    const packs = listMetricPacks();
    const enrollment = packHealthFromResolved(packs.find((p) => p.key === "enrollment")!, resolved);
    const operational = packHealthFromResolved(packs.find((p) => p.key === "operational_health")!, resolved);
    const forms = packHealthFromResolved(packs.find((p) => p.key === "forms")!, resolved);
    const comms = packHealthFromResolved(packs.find((p) => p.key === "communications")!, resolved);
    let business: WorkspaceHealthStatus = "unknown";
    for (const s of [enrollment, operational, forms, comms]) {
        business = worstStatus(business, s);
    }
    return { business, operational, enrollment };
}

export function workspaceHealthLabel(status: WorkspaceHealthStatus): string {
    switch (status) {
        case "healthy":
            return "Healthy";
        case "warning":
            return "Needs attention";
        case "critical":
            return "Critical";
        default:
            return "No data";
    }
}

export function workspaceHealthChipClass(status: WorkspaceHealthStatus): string {
    switch (status) {
        case "healthy":
            return "border-alloy-juniper/30 bg-alloy-juniper/10 text-alloy-juniper";
        case "warning":
            return "border-alloy-amber/35 bg-alloy-amber/10 text-alloy-amber";
        case "critical":
            return "border-alloy-ember/35 bg-alloy-ember/10 text-alloy-ember";
        default:
            return "border-alloy-stone/20 bg-white text-alloy-midnight/45";
    }
}

/** Operator-facing section labels (Phase 3C). */
export const OPERATOR_BUSINESS_PROCESSES_LABEL = "Business Processes";
export const OPERATOR_BUSINESS_PROCESS_SINGULAR = "Business Process";
