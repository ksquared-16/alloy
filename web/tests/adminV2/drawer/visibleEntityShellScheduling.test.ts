import { describe, expect, it, vi } from "vitest";
import { buildOpportunityDrawerVisiblePayload } from "@/lib/admin/opportunityEntityRecord";

/*
 * `fetchEffectiveStatusDefinitionsTagged` ignores the client it is handed and builds its own from
 * `SUPABASE_URL`, so under a stub client it throws before the shells are ever issued. Unmocked, this
 * plant would go red on the base for the wrong reason — "the children read never happened" rather
 * than "it happened too late" — and the generation discriminator below would never run on the
 * failing side. Mocked, the build gets past the primary join in both forms and the ORDER is what
 * decides the result.
 */
vi.mock("@/lib/admin/statusDefinitionsResolve", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/admin/statusDefinitionsResolve")>();
    return { ...actual, fetchEffectiveStatusDefinitionsTagged: async () => ({ rows: [] }) };
});

/**
 * A stub client that records, for every `.from(table)`, HOW MANY reads had already resolved when
 * that table was first issued.
 *
 * That number is the STAGE the read belongs to, and it is recorded synchronously at issue time, so
 * it is unaffected by whether the surrounding build later succeeds. Reads issued in the same
 * synchronous burst all see the same count; a read that had to wait for another to resolve sees a
 * strictly larger one.
 *
 * Tick-based rather than wall-clock on purpose: a stub settles on microtasks, so a serial chain and
 * a concurrent one differ by a TICK, not by milliseconds. A timing threshold would be flaky and
 * would not be measuring the thing under test.
 */
function makeIssueGenerationRecorder() {
    let resolved = 0;
    const gen = new Map<string, number>();

    const makeChain = (): Record<string, unknown> => {
        const chain: Record<string, unknown> = {};
        const settle = <T,>(value: T): Promise<T> =>
            Promise.resolve().then(() => {
                resolved += 1;
                return value;
            });
        // Every filter/shape method returns the chain, so any call shape this code uses keeps working.
        for (const m of [
            "select", "eq", "neq", "in", "not", "is", "gt", "gte", "lt", "lte", "or", "filter",
            "order", "limit", "range", "contains", "overlaps", "match", "like", "ilike", "abortSignal",
        ]) {
            chain[m] = () => chain;
        }
        // The three ways this code settles a query.
        chain.then = (onOk?: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
            settle({ data: [], error: null }).then(onOk, onErr);
        chain.maybeSingle = () => settle({ data: null, error: null });
        chain.single = () => settle({ data: null, error: null });
        chain.csv = () => settle({ data: "", error: null });
        return chain;
    };

    const client = {
        from: (table: string) => {
            if (!gen.has(table)) gen.set(table, resolved);
            return makeChain();
        },
        rpc: () => makeChain(),
    };

    return {
        client: client as never,
        generationOf: (table: string) => (gen.has(table) ? (gen.get(table) as number) : null),
        tables: () => [...gen.keys()],
    };
}

/**
 * OX J5 — THE SHELL JOIN MUST NOT WAIT FOR THE PRIMARY JOIN.
 *
 * Measured n=24 against deployed staging, `visible_entity_ms` P50 962ms decomposed exactly into
 * three SERIAL stages: `drawer_primary_parallel_ms` 130 + `shell_parallel_ms` 632 +
 * `case_employment_ms` 201 = 963. `visible_entity` is 55% of `shared_deps_wall_ms` (P50 1,742ms),
 * and the shell join is two thirds of it, so the order of these two stages is on the T6 wall.
 *
 * The shells never needed the primary join. Across all four, the only host keys read are `id`,
 * `primary_person_id`, `status`, `status_key`, `work_unit_id`, `customer_id`, `metadata`,
 * `program_type` and `schedule_type` — every one a column of `data`. The primary join writes a
 * disjoint set (`_work_unit_department_id`, `_customer_name`, `_status_display`, `_primary_person_*`,
 * `_primary_contact_*`, the lifecycle fields, …). The dependency was on the OBJECT `vis`, never on
 * its contents.
 *
 * This asserts the schedule, which is the whole repair. It is deliberately NOT an assertion that
 * some promise exists — a shell that is constructed but still awaited last would satisfy that and
 * cost the same 130ms.
 */
describe("visible_entity — shell join scheduling", () => {
    const ORG = "org-1";
    const OPP = {
        id: "opp-1",
        org_id: ORG,
        customer_id: "cust-1",
        primary_person_id: "person-1",
        primary_contact_id: "contact-1",
        work_unit_id: "wu-1",
        location_id: "loc-1",
        pipeline_stage_id: "stage-1",
        status: "open",
        status_key: "inquiry",
        program_type: "infant",
        schedule_type: "full_time",
        metadata: {},
    };

    async function issueGenerations() {
        const rec = makeIssueGenerationRecorder();
        /*
         * The build is allowed to fail on a stub this thin — the generations are recorded at ISSUE
         * time, so the schedule is observable either way. Swallowing here keeps the assertion about
         * ordering rather than about how complete the stub is.
         */
        await buildOpportunityDrawerVisiblePayload(rec.client, ORG, { ...OPP }).catch(() => undefined);
        return rec;
    }

    it("issues the children shell read in the SAME stage as the primary lookups", async () => {
        const rec = await issueGenerations();
        const childrenGen = rec.generationOf("opportunity_customer_members");
        // Reachability first — an assertion over a read that never happened is not a passing plant.
        expect(
            childrenGen,
            `children shell must actually read; tables issued: ${rec.tables().join(", ")}`,
        ).not.toBeNull();
        /*
         * Zero means "issued before anything had resolved" — the same burst as the primary lookups.
         * With the shells awaited after the primary join this is 1 or more, and this fails: that is
         * the plant.
         */
        expect(
            childrenGen,
            "the children shell reads only columns of `data` and must not wait for the primary join",
        ).toBe(0);
    });

    it("issues the primary lookups in that same first stage — the burst is shared, not swapped", async () => {
        const rec = await issueGenerations();
        // Guards against a repair that merely reverses the two stages instead of merging them.
        const primary = rec.generationOf("customers") ?? rec.generationOf("locations");
        expect(primary, `primary lookups must issue; tables: ${rec.tables().join(", ")}`).not.toBeNull();
        expect(primary, "the primary lookups must still be in the first burst").toBe(0);
    });
});
