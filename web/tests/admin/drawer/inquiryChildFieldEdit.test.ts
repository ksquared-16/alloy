import { describe, expect, it } from "vitest";

import { buildCustomerMemberPatch, resolveInquiryChildOcmId } from "@/lib/admin/drawer/inquiryChildFieldEdit";
import { UNLINKED_INQUIRY_CHILD_ID_PREFIX } from "@/lib/admin/drawer/inquiryChildrenHydration";

describe("inquiryChildFieldEdit", () => {
    it("buildCustomerMemberPatch only includes changed identity fields", () => {
        const patch = buildCustomerMemberPatch(
            { first_name: "Noah", last_name: "Parker", dob: "2020-01-15" },
            { first_name: "Noah", last_name: "P", dob: "" }
        );
        expect(patch).toEqual({
            last_name: "Parker",
            dob: "2020-01-15",
            display_name: "Noah Parker",
        });
    });

    it("InquiryChildOcmPatch type includes desired_start_date", () => {
        const patch = { desired_start_date: "2026-09-01" as string | null };
        expect(patch.desired_start_date).toBe("2026-09-01");
    });

    it("resolveInquiryChildOcmId returns null for unlinked household rows", () => {
        expect(
            resolveInquiryChildOcmId({
                id: `${UNLINKED_INQUIRY_CHILD_ID_PREFIX}cm-2`,
                customer_member_id: "cm-2",
            })
        ).toBeNull();
        expect(resolveInquiryChildOcmId({ id: "ocm-9", ocm_id: "ocm-9", customer_member_id: "cm-1" })).toBe("ocm-9");
    });
});
