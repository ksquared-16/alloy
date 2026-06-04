import { describe, expect, it } from "vitest";
import {
    formatOpportunityInquiryDrawerTitle,
    stripHouseholdWording,
} from "@/lib/admin/drawer/opportunityInquiryDrawerTitle";

describe("formatOpportunityInquiryDrawerTitle", () => {
    it("uses configured entity label and household name, not primary contact person", () => {
        const title = formatOpportunityInquiryDrawerTitle(
            {
                _identity: {
                    household: { id: "c1", label: "Mitchell Household" },
                    primary_person: { id: "p1", label: "Kevin Mitchell" },
                },
                _customer_name: "Mitchell Household",
            },
            "Lead"
        );
        expect(title).toBe("Lead — Mitchell");
        expect(title).not.toContain("Kevin");
        expect(title).not.toContain("Enrollment");
    });

    it("strips household suffix from customer name fallback", () => {
        const title = formatOpportunityInquiryDrawerTitle(
            {
                _identity: { household: { id: "c1", label: "Williams Household" } },
                _customer_name: "Williams Household",
            },
            "Lead"
        );
        expect(title).toBe("Lead — Williams");
    });

    it("uses configured singular when no household name hints exist", () => {
        expect(formatOpportunityInquiryDrawerTitle({}, "Lead")).toBe("Lead");
    });
});

describe("stripHouseholdWording", () => {
    it("removes trailing household wording", () => {
        expect(stripHouseholdWording("Bennett Household")).toBe("Bennett");
        expect(stripHouseholdWording("Chen — Household")).toBe("Chen");
    });
});
