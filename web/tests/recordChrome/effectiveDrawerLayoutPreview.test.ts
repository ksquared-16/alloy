import { describe, expect, it } from "vitest";
import { buildEffectiveDrawerLayoutPreview } from "@/lib/recordChrome/effectiveDrawerLayoutPreview";

describe("buildEffectiveDrawerLayoutPreview", () => {
    it("orders workflow virtual sections before tuition placeholder for opportunity workflow_v1", () => {
        const { fidelity, sections } = buildEffectiveDrawerLayoutPreview({
            presentationEntityType: "opportunities",
            config: {
                inquiry_drawer_mode: "workflow_v1",
                inquiry_workflow_sections: [
                    { key: "inq_identity", title: "Identity", field_keys: ["name"], default_expanded: true },
                ],
            },
            fieldDefinitions: [
                {
                    field_key: "name",
                    field_type: "text",
                    label: "Name",
                    section_key: "details",
                    sort_order: 0,
                    is_visible_in_drawer: true,
                },
            ],
            fieldSectionLabels: { details: "Details" },
        });

        expect(fidelity).toBe("opportunity_runtime_mirror");
        const keys = sections.map((s) => s.section_key);
        expect(keys).toContain("inq_identity");
        expect(keys).toContain("inquiry_tuition");
        expect(keys.indexOf("inq_identity")).toBeLessThan(keys.indexOf("inquiry_tuition"));
        expect(sections.find((s) => s.section_key === "inq_identity")?.kind).toBe("workflow_virtual");
    });

    it("applies overview_section_order for opportunity when workflow_v1 is off", () => {
        const { sections } = buildEffectiveDrawerLayoutPreview({
            presentationEntityType: "opportunities",
            config: {
                overview_section_order: ["notes", "details"],
            },
            fieldDefinitions: [
                {
                    field_key: "name",
                    field_type: "text",
                    label: "Name",
                    section_key: "details",
                    sort_order: 1,
                    is_visible_in_drawer: true,
                },
                {
                    field_key: "customer_notes",
                    field_type: "text",
                    label: "Notes",
                    section_key: "notes",
                    sort_order: 0,
                    is_visible_in_drawer: true,
                },
            ],
            fieldSectionLabels: {},
        });

        const keys = sections.map((s) => s.section_key).filter((k) => k !== "__unified_status");
        expect(keys.indexOf("notes")).toBeLessThan(keys.indexOf("details"));
    });
});
