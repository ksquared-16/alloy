import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isLifecycleDebugUiEnabled } from "@/lib/lifecycle/lifecycleDebugUi";
import {
    isRemovableTestLifecycleDepartment,
    isTestLifecycleDepartmentName,
} from "@/lib/lifecycle/lifecycleTestLifecycleMarkers";
import { PROTECTED_DEPARTMENT_KEYS } from "@/lib/lifecycle/lifecycleSimulationMarkers";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycle debug UI gating", () => {
    it("debug panels are hidden unless NEXT_PUBLIC_LIFECYCLE_DEBUG_UI=1", () => {
        expect(isLifecycleDebugUiEnabled()).toBe(process.env.NEXT_PUBLIC_LIFECYCLE_DEBUG_UI === "1");
    });

    it("Lifecycle Builder does not always render access scope debug", () => {
        const primary = read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx");
        expect(primary).toContain("isLifecycleDebugUiEnabled()");
        expect(primary).toContain("{isLifecycleDebugUiEnabled() ? (");
        expect(primary).toContain("<AdminAccessScopeDebugPanel surface=\"lifecycle\" />");
    });

    it("workspace page gates tile debug panel", () => {
        const page = read("app/adminV2/workspace/page.tsx");
        expect(page).toContain("isLifecycleDebugUiEnabled()");
    });

    it("runtime identity debug is gated", () => {
        expect(read("components/adminV2/settings/lifecycle/LifecycleRuntimeIdentityDebug.tsx")).toContain(
            "isLifecycleDebugUiEnabled"
        );
    });
});

describe("test lifecycle markers", () => {
    it("matches Admissions Test and not enrollment", () => {
        expect(isTestLifecycleDepartmentName("Admissions Test")).toBe(true);
        expect(isRemovableTestLifecycleDepartment({ key: "enrollment", name: "Enrollment" })).toBe(false);
        expect(PROTECTED_DEPARTMENT_KEYS.has("enrollment")).toBe(true);
    });

    it("protected platform keys are never removable", () => {
        for (const key of ["enrollment", "operations", "finance", "compliance", "system"]) {
            expect(
                isRemovableTestLifecycleDepartment({
                    key,
                    name: "Admissions Test",
                    metadata: { lifecycle_builder_owned_v1: { source: "lifecycle_builder", created_by: "x", created_at: "t" } },
                })
            ).toBe(false);
        }
    });
});

describe("lifecycle delete UX", () => {
    it("delete lifecycle button on activation board", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain('data-testid="lifecycle-activation-delete"');
        expect(board).toContain("Delete lifecycle");
    });

    it("delete confirmation modal lists scope and record warning", () => {
        const modal = read("components/adminV2/settings/lifecycle/LifecycleActivationDeleteModal.tsx");
        expect(modal).toContain("lifecycle-activation-delete-modal");
        expect(modal).toContain("user department access");
        expect(modal).toContain("lifecycle-delete-records-warning");
        expect(modal).toContain("Opportunities and other records are");
    });

    it("protected enrollment uses disabled delete in builder header", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).not.toContain("lifecycle-legacy-manage-hint");
        expect(board).toContain("lifecycle-activation-delete");
        expect(read("components/adminV2/settings/LifecycleSettingsShell.tsx")).toContain(
            "Advanced configuration"
        );
    });

    it("catalog delete uses confirmation modal", () => {
        const primary = read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx");
        expect(primary).toContain("LifecycleActivationDeleteModal");
        expect(primary).toContain("setDeleteConfirmTarget");
    });
});

describe("lifecycle delete implementation", () => {
    it("delete removes department access rows", () => {
        expect(read("lib/lifecycle/lifecycleActivationOwned.ts")).toContain("user_department_access");
    });

    it("delete does not touch opportunities", () => {
        const owned = read("lib/lifecycle/lifecycleActivationOwned.ts");
        expect(owned).not.toContain("opportunities");
    });

    it("catalog delete protects enrollment department key", () => {
        expect(read("app/api/admin/lifecycle-catalog/delete/route.ts")).toContain('deptKey === "enrollment"');
    });

    it("post-delete busts workspace and refreshes catalog", () => {
        const primary = read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx");
        expect(primary).toContain("notifyWorkspaceDepartmentsChanged");
        expect(primary).toContain("loadCatalog");
        expect(read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx")).toContain(
            "onCatalogRefresh"
        );
    });
});

describe("test lifecycle cleanup", () => {
    it("cleanup API and admin button exist", () => {
        expect(read("app/api/admin/lifecycle-catalog/cleanup-test/route.ts")).toContain("cleanupTestLifecyclesForOrg");
        expect(read("components/adminV2/settings/lifecycle/LifecycleTestCleanupButton.tsx")).toContain(
            "lifecycle-test-cleanup"
        );
    });
});
