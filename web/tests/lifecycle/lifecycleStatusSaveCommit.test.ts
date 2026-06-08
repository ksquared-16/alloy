import { describe, expect, it } from "vitest";
import {
    applyLifecycleStatusDraftAction,
    INITIAL_LIFECYCLE_STATUS_DRAFT_STATE,
} from "@/lib/lifecycle/lifecycleStatusDraftReducer";
import {
    resolveAssignedStatusKeysForStage,
    stageSavedStatusKeys,
} from "@/lib/lifecycle/lifecycleActivationStep3";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import { statusDraftKeysForStage } from "@/lib/lifecycle/lifecycleStatusStepDraft";

describe("lifecycleStatusSaveCommit", () => {
    it("commitSaved applies keys while stage is still dirty (post-save)", () => {
        let state = applyLifecycleStatusDraftAction(INITIAL_LIFECYCLE_STATUS_DRAFT_STATE, {
            type: "toggle",
            stageKey: "enrolled",
            statusKey: "active",
            selected: true,
        });
        expect(state.dirtyByStage.enrolled).toBe(true);

        state = applyLifecycleStatusDraftAction(state, {
            type: "commitSaved",
            stageKey: "enrolled",
            keys: ["active"],
        });
        expect(state.dirtyByStage.enrolled).toBeUndefined();
        expect(statusDraftKeysForStage(state.savedByStage, "enrolled")).toEqual(["active"]);
        expect(statusDraftKeysForStage(state.draftByStage, "enrolled")).toEqual(["active"]);
    });

    it("resolveAssignedStatusKeysForStage falls back when explicit bucket is empty", () => {
        const payload: EnrollmentStatusStagesPayload = {
            entity_type: "opportunities",
            stage_keys: ["lead"],
            unassigned: [],
            stages: {
                lead: {
                    has_custom_assignments: false,
                    statuses: [
                        {
                            status_key: "new_inquiry",
                            status_label: "New inquiry",
                            sort_order: 1,
                            assignment_source: "canonical",
                            has_metadata_override: false,
                        },
                    ],
                },
            },
        };
        expect(stageSavedStatusKeys(payload, "lead", { explicitAssignmentsOnly: true })).toEqual([]);
        expect(resolveAssignedStatusKeysForStage(payload, "lead", { activationOwned: true })).toEqual([
            "new_inquiry",
        ]);
    });
});
