import { describe, expect, it, vi } from "vitest";

import {
    buildCustomerMemberPatch,
    buildPersonIdentityPatch,
    inquiryChildIdentityDraftFromPatch,
    inquiryChildIdentityHasChanges,
    patchInquiryChildIdentityFromDrawer,
    resolveInquiryChildIdentityWriteTarget,
    resolveInquiryChildOcmId,
} from "@/lib/admin/drawer/inquiryChildFieldEdit";
import { resolveInquiryChildIdentityFields } from "@/lib/admin/drawer/inquiryChildrenHydration";
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

    it("buildPersonIdentityPatch maps dob to date_of_birth", () => {
        const patch = buildPersonIdentityPatch(
            { first_name: "Mia", last_name: "Chen", dob: "2020-06-10" },
            { first_name: "Mia", last_name: "Chen", dob: "" }
        );
        expect(patch).toEqual({ date_of_birth: "2020-06-10" });
    });

    it("resolveInquiryChildIdentityWriteTarget prefers person when linked", () => {
        expect(resolveInquiryChildIdentityWriteTarget({ person_id: "p-1" })).toBe("person");
        expect(resolveInquiryChildIdentityWriteTarget({ person_id: null })).toBe("customer_member");
    });

    it("patchInquiryChildIdentityFromDrawer PATCHes person first and last name when linked", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id: "p-1", first_name: "Mia", last_name: "Chen" }),
        });
        await patchInquiryChildIdentityFromDrawer({
            row: { customer_member_id: "cm-1", person_id: "p-1" },
            draft: { first_name: "Mia", last_name: "Chen", dob: "" },
            baseline: { first_name: "Mia", last_name: "Chan", dob: "" },
            fetchFn: fetchMock as unknown as typeof fetch,
        });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/persons/p-1",
            expect.objectContaining({
                method: "PATCH",
                body: JSON.stringify({ last_name: "Chen" }),
            })
        );
    });

    it("patchInquiryChildIdentityFromDrawer PATCHes person route when person_id is set", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ id: "p-1", first_name: "Mia", last_name: "Chen" }),
        });
        await patchInquiryChildIdentityFromDrawer({
            row: { customer_member_id: "cm-1", person_id: "p-1" },
            draft: { first_name: "Mia", last_name: "Chen", dob: "2020-06-10" },
            baseline: { first_name: "Mia", last_name: "Chen", dob: "" },
            fetchFn: fetchMock as unknown as typeof fetch,
        });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/persons/p-1",
            expect.objectContaining({
                method: "PATCH",
                body: JSON.stringify({ date_of_birth: "2020-06-10" }),
            })
        );
    });

    it("patchInquiryChildIdentityFromDrawer PATCHes customer-members when unlinked", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                ok: true,
                json: async () => ({ id: "cm-2", first_name: "Noah", last_name: "Parker" }),
            });
        await patchInquiryChildIdentityFromDrawer({
            row: { customer_member_id: "cm-2", person_id: null },
            draft: { first_name: "Noah", last_name: "Parker", dob: "2020-01-15" },
            baseline: { first_name: "Noah", last_name: "P", dob: "" },
            fetchFn: fetchMock as unknown as typeof fetch,
        });
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/customer-members/cm-2",
            expect.objectContaining({ method: "PATCH" })
        );
    });

    it("inquiryChildIdentityDraftFromPatch rebuilds draft from debounced patch keys", () => {
        expect(
            inquiryChildIdentityDraftFromPatch(
                { first_name: "Noah", last_name: "P", dob: "" },
                { last_name: "Parker", dob: "2020-01-15", display_name: "Noah Parker" }
            )
        ).toEqual({ first_name: "Noah", last_name: "Parker", dob: "2020-01-15" });
    });

    it("inquiryChildIdentityHasChanges detects any scalar drift", () => {
        expect(
            inquiryChildIdentityHasChanges(
                { first_name: "A", last_name: "B", dob: "" },
                { first_name: "A", last_name: "B", dob: "" }
            )
        ).toBe(false);
        expect(
            inquiryChildIdentityHasChanges(
                { first_name: "A", last_name: "B", dob: "2020-01-01" },
                { first_name: "A", last_name: "B", dob: "" }
            )
        ).toBe(true);
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

describe("resolveInquiryChildIdentityFields", () => {
    it("prefers person name and DOB when customer_member.person_id is linked", () => {
        expect(
            resolveInquiryChildIdentityFields({
                personId: "p-1",
                person: {
                    first_name: "Mia",
                    last_name: "Chen",
                    full_name: "Mia Chen",
                    date_of_birth: "2020-06-10",
                },
                member: {
                    first_name: "Old",
                    last_name: "Member",
                    dob: "2019-01-01",
                    display_name: "Old Member",
                },
            })
        ).toEqual({
            first_name: "Mia",
            last_name: "Chen",
            dob: "2020-06-10",
            display_name: "Mia Chen",
        });
    });

    it("uses customer_member fields when no person link exists", () => {
        expect(
            resolveInquiryChildIdentityFields({
                personId: null,
                person: null,
                member: {
                    first_name: "Noah",
                    last_name: "Parker",
                    dob: "2020-01-15",
                    display_name: "Noah Parker",
                },
            })
        ).toEqual({
            first_name: "Noah",
            last_name: "Parker",
            dob: "2020-01-15",
            display_name: "Noah Parker",
        });
    });
});
