import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { WorkspaceTilePipelineTrace } from "@/lib/workspace/workspaceRootTilePipeline";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycle department id exact match validation", () => {
    it("workspace_api uses selected id in tileTrace.apiDepartmentIds, not catalog truth", () => {
        const validate = read("lib/lifecycle/validateLifecycleActivationRuntime.ts");
        expect(validate).toContain("tileTrace.apiDepartmentIds.includes(selectedDepartmentId)");
        expect(validate).toContain("Selected lifecycle department ID is not returned by /workspace API");
        expect(validate).not.toContain("truth.visible_in_workspace_api");
    });

    it("builder catalog requires catalog row department_id === selected", () => {
        expect(read("lib/lifecycle/validateLifecycleActivationRuntime.ts")).toContain(
            "entry.department_id === selectedDepartmentId"
        );
    });

    it("validation API returns id_audit", () => {
        expect(read("app/api/admin/departments/[departmentId]/lifecycle-activation/validate/route.ts")).toContain(
            "id_audit"
        );
    });

    it("validation panel shows department id audit table", () => {
        expect(read("components/adminV2/settings/lifecycle/LifecycleActivationValidation.tsx")).toContain(
            "LifecycleDepartmentIdAuditTable"
        );
        expect(read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx")).toContain(
            "identity={identity}"
        );
    });

    it("fails rendered check when selected id absent from trace", () => {
        const trace: WorkspaceTilePipelineTrace = {
            apiDepartmentIds: ["a", "b", "c"],
            afterActiveFilterIds: ["a", "b", "c"],
            renderedTileIds: ["a", "b", "c"],
        };
        const selected = "missing-lifecycle-dept";
        expect(trace.apiDepartmentIds.includes(selected)).toBe(false);
        expect(trace.renderedTileIds.includes(selected)).toBe(false);
    });
});
