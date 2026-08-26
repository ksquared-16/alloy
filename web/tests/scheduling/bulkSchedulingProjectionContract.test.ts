import { describe, expect, it } from "vitest";

import {
    MAX_IDS_PER_QUERY,
    loadSchedulingProjectionForChild,
    loadSchedulingProjectionsForChildren,
} from "@/lib/scheduling/projection/buildSchedulingProjection";

/**
 * The drawer VM projects EVERY inquiry child. One child at a time meant one three-hop chain each:
 * measured on the certification tenant, 17 children, a 239–316 ms leg, and 3,116–3,903 ms of
 * CUMULATIVE database work. Concurrency hid the fan-out; it did not pay for it. Two memoization
 * shapes were built and rejected on measurement before this — the evidence that a fan-out is removed
 * by asking once for the whole set, not by remembering answers.
 *
 * These cases hold the contract that makes that safe: the query count must not follow the child
 * count, the bulk result must agree with the single-child owner it replaced, and a batched read must
 * never let one child's row reach another child's projection.
 */

type Row = Record<string, unknown>;

/**
 * A Supabase double that records every read. Only the shapes this owner issues are supported, and an
 * unsupported one throws rather than quietly returning nothing — a stub that answers everything
 * would make a missing predicate look like a passing test.
 */
function fakeSupabase(tables: Record<string, Row[]>) {
    const queries: Array<{ table: string; filters: Record<string, unknown>; inLists: Record<string, string[]> }> = [];
    const client = {
        from(table: string) {
            const filters: Record<string, unknown> = {};
            const inLists: Record<string, string[]> = {};
            const q: Record<string, unknown> = {};
            const build = () => {
                const rows = (tables[table] ?? []).filter((row) =>
                    Object.entries(filters).every(([k, v]) => row[k] === v) &&
                    Object.entries(inLists).every(([k, list]) => list.includes(String(row[k]))),
                );
                return { data: rows, error: null };
            };
            const self: Record<string, unknown> = {
                select: () => self,
                eq: (col: string, val: unknown) => { filters[col] = val; return self; },
                in: (col: string, list: string[]) => { inLists[col] = list.map(String); return self; },
                order: () => self,
                limit: () => self,
                maybeSingle: () => { queries.push({ table, filters, inLists }); const r = build(); return Promise.resolve({ data: r.data[0] ?? null, error: null }); },
                then: (resolve: (v: unknown) => unknown) => { queries.push({ table, filters, inLists }); return Promise.resolve(build()).then(resolve); },
            };
            void q;
            return self;
        },
    };
    return { client: client as never, queries };
}

const ORG = "org-1";
const SITE = "site-1";
const base = () => ({
    child_enrollment_agreements: [] as Row[],
    schedule_assignments: [] as Row[],
    child_placements: [] as Row[],
    schedule_patterns: [] as Row[],
    operational_assignment_types: [] as Row[],
    process_instances: [] as Row[],
    locations: [] as Row[],
    location_program_categories: [] as Row[],
});

const kids = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ customerMemberId: `child-${i}`, subjectName: `Child ${i}` }));

const run = (tables: Record<string, Row[]>, children: ReturnType<typeof kids>) => {
    const { client, queries } = fakeSupabase(tables);
    return loadSchedulingProjectionsForChildren(client, ORG, {
        children,
        siteLocationId: SITE,
        todayYmd: "2026-08-26",
        computedAt: "2026-08-26T00:00:00.000Z",
        siteName: "North Campus",
    }).then((result) => ({ result, queries }));
};

