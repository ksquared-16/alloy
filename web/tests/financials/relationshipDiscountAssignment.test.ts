/**
 * A CHILD CAN BE GIVEN A DISCOUNT, NOT ONLY REFUSED ONE.
 *
 * Measured before it was built: three tables referenced `commercial_policies` and not one was
 * affirmative at the relationship grain — the result after the fact, a negative per relationship,
 * a negative per charge. A policy's own reach is scoped by `scope_type`, never by relationship.
 * So a child received a discount only by satisfying a RULE, and an operator who wanted to give
 * one family a configured discount the rules did not reach had nowhere to say so.
 *
 * These locks hold the shape of the affirmative half, and — more important — the line it must not
 * cross: assignment answers WHICH POLICIES A CHILD RECEIVES, and never whether one applies to a
 * charge.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const code = (rel: string) =>
    read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const sql = (rel: string) => readFileSync(join(process.cwd(), "..", rel), "utf8");

const MIGRATION = "supabase/migrations/20261017120000_commercial_policy_assignments.sql";
const SERVICE = "lib/financials/reductions/commercialPolicyAssignmentService.ts";
const RESOLVER = "lib/financials/reductions/resolveFinancialReductions.ts";
const ELIGIBILITY = "lib/financials/reductions/resolveReductionEligibility.ts";
const ACTIONS = "lib/adminV2/actions/definitions/financialReductionActions.ts";
const ROUTE = "app/api/admin/financials/assignable-discounts/route.ts";

describe("the affirmative authority exists and is the smallest one", () => {
    it("a child with no assignment can be given a configured discount", () => {
        const service = code(SERVICE);
        expect(service).toContain("export async function assignPolicyToRelationship");
        const actions = code(ACTIONS);
        expect(actions).toContain('BILLING_ASSIGN_POLICY_ACTION_KEY = "billing.assign_commercial_policy"');
        const list = actions.slice(actions.indexOf("export const financialReductionActions"));
        expect(list, "and it is registered").toContain("assignPolicy");
    });

    it("the row carries policy IDENTITY and never policy economics", () => {
        /*
         * An assignment with its own rate would be a second place the discount is worth
         * something, and the two would disagree the first time somebody edited the policy.
         */
        const migration = sql(MIGRATION);
        const table = migration.slice(migration.indexOf("create table if not exists public.commercial_policy_assignments"));
        /*
         * THE COLUMNS, not the prose around them. Reading the whole block caught "deliberately"
         * as a rate column, which is a lock failing on English rather than on schema.
         */
        const columns = table
            .slice(0, table.indexOf(");"))
            .split("\n")
            .map((l) => l.split("--")[0]!.trim())
            .filter((l) => l.length > 0 && !l.startsWith("/*") && !l.startsWith("*"))
            .join("\n");
        expect(columns, "the policy is referenced").toContain("policy_id uuid not null");
        for (const economics of ["percent", "amount_cents", "basis", "value", "rate", "cap"]) {
            expect(columns, `${economics} belongs to commercial_policies, not here`).not.toContain(economics);
        }
    });

    it("the action refuses a payload that names a rate", () => {
        const actions = code(ACTIONS);
        const assign = actions.slice(actions.indexOf("const assignPolicy: RegisteredAction"));
        expect(assign.slice(0, 4000)).toContain("POLICY_FORBIDDEN_FIELDS");
    });

    it("one child's assignment cannot reach a sibling", () => {
        /*
         * TWO INDEPENDENT GUARANTEES, because the UI is not one of them. The database refuses a
         * row whose subject is not that relationship's own member, and the eligibility reader
         * indexes assignments BY CHILD so a sibling's can never be read into another's facts.
         */
        const migration = sql(MIGRATION);
        expect(migration, "the trigger refuses a foreign subject")
            .toContain("commercial_policy_assignment_subject_mismatch");
        const eligibility = code(ELIGIBILITY);
        expect(eligibility, "and the facts are keyed by the child")
            .toMatch(/assignmentsByMember\.get\(memberId\)/);
    });

    it("ending an assignment preserves history", () => {
        const service = code(SERVICE);
        const end = service.slice(service.indexOf("export async function endPolicyAssignment"));
        expect(end, "the row is updated, never removed").not.toMatch(/\.delete\(\)/);
        expect(end).toMatch(/effective_end:/);
        expect(end, "only one still in force can be ended").toContain('.is("ended_at", null)');
    });

    it("the physical contracts are in the migration, not in UI code", () => {
        const migration = sql(MIGRATION);
        for (const [what, needle] of [
            ["org foreign key", "references public.orgs(id) on delete cascade"],
            ["policy foreign key", "references public.commercial_policies(id) on delete restrict"],
            ["relationship foreign key", "references public.opportunity_customer_members(id)"],
            ["org parity", "enforce_commercial_policy_assignment_parity"],
            ["uniqueness", "ux_commercial_policy_assignments_live"],
            ["effective dating", "commercial_policy_assignments_dates_ordered"],
            ["supersession", "supersedes_assignment_id"],
            ["RLS", "enable row level security"],
            ["provenance", "created_by"],
            ["idempotent DDL", "create table if not exists"],
        ] as const) {
            expect(migration, `${what} is a database invariant`).toContain(needle);
        }
    });
});

