import { describe, expect, it } from "vitest";
import {
    formatOpportunityInquiryDrawerTitle,
    stripHouseholdWording,
} from "@/lib/admin/drawer/opportunityInquiryDrawerTitle";

describe("formatOpportunityInquiryDrawerTitle", () => {
    it("prefers primary person over household label", () => {
        const title = formatOpportunityInquiryDrawerTitle(
            {
                _identity: {
                    household: { id: "c1", label: "Bennett Household" },
                    primary_person: { id: "p1", label: "Bennett" },
                },
                _customer_name: "Bennett Household",
            },
            "Lead"
        );
        expect(title).toBe("Enrollment — Bennett");
        expect(title.toLowerCase()).not.toContain("household");
    });

    it("strips household suffix from customer name fallback", () => {
        const title = formatOpportunityInquiryDrawerTitle(
            {
                _identity: { household: { id: "c1", label: "Williams Household" } },
                _customer_name: "Williams Household",
            },
            "Lead"
        );
        expect(title).toBe("Enrollment — Williams");
    });

    it("uses configured singular when no name hints exist", () => {
        expect(formatOpportunityInquiryDrawerTitle({}, "Lead")).toBe("Enrollment — Lead");
    });
});

describe("stripHouseholdWording", () => {
    it("removes trailing household wording", () => {
        expect(stripHouseholdWording("Bennett Household")).toBe("Bennett");
        expect(stripHouseholdWording("Chen — Household")).toBe("Chen");
    });
});
