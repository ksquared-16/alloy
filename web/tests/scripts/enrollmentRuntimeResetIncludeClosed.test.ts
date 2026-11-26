/**
 * enrollment_runtime_reset — `--include-closed-opportunities` safety contract.
 *
 * The flag exists because the default open-only selection leaves closed opportunities behind, and
 * the shared-reference guard then correctly refuses to delete the families and children those
 * survivors still point at — so the catch-all Work Views never empty.
 *
 * What these tests are actually defending: that widening WHICH OPPORTUNITIES are candidates has
 * not widened anything else. Tenancy, golden-path protection, configuration preservation, and the
 * confirmation gates must all behave identically with the flag on and off.
 */

import { describe, expect, it } from "vitest";

import {
    DEMO_CLEANUP_TABLE_ORDER,
    ENROLLMENT_RUNTIME_RESET_MODE,
    GOLDEN_PATH_SEED_PACKAGE,
    INCLUDE_CLOSED_OPPORTUNITIES_ENV,
    PROTECTED_LOCATIONS_TABLE_KEY,
    parseDemoCleanupScopeFromEnv,
    type DemoCleanupScope,
} from "@/scripts/lib/demoRuntimeCleanupScope";
import { buildDemoCleanupCounts, resolveDemoIds } from "@/scripts/lib/demoRuntimeCleanupPlan";
import { buildEnrollmentResetSelection } from "@/scripts/lib/enrollmentRuntimeResetSelection";
import {
    assertResetTargetIdentity,
    parseSupabaseProjectRef,
} from "@/scripts/lib/resetOperationalStateIdentity";

const ORG = "org-1";
const OTHER_ORG = "org-2";

/**
 * Chainable Supabase mock with REAL `.range()` paging, so the widened path's pagination is
 * exercised rather than assumed. `.order()` sorts, `.range()` slices — a mock that ignored range
 * would let an off-by-one or a missing loop pass silently.
 */
function makeMockSupabase(tables: Record<string, Array<Record<string, unknown>>>) {
    return {
        from(table: string) {
            const builder: Record<string, unknown> = {
                _rows: [...(tables[table] ?? [])],
                select() {
                    return builder;
                },
                eq(col: string, val: unknown) {
                    builder._rows = (builder._rows as Array<Record<string, unknown>>).filter((r) => r[col] === val);
                    return builder;
                },
                in(col: string, vals: unknown[]) {
                    const set = new Set(vals);
                    builder._rows = (builder._rows as Array<Record<string, unknown>>).filter((r) => set.has(r[col]));
                    return builder;
                },
                order(col: string) {
                    builder._rows = [...(builder._rows as Array<Record<string, unknown>>)].sort((a, b) =>
                        String(a[col]).localeCompare(String(b[col]))
                    );
                    return builder;
                },
                range(from: number, to: number) {
                    builder._rows = (builder._rows as Array<Record<string, unknown>>).slice(from, to + 1);
                    return builder;
                },
                then(resolve: (r: { data: Array<Record<string, unknown>>; error: null }) => unknown) {
                    return Promise.resolve({ data: builder._rows as Array<Record<string, unknown>>, error: null }).then(
                        resolve
                    );
                },
            };
            return builder;
        },
    } as unknown as Parameters<typeof buildEnrollmentResetSelection>[0];
}

const WORK_UNITS = [
    { id: "wu-enroll", key: "enrollment_pipeline", org_id: ORG, is_active: true },
    { id: "wu-lead", key: "lifecycle_wu_lead", org_id: ORG, is_active: true },
    { id: "wu-billing", key: "billing", org_id: ORG, is_active: true },
];