describe("assignment answers the relationship question and only that", () => {
    it("it satisfies the relationship gates", () => {
        /*
         * Sibling rank and count, and the employee-household requirement, ask whether this
         * RELATIONSHIP qualifies. An operator who assigned the policy has answered that question
         * themselves, deliberately and attributably, so the rules do not answer it again.
         */
        const resolver = code(RESOLVER);
        expect(resolver).toMatch(/const assigned = \(facts\.assignedPolicyIds \?\? \[\]\)\.includes\(policy\.id\)/);
        expect(resolver).toMatch(/!assigned && policy\.kind === "sibling_discount"/);
        expect(resolver).toMatch(/!assigned && policy\.kind === "discount"/);
    });

    it("an ineligible charge type still refuses an assigned policy", () => {
        /*
         * THE LINE THE MODEL TURNS ON, and it is structural rather than conventional: both charge
         * gates run BEFORE `assigned` is computed, so the assignment branch cannot reach them. A
         * sibling discount assigned to a child still cannot reduce a Registration Fee the policy's
         * own `applies_to` excludes, and still cannot reduce a charge whose category is not
         * discountable at all.
         */
        const resolver = code(RESOLVER);
        const fn = resolver.slice(resolver.indexOf("function evaluateOne("));
        const body = fn.slice(0, fn.indexOf("\n}"));
        const categoryCovered = body.indexOf('skip: "category_not_covered"');
        const categoryDiscountable = body.indexOf('skip: "category_not_discountable"');
        const assigned = body.indexOf("const assigned =");
        expect(categoryCovered, "the policy's own applies_to runs first").toBeGreaterThan(-1);
        expect(categoryDiscountable, "and the category's discountability").toBeGreaterThan(-1);
        expect(assigned, "assignment is consulted only after both").toBeGreaterThan(categoryCovered);
        expect(assigned).toBeGreaterThan(categoryDiscountable);
    });

    it("the fact is server-resolved, never asserted by a caller", () => {
        /* A browser that could declare itself assigned could grant itself a discount. */
        const eligibility = code(ELIGIBILITY);
        expect(eligibility).toContain("readLivePolicyAssignmentsByMember");
        expect(eligibility, "asked as of the period, because an assignment has a window")
            .toMatch(/onDate: periodStart/);
        const service = code(SERVICE);
        const reader = service.slice(service.indexOf("export async function readLivePolicyAssignmentsByMember"));
        expect(reader.slice(0, 1600), "ended and superseded rows never grant anything")
            .toMatch(/\.is\("superseded_at", null\)[\s\S]{0,120}\.is\("ended_at", null\)/);
        expect(reader.slice(0, 1600), "and the window is honoured").toMatch(/effectiveEnd && row\.effectiveEnd < args\.onDate/);
    });

    it("it is one query for the household, not one per child", () => {
        const service = code(SERVICE);
        const reader = service.slice(service.indexOf("export async function readLivePolicyAssignmentsByMember"));
        expect(reader.slice(0, 1200)).toMatch(/\.in\("customer_member_id", ids\)/);
    });
});

describe("what may be given is read from configuration, not from the rules", () => {
    it("candidates are reduction policies that are alive", () => {
        const route = code(ROUTE);
        /*
         * THE FILTER, not the mention. Deleting the `.filter(...)` line left the import and the
         * word behind and the lock stayed green — while the selector would have offered proration
         * and approval rules as discounts.
         */
        expect(route, "the candidate list is narrowed to reduction kinds")
            .toMatch(/\.filter\(\(p\) => \(REDUCTION_KINDS as readonly string\[\]\)\.includes\(p\.kind\)\)/);
        expect(route, "inactive policies are not candidates").toMatch(/\.filter\(\(p\) => p\.isActive\)/);
        expect(route, "nor closed ones").toMatch(/!p\.effective\.end \|\| p\.effective\.end >= today/);
    });

    it("candidates are NOT filtered by whether the rules already reach the child", () => {
        /*
         * That is the whole point of assignment. Filtering by the rules would hide exactly the
         * policies an operator came here to assign.
         */
        const route = code(ROUTE);
        expect(route, "no eligibility resolution happens here")
            .not.toMatch(/resolveHouseholdEligibility|siblingRank|employeeHousehold/);
    });

    it("the reduction-kind list is named once, not copied per caller", () => {
        /* A surface filtering on a stale copy would offer a proration rule in a discount selector. */
        const resolver = code(RESOLVER);
        expect(resolver).toMatch(/export const REDUCTION_KINDS/);
        for (const consumer of [
            "lib/financials/reductions/applyFinancialReductions.ts",
            "lib/financials/reductions/forecastAssignmentReductions.ts",
            ROUTE,
        ]) {
            expect(code(consumer), `${consumer} imports it`).not.toMatch(/const REDUCTION_KINDS\s*[:=]/);
        }
    });

    it("the route states no amount it did not read", () => {
        const route = code(ROUTE);
        expect(route, "the authored value is carried").toMatch(/basisValue:/);
        expect(route, "and never computed").not.toMatch(/\*\s*0?\.\d|\/\s*100\b/);
    });
});
