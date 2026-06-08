import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Lifecycle settings UX coherence", () => {
    it("page uses compact operator helper copy", () => {
        const page = read("app/adminV2/settings/lifecycle/page.tsx");
        expect(page).toContain("lifecycle-page-compact-helper");
        expect(page).toContain("Choose what must be complete before a family moves forward");
        expect(page).not.toContain("Platform defaults (view only)");
    });

    it("hub shows nested field detail under requirements", () => {
        const hub = read("components/adminV2/settings/LifecycleStagesRequirementsHub.tsx");
        expect(hub).toContain("lifecycle-req-field-detail");
        expect(hub).toContain("lifecycleRequirementFieldDetailForLabel");
    });

    it("hub shows where stage appears with work unit mapping", () => {
        const hub = read("components/adminV2/settings/LifecycleStagesRequirementsHub.tsx");
        expect(hub).toContain("LifecycleStageWhereAppears");
        expect(read("components/adminV2/settings/LifecycleStageWhereAppears.tsx")).toContain(
            "Where This Stage Appears"
        );
    });

    it("where-appears component references work units settings", () => {
        const card = read("components/adminV2/settings/LifecycleStageWhereAppears.tsx");
        expect(card).toContain("/adminV2/settings/work-units");
        expect(card).toContain("lifecycle-stage-work-unit-queues");
    });
});
