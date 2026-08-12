import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";

import { runSearch } from "@/lib/search/runSearch";
import { SEARCH_RESULT_DOCTRINE } from "@/lib/search/searchContracts";
import { resetSearchProcessConfigurationCache } from "@/lib/search/searchProcessConfiguration";

// Process configuration is cached process-globally for latency. Tests vary that
// configuration deliberately, so each one must start from a cold cache.
beforeEach(() => resetSearchProcessConfigurationCache());

/**
 * Alloy Search Platform V2 — the five required pressure-test scenarios, plus the
 * duplicate-name, permission, configuration, and staff cases.
 *
 * The fixture is the Smith household from the mission brief.
 */

const ORG = "11111111-1111-4111-8111-111111111111";

const SMITH_HOUSEHOLD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const JANE_PERSON = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const JOE_MEMBER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const JOE_PERSON = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const EMMA_MEMBER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const EMMA_PERSON = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const JOE_OPPORTUNITY = "10101010-1010-4010-8010-101010101010";

// Duplicate-name case: a second, accessible Joe Smith in a different household.
const RIVERS_HOUSEHOLD = "20202020-2020-4020-8020-202020202020";
const JOE2_MEMBER = "30303030-3030-4030-8030-303030303030";
const JOE2_PERSON = "40404040-4040-4040-8040-404040404040";

// Permission case: a household at a campus the restricted operator cannot reach.
const HIDDEN_HOUSEHOLD = "50505050-5050-4050-8050-505050505050";
const HIDDEN_MEMBER = "60606060-6060-4060-8060-606060606060";

const BEND_CAMPUS = "70707070-7070-4070-8070-707070707070";
const PORTLAND_CAMPUS = "80808080-8080-4080-8080-808080808080";

const DEPT_ENROLLMENT = "90909090-9090-4090-8090-909090909090";

const KELLY_PERSON = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";

const openDim: AdminAccessScopeDimensions = {
    departmentScope: "all",
    allowedDepartmentIds: null,
    siteScope: "all",
    allowedSiteLocationIds: null,
};

/** Restricted operator: Bend only. */
const bendOnlyDim: AdminAccessScopeDimensions = {
    departmentScope: "all",
    allowedDepartmentIds: null,
    siteScope: "restricted",
    allowedSiteLocationIds: [BEND_CAMPUS],
};

vi.mock("@/lib/admin/accessScope", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/admin/accessScope")>();
    return {
        ...actual,
        // The restricted operator can reach only the Smith and Rivers households.
        fetchScopedPersonIdsForRestrictedAdmin: vi.fn(async () => [
            JANE_PERSON,
            JOE_PERSON,
            EMMA_PERSON,
            JOE2_PERSON,
        ]),
        fetchScopedCustomerIdsForRestrictedAdmin: vi.fn(async () => [SMITH_HOUSEHOLD, RIVERS_HOUSEHOLD]),
    };
});

/**
 * Tenant A configuration. NOTE: nothing in `web/lib/search` knows these names —
 * they exist only here, in configuration.
 */
const TENANT_A_LIFECYCLE = {
    version: 1,
    processes: [
        {
            id: "p-enrollment",
            key: "enrollment",
            name: "Enrollment",
            is_active: true,
            sort_order: 1,
            primary_entity: "customer_members",
            stages: [
                { id: "s1", key: "enrolling", label: "Enrolling", is_active: true, sort_order: 1 },
                { id: "s2", key: "enrolled", label: "Enrolled", is_active: true, sort_order: 2 },
            ],
        },
        {
            id: "p-annual",
            key: "annual_registration",
            name: "Annual Registration",
            is_active: true,
            sort_order: 2,
            primary_entity: "customer_members",
            stages: [
                { id: "s3", key: "needs_documents", label: "Needs documents", is_active: true, sort_order: 1 },
            ],
        },
        {
            id: "p-subsidy",
            key: "subsidy_renewal",
            name: "Subsidy Renewal",
            is_active: true,
            sort_order: 3,
            primary_entity: "customer_members",
            stages: [{ id: "s4", key: "review_due", label: "Review due", is_active: true, sort_order: 1 }],
        },
    ],
};

