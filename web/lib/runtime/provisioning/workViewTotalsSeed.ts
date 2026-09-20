import "server-only";

/**
 * THE WORK VIEW COUNT SEED — the document answering what the browser used to ask for separately.
 *
 * WU-03's lane counts are the product's completion owner. Measured deployed at 8c8972d5e the chain
 * is: document finishes ~1,726ms, the browser THEN issues /api/admin/queue-view-totals at ~+57ms,
 * that request costs ~1,588ms, and WU-03's final authoritative mutation lands 11.0-12.2ms after it
 * responds — on 11 of 11 samples. So FIRST_ORDER_VISIBLE_COMPLETE is, almost exactly, the moment
 * that second round trip returns.
 *
 * Inside that request, ~401ms per group across FIVE distinct lifecycle work units is spent
 * REACQUIRING truth the document already holds: a work_units existence check, the same row again
 * for department_id, and the departments metadata. The document's route identity read already
 * carries the whole lifecycle work-unit set with departments(...metadata) embedded, and the
 * composer has already loaded the department's units and its metadata for Settlement locators.
 *
 * Both problems therefore have ONE fix, and it is not a cache: evaluate the counts where the truth
 * already lives. This module does that. It performs NO work-unit or department reads — every
 * prerequisite is passed in from what the composer already resolved — and it delegates the actual
 * counting to `evaluateWorkViewTotalsForGroup`, the same evaluator the endpoint uses, so there is
 * exactly one Work View counting predicate.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 *   - It does not call the standalone endpoint. That would keep the round trip and add a hop.
 *   - It does not copy Work View predicates. Grain resolution, child membership and the
 *     projection all stay with their existing owners.
 *   - It does not decide authorization. The composer's gate already did; this reads `is_active`
 *     and department membership off rows the gate's scope produced.
 *   - It carries no permission verdict to the browser. The seed carries counts and an identity —
 *     never a capability.
 *
 * THE IDENTITY IS THE WHOLE SAFETY ARGUMENT. A seed answers only the exact question it was
 * computed for: this org, this host work unit, this site scope, this configured Work View set. A
 * client whose scope or configuration differs by one field must fall back rather than render a
 * count computed for a different question — which is why the signature binds view IDENTITIES
 * rather than a count or an order-dependent array position.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    emptyWorkViewTotalsSpans,
    evaluateWorkViewTotalsForGroup,
    type WorkViewTotalRow,
    type WorkViewTotalsSpans,
} from "@/lib/queues/evaluateWorkViewTotalsForGroup";
import type { SettlementCountTarget } from "./settlementLocators";

/** A department work-unit row as the composer already holds it. No read happens here. */
export type SeedWorkUnitRow = {
    id: string;
    is_active?: boolean | null;
    department_id?: string | null;
};

/**
 * What a client must match before it may use this seed.
 *
 * `configuredViewSignature` is built from view IDENTITIES, sorted, so a reorder produces the SAME
 * signature (reordering does not change any count) while an add, a remove or a rename produces a
 * different one. Binding by array position would let configuration N satisfy N+1 whenever the
 * cardinality happened to match.
 */
export type WorkViewTotalsSeedIdentity = {
    orgId: string;
    /** The surface work unit the document answered for. */
    hostWorkUnitId: string;
    /**
     * The site/location scope the counts were computed under. The document composes with no
     * workspace site filter, so this is null; a site-filtered operator MUST NOT consume it.
     */
    selectedSiteId: string | null;
    /** Sorted configured Work View identities, joined. Identity, never position. */
    configuredViewSignature: string;
};

export type WorkViewTotalsSeed = {
    status: "resolved";
    identity: WorkViewTotalsSeedIdentity;
    /** One row per configured view that had a canonical count location. */
    totals: WorkViewTotalRow[];
    spans: WorkViewTotalsSpans;
} | {
    /**
     * The seed could not answer. The client issues its canonical fallback request — exactly as it
     * did before this existed. UNAVAILABLE IS NEVER ZERO and never an empty totals list presented
     * as authoritative, which is why the unresolved shape carries no `totals` at all.
     */
    status: "unavailable";
    reason: string;
};

export function buildConfiguredViewSignature(viewIds: readonly string[]): string {
    return [...new Set(viewIds.map((v) => v.trim()).filter(Boolean))].sort().join(",");
}

/**
 * Resolve the configured Work View counts from prerequisites the composer already owns.
 *
 * NEVER throws: any failure degrades to `unavailable`, and the client's canonical fallback still
 * answers. A count is an enrichment of the first-order frame; it may not cost the document its
 * answer.
 */
