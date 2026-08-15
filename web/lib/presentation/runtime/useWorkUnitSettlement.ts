"use client";

/**
 * D5 — THE WORK UNIT SETTLEMENT RUNTIME.
 *
 * The operator is ALREADY working. K3 committed an operational Work Unit surface from the frozen D1
 * snapshot (D4); its reserved regions — laid-out but value-less — are what Settlement fills. Settlement
 * enriches the operational world; it never constructs it.
 *
 * Governing: runtime-implementation-authorization.md — U-S5 (KPI values), U-S6 (view counts, queue
 * total), U-S7 (right-rail actions), all Settlement; and the Settlement boundary rendered in
 * `workUnitSurfaceModelFromSnapshot.ts` ("`pending: true` is the whole Settlement contract in one
 * flag: the slot is laid out now; D5 fills it").
 *
 * WHAT THIS OWNS — the four reserved regions of the committed Work Unit surface:
 *   - KPI VALUES (U-S5): each header slot's `sourceKey`, resolved WU-scoped through the deduped OIP
 *     warm cache the Workspace surface already uses.
 *   - WORK VIEW COUNTS (U-S6): each pill count, from the SERVER-RESOLVED count locator (D1's
 *     `settlement.workViewCountTargets`) fed straight to `useWorkViewTotalsState` — the one canonical,
 *     deduped, batched count owner. The client NEVER recomputes a location or reads config.
 *   - QUEUE TOTAL (U-S6): the active lens's authoritative total — the SAME location as its pill count,
 *     so it costs no extra request. This is the total, never the returned page length.
 *   - RIGHT-RAIL ACTIONS (U-S7): the deferred secondary actions, from the server-resolved right-rail
 *     locator (`settlement.rightRailTarget`) via the existing right-rail bundle. This never touches the
 *     snapshot-owned primary Action, Current Work, Context Frame, or Record of Attention.
 *
 * DISCIPLINE (the Settlement rules, by construction):
 *   - Never gates commit — every value here is resolved on the ALREADY-committed snapshot; the
 *     operational model is built and rendered without ever consulting Settlement.
 *   - Never constructs / reconstructs — returns VALUES, not geometry or surfaces; the merge is a field
 *     overlay onto reserved slots. If D1's locators are `unavailable`, Settlement fills nothing and
 *     reports honest region states — the surface stays operational.
 *   - No duplicate requests — KPIs reuse the OIP warm cache; counts/total reuse `useWorkViewTotals`
 *     (batched, session-cached, SWR-deduped); the right-rail fetch is deduped by `dedupeAdminFetch`.
 *   - No client configuration waterfall / no QueueService — the client only consumes RESOLVED locators.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";
import { useOperationalAnswers } from "./useOperationalAnswers";
import {
    useWorkViewTotalsState,
    workViewTotalKey,
    type WorkViewTotalTarget,
} from "./useWorkViewTotals";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { isKnownOipMetricKey } from "@/lib/metrics/registry";
import type { OipMetricKey } from "@/lib/metrics/types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { WorkUnitSurfaceModel } from "./types";

/** Honest per-region state — quiet at pending/error (reserved geometry), value at resolved. */
export type SettlementRegionStatus = "pending" | "resolved" | "empty" | "error";

export type WorkUnitSettlement = {
    /** KPI values keyed by OipMetricKey (the slot `sourceKey`). Null until the first resolve lands. */
    kpiValues: ResolvedMetricMap | null;
    /** Work View counts keyed by workViewId (host resolution already applied). */
    viewCounts: Map<string, number | null>;
    /** The active lens's authoritative total. */
    queueTotal: number | null;
    /** Deferred right-rail secondary actions. Null until fetched. */
    rightRailActions: ResolvedActionForClient[] | null;
    /** Baked right-rail scope for the command rail (from the server locator). */
    departmentId: string | null;
    workUnitId: string | null;
    /** Honest states, one per reserved region. */
    regions: {
        kpi: SettlementRegionStatus;
        counts: SettlementRegionStatus;
        queueTotal: SettlementRegionStatus;
        rightRail: SettlementRegionStatus;
    };
};

const EMPTY_COUNTS = new Map<string, number | null>();

