import { describe, expect, it } from "vitest";
import { mergeCustomerMemberProfileOntoInquiryChildRow } from "@/lib/admin/drawer/attachCustomerMemberProfileToInquiryChildren";

describe("attachCustomerMemberProfileToInquiryChildren", () => {
    it("merges profile config fields from customer_member grain onto inquiry child row", () => {
        const row = {
            id: "ocm-1",
            customer_member_id: "cm-1",
            first_name: "Ava",
            custom_fields: { enrollment_note: "waitlist priority" },
            gender: undefined as string | undefined,
            allergies: undefined as string | undefined,
            medical_notes: undefined as string | undefined,
        };
        const merged = mergeCustomerMemberProfileOntoInquiryChildRow(row, {
            gender: "female",
            allergies: "peanut",
            medical_notes: "asthma",
        });
        expect(merged.gender).toBe("female");
        expect(merged.allergies).toBe("peanut");
        expect(merged.medical_notes).toBe("asthma");
        expect(merged.custom_fields).toEqual({
            enrollment_note: "waitlist priority",
            gender: "female",
            allergies: "peanut",
            medical_notes: "asthma",
        });
    });

    it("does not overwrite inquiry child row when profile is missing", () => {
        const row = { id: "ocm-1", customer_member_id: "cm-1", custom_fields: {} };
        expect(mergeCustomerMemberProfileOntoInquiryChildRow(row, undefined)).toEqual(row);
    });
});
