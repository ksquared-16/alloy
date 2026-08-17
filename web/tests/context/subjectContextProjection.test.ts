/**
 * ONE SUBJECT-CONTEXT AUTHORITY.
 *
 * The property that matters is not "contexts are produced" — it is that Search and the durable
 * record host produce the SAME contexts, because they call the same assembly. The failure this
 * guards against is silent by construction: two independently-correct projections that disagree
 * about which Work View holds a child, with no error on either side.
 *
 * So the assertions are about the ADDRESSING axes a configured surface is later resolved against
 * (`key`, `stage_key`, `operational_memberships`), not about the operator-facing sentence — a label
 * is renameable and can never be the thing a card resolves on.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/search/searchOperationalMemberships", () => ({
    resolveOperationalMemberships: (params: {
        subject: { grain: string; stageKey: string | null; memberRowId: string | null };
    }) =>
        params.subject.stageKey === "waitlist"
            ? [
                  {
                      processKey: "enrollment",
                      processLabel: "Enrollment",
                      workViewId: "view-waitlist",
                      workViewLabel: "Waitlist",
                      rowGrain: params.subject.grain,
                      operationalMemberId: params.subject.memberRowId ?? "",
                      membershipReason: "stage",
                  },
              ]
            : [],
}));

import {
    buildSubjectEmploymentContext,
    buildSubjectProcessContexts,
    buildSubjectScheduleContext,
    type SubjectProcessRow,
} from "@/lib/context/buildSubjectContexts";
import { stageWorkViewCacheKey } from "@/lib/workUnits/hostWorkUnitResolver";
import type {
    SearchConfiguredProcess,
    SearchProcessConfiguration,
} from "@/lib/search/searchProcessConfiguration";
import type { PersonEmploymentComposition } from "@/lib/employment/buildPersonEmploymentComposition";

const CASE_ID = "opp-kurzman";
const PARTICIPATION_ID = "pi-lennon-enrollment";

function processRow(overrides: Partial<SubjectProcessRow> = {}): SubjectProcessRow {
    return {
        id: PARTICIPATION_ID,
        subject_id: "cm-lennon",
        process_key: "enrollment",
        stage_key: "waitlist",
        state: "in_process",
        location_id: "loc-bend",
        context_type: "opportunity",
        context_id: CASE_ID,
        ...overrides,
    };
}

/**
 * ANNOTATED, never cast.
 *
 * `as unknown as SearchProcessConfiguration` is unfalsifiable: it compiles against a fixture missing
 * `stage_labels`, and the omission surfaces as a runtime TypeError inside `resolveProcessDetail`
 * rather than as a type error here. Annotation makes the fixture answer to the contract.
 */
function configuredProcess(
    overrides: Partial<SearchConfiguredProcess> = {},
): SearchConfiguredProcess {
    return {
        key: "enrollment",
        label: "Enrollment",
        department_id: "dept-1",
        stage_labels: { waitlist: "Waitlist", tour: "Tour" },
        operator_has_access: true,
        work_views: [],
        stages: [],
        ...overrides,
    };
}

const CONFIG: SearchProcessConfiguration = {
    byKey: new Map([["enrollment", configuredProcess()]]),
    vocabulary: [],
};

function build(rows: SubjectProcessRow[], grain: "child" | "family" = "child") {
    const processBySubject = new Map<string, SubjectProcessRow[]>();
    for (const row of rows) {
        processBySubject.set(row.subject_id, [...(processBySubject.get(row.subject_id) ?? []), row]);
    }
    return buildSubjectProcessContexts({
        grain,
        subjectKeys: ["cm-lennon", "person-lennon"],
        processBySubject,
        processConfig: CONFIG,
        hostWorkUnitKeys: new Map([[CASE_ID, "enrollment-pipeline"]]),
        stageWorkViewTargets: new Map([
            [stageWorkViewCacheKey(CASE_ID, "waitlist"), "view-waitlist"],
        ]),
        familyMembershipRows: new Map(),
        locationId: null,
    });
}

