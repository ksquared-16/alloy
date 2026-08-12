import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LAYOUT_SETTINGS_ENTITY_ORDER } from "@/lib/adminV2/layoutsSettingsEntities";
import { buildEffectiveDrawerLayoutPreview } from "@/lib/recordChrome/effectiveDrawerLayoutPreview";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("person drawer control-plane convergence (Card 4)", () => {
    it("includes person in layout settings entity order", () => {
        expect(LAYOUT_SETTINGS_ENTITY_ORDER).toContain("person");
    });

    it("effective layout preview supports persons via presentation template", () => {
        const preview = buildEffectiveDrawerLayoutPreview({
            presentationEntityType: "persons",
            config: {},
        });
        expect(preview.fidelity).toBe("presentation_ordered_skeleton");
        expect(preview.sections.some((s) => s.section_key === "contact_info")).toBe(true);
        expect(preview.sections.some((s) => s.section_key === "employee_placement")).toBe(true);
        expect(preview.sections.some((s) => s.section_key === "relationships")).toBe(true);
    });

});