function baseFixtures(): Record<string, Array<Record<string, unknown>>> {
    return {
        departments: [
            {
                id: DEPT_ENROLLMENT,
                org_id: ORG,
                name: "Enrollment",
                is_active: true,
                metadata: { lifecycle_builder_v1: TENANT_A_LIFECYCLE },
            },
        ],
        customers: [
            { id: SMITH_HOUSEHOLD, org_id: ORG, name: "Smith Household" },
            { id: RIVERS_HOUSEHOLD, org_id: ORG, name: "Rivers Household" },
            { id: HIDDEN_HOUSEHOLD, org_id: ORG, name: "Smith Household (Portland)" },
        ],
        persons: [
            {
                id: JANE_PERSON,
                org_id: ORG,
                first_name: "Jane",
                last_name: "Smith",
                full_name: "Jane Smith",
                email: "jane@example.com",
                phone: "555-0100",
            },
            { id: JOE_PERSON, org_id: ORG, first_name: "Joe", last_name: "Smith", full_name: "Joe Smith" },
            { id: EMMA_PERSON, org_id: ORG, first_name: "Emma", last_name: "Smith", full_name: "Emma Smith" },
            { id: JOE2_PERSON, org_id: ORG, first_name: "Joe", last_name: "Smith", full_name: "Joe Smith" },
            {
                id: KELLY_PERSON,
                org_id: ORG,
                first_name: "Kelly",
                last_name: "Johnson",
                full_name: "Kelly Johnson",
                email: "kelly@example.com",
            },
        ],
        customer_members: [
            {
                id: JOE_MEMBER,
                org_id: ORG,
                customer_id: SMITH_HOUSEHOLD,
                person_id: JOE_PERSON,
                display_name: "Joe Smith",
                first_name: "Joe",
                last_name: "Smith",
                relationship: "child",
            },
            {
                id: EMMA_MEMBER,
                org_id: ORG,
                customer_id: SMITH_HOUSEHOLD,
                person_id: EMMA_PERSON,
                display_name: "Emma Smith",
                first_name: "Emma",
                last_name: "Smith",
                relationship: "child",
            },
            {
                id: JOE2_MEMBER,
                org_id: ORG,
                customer_id: RIVERS_HOUSEHOLD,
                person_id: JOE2_PERSON,
                display_name: "Joe Smith",
                first_name: "Joe",
                last_name: "Smith",
                relationship: "child",
            },
            {
                id: HIDDEN_MEMBER,
                org_id: ORG,
                customer_id: HIDDEN_HOUSEHOLD,
                person_id: null,
                display_name: "Joe Smith",
                first_name: "Joe",
                last_name: "Smith",
                relationship: "child",
            },
        ],
        customer_persons: [
            {
                org_id: ORG,
                person_id: JANE_PERSON,
                customer_id: SMITH_HOUSEHOLD,
                role_type: "parent_guardian",
                is_primary: true,
            },
        ],
        process_instances: [
            {
                org_id: ORG,
                subject_id: JOE_MEMBER,
                process_key: "enrollment",
                stage_key: "enrolling",
                state: "enrolling",
                context_type: "opportunity",
                context_id: JOE_OPPORTUNITY,
                metadata: { location_id: BEND_CAMPUS },
            },
            {
                org_id: ORG,
                subject_id: JOE_MEMBER,
                process_key: "annual_registration",
                stage_key: "needs_documents",
                state: null,
                context_type: "opportunity",
                context_id: JOE_OPPORTUNITY,
                metadata: {},
            },
            {
                org_id: ORG,
                subject_id: JOE_MEMBER,
                process_key: "subsidy_renewal",
                stage_key: "review_due",
                state: null,
                context_type: "opportunity",
                context_id: JOE_OPPORTUNITY,
                metadata: {},
            },
            {
                org_id: ORG,
                subject_id: EMMA_MEMBER,
                process_key: "enrollment",
                stage_key: "enrolled",
                state: "enrolled",
                context_type: "opportunity",
                context_id: JOE_OPPORTUNITY,
                metadata: { location_id: BEND_CAMPUS },
            },
        ],
        schedule_assignments: [
            {
                org_id: ORG,
                customer_member_id: JOE_MEMBER,
                status: "active",
                start_date: "2026-01-01",
                schedule_patterns: { label: "Mon / Wed / Fri", site_location_id: BEND_CAMPUS },
            },
            {
                org_id: ORG,
                customer_member_id: EMMA_MEMBER,
                status: "active",
                start_date: "2026-01-01",
                schedule_patterns: { label: "Tue / Thu", site_location_id: BEND_CAMPUS },
            },
        ],
        locations: [
            {
                id: BEND_CAMPUS,
                org_id: ORG,
                label: "Bend Campus",
                location_type: "site",
                is_active: true,
            },
            {
                id: PORTLAND_CAMPUS,
                org_id: ORG,
                label: "Portland Campus",
                location_type: "site",
                is_active: true,
            },
        ],
    };
}

