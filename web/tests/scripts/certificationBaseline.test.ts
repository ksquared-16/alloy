/**
 * Certification baseline — anchors A2 (unlinked operational identities) and A3 (Processing).
 *
 * @see docs/handoffs/firefly-certification-deletion-contract.md
 *
 * The thing under test is a DELETION CONTRACT, so these are written as dependency-graph fixtures
 * rather than selection assertions: the failure that matters is not "the wrong id was chosen", it
 * is "an identity was deleted that something still needed", and only a graph shows that.
 */

import { describe, expect, it } from "vitest";

import {
    CERTIFICATION_BASELINE_ENV,
    ENROLLMENT_RUNTIME_RESET_MODE,
    INCLUDE_CLOSED_OPPORTUNITIES_ENV,
    parseDemoCleanupScopeFromEnv,
    type DemoCleanupScope,
} from "@/scripts/lib/demoRuntimeCleanupScope";
import {
    PROCESSING_CLEANUP_TABLE_ORDER,
    classifyCertificationIdentities,
    selectProcessingCaseIds,
} from "@/scripts/lib/certificationBaselineSelection";
import { resolveDemoIds } from "@/scripts/lib/demoRuntimeCleanupPlan";

const ORG = "org-1";
const OTHER_ORG = "org-2";

// ---------------------------------------------------------------------------------------------
// Anchor A2 — identity classification
// ---------------------------------------------------------------------------------------------

