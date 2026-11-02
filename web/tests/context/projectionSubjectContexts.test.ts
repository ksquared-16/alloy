/**
 * BILLING AND ASSIGNMENTS AS A CHILD'S PROCESS CONTEXTS — through the real cohort reader.
 *
 * A domain-projection process has no participations, so a child's record offered no way into Billing
 * or Assignments. These pin the integration: membership is read from THE cohort reader the Work View
 * itself renders (`loadDomainProjectionCohort`), at the process's own child grain or else the child's
 * own household, and turned into destinations by Search's one resolver — the same `Go to` entries the
 * record overlay, Roster's assignment record and the Children card read.
 *
 * Assignments runs the REAL projection loader over the in-memory PostgREST stub. Billing's loader is
 * gated on `fin.read`, which this layer must honour rather than re-decide, so its cohort is injected in
 * both its ok and its forbidden form.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/childcareOperational/operationalEnrollmentApi", () => ({
    resolveOperationalEnrollmentTodayYmd: async () => "2026-10-20",
}));

import { domainProjectionHostWorkUnitKey } from "@/lib/businessProcesses/projections/domainProjectionHost";
import { loadDomainProjectionCohort } from "@/lib/businessProcesses/projections/domainProjectionRegistry";
import type { DomainProjectionCohort } from "@/lib/businessProcesses/projections/domainProjectionTypes";
import { durableRecordContextOptions } from "@/lib/context/durableRecordContextOptions";
import { durableRecordRelatedWork } from "@/lib/context/durableRecordRelatedWork";
import {
    loadProjectionSubjectContexts,
    projectionMembershipTarget,
} from "@/lib/context/projectionSubjectContexts";
import type { SubjectContext } from "@/lib/context/subjectContextTypes";
import { isChildGrainWorkDestination } from "@/lib/adminV2/runtime/focusPanel/children/useChildWorkDestination";
import { durableRecordEntryFor } from "@/components/presentation/workUnit/DomainProjectionFocusContext";
import { operatorFocusSelectionFromDestination } from "@/lib/runtime/focus/operatorFocusSelection";
import { SEARCH_CARD_KEYS } from "@/lib/search/searchDestinations";
import type {
    SearchConfiguredProcess,
    SearchProcessConfiguration,
} from "@/lib/search/searchProcessConfiguration";
import { projectionTableStub } from "../businessProcesses/projectionTableStub";

const ORG = "11111111-1111-4111-8111-000000000001";
const SITE_A = "aaaaaaaa-0000-4000-8000-00000000000a";
const SITE_B = "bbbbbbbb-0000-4000-8000-00000000000b";
const ROOM = "cccccccc-0000-4000-8000-00000000000c";
const TYPE = "eeeeeeee-0000-4000-8000-00000000000e";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const CHILD = uuid(1);
const SIBLING = uuid(2);
const HOUSEHOLD = uuid(50);
const OTHER_HOUSEHOLD = uuid(51);
const ASSIGN_DEPT = "dddddddd-0000-4000-8000-0000000000a1";
const BILLING_DEPT = "dddddddd-0000-4000-8000-0000000000b1";

const ALL_SITES = { siteScope: "all" as const, allowedSiteLocationIds: [] as string[] };
const dimensions = (over: Record<string, unknown> = {}) =>
    ({ siteScope: "all", allowedSiteLocationIds: null, ...over }) as never;

function proc(key: string, label: string, department_id: string, domain: "assignments" | "billing", views: Array<[string, string, string]>, over: Partial<SearchConfiguredProcess> = {}) {
    return {
        key,
        label,
        department_id,
        stage_labels: {},
        operator_has_access: true,
        stages: [],
        work_views: views.map(([id, viewLabel, projection_key], i) => ({ id, label: viewLabel, projection_key, display_order: i, visible_in_runtime: true })),
        projection_domain: domain,
        ...over,
    } as SearchConfiguredProcess;
}

const ASSIGNMENTS = proc("assignments_bp", "Assignments", ASSIGN_DEPT, "assignments", [
    ["current_assignments_view", "Current", "current_assignments"],
    ["schedule_gaps_view", "Schedule gaps", "schedule_gaps"],
]);
const BILLING = proc("billing_bp", "Billing", BILLING_DEPT, "billing", [
    ["payments_due_view", "Payments due", "payments_due"],
    ["overdue_view", "Overdue", "overdue_payments"],
]);

const config = (...ps: SearchConfiguredProcess[]): SearchProcessConfiguration => ({
    byKey: new Map(ps.map((p) => [p.key, p])),
    vocabulary: [],
});

function assignment(over: Record<string, unknown>) {
    return {
        org_id: ORG, subject_type: "child", customer_member_id: null, subject_person_id: null, enrollment_agreement_id: null,
        site_location_id: SITE_A, room_location_id: ROOM, operational_assignment_type_id: TYPE, supersedes_assignment_id: null,
        is_primary: true, status: "active", commitment_kind: "committed", start_date: "2026-09-01", end_date: null, ...over,
    };
}
const assignmentsDb = (rows: Record<string, unknown>[]) =>
    projectionTableStub({
        locations: [
            { id: SITE_A, org_id: ORG, label: "Riverside" },
            { id: SITE_B, org_id: ORG, label: "Lakeside" },
            { id: ROOM, org_id: ORG, label: "Toddler Room" },
        ],
        operational_assignment_types: [{ id: TYPE, org_id: ORG, label: "Full day" }],
        customer_members: [CHILD, SIBLING].map((id) => ({ id, org_id: ORG, display_name: "Child" })),
        persons: [],
        schedule_assignments: rows,
    });

/** A Billing cohort as the registry returns it — household rows only. */
const billingCohort = (householdIds: string[]): DomainProjectionCohort => ({
    status: "ok",
    domain: "billing",
    projectionKey: "payments_due",
    rows: householdIds.map((id) => ({
        subject: { type: "household", id },
        label: "Family",
        source: { kind: "charge", id: `ch-${id}`, count: 1, statusLabel: "Due" },
        siteLocationId: SITE_A,
    })),
    total: householdIds.length,
    factTotal: householdIds.length,
    truncated: false,
});