/** Resolve the deferred values for a committed Work Unit surface. Null snapshot → nothing to settle. */
export function useWorkUnitSettlement(snapshot: ProvisioningAnswer | null): WorkUnitSettlement {
    // Only `operational` and `empty` carry reserved regions to fill.
    //
    // `error` never resolved them. `contextual` has NOTHING TO SETTLE — every region here is a property
    // of a chosen cohort: KPI values come from the lens's published header composition, pill counts and
    // the queue total count a cohort's rows, and all three arrive via `settlement` locators the
    // contextual answer does not carry. Settling anything for it would mean picking a lens to count.
    const settleable =
        snapshot && (snapshot.terminal === "operational" || snapshot.terminal === "empty")
            ? snapshot
            : null;
    // A contextual surface HAS a host work unit; that is hosting truth and stays true. What it has no
    // claim to is a settled value. `nothingToSettle` keeps the regions from reporting `pending` — a
    // promise that something is still coming, when nothing ever will be.
    const nothingToSettle = snapshot?.terminal === "contextual";
    const workUnitId = settleable?.workUnit.id ?? (snapshot?.terminal === "contextual" ? snapshot.workUnit.id : null);
    const locators = settleable?.settlement ?? null;

    const siteFilter = useWorkspaceSiteFilter();
    const siteId = siteFilter?.selectedSiteId ?? null;

    // ── KPI VALUES (U-S5). Keys = the committed header slots' source identifiers. ──
    // Deduped + sorted so the key SET (not slot order) is canonical, and given a value-stable
    // identity: on each cold-commit re-render the committed snapshot changes reference, but as long
    // as the resolved KPI keys are the same the array reference is reused — so the settlement effect
    // does not churn and the metrics request is issued once per key set (not once per commit cycle).
    const kpiKeySig = useMemo(() => {
        if (!settleable) return "";
        const seen = new Set<string>();
        for (const slot of settleable.presentation.header.kpiSlots) {
            const k = slot.sourceKey?.trim();
            if (k && isKnownOipMetricKey(k)) seen.add(k);
        }
        return [...seen].sort().join("|");
    }, [settleable]);
    const kpiKeys = useMemo<OipMetricKey[]>(
        () => (kpiKeySig ? (kpiKeySig.split("|") as OipMetricKey[]) : []),
        [kpiKeySig],
    );
    const { resolved: kpiValues, settled: kpiSettled } = useOperationalAnswers({ siteId, workUnitId, keys: kpiKeys });

    // ── WORK VIEW COUNTS + QUEUE TOTAL (U-S6). Targets come STRAIGHT from D1's resolved locators. ──
    const targets = useMemo<WorkViewTotalTarget[]>(() => {
        if (!locators || locators.status !== "resolved") return [];
        return locators.workViewCountTargets.map((t) => ({
            viewId: t.workViewId,
            workUnitId: t.hostWorkUnitId,
            baseQueueKey: t.baseQueueKey,
        }));
    }, [locators]);
    const totalsState = useWorkViewTotalsState({
        targets,
        selectedSiteId: siteId,
        enabled: targets.length > 0,
    });

    // Re-key totals by workViewId (the canonical host is folded in), so the merge is a plain view lookup.
    const viewCounts = useMemo<Map<string, number | null>>(() => {
        if (!locators || locators.status !== "resolved" || targets.length === 0) return EMPTY_COUNTS;
        const out = new Map<string, number | null>();
        for (const t of locators.workViewCountTargets) {
            out.set(t.workViewId, totalsState.totals.get(workViewTotalKey(t.hostWorkUnitId, t.workViewId)) ?? null);
        }
        return out;
    }, [locators, targets.length, totalsState.totals]);

    const queueTotal = useMemo<number | null>(() => {
        if (!locators || locators.status !== "resolved" || !locators.queueTotalTarget) return null;
        const q = locators.queueTotalTarget;
        return totalsState.totals.get(workViewTotalKey(q.hostWorkUnitId, q.workViewId)) ?? null;
    }, [locators, totalsState.totals]);

    // ── RIGHT-RAIL ACTIONS (U-S7). Deferred secondary actions from the resolved right-rail locator. ──
    const rightRailTarget = locators && locators.status === "resolved" ? locators.rightRailTarget : null;
    const rightRailKey = rightRailTarget ? `${rightRailTarget.departmentId}|${rightRailTarget.workUnitId}` : null;
    const [rightRail, setRightRail] = useState<{ key: string; actions: ResolvedActionForClient[] } | { key: string; error: true } | null>(null);
    const rightRailArmed = useRef<string | null>(null);
    useEffect(() => {
        if (!rightRailTarget || !rightRailKey) return;
        if (rightRailArmed.current === rightRailKey) return; // dedup: same surface, already fetching/fetched
        rightRailArmed.current = rightRailKey;
        const ctrl = new AbortController();
        const url =
            `/api/admin/actions/right-rail-bundle?department_id=${encodeURIComponent(rightRailTarget.departmentId)}` +
            `&work_unit_id=${encodeURIComponent(rightRailTarget.workUnitId)}`;
        void dedupeAdminFetch(url, { signal: ctrl.signal })
            .then(async (res) => {
                if (!res.ok) throw new Error(`right-rail ${res.status}`);
                const body = (await res.json()) as { actions?: ResolvedActionForClient[] };
                if (!ctrl.signal.aborted) setRightRail({ key: rightRailKey, actions: body.actions ?? [] });
            })
            .catch(() => {
                // Settlement error is quiet: the rail keeps its reserved anchor; commit is untouched.
                if (!ctrl.signal.aborted) setRightRail({ key: rightRailKey, error: true });
            });
        return () => ctrl.abort();
    }, [rightRailTarget, rightRailKey]);
    // The right-rail slot for THIS surface (ignore a stale result from a previous surface).
    const rightRailForSurface = rightRail && rightRailKey && rightRailKey === rightRail.key ? rightRail : null;
    const rightRailActions = rightRailForSurface && "actions" in rightRailForSurface ? rightRailForSurface.actions : null;

    // ── Honest per-region states. Pending and error are visually quiet (reserved geometry). ──
    const regions = useMemo<WorkUnitSettlement["regions"]>(() => {
        // NOTHING TO SETTLE is a settled state, not a pending one. `empty` across the board, so the
        // surface never renders a reserved slot waiting on a value that no cohort will ever produce.
        if (nothingToSettle) {
            return { kpi: "empty", counts: "empty", queueTotal: "empty", rightRail: "empty" };
        }
        const locatorsResolved = !!locators && locators.status === "resolved";
        // When locators are absent the snapshot has none yet (pending); when present but `unavailable`,
        // that region genuinely cannot settle (error) — but the surface stays operational regardless.
        const locatorFailState: SettlementRegionStatus = locators ? "error" : "pending";

        const kpi: SettlementRegionStatus =
            kpiKeys.length === 0 ? "empty" : kpiValues && kpiSettled ? "resolved" : "pending";

        const counts: SettlementRegionStatus = !locatorsResolved
            ? locatorFailState
            : targets.length === 0
              ? "empty"
              : totalsState.settled
                ? "resolved"
                : "pending";

        const queueTotal: SettlementRegionStatus = !locatorsResolved
            ? locatorFailState
            : !locators.queueTotalTarget
              ? "empty"
              : totalsState.settled
                ? "resolved"
                : "pending";

        const rightRail: SettlementRegionStatus = !locatorsResolved
            ? locatorFailState
            : !locators.rightRailTarget
              ? "empty"
              : rightRailForSurface === null
                ? "pending"
                : "error" in rightRailForSurface
                  ? "error"
                  : rightRailForSurface.actions.length > 0
                    ? "resolved"
                    : "empty";

        return { kpi, counts, queueTotal, rightRail };
    }, [nothingToSettle, locators, kpiKeys.length, kpiValues, kpiSettled, targets.length, totalsState.settled, rightRailForSurface]);

    return {
        kpiValues,
        viewCounts,
        queueTotal,
        rightRailActions,
        departmentId: rightRailTarget?.departmentId ?? null,
        workUnitId,
        regions,
    };
}

