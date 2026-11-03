/**
 * A PARENT OPENS THEIR HOUSEHOLD IN EACH OF ITS BUSINESS PROCESSES.
 *
 * The request: selecting one of Lennon's parents should land on the household — and where the
 * household is in several business processes (Enrollment, Billing), Search should offer each, landing
 * on the household selected in that process's Work View, the whole panel visible.
 *
 * A parent participates in nothing — only children do — so these pin the two producers that now
 * answer for the household:
 *
 *   staged process (Enrollment) → `buildHouseholdProcessContexts`: the children's case, evaluated at
 *                                  FAMILY grain, the case selected as the row
 *   projection (Billing)        → `loadHouseholdProjectionContexts`: the household's own projection
 *                                  row, every cohort read once for the whole candidate set
 *
 * and, through Search's one resolver, the destinations a parent result carries.
 */
import { describe, expect, it, vi } from "vitest";

import type { DomainProjectionCohort } from "@/lib/businessProcesses/projections/domainProjectionTypes";
import type { LifecycleBuilderStageRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { domainProjectionHostWorkUnitKey } from "@/lib/businessProcesses/projections/domainProjectionHost";
import { buildHouseholdProcessContexts, type SubjectProcessRow } from "@/lib/context/buildSubjectContexts";
import { loadHouseholdProjectionContexts } from "@/lib/context/projectionSubjectContexts";
import { operatorFocusSelectionFromDestination } from "@/lib/runtime/focus/operatorFocusSelection";
import { resolveSearchDestinations } from "@/lib/search/searchDestinations";
import type { SearchSubject } from "@/lib/search/searchContracts";
import type {
    SearchConfiguredProcess,
    SearchProcessConfiguration,
} from "@/lib/search/searchProcessConfiguration";

const CASE = "opp-kurzman";
const OTHER_CASE = "opp-other";
const UNIT = "enrollment_pipeline";
const LENNON = "cm-lennon";
const SIBLING = "cm-sibling";
const HOUSEHOLD = "cust-kurzman";
const OTHER_HOUSEHOLD = "cust-other";
const BILLING_DEPT = "dept-billing";

// A partial stage — only what Search reads; the operating plan is not a full StageOperatingPlanV1.
const childStage = (key: string, sort_order: number) =>
    ({
        id: `stage-${key}`,
        key,
        label: key,
        grain: "child",
        is_active: true,
        sort_order,
        stage_operating_plan_v1: {
            journey_segment: "child",
            work_templates: [{ template_key: `${key}_work`, label: "Work", primary: true, required: false }],
        },
    }) as unknown as LifecycleBuilderStageRecord;

const WAITLIST_CHILD_VIEW = {
    id: "waitlist_view",
    label: "Waitlist",
    filters_v1: [{ field_key: "opportunity_stage", operator: "is_any_of", value: ["waitlist"] }],
    display_order: 1,
    visible_in_runtime: true,
};
const ALL_FAMILIES_VIEW = { id: "all_work", label: "All", display_order: 2, visible_in_runtime: true };
const TOURS_VIEW = {
    id: "tours",
    label: "Tours",
    row_grain_v1: "family",
    filters_v1: [{ field_key: "has_active_tour", operator: "equals", value: true }],
    display_order: 3,
    visible_in_runtime: true,
};

const ENROLLMENT = {
    key: "enrollment",
    label: "Enrollment",
    department_id: "dept-enrollment",
    stage_labels: { waitlist: "Waitlist", enrolling: "Enrolling" },
    operator_has_access: true,
    work_views: [WAITLIST_CHILD_VIEW, ALL_FAMILIES_VIEW, TOURS_VIEW],
    stages: [childStage("waitlist", 1), childStage("enrolling", 2)],
} as SearchConfiguredProcess;

function projectionProcess(key: string, label: string, domain: "assignments" | "billing", views: Array<[string, string, string]>) {
    return {
        key,
        label,
        department_id: BILLING_DEPT,
        stage_labels: {},
        operator_has_access: true,
        stages: [],
        work_views: views.map(([id, viewLabel, projection_key], i) => ({ id, label: viewLabel, projection_key, display_order: i, visible_in_runtime: true })),
        projection_domain: domain,
    } as SearchConfiguredProcess;
}
const BILLING = projectionProcess("billing_bp", "Billing", "billing", [
    ["payments_due_view", "Payments due", "payments_due"],
    ["overdue_view", "Overdue", "overdue_payments"],
]);
const ASSIGNMENTS = projectionProcess("assignments_bp", "Assignments", "assignments", [
    ["current_assignments_view", "Current", "current_assignments"],
]);

const config = (...processes: SearchConfiguredProcess[]): SearchProcessConfiguration => ({
    byKey: new Map(processes.map((p) => [p.key, p])),
    vocabulary: processes.map((p) => ({ key: p.key, label: p.label })),
});

const row = (subject_id: string, over: Partial<SubjectProcessRow> = {}): SubjectProcessRow => ({
    id: `pi-${subject_id}`,
    subject_id,
    process_key: "enrollment",
    stage_key: "waitlist",
    state: "active",
    location_id: null,
    context_type: "opportunity",
    context_id: CASE,
    ...over,
});

const caseRow = (over: Record<string, unknown> = {}) => ({
    id: CASE,
    stage_key: "waitlist",
    _effective_participant_stage_keys: ["waitlist"],
    ...over,
});

const parent: SearchSubject = {
    kind: "person",
    id: "p-kelly",
    display_name: "Kelly Kurzman",
    person_id: "p-kelly",
    household_id: HOUSEHOLD,
    household_case_entity_id: CASE,
    household_case_work_unit_key: UNIT,
};

function householdContexts(
    rows: SubjectProcessRow[],
    familyMembershipRows = new Map<string, Record<string, unknown>>([[CASE, caseRow()]]),
    heldProcessKeys?: Set<string>,
) {
    const processBySubject = new Map<string, SubjectProcessRow[]>();
    for (const r of rows) processBySubject.set(r.subject_id, [...(processBySubject.get(r.subject_id) ?? []), r]);
    return buildHouseholdProcessContexts({
        childKeys: [LENNON, SIBLING],
        heldProcessKeys,
        processBySubject,
        processConfig: config(ENROLLMENT),
        hostWorkUnitKeys: new Map([
            [CASE, UNIT],
            [OTHER_CASE, UNIT],
        ]),
        stageWorkViewTargets: new Map(),
        familyMembershipRows,
    });
}

describe("Enrollment — the household's children's case, selected as the household", () => {
    const contexts = householdContexts([row(LENNON), row(SIBLING, { stage_key: "enrolling" })]);

    it("one Enrollment context for the household, however many children are in it", () => {
        expect(contexts.map((c) => c.key)).toEqual(["enrollment"]);
    });

    it("offers only the FAMILY cohorts the case is in — never a child lens", () => {
        const views = (contexts[0].operational_memberships ?? []).map((m) => m.work_view_id);
        expect(views).toEqual(["all_work"]);
        expect(views).not.toContain("waitlist_view");
    });

    it("the row is the CASE — the household selected, not one child", () => {
        const [membership] = contexts[0].operational_memberships ?? [];
        expect(membership.operational_member_id).toBe(CASE);
        expect(membership.host_entity_id).toBe(CASE);
        expect(membership.host_work_unit_key).toBe(UNIT);
    });

    it("evaluates the family predicates truthfully — a tour cohort only when the case has one", () => {
        const withTour = householdContexts([row(LENNON)], new Map([[CASE, caseRow({ has_active_tour: true })]]));
        expect((withTour[0].operational_memberships ?? []).map((m) => m.work_view_id)).toEqual(["all_work", "tours"]);
    });

    it("two cases in one process ⇒ ambiguous, never resolved by order", () => {
        const [ctx] = householdContexts([row(LENNON), row(SIBLING, { context_id: OTHER_CASE })]);
        expect(ctx.participation_ambiguous).toBe(true);
        expect(ctx.operational_memberships ?? []).toEqual([]);
    });

    it("nothing proven, nothing shown — an unloaded case offers no Enrollment", () => {
        expect(householdContexts([row(LENNON)], new Map())).toEqual([]);
    });

    it("never restates a process the subject already holds", () => {
        expect(householdContexts([row(LENNON)], undefined, new Set(["enrollment"]))).toEqual([]);
    });

    it("a process the operator cannot reach is never offered", () => {
        const hidden = buildHouseholdProcessContexts({
            childKeys: [LENNON],
            processBySubject: new Map([[LENNON, [row(LENNON)]]]),
            processConfig: config({ ...ENROLLMENT, operator_has_access: false }),
            hostWorkUnitKeys: new Map([[CASE, UNIT]]),
            stageWorkViewTargets: new Map(),
            familyMembershipRows: new Map([[CASE, caseRow()]]),
        });
        expect(hidden).toEqual([]);
    });
});

const billingCohort = (projectionKey: string, householdIds: string[]): DomainProjectionCohort => ({
    status: "ok",
    domain: "billing",
    projectionKey,
    rows: householdIds.map((id) => ({
        subject: { type: "household", id },
        label: "Family",
        source: { kind: "charge", id: `ch-${id}`, count: 1, statusLabel: "Due" },
        siteLocationId: null,
    })),
    total: householdIds.length,
    factTotal: householdIds.length,
    truncated: false,
});

const dimensions = { siteScope: "all", allowedSiteLocationIds: null } as never;

describe("Billing — the household's own projection row, cohorts read once for every household", () => {
    it("each household gets the Billing views whose cohort holds it", async () => {
        const loadCohort = vi.fn(async (_s: unknown, args: { projectionKey: string | null | undefined }) =>
            args.projectionKey === "payments_due"
                ? billingCohort("payments_due", [HOUSEHOLD, OTHER_HOUSEHOLD])
                : billingCohort("overdue_payments", [HOUSEHOLD]),
        );
        const out = await loadHouseholdProjectionContexts({
            supabase: {} as never,
            orgId: "org",
            userId: "u-operator",
            dimensions,
            processConfig: config(BILLING),
            householdIds: [HOUSEHOLD, OTHER_HOUSEHOLD],
            loadCohort: loadCohort as never,
        });

        // Two households, two projections — two cohort reads, not four.
        expect(loadCohort).toHaveBeenCalledTimes(2);

        const mine = out.get(HOUSEHOLD)!;
        expect(mine.map((c) => c.key)).toEqual(["billing_bp"]);
        expect((mine[0].operational_memberships ?? []).map((m) => m.work_view_id)).toEqual(["payments_due_view", "overdue_view"]);
        const [due] = mine[0].operational_memberships ?? [];
        expect(due.host_entity_type).toBe("customers");
        expect(due.host_entity_id).toBe(HOUSEHOLD);
        expect(due.operational_member_id).toBe(`household:${HOUSEHOLD}`);
        expect(due.host_work_unit_key).toBe(domainProjectionHostWorkUnitKey(BILLING_DEPT));

        expect((out.get(OTHER_HOUSEHOLD)![0].operational_memberships ?? []).map((m) => m.work_view_id)).toEqual(["payments_due_view"]);
    });

    it("a refused cohort (no fin.read) offers nothing — Billing's own gate is honoured", async () => {
        const out = await loadHouseholdProjectionContexts({
            supabase: {} as never,
            orgId: "org",
            userId: "u-operator",
            dimensions,
            processConfig: config(BILLING),
            householdIds: [HOUSEHOLD],
            loadCohort: (async () => ({ status: "refused", code: "projection_forbidden", message: "" })) as never,
        });
        expect(out.size).toBe(0);
    });

    it("a child-grain projection (Assignments) never substitutes the household for a child", async () => {
        const loadCohort = vi.fn();
        const out = await loadHouseholdProjectionContexts({
            supabase: {} as never,
            orgId: "org",
            userId: "u-operator",
            dimensions,
            processConfig: config(ASSIGNMENTS),
            householdIds: [HOUSEHOLD],
            loadCohort: loadCohort as never,
        });
        expect(loadCohort).not.toHaveBeenCalled();
        expect(out.size).toBe(0);
    });

    it("no household in the results ⇒ no cohort is read at all", async () => {
        const loadCohort = vi.fn();
        await loadHouseholdProjectionContexts({
            supabase: {} as never,
            orgId: "org",
            userId: null,
            dimensions,
            processConfig: config(BILLING),
            householdIds: [],
            loadCohort: loadCohort as never,
        });
        expect(loadCohort).not.toHaveBeenCalled();
    });
});

describe("a parent's Search result — each household process, each landing on the household", () => {
    async function parentDestinations() {
        const enrollment = householdContexts([row(LENNON)]);
        const billing = await loadHouseholdProjectionContexts({
            supabase: {} as never,
            orgId: "org",
            userId: "u-operator",
            dimensions,
            processConfig: config(BILLING),
            householdIds: [HOUSEHOLD],
            loadCohort: (async () => billingCohort("payments_due", [HOUSEHOLD])) as never,
        });
        return resolveSearchDestinations({
            subject: parent,
            contexts: [...enrollment, ...(billing.get(HOUSEHOLD) ?? [])],
            promotedKeys: [],
        });
    }

    it("clicking the parent still opens the parent's record", async () => {
        const [primary] = await parentDestinations();
        expect(primary.key).toBe("subject");
        expect(primary.target).toBe("durable_record");
        expect(primary.subject_type).toBe("person");
    });

    it("offers Enrollment AND Billing, each its own destination", async () => {
        const keys = (await parentDestinations()).map((d) => d.key);
        expect(keys).toContain("work_view:enrollment:all_work");
        expect(keys).toContain("work_view:billing_bp:payments_due_view");
    });

    it("Enrollment lands on the household's case in that view, whole panel, no card zoomed", async () => {
        const enrollment = (await parentDestinations()).find((d) => d.key === "work_view:enrollment:all_work")!;
        const selection = operatorFocusSelectionFromDestination(enrollment)!;
        expect(selection.entity_type).toBe("opportunities");
        expect(selection.entity_id).toBe(CASE);
        expect(selection.host_work_view_id).toBe("all_work");
        expect(selection.operational_member_id).toBe(CASE);
        expect(selection.card_focus).toBeNull();
    });

    it("Billing lands on the household's own row in the Billing view, whole panel, no card zoomed", async () => {
        const billing = (await parentDestinations()).find((d) => d.key === "work_view:billing_bp:payments_due_view")!;
        const selection = operatorFocusSelectionFromDestination(billing)!;
        expect(selection.entity_type).toBe("customers");
        expect(selection.entity_id).toBe(HOUSEHOLD);
        expect(selection.host_work_view_id).toBe("payments_due_view");
        expect(selection.operational_member_id).toBe(`household:${HOUSEHOLD}`);
        expect(selection.card_focus).toBeNull();
    });
});
