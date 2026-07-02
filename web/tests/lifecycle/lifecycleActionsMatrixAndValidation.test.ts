import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    LIFECYCLE_ACTIONS_MATRIX_BASE_ACTION_ORDER,
    buildLifecycleActionsMatrixRows,
} from "@/lib/lifecycle/lifecycleActionsMatrix";
import { buildLifecycleConfiguredActionRows } from "@/lib/lifecycle/lifecycleConfiguredActionRows";
import { lifecycleActivationBaseActions } from "@/lib/lifecycle/lifecycleStageBaseActions";
import { lifecycleWorkspaceTileDescription } from "@/lib/lifecycle/lifecycleBuilderConfig";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycle actions matrix and validation cleanup", () => {
    it("guided board does not render actions step", () => {
        const guided = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(guided).not.toContain('stepId="actions"');
        expect(guided).not.toContain("LifecycleBuilderActionsCard");
        expect(guided).toContain("Statuses included in this stage");
    });

    it("lifecycle actions matrix section and API exist", () => {
        expect(read("components/adminV2/settings/lifecycle/LifecycleActionsMatrix.tsx")).toContain(
            "data-testid=\"lifecycle-actions-matrix\""
        );
        expect(read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx")).toContain(
            "LifecycleActionsMatrix"
        );
        expect(read("app/api/admin/departments/[departmentId]/lifecycle-actions-matrix/route.ts")).toContain(
            "saveLifecycleActionsMatrix"
        );
    });

    it("matrix base action order includes eight curated actions", () => {
        expect(LIFECYCLE_ACTIONS_MATRIX_BASE_ACTION_ORDER).toEqual([
            "create_record",
            "quick_message",
            "change_status",
            "add_person",
            "add_child",
            "send_form",
            "schedule_tour",
            "create_task",
        ]);
    });

    it("configured actions default empty for new lifecycle", () => {
        const rows = buildLifecycleActionsMatrixRows({
            baseActions: lifecycleActivationBaseActions("Lead"),
            configured: buildLifecycleConfiguredActionRows([]),
            placementSurfaceSlots: new Map(),
        });
        expect(rows.every((r) => !r.enabled)).toBe(true);
        expect(rows.every((r) => r.placement_ids.length === 0)).toBe(true);
    });

    it("runtime validation treats actions as optional", () => {
        const v = read("lib/lifecycle/validateLifecycleActivationRuntime.ts");
        expect(v).toContain("Optional: no actions configured yet");
        expect(v).toContain("loadLifecycleBuilderConfiguredActions");
        expect(v).not.toContain("Add an action in the Actions step");
    });

    it("status save reloads pipeline after continue", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("await loadPipeline(runtimeDepartmentId)");
        expect(board).toContain("confirmStatusesAndContinue");
    });

    it("status-stages route syncs queue on PATCH", () => {
        expect(read("app/api/admin/enrollment-process/status-stages/route.ts")).toContain(
            "syncDepartmentQueueForStage"
        );
    });

    it("validation UI offers repair queue filters", () => {
        expect(read("components/adminV2/settings/lifecycle/LifecycleActivationValidation.tsx")).toContain(
            "lifecycle-activation-repair-queue-filters"
        );
    });

    it("workspace tile uses lifecycle description helper", () => {
        expect(lifecycleWorkspaceTileDescription("Custom copy", "Enrollment")).toBe("Custom copy");
        expect(lifecycleWorkspaceTileDescription("", "Enrollment")).toBe("Enrollment");
        expect(lifecycleWorkspaceTileDescription(null, "")).toBe("Configured lifecycle workspace.");
        expect(read("lib/lifecycle/clientCreateLifecycleViaBuilder.ts")).toContain(
            "lifecycleWorkspaceTileDescription"
        );
    });

    it("statuses step removed verbose helper copy", () => {
        const step = read("components/adminV2/settings/lifecycle/LifecycleActivationStatusesStep.tsx");
        expect(step).not.toContain("Select at least one opportunity status");
        expect(step).not.toContain("Work Unit Queue uses these filters");
    });

    it("desired start audit doc exists", () => {
        expect(
            readFileSync(
                resolve(root, "../docs/sprints/06_2026/desired_start_field_audit.md"),
                "utf8"
            )
        ).toContain("child:start_date");
    });
});