/** Mirrors the observed hosted shape: open leads, plus closed opportunities nothing selects. */
const OPPORTUNITIES = [
    { id: "opp-open-status", org_id: ORG, name: "Open Lead", status_key: "new_inquiry", work_unit_id: null, metadata: {} },
    { id: "opp-open-wu", org_id: ORG, name: "On Enrollment WU", status_key: "enrolled", work_unit_id: "wu-enroll", metadata: {} },
    // Closed, no enrollment work unit — invisible to the default selection. This is the 2250.
    { id: "opp-closed-1", org_id: ORG, name: "Closed One", status_key: "closed_lost", work_unit_id: null, metadata: {} },
    { id: "opp-closed-2", org_id: ORG, name: "Closed Two", status_key: "closed_won", work_unit_id: null, metadata: {} },
    // Golden-path seed, closed — protected in BOTH modes.
    {
        id: "opp-golden-closed",
        org_id: ORG,
        name: "Golden Closed",
        status_key: "closed_won",
        work_unit_id: null,
        metadata: { demo_seed_package: GOLDEN_PATH_SEED_PACKAGE },
    },
    // A different tenant entirely — must never be selected, in either mode.
    { id: "opp-other-org", org_id: OTHER_ORG, name: "Other Org", status_key: "closed_lost", work_unit_id: null, metadata: {} },
];

describe("--include-closed-opportunities — default behaviour is unchanged", () => {
    it("selects open-only when the flag is absent", async () => {
        const supabase = makeMockSupabase({ work_units: WORK_UNITS, opportunities: OPPORTUNITIES });

        const selection = await buildEnrollmentResetSelection(supabase, ORG);

        expect(selection.includeClosedOpportunities).toBe(false);
        expect(selection.opportunityIds.sort()).toEqual(["opp-open-status", "opp-open-wu"]);
        expect(selection.selected.map((r) => r.id)).not.toContain("opp-closed-1");
        expect(selection.selected.map((r) => r.id)).not.toContain("opp-closed-2");
    });

    it("selects open-only when the flag is explicitly false", async () => {
        const supabase = makeMockSupabase({ work_units: WORK_UNITS, opportunities: OPPORTUNITIES });

        const selection = await buildEnrollmentResetSelection(supabase, ORG, {
            includeClosedOpportunities: false,
        });

        expect(selection.opportunityIds.sort()).toEqual(["opp-open-status", "opp-open-wu"]);
    });
});

describe("--include-closed-opportunities — expanded behaviour", () => {
    it("includes open AND closed opportunities for the org", async () => {
        const supabase = makeMockSupabase({ work_units: WORK_UNITS, opportunities: OPPORTUNITIES });

        const selection = await buildEnrollmentResetSelection(supabase, ORG, {
            includeClosedOpportunities: true,
        });

        expect(selection.includeClosedOpportunities).toBe(true);
        expect(selection.opportunityIds.sort()).toEqual([
            "opp-closed-1",
            "opp-closed-2",
            "opp-open-status",
            "opp-open-wu",
        ]);
    });

    it("still excludes golden-path seeds when expanded", async () => {
        const supabase = makeMockSupabase({ work_units: WORK_UNITS, opportunities: OPPORTUNITIES });

        const selection = await buildEnrollmentResetSelection(supabase, ORG, {
            includeClosedOpportunities: true,
        });

        expect(selection.opportunityIds).not.toContain("opp-golden-closed");
        expect(selection.excludedGoldenPath.map((r) => r.id)).toEqual(["opp-golden-closed"]);
    });

    it("cannot broaden beyond the explicit organization", async () => {
        const supabase = makeMockSupabase({ work_units: WORK_UNITS, opportunities: OPPORTUNITIES });

        const selection = await buildEnrollmentResetSelection(supabase, ORG, {
            includeClosedOpportunities: true,
        });

        expect(selection.opportunityIds).not.toContain("opp-other-org");
        for (const row of selection.selected) {
            expect(row.id).not.toBe("opp-other-org");
        }
    });

    it("refuses outright if an out-of-org row ever reaches the collector", async () => {
        // Simulates an org filter that failed to apply — the widened path must fail loudly rather
        // than plan a cross-tenant delete.
        const leakySupabase = {
            from(table: string) {
                const builder: Record<string, unknown> = {
                    _rows:
                        table === "work_units"
                            ? [...WORK_UNITS]
                            : [{ id: "opp-leak", org_id: OTHER_ORG, name: "Leak", status_key: "closed_lost", work_unit_id: null, metadata: {} }],
                    select: () => builder,
                    eq: (col: string, val: unknown) =>
                        table === "work_units"
                            ? ((builder._rows = (builder._rows as Array<Record<string, unknown>>).filter((r) => r[col] === val)), builder)
                            : builder, // opportunities: org filter silently does nothing
                    in: () => builder,
                    order: () => builder,
                    range: () => builder,
                    then: (resolve: (r: { data: unknown; error: null }) => unknown) =>
                        Promise.resolve({ data: builder._rows, error: null }).then(resolve),
                };
                return builder;
            },
        } as unknown as Parameters<typeof buildEnrollmentResetSelection>[0];

        await expect(
            buildEnrollmentResetSelection(leakySupabase, ORG, { includeClosedOpportunities: true })
        ).rejects.toThrow(/refusing out-of-org opportunity/i);
    });

    it("pages past the response cap instead of silently truncating", async () => {
        // 2400 rows across three pages. A single unpaged request would report 1000 and understate
        // the deletion by more than half — the exact way a dry run could mislead an approval.
        const many = Array.from({ length: 2400 }, (_, i) => ({
            id: `opp-${String(i).padStart(5, "0")}`,
            org_id: ORG,
            name: `Opp ${i}`,
            status_key: i % 2 === 0 ? "closed_lost" : "new_inquiry",
            work_unit_id: null,
            metadata: {},
        }));
        const supabase = makeMockSupabase({ work_units: WORK_UNITS, opportunities: many });

        const selection = await buildEnrollmentResetSelection(supabase, ORG, {
            includeClosedOpportunities: true,
        });

        expect(selection.opportunityIds).toHaveLength(2400);
    });
});

