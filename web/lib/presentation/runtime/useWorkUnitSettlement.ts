"use client";

/**
 * D5 — THE WORK UNIT SETTLEMENT RUNTIME.
 *
 * The operator is ALREADY working. K3 committed an operational Work Unit surface from the frozen D1
 * snapshot (D4); its reserved regions — laid-out but value-less — are what Settlement fills. Settlement
 * enriches the operational world; it never constructs it.
 *
 * Governing: runtime-implementation-authorization.md — U-S5 (KPI values are Settlement), and the
 * Settlement boundary rendered in `workUnitSurfaceModelFromSnapshot.ts` ("`pending: true` is the whole
 * Settlement contract in one flag: the slot is laid out now; D5 fills it").
 *
 * WHAT THIS OWNS: the Work Unit header KPI VALUES. The committed model carries the KPI GEOMETRY
 * (slot, label, icon, accent, sourceKey) with `pending: true` and no value; this hook resolves the
 * value for each slot's `sourceKey` and hands it back so the renderer drops it into the ALREADY
 * reserved slot — a value that never flashed a placeholder that then flips to a number.
 *
 * DISCIPLINE (the Settlement rules, enforced by construction):
 *   - Never gates commit — this hook runs on the ALREADY-committed snapshot; the operational model is
 *     built and rendered without ever consulting it (see `useCommittedWorkUnitSurfaceRuntime`).
 *   - Never constructs / reconstructs — it returns VALUES, not geometry or surfaces. The merge is a
 *     field overlay onto the reserved slot; nothing remounts.
 *   - No duplicate requests — resolution reuses `useOperationalAnswers`, the OIP warm cache the
 *     Workspace surface already uses: snapshot seed, shared subscribe, SWR prefetch, all deduped by a
 *     scope key of (siteId, workUnitId, keys). Two surfaces asking for the same scope share one fetch.
 *   - Never changes operational truth — it touches only `formattedValue`/`pending` on KPI slots.
 *
 * NOT YET SETTLED (bounded, and deliberately NOT forced): Work View pill counts, queue total, and the
 * right-rail actions are ALSO reserved on this surface. Filling them needs a per-lens canonical count
 * location (host work unit + base queue key) and the work unit's department id — server-resolved facts
 * the FROZEN D1 answer does not carry (its `workUnit` is `{id,key,name}`; its `lensSet` is
 * `{id,label,displayOrder}`). Settling them cleanly wants those locators emitted by D1 once, NOT a
 * client re-fetch of the config bundle (that would re-introduce the four-request waterfall D4 deleted
 * and risk the very duplicate requests this layer forbids). That is a D1-carries-settlement-locators
 * item, out of scope while D1 is frozen — recorded here rather than hacked around.
 */
import { useMemo } from "react";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import { useOperationalAnswers } from "./useOperationalAnswers";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import { isKnownOipMetricKey } from "@/lib/metrics/registry";
import type { OipMetricKey } from "@/lib/metrics/types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import type { WorkUnitSurfaceModel } from "./types";

export type WorkUnitSettlement = {
    /** KPI values keyed by OipMetricKey (the slot `sourceKey`). Null until the first resolve lands. */
    kpiValues: ResolvedMetricMap | null;
};

/** Resolve the deferred values for a committed Work Unit surface. Null snapshot → nothing to settle. */
export function useWorkUnitSettlement(snapshot: ProvisioningAnswer | null): WorkUnitSettlement {
    // `error` carries no reserved regions to fill (no lens, no subject, no KPI); everything else does.
    const operational = snapshot && snapshot.terminal !== "error" ? snapshot : null;
    const workUnitId = operational?.workUnit.id ?? null;

    // Metrics may be site-filtered on the Workspace; scope to the same site so a KPI reads the same
    // value the operator saw one surface ago. Optional context — absent outside the workspace tree.
    const siteFilter = useWorkspaceSiteFilter();
    const siteId = siteFilter?.selectedSiteId ?? null;

    // The value keys to resolve = the committed header slots' source identifiers. Distinct + known only:
    // an unknown key would resolve to nothing and only widen the request.
    const keys = useMemo<OipMetricKey[]>(() => {
        if (!operational) return [];
        const seen = new Set<string>();
        const out: OipMetricKey[] = [];
        for (const slot of operational.presentation.header.kpiSlots) {
            const k = slot.sourceKey?.trim();
            if (k && isKnownOipMetricKey(k) && !seen.has(k)) {
                seen.add(k);
                out.push(k as OipMetricKey);
            }
        }
        return out;
    }, [operational]);

    const { resolved } = useOperationalAnswers({ siteId, workUnitId, keys });
    return { kpiValues: resolved };
}

/**
 * Overlay settled values onto the reserved model. PURE — a field merge, never a rebuild.
 *
 * Returns the SAME model reference when nothing has settled or nothing matched, so the operational
 * first paint re-renders zero times until a real value is in hand; then it fills the reserved KPI slot
 * (`pending: false`) without touching any other field — no operational truth, no geometry, no reflow.
 */
export function mergeWorkUnitSettlement(
    model: WorkUnitSurfaceModel,
    settlement: WorkUnitSettlement,
): WorkUnitSurfaceModel {
    const kpiValues = settlement.kpiValues;
    if (!kpiValues) return model;

    let changed = false;
    const kpis = model.header.kpis.map((k) => {
        const item = k.sourceKey ? kpiValues[k.sourceKey as OipMetricKey] : undefined;
        // Only a resolved value with real text fills the slot; a no-data resolve leaves it reserved
        // rather than flipping it to an empty string that reads as "loaded but blank".
        if (!item || !item.formatted_value) return k;
        changed = true;
        return { ...k, formattedValue: item.formatted_value, pending: false };
    });
    if (!changed) return model;
    return { ...model, header: { ...model.header, kpis } };
}
