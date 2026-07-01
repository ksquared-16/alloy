import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { workspaceTileVisibleForActivation } from "@/lib/lifecycle/validateLifecycleActivationRuntime";
import type { LifecycleActivationV1 } from "@/lib/lifecycle/lifecycleActivationConfig";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

const activation: LifecycleActivationV1 = {
    version: 1,
    lifecycle_name: "Admissions",
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

describe("Lifecycle Builder activation consolidation", () => {
    it("defaults to board as primary Lifecycle Builder", () => {
        const shell = read("components/adminV2/settings/LifecycleSettingsShell.tsx");
        expect(shell).toContain("LifecycleActivationClient");
        expect(read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx")).toContain(
            "lifecycle-builder-primary"
        );
        expect(shell).not.toContain("Lifecycle Activation Preview");
    });

    it("advanced hub is only under Advanced Configuration", () => {
        const shell = read("components/adminV2/settings/LifecycleSettingsShell.tsx");
        expect(shell).toContain("lifecycle-advanced-configuration-toggle");
        expect(shell).toContain("Advanced configuration");
        expect(shell).toContain("lifecycle-advanced-configuration");
        expect(shell).toContain("LifecycleHubClient");
        expect(shell).not.toMatch(/legacy/i);
    });

    it("primary builder uses process catalog cards", () => {
        const primary = read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx");
        expect(primary).toContain("LifecycleProcessCatalogCards");
        expect(primary).toContain("/api/admin/lifecycle-catalog");
        expect(read("lib/lifecycle/lifecycleCatalog.ts")).toContain(
            'source = activationOwned ? "builder_owned" : "legacy"'
        );
    });

    it("Add Stage is in stage tab rail", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("LifecycleStageNav");
        expect(read("components/adminV2/settings/lifecycle/LifecycleStageNav.tsx")).toContain(
            "lifecycle-stage-tab-add"
        );
    });

    it("delete and stage cleanup controls exist", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        const config = read("components/adminV2/settings/lifecycle/LifecycleStageConfiguration.tsx");
        expect(board).toContain("lifecycle-activation-delete");
        expect(board).toContain("lifecycle-activation-delete-stage");
        expect(read("components/adminV2/settings/lifecycle/LifecycleBuilderActionsCard.tsx")).toContain(
            "lifecycle-configured-actions"
        );
        expect(read("app/api/admin/departments/[departmentId]/lifecycle-builder/route.ts")).toContain(
            "remove_stage"
        );
    });

    it("workspace validation uses scoped department source", () => {
        expect(read("lib/workspace/workspaceActiveDepartments.ts")).toContain("applyDepartmentAccessScope");
        expect(read("lib/lifecycle/lifecycleCatalog.ts")).toContain("fetchWorkspaceActiveDepartments");
        expect(read("app/api/admin/departments/route.ts")).toContain("applyDepartmentAccessScope");
    });

    it("workspace validation fails when department not in scoped workspace list", () => {
        const r = workspaceTileVisibleForActivation([], "dept-1", activation, {
            existsInOrg: true,
            accessScopeRestricted: true,
        });
        expect(r.pass).toBe(false);
        expect(r.detail).toContain("access scope");
    });

    it("workspace validation passes when scoped list includes matching tile", () => {
        const r = workspaceTileVisibleForActivation(
            [{ id: "dept-1", name: "Admissions", key: "admissions", is_active: true }],
            "dept-1",
            activation
        );
        expect(r.pass).toBe(true);
    });

    it("invalidates workspace cache after department changes", () => {
        expect(read("lib/workspace/notifyWorkspaceDepartmentsChanged.ts")).toContain(
            "invalidateAdminV2WorkspaceSessionCache"
        );
        expect(read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx")).toContain(
            "notifyWorkspaceDepartmentsChanged"
        );
    });

    it("uses capitalized Lifecycle in header actions", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("Delete lifecycle");
        expect(read("components/adminV2/settings/lifecycle/LifecycleProcessCatalogCards.tsx")).toContain(
            "BUSINESS_PROCESS_CATALOG_CREATE"
        );
    });
});
