/** Configuration Runtime workspace primitives — reusable across Settings domains. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Configuration Runtime workspace primitives", () => {
    it("exports the shared workspace primitive set", () => {
        const index = read("components/adminV2/settings/configurationRuntime/workspace/index.ts");
        for (const name of [
            "ConfigObjectHeader",
            "ConfigAttentionPanel",
            "ConfigOperationalReadiness",
            "ConfigOperationalActions",
            "ConfigGlanceMetrics",
            "ConfigScopeContextBar",
            "ConfigApplyToDialog",
            "ConfigChildObjectMasterDetail",
            "ConfigConsequenceLine",
        ]) {
            expect(index).toContain(name);
        }
    });

    it("keeps unknown readiness out of incomplete math", () => {
        const readiness = read(
            "components/adminV2/settings/configurationRuntime/workspace/ConfigOperationalReadiness.tsx",
        );
        expect(readiness).toContain("complete !== null");
        expect(readiness).toContain("Not assessed");
        expect(readiness).toContain("Operational readiness complete");
    });

    it("scopes Apply To as a dialog for create/confirm-style selection", () => {
        const apply = read("components/adminV2/settings/configurationRuntime/workspace/ConfigApplyToDialog.tsx");
        expect(apply).toContain("Apply to…");
        expect(apply).toContain("onApply");
        expect(apply).toContain('role="dialog"');
    });
});
