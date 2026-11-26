import { describe, expect, it, vi, beforeEach } from "vitest";
import {
    findDuplicateInquiryChild,
    submitAddInquiryChildFromDrawer,
    validateAddInquiryChildSubmitPayload,
} from "@/lib/admin/actions/submitAddInquiryChildFromDrawer";

vi.mock("@/lib/admin/drawer/inquiryChildFieldEdit", () => ({
    ensureOpportunityCustomerMemberLink: vi.fn().mockResolvedValue({ ocmId: "ocm-1" }),
    patchOpportunityCustomerMemberFromInquiryChild: vi.fn().mockResolvedValue(undefined),
}));

import {
    ensureOpportunityCustomerMemberLink,
    patchOpportunityCustomerMemberFromInquiryChild,
} from "@/lib/admin/drawer/inquiryChildFieldEdit";

describe("validateAddInquiryChildSubmitPayload", () => {
    it("requires first and last name", () => {
        expect(validateAddInquiryChildSubmitPayload({ first_name: "", last_name: "Lee", age_group: "toddler" })).toContain(
            "First and last"
        );
    });

    it("requires dob or age group", () => {
        expect(
            validateAddInquiryChildSubmitPayload({ first_name: "Sam", last_name: "Lee", date_of_birth: null, age_group: null })
        ).toContain("date of birth or age group");
    });

    it("accepts age group without dob", () => {
        expect(
            validateAddInquiryChildSubmitPayload({
                first_name: "Sam",
                last_name: "Lee",
                age_group: "Infant",
            })
        ).toBeNull();
    });
});

describe("findDuplicateInquiryChild", () => {
    it("detects matching name and dob", () => {
        const dup = findDuplicateInquiryChild(
            [{ first_name: "Sam", last_name: "Lee", dob: "2020-01-15" }],
            { first_name: "Sam", last_name: "Lee", date_of_birth: "2020-01-15" }
        );
        expect(dup).toBe(true);
    });
});

describe("submitAddInquiryChildFromDrawer", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("creates customer member, links OCM, and patches program fields", async () => {
        const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
            if (url === "/api/admin/customer-members" && init?.method === "POST") {
                return {
                    ok: true,
                    json: async () => ({ id: "cm-new", person_id: "person-new" }),
                } as Response;
            }
            throw new Error(`unexpected fetch ${url}`);
        });

        const result = await submitAddInquiryChildFromDrawer({
            opportunityId: "opp-1",
            customerId: "cust-1",
            payload: {
                first_name: "Sam",
                last_name: "Lee",
                date_of_birth: "2020-05-01",
                program_category_id: "33333333-3333-4333-8333-333333333333",
                location_id: "11111111-1111-4111-8111-111111111111",
                program_room_cohort_key: "22222222-2222-4222-8222-222222222222",
                schedule_type: "full_day",
                start_date: "2026-09-01",
            },
            fetchFn: fetchFn as unknown as typeof fetch,
        });

        expect(result.person_id).toBe("person-new");
        expect(result.customer_member_id).toBe("cm-new");
        expect(result.ocm_id).toBe("ocm-1");
        expect(ensureOpportunityCustomerMemberLink).toHaveBeenCalledWith({
            opportunityId: "opp-1",
            customerMemberId: "cm-new",
        });
        expect(patchOpportunityCustomerMemberFromInquiryChild).toHaveBeenCalledWith(
            "ocm-1",
            expect.objectContaining({
                program_category_id: "33333333-3333-4333-8333-333333333333",
                schedule_type: "full_day",
                start_date: "2026-09-01",
                location_id: "11111111-1111-4111-8111-111111111111",
                program_room_cohort_key: "22222222-2222-4222-8222-222222222222",
            })
        );
    });

    it("preserves program category FK and room unit id on OCM patch", async () => {
        const fetchFn = vi.fn(async () => ({
            ok: true,
            json: async () => ({ id: "cm-new", person_id: "person-new" }),
        })) as unknown as typeof fetch;

        await submitAddInquiryChildFromDrawer({
            opportunityId: "opp-1",
            customerId: "cust-1",
            payload: {
                first_name: "Sam",
                last_name: "Lee",
                age_group: "toddler",
                program_category_id: "44444444-4444-4444-8444-444444444444",
                location_id: "11111111-1111-4111-8111-111111111111",
                program_room_cohort_key: "22222222-2222-4222-8222-222222222222",
            },
            fetchFn,
        });

        expect(patchOpportunityCustomerMemberFromInquiryChild).toHaveBeenCalledWith(
            "ocm-1",
            expect.objectContaining({
                program_category_id: "44444444-4444-4444-8444-444444444444",
                location_id: "11111111-1111-4111-8111-111111111111",
                program_room_cohort_key: "22222222-2222-4222-8222-222222222222",
            })
        );
    });

    it("fails when customer-members POST omits person_id", async () => {
        const fetchFn = vi.fn(async () => ({
            ok: true,
            json: async () => ({ id: "cm-new" }),
        })) as unknown as typeof fetch;

        await expect(
            submitAddInquiryChildFromDrawer({
                opportunityId: "opp-1",
                customerId: "cust-1",
                payload: {
                    first_name: "Sam",
                    last_name: "Lee",
                    age_group: "toddler",
                },
                fetchFn,
            })
        ).rejects.toThrow(/missing a linked person identity/);
    });

    it("inherits opportunity location when child payload omits location_id", async () => {
        const fetchFn = vi.fn(async () => ({
            ok: true,
            json: async () => ({ id: "cm-new", person_id: "person-new" }),
        })) as unknown as typeof fetch;

        await submitAddInquiryChildFromDrawer({
            opportunityId: "opp-1",
            customerId: "cust-1",
            opportunityLocationId: "11111111-1111-4111-8111-111111111111",
            payload: {
                first_name: "Sam",
                last_name: "Lee",
                age_group: "toddler",
                program_category_id: "44444444-4444-4444-8444-444444444444",
            },
            fetchFn,
        });

        expect(patchOpportunityCustomerMemberFromInquiryChild).toHaveBeenCalledWith(
            "ocm-1",
            expect.objectContaining({
                program_category_id: "44444444-4444-4444-8444-444444444444",
                location_id: "11111111-1111-4111-8111-111111111111",
            }),
        );
    });

    it("blocks duplicate children on the inquiry", async () => {
        await expect(
            submitAddInquiryChildFromDrawer({
                opportunityId: "opp-1",
                customerId: "cust-1",
                payload: {
                    first_name: "Sam",
                    last_name: "Lee",
                    age_group: "toddler",
                },
                existingChildren: [{ first_name: "Sam", last_name: "Lee", dob: null }],
            })
        ).rejects.toThrow(/already on this inquiry/);
    });
});