/**
 * Selection is only half the claim. The flag is worthless if a closed opportunity is *selected*
 * but its family, children, work, bookings and documents are not expanded behind it — that would
 * delete the opportunity and strand exactly the rows the reset exists to remove.
 *
 * These drive the real `resolveDemoIds`, so they prove expansion, not intent.
 */
describe("--include-closed-opportunities — complete closed dependency graph", () => {
    /** Generic table mock supporting the filters resolveDemoIds actually issues. */
    function makeGraphSupabase(tables: Record<string, Array<Record<string, unknown>>>) {
        return {
            from(table: string) {
                const b: Record<string, unknown> = {
                    _rows: [...(tables[table] ?? [])],
                    select: () => b,
                    or: () => b,
                    eq(col: string, val: unknown) {
                        b._rows = (b._rows as Array<Record<string, unknown>>).filter((r) => r[col] === val);
                        return b;
                    },
                    in(col: string, vals: unknown[]) {
                        const s = new Set(vals);
                        b._rows = (b._rows as Array<Record<string, unknown>>).filter((r) => s.has(r[col]));
                        return b;
                    },
                    order(col: string) {
                        b._rows = [...(b._rows as Array<Record<string, unknown>>)].sort((x, y) =>
                            String(x[col]).localeCompare(String(y[col]))
                        );
                        return b;
                    },
                    range(from: number, to: number) {
                        b._rows = (b._rows as Array<Record<string, unknown>>).slice(from, to + 1);
                        return b;
                    },
                    then: (res: (r: { data: unknown; error: null }) => unknown) =>
                        Promise.resolve({ data: b._rows, error: null }).then(res),
                };
                return b;
            },
        } as unknown as Parameters<typeof resolveDemoIds>[0];
    }

    /** One CLOSED opportunity carrying a full family graph, invisible to the default selection. */
    const GRAPH = {
        work_units: WORK_UNITS,
        opportunities: [
            {
                id: "opp-closed",
                org_id: ORG,
                name: "Closed Family",
                status_key: "closed_won",
                work_unit_id: null,
                customer_id: "cust-1",
                primary_person_id: "parent-1",
                metadata: {},
            },
        ],
        customer_members: [{ id: "member-1", org_id: ORG, customer_id: "cust-1", person_id: "child-1" }],
        customer_persons: [
            { org_id: ORG, customer_id: "cust-1", person_id: "parent-1" },
            { org_id: ORG, customer_id: "cust-1", person_id: "child-1" },
        ],
        opportunity_persons: [{ org_id: ORG, opportunity_id: "opp-closed", person_id: "child-1" }],
        jobs: [{ id: "job-1", org_id: ORG, opportunity_id: "opp-closed" }],
        schedules: [{ id: "sched-1", org_id: ORG, job_id: "job-1" }],
        communication_threads: [
            { id: "thread-1", org_id: ORG, primary_entity_type: "opportunities", primary_entity_id: "opp-closed" },
        ],
        form_submissions: [{ id: "fs-1", org_id: ORG, opportunity_id: "opp-closed" }],
        documents: [{ id: "doc-1", org_id: ORG, entity_id: "opp-closed" }],
    };

    const scopeWith = (includeClosedOpportunities: boolean): DemoCleanupScope => ({
        orgId: ORG,
        cleanupMode: ENROLLMENT_RUNTIME_RESET_MODE,
        certificationBaseline: false,
        demoSeedPackage: null,
        demoSeedRunId: null,
        demoSeedFamilyKey: null,
        includeClosedOpportunities,
    });

    it("expands the closed opportunity into family, children, work and documents", async () => {
        const ids = await resolveDemoIds(makeGraphSupabase(GRAPH), scopeWith(true), "metadata->>is_demo_data.eq.true");

        expect(ids.opportunityIds).toEqual(["opp-closed"]);
        expect(ids.customerIds).toEqual(["cust-1"]);
        expect(ids.personIds.sort()).toEqual(["child-1", "parent-1"]);
        expect(ids.customerMemberIds).toEqual(["member-1"]);
        expect(ids.jobIds).toEqual(["job-1"]);
        expect(ids.scheduleIds).toEqual(["sched-1"]);
        expect(ids.threadIds).toEqual(["thread-1"]);
        expect(ids.formSubmissionIds).toEqual(["fs-1"]);
        expect(ids.documentIds).toEqual(["doc-1"]);
        expect(ids.sharedPersonIds).toEqual([]);
    });

    it("expands NOTHING for the same graph with the flag off", async () => {
        const ids = await resolveDemoIds(makeGraphSupabase(GRAPH), scopeWith(false), "metadata->>is_demo_data.eq.true");

        // This is the bug the flag exists to fix: the closed opportunity is invisible, so its
        // family and children survive and keep the catch-all Work Views populated.
        expect(ids.opportunityIds).toEqual([]);
        expect(ids.customerIds).toEqual([]);
        expect(ids.personIds).toEqual([]);
        expect(ids.jobIds).toEqual([]);
        expect(ids.documentIds).toEqual([]);
    });

    it("still preserves a family shared with a golden-path opportunity when expanded", async () => {
        // Golden-path opportunities are excluded from the target set even with the flag on, so a
        // family they reference is genuinely shared and must survive.
        const shared = {
            ...GRAPH,
            opportunities: [
                ...GRAPH.opportunities,
                {
                    id: "opp-golden",
                    org_id: ORG,
                    name: "Golden",
                    status_key: "closed_won",
                    work_unit_id: null,
                    customer_id: "cust-1",
                    primary_person_id: "parent-1",
                    metadata: { demo_seed_package: GOLDEN_PATH_SEED_PACKAGE },
                },
            ],
        };

        const ids = await resolveDemoIds(makeGraphSupabase(shared), scopeWith(true), "metadata->>is_demo_data.eq.true");

        expect(ids.opportunityIds).toEqual(["opp-closed"]);
        expect(ids.sharedCustomerIds).toEqual(["cust-1"]);
        expect(ids.customerIds).toEqual([]);
        expect(ids.sharedPersonIds.sort()).toEqual(["child-1", "parent-1"]);
        expect(ids.personIds).toEqual([]);
        // And the member row is dropped with its preserved customer.
        expect(ids.customerMemberIds).toEqual([]);
    });
});

