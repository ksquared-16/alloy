import { describe, expect, it } from "vitest";
import {
    applyOpportunityWorkflowV1SectionPatches,
    isDrawerSectionHidden,
    renameInquiryWorkflowSectionTitle,
    setDrawerSectionVisibility,
} from "@/lib/admin/opportunityWorkflowV1SectionConfig";

describe("opportunityWorkflowV1SectionConfig", () => {
    it("tracks hidden sections", () => {
        const cfg = setDrawerSectionVisibility({ inquiry_drawer_mode: "workflow_v1" }, "details", false);
        expect(isDrawerSectionHidden(cfg, "details")).toBe(true);
        const shown = setDrawerSectionVisibility(cfg, "details", true);
        expect(isDrawerSectionHidden(shown, "details")).toBe(false);
    });

    it("renames workflow virtual section titles only", () => {
        const cfg = {
            inquiry_drawer_mode: "workflow_v1" as const,
            inquiry_workflow_sections: [{ key: "inq_a", title: "A", field_keys: ["name"] }],
        };
        const renamed = renameInquiryWorkflowSectionTitle(cfg, "inq_a", "Enrollment");
        expect(renamed.ok).toBe(true);
        if (renamed.ok) {
            expect(renamed.config.inquiry_workflow_sections?.[0]?.title).toBe("Enrollment");
        }
        const fail = renameInquiryWorkflowSectionTitle(cfg, "details", "X");
        expect(fail.ok).toBe(false);
    });

    it("applies visibility and order patches together", () => {
        const cfg = {
            inquiry_drawer_mode: "workflow_v1" as const,
            inquiry_workflow_sections: [
                { key: "w1", title: "W1", field_keys: [] },
                { key: "w2", title: "W2", field_keys: [] },
            ],
        };
        const patched = applyOpportunityWorkflowV1SectionPatches(cfg, {
            overview_section_order: ["w2", "w1"],
            section_visibility: [{ section_key: "w1", visible: false }],
        });
        expect(patched.ok).toBe(true);
        if (patched.ok) {
            expect(patched.config.overview_section_order).toEqual(["w2", "w1"]);
            expect(patched.config.overview_hidden_sections).toContain("w1");
        }
    });
});
