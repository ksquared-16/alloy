import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    workspaceTileVisibleForActivation,
    fetchWorkspaceActiveDepartments,
} from "@/lib/lifecycle/validateLifecycleActivationRuntime";
import type { LifecycleActivationV1 } from "@/lib/lifecycle/lifecycleActivationConfig";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

const activation: LifecycleActivationV1 = {
    version: 1,
    lifecycle_name: "Sales Pipeline",
    primary_entity: "opportunity",
    primary_record_label: "Lead",
    process_id: "p1",
    stage_key: "lead",
    stage_label: "Lead",
    work_unit_id: null,
    work_unit_name: null,
    status_keys: [],
    status_labels: [],
    action_definition_id: null,
    action_placement_ids: [],
    activation_owned: true,
    completed_steps: 0,
    updated_at: new Date().toISOString(),
};

describe("workspaceTileVisibleForActivation", () => {
    it("fails when department is not in active workspace list", () => {
        const r = workspaceTileVisibleForActivation([], "dept-1", activation);
        expect(r.pass).toBe(false);
        expect(r.detail).toMatch(/workspace|Lifecycle/i);
    });

    it("fails when tile name does not match lifecycle name", () => {
        const r = workspaceTileVisibleForActivation(
            [{ id: "dept-1", name: "Enrollment", key: "enrollment", is_active: true }],
            "dept-1",
            activation
        );
        expect(r.pass).toBe(false);
        expect(r.detail).toContain("Enrollment");
    });

    it("passes when active tile name matches lifecycle", () => {
        const r = workspaceTileVisibleForActivation(
            [{ id: "dept-1", name: "Sales Pipeline", key: "sales_pipeline", is_active: true }],
            "dept-1",
            activation
        );
        expect(r.pass).toBe(true);
    });
});

describe("fetchWorkspaceActiveDepartments", () => {
    it("is exported for runtime validation", () => {
        expect(typeof fetchWorkspaceActiveDepartments).toBe("function");
    });
});

describe("Lifecycle Activation Runtime Truth UI", () => {
    it("uses consolidated board layout", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        const nav = read("components/adminV2/settings/lifecycle/LifecycleStageNav.tsx");
        expect(board).toContain("lifecycle-builder-board");
        expect(nav).toContain("lifecycle-stage-tabs");
        expect(board).toContain("LifecycleStageConfiguration");
    });

    it("stage configuration uses unified save without wizard step nav", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(board).not.toContain("LifecycleActivationWizardNav");
        expect(workspace).toContain("Save stage");
        expect(board).not.toContain("Continue to Work Unit Queue");
        expect(board).not.toContain("Continue to Add action");
    });

    it("supports delete activation lifecycle", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("lifecycle-activation-delete");
        expect(read("app/api/admin/departments/[departmentId]/lifecycle-activation/route.ts")).toContain(
            "export async function DELETE"
        );
        expect(read("lib/lifecycle/lifecycleActivationOwned.ts")).toContain("deleteActivationLifecycleForDepartment");
    });

    it("queue name starts blank and shows status labels", () => {
        const wu = read("components/adminV2/settings/enrollmentProcess/LifecycleStageWorkUnitCard.tsx");
        expect(wu).toContain("stageStatusDisplayLabels");
        expect(wu).not.toContain("|| `${stageLabel} queue`");
        expect(read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx")).toContain(
            "stageStatusDisplayLabels"
        );
    });

    it("actions matrix renders placement toggles and base actions", () => {
        const matrix = read("components/adminV2/settings/lifecycle/LifecycleActionsMatrix.tsx");
        expect(matrix).toContain("enabled");
        expect(read("lib/lifecycle/lifecycleStageBaseActions.ts")).toContain("create_record");
        expect(read("lib/lifecycle/lifecycleStageBaseActions.ts")).toContain("Create ${leadLabel}");
    });

    it("validation uses rendered tile pipeline (no config-only pass)", () => {
        const validate = read("lib/lifecycle/validateLifecycleActivationRuntime.ts");
        expect(validate).toContain("buildLifecycleCatalog");
        expect(validate).toContain("workspace_rendered_tiles");
        expect(validate).toContain("traceWorkspaceRootDepartmentTiles");
        expect(validate).not.toContain("pass: Boolean(deptRow)");
    });

    it("activation create mode provisions owned department", () => {
        const form = read("components/adminV2/settings/lifecycle/LifecycleCreateForm.tsx");
        expect(form).toContain("activationMode");
        expect(form).toContain("createLifecycleViaBuilderPath");
    });
});
