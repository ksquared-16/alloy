/**
 * Operational Intelligence — measurement collection helpers.
 *
 * Primary grain: OIP KPI-backed measurements (one row per logical measurement).
 * Template + org-copy V2 metric definitions are not peers in this collection.
 */

import type { OipKpiSnapshotRow, OipSettingsSnapshot, OipTargetApiItem } from "@/lib/metrics/fetchOipSettingsSnapshot";
import { isOffTrackStatus, type OipHealthStatus } from "@/lib/metrics/oipStatusPresentation";
import type { OipKpiKey, OipMetricKey } from "@/lib/metrics/types";

export type OiMeasurementOwnership = "platform" | "customized";
export type OiMeasurementLifecycle = "active" | "unavailable";

export type OiMeasurementRow = {
    id: OipKpiKey;
    kpiKey: OipKpiKey;
    metricKey: OipMetricKey;
    label: string;
    pack: string;
    ownership: OiMeasurementOwnership;
    lifecycle: OiMeasurementLifecycle;
    currentDisplay: string;
    targetDisplay: string;
    health: OipHealthStatus;
    hasTrendCandidate: boolean;
};

export type OiOverviewStats = {
    activeCount: number;
    offTargetCount: number;
    insufficientDataCount: number;
    customizedCount: number;
    activePackCount: number;
    lastUpdated: string | null;
};

export function buildOiMeasurementRows(snapshot: OipSettingsSnapshot | null): OiMeasurementRow[] {
    if (!snapshot) return [];
    return snapshot.kpi_rows.map((row) => toMeasurementRow(row));
}

function toMeasurementRow(row: OipKpiSnapshotRow): OiMeasurementRow {
    const insufficient = !row.current_display || row.current_display === "—" || row.status === "unknown";
    return {
        id: row.kpi_key,
        kpiKey: row.kpi_key,
        metricKey: row.metric_key,
        label: row.label,
        pack: row.pack,
        ownership: row.has_org_override ? "customized" : "platform",
        lifecycle: insufficient && row.status === "unknown" ? "unavailable" : "active",
        currentDisplay: row.current_display,
        targetDisplay: row.target_display,
        health: row.status,
        hasTrendCandidate: true,
    };
}

export function buildOiOverviewStats(snapshot: OipSettingsSnapshot | null): OiOverviewStats {
    if (!snapshot) {
        return {
            activeCount: 0,
            offTargetCount: 0,
            insufficientDataCount: 0,
            customizedCount: 0,
            activePackCount: 0,
            lastUpdated: null,
        };
    }
    const rows = buildOiMeasurementRows(snapshot);
    return {
        activeCount: rows.filter((r) => r.lifecycle === "active").length,
        offTargetCount: rows.filter((r) => isOffTrackStatus(r.health)).length,
        insufficientDataCount: rows.filter(
            (r) => r.health === "unknown" || !r.currentDisplay || r.currentDisplay === "—",
        ).length,
        customizedCount: rows.filter((r) => r.ownership === "customized").length,
        activePackCount: snapshot.active_pack_count,
        lastUpdated: snapshot.last_updated,
    };
}

export function filterOiMeasurements(
    rows: readonly OiMeasurementRow[],
    opts: {
        query?: string;
        ownership?: "all" | OiMeasurementOwnership;
        lifecycle?: "all" | OiMeasurementLifecycle;
        health?: "all" | "off_target" | "healthy" | "insufficient";
    },
): OiMeasurementRow[] {
    const q = opts.query?.trim().toLowerCase() ?? "";
    return rows.filter((row) => {
        if (q && !row.label.toLowerCase().includes(q) && !row.pack.toLowerCase().includes(q)) {
            return false;
        }
        if (opts.ownership && opts.ownership !== "all" && row.ownership !== opts.ownership) {
            return false;
        }
        if (opts.lifecycle && opts.lifecycle !== "all" && row.lifecycle !== opts.lifecycle) {
            return false;
        }
        if (opts.health === "off_target" && !isOffTrackStatus(row.health)) return false;
        if (opts.health === "healthy" && row.health !== "healthy") return false;
        if (
            opts.health === "insufficient" &&
            !(row.health === "unknown" || !row.currentDisplay || row.currentDisplay === "—")
        ) {
            return false;
        }
        return true;
    });
}

export function findOiTarget(
    snapshot: OipSettingsSnapshot | null,
    kpiKey: OipKpiKey,
): OipTargetApiItem | null {
    return snapshot?.targets.find((t) => t.kpi_key === kpiKey) ?? null;
}

export function ownershipLabel(ownership: OiMeasurementOwnership): string {
    return ownership === "customized" ? "Customized" : "Platform";
}

export function lifecycleLabel(lifecycle: OiMeasurementLifecycle): string {
    return lifecycle === "unavailable" ? "Unavailable" : "Active";
}
