import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lifecycleBuilderPlacementVisibleOnStage } from "@/lib/lifecycle/lifecycleBuilderActionVisibility";

describe("unified actions stage filtering", () => {
    it("drawer first paint resolver passes lifecycleViewStageKey", () => {
        const src = readFileSync(
            join(process.cwd(), "lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityDrawerFirstPaintDependencies.ts"),
            "utf8",
        );
        expect(src).toContain("lifecycleViewStageKey: stageKeyFromLifecycleWorkUnitMetadata");
    });

    it("actions API route resolves lifecycle stage from work unit metadata", () => {
        const src = readFileSync(join(process.cwd(), "app/api/admin/actions/route.ts"), "utf8");
        expect(src).toContain("resolveLifecycleViewStageKeyForActions");
        expect(src).toContain("lifecycleViewStageKey");
    });

    it("hides stage-scoped BP placement when view stage does not match", () => {
        expect(
            lifecycleBuilderPlacementVisibleOnStage(
                {
                    lifecycle_builder_configured: true,
                    lifecycle_action_scope: "stage",
                    lifecycle_operator_stages: ["waitlist"],
                },
                "lead",
            ),
        ).toBe(false);
        expect(
            lifecycleBuilderPlacementVisibleOnStage(
                {
                    lifecycle_builder_configured: true,
                    lifecycle_action_scope: "stage",
                    lifecycle_operator_stages: ["waitlist"],
                },
                "waitlist",
            ),
        ).toBe(true);
    });
});