describe("A2 — unlinked operational identity classification", () => {
    const base = {
        orgId: ORG,
        opportunities: [] as Array<{ id: string; customer_id?: string | null; primary_person_id?: string | null }>,
        targetOpportunityIds: [] as string[],
        opportunityPersonRefs: [] as Array<{ opportunity_id: string; person_id: string }>,
        personCustomerLinks: [] as Array<{ customer_id: string; person_id: string }>,
    };

    it("targets a household referenced by no preserved record", () => {
        const r = classifyCertificationIdentities({
            ...base,
            customers: [{ id: "cust-orphan", org_id: ORG, name: "Jordan Enrollment Lead" }],
            persons: [],
        });
        expect(r.targetCustomerIds).toEqual(["cust-orphan"]);
        expect(r.customers[0].reason).toMatch(/referenced by no preserved record/);
        expect(r.ambiguous).toEqual([]);
    });

    it("protects a household referenced by an opportunity outside the deletion scope", () => {
        const r = classifyCertificationIdentities({
            ...base,
            customers: [{ id: "cust-keep", org_id: ORG }],
            persons: [],
            opportunities: [{ id: "opp-preserved", customer_id: "cust-keep", primary_person_id: null }],
            targetOpportunityIds: [], // opp-preserved is NOT a target
        });
        expect(r.targetCustomerIds).toEqual([]);
        expect(r.protectedCustomerIds).toEqual(["cust-keep"]);
        expect(r.customers[0].reason).toMatch(/outside the deletion scope/);
    });

    it("PROTECTS a staff identity even when nothing else references it", () => {
        // The single most dangerous deletion this contract could make.
        const r = classifyCertificationIdentities({
            ...base,
            customers: [],
            persons: [{ id: "p-staff", org_id: ORG, full_name: "Director", is_employee: true }],
        });
        expect(r.targetPersonIds).toEqual([]);
        expect(r.protectedPersonIds).toEqual(["p-staff"]);
        expect(r.persons[0].reason).toMatch(/staff identity/);
    });

    it("protects a person linked to a household outside the deletion scope", () => {
        const r = classifyCertificationIdentities({
            ...base,
            customers: [{ id: "cust-keep", org_id: ORG }],
            persons: [{ id: "p1", org_id: ORG, is_employee: null }],
            opportunities: [{ id: "opp-preserved", customer_id: "cust-keep", primary_person_id: null }],
            personCustomerLinks: [{ customer_id: "cust-keep", person_id: "p1" }],
        });
        expect(r.protectedPersonIds).toEqual(["p1"]);
        expect(r.persons[0].reason).toMatch(/household outside the deletion scope/);
    });

    it("targets a person only via a household that is itself a target", () => {
        const r = classifyCertificationIdentities({
            ...base,
            customers: [{ id: "cust-orphan", org_id: ORG }],
            persons: [{ id: "p1", org_id: ORG, is_employee: null }],
            personCustomerLinks: [{ customer_id: "cust-orphan", person_id: "p1" }],
        });
        expect(r.targetCustomerIds).toEqual(["cust-orphan"]);
        expect(r.targetPersonIds).toEqual(["p1"]);
        expect(r.persons[0].reason).toMatch(/member of an operational household/);
    });

    it("targets a wholly unreferenced person under its own explicit reason", () => {
        const r = classifyCertificationIdentities({
            ...base,
            customers: [],
            persons: [{ id: "p-floating", org_id: ORG, is_employee: null }],
        });
        expect(r.targetPersonIds).toEqual(["p-floating"]);
        expect(r.persons[0].reason).toMatch(/referenced by nothing/);
    });

    it("protects identities behind a golden-path opportunity", () => {
        const r = classifyCertificationIdentities({
            ...base,
            customers: [{ id: "cust-golden", org_id: ORG }],
            persons: [{ id: "p-golden", org_id: ORG, is_employee: null }],
            opportunities: [{ id: "opp-golden", customer_id: "cust-golden", primary_person_id: "p-golden" }],
            targetOpportunityIds: [],
            protectedCustomerIds: ["cust-golden"],
            protectedPersonIds: ["p-golden"],
        });
        expect(r.targetCustomerIds).toEqual([]);
        expect(r.targetPersonIds).toEqual([]);
        expect(r.protectedPersonIds).toEqual(["p-golden"]);
    });

    it("targets a person participating on an opportunity being removed", () => {
        const r = classifyCertificationIdentities({
            ...base,
            customers: [],
            persons: [{ id: "p1", org_id: ORG, is_employee: null }],
            opportunities: [{ id: "opp-target", customer_id: null, primary_person_id: "p1" }],
            targetOpportunityIds: ["opp-target"],
            opportunityPersonRefs: [{ opportunity_id: "opp-target", person_id: "p1" }],
        });
        expect(r.targetPersonIds).toEqual(["p1"]);
        expect(r.ambiguous).toEqual([]);
    });

    it("marks a person AMBIGUOUS when the reference is a shape the contract does not model", () => {
        // A contact row with no customer_id: something points at this person, but the contract
        // cannot say whether that thing survives the reset. Guessing here deletes real data.
        const r = classifyCertificationIdentities({
            ...base,
            customers: [],
            persons: [{ id: "p-unmodelled", org_id: ORG, is_employee: null }],
            contactRefs: [{ customer_id: null, person_id: "p-unmodelled" }],
        });
        expect(r.targetPersonIds).toEqual([]);
        expect(r.ambiguous.map((v) => v.id)).toEqual(["p-unmodelled"]);
        expect(r.ambiguous[0].reason).toMatch(/does not model/);
    });

    it("refuses an out-of-org row outright", () => {
        expect(() =>
            classifyCertificationIdentities({
                ...base,
                customers: [{ id: "cust-x", org_id: OTHER_ORG }],
                persons: [],
            }),
        ).toThrow(/refusing out-of-org row/);
    });

    it("classifies every identity — no silent third state", () => {
        const r = classifyCertificationIdentities({
            ...base,
            customers: [{ id: "c1", org_id: ORG }, { id: "c2", org_id: ORG }],
            persons: [
                { id: "p1", org_id: ORG, is_employee: null },
                { id: "p2", org_id: ORG, is_employee: true },
            ],
            personCustomerLinks: [{ customer_id: "c1", person_id: "p1" }],
        });
        for (const v of [...r.customers, ...r.persons]) {
            expect(["target", "protected", "ambiguous"]).toContain(v.class);
            expect(v.reason.length).toBeGreaterThan(0);
        }
        expect(r.customers).toHaveLength(2);
        expect(r.persons).toHaveLength(2);
    });
});

// ---------------------------------------------------------------------------------------------
// Anchor A3 — Processing
// ---------------------------------------------------------------------------------------------