describe("query count does not follow child count", () => {
    it.each([1, 2, 17, 60])("issues the same bounded number of reads for %i children", async (n) => {
        const { queries } = await run(base(), kids(n));
        // The shape is what matters, not the exact constant: it must not scale with n.
        expect(queries.length).toBeLessThanOrEqual(10);
    });

    it("never issues a per-child read for the same table", async () => {
        const { queries } = await run(base(), kids(17));
        const perTable = queries.reduce<Record<string, number>>((acc, q) => {
            acc[q.table] = (acc[q.table] ?? 0) + 1;
            return acc;
        }, {});
        for (const [table, count] of Object.entries(perTable)) {
            expect(count, `${table} was read ${count} times for 17 children`).toBeLessThan(17);
        }
    });

    it("chunks an oversized id set deterministically rather than sending one unbounded IN", async () => {
        const n = MAX_IDS_PER_QUERY * 2 + 5;
        const { queries } = await run(base(), kids(n));
        const agreementReads = queries.filter((q) => q.table === "child_enrollment_agreements");
        expect(agreementReads.length).toBe(3);
        for (const q of agreementReads) {
            expect(q.inLists.customer_member_id.length).toBeLessThanOrEqual(MAX_IDS_PER_QUERY);
        }
        // Every requested child is covered exactly once across the chunks.
        const covered = agreementReads.flatMap((q) => q.inLists.customer_member_id);
        expect(new Set(covered).size).toBe(n);
    });
});

describe("access boundary", () => {
    it("scopes every read to the organisation", async () => {
        const { queries } = await run(base(), kids(3));
        for (const q of queries) expect(q.filters.org_id, `${q.table} lost its org predicate`).toBe(ORG);
    });

    it("keeps the site predicate on the agreement read", async () => {
        const { queries } = await run(base(), kids(3));
        const agreements = queries.find((q) => q.table === "child_enrollment_agreements");
        expect(agreements?.filters.site_location_id).toBe(SITE);
    });

    /**
     * THE BATCHING RISK, stated as a case: a row that comes back for an unrequested child must not
     * enter any requested child's projection just because they were read together.
     */
    it("a row for an unrequested child cannot enter a requested child's projection", async () => {
        const tables = base();
        tables.schedule_assignments = [
            { id: "a1", org_id: ORG, customer_member_id: "child-0", schedule_pattern_id: "p1", start_date: "2026-01-01" },
            { id: "a2", org_id: ORG, customer_member_id: "intruder", schedule_pattern_id: "p1", start_date: "2026-01-01" },
        ];
        const { result } = await run(tables, kids(1));
        expect([...result.keys()]).toEqual(["child-0"]);
        const projection = result.get("child-0")!;
        expect(projection.subject.id).toBe("child-0");
        // The intruder's assignment shared the pattern id, which is exactly how a batched read could
        // have carried it across. It must not appear in this child's assignments.
        const assignmentIds = projection.children.flatMap((c) =>
            [c.current, c.proposed, ...c.upcoming, ...c.temporary]
                .filter((v): v is NonNullable<typeof v> => Boolean(v))
                .flatMap((view) => view.assignments.map((a) => a.id)),
        );
        expect(assignmentIds).not.toContain("a2");
    });

    /**
     * DEFENCE IN DEPTH, TESTED AS SUCH. The predicates above are the first boundary; this asserts the
     * second one. The client here deliberately IGNORES its `in(...)` predicate, so the owner receives
     * rows it never asked for — the shape a broken filter, a permissive view or a future refactor
     * would produce. The stitch must still build only the children that were requested.
     */
    it("ignores rows the database returned for children that were not requested", async () => {
        const tables = base();
        tables.schedule_assignments = [
            { id: "a1", org_id: ORG, customer_member_id: "child-0", schedule_pattern_id: "p1", start_date: "2026-01-01" },
            { id: "a2", org_id: ORG, customer_member_id: "intruder", schedule_pattern_id: "p1", start_date: "2026-01-01" },
        ];
        const bag = tables as Record<string, Row[]>;
        const leaky = {
            from(table: string) {
                const filters: Record<string, unknown> = {};
                const self: Record<string, unknown> = {
                    select: () => self,
                    eq: (c: string, v: unknown) => { filters[c] = v; return self; },
                    in: () => self,                       // the predicate is dropped on purpose
                    order: () => self,
                    limit: () => self,
                    maybeSingle: () => Promise.resolve({ data: (bag[table] ?? [])[0] ?? null, error: null }),
                    then: (resolve: (v: unknown) => unknown) =>
                        Promise.resolve({ data: bag[table] ?? [], error: null }).then(resolve),
                };
                return self;
            },
        };
        const result = await loadSchedulingProjectionsForChildren(leaky as never, ORG, {
            children: [{ customerMemberId: "child-0", subjectName: "Child 0" }],
            siteLocationId: SITE,
            todayYmd: "2026-08-26",
            computedAt: "2026-08-26T00:00:00.000Z",
            siteName: "North Campus",
        });
        expect([...result.keys()]).toEqual(["child-0"]);
    });

    it("returns an entry for every requested child and for no one else", async () => {
        const { result } = await run(base(), kids(4));
        expect([...result.keys()].sort()).toEqual(["child-0", "child-1", "child-2", "child-3"]);
    });

    it("collapses duplicate requested ids to one entry", async () => {
        const dupes = [...kids(2), { customerMemberId: "child-0", subjectName: "Child 0" }];
        const { result } = await run(base(), dupes);
        expect([...result.keys()].sort()).toEqual(["child-0", "child-1"]);
    });
});

