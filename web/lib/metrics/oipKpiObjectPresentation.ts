import type { MetricResolveApiItem } from "@/app/api/admin/metrics/resolve/route";
import type { OipHealthStatus } from "@/lib/metrics/oipStatusPresentation";
import { normalizeOipHealthStatus } from "@/lib/metrics/oipStatusPresentation";

export function formatTargetFromKpi(kpi: MetricResolveApiItem["kpi"] | undefined | null): string | null {
    if (!kpi) return null;
    if (kpi.target_kind === "rate_min" && kpi.target_min_rate != null) {
        return `${Math.round(kpi.target_min_rate * 100)}%`;
    }
    if (kpi.target_kind === "duration_max_hours" && kpi.target_max_hours != null) {
        return `${kpi.target_max_hours}h`;
    }
    if (kpi.target_kind === "count_max" && kpi.target_max_count != null) {
        return `< ${kpi.target_max_count}`;
    }
    return null;
}

export function formatTargetDisplayLabel(target: string | null | undefined): string | null {
    if (!target) return null;
    return `Goal ${target}`;
}

export function oipStatusOperatorLabel(status: OipHealthStatus | string | undefined | null): string {
    switch (status) {
        case "healthy":
            return "On track";
        case "warning":
            return "Needs Review";
        case "critical":
            return "Critical";
        default:
            return "No data yet";
    }
}

/** Primary readout for health cards — avoids repeating loud "No data" as the headline value. */
export function oipHealthPrimaryValue(status: OipHealthStatus | string | undefined | null): string {
    switch (status) {
        case "healthy":
        case "warning":
        case "critical":
            return oipStatusOperatorLabel(status);
        default:
            return "—";
    }
}

export function oipMetricDisplayValue(value: string | null | undefined): string {
    const trimmed = String(value ?? "").trim();
    if (!trimmed || trimmed.toLowerCase() === "no data") return "—";
    return trimmed;
}

export function oipShouldShowStatusLine(
    status: OipHealthStatus | string | undefined | null,
    variant: "metric" | "health"
): boolean {
    if (variant === "health") return false;
    return normalizeOipHealthStatus(status) !== "unknown";
}

export function oipStatusIcon(status: OipHealthStatus | string | undefined | null): string {
    switch (status) {
        case "healthy":
            return "✓";
        case "warning":
            return "⚠";
        case "critical":
            return "●";
        default:
            return "—";
    }
}

export function oipKpiObjectBorderClass(status: OipHealthStatus | string | undefined | null): string {
    switch (normalizeOipHealthStatus(status)) {
        case "healthy":
            return "border-alloy-juniper/55";
        case "warning":
            return "border-alloy-amber/60";
        case "critical":
            return "border-alloy-ember/60";
        default:
            return "border-alloy-midnight/18";
    }
}

export function oipKpiObjectStatusTextClass(status: OipHealthStatus | string | undefined | null): string {
    switch (status) {
        case "healthy":
            return "text-alloy-juniper";
        case "warning":
            return "text-alloy-amber";
        case "critical":
            return "text-alloy-ember";
        default:
            return "text-alloy-midnight/45";
    }
}

export function oipKpiObjectValueClass(status: OipHealthStatus | string | undefined | null): string {
    switch (status) {
        case "healthy":
            return "text-alloy-midnight";
        case "warning":
            return "text-alloy-midnight";
        case "critical":
            return "text-alloy-ember";
        default:
            return "text-alloy-midnight";
    }
}

/** Premium health chip — white surface, status via border + text only. */
export function oipHealthPremiumChipClass(status: OipHealthStatus | string | undefined | null): string {
    switch (status) {
        case "healthy":
            return "border-alloy-juniper/50 bg-white text-alloy-juniper";
        case "warning":
            return "border-alloy-amber/45 bg-white text-alloy-amber";
        case "critical":
            return "border-alloy-ember/45 bg-white text-alloy-ember";
        default:
            return "border-alloy-stone/20 bg-white text-alloy-midnight/50";
    }
}
