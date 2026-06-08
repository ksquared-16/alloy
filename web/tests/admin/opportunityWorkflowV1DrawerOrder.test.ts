import { describe, expect, it } from "vitest";
import {
    mergeOpportunityWorkflowV1OrderIntoConfigJson,
    validateOpportunityWorkflowV1SectionOrder,
} from "@/lib/admin/opportunityWorkflowV1DrawerOrder";

describe("validateOpportunityWorkflowV1SectionOrder", () => {
    it("accepts exact permutations", () => {
        const canon = ["a", "b", "c"];
        expect(validateOpportunityWorkflowV1SectionOrder(["b", "c", "a"], canon)).toEqual({ ok: true });
    });

    it("rejects duplicates, unknown keys, and wrong length", () => {
        expect(validateOpportunityWorkflowV1SectionOrder(["a", "a", "c"], ["a", "b", "c"]).ok).toBe(false);
        expect(validateOpportunityWorkflowV1SectionOrder(["a", "b"], ["a", "b", "c"]).ok).toBe(false);
        expect(validateOpportunityWorkflowV1SectionOrder(["a", "b", "z"], ["a", "b", "c"]).ok).toBe(false);
        expect(validateOpportunityWorkflowV1SectionOrder([], ["a"]).ok).toBe(false);
    });
});

describe("mergeOpportunityWorkflowV1OrderIntoConfigJson", () => {
    it("reorders inquiry_workflow_sections to match overview section order", () => {
        const cfg = mergeOpportunityWorkflowV1OrderIntoConfigJson(
            {
                inquiry_drawer_mode: "workflow_v1",
                inquiry_workflow_sections: [
                    { key: "w2", title: "W2", field_keys: [] },
                    { key: "w1", title: "W1", field_keys: [] },
                ],
            },
            ["tail", "w1", "w2", "inquiry_tuition"]
        );
        expect(cfg.overview_section_order).toEqual(["tail", "w1", "w2", "inquiry_tuition"]);
        expect(cfg.inquiry_workflow_sections?.map((w) => w.key)).toEqual(["w1", "w2"]);
    });
});