describe("subject context projection — the one authority", () => {
    it("carries the raw addressing axes, not just the operator sentence", () => {
        const { contexts } = build([processRow()]);
        expect(contexts).toHaveLength(1);
        const enrollment = contexts[0]!;

        // The axes a configured surface variant is resolved against.
        expect(enrollment.kind).toBe("process");
        expect(enrollment.key).toBe("enrollment");
        expect(enrollment.stage_key).toBe("waitlist");
        expect(enrollment.state).toBe("in_process");
        // …and the operational addressing that stays SEPARATE from them.
        expect(enrollment.destination_entity_id).toBe(CASE_ID);
        expect(enrollment.destination_work_unit_key).toBe("enrollment-pipeline");
        expect(enrollment.destination_work_view_id).toBe("view-waitlist");
    });

    it("selects the PARTICIPATION as the child-grain row identity, never the case or the child", () => {
        const { contexts } = build([processRow()]);
        const membership = contexts[0]!.operational_memberships?.[0];
        expect(membership?.work_view_id).toBe("view-waitlist");
        // The row is the participation. The case is carried separately as the host.
        expect(membership?.operational_member_id).toBe(PARTICIPATION_ID);
        expect(membership?.host_entity_id).toBe(CASE_ID);
        expect(membership?.host_work_unit_key).toBe("enrollment-pipeline");
    });

    it("resolves the stage→work-view map through the canonical cache key", () => {
        // A restated key would compile and silently answer null forever. Prove the real one is used
        // by feeding a map built ONLY with the canonical helper.
        const { contexts } = build([processRow()]);
        expect(contexts[0]!.destination_work_view_id).toBe("view-waitlist");
    });

    it("is one context per PROCESS even when a child holds two participations in it", () => {
        const { contexts } = build([
            processRow(),
            processRow({ id: "pi-second-lead", stage_key: "tour" }),
        ]);
        expect(contexts.map((c) => c.key)).toEqual(["enrollment"]);
    });

    it("omits a process the operator may not reach — configuration can only remove", () => {
        const denied: SearchProcessConfiguration = {
            byKey: new Map([
                ["enrollment", configuredProcess({ operator_has_access: false })],
            ]),
            vocabulary: [],
        };
        const processBySubject = new Map([["cm-lennon", [processRow()]]]);
        const { contexts } = buildSubjectProcessContexts({
            grain: "child",
            subjectKeys: ["cm-lennon"],
            processBySubject,
            processConfig: denied,
            hostWorkUnitKeys: new Map(),
            stageWorkViewTargets: new Map(),
            familyMembershipRows: new Map(),
            locationId: null,
        });
        expect(contexts).toEqual([]);
    });

    it("lets a participation supply the first location without overriding a known one", () => {
        expect(build([processRow()]).locationId).toBe("loc-bend");
        const processBySubject = new Map([["cm-lennon", [processRow()]]]);
        const known = buildSubjectProcessContexts({
            grain: "child",
            subjectKeys: ["cm-lennon"],
            processBySubject,
            processConfig: CONFIG,
            hostWorkUnitKeys: new Map(),
            stageWorkViewTargets: new Map(),
            familyMembershipRows: new Map(),
            locationId: "loc-already-known",
        });
        expect(known.locationId).toBe("loc-already-known");
    });

    it("produces a schedule context only when a configured pattern label exists", () => {
        expect(buildSubjectScheduleContext(null, null)).toBeNull();
        const schedule = buildSubjectScheduleContext(
            { pattern_label: "Mon / Wed / Fri", site_location_id: "loc-bend" },
            "Bend Campus",
        );
        expect(schedule).toMatchObject({
            kind: "schedule",
            key: "schedule",
            detail: "Mon / Wed / Fri",
            secondary: "Bend Campus",
        });
    });
});

describe("employment context", () => {
    function composition(overrides: Partial<PersonEmploymentComposition> = {}): PersonEmploymentComposition {
        return {
            is_staff: true,
            current: {
                id: "emp-1",
                status: "active",
                state_label: "Active",
                is_open: true,
                position_label: "Lead Teacher",
                employment_type: "full_time",
                employment_type_label: "Full time",
                primary_location_id: "loc-bend",
                primary_location_label: "Bend Campus",
                external_employee_id: null,
                start_date: "2026-01-05",
                end_date: null,
            },
            periods: [],
            configured_facts: [],
            never_employed: false,
            ...overrides,
        } as PersonEmploymentComposition;
    }

    it("is absent for someone who does not work here — 'no relationship' is not a context", () => {
        expect(buildSubjectEmploymentContext(null, "person-jane")).toBeNull();
        expect(
            buildSubjectEmploymentContext(
                composition({ is_staff: false, current: null, never_employed: true }),
                "person-jane",
            ),
        ).toBeNull();
    });

    it("phrases the canonical composition and carries NO work view", () => {
        const context = buildSubjectEmploymentContext(composition(), "person-jane");
        expect(context).toMatchObject({
            kind: "employment",
            key: "employment",
            label: "Employment",
            detail: "Lead Teacher · Active",
            secondary: "Bend Campus",
            destination_entity_type: "persons",
            destination_entity_id: "person-jane",
        });
        // Employment is a standing, not a queue position. Inventing a lens here would offer a
        // destination that cannot compose.
        expect(context?.destination_work_unit_key).toBeNull();
        expect(context?.destination_work_view_id).toBeNull();
        expect(context?.operational_memberships).toBeNull();
    });
});