describe("--include-closed-opportunities — env plumbing and mode scoping", () => {
    const withEnv = async (env: Record<string, string | undefined>, fn: () => void) => {
        const saved: Record<string, string | undefined> = {};
        for (const k of Object.keys(env)) {
            saved[k] = process.env[k];
            if (env[k] === undefined) delete process.env[k];
            else process.env[k] = env[k];
        }
        try {
            fn();
        } finally {
            for (const [k, v] of Object.entries(saved)) {
                if (v === undefined) delete process.env[k];
                else process.env[k] = v;
            }
        }
    };

    it("defaults to false when the env var is unset", async () => {
        await withEnv(
            {
                DEMO_RESET_ORG_ID: ORG,
                DEMO_CLEANUP_MODE: ENROLLMENT_RUNTIME_RESET_MODE,
                [INCLUDE_CLOSED_OPPORTUNITIES_ENV]: undefined,
            },
            () => {
                expect(parseDemoCleanupScopeFromEnv().includeClosedOpportunities).toBe(false);
            }
        );
    });

    it("is true only for the exact string \"true\"", async () => {
        await withEnv(
            {
                DEMO_RESET_ORG_ID: ORG,
                DEMO_CLEANUP_MODE: ENROLLMENT_RUNTIME_RESET_MODE,
                [INCLUDE_CLOSED_OPPORTUNITIES_ENV]: "true",
            },
            () => {
                expect(parseDemoCleanupScopeFromEnv().includeClosedOpportunities).toBe(true);
            }
        );
        for (const truthy of ["1", "yes", "TRUE", "false", ""]) {
            await withEnv(
                {
                    DEMO_RESET_ORG_ID: ORG,
                    DEMO_CLEANUP_MODE: ENROLLMENT_RUNTIME_RESET_MODE,
                    [INCLUDE_CLOSED_OPPORTUNITIES_ENV]: truthy,
                },
                () => {
                    expect(parseDemoCleanupScopeFromEnv().includeClosedOpportunities).toBe(false);
                }
            );
        }
    });

    it("refuses the flag outside enrollment_runtime_reset mode", async () => {
        await withEnv(
            {
                DEMO_RESET_ORG_ID: ORG,
                DEMO_CLEANUP_MODE: undefined,
                [INCLUDE_CLOSED_OPPORTUNITIES_ENV]: "true",
            },
            () => {
                expect(() => parseDemoCleanupScopeFromEnv()).toThrow(
                    new RegExp(`${INCLUDE_CLOSED_OPPORTUNITIES_ENV}=true requires DEMO_CLEANUP_MODE`)
                );
            }
        );
    });
});

