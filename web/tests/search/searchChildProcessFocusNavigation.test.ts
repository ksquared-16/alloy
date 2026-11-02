import { describe, expect, it } from "vitest";

import {
    buildSubjectProcessContexts,
    childFamilyFallbackCaseIds,
    type SubjectProcessRow,
} from "@/lib/context/buildSubjectContexts";
import { operatorWorkUnitHrefFromWorkViewSlug } from "@/lib/admin/canonicalOperatorRoutes";
import { historyProjectionMode } from "@/lib/experience/surfaceHost/historyProjectionMode";
import { operatorFocusSelectionFromDestination } from "@/lib/runtime/focus/operatorFocusSelection";
import { SEARCH_CARD_KEYS, resolveSearchDestinations } from "@/lib/search/searchDestinations";
import { processOffersChildGrainAt } from "@/lib/search/searchOperationalMemberships";
import type { SearchSubject } from "@/lib/search/searchContracts";
import type {
    SearchConfiguredProcess,
    SearchProcessConfiguration,
} from "@/lib/search/searchProcessConfiguration";

/**
 * SELECTING A CHILD'S BUSINESS PROCESS OPENS THAT PROCESS — NOT THE CHILD CARD.
 *
 * The reported defect: Search → a child → "Enrollment" brought up the Children card with the child
 * selected. The operator chose the PROCESS. These pin, end to end through the shared builder and
 * resolver (the same pair the durable record's `Go to` and the Children card's "X's work" use):
 *
 *   child grain    → the process card, on the child's own participation row
 *   no child grain → the child's OWN case, evaluated at family grain — never the first family
 *   two cases      → no process destination at all; the record still opens
 *   plain child    → still the child's record
 *
 * Billing and Assignments are modelled here as configured processes with the grains the catalog
 * declares for them (Billing household-only; Assignments child-grain). The destination contract is
 * the thing under test: whichever producer supplies their memberships, the same resolver must turn
 * them into the same process destination.
 */

const CASE = "opp-kurzman";
const OTHER_CASE = "opp-other";
const UNIT = "enrollment_pipeline";
const CHILD = "cm-lennon";
const PARTICIPATION = "pi-lennon-enrollment";

const childStage = (key: string, sort_order: number) => ({
    key,
    label: key,
    grain: "child",
    is_active: true,
    sort_order,
    stage_operating_plan_v1: {
        journey_segment: "child",
        work_templates: [{ template_key: `${key}_work`, label: "Work", primary: true, required: false }],
    },
});
const STAGES = [childStage("waitlist", 1), childStage("enrolling", 2)];

const WAITLIST_CHILD_VIEW = {
    id: "waitlist_view",
    label: "Waitlist",
    filters_v1: [{ field_key: "opportunity_stage", operator: "is_any_of", value: ["waitlist"] }],
    display_order: 1,
    visible_in_runtime: true,
};
const ALL_CHILDREN_VIEW = {
    id: "all_children",
    label: "All Children",
    row_grain_v1: "child",
    display_order: 2,
    visible_in_runtime: true,
};
const ALL_FAMILIES_VIEW = { id: "all_work", label: "All", display_order: 3, visible_in_runtime: true };
const TOURS_VIEW = {
    id: "tours",
    label: "Tours",
    row_grain_v1: "family",
    filters_v1: [{ field_key: "has_active_tour", operator: "equals", value: true }],
    display_order: 4,
    visible_in_runtime: true,
};

function configured(key: string, label: string, work_views: unknown[], over: Partial<SearchConfiguredProcess> = {}) {
    return {
        key,
        label,
        department_id: `dept-${key}`,
        stage_labels: { waitlist: "Waitlist", enrolling: "Enrolling" },
        operator_has_access: true,
        work_views,
        stages: STAGES,
        ...over,
    } as SearchConfiguredProcess;
}

const ENROLLMENT = configured("enrollment", "Enrollment", [WAITLIST_CHILD_VIEW, ALL_FAMILIES_VIEW]);
/** Household-grain only — the Billing catalog declares no child grain. */
const BILLING = configured("billing", "Billing", [ALL_FAMILIES_VIEW, TOURS_VIEW]);
/** Child-grain — Assignments projections row at the child. */
const ASSIGNMENTS = configured("assignments", "Assignments", [ALL_CHILDREN_VIEW, ALL_FAMILIES_VIEW]);

const config = (...processes: SearchConfiguredProcess[]): SearchProcessConfiguration => ({
    byKey: new Map(processes.map((p) => [p.key, p])),
    vocabulary: processes.map((p) => ({ key: p.key, label: p.label })),
});

const row = (process_key: string, over: Partial<SubjectProcessRow> = {}): SubjectProcessRow => ({
    id: `pi-lennon-${process_key}`,
    subject_id: CHILD,
    process_key,
    stage_key: "waitlist",
    state: "active",
    location_id: null,
    context_type: "opportunity",
    context_id: CASE,
    ...over,
});

