import { describe, expect, it } from "vitest";
import {
    buildEffectiveDrawerLayoutPreview,
    buildOpportunityWorkflowV1EditorSections,
    listOpportunityWorkflowV1CanonicalSectionKeys,
} from "@/lib/recordChrome/effectiveDrawerLayoutPreview";

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

    it("applies overview_section_order after workflow_v1 assembly when saved order is present", () => {
        const { sections } = buildEffectiveDrawerLayoutPreview({
            presentationEntityType: "opportunities",
            config: {
                inquiry_drawer_mode: "workflow_v1",
                overview_section_order: ["inquiry_tuition", "inquiry_children", "inq_a", "details"],
                inquiry_workflow_sections: [
                    { key: "inq_a", title: "A", field_keys: ["name"], default_expanded: true },
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
            fieldSectionLabels: {},
        });
        const keys = sections.map((s) => s.section_key);
        expect(keys.indexOf("inquiry_tuition")).toBeLessThan(keys.indexOf("inquiry_children"));
        expect(keys.indexOf("inquiry_children")).toBeLessThan(keys.indexOf("inq_a"));
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

    it("canonical workflow v1 keys ignore saved overview_section_order (same multiset)", () => {
        const fieldDefs = [
            {
                field_key: "name",
                field_type: "text",
                label: "Name",
                section_key: "details",
                sort_order: 0,
                is_visible_in_drawer: true,
            },
        ];
        const cfgBase = {
            inquiry_drawer_mode: "workflow_v1" as const,
            inquiry_workflow_sections: [{ key: "inq_a", title: "A", field_keys: ["name"] }],
        };
        const withSaved = { ...cfgBase, overview_section_order: ["inquiry_tuition", "details", "inq_a", "inquiry_children"] };
        const a = listOpportunityWorkflowV1CanonicalSectionKeys(withSaved, fieldDefs, {});
        const b = listOpportunityWorkflowV1CanonicalSectionKeys(cfgBase, fieldDefs, {});
        expect(a.sort()).toEqual(b.sort());
    });

    it("does not list catalog sections unless explicitly on drawer layout", () => {
        const cfg = {
            inquiry_drawer_mode: "workflow_v1" as const,
            inquiry_workflow_sections: [{ key: "inq_a", title: "A", field_keys: ["name"] }],
        };
        const fieldDefs = [
            {
                field_key: "name",
                field_type: "text",
                label: "Name",
                section_key: "details",
                sort_order: 0,
                is_visible_in_drawer: true,
            },
        ];
        const labels = { details: "Details", new_group: "New group" };
        const withoutLayout = buildOpportunityWorkflowV1EditorSections(cfg, fieldDefs, labels);
        expect(withoutLayout.some((s) => s.section_key === "new_group")).toBe(false);

        const withExplicit = buildOpportunityWorkflowV1EditorSections(
            { ...cfg, overview_section_order: ["inq_a", "new_group", "details", "inquiry_children", "inquiry_tuition"] },
            fieldDefs,
            labels
        );
        expect(withExplicit.some((s) => s.section_key === "new_group")).toBe(true);
        expect(withExplicit.find((s) => s.section_key === "new_group")?.kind).toBe("field_section_ref");
    });

    it("accepts proposed catalog keys in canonical validation", () => {
        const fieldDefs = [
            {
                field_key: "name",
                field_type: "text",
                label: "Name",
                section_key: "details",
                sort_order: 0,
                is_visible_in_drawer: true,
            },
        ];
        const cfg = {
            inquiry_drawer_mode: "workflow_v1" as const,
            inquiry_workflow_sections: [{ key: "inq_a", title: "A", field_keys: ["name"] }],
        };
        const labels = { new_group: "New group" };
        const keys = listOpportunityWorkflowV1CanonicalSectionKeys(cfg, fieldDefs, labels, {
            proposedOrder: ["inq_a", "new_group", "details", "inquiry_children", "inquiry_tuition"],
        });
        expect(keys).toContain("new_group");
    });
});
