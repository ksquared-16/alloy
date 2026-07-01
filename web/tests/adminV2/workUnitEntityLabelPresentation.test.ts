import { describe, expect, it } from "vitest";
import type { EntityLabelsMap } from "@/contexts/EntityLabelsContext";
import { resolveOperatorQueueSummaryLabels } from "@/lib/admin/resolveEntityDisplayLabel";

const LEAD_LABELS: EntityLabelsMap = {
    opportunities: { singular: "Lead", plural: "Leads" },
};

describe("work-unit queue/KPI entity label presentation", () => {
    it("resolves lane chip labels that embed inquiry", () => {
        const labeled = resolveOperatorQueueSummaryLabels(
            [
                { key: "new_inquiry", label: "New Inquiry", count: 2 },
                { key: "pipeline_total", label: "Pipeline total", count: 10 },
            ],
            LEAD_LABELS
        );
        expect(labeled[0]?.label).toBe("New Lead");
        expect(labeled[1]?.label).toBe("Pipeline total");
    });
});
