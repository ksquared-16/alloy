/**
 * The silent-drop audit, pinned.
 *
 * Every consumer here asks a question of the form "which enrollment journeys belong to this
 * Opportunity?" — and every one of them answered it by matching `process_instances.context_id`
 * against an Opportunity id. Once a journey anchors to the child's Enrollment Participation that
 * match finds nothing, and none of these consumers treat "nothing" as a problem: a queue renders
 * empty, a rollup counts fewer children, an enrichment attaches less. No error is raised anywhere,
 * which is exactly why this needs tests rather than types.
 *
 * The two helpers are the audit's conclusion: the widening is written once, in each direction, and
 * these prove both directions and every property a caller depends on.
 */

import { describe, expect, it } from "vitest";

import {
    enrollmentContextIdsForOpportunities,
    opportunityIdsForEnrollmentContexts,
} from "@/lib/enrollment/completion/resolveEnrollmentJourneyContext";

const ORG = "11111111-1111-4111-8111-111111111111";
const OPP = "22222222-2222-4222-8222-222222222222";
const OTHER_OPP = "55555555-5555-4555-8555-555555555555";
const OCM = "33333333-3333-4333-8333-333333333333";
const OCM_CONTEXT_FREE = "44444444-4444-4444-8444-444444444444";

type Ocm = { id: string; opportunity_id: string | null };

/** Records what was asked, so "one query, not one per child" is a property and not a hope. */
function client(rows: Ocm[]) {
    const calls: { column: string; values: unknown[] }[] = [];
    const supabase = {
        from: () => {
            const filters: Record<string, unknown> = {};
            let inCol = "";
            let inVals: unknown[] = [];
            const b: Record<string, unknown> = {
                select: () => b,
                eq: (c: string, v: unknown) => {
                    filters[c] = v;
                    return b;
                },
                in: (c: string, v: unknown[]) => {
                    inCol = c;
                    inVals = v;
                    calls.push({ column: c, values: v });
                    return b;
                },
                then: (resolve: (r: { data: unknown; error: null }) => void) =>
                    resolve({
                        data: rows.filter((r) => inVals.includes((r as Record<string, unknown>)[inCol])),
                        error: null,
                    }),
            };
            return b;
        },
    } as never;
    return { supabase, calls };
}

describe("Opportunity -> the journeys that belong to it", () => {
    it("matches BOTH anchors, so no backfill has to land first", async () => {
        const { supabase } = client([{ id: OCM, opportunity_id: OPP }]);
        const { contextIds, opportunityIdByContextId } = await enrollmentContextIdsForOpportunities(
            supabase,
            ORG,
            [OPP],
        );
        // The Opportunity id is kept: journeys written under the older anchor still match.
        expect(contextIds).toContain(OPP);
        // And the participation is added: journeys written under the new one match too.
        expect(contextIds).toContain(OCM);
        expect(opportunityIdByContextId.get(OCM)).toBe(OPP);
    });

    it("asks once for the whole set, not once per Opportunity", async () => {
        const { supabase, calls } = client([{ id: OCM, opportunity_id: OPP }]);
        await enrollmentContextIdsForOpportunities(supabase, ORG, [OPP, OTHER_OPP, OPP]);
        expect(calls).toHaveLength(1);
        // Deduplicated on the way in.
        expect(calls[0]!.values).toEqual([OPP, OTHER_OPP]);
    });

    it("asks nothing at all for an empty set", async () => {
        const { supabase, calls } = client([]);
        const { contextIds } = await enrollmentContextIdsForOpportunities(supabase, ORG, []);
        expect(contextIds).toEqual([]);
        expect(calls).toHaveLength(0);
    });
});

describe("journeys -> the Opportunity behind each", () => {
    it("resolves a participation anchor, and maps an Opportunity anchor to itself", async () => {
        const { supabase } = client([{ id: OCM, opportunity_id: OPP }]);
        const map = await opportunityIdsForEnrollmentContexts(supabase, ORG, [
            { context_type: "enrollment_participation", context_id: OCM },
            { context_type: "opportunity", context_id: OTHER_OPP },
        ]);
        expect(map.get(OCM)).toBe(OPP);
        // No special case for the older anchor at any call site.
        expect(map.get(OTHER_OPP)).toBe(OTHER_OPP);
    });

    it("leaves a context-free participation ABSENT rather than mapped to nothing", async () => {
        /*
         * A caller uses this map to build a query. Handing back an empty string would produce a
         * lookup for an Opportunity called "" — which matches no row and reads, at the call site,
         * exactly like a family who has one.
         */
        const { supabase } = client([{ id: OCM_CONTEXT_FREE, opportunity_id: null }]);
        const map = await opportunityIdsForEnrollmentContexts(supabase, ORG, [
            { context_type: "enrollment_participation", context_id: OCM_CONTEXT_FREE },
        ]);
        expect(map.has(OCM_CONTEXT_FREE)).toBe(false);
    });

    it("does not query when every row already carries an Opportunity", async () => {
        const { supabase, calls } = client([]);
        const map = await opportunityIdsForEnrollmentContexts(supabase, ORG, [
            { context_type: "opportunity", context_id: OPP },
        ]);
        expect(map.get(OPP)).toBe(OPP);
        expect(calls).toHaveLength(0);
    });

    it("ignores rows with no context at all", async () => {
        const { supabase, calls } = client([]);
        const map = await opportunityIdsForEnrollmentContexts(supabase, ORG, [
            { context_type: "enrollment_participation", context_id: null },
            { context_type: null, context_id: "  " },
        ]);
        expect(map.size).toBe(0);
        expect(calls).toHaveLength(0);
    });
});
