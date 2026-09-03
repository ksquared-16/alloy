/**
 * D5 — THE SETTLEMENT LOCATOR CONTRACT (server-resolved, additive, Settlement-only).
 *
 * The committed operational answer (D1) reserves four regions the operator does not need at first
 * sight: KPI values (already settled via the metric warm cache), Work View pill counts, the queue
 * total, and right-rail secondary actions. Settlement fills them AFTER Operational Commit — but the
 * frozen answer does not carry the server-resolved facts Settlement needs to fetch those values without
 * re-reading configuration in the browser:
 *   - the canonical COUNT LOCATION of each lens: which host work unit + base queue lane its count is
 *     evaluated on (a view's count may be hosted on a different unit than the surface's), and
 *   - the work unit's DEPARTMENT identity, required to resolve the right-rail action bundle.
 *
 * This is the smallest additive extension that removes the client's need to interpret configuration:
 * it emits RESOLVED locators, not raw layout/queue documents. The client hands a locator straight to
 * the existing deduped count / right-rail owners; it never recomputes a canonical location, never reads
 * a config bundle, never touches QueueService, and never sees `compat_queue_key` (the locator carries
 * the resolved `baseQueueKey`, which is what the canonical location IS).
 *
 * DISCIPLINE:
 *   - The OPERATIONAL renderer must ignore these fields entirely. They are Settlement-only, consumed by
 *     `useWorkUnitSettlement`, never by `workUnitSurfaceModelFromSnapshot`.
 *   - Resolution NEVER blocks Operational Commit. If it fails, the answer still commits and this reports
 *     `status: "unavailable"` — Settlement then fills nothing and reports its own honest unavailable
 *     state; no operational surface becomes error or preparing.
 *   - Location logic is NOT duplicated here: it delegates to `resolveWorkViewCanonicalLocation`, the one
 *     owner the Workspace surface already uses.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
    resolveWorkViewCanonicalLocation,
    type WorkViewCanonicalLocationWorkUnitRow,
} from "@/lib/workspace/resolveWorkViewCanonicalLocation";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";

/** One canonical count location — maps 1:1 onto the existing `WorkViewTotalTarget` the totals hook takes. */
export type SettlementCountTarget = {
    workViewId: string;
    /** The work unit the count is evaluated on (canonical host — may differ from the surface's unit). */
    hostWorkUnitId: string;
    /** The base queue lane the count/rows are defined on. This is the RESOLVED location, not compat_queue_key. */
    baseQueueKey: string;
};

/** Right-rail resolution location — the department + work unit the action bundle is keyed by. */
export type SettlementRightRailTarget = {
    departmentId: string;
    workUnitId: string;
};

export type SettlementLocators =
    | {
          status: "resolved";
          /** One target per configured Work View (the pill counts). Empty if none resolved. */
          workViewCountTargets: SettlementCountTarget[];
          /** The active lens's total-count location (the queue total) — the SAME location as its pill count,
           *  so filling both consumes ONE deduped request. Null when the active lens has no canonical location. */
          queueTotalTarget: SettlementCountTarget | null;
          /** Resolved right-rail location. Null when department/unit identity is unavailable. */
          rightRailTarget: SettlementRightRailTarget | null;
      }
    | {
          /** Locator resolution failed or was unavailable. Operational Commit is UNAFFECTED. */
          status: "unavailable";
          workViewCountTargets: [];
          queueTotalTarget: null;
          rightRailTarget: null;
      };

export const SETTLEMENT_LOCATORS_UNAVAILABLE: SettlementLocators = {
    status: "unavailable",
    workViewCountTargets: [],
    queueTotalTarget: null,
    rightRailTarget: null,
};

/**
 * Population host for Operational Commit rows — MUST match the active lens's Settlement count host.
 *
 * Pill-strip Work Views stay LENS on the open shell (no remount). Settlement still evaluates each
 * view's COUNT on its canonical host. If Operational Commit kept reading the surface work unit's
 * population, a Waitlist-mounted shell would paint All/Tours counts from New Leads (1) while the
 * committed page projected Waitlist's population (0) — count=1 / rows=0 / empty Focus.
 */
export function resolveProvisioningPopulationWorkUnitId(args: {
    surfaceWorkUnitId: string;
    settlement: SettlementLocators;
}): string {
    const surface = args.surfaceWorkUnitId.trim();
    if (args.settlement.status !== "resolved") return surface;
    const host = args.settlement.queueTotalTarget?.hostWorkUnitId?.trim() || "";
    return host || surface;
}

