import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(join(repoRoot, rel), "utf8");
}

describe("lifecycleStageWorkUnitCardCreate", () => {
    it("POST includes builder stage key for custom stages (not only operator stages)", () => {
        const card = read("components/adminV2/settings/enrollmentProcess/LifecycleStageWorkUnitCard.tsx");
        expect(card).toContain("builderStageKey");
        expect(card).toContain("stage_key: builderStageKey");
        expect(card).not.toMatch(/operatorStage \? \{ stage: operatorStage \}/);
    });

    it("POST sends stage status_keys with builder stage for enrolling", () => {
        const card = read("components/adminV2/settings/enrollmentProcess/LifecycleStageWorkUnitCard.tsx");
        expect(card).toContain("stageSavedStatusKeys");
        expect(card).toContain("status_keys:");
    });

    it("uses stage-runtime-config contract (no PATCH sync loop)", () => {
        const card = read("components/adminV2/settings/enrollmentProcess/LifecycleStageWorkUnitCard.tsx");
        expect(card).toContain("LIFECYCLE_STAGE_RUNTIME_CONFIG_PATH");
        expect(card).toContain("selected_status_keys: savedKeys");
        expect(card).not.toContain("sync_statuses: true");
    });

    it("guided board does not overwrite pipeline with stale null after save", () => {
        const guided = read("components/adminV2/settings/lifecycle/LifecycleStageGuidedBoard.tsx");
        expect(guided).not.toContain("onPipelineUpdated(pipeline)");
    });
});