export async function resolveWorkViewTotalsSeed(input: {
    supabase: SupabaseClient;
    orgId: string;
    /** The surface work unit this document answered for. */
    hostWorkUnitId: string;
    /** Configuration-derived count locations — one per configured view that has one. */
    countTargets: readonly SettlementCountTarget[];
    /** The department's work units, already loaded by the composer for Settlement locators. */
    deptWorkUnits: readonly SeedWorkUnitRow[];
    /** The department metadata layer publishing these units' Work View configuration. */
    departmentMetadata: unknown;
    /** The department the gate already authorized for this route. */
    departmentId: string;
    recordScopeConstraints: Parameters<typeof evaluateWorkViewTotalsForGroup>[0]["recordScopeConstraints"];
    recordScopeImpossible: boolean;
    /*
     * The viewer timezone META (`{ iana, source, cacheHit }`), not a string — the shape
     * `fetchEffectiveUserDisplayTimezoneCached` returns and `getWorkUnitQueueItems` consumes.
     * Derived from the evaluator so the two can never disagree about it.
     */
    viewerDisplayTimeZone: Parameters<typeof evaluateWorkViewTotalsForGroup>[0]["viewerDisplayTimeZone"];
}): Promise<WorkViewTotalsSeed> {
    try {
        if (!input.countTargets.length) {
            return { status: "unavailable", reason: "no_configured_count_targets" };
        }
        if (!input.departmentId.trim()) {
            return { status: "unavailable", reason: "no_department" };
        }

        /*
         * ACCESSIBILITY FROM ROWS THE GATE ALREADY PRODUCED.
         *
         * The endpoint asks the database whether each work unit exists, is active and sits in an
         * allowed department. Every one of those facts is already true of `deptWorkUnits`: the
         * composer fetched them for THIS department, which the route gate authorized, so the
         * remaining question is only whether the row is present and active.
         *
         * A target whose host is NOT in the set is not assumed accessible — it resolves UNKNOWN,
         * the same answer the endpoint gives when its access check fails.
         */
        const activeById = new Map<string, boolean>();
        for (const row of input.deptWorkUnits) {
            const id = String(row.id ?? "").trim();
            if (!id) continue;
            // Department membership is implied by the query that produced these rows; re-check it
            // anyway so a caller that widens that query cannot silently widen the seed.
            const sameDepartment =
                row.department_id == null || String(row.department_id) === input.departmentId.trim();
            activeById.set(id, row.is_active !== false && sameDepartment);
        }

        type Group = { workUnitId: string; queueKey: string; viewIds: Set<string> };
        const groups = new Map<string, Group>();
        for (const t of input.countTargets) {
            const workUnitId = t.hostWorkUnitId?.trim();
            const queueKey = t.baseQueueKey?.trim();
            const workViewId = t.workViewId?.trim();
            if (!workUnitId || !queueKey || !workViewId) continue;
            const key = `${workUnitId}::${queueKey}`;
            let g = groups.get(key);
            if (!g) {
                g = { workUnitId, queueKey, viewIds: new Set() };
                groups.set(key, g);
            }
            g.viewIds.add(workViewId);
        }
        if (!groups.size) return { status: "unavailable", reason: "no_resolvable_groups" };

        const spans = emptyWorkViewTotalsSpans();
        /*
         * Concurrency matches the endpoint's, so the seed's wall is comparable to the wall it
         * replaces rather than accidentally faster or slower for scheduling reasons.
         */
        const perGroup = await Promise.all(
            [...groups.values()].map((group) =>
                evaluateWorkViewTotalsForGroup({
                    supabase: input.supabase,
                    orgId: input.orgId,
                    group,
                    prerequisite: {
                        accessible: activeById.get(group.workUnitId) === true,
                        // ONE department metadata for every unit in this department — the fact the
                        // endpoint re-derives per work unit with two reads each.
                        departmentMetadata: input.departmentMetadata,
                    },
                    recordScopeConstraints: input.recordScopeConstraints,
                    recordScopeImpossible: input.recordScopeImpossible,
                    viewerDisplayTimeZone: input.viewerDisplayTimeZone,
                    spans,
                }),
            ),
        );

        return {
            status: "resolved",
            identity: {
                orgId: input.orgId,
                hostWorkUnitId: input.hostWorkUnitId,
                // The document composes with no workspace site filter.
                selectedSiteId: null,
                configuredViewSignature: buildConfiguredViewSignature(
                    input.countTargets.map((t) => t.workViewId),
                ),
            },
            totals: perGroup.flat(),
            spans,
        };
    } catch (e) {
        return {
            status: "unavailable",
            reason: e instanceof Error ? e.message.slice(0, 120) : "seed_failed",
        };
    }
}