/**
 * The configuration layer a lens's concerns must read — the unit that HOSTS the active Work View.
 *
 * Membership already follows the lens's canonical host (`resolveProvisioningPopulationWorkUnitId`).
 * Configuration must follow the SAME object, or a lens selected from another route keeps the route
 * unit's configuration: right rows, wrong affordances. Pure; the caller supplies the units it already
 * holds. Falls back to the surface layer when the host is the surface, or when the host row is not in
 * the department set — never invents a layer.
 */
export function resolveActiveWorkViewConfigLayer<T extends { id: string; metadata?: unknown }>(input: {
    surfaceWorkUnitId: string;
    populationWorkUnitId: string;
    surfaceMetadata: unknown;
    deptWorkUnits: readonly T[];
}): { workUnitId: string; metadata: unknown } {
    const surface = input.surfaceWorkUnitId.trim();
    const population = input.populationWorkUnitId.trim() || surface;
    if (!population || population === surface) {
        return { workUnitId: surface, metadata: input.surfaceMetadata ?? null };
    }
    const host = input.deptWorkUnits.find((u) => String(u.id) === population) ?? null;
    if (!host) return { workUnitId: surface, metadata: input.surfaceMetadata ?? null };
    return { workUnitId: population, metadata: host.metadata ?? null };
}

/** Pure resolution: configured Work Views + the department's units → canonical Settlement locators. */
export function resolveSettlementLocators(input: {
    workViews: ReadonlyArray<WorkViewConfigV1Stored>;
    deptWorkUnits: ReadonlyArray<WorkViewCanonicalLocationWorkUnitRow>;
    departmentId: string;
    activeWorkViewId: string;
    surfaceWorkUnitId: string;
}): SettlementLocators {
    const departmentId = input.departmentId.trim();
    if (!departmentId) return SETTLEMENT_LOCATORS_UNAVAILABLE;

    const workViewCountTargets: SettlementCountTarget[] = [];
    for (const view of input.workViews) {
        const loc = resolveWorkViewCanonicalLocation(view, input.deptWorkUnits, departmentId);
        // A lens with no canonical count location is omitted, not faked — its pill simply stays reserved.
        if (loc) {
            workViewCountTargets.push({
                workViewId: view.id,
                hostWorkUnitId: loc.workUnitId,
                baseQueueKey: loc.baseQueueKey,
            });
        }
    }

    const queueTotalTarget =
        workViewCountTargets.find((t) => t.workViewId === input.activeWorkViewId) ?? null;

    const rightRailTarget: SettlementRightRailTarget | null = input.surfaceWorkUnitId
        ? { departmentId, workUnitId: input.surfaceWorkUnitId }
        : null;

    return { status: "resolved", workViewCountTargets, queueTotalTarget, rightRailTarget };
}

/** Fetch the department's units and resolve locators. Any failure resolves to `unavailable` — NEVER throws. */
export async function loadSettlementLocators(input: {
    supabase: SupabaseClient;
    orgId: string;
    departmentId: string;
    workViews: ReadonlyArray<WorkViewConfigV1Stored>;
    activeWorkViewId: string;
    surfaceWorkUnitId: string;
    /** Optional: units already in hand (parallelized with the answer's own fetches). */
    deptWorkUnits?: ReadonlyArray<WorkViewCanonicalLocationWorkUnitRow> | null;
}): Promise<SettlementLocators> {
    try {
        let deptWorkUnits = input.deptWorkUnits ?? null;
        if (!deptWorkUnits) {
            const { data, error } = await input.supabase
                .from("work_units")
                .select("id, key, name, department_id, is_active, sort_order, queue_definition")
                .eq("org_id", input.orgId)
                .eq("department_id", input.departmentId);
            if (error) return SETTLEMENT_LOCATORS_UNAVAILABLE;
            deptWorkUnits = (data ?? []) as WorkViewCanonicalLocationWorkUnitRow[];
        }
        return resolveSettlementLocators({
            workViews: input.workViews,
            deptWorkUnits,
            departmentId: input.departmentId,
            activeWorkViewId: input.activeWorkViewId,
            surfaceWorkUnitId: input.surfaceWorkUnitId,
        });
    } catch {
        return SETTLEMENT_LOCATORS_UNAVAILABLE;
    }
}