describe("A3 — Processing case selection", () => {
    it("selects unanchored cases (the hosted Firefly shape)", () => {
        const r = selectProcessingCaseIds({
            cases: [
                { id: "k1", primary_opportunity_id: null, primary_customer_id: null },
                { id: "k2", primary_opportunity_id: null, primary_customer_id: null },
            ],
            targetOpportunityIds: [],
            targetCustomerIds: [],
            allOpportunityIds: [],
            allCustomerIds: [],
        });
        expect(r.targetCaseIds).toEqual(["k1", "k2"]);
        expect(r.preserved).toEqual([]);
    });

    it("preserves a case anchored to a preserved opportunity, and says why", () => {
        const r = selectProcessingCaseIds({
            cases: [{ id: "k1", primary_opportunity_id: "opp-keep", primary_customer_id: null }],
            targetOpportunityIds: ["opp-target"],
            targetCustomerIds: [],
            allOpportunityIds: ["opp-keep", "opp-target"],
            allCustomerIds: [],
        });
        expect(r.targetCaseIds).toEqual([]);
        expect(r.preserved[0].reason).toMatch(/preserved opportunity opp-keep/);
    });

    it("selects a case anchored to an opportunity that is itself being deleted", () => {
        const r = selectProcessingCaseIds({
            cases: [{ id: "k1", primary_opportunity_id: "opp-target", primary_customer_id: null }],
            targetOpportunityIds: ["opp-target"],
            targetCustomerIds: [],
            allOpportunityIds: ["opp-target"],
            allCustomerIds: [],
        });
        expect(r.targetCaseIds).toEqual(["k1"]);
    });

    it("preserves a case anchored to a preserved customer", () => {
        const r = selectProcessingCaseIds({
            cases: [{ id: "k1", primary_opportunity_id: null, primary_customer_id: "cust-keep" }],
            targetOpportunityIds: [],
            targetCustomerIds: ["cust-target"],
            allOpportunityIds: [],
            allCustomerIds: ["cust-keep", "cust-target"],
        });
        expect(r.targetCaseIds).toEqual([]);
        expect(r.preserved[0].reason).toMatch(/preserved customer cust-keep/);
    });

    it("orders plan_operations before commit_plans and cases last", () => {
        const i = (t: string) => PROCESSING_CLEANUP_TABLE_ORDER.indexOf(t as never);
        expect(i("processing_plan_operations")).toBeLessThan(i("processing_commit_plans"));
        expect(i("processing_facts")).toBeLessThan(i("processing_cases"));
        expect(i("processing_case_sources")).toBeLessThan(i("processing_cases"));
        expect(PROCESSING_CLEANUP_TABLE_ORDER[PROCESSING_CLEANUP_TABLE_ORDER.length - 1]).toBe("processing_cases");
    });
});

// ---------------------------------------------------------------------------------------------
// End-to-end through the real resolver
// ---------------------------------------------------------------------------------------------

