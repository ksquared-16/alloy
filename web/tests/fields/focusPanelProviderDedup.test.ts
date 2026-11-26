import { describe, expect, it } from "vitest";
import { assembleFocusPanelNestedProviders } from "@/lib/fields/consumerCanonicalProviderAssembly";
import { dedupeFocusPanelPickerProviders } from "@/lib/fields/focusPanelProviderDedup";

describe("focusPanelProviderDedup", () => {
    it("collapses alias refKeys to one picker row per canonical identity", () => {
        const providers = dedupeFocusPanelPickerProviders([
            {
                refKey: "child.display_name",
                label: "Name",
                kind: "platform_field",
                outputShape: "scalar",
                entityNamespace: "child",
                isSystem: true,
                availability: { pipeline: true, waitlist: true },
            },
            {
                refKey: "child.first_name",
                label: "First name",
                kind: "platform_field",
                outputShape: "scalar",
                entityNamespace: "child",
                isSystem: true,
                availability: { pipeline: true, waitlist: true },
            },
        ]);
        expect(providers.map((provider) => provider.refKey)).toEqual(["child.first_name"]);
    });

    it("focus panel assembly does not expose duplicate picker identities for program aliases", () => {
        const keys = assembleFocusPanelNestedProviders().map((provider) => provider.refKey);
        expect(keys.filter((key) => key === "child.first_name").length).toBeLessThanOrEqual(1);
        expect(keys.filter((key) => key === "inquiry_child.program").length).toBeLessThanOrEqual(1);
        expect(keys).not.toContain("child.display_name");
    });
});