const load = (args: Partial<Parameters<typeof loadProjectionSubjectContexts>[0]>) =>
    loadProjectionSubjectContexts({
        supabase: assignmentsDb([]) as never,
        orgId: ORG,
        userId: "u1",
        dimensions: dimensions(),
        processConfig: config(ASSIGNMENTS, BILLING),
        subject: { memberId: CHILD, householdId: HOUSEHOLD },
        ...args,
    });

const lennon = { kind: "child" as const, memberId: CHILD, personId: null, householdId: HOUSEHOLD, label: "Lennon" };

describe("Assignments — the child's own row in the REAL projection", () => {
    it("a child with a live assignment is a member of Current, and ONLY of the views that hold it", async () => {
        const contexts = await load({
            supabase: assignmentsDb([assignment({ id: uuid(101), customer_member_id: CHILD })]) as never,
            processConfig: config(ASSIGNMENTS),
        });
        expect(contexts).toHaveLength(1);
        const [ctx] = contexts;
        expect(ctx.key).toBe("assignments_bp");
        expect(ctx.projection_domain).toBe("assignments");
        expect(ctx.operational_memberships!.map((m) => m.work_view_id)).toEqual(["current_assignments_view"]);
        const [m] = ctx.operational_memberships!;
        expect(m.operational_member_id).toBe(`child:${CHILD}`);
        expect(m.row_grain).toBe("child");
        expect(m.host_work_unit_key).toBe(domainProjectionHostWorkUnitKey(ASSIGN_DEPT));
        expect(m.host_entity_type).toBe("customer_members");
    });

    it("a SIBLING's assignment is not this child's — the household is never substituted at child grain", async () => {
        const contexts = await load({
            supabase: assignmentsDb([assignment({ id: uuid(102), customer_member_id: SIBLING })]) as never,
            processConfig: config(ASSIGNMENTS),
        });
        expect(contexts).toEqual([]);
        expect(projectionMembershipTarget(ASSIGNMENTS, "assignments", { memberId: CHILD, householdId: HOUSEHOLD })).toEqual({ type: "child", id: CHILD });
    });

    it("SITE SCOPE is the projection's own: a restricted operator outside the site sees no membership", async () => {
        const db = assignmentsDb([assignment({ id: uuid(103), customer_member_id: CHILD, site_location_id: SITE_B })]);
        const restricted = await load({
            supabase: db as never,
            processConfig: config(ASSIGNMENTS),
            dimensions: dimensions({ siteScope: "restricted", allowedSiteLocationIds: [SITE_A] }),
        });
        expect(restricted).toEqual([]);
        const unrestricted = await load({ supabase: db as never, processConfig: config(ASSIGNMENTS) });
        expect(unrestricted).toHaveLength(1);
    });

    it("STALE — an assignment that ended is not a current membership", async () => {
        const contexts = await load({
            supabase: assignmentsDb([assignment({ id: uuid(104), customer_member_id: CHILD, end_date: "2026-10-19" })]) as never,
            processConfig: config(ASSIGNMENTS),
        });
        expect(contexts.flatMap((c) => c.operational_memberships ?? []).map((m) => m.work_view_id)).not.toContain("current_assignments_view");
    });

    it("CROSS-ORG — another organization's assignment for the same id never matches", async () => {
        const contexts = await load({
            supabase: assignmentsDb([assignment({ id: uuid(105), customer_member_id: CHILD, org_id: "99999999-9999-4999-8999-999999999999" })]) as never,
            processConfig: config(ASSIGNMENTS),
        });
        expect(contexts).toEqual([]);
    });
});