describe("reset target identity — project/org mismatch refuses", () => {
    it("parses a hosted project ref and ignores local stacks", () => {
        expect(parseSupabaseProjectRef("https://ikaxilmwmrmbagoidedu.supabase.co")).toBe("ikaxilmwmrmbagoidedu");
        expect(parseSupabaseProjectRef("http://127.0.0.1:54321")).toBeNull();
        expect(parseSupabaseProjectRef("")).toBeNull();
        expect(parseSupabaseProjectRef(undefined)).toBeNull();
    });

    it("accepts the declared project with the org present", () => {
        const verdict = assertResetTargetIdentity({
            supabaseUrl: "https://ikaxilmwmrmbagoidedu.supabase.co",
            expectedProjectRef: "ikaxilmwmrmbagoidedu",
            orgId: "93667019-bd28-49b5-a688-acc9bb1e0a19",
            foundOrgId: "93667019-bd28-49b5-a688-acc9bb1e0a19",
        });
        expect(verdict.ok).toBe(true);
        expect(verdict.problems).toEqual([]);
    });

    it("refuses when connected to a different project than declared", () => {
        const verdict = assertResetTargetIdentity({
            supabaseUrl: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
            expectedProjectRef: "ikaxilmwmrmbagoidedu",
            orgId: "org-x",
            foundOrgId: "org-x",
        });
        expect(verdict.ok).toBe(false);
        expect(verdict.problems.join(" ")).toMatch(/Project identity mismatch/);
    });

    it("refuses when the org does not exist in the connected database", () => {
        const verdict = assertResetTargetIdentity({
            supabaseUrl: "https://ikaxilmwmrmbagoidedu.supabase.co",
            expectedProjectRef: "ikaxilmwmrmbagoidedu",
            orgId: "93667019-bd28-49b5-a688-acc9bb1e0a19",
            foundOrgId: null,
        });
        expect(verdict.ok).toBe(false);
        expect(verdict.problems.join(" ")).toMatch(/does not exist in ikaxilmwmrmbagoidedu/);
    });

    it("refuses a declared hosted project when pointed at a local stack", () => {
        const verdict = assertResetTargetIdentity({
            supabaseUrl: "http://127.0.0.1:54321",
            expectedProjectRef: "ikaxilmwmrmbagoidedu",
            orgId: "org-x",
            foundOrgId: "org-x",
        });
        expect(verdict.ok).toBe(false);
        expect(verdict.problems.join(" ")).toMatch(/not a hosted Supabase project URL/);
    });
});

