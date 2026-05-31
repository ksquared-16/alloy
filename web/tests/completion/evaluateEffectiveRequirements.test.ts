import { describe, expect, it } from "vitest";
import { evaluateEffectiveRequirements } from "@/lib/completion/evaluateEffectiveRequirements";
import { evaluateLifecycleActionRequirements } from "@/lib/completion/lifecycleActionRequirementCatalog";
import { autoPopulateForLifecycleAction } from "@/lib/completion/lifecycleActionRequirementCatalog";
import { evaluatePersonCompletionRequirements } from "@/lib/completion/evaluatePersonCompletionRequirements";
import { classifyActionRuntimeState } from "@/lib/admin/actions/actionRuntimeState";
import { enrichOperationalRecommendationWithActionPreflight } from "@/lib/adminV2/bos/recommendations/preflight/enrichOperationalRecommendationPreflight";
import type { OperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations/types";
import { buildCompletionContextFromRecord } from "@/lib/completion/evaluateCompletionRequirements";
import { APPROVE_ENROLLMENT_ACTION_KEY } from "@/lib/admin/actions/enrollmentApprovalConstants";

function oppRecord(overrides: Record<string, unknown> = {}) {
    return {
        id: "opp-1",
        org_id: "org-1",
        status_key: "enrolling",
        primary_person_id: "person-parent",
        location_id: "loc-1",
        desired_program_type: "infant",
        metadata: {},
        _inquiry_children: [
            {
                id: "ocm-1",
                person_id: "person-child",
                first_name: "Kid",
                last_name: "One",
                desired_program_type: "infant",
                program_room_cohort_key: "room-a",
                desired_schedule_type: "full_day",
                desired_start_date: "2026-06-15",
            },
        ],
        ...overrides,
    };
}

describe("evaluateEffectiveRequirements — approve_enrollment", () => {
    it("blocks when classroom is missing", () => {
        const record = oppRecord({
            _inquiry_children: [
                {
                    id: "ocm-1",
                    person_id: "person-child",
                    desired_program_type: "infant",
                    program_room_cohort_key: "",
                    desired_schedule_type: "full_day",
                    desired_start_date: "2026-06-15",
                },
            ],
        });
        const result = evaluateEffectiveRequirements({
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: APPROVE_ENROLLMENT_ACTION_KEY,
            trigger: "action_execute",
            record,
        });
        expect(result.ok).toBe(false);
        expect(result.blocking.some((v) => v.field_key === "program_room_cohort_key")).toBe(true);
        expect(result.sourceSummary.actionRules).toBeGreaterThan(0);
    });

    it("succeeds when required placement fields exist", () => {
        const result = evaluateEffectiveRequirements({
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: APPROVE_ENROLLMENT_ACTION_KEY,
            trigger: "action_execute",
            record: oppRecord(),
        });
        expect(result.ok).toBe(true);
        expect(result.autoPopulate.some((a) => a.metadata_key === "enrollment_date")).toBe(true);
    });
});

describe("evaluateEffectiveRequirements — move_to_waitlist", () => {
    it("blocks without child program", () => {
        const result = evaluateEffectiveRequirements({
            entity_type: "opportunity",
            entity_id: "opp-1",
            action_key: "move_to_waitlist",
            trigger: "action_execute",
            record: oppRecord({ _inquiry_children: [{ id: "ocm-1" }] }),
        });
        expect(result.ok).toBe(false);
        expect(result.blocking.some((v) => v.field_key === "inquiry_children" || v.field_key === "desired_program_type")).toBe(
            true
        );
    });

    it("auto-populates waitlist_date instruction", () => {
        const auto = autoPopulateForLifecycleAction("move_to_waitlist", { opportunityId: "opp-1" });
        expect(auto[0]?.metadata_key).toBe("waitlist_date");
    });
});

describe("record_tour_outcome", () => {
    it("blocks without outcome", () => {
        const ctx = buildCompletionContextFromRecord({
            entity_type: "opportunity",
            entity_id: "opp-1",
            phase: "action",
            record: oppRecord(),
            action_key: "record_tour_outcome",
        });
        const r = evaluateLifecycleActionRequirements(ctx, {});
        expect(r.ok).toBe(false);
        expect(r.blocking[0]?.field_key).toBe("outcome");
    });

    it("auto-populates tour_completed_date when completed", () => {
        const auto = autoPopulateForLifecycleAction("record_tour_outcome", {
            opportunityId: "opp-1",
            payload: { outcome: "completed" },
        });
        expect(auto[0]?.metadata_key).toBe("tour_completed_date");
    });
});

describe("employee family conditional", () => {
    it("recommends employee_id when is_employee without id", () => {
        const r = evaluatePersonCompletionRequirements({
            phase: "save",
            entity_type: "person",
            entity_id: "person-1",
            values: { first_name: "Pat", last_name: "Lee", is_employee: true, employee_id: "" },
            related: { customer_persons: [{ role_type: "parent" }] },
        });
        expect(r.ok).toBe(true);
        expect(r.recommendations.some((v) => v.field_key === "employee_id")).toBe(true);
    });
});

describe("action runtime state", () => {
    it("classifies visible blocked vs executable", () => {
        expect(
            classifyActionRuntimeState({
                action: { key: "approve_enrollment" } as never,
                placed: true,
                validForContext: true,
                preflight: { ok: false, blocking: [{ field_key: "x", label: "Classroom", severity: "required", reason: "", source: "action" }], recommended: [], autoPopulate: [], sourceSummary: { layoutRules: 0, actionRules: 1, transitionRules: 0, completionRules: 0 } },
            })
        ).toBe("visible_blocked");
        expect(
            classifyActionRuntimeState({
                action: { key: "approve_enrollment" } as never,
                placed: true,
                validForContext: true,
                preflight: { ok: true, blocking: [], recommended: [], autoPopulate: [], sourceSummary: { layoutRules: 0, actionRules: 0, transitionRules: 0, completionRules: 0 } },
            })
        ).toBe("visible_executable");
    });
});

describe("BOS preflight attachment", () => {
    it("uses same engine for recommended action", () => {
        const rec = {
            version: 1,
            recommended_action: { key: "approve_enrollment", label: "Approve Enrollment", action_family: "workflow" },
        } as unknown as OperationalRecommendationV1;
        const enriched = enrichOperationalRecommendationWithActionPreflight(rec, oppRecord({
            _inquiry_children: [{ id: "ocm-1", desired_program_type: "infant" }],
        }));
        expect(enriched.recommended_action_preflight?.executable).toBe(false);
        expect(enriched.recommended_action_preflight?.preflight.ok).toBe(false);
        expect(enriched.recommended_action_preflight?.preflight.blocking_labels.length).toBeGreaterThan(0);
    });
});