function makeSupabase(tables: Record<string, Array<Record<string, unknown>>>) {
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
                        String(x[col]).localeCompare(String(y[col])),
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

const scope = (over: Partial<DemoCleanupScope> = {}): DemoCleanupScope => ({
    orgId: ORG,
    cleanupMode: ENROLLMENT_RUNTIME_RESET_MODE,
    demoSeedPackage: null,
    demoSeedRunId: null,
    demoSeedFamilyKey: null,
    includeClosedOpportunities: false,
    certificationBaseline: false,
    ...over,
});

/** One opportunity family + one orphan household + one staff person + unanchored Processing. */
const WORLD = {
    work_units: [{ id: "wu-lead", key: "lifecycle_wu_lead", org_id: ORG, is_active: true }],
    opportunities: [
        {
            id: "opp-1",
            org_id: ORG,
            name: "Real Lead",
            status_key: "new_inquiry",
            work_unit_id: "wu-lead",
            customer_id: "cust-opp",
            primary_person_id: "p-parent",
            metadata: {},
        },
    ],
    customers: [
        { id: "cust-opp", org_id: ORG, name: "Real Family" },
        { id: "cust-orphan", org_id: ORG, name: "Jordan Enrollment Lead" },
    ],
    persons: [
        { id: "p-parent", org_id: ORG, full_name: "Parent", is_employee: null },
        { id: "p-orphan", org_id: ORG, full_name: "Jordan", is_employee: null },
        { id: "p-staff", org_id: ORG, full_name: "Director", is_employee: true },
    ],
    customer_persons: [
        { id: "cp-1", org_id: ORG, customer_id: "cust-opp", person_id: "p-parent" },
        { id: "cp-2", org_id: ORG, customer_id: "cust-orphan", person_id: "p-orphan" },
    ],
    customer_members: [{ id: "cm-1", org_id: ORG, customer_id: "cust-orphan", person_id: "p-orphan" }],
    opportunity_persons: [{ id: "op-1", org_id: ORG, opportunity_id: "opp-1", person_id: "p-parent" }],
    contacts: [],
    processing_cases: [
        { id: "case-1", org_id: ORG, primary_opportunity_id: null, primary_customer_id: null },
        { id: "case-2", org_id: ORG, primary_opportunity_id: null, primary_customer_id: null },
    ],
    processing_commit_plans: [{ id: "plan-1", org_id: ORG, case_id: "case-1" }],
    jobs: [],
    schedules: [],
    communication_threads: [],
    form_submissions: [],
    documents: [],
};

describe("certification baseline — through the real resolver", () => {
    it("without the flag, the orphan household and Processing are invisible", async () => {
        const ids = await resolveDemoIds(makeSupabase(WORLD), scope(), "metadata->>is_demo_data.eq.true");

        expect(ids.opportunityIds).toEqual(["opp-1"]);
        expect(ids.customerIds).toEqual(["cust-opp"]);
        expect(ids.customerIds).not.toContain("cust-orphan");
        expect(ids.personIds).not.toContain("p-orphan");
        expect(ids.processingCaseIds).toBeUndefined();
    });

    it("with the flag, it adds the orphan household, its person, and Processing", async () => {
        const ids = await resolveDemoIds(
            makeSupabase(WORLD),
            scope({ certificationBaseline: true, includeClosedOpportunities: true }),
            "metadata->>is_demo_data.eq.true",
        );

        expect(ids.customerIds.sort()).toEqual(["cust-opp", "cust-orphan"]);
        expect(ids.personIds).toContain("p-orphan");
        expect(ids.customerMemberIds).toContain("cm-1");
        expect(ids.processingCaseIds?.sort()).toEqual(["case-1", "case-2"]);
        expect(ids.processingPlanIds).toEqual(["plan-1"]);
    });

    it("never deletes the staff person, at any breadth", async () => {
        for (const s of [scope(), scope({ certificationBaseline: true, includeClosedOpportunities: true })]) {
            const ids = await resolveDemoIds(makeSupabase(WORLD), s, "metadata->>is_demo_data.eq.true");
            expect(ids.personIds).not.toContain("p-staff");
        }
    });

    it("reports why each protected identity was kept", async () => {
        const ids = await resolveDemoIds(
            makeSupabase(WORLD),
            scope({ certificationBaseline: true, includeClosedOpportunities: true }),
            "metadata->>is_demo_data.eq.true",
        );
        const staff = ids.certificationSummary?.protectedPersons.find((p) => p.id === "p-staff");
        expect(staff?.reason).toMatch(/staff identity/);
    });

    it("stays org-scoped when another tenant has an identical-looking orphan", async () => {
        const ids = await resolveDemoIds(
            makeSupabase({
                ...WORLD,
                customers: [...WORLD.customers, { id: "cust-other-org", org_id: OTHER_ORG, name: "Jordan" }],
                persons: [...WORLD.persons, { id: "p-other-org", org_id: OTHER_ORG, full_name: "Jordan", is_employee: null }],
            }),
            scope({ certificationBaseline: true, includeClosedOpportunities: true }),
            "metadata->>is_demo_data.eq.true",
        );
        expect(ids.customerIds).not.toContain("cust-other-org");
        expect(ids.personIds).not.toContain("p-other-org");
    });

    it("rerunning against an already-clean tenant proposes nothing", async () => {
        const emptied = {
            ...WORLD,
            opportunities: [],
            customers: [],
            persons: [],
            customer_persons: [],
            customer_members: [],
            opportunity_persons: [],
            processing_cases: [],
            processing_commit_plans: [],
        };
        const ids = await resolveDemoIds(
            makeSupabase(emptied),
            scope({ certificationBaseline: true, includeClosedOpportunities: true }),
            "metadata->>is_demo_data.eq.true",
        );
        expect(ids.opportunityIds).toEqual([]);
        expect(ids.customerIds).toEqual([]);
        expect(ids.personIds).toEqual([]);
        expect(ids.processingCaseIds).toEqual([]);
    });

    it("FAILS CLOSED — an ambiguous identity aborts the run instead of being deleted or ignored", async () => {
        const world = {
            ...WORLD,
            persons: [...WORLD.persons, { id: "p-unmodelled", org_id: ORG, full_name: "?", is_employee: null }],
            contacts: [{ id: "ct-1", org_id: ORG, customer_id: null, person_id: "p-unmodelled" }],
        };

        await expect(
            resolveDemoIds(
                makeSupabase(world),
                scope({ certificationBaseline: true, includeClosedOpportunities: true }),
                "metadata->>is_demo_data.eq.true",
            ),
        ).rejects.toThrow(/Certification baseline refuses to proceed/);
    });

    it("the same ambiguous row does NOT block the narrower modes", async () => {
        // Fail-closed is a property of certification breadth, not a new global veto.
        const world = {
            ...WORLD,
            persons: [...WORLD.persons, { id: "p-unmodelled", org_id: ORG, full_name: "?", is_employee: null }],
            contacts: [{ id: "ct-1", org_id: ORG, customer_id: null, person_id: "p-unmodelled" }],
        };
        const ids = await resolveDemoIds(makeSupabase(world), scope(), "metadata->>is_demo_data.eq.true");
        expect(ids.opportunityIds).toEqual(["opp-1"]);
    });

    it("dry-run and execute resolve the same graph (same resolver, same scope)", async () => {
        const s = scope({ certificationBaseline: true, includeClosedOpportunities: true });
        const a = await resolveDemoIds(makeSupabase(WORLD), s, "metadata->>is_demo_data.eq.true");
        const b = await resolveDemoIds(makeSupabase(WORLD), s, "metadata->>is_demo_data.eq.true");
        expect(a.customerIds.sort()).toEqual(b.customerIds.sort());
        expect(a.personIds.sort()).toEqual(b.personIds.sort());
        expect(a.processingCaseIds?.sort()).toEqual(b.processingCaseIds?.sort());
    });
});

// ---------------------------------------------------------------------------------------------
// CLI / env composition
// ---------------------------------------------------------------------------------------------

describe("certification baseline — flag composition", () => {
    const withEnv = (env: Record<string, string | undefined>, fn: () => void) => {
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

    it("implies include-closed-opportunities", () => {
        withEnv(
            {
                DEMO_RESET_ORG_ID: ORG,
                DEMO_CLEANUP_MODE: ENROLLMENT_RUNTIME_RESET_MODE,
                [CERTIFICATION_BASELINE_ENV]: "true",
                [INCLUDE_CLOSED_OPPORTUNITIES_ENV]: undefined,
            },
            () => {
                const s = parseDemoCleanupScopeFromEnv();
                expect(s.certificationBaseline).toBe(true);
                expect(s.includeClosedOpportunities).toBe(true);
            },
        );
    });

    it("defaults off, and is true only for the exact string \"true\"", () => {
        for (const [val, expected] of [[undefined, false], ["true", true], ["1", false], ["TRUE", false]] as const) {
            withEnv(
                {
                    DEMO_RESET_ORG_ID: ORG,
                    DEMO_CLEANUP_MODE: ENROLLMENT_RUNTIME_RESET_MODE,
                    [CERTIFICATION_BASELINE_ENV]: val,
                },
                () => expect(parseDemoCleanupScopeFromEnv().certificationBaseline).toBe(expected),
            );
        }
    });

    it("is refused outside enrollment_runtime_reset mode", () => {
        withEnv(
            {
                DEMO_RESET_ORG_ID: ORG,
                DEMO_CLEANUP_MODE: undefined,
                [CERTIFICATION_BASELINE_ENV]: "true",
            },
            () => expect(() => parseDemoCleanupScopeFromEnv()).toThrow(/requires DEMO_CLEANUP_MODE/),
        );
    });
});
