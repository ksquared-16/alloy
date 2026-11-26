import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("BosWorkspaceScopeSync wiring", () => {
    it("publishes workspace and work-unit department scope for BOS slash Create Lead", () => {
        const workspace = readFileSync(
            resolve(__dirname, "../../../components/presentation/workspace/WorkspaceSurface.tsx"),
            "utf8"
        );
        const workUnit = readFileSync(
            resolve(__dirname, "../../../components/presentation/workUnit/WorkUnitSurface.tsx"),
            "utf8"
        );
        const controller = readFileSync(
            resolve(
                __dirname,
                "../../../app/adminV2/components/aiCommandSurface/commandSession/useCreateLeadBosSessionController.ts"
            ),
            "utf8"
        );
        expect(workspace).toContain("BosWorkspaceScopeSync");
        expect(workspace).toContain("defaultDepartmentId");
        expect(workUnit).toContain("BosWorkspaceScopeSync");
        expect(workUnit).toContain("model.departmentId");
        expect(controller).toContain("workspaceScope?.department_id");
    });
});