/** The case as the queue materializes it — EPP keys, not raw columns. */
const caseRow = (over: Record<string, unknown> = {}) => ({
    id: CASE,
    stage_key: "waitlist",
    _effective_participant_stage_keys: ["waitlist"],
    ...over,
});

const lennon: SearchSubject = {
    kind: "child",
    id: CHILD,
    display_name: "Lennon Kurzman",
    person_id: "p-lennon",
    household_id: "cust-kurzman",
};

function contextsFor(
    rows: SubjectProcessRow[],
    processConfig: SearchProcessConfiguration,
    familyMembershipRows = new Map<string, Record<string, unknown>>([[CASE, caseRow()]]),
) {
    return buildSubjectProcessContexts({
        grain: "child",
        subjectKeys: [CHILD],
        processBySubject: new Map([[CHILD, rows]]),
        processConfig,
        hostWorkUnitKeys: new Map([
            [CASE, UNIT],
            [OTHER_CASE, UNIT],
        ]),
        stageWorkViewTargets: new Map(),
        familyMembershipRows,
        locationId: null,
    }).contexts;
}

const destinationsFor = (...args: Parameters<typeof contextsFor>) =>
    resolveSearchDestinations({ subject: lennon, contexts: contextsFor(...args), promotedKeys: [] });

const processDestinations = (ds: ReturnType<typeof destinationsFor>, processKey: string) =>
    ds.filter((d) => d.context_key === processKey && d.target === "focus_panel");

describe("Enrollment — a child-grain process opens ITS focus panel", () => {
    const destinations = destinationsFor(
        [row("enrollment", { id: PARTICIPATION })],
        config(ENROLLMENT),
    );
    const waitlist = destinations.find((d) => d.key === "work_view:enrollment:waitlist_view")!;

    it("targets the PROCESS card, never the Children card", () => {
        expect(waitlist).toBeTruthy();
        expect(waitlist.card_key).toBe(SEARCH_CARD_KEYS.currentWork);
        expect(waitlist.card_key).not.toBe(SEARCH_CARD_KEYS.children);
        expect(waitlist.context_key).toBe("enrollment");
    });

    it("selects the child's OWN participation row inside the process's Work View", () => {
        expect(waitlist.host_work_view_id).toBe("waitlist_view");
        expect(waitlist.host_entity_id).toBe(CASE);
        expect(waitlist.operational_member_id).toBe(PARTICIPATION);
    });

    it("the ONE destination → selection mapping carries the process card through unchanged", () => {
        const selection = operatorFocusSelectionFromDestination(waitlist)!;
        expect(selection.card_focus).toEqual({
            card_key: SEARCH_CARD_KEYS.currentWork,
            item_id: CHILD,
            context_key: "enrollment",
        });
        expect(selection.operational_member_id).toBe(PARTICIPATION);
        expect(selection.host_work_view_id).toBe("waitlist_view");
    });

    it("a child-grain process never offers the child a FAMILY lens, even with its case row loaded", () => {
        expect(destinations.map((d) => d.key)).not.toContain("work_view:enrollment:all_work");
    });

    it("PLAIN child selection still opens the child's record, not a process", () => {
        const primary = destinations.find((d) => d.primary)!;
        expect(primary.target).toBe("durable_record");
        expect(primary.subject_type).toBe("child");
        expect(primary.subject_id).toBe(CHILD);
        expect(primary.card_key ?? null).toBeNull();
        expect(primary.host_work_view_id ?? null).toBeNull();
    });
});

describe("Assignments — child grain wins where the process has it", () => {
    it("opens the Assignments process on the child's row, not the family catch-all", () => {
        const ds = processDestinations(destinationsFor([row("assignments")], config(ASSIGNMENTS)), "assignments");
        expect(ds.map((d) => d.key)).toEqual(["work_view:assignments:all_children"]);
        expect(ds[0].card_key).toBe(SEARCH_CARD_KEYS.currentWork);
        expect(ds[0].operational_member_id).toBe("pi-lennon-assignments");
    });
});

