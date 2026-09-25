import { describe, expect, it, vi } from "vitest";
import { resolveSharedCanonicalDeps } from "@/lib/adminV2/viewModel/drawer/opportunity/sharedCanonicalDeps";

/*
 * `fetchEffectiveStatusDefinitionsTagged` ignores the client it is handed and builds its own from
 * SUPABASE_URL, so under a stub it throws before the later stages are reached and this plant would
 * go red for the wrong reason. Mocked, the ORDER of issue is what decides the result.
 */
vi.mock("@/lib/admin/statusDefinitionsResolve", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/admin/statusDefinitionsResolve")>();
    return { ...actual, fetchEffectiveStatusDefinitionsTagged: async () => ({ rows: [] }) };
});

const OPP_ID = "opp-1";
const ORG_ID = "org-1";

/**
 * Record, for every `.from(table)`, HOW MANY reads had already resolved when it was first issued.
 *
 * That number is the stage the read belongs to. It is captured synchronously at issue time, so it
 * is observable whether or not the surrounding compose later succeeds on a thin stub.
 */
function makeIssueGenerationRecorder() {
    let resolved = 0;
    const gen = new Map<string, number>();
    const rowFor = (table: string) =>
        table === "opportunities"
            ? {
                  id: OPP_ID,
                  org_id: ORG_ID,
                  customer_id: "cust-1",
                  work_unit_id: "wu-1",
                  stage_key: "inquiry",
                  lifecycle_stage_key: "inquiry",
                  status_key: "open",
                  metadata: {},
              }
            : null;
    const makeChain = (table: string): Record<string, unknown> => {
        const chain: Record<string, unknown> = {};
        const settle = <T,>(v: T): Promise<T> =>
            Promise.resolve().then(() => {
                resolved += 1;
                return v;
            });
        for (const m of [
            "select", "eq", "neq", "in", "not", "is", "gt", "gte", "lt", "lte", "or", "filter",
            "order", "limit", "range", "contains", "overlaps", "match", "like", "ilike", "abortSignal",
        ]) {
            chain[m] = () => chain;
        }
        chain.then = (ok?: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
            settle({ data: [], error: null }).then(ok, err);
        chain.maybeSingle = () => settle({ data: rowFor(table), error: null });
        chain.single = () => settle({ data: rowFor(table), error: null });
        return chain;
    };
    const client = {
        from: (table: string) => {
            if (!gen.has(table)) gen.set(table, resolved);
            return makeChain(table);
        },
        rpc: () => makeChain("rpc"),
    };
    return {
        client: client as never,
        generationOf: (t: string) => (gen.has(t) ? (gen.get(t) as number) : null),
        tables: () => [...gen.keys()],
    };
}

/**
 * OX J5 — THE MISSION-STAGE ROUND TRIP IS NOT THE LAST STAGE.
 *
 * Measured n=23 on deployed 38248a2d, shared deps was four SERIAL top-level stages -
 * base_subject 260 -> visible_entity 875 -> status_and_dept 218 -> mission_stages 219 - reconciling
 * against shared_deps_wall P50 1,634ms with a per-sample remainder of 2ms. mission_stages was last
 * only by source order: its load reads `id`, `stage_key` and `lifecycle_stage_key`, all columns of
 * the canonical opportunity select.
 *
 * The EPP load queries `process_instances`. The household leg of the status/dept block queries
 * `customer_persons`, and that block runs strictly AFTER visible_entity. So the order of those two
 * reads is the schedule:
 *
 *   serial  -> customer_persons is issued first, process_instances last
 *   repaired-> process_instances is issued as soon as the opportunity row lands
 *
 * This asserts that ordering, which is the repair. It is deliberately NOT an assertion that a
 * promise was constructed - a load started and then awaited last would satisfy that and cost the
 * same 219ms of critical path.
 */
describe("shared deps — mission-stage load scheduling", () => {
    async function issueGenerations() {
        const rec = makeIssueGenerationRecorder();
        await resolveSharedCanonicalDeps({
            supabase: rec.client,
            gate: { orgId: ORG_ID } as never,
            opportunityId: OPP_ID,
        } as never).catch(() => undefined);
        return rec;
    }

    /*
     * THE DISCRIMINATOR IS REACHABILITY, AND THAT IS THE DEPENDENCY CLAIM ITSELF.
     *
     * Measured both ways against this same stub: with the load left at the end of the chain the
     * compose reaches `record_drawer_layouts, opportunities, record_layouts, work_units` and STOPS
     * -- `process_instances` is never issued, because it sat behind base_subject, visible_entity and
     * status_and_dept all completing. With the load started at the opportunity row it is issued at
     * generation 5 even though those later stages still do not complete.
     *
     * So "was the EPP round trip issued" is exactly "does it still depend on the rest of the chain".
     * Restore the serial edge and this goes red.
     */
    it("issues the EPP round trip without waiting for the later shared-deps stages", async () => {
        const rec = await issueGenerations();
        const epp = rec.generationOf("process_instances");
        expect(
            epp,
            `EPP round trip must not depend on the later stages; tables issued: ${rec.tables().join(", ")}`,
        ).not.toBeNull();
    });

    it("issues it close behind the opportunity row, its only real dependency", async () => {
        const rec = await issueGenerations();
        const opp = rec.generationOf("opportunities");
        const epp = rec.generationOf("process_instances");
        expect(opp, "the opportunity select must issue").not.toBeNull();
        expect(epp, `EPP must issue; tables: ${rec.tables().join(", ")}`).not.toBeNull();
        /*
         * The load is two round trips of its own -- enrollment context ids, then process_instances
         * -- so the second hop is a few generations behind the row. The bound keeps it in the early
         * burst rather than pinning an exact tick.
         */
        expect((epp as number) - (opp as number)).toBeLessThanOrEqual(8);
    });
});
