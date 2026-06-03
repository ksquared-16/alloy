import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    canConfirmStatusesStep,
    canContinueToWorkUnitQueue,
    collectAllOpportunityStatusRows,
    shouldSyncStatusDraftFromServer,
    stageSavedStatusKeys,
    statusKeySetsEqual,
} from "@/lib/lifecycle/lifecycleActivationStep3";
import { buildEnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import { configuredStageKeysForMetadata, isConfiguredStageKey } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

const samplePayload: EnrollmentStatusStagesPayload = {
    entity_type: "opportunities",
    stage_keys: ["lead"],
    unassigned: [{ status_key: "new", status_label: "New", sort_order: 1, assignment_source: "unassigned", has_metadata_override: false }],
    stages: {
        lead: {
            statuses: [
                { status_key: "contacted", status_label: "Contacted", sort_order: 2, assignment_source: "metadata", has_metadata_override: true },
            ],
            has_custom_assignments: true,
        },
    },
};

describe("lifecycleActivationStep3 helpers", () => {
    it("collectAllOpportunityStatusRows dedupes pool", () => {
        const rows = collectAllOpportunityStatusRows(samplePayload);
        expect(rows.map((r) => r.status_key).sort()).toEqual(["contacted", "new"]);
    });

    it("stageSavedStatusKeys reads stage bucket", () => {
        expect(stageSavedStatusKeys(samplePayload, "lead")).toEqual(["contacted"]);
        expect(stageSavedStatusKeys(samplePayload, "missing")).toEqual([]);
    });

    it("canConfirmStatusesStep requires selection, not prior save", () => {
        expect(
            canConfirmStatusesStep({
                statusesLoading: false,
                statusesSaving: false,
                draftCount: 2,
            })
        ).toBe(true);
        expect(
            canConfirmStatusesStep({
                statusesLoading: false,
                statusesSaving: false,
                draftCount: 0,
            })
        ).toBe(false);
        expect(
            canConfirmStatusesStep({
                statusesLoading: true,
                statusesSaving: false,
                draftCount: 2,
            })
        ).toBe(false);
    });

    it("canContinueToWorkUnitQueue blocks loading, saving, empty, and dirty", () => {
        expect(
            canContinueToWorkUnitQueue({
                statusesLoading: true,
                statusesSaving: false,
                savedCount: 2,
                draftDirty: false,
            })
        ).toBe(false);
        expect(
            canContinueToWorkUnitQueue({
                statusesLoading: false,
                statusesSaving: true,
                savedCount: 2,
                draftDirty: false,
            })
        ).toBe(false);
        expect(
            canContinueToWorkUnitQueue({
                statusesLoading: false,
                statusesSaving: false,
                savedCount: 0,
                draftDirty: false,
            })
        ).toBe(false);
        expect(
            canContinueToWorkUnitQueue({
                statusesLoading: false,
                statusesSaving: false,
                savedCount: 1,
                draftDirty: true,
            })
        ).toBe(false);
        expect(
            canContinueToWorkUnitQueue({
                statusesLoading: false,
                statusesSaving: false,
                savedCount: 1,
                draftDirty: false,
            })
        ).toBe(true);
    });

    it("statusKeySetsEqual compares sets", () => {
        expect(statusKeySetsEqual(new Set(["a"]), new Set(["a"]))).toBe(true);
        expect(statusKeySetsEqual(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
    });

    it("shouldSyncStatusDraftFromServer preserves dirty draft", () => {
        expect(shouldSyncStatusDraftFromServer({ statusDraftDirty: true })).toBe(false);
        expect(shouldSyncStatusDraftFromServer({ statusDraftDirty: false })).toBe(true);
    });

    it("buildEnrollmentStatusStagesPayload includes custom lifecycle stage keys", () => {
        const payload = buildEnrollmentStatusStagesPayload(
            [
                {
                    status_key: "custom_status",
                    status_label: "Custom",
                    sort_order: 1,
                    metadata: { enrollment_operator_stage: "nurture_lane" },
                },
            ],
            ["lead", "nurture_lane"]
        );
        expect(payload.stage_keys).toEqual(["lead", "nurture_lane"]);
        expect(payload.stages.nurture_lane?.statuses.map((s) => s.status_key)).toEqual(["custom_status"]);
    });

    it("isConfiguredStageKey accepts custom builder stage keys", () => {
        const metadata = {
            lifecycle_builder_v1: {
                version: 1,
                active_process_id: "p1",
                processes: [
                    {
                        id: "p1",
                        key: "enrollment",
                        name: "Enrollment",
                        primary_entity: "opportunity",
                        sort_order: 0,
                        is_active: true,
                        stages: [
                            {
                                id: "s1",
                                key: "nurture_lane",
                                label: "Nurture",
                                sort_order: 0,
                                is_active: true,
                            },
                        ],
                    },
                ],
            },
        };
        expect(configuredStageKeysForMetadata(metadata)).toContain("nurture_lane");
        expect(isConfiguredStageKey(metadata, "nurture_lane")).toBe(true);
    });
});

describe("Lifecycle Activation Step 3 UI", () => {
    it("preloads statuses after lifecycle and stage creation", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("loadStatusStages");
        expect(board).toContain("onLifecycleCreated");
        expect(board).toContain("onStageCreated");
    });

    it("does not use EnrollmentProcessStageStatusesCard in activation", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).not.toContain("EnrollmentProcessStageStatusesCard");
        expect(board).toContain("LifecycleActivationStatusesStep");
    });

    it("Statuses step uses single Save & continue without duplicate save button", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        const step = read("components/adminV2/settings/lifecycle/LifecycleActivationStatusesStep.tsx");
        expect(board).toContain("canConfirmStatusesStep");
        expect(board).toContain("confirmStatusesAndContinue");
        expect(board).toContain("lifecycle-activation-confirm-statuses");
        expect(step).not.toMatch(/lifecycle-activation-statuses-save["']/);
        expect(step).not.toContain("Save statuses");
        expect(step).not.toContain("onSave");
    });

    it("confirm persists statuses then opens work unit step", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("saveStageStatuses");
        expect(board).toContain("loadPipeline(runtimeDepartmentId)");
        expect(board).toContain("setStep(4)");
        expect(board).toContain("stageStatusDisplayLabels");
    });

    it("saveActivation checks PATCH response", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("Failed to save activation bundle");
    });

    it("shows empty state with Create status", () => {
        const step = read("components/adminV2/settings/lifecycle/LifecycleActivationStatusesStep.tsx");
        expect(step).toContain("No statuses exist yet for this record type");
        expect(step).toContain("lifecycle-activation-create-status");
    });

    it("persists status_keys before work unit queue step", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("saveStageStatuses");
        expect(board).toContain("completed_steps: 3");
        expect(board).toContain("commitSaved");
        expect(board).toContain("savedStatusKeys");
    });

    it("statuses card avoids unstable onStagesLoaded in load deps", () => {
        const card = read("components/adminV2/settings/enrollmentProcess/EnrollmentProcessStageStatusesCard.tsx");
        expect(card).toContain("onStagesLoadedRef");
        expect(card).toMatch(/const load = useCallback\(async \(\) => \{[\s\S]*\}, \[departmentId\]\)/);
    });
});