describe("configuration preservation is independent of the flag", () => {
    it("keeps departments and work_units last in the delete order (never deleted in reset mode)", () => {
        const idx = (t: string) => DEMO_CLEANUP_TABLE_ORDER.indexOf(t as never);
        expect(idx("departments")).toBeGreaterThan(idx("persons"));
        expect(idx("work_units")).toBeGreaterThan(idx("persons"));
        // Both sit after every operational table, which is what lets the reset skip them entirely.
        expect(idx("departments")).toBeGreaterThan(idx("opportunities"));
        expect(idx("work_units")).toBeGreaterThan(idx("opportunities"));
    });

    /**
     * Counting mock: every table is populated, so anything the planner is willing to delete shows a
     * NONZERO count. A zero is therefore real evidence of a guard, not an artefact of an empty
     * fixture — which is the failure mode a preservation test most easily fakes.
     */
    function makeCountingSupabase(rowsByTable: Record<string, number>, defaultRows = 3) {
        return {
            from(table: string) {
                let isCount = false;
                const builder: Record<string, unknown> = {
                    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
                        isCount = opts?.count === "exact";
                        return builder;
                    },
                    eq: () => builder,
                    in: () => builder,
                    or: () => builder,
                    order: () => builder,
                    range: () => builder,
                    maybeSingle: () => Promise.resolve({ data: null, error: null }),
                    then(resolve: (r: unknown) => unknown) {
                        const n = rowsByTable[table] ?? defaultRows;
                        if (isCount) return Promise.resolve({ count: n, data: null, error: null }).then(resolve);
                        // Non-count reads return no rows, so no ids expand and the planner's
                        // id-driven counts stay honest; org-scoped counts still report n.
                        return Promise.resolve({ data: [], error: null }).then(resolve);
                    },
                };
                return builder;
            },
        } as unknown as Parameters<typeof buildDemoCleanupCounts>[0];
    }

    it("counts zero for work_units and departments in reset mode WITH the flag on", async () => {
        const supabase = makeCountingSupabase({ work_units: 12, departments: 7 });
        const scope: DemoCleanupScope = {
            orgId: ORG,
            cleanupMode: ENROLLMENT_RUNTIME_RESET_MODE,
            demoSeedPackage: null,
            demoSeedRunId: null,
            demoSeedFamilyKey: null,
            includeClosedOpportunities: true,
            certificationBaseline: false,
        };
        const ids = {
            opportunityIds: [],
            customerIds: [],
            personIds: [],
            customerMemberIds: [],
            jobIds: [],
            scheduleIds: [],
            threadIds: [],
            formSubmissionIds: [],
            documentIds: [],
            sharedPersonIds: [],
            sharedCustomerIds: [],
        };

        const counts = await buildDemoCleanupCounts(supabase, scope, ids, "metadata->>is_demo_data.eq.true");

        expect(counts.work_units).toBe(0);
        expect(counts.departments).toBe(0);
        // The protected-locations key is reported for visibility, never as a deletion.
        expect(DEMO_CLEANUP_TABLE_ORDER).toContain(PROTECTED_LOCATIONS_TABLE_KEY);
    });

    it("still counts zero for work_units and departments with the flag off", async () => {
        const supabase = makeCountingSupabase({ work_units: 12, departments: 7 });
        const counts = await buildDemoCleanupCounts(
            supabase,
            {
                orgId: ORG,
                cleanupMode: ENROLLMENT_RUNTIME_RESET_MODE,
                demoSeedPackage: null,
                demoSeedRunId: null,
                demoSeedFamilyKey: null,
                includeClosedOpportunities: false,
                certificationBaseline: false,
            },
            {
                opportunityIds: [],
                customerIds: [],
                personIds: [],
                customerMemberIds: [],
                jobIds: [],
                scheduleIds: [],
                threadIds: [],
                formSubmissionIds: [],
                documentIds: [],
                sharedPersonIds: [],
                sharedCustomerIds: [],
            },
            "metadata->>is_demo_data.eq.true"
        );

        expect(counts.work_units).toBe(0);
        expect(counts.departments).toBe(0);
    });
});