describe("Billing — no child grain ⇒ the child's OWN household row", () => {
    it("matches the household the child belongs to, and selects that household's row", async () => {
        const contexts = await load({
            processConfig: config(BILLING),
            loadCohort: (async () => billingCohort([HOUSEHOLD])) as typeof loadDomainProjectionCohort,
        });
        const [ctx] = contexts;
        expect(ctx.projection_domain).toBe("billing");
        expect(ctx.operational_memberships!.map((m) => [m.work_view_id, m.operational_member_id, m.row_grain, m.host_entity_type])).toEqual([
            ["payments_due_view", `household:${HOUSEHOLD}`, "family", "customers"],
            ["overdue_view", `household:${HOUSEHOLD}`, "family", "customers"],
        ]);
    });

    it("ANOTHER household in the cohort is never borrowed", async () => {
        const contexts = await load({
            processConfig: config(BILLING),
            loadCohort: (async () => billingCohort([OTHER_HOUSEHOLD])) as typeof loadDomainProjectionCohort,
        });
        expect(contexts).toEqual([]);
    });

    it("a child with NO household has no family to fall back to — explicit none, no read", async () => {
        const loadCohort = vi.fn(async () => billingCohort([HOUSEHOLD]));
        const contexts = await load({
            processConfig: config(BILLING),
            subject: { memberId: CHILD, householdId: null },
            loadCohort: loadCohort as unknown as typeof loadDomainProjectionCohort,
        });
        expect(contexts).toEqual([]);
        expect(loadCohort).not.toHaveBeenCalled();
    });

    it("CAPABILITY — Billing refused (no fin.read) discloses nothing, not even the process", async () => {
        const contexts = await load({
            processConfig: config(BILLING),
            loadCohort: (async () => ({ status: "refused", code: "projection_forbidden", message: "fin.read" })) as typeof loadDomainProjectionCohort,
        });
        expect(contexts).toEqual([]);
    });

    it("DEPARTMENT ACCESS — a process the operator cannot reach is never read", async () => {
        const loadCohort = vi.fn(async () => billingCohort([HOUSEHOLD]));
        const contexts = await load({
            processConfig: config({ ...BILLING, operator_has_access: false }),
            loadCohort: loadCohort as unknown as typeof loadDomainProjectionCohort,
        });
        expect(contexts).toEqual([]);
        expect(loadCohort).not.toHaveBeenCalled();
    });

    it("the cohort is read AS THE CALLER, once per projection key", async () => {
        const loadCohort = vi.fn(async () => billingCohort([HOUSEHOLD]));
        await load({ processConfig: config(BILLING), userId: "operator-7", loadCohort: loadCohort as unknown as typeof loadDomainProjectionCohort });
        expect(loadCohort).toHaveBeenCalledTimes(2);
        for (const call of loadCohort.mock.calls as unknown as Array<[unknown, { userId: string; orgId: string; scope: unknown }]>) {
            expect(call[1].userId).toBe("operator-7");
            expect(call[1].orgId).toBe(ORG);
            expect(call[1].scope).toEqual({ ...ALL_SITES, selectedSiteId: null });
        }
    });
});