/**
 * Overlay settled values onto the reserved model. PURE — a field merge, never a rebuild.
 *
 * Returns the SAME model reference when nothing has settled, so the operational first paint re-renders
 * zero times until a real value is in hand; then it fills reserved slots (KPI value, pill count, queue
 * total, right-rail actions) without touching any operational field — no operational truth, no geometry,
 * no reflow. The snapshot-owned primary Action is never touched.
 */
export function mergeWorkUnitSettlement(
    model: WorkUnitSurfaceModel,
    settlement: WorkUnitSettlement,
): WorkUnitSurfaceModel {
    let changed = false;

    // KPI VALUES.
    let kpis = model.header.kpis;
    if (settlement.kpiValues) {
        kpis = model.header.kpis.map((k) => {
            const item = k.sourceKey ? settlement.kpiValues![k.sourceKey as OipMetricKey] : undefined;
            if (!item || !item.formatted_value) return k;
            changed = true;
            return { ...k, formattedValue: item.formatted_value, pending: false };
        });
    }

    // WORK VIEW COUNTS.
    let workViews = model.workViews;
    if (settlement.viewCounts.size > 0) {
        workViews = model.workViews.map((v) => {
            const c = settlement.viewCounts.get(v.id);
            if (typeof c !== "number") return v;
            changed = true;
            return { ...v, count: c };
        });
    }

    // QUEUE TOTAL — authoritative total, distinct from the returned page length (`rows`).
    let queue = model.queue;
    if (typeof settlement.queueTotal === "number" && settlement.queueTotal !== model.queue.totalCount) {
        changed = true;
        queue = { ...model.queue, totalCount: settlement.queueTotal };
    }

    // RIGHT-RAIL ACTIONS (secondary only — the snapshot-owned primary Action is elsewhere and untouched).
    let rightRailActions = model.rightRailActions;
    let departmentId = model.departmentId;
    if (settlement.rightRailActions && settlement.rightRailActions.length > 0) {
        changed = true;
        rightRailActions = settlement.rightRailActions;
    }
    // Department scope can arrive from Settlement even when Actions already committed from the
    // snapshot projection (or when the rail stays empty). Never leave Create Lead on a null dept.
    if (settlement.departmentId && settlement.departmentId !== departmentId) {
        changed = true;
        departmentId = settlement.departmentId;
    }

    if (!changed) return model;
    return { ...model, header: { ...model.header, kpis }, workViews, queue, rightRailActions, departmentId };
}
