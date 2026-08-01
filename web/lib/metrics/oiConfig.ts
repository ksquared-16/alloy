/**
 * Organization Operational Intelligence configuration overlay.
 * Stored at org_settings.metadata.oi_config — non-destructive; sparse keys.
 *
 * Absent measurement/pack entries preserve legacy defaults:
 * - available packs are enabled
 * - KPIs in enabled packs are active
 */

import { getKpiDefinition, listKpiDefinitions } from "@/lib/metrics/kpiRegistry";
import { getMetricPack, listAvailableMetricPacks, listMetricPacks } from "@/lib/metrics/packs";
import type { OipKpiKey } from "@/lib/metrics/types";

export type OiMeasurementStatus = "active" | "disabled" | "retired";

export type OiMeasurementStateEntry = {
    status: OiMeasurementStatus;
};

export type OiPackStateEntry = {
    enabled: boolean;
};

export type OiConfig = {
    measurements?: Partial<Record<OipKpiKey, OiMeasurementStateEntry>>;
    packs?: Partial<Record<string, OiPackStateEntry>>;
};

export type OrgOiConfigMetadata = {
    oi_config?: OiConfig;
};

const KPI_KEYS = new Set(listKpiDefinitions().map((d) => d.key));

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

export function parseOiConfig(metadata: unknown): OiConfig {
    if (!isRecord(metadata) || !isRecord(metadata.oi_config)) return {};
    const raw = metadata.oi_config;
    const measurements: OiConfig["measurements"] = {};
    const packs: OiConfig["packs"] = {};

    if (isRecord(raw.measurements)) {
        for (const [key, value] of Object.entries(raw.measurements)) {
            if (!KPI_KEYS.has(key as OipKpiKey)) continue;
            if (!isRecord(value)) continue;
            const status = value.status;
            if (status === "active" || status === "disabled" || status === "retired") {
                measurements[key as OipKpiKey] = { status };
            }
        }
    }

    if (isRecord(raw.packs)) {
        for (const [key, value] of Object.entries(raw.packs)) {
            if (!getMetricPack(key)) continue;
            if (!isRecord(value)) continue;
            if (typeof value.enabled === "boolean") {
                packs[key] = { enabled: value.enabled };
            }
        }
    }

    return { measurements, packs };
}

export function isPackEnabled(packKey: string, config: OiConfig): boolean {
    const pack = getMetricPack(packKey);
    if (!pack || pack.domainStatus !== "available" || pack.metricKeys.length === 0) {
        return false;
    }
    const entry = config.packs?.[packKey];
    if (entry && typeof entry.enabled === "boolean") return entry.enabled;
    return true;
}

/**
 * Resolve org lifecycle for a platform KPI.
 * - retired / disabled when explicitly set
 * - active when pack enabled and not explicitly off (default)
 * - available when pack disabled or measurement not active (catalog discoverable)
 */
export function resolveOiMeasurementStatus(kpiKey: OipKpiKey, config: OiConfig): OiMeasurementStatus | "available" {
    const def = getKpiDefinition(kpiKey);
    const packEnabled = isPackEnabled(def.pack, config);
    const explicit = config.measurements?.[kpiKey]?.status;

    if (explicit === "retired") return "retired";
    if (explicit === "disabled") return "disabled";
    if (explicit === "active") return packEnabled ? "active" : "available";

    // Legacy default: active when pack is on.
    if (packEnabled) return "active";
    return "available";
}

export function listOiCatalogKpiKeys(): OipKpiKey[] {
    return listKpiDefinitions().map((d) => d.key);
}

export function listEnabledPackKeys(config: OiConfig): string[] {
    return listAvailableMetricPacks()
        .filter((p) => isPackEnabled(p.key, config))
        .map((p) => p.key);
}

export function mergeOiConfigPatch(current: OiConfig, patch: OiConfig): OiConfig {
    const measurements = { ...(current.measurements ?? {}) };
    const packs = { ...(current.packs ?? {}) };

    if (patch.measurements) {
        for (const [key, value] of Object.entries(patch.measurements)) {
            if (!KPI_KEYS.has(key as OipKpiKey)) continue;
            if (value == null) {
                delete measurements[key as OipKpiKey];
            } else if (value.status === "active" || value.status === "disabled" || value.status === "retired") {
                measurements[key as OipKpiKey] = { status: value.status };
            }
        }
    }

    if (patch.packs) {
        for (const [key, value] of Object.entries(patch.packs)) {
            if (!getMetricPack(key)) continue;
            if (value == null) {
                delete packs[key];
            } else if (typeof value.enabled === "boolean") {
                packs[key] = { enabled: value.enabled };
            }
        }
    }

    return { measurements, packs };
}

export function summarizeOiPack(config: OiConfig) {
    return listMetricPacks()
        .filter((p) => p.domainStatus === "available" && p.metricKeys.length > 0)
        .map((p) => ({
            key: p.key,
            label: p.label,
            description: p.description,
            metricKeys: [...p.metricKeys],
            enabled: isPackEnabled(p.key, config),
        }));
}
