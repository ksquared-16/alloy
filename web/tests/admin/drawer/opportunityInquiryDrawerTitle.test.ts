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
        expect(title).toBe("Mitchell Family");
        expect(title).not.toContain("Kevin");
        expect(title).not.toContain("Enrollment");
        expect(title).not.toContain("Lead —");
    });

    it("strips household suffix from customer name fallback", () => {
        const title = formatOpportunityInquiryDrawerTitle(
            {
                _identity: { household: { id: "c1", label: "Williams Household" } },
                _customer_name: "Williams Household",
            },
            "Lead"
        );
        expect(title).toBe("Williams Family");
    });

    it("uses configured singular when no household name hints exist", () => {
        expect(formatOpportunityInquiryDrawerTitle({}, "Lead")).toBe("Lead");
    });

    it("uses record.name directly when already household-formatted", () => {
        const title = formatOpportunityInquiryDrawerTitle(
            {
                name: "James Family",
                _identity: {
                    household: { id: "c1", label: "James Household" },
                    primary_person: { id: "p1", label: "Lebron James" },
                },
            },
            "Lead",
        );
        expect(title).toBe("James Family");
    });
});

describe("stripHouseholdWording", () => {
    it("removes trailing household wording", () => {
        expect(stripHouseholdWording("Bennett Household")).toBe("Bennett");
        expect(stripHouseholdWording("Chen — Household")).toBe("Chen");
    });
});