describe("truth equivalence with the single-child owner", () => {
    /**
     * The single-child API delegates here with a one-item set, so this asserts the delegation is
     * faithful for each fixture rather than that two implementations happen to agree.
     */
    const fixtures: Array<{ name: string; tables: Record<string, Row[]>; id: string }> = [
        { name: "no rows at all", tables: base(), id: "child-0" },
        {
            name: "assignment with a shared pattern",
            tables: (() => {
                const t = base();
                t.schedule_assignments = [
                    { id: "a1", org_id: ORG, customer_member_id: "child-0", schedule_pattern_id: "p1", start_date: "2026-01-01", room_location_id: "room-1" },
                    { id: "a2", org_id: ORG, customer_member_id: "child-1", schedule_pattern_id: "p1", start_date: "2026-01-01", room_location_id: "room-1" },
                ];
                t.schedule_patterns = [{ id: "p1", org_id: ORG, weekdays: [1, 2], label: "MW", metadata: null }];
                t.locations = [{ id: "room-1", org_id: ORG, label: "Infant A" }];
                return t;
            })(),
            id: "child-0",
        },
        {
            name: "agreement without assignments",
            tables: (() => {
                const t = base();
                t.child_enrollment_agreements = [
                    { id: "ag1", org_id: ORG, customer_member_id: "child-0", site_location_id: SITE, status: "active" },
                ];
                return t;
            })(),
            id: "child-0",
        },
    ];

    it.each(fixtures)("$name — the single-child API returns the plural owner's entry", async ({ tables, id }) => {
        const { client } = fakeSupabase(tables);
        const args = { siteLocationId: SITE, todayYmd: "2026-08-26", computedAt: "2026-08-26T00:00:00.000Z", siteName: "North Campus" };
        const single = await loadSchedulingProjectionForChild(client as never, ORG, {
            customerMemberId: id, subjectName: "Child 0", ...args,
        });
        const { client: c2 } = fakeSupabase(tables);
        const plural = await loadSchedulingProjectionsForChildren(c2 as never, ORG, {
            children: [{ customerMemberId: id, subjectName: "Child 0" }], ...args,
        });
        expect(single).toEqual(plural.get(id));
    });

    it("a child with no schedulable truth still gets a projection, not an omission", async () => {
        const { result } = await run(base(), kids(1));
        const projection = result.get("child-0");
        expect(projection).toBeDefined();
        expect(projection!.subject.id).toBe("child-0");
        expect(projection!.children).toHaveLength(1);
    });
});