/** Minimal Supabase fake: eq / in / ilike / or / order / limit. */
function createMockSupabase(tables: Record<string, Array<Record<string, unknown>>>): SupabaseClient {
    const chain = (tableName: string) => {
        const filters: Array<{ kind: string; col: string; val: unknown }> = [];
        let orExpr: string | null = null;
        let limitN = 1000;

        const exec = () => {
            let rows = [...(tables[tableName] ?? [])];
            for (const f of filters) {
                if (f.kind === "eq") rows = rows.filter((r) => r[f.col] === f.val);
                else if (f.kind === "in") {
                    const set = new Set(Array.isArray(f.val) ? f.val : []);
                    rows = rows.filter((r) => set.has(r[f.col]));
                } else if (f.kind === "ilike") {
                    const tok = String(f.val).replace(/%/g, "").toLowerCase();
                    rows = rows.filter((r) => String(r[f.col] ?? "").toLowerCase().includes(tok));
                }
            }
            if (orExpr) {
                // Ignore the `is_active` disjunction used for locations.
                if (!orExpr.includes("is_active")) {
                    const clauses = orExpr
                        .split(",")
                        .map((part) => part.match(/^([a-z_]+)\.ilike\.(.+)$/))
                        .filter(Boolean) as RegExpMatchArray[];
                    rows = rows.filter((r) =>
                        clauses.some(([, col, pattern]) =>
                            String(r[col] ?? "")
                                .toLowerCase()
                                .includes(pattern.replace(/%/g, "").toLowerCase())
                        )
                    );
                }
            }
            return { data: rows.slice(0, limitN), error: null };
        };

        const builder: Record<string, unknown> = {
            select: () => builder,
            eq: (col: string, val: unknown) => (filters.push({ kind: "eq", col, val }), builder),
            in: (col: string, val: unknown) => (filters.push({ kind: "in", col, val }), builder),
            ilike: (col: string, val: unknown) => (filters.push({ kind: "ilike", col, val }), builder),
            or: (expr: string) => ((orExpr = expr), builder),
            not: () => builder,
            order: () => builder,
            limit: (n: number) => ((limitN = n), builder),
            maybeSingle: async () => ({ data: exec().data[0] ?? null, error: null }),
            then: (resolve: (v: unknown) => void) => Promise.resolve(exec()).then(resolve),
        };
        return builder;
    };
    return { from: (table: string) => chain(table) } as unknown as SupabaseClient;
}

function run(
    rawQ: string,
    dimensions: AdminAccessScopeDimensions = openDim,
    fixtures = baseFixtures()
) {
    return runSearch({
        supabase: createMockSupabase(fixtures),
        orgId: ORG,
        dimensions,
        rawQ,
    });
}

const nameOf = (r: { subject: { display_name: string } }) => r.subject.display_name;

