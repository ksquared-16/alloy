/**
 * Presentation Runtime V2 — WS.HEADER calculation card VMs.
 *
 * The Workspace header strip renders the PUBLISHED "Workspace Header" surface
 * (`metric_placements` surface="workspace_header" / zone="primary_metrics", authored in
 * /settings/surfaces). This module is the pure mapping layer: placement views + resolved
 * calculation values → `WorkspaceHeaderCalculationCardVm[]`, plus the code-owned fallback
 * for orgs that never published the surface. Pure (no React, no fetches) so the server
 * first-paint loader, the client runtime hook, and tests all derive cards from ONE mapper.
 */

import type { HeaderPlacementView } from "@/lib/metrics/platform/headerSurfacePersistence";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import type { OipMetricKey } from "@/lib/metrics/types";
import { isKnownOipMetricKey } from "@/lib/metrics/registry";
import {
    humanizeSourceKey,
    resolveMetricDisplayLabel,
} from "@/lib/metrics/platform/metricSourceRegistry";
import { findOperationalCalculation } from "@/lib/analytics/calculations/registry";
import { resolveWorkspaceOipMetricKeys } from "@/lib/kpi/workspaceOipExposure";
import { drillHrefForMetricKey } from "./types";

/** No-data contract (matches the settings preview): value "—", status "unknown". */
export const WORKSPACE_HEADER_NO_DATA_VALUE = "—";
export const WORKSPACE_HEADER_UNKNOWN_STATUS = "unknown";

/**
 * One published header card, fully resolved for presentation. Shape is JSON-serializable —
 * it rides the workspace Route VM from the server composer to the client renderer.
 */
export type WorkspaceHeaderCalculationCardVm = {
    /** Operational Calculations key (= placement definition source_key = OipMetricKey). */
    sourceKey: string;
    vizType: "kpi" | "trend";
    /** Configured card title (visualization label) through the display-label fallback chain. */
    label: string;
    /** Builder-configured accent, or null → derive from status at render time. */
    accent: string | null;
    showHealthChip: boolean;
    sortOrder: number;
    /** Already-formatted value; "—" when the calculation resolved no data. */
    formattedValue: string;
    /** KPI health status ("healthy" | "warning" | "critical") or "unknown". */
    status: string;
    /** Canonical drill target (`/workspace/work-unit/<slug>`) — null for exploratory-only. */
    drillHref: string | null;
};

/** A resolved value for one calculation key (server resolveMetrics or client warm cache). */
export type WorkspaceHeaderResolvedValue = {
    formattedValue: string | null;
    status: string | null;
};

function normalizeValue(value: string | null | undefined): string {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed || WORKSPACE_HEADER_NO_DATA_VALUE;
}

function normalizeStatus(status: string | null | undefined): string {
    const trimmed = typeof status === "string" ? status.trim() : "";
    return trimmed || WORKSPACE_HEADER_UNKNOWN_STATUS;
}

/** Builder "auto" accent means derive-from-status — carried as null in the VM. */
function normalizeAccent(accent: string | undefined): string | null {
    const trimmed = accent?.trim();
    return trimmed && trimmed !== "auto" ? trimmed : null;
}

/**
 * Published-surface cards: header placement views (already visibility/status-filtered by
 * the placement resolver) + a value lookup → presentation VMs in `sort_order`. A placement
 * whose value did not resolve KEEPS its card ("—" / "unknown" — the preview no-data
 * contract); published cards never disappear because data is late or absent.
 */
export function workspaceHeaderCardVmsFromViews(
    views: readonly HeaderPlacementView[],
    resolveValue: (sourceKey: string) => WorkspaceHeaderResolvedValue | null,
): WorkspaceHeaderCalculationCardVm[] {
    return [...views]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((view) => {
            const resolved = resolveValue(view.sourceKey);
            return {
                sourceKey: view.sourceKey,
                vizType: view.vizType === "trend_card" ? "trend" : "kpi",
                // The visualization label IS the configured title (persisted on publish);
                // the fallback chain guards raw source keys from legacy rows.
                label: resolveMetricDisplayLabel(view.label, "", view.sourceKey),
                accent: normalizeAccent(view.accent),
                showHealthChip: view.showHealthChip ?? false,
                sortOrder: view.sortOrder,
                formattedValue: normalizeValue(resolved?.formattedValue),
                status: normalizeStatus(resolved?.status),
                drillHref: drillHrefForMetricKey(view.sourceKey),
            } satisfies WorkspaceHeaderCalculationCardVm;
        });
}

/**
 * Code-owned fallback strip for orgs that never published a Workspace Header surface —
 * the SAME VM shape and renderer path as published cards. Labels come from the governed
 * calculations registry (never hardcoded); values start as no-data and refine in place
 * from the warm cache.
 */
export function fallbackWorkspaceHeaderCardVms(
    keys: readonly OipMetricKey[],
): WorkspaceHeaderCalculationCardVm[] {
    return keys.map((key, index) => ({
        sourceKey: key,
        vizType: "kpi",
        label: findOperationalCalculation(key)?.label ?? humanizeSourceKey(key),
        accent: null,
        showHealthChip: false,
        sortOrder: index * 10,
        formattedValue: WORKSPACE_HEADER_NO_DATA_VALUE,
        status: WORKSPACE_HEADER_UNKNOWN_STATUS,
        drillHref: drillHrefForMetricKey(key),
    }));
}

/**
 * Seed for the client runtime: the server Route VM cards when the surface is published,
 * else the fallback strip from the existing code-owned default key set. The ONLY place
 * the fallback engages — a published (even partially resolved) seed always wins.
 */
export function seedWorkspaceHeaderCalculations(
    seed: readonly WorkspaceHeaderCalculationCardVm[] | null | undefined,
): WorkspaceHeaderCalculationCardVm[] {
    if (seed?.length) return [...seed];
    return fallbackWorkspaceHeaderCardVms(resolveWorkspaceOipMetricKeys(undefined, false));
}

/** The card keys eligible for warm-cache refinement (governed OIP keys only). */
export function workspaceHeaderCalculationKeys(
    cards: readonly WorkspaceHeaderCalculationCardVm[],
): OipMetricKey[] {
    const out: OipMetricKey[] = [];
    for (const card of cards) {
        if (isKnownOipMetricKey(card.sourceKey) && !out.includes(card.sourceKey)) {
            out.push(card.sourceKey);
        }
    }
    return out;
}

/**
 * Client refinement: patch `formattedValue`/`status` IN PLACE from a warm-cache resolve
 * response. Card set, order, labels, and chrome never change — values settle quietly.
 * Returns the SAME array reference when nothing changed (React state bail-out safe).
 */
export function refineWorkspaceHeaderCardVms(
    cards: readonly WorkspaceHeaderCalculationCardVm[],
    resolved: ResolvedMetricMap,
): WorkspaceHeaderCalculationCardVm[] {
    let changed = false;
    const next = cards.map((card) => {
        const item = resolved[card.sourceKey as OipMetricKey];
        if (!item) return card;
        const formattedValue = normalizeValue(item.formatted_value);
        const status = normalizeStatus(item.kpi?.status);
        if (formattedValue === card.formattedValue && status === card.status) return card;
        changed = true;
        return { ...card, formattedValue, status };
    });
    return changed ? next : (cards as WorkspaceHeaderCalculationCardVm[]);
}