describe("the record's Go to — one resolver, the domain's own card", () => {
    const contextsWith = async (): Promise<SubjectContext[]> => [
        ...(await load({
            supabase: assignmentsDb([assignment({ id: uuid(106), customer_member_id: CHILD })]) as never,
            processConfig: config(ASSIGNMENTS),
        })),
        ...(await load({ processConfig: config(BILLING), loadCohort: (async () => billingCohort([HOUSEHOLD])) as typeof loadDomainProjectionCohort })),
    ];

    it("each membership is a Go to that lands on its projection view and selects the subject's row", async () => {
        const work = durableRecordRelatedWork(lennon, await contextsWith());
        const byKey = new Map(work.map((d) => [d.key, d]));

        const current = byKey.get("work_view:assignments_bp:current_assignments_view")!;
        expect(current.card_key).toBe(SEARCH_CARD_KEYS.assignment);
        const due = byKey.get("work_view:billing_bp:payments_due_view")!;
        expect(due.card_key).toBe(SEARCH_CARD_KEYS.financials);

        const selection = operatorFocusSelectionFromDestination(due)!;
        expect(selection.host_work_view_id).toBe("payments_due_view");
        expect(selection.host_work_unit_key).toBe(domainProjectionHostWorkUnitKey(BILLING_DEPT));
        expect(selection.operational_member_id).toBe(`household:${HOUSEHOLD}`);
        expect(selection.entity_type).toBe("customers");
        expect(selection.entity_id).toBe(HOUSEHOLD);
    });

    it("the card asked for is the card the projection's record opens with (`durableRecordEntryFor`)", () => {
        const billing = durableRecordEntryFor({ businessProcessKey: "b", workViewId: "v", domain: "billing", projectionKey: "payments_due" });
        expect(billing.leadCard).toBe(SEARCH_CARD_KEYS.financials);
        const assignments = durableRecordEntryFor({ businessProcessKey: "a", workViewId: "v", domain: "assignments", projectionKey: "current_assignments" });
        // Assignments opens on the record's `schedule` context — the Assignments (scheduling) card.
        expect(assignments.contextKey).toBe("schedule");
        expect(SEARCH_CARD_KEYS.assignment).toBe("scheduling");
    });

    it("a projection process is NAVIGATION ONLY — never a selectable in-record composition", async () => {
        const options = durableRecordContextOptions(await contextsWith());
        expect(options.some((o) => o.businessProcessKey === "assignments_bp" || o.businessProcessKey === "billing_bp")).toBe(false);
    });

    it("no membership ⇒ no generic Billing destination guessed onto the family case", async () => {
        const bare: SubjectContext = { kind: "process", key: "billing_bp", label: "Billing", operational_memberships: [], projection_domain: "billing" };
        expect(durableRecordRelatedWork(lennon, [bare])).toEqual([]);
    });

    it("the Children card's 'X's work' takes the child's own row, never the household's Billing row", async () => {
        const work = durableRecordRelatedWork(lennon, await contextsWith());
        const childWork = work.filter(isChildGrainWorkDestination).map((d) => d.key);
        expect(childWork).toContain("work_view:assignments_bp:current_assignments_view");
        expect(childWork).not.toContain("work_view:billing_bp:payments_due_view");
    });

    it("a staged process's family-grain fallback (member = case) is not 'X's work' either", () => {
        expect(isChildGrainWorkDestination({ operational_member_id: "opp-1", host_entity_id: "opp-1" })).toBe(false);
        expect(isChildGrainWorkDestination({ operational_member_id: "pi-1", host_entity_id: "opp-1" })).toBe(true);
        expect(isChildGrainWorkDestination({ operational_member_id: "", host_entity_id: "opp-1" })).toBe(false);
    });
});

describe("Search's process configuration names the projection domain — the canonical model reader", () => {
    it("a domain_projection department carries its domain and its projection-keyed views", async () => {
        const { loadSearchProcessConfiguration, resetSearchProcessConfigurationCache } = await import("@/lib/search/searchProcessConfiguration");
        resetSearchProcessConfigurationCache();
        const metadata = (key: string, domain: string | null, views: unknown[]) => ({
            lifecycle_builder_v1: {
                version: 1,
                active_process_id: key,
                processes: [{
                    id: key, key, name: key, is_active: true, stages: [],
                    ...(domain ? { process_model_v1: { kind: "domain_projection", domain } } : {}),
                    work_views_v1: views,
                }],
            },
        });
        const rows = [
            { id: BILLING_DEPT, is_active: true, metadata: metadata("billing_bp", "billing", [{ id: "payments_due_view", label: "Payments due", projection_key: "payments_due", display_order: 1 }]) },
            { id: ASSIGN_DEPT, is_active: true, metadata: metadata("enrollment", null, []) },
        ];
        const builder: Record<string, unknown> = {
            select: () => builder,
            eq: () => builder,
            then: (resolve: (v: unknown) => void) => Promise.resolve({ data: rows, error: null }).then(resolve),
        };
        const supabase = { from: () => builder } as never;
        const cfg = await loadSearchProcessConfiguration(supabase, ORG, {
            departmentScope: "all", allowedDepartmentIds: null, siteScope: "all", allowedSiteLocationIds: null,
        } as never);
        expect(cfg.byKey.get("billing_bp")?.projection_domain).toBe("billing");
        expect(cfg.byKey.get("billing_bp")?.work_views.map((v) => (v as { projection_key?: string }).projection_key)).toEqual(["payments_due"]);
        expect(cfg.byKey.get("enrollment")?.projection_domain).toBeNull();
    });
});