// ---------------------------------------------------------------------------
// Case 1 — Child
// ---------------------------------------------------------------------------
describe("Case 1 — child search", () => {
    it("returns Joe as ONE subject, not one row per participation", async () => {
        const { results } = await run("Joe Smith");
        const joes = results.filter((r) => r.subject.kind === "child" && nameOf(r) === "Joe Smith");
        // Three Joe Smiths exist and an unrestricted operator sees all three —
        // the point is that each appears EXACTLY ONCE despite multi-process
        // participation, schedules, placements and household membership.
        expect(joes).toHaveLength(3);
        expect(new Set(joes.map((r) => r.subject.id)).size).toBe(3);

        const smithJoe = joes.find((r) => r.subject.household_id === SMITH_HOUSEHOLD)!;
        expect(smithJoe.subject.person_id).toBe(JOE_PERSON);
        expect(smithJoe.recognition.type_label).toBe("Child");
        expect(smithJoe.recognition.household_name).toBe("Smith Household");
        expect(smithJoe.recognition.location_label).toBe("Bend Campus");
    });

    it("exposes destinations on the initial result — no intermediate page", async () => {
        const { results } = await run("Joe Smith");
        const joe = results.find((r) => r.subject.id === JOE_MEMBER)!;

        const primary = joe.destinations.find((d) => d.primary);
        expect(primary).toBeTruthy();
        expect(primary!.target).toBe("focus_panel");
        expect(primary!.card_key).toBe("children");
        expect(primary!.item_id).toBe(JOE_MEMBER);

        expect(joe.destinations.length).toBeGreaterThan(1);
        expect(joe.destinations.some((d) => d.key === "household")).toBe(true);
    });

    it("a child with NO person row opens its participation record, not the household", async () => {
        // Found by browser certification against the live tenant: real children can
        // have `person_id = null`. Falling straight through to the household opens
        // the FAMILY when the operator asked for the CHILD.
        const fixtures = baseFixtures();
        const joe = (fixtures.customer_members as Array<Record<string, unknown>>).find(
            (m) => m.id === JOE_MEMBER
        )!;
        joe.person_id = null;

        const { results } = await run("Joe Smith", openDim, fixtures);
        const subject = results.find((r) => r.subject.id === JOE_MEMBER)!;
        const primary = subject.destinations.find((d) => d.primary)!;

        expect(primary.card_key).toBe("children");
        expect(primary.host_entity_type).toBe("opportunities");
        expect(primary.host_entity_id).toBe(JOE_OPPORTUNITY);
    });

    it("falls back to the household only when there is no participation record", async () => {
        const fixtures = baseFixtures();
        const joe = (fixtures.customer_members as Array<Record<string, unknown>>).find(
            (m) => m.id === JOE_MEMBER
        )!;
        joe.person_id = null;
        fixtures.process_instances = [];

        const { results } = await run("Joe Smith", openDim, fixtures);
        const subject = results.find((r) => r.subject.id === JOE_MEMBER)!;
        const primary = subject.destinations.find((d) => d.primary)!;
        expect(primary.card_key).toBe("children");
        expect(primary.host_entity_type).toBe("customers");
        expect(primary.host_entity_id).toBe(SMITH_HOUSEHOLD);
    });

    it("never targets a legacy drawer type", async () => {
        const { results } = await run("Joe Smith");
        for (const r of results) {
            for (const d of r.destinations) {
                expect(d.host_entity_type).not.toBe("customer_members");
                expect(d.host_entity_type).not.toBe("contacts");
                expect(d.target).not.toBe("open_drawer");
            }
        }
    });
});

