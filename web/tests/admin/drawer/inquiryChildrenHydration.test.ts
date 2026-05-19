import { describe, expect, it } from "vitest";

import {
    isActiveChildCustomerMemberForInquiry,
    mergeHouseholdActiveChildrenIntoInquiryChildren,
    UNLINKED_INQUIRY_CHILD_ID_PREFIX,
    type InquiryChildHydrateRow,
} from "@/lib/admin/drawer/inquiryChildrenHydration";

describe("inquiryChildrenHydration", () => {
    it("matches queue child filter (active relationship=child only)", () => {
        expect(isActiveChildCustomerMemberForInquiry({ relationship: "child", is_active: true })).toBe(true);
        expect(isActiveChildCustomerMemberForInquiry({ relationship: "dependent", is_active: true })).toBe(false);
        expect(isActiveChildCustomerMemberForInquiry({ relationship: "child", is_active: false })).toBe(false);
    });

    it("merges household children missing from OCM join rows (drawer count matches work-unit active-child rule)", () => {
        const linked: InquiryChildHydrateRow[] = [
            {
                id: "ocm-1",
                customer_member_id: "cm-1",
                person_id: null,
                display_name: "Ava",
                first_name: "Ava",
                last_name: "P",
                dob: null,
                age: null,
                desired_program_type: "preschool",
                desired_program_label: "Preschool",
                desired_schedule_type: null,
                desired_schedule_label: null,
                outcome_status_key: null,
                outcome_status_label: null,
                fit_status: null,
                notes: null,
                metadata: null,
                created_at: null,
                updated_at: null,
                linked_on_inquiry: true,
                ocm_id: "ocm-1",
            },
        ];
        const merged = mergeHouseholdActiveChildrenIntoInquiryChildren(
            linked,
            [
                { id: "cm-1", relationship: "child", is_active: true, display_name: "Ava" },
                { id: "cm-2", relationship: "child", is_active: true, display_name: "Noah", first_name: "Noah", last_name: "P" },
            ],
            new Map(),
            "preschool",
            null,
            new Map()
        );
        expect(merged).toHaveLength(2);
        expect(merged[0]?.customer_member_id).toBe("cm-1");
        const extra = merged.find((r) => r.customer_member_id === "cm-2");
        expect(extra?.id).toBe(`${UNLINKED_INQUIRY_CHILD_ID_PREFIX}cm-2`);
        expect(extra?.linked_on_inquiry).toBe(false);
    });
});
