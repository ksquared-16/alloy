import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { lifecycleRecordsVisibleNotAssignedCopy } from "@/lib/lifecycle/lifecycleWorkUnitQueueValidation";
import { resolveLifecycleCreateLeadBinding } from "@/lib/lifecycle/lifecycleRuntimeBinding";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycle record assignment wiring", () => {
    it("QueueService uses lifecycle visibility evaluator path", () => {
        const qs = read("lib/queues/QueueService.ts");
        expect(qs).toContain("resolveOpportunityQueueScopeBundle");
        expect(qs).toContain("lifecycle_visibility");
        expect(qs).toContain("resolveLifecycleOpportunityQueueScope");
        expect(qs).toContain("applyOpportunityQueueWorkUnitScope");
    });

    it("canonical lifecycle visibility evaluator module exists", () => {
        expect(read("lib/lifecycle/lifecycleVisibilityEvaluator.ts")).toContain(
            "resolveLifecycleVisibilityPredicate"
        );
        expect(read("lib/lifecycle/lifecycleVisibilityEvaluator.ts")).toContain("lifecycle_visibility");
    });

    it("validation uses visibility counts and informational assignment copy", () => {
        expect(read("lib/lifecycle/validateLifecycleActivationRuntime.ts")).toContain(
            "countLifecycleOpportunityRecordsForWorkUnit"
        );
        expect(read("lib/lifecycle/validateLifecycleActivationRuntime.ts")).toContain(
            "visible by lifecycle filters"
        );
        expect(lifecycleRecordsVisibleNotAssignedCopy(3)).toContain("visible by lifecycle filter");
    });

    it("create lead still assigns work_unit_id via entry binding", () => {
        const src = read("lib/lifecycle/lifecycleRuntimeBinding.ts");
        expect(src).toContain("resolveBuilderOwnedLifecycleCreateLeadBinding");
        expect(resolveLifecycleCreateLeadBinding).toBeDefined();
        expect(read("lib/admin/actions/entryLifecycleActions.ts")).toContain(
            "resolveLifecycleCreateLeadBinding"
        );
        expect(read("lib/lifecycle/lifecycleCreateLeadEntryBinding.ts")).toContain(
            "resolveCreateLeadEntryStageKey"
        );
        expect(read("lib/lifecycle/lifecycleCreateLeadEntryBinding.ts")).toContain("work_unit_id");
    });

    it("does not auto-reassign on workspace bootstrap loaders", () => {
        expect(read("lib/workspace/loadDeptOperationalBootstrap.ts")).not.toContain(
            "attachMatchingRecordsToLifecycleWorkUnits"
        );
        expect(read("lib/workspace/loadWorkUnitOperationalBootstrap.ts")).not.toContain(
            "attachMatchingRecordsToLifecycleWorkUnits"
        );
    });
});