// ---------------------------------------------------------------------------
// Case 2 — Parent / Guardian
// ---------------------------------------------------------------------------
describe("Case 2 — parent/guardian search", () => {
    it("returns Jane with household, primary-contact note and related children", async () => {
        const { results } = await run("Jane Smith");
        const jane = results.find((r) => r.subject.id === JANE_PERSON)!;
        expect(jane).toBeTruthy();
        expect(jane.subject.kind).toBe("person");
        expect(jane.recognition.type_label).toBe("Parent / Guardian");
        expect(jane.recognition.household_name).toBe("Smith Household");
        expect(jane.recognition.role_note).toBe("Primary contact");
        expect(jane.recognition.relation_summary).toBe("2 related children");
        expect(jane.recognition.related_names).toEqual(
            expect.arrayContaining(["Joe Smith", "Emma Smith"])
        );
    });

    it("offers a household destination", async () => {
        const { results } = await run("Jane Smith");
        const jane = results.find((r) => r.subject.id === JANE_PERSON)!;
        expect(jane.destinations.some((d) => d.key === "household")).toBe(true);
    });

    it("matches a person by email as a search signal", async () => {
        const { results } = await run("jane@example.com");
        expect(results.some((r) => r.subject.id === JANE_PERSON)).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Case 3 — Child schedule with siblings
// ---------------------------------------------------------------------------
describe("Case 3 — schedule intent preserves child grain", () => {
    it("'Joe Smith schedule' keeps Joe the subject and leads with Schedule", async () => {
        const { results, intent } = await run("Joe Smith schedule");
        expect(intent.subject_terms).toEqual(["joe", "smith"]);

        const joe = results.find((r) => r.subject.id === JOE_MEMBER)!;
        expect(joe.contexts[0].kind).toBe("schedule");
        expect(joe.contexts[0].detail).toBe("Mon / Wed / Fri");
        expect(joe.ranking.promoted_context_keys).toContain("schedule");
    });

    it("'Smith schedule' returns each child's OWN schedule, never a household rollup", async () => {
        const { results } = await run("Smith schedule");

        const joe = results.find((r) => r.subject.id === JOE_MEMBER)!;
        const emma = results.find((r) => r.subject.id === EMMA_MEMBER)!;
        expect(joe.contexts.find((c) => c.kind === "schedule")?.detail).toBe("Mon / Wed / Fri");
        expect(emma.contexts.find((c) => c.kind === "schedule")?.detail).toBe("Tue / Thu");

        // The household is present as a subject, but carries NO schedule context.
        const household = results.find((r) => r.subject.kind === "household");
        expect(household).toBeTruthy();
        expect(household!.contexts.some((c) => c.kind === "schedule")).toBe(false);
        expect(household!.recognition.relation_summary).toBe("2 children with active schedules");
    });

    it("ranks schedule-bearing children above the household for a schedule query", async () => {
        const { results } = await run("Smith schedule");
        const householdIndex = results.findIndex((r) => r.subject.kind === "household");
        const joeIndex = results.findIndex((r) => r.subject.id === JOE_MEMBER);
        expect(joeIndex).toBeLessThan(householdIndex);
    });
});

// ---------------------------------------------------------------------------
// Case 4 — One child, three configured processes
// ---------------------------------------------------------------------------
describe("Case 4 — multiple process participation stays ONE subject", () => {
    it("returns one Joe with three process contexts", async () => {
        const { results } = await run("Joe Smith");
        const joe = results.find((r) => r.subject.id === JOE_MEMBER)!;

        const processes = joe.contexts.filter((c) => c.kind === "process");
        expect(processes).toHaveLength(3);
        expect(processes.map((p) => p.label).sort()).toEqual([
            "Annual Registration",
            "Enrollment",
            "Subsidy Renewal",
        ]);
    });

    it("uses CONFIGURED stage labels for detail", async () => {
        const { results } = await run("Joe Smith");
        const joe = results.find((r) => r.subject.id === JOE_MEMBER)!;
        const byKey = new Map(joe.contexts.map((c) => [c.key, c]));
        expect(byKey.get("enrollment")?.detail).toBe("Enrolling");
        expect(byKey.get("annual_registration")?.detail).toBe("Needs documents");
        expect(byKey.get("subsidy_renewal")?.detail).toBe("Review due");
    });

    it("does NOT split Joe into three identities", async () => {
        const { results } = await run("Joe Smith");
        const smithJoes = results.filter(
            (r) => nameOf(r) === "Joe Smith" && r.subject.household_id === SMITH_HOUSEHOLD
        );
        expect(smithJoes).toHaveLength(1);
    });

    it("promotes the process the query named, keeping Joe one subject", async () => {
        const { results } = await run("Joe Smith annual registration");
        const joe = results.find((r) => r.subject.id === JOE_MEMBER)!;
        expect(joe.contexts[0].key).toBe("annual_registration");
        expect(joe.destinations[1]?.key).toBe("process:annual_registration");
    });
});

// ---------------------------------------------------------------------------
// Case 5 — Staff
// ---------------------------------------------------------------------------
describe("Case 5 — staff/person search to the limit of the canonical model", () => {
    it("finds Kelly Johnson as a Person subject", async () => {
        const { results } = await run("Kelly Johnson");
        const kelly = results.find((r) => r.subject.id === KELLY_PERSON)!;
        expect(kelly).toBeTruthy();
        expect(kelly.subject.kind).toBe("person");
        expect(kelly.destinations.find((d) => d.primary)?.card_key).toBe("household");
    });

    it("does NOT fabricate a staff role or campus assignment", async () => {
        // There is no canonical staff/employment model — see the architecture doc.
        // Search must report what exists, not invent employment context.
        const { results } = await run("Kelly Johnson");
        const kelly = results.find((r) => r.subject.id === KELLY_PERSON)!;
        expect(kelly.recognition.type_label).toBe("Person");
        expect(kelly.recognition.location_label).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Duplicate names
// ---------------------------------------------------------------------------
describe("duplicate-name disambiguation", () => {
    it("distinguishes same-named children by household in recognition metadata", async () => {
        const { results } = await run("Joe Smith");
        const joes = results.filter((r) => nameOf(r) === "Joe Smith" && r.subject.kind === "child");
        const households = joes.map((r) => r.recognition.household_name).sort();
        expect(households).toEqual([
            "Rivers Household",
            "Smith Household",
            "Smith Household (Portland)",
        ]);
        // Every same-named result is distinguishable — no two share a household.
        expect(new Set(households).size).toBe(households.length);
    });

    it("restricted operator sees only the Joes they may know about, still distinguishable", async () => {
        const { results } = await run("Joe Smith", bendOnlyDim);
        const joes = results.filter((r) => nameOf(r) === "Joe Smith" && r.subject.kind === "child");
        const households = joes.map((r) => r.recognition.household_name).sort();
        expect(households).toEqual(["Rivers Household", "Smith Household"]);
    });
});

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------
describe("permission boundary", () => {
    it("EXCLUDES an inaccessible subject rather than showing it disabled", async () => {
        const { results } = await run("Joe Smith", bendOnlyDim);
        expect(results.some((r) => r.subject.id === HIDDEN_MEMBER)).toBe(false);
        expect(results.some((r) => r.subject.household_id === HIDDEN_HOUSEHOLD)).toBe(false);
    });

    it("does not leak the inaccessible household name through recognition metadata", async () => {
        const { results } = await run("Smith", bendOnlyDim);
        const serialized = JSON.stringify(results);
        expect(serialized).not.toContain("Smith Household (Portland)");
        expect(serialized).not.toContain(HIDDEN_HOUSEHOLD);
    });

    it("returns nothing when the operator can reach nothing", async () => {
        // A restricted operator with no reachable sites resolves to empty
        // allow-lists — retrieval must not run at all.
        const scope = await import("@/lib/admin/accessScope");
        const persons = vi.mocked(scope.fetchScopedPersonIdsForRestrictedAdmin);
        const customers = vi.mocked(scope.fetchScopedCustomerIdsForRestrictedAdmin);
        persons.mockResolvedValueOnce([]);
        customers.mockResolvedValueOnce([]);

        const { results } = await run("Smith", {
            departmentScope: "all" as const,
            allowedDepartmentIds: null,
            siteScope: "restricted" as const,
            allowedSiteLocationIds: [],
        });
        expect(results).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Tenant configuration
// ---------------------------------------------------------------------------
describe("tenant configuration", () => {
    it("discovers a CUSTOM process label with no code change", async () => {
        const fixtures = baseFixtures();
        // Rename the process purely in configuration.
        (fixtures.departments[0].metadata as { lifecycle_builder_v1: typeof TENANT_A_LIFECYCLE })
            .lifecycle_builder_v1.processes[1].name = "Summer Camp Registration";

        const { results } = await run("Joe Smith", openDim, fixtures);
        const joe = results.find((r) => r.subject.id === JOE_MEMBER)!;
        expect(joe.contexts.map((c) => c.label)).toContain("Summer Camp Registration");
    });

    it("promotes a custom process by its configured label", async () => {
        const fixtures = baseFixtures();
        (fixtures.departments[0].metadata as { lifecycle_builder_v1: typeof TENANT_A_LIFECYCLE })
            .lifecycle_builder_v1.processes[1].name = "Summer Camp Registration";

        const { results, intent } = await run("Joe Smith summer camp registration", openDim, fixtures);
        expect(intent.subject_terms).toEqual(["joe", "smith"]);
        const joe = results.find((r) => r.subject.id === JOE_MEMBER)!;
        expect(joe.contexts[0].key).toBe("annual_registration");
        expect(joe.contexts[0].label).toBe("Summer Camp Registration");
    });

    it("contains no hardcoded tenant process names in the search library", async () => {
        // Guard: the configured labels above must not appear in platform code.
        const { readFileSync, readdirSync } = await import("node:fs");
        const { join } = await import("node:path");
        const dir = join(process.cwd(), "lib", "search");
        const forbidden = ["Annual Registration", "Subsidy Renewal", "Admissions", "Financial Aid"];
        const walk = (d: string): string[] =>
            readdirSync(d, { withFileTypes: true }).flatMap((e) =>
                e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]
            );
        for (const file of walk(dir)) {
            const text = readFileSync(file, "utf8");
            // Documentation may cite them as EXAMPLES; executable code must never
            // branch on them. Strip block and line comments, then assert.
            const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
            for (const name of forbidden) {
                expect(code, `${file} must not hardcode "${name}"`).not.toContain(name);
            }
        }
    });
});

// ---------------------------------------------------------------------------
// Doctrine
// ---------------------------------------------------------------------------
describe("doctrine", () => {
    it("states that results are previews, never mutation authority", () => {
        expect(SEARCH_RESULT_DOCTRINE).toContain("never authoritative truth");
    });

    it("exposes no raw storage terminology in operator-facing fields", async () => {
        const { results } = await run("Joe Smith");
        for (const r of results) {
            const operatorText = [
                r.subject.display_name,
                r.recognition.type_label,
                r.recognition.household_name,
                r.recognition.location_label,
                ...r.contexts.map((c) => c.label),
                ...r.destinations.map((d) => d.label),
            ]
                .filter(Boolean)
                .join(" ");
            expect(operatorText).not.toMatch(/customer_members|opportunit(y|ies)|process_instance|customer_persons/i);
        }
    });
});
