import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { catalogValidationTruth } from "@/lib/lifecycle/lifecycleCatalog";
import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

function catalogEntry(partial: Partial<LifecycleCatalogEntry>): LifecycleCatalogEntry {
    return {
        id: "dept:p1",
        config_source: "departments.metadata.lifecycle_builder_v1",
        department_id: "dept",
        department_key: "enrollment",
        department_name: "Enrollment",
        process_id: "p1",
        process_key: "enrollment",
        lifecycle_name: "Enrollment",
        source: "legacy",
        stage_count: 3,
        track_count: 0,
        work_unit_count: 1,
        activation_owned: false,
        can_delete: false,
        can_repair: true,
        workspace: {
            backing_department_exists: true,
            department_is_active: true,
            visible_in_workspace_api: false,
            user_has_access: true,
            name_matches_tile: true,
            runtime_status: "not_visible",
            tile_name: null,
        },
        ...partial,
    };
}

describe("Lifecycle promote + workspace repair", () => {
    it("primary builder uses process cards without legacy badges", () => {
        const cards = read("components/adminV2/settings/lifecycle/LifecycleProcessCatalogCards.tsx");
        expect(cards).toContain("lifecycle-process-catalog");
        expect(cards).not.toMatch(/\bLegacy\b/);
        expect(read("components/adminV2/settings/lifecycle/LifecycleCatalogList.tsx")).toContain(
            "lifecycle-catalog-repair-"
        );
    });

    it("selecting lifecycle loads board via runtime identity", () => {
        const primary = read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx");
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(primary).toContain("buildIdentityFromCatalogEntry");
        expect(board).toContain("hydrateFromSelection");
    });

    it("missing workspace tile exposes repair on board", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("lifecycle-activation-repair-workspace");
        expect(read("app/api/admin/lifecycle-catalog/repair/route.ts")).toContain(
            "repairLifecycleWorkspaceVisibility"
        );
    });

    it("repair creates or fixes backing department for legacy lifecycles", () => {
        const repair = read("lib/lifecycle/repairLifecycleWorkspaceVisibility.ts");
        expect(repair).toContain("created_dedicated_department");
        expect(repair).toContain("verified_in_workspace_api");
        expect(repair).toContain("verified_in_workspace_api");
        expect(repair).toContain("still missing from workspace API");
    });

    it("validation fails workspace pass until API includes department", () => {
        const base = catalogEntry({});
        const truth = catalogValidationTruth(
            catalogEntry({
                workspace: { ...base.workspace, visible_in_workspace_api: false },
            })
        );
        expect(truth.workspace_pass).toBe(false);
        expect(truth.visible_in_workspace_api).toBe(false);

        const pass = catalogValidationTruth(
            catalogEntry({
                workspace: {
                    ...base.workspace,
                    visible_in_workspace_api: true,
                    runtime_status: "visible",
                },
            })
        );
        expect(pass.workspace_pass).toBe(true);
    });

    it("delete builder-owned lifecycle uses activation DELETE", () => {
        const primary = read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx");
        expect(primary).toContain("lifecycle-activation");
        expect(primary).toContain('method: "DELETE"');
    });

    it("legacy delete requires explicit confirmation modal", () => {
        const primary = read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx");
        const modal = read("components/adminV2/settings/lifecycle/LifecycleActivationDeleteModal.tsx");
        expect(primary).toContain("legacy_delete_confirm");
        expect(modal).toContain("lifecycle-legacy-delete-modal");
        expect(read("app/api/admin/lifecycle-catalog/delete/route.ts")).toContain("legacy_delete_confirm");
    });
});
