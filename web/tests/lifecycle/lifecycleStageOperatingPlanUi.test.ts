/**
 * Stage operating plan UI + save wiring static tests.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Lifecycle stage operating plan UI", () => {
    it("stage workspace exposes Expected Work section", () => {
        const workspace = read("components/adminV2/settings/lifecycle/LifecycleStageWorkspace.tsx");
        expect(workspace).toContain("BUSINESS_PROCESS_SECTION_EXPECTED_WORK");
        expect(workspace).toContain("LifecycleStageOperatingPlanEditor");
        expect(workspace).toContain('id="operating_plan"');
    });

    it("unified save includes stage_operating_plan_v1 when dirty", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("isStageOperatingPlanDirty");
        expect(board).toContain("stage_operating_plan_v1");
    });

    it("stage-runtime-config accepts stage_operating_plan_v1", () => {
        const route = read("app/api/admin/enrollment-process/stage-runtime-config/route.ts");
        expect(route).toContain("stage_operating_plan_v1");
        expect(route).toContain("parseStageOperatingPlanV1");
    });

    it("complete-stage-work API exists", () => {
        expect(read("app/api/admin/lifecycle-builder/complete-stage-work/route.ts")).toContain(
            "completeStageWorkWithOutcome",
        );
    });
});