describe("Billing — no child grain ⇒ the child's OWN family-grain participation", () => {
    const ds = processDestinations(destinationsFor([row("billing")], config(BILLING)), "billing");

    it("falls back to the child's own case, selected as the FAMILY row", () => {
        expect(ds.map((d) => d.key)).toEqual(["work_view:billing:all_work"]);
        const [all] = ds;
        expect(all.card_key).toBe(SEARCH_CARD_KEYS.currentWork);
        expect(all.host_entity_id).toBe(CASE);
        // A family lens rows at the case — the member IS the case, never the child's participation.
        expect(all.operational_member_id).toBe(CASE);
        expect(all.host_work_unit_key).toBe(UNIT);
    });

    it("evaluates the family predicates truthfully — a cohort the case is not in is not offered", () => {
        expect(ds.map((d) => d.key)).not.toContain("work_view:billing:tours");
        const withTour = processDestinations(
            destinationsFor([row("billing")], config(BILLING), new Map([[CASE, caseRow({ has_active_tour: true })]])),
            "billing",
        );
        expect(withTour.map((d) => d.key)).toContain("work_view:billing:tours");
    });

    it("STALE membership — the case left the only cohort — offers no cohort", () => {
        const toursOnly = configured("billing", "Billing", [TOURS_VIEW]);
        const ds2 = destinationsFor(
            [row("billing")],
            config(toursOnly),
            new Map([[CASE, caseRow({ has_active_tour: false })]]),
        );
        expect(ds2.some((d) => d.key.startsWith("work_view:billing:"))).toBe(false);
    });

    it("CROSS-ORG / unloaded case — no materialized row ⇒ no family membership is claimed", () => {
        // The case loader is org-scoped: another organization's case never loads, so its absence here
        // is the cross-org shape. Unproven is not true.
        const ds2 = destinationsFor([row("billing")], config(BILLING), new Map());
        expect(ds2.some((d) => d.key.startsWith("work_view:billing:"))).toBe(false);
    });

    it("never borrows ANOTHER process's case or cohort", () => {
        const ds2 = destinationsFor(
            [row("enrollment", { id: PARTICIPATION }), row("billing", { context_id: OTHER_CASE })],
            config(ENROLLMENT, BILLING),
            new Map([[CASE, caseRow()]]),
        );
        // Billing's case is OTHER_CASE and it did not load — Enrollment's case must not stand in.
        expect(ds2.some((d) => d.key.startsWith("work_view:billing:"))).toBe(false);
        expect(ds2.find((d) => d.key === "work_view:enrollment:waitlist_view")).toBeTruthy();
    });
});

describe("ambiguous or unauthorized participation is explicit and non-leaking", () => {
    it("two cases in one process ⇒ no process destination, no cohort, and the record still opens", () => {
        const contexts = contextsFor(
            [row("billing"), row("billing", { id: "pi-lennon-billing-2", context_id: OTHER_CASE })],
            config(BILLING),
            new Map([
                [CASE, caseRow()],
                [OTHER_CASE, caseRow({ id: OTHER_CASE })],
            ]),
        );
        const billing = contexts.find((c) => c.key === "billing")!;
        expect(billing.participation_ambiguous).toBe(true);
        expect(billing.operational_memberships).toEqual([]);

        const ds = resolveSearchDestinations({ subject: lennon, contexts, promotedKeys: [] });
        expect(processDestinations(ds, "billing")).toEqual([]);
        expect(ds.find((d) => d.primary)?.target).toBe("durable_record");
    });

    it("ambiguity also withholds a CHILD-grain cohort the first row would have chosen", () => {
        const contexts = contextsFor(
            [row("enrollment", { id: PARTICIPATION }), row("enrollment", { id: "pi-2", context_id: OTHER_CASE })],
            config(ENROLLMENT),
        );
        const ds = resolveSearchDestinations({ subject: lennon, contexts, promotedKeys: [] });
        expect(processDestinations(ds, "enrollment")).toEqual([]);
    });

    it("a process the operator cannot reach yields no context and no destination at any grain", () => {
        const hidden = configured("billing", "Billing", [ALL_FAMILIES_VIEW], { operator_has_access: false });
        const ds = destinationsFor([row("billing")], config(hidden));
        expect(ds.some((d) => d.context_key === "billing")).toBe(false);
        expect(processOffersChildGrainAt(hidden, "waitlist")).toBe(false);
    });
});

describe("the family rows a child's fallback reads are paid for only where they are needed", () => {
    it("names the case of a no-child-grain process, and nothing for a child-grain one", () => {
        expect(
            childFamilyFallbackCaseIds({
                processRows: [row("enrollment"), row("billing", { context_id: OTHER_CASE })],
                processConfig: config(ENROLLMENT, BILLING),
            }),
        ).toEqual([OTHER_CASE]);
    });

    it("skips processes the operator cannot reach", () => {
        const hidden = configured("billing", "Billing", [ALL_FAMILIES_VIEW], { operator_has_access: false });
        expect(childFamilyFallbackCaseIds({ processRows: [row("billing")], processConfig: config(hidden) })).toEqual([]);
    });

    it("follows a participation-anchored journey to its case", () => {
        expect(
            childFamilyFallbackCaseIds({
                processRows: [row("billing", { context_id: "pi-anchor", context_type: "process_instance" })],
                processConfig: config(BILLING),
                opportunityIdByContextId: new Map([["pi-anchor", CASE]]),
            }),
        ).toEqual([CASE]);
    });
});

describe("back navigation returns from the process to where the operator was", () => {
    it("moving to the process's Work View is a SURFACE exchange, so it pushes a history entry", () => {
        const waitlist = destinationsFor([row("enrollment", { id: PARTICIPATION })], config(ENROLLMENT)).find(
            (d) => d.key === "work_view:enrollment:waitlist_view",
        )!;
        const selection = operatorFocusSelectionFromDestination(waitlist)!;
        const projectedPath = operatorWorkUnitHrefFromWorkViewSlug(selection.host_work_view_id!);
        expect(
            historyProjectionMode({
                projectedPath,
                currentPath: "/workspace/roster",
                lastProjectedPath: "/workspace/roster",
            }),
        ).toBe("push");
    });
});
