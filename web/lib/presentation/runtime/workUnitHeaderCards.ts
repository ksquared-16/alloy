/**
 * Presentation Runtime V2 — WU.HEADER calculation card VMs.
 *
 * The Work Unit header strip renders the PUBLISHED "Work Unit Header" surface
 * (`metric_placements` surface="work_unit_header" / zone="header_metrics", authored in
 * /settings/surfaces). This module is the pure mapping layer for the WU header: a builder
 * `SurfaceDoc` (client-fetched from `/api/admin/analytics/surfaces/work_unit_header/doc`)
 * plus resolved calculation values → header card VMs, plus the code-owned fallback for orgs
 * that never published the surface.
 *
 * The card VM shape, the value-refinement, and the eligible-key extraction are SHARED with
 * WS.HEADER (`workspaceHeaderCards`) so both headers derive cards through one renderer path
 * and one refine layer. Only the *source* differs: WS seeds from placement views (server
 * first-paint), WU seeds from the SurfaceDoc (client fetch, same publish rows). Pure (no
 * React, no fetches) so the runtime hook and tests derive cards from ONE mapper.
 */

import type { SurfaceDoc } from "@/lib/platform/surfaceBuilder/surfaceDefinition";
import type { OipMetricKey } from "@/lib/metrics/types";
import { isKnownCalculationKey, findOperationalCalculation } from "@/lib/analytics/calculations/registry";
import { humanizeSourceKey } from "@/lib/metrics/platform/metricSourceRegistry";
import { resolveWorkUnitOipMetricKeys } from "@/lib/kpi/workspaceOipExposure";
import {
    WORKSPACE_HEADER_NO_DATA_VALUE,
    WORKSPACE_HEADER_UNKNOWN_STATUS,
    fallbackWorkspaceHeaderCardVms,
    type WorkspaceHeaderCalculationCardVm,
} from "./workspaceHeaderCards";
import { drillHrefForMetricKey } from "./types";

/**
 * A WU header card is the SAME shape as a WS header card — reuse the VM type so the shared
 * renderer (`MetricKpiCard`/`MetricTrendCard`), the refine layer, and the key extractor all
 * operate on one type. Re-exported so WU callers need not reach into the WS module.
 */
export type WorkUnitHeaderCalculationCardVm = WorkspaceHeaderCalculationCardVm;

/** Builder "auto" accent means derive-from-status — carried as null in the VM. */
function normalizeAccent(accent: unknown): string | null {
    const trimmed = typeof accent === "string" ? accent.trim() : "";
    return trimmed && trimmed !== "auto" ? trimmed : null;
}

/** The persisted card title wins; else the governed registry label; else the raw key. */
function labelForSourceKey(configTitle: unknown, sourceKey: string): string {
    const title = typeof configTitle === "string" ? configTitle.trim() : "";
    if (title) return title;
    return findOperationalCalculation(sourceKey)?.label ?? humanizeSourceKey(sourceKey);
}

/**
 * Published-surface cards from the builder SurfaceDoc. Active cards only (`visibility !==
 * "off"`), in document order, filtered to KNOWN governed calculation keys so a stale binding
 * can never crash the strip. Values start no-data ("—"/unknown) — the warm cache refines
 * them in place after mount. A card with no `contentId` is skipped (nothing to bind/refine).
 */
export function workUnitHeaderCardsFromDoc(doc: SurfaceDoc | null | undefined): WorkUnitHeaderCalculationCardVm[] {
    if (!doc?.sections?.length) return [];
    const out: WorkUnitHeaderCalculationCardVm[] = [];
    const seen = new Set<string>();
    for (const section of doc.sections) {
        for (const card of section.cards ?? []) {
            const sourceKey = card.contentId?.trim();
            if (!sourceKey || seen.has(sourceKey)) continue;
            const cfg = (card.config ?? {}) as Record<string, unknown>;
            if (cfg.visibility === "off") continue;
            // Stale/unknown binding guard — the strip only renders governed calculations.
            if (!isKnownCalculationKey(sourceKey)) continue;
            seen.add(sourceKey);
            out.push({
                sourceKey,
                vizType: cfg.rendererKey === "trend_card" ? "trend" : "kpi",
                label: labelForSourceKey(cfg.title, sourceKey),
                accent: normalizeAccent(cfg.accent),
                showHealthChip: cfg.showHealthChip === "on",
                sortOrder: out.length * 10,
                formattedValue: WORKSPACE_HEADER_NO_DATA_VALUE,
                status: WORKSPACE_HEADER_UNKNOWN_STATUS,
                drillHref: drillHrefForMetricKey(sourceKey),
            } satisfies WorkUnitHeaderCalculationCardVm);
        }
    }
    return out;
}

/**
 * Code-owned fallback strip for orgs that never published a Work Unit Header surface — the
 * SAME VM shape and renderer path as published cards, labels from the governed calculations
 * registry (never hardcoded), values start no-data and refine in place from the warm cache.
 */
export function fallbackWorkUnitHeaderCards(): WorkUnitHeaderCalculationCardVm[] {
    return fallbackWorkspaceHeaderCardVms(resolveWorkUnitOipMetricKeys(undefined));
}

/**
 * The seed for the runtime: the published SurfaceDoc cards when the surface has any, else the
 * code-owned fallback strip. The ONLY place the fallback engages — a published (even
 * partially resolved) seed always wins.
 */
export function seedWorkUnitHeaderCards(
    doc: SurfaceDoc | null | undefined,
): WorkUnitHeaderCalculationCardVm[] {
    const published = workUnitHeaderCardsFromDoc(doc);
    return published.length ? published : fallbackWorkUnitHeaderCards();
}

/** Re-export the shared key extractor as WU vocabulary (identical implementation). */
export { workspaceHeaderCalculationKeys as workUnitHeaderCalculationKeys } from "./workspaceHeaderCards";

/** OIP key type re-export convenience for WU seed callers. */
export type { OipMetricKey };
