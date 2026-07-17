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
            "ConfigEditorSection",
            "ConfigScopeContextBar",
            "ConfigApplyToDialog",
            "ConfigChildObjectMasterDetail",
            "ConfigConsequenceLine",
            "CONFIG_OBJECT_CELL",
            "ConfigWorkspaceCard",
        ]) {
            expect(index).toContain(name);
        }
        expect(read("components/adminV2/settings/configurationRuntime/workspace/ConfigGlanceMetrics.tsx")).toContain(
            "data-config-glance-icon-well",
        );
        expect(read("components/adminV2/settings/configurationRuntime/workspace/ConfigGlanceMetrics.tsx")).toContain(
            "embedded",
        );
        expect(read("components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes.tsx")).toContain(
            'surface = "panel"',
        );
        expect(read("components/adminV2/settings/configurationRuntime/workspace/ConfigScopeContextBar.tsx")).toContain(
            "This location",
        );
        expect(
            read("components/adminV2/settings/configurationRuntime/workspace/ConfigChildObjectMasterDetail.tsx"),
        ).toContain('data-config-surface="workspace"');
        expect(
            read("components/adminV2/settings/configurationRuntime/workspace/ConfigChildObjectMasterDetail.tsx"),
        ).toContain("lg:grid-cols-[16rem_minmax(0,1fr)]");
        expect(read("components/adminV2/settings/configurationRuntime/workspace/ConfigObjectHeader.tsx")).toContain(
            'size = "default"',
        );
        expect(read("components/adminV2/settings/configurationRuntime/workspace/ConfigObjectHeader.tsx")).toContain(
            "factsContent",
        );
        expect(read("components/adminV2/settings/configurationRuntime/workspace/ConfigGlanceMetrics.tsx")).toContain(
            "sm:divide-x",
        );
        expect(read("components/adminV2/settings/configurationRuntime/workspace/ConfigAttentionPanel.tsx")).toContain(
            "actionable.length === 0",
        );
        expect(read("components/adminV2/settings/configurationRuntime/workspace/ConfigAttentionPanel.tsx")).not.toContain(
            "Everything looks good",
        );
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
