import { describe, expect, it } from "vitest";
import {
    actionPlacementEntityTypeOptionLabel,
    applyEntityLabelToOperatorCopy,
    resolveEntityLabel,
    resolveOperatorQueueSummaryLabels,
} from "@/lib/admin/resolveEntityDisplayLabel";
import type { EntityLabelsMap } from "@/contexts/EntityLabelsContext";

const LEAD_LABELS: EntityLabelsMap = {
    opportunities: { singular: "Lead", plural: "Leads" },
};

describe("resolveEntityDisplayLabel", () => {
    it("resolves opportunity singular and plural from tenant labels", () => {
        expect(resolveEntityLabel("opportunity", LEAD_LABELS)).toBe("Lead");
        expect(resolveEntityLabel("opportunity", LEAD_LABELS, { plural: true })).toBe("Leads");
        expect(resolveEntityLabel("opportunity", LEAD_LABELS, { count: 2 })).toBe("Leads");
    });

    it("rewrites embedded inquiry/opportunity terms in operator copy", () => {
        expect(applyEntityLabelToOperatorCopy("New Inquiry", LEAD_LABELS)).toBe("New Lead");
        expect(applyEntityLabelToOperatorCopy("Inquiry / opportunity", LEAD_LABELS)).toBe("Lead / Lead");
        expect(applyEntityLabelToOperatorCopy("Active inquiries", LEAD_LABELS)).toBe("Active Leads");
    });

    it("maps queue summary labels for work-unit chips", () => {
        const out = resolveOperatorQueueSummaryLabels(
            [{ key: "new_inquiry", label: "New Inquiry", count: 3 }],
            LEAD_LABELS
        );
        expect(out[0]?.label).toBe("New Lead");
    });

    it("formats action placement record type options", () => {
        expect(actionPlacementEntityTypeOptionLabel("opportunity", LEAD_LABELS)).toBe("Lead");
    });
});
