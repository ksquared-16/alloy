/**
 * ONE WRITE AUTHORITY, REACHABLE FROM EITHER HOST.
 *
 * The audit found the authorities were never the coupling: `PATCH /api/admin/persons/{id}` and
 * `PATCH /api/admin/customer-members/{id}` take no opportunity. The ORCHESTRATOR did —
 * `buildOpportunityFocusPanelMutation` requires an `opportunityId` and dispatches case-scoped refresh
 * events. So the property under test is not "a durable host can save" but "a durable host saves
 * through the SAME functions, and refuses precisely the fields that genuinely need a case".
 */

import { describe, expect, it, vi } from "vitest";

// `vi.mock` is hoisted above every top-level binding, so the spies have to be hoisted with it.
const { patchIdentity, patchMember } = vi.hoisted(() => ({
    patchIdentity: vi.fn(async () => ({ writeTarget: "customer_member" as const, patch: {} })),
    patchMember: vi.fn(async () => ({})),
}));

vi.mock("@/lib/admin/drawer/inquiryChildFieldEdit", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/admin/drawer/inquiryChildFieldEdit")>();
    return {
        ...actual,
        patchInquiryChildIdentityFromDrawer: patchIdentity,
        patchCustomerMemberFromInquiryChild: patchMember,
    };
});

import {
    saveContextualChildField,
    writeTargetForField,
} from "@/lib/adminV2/runtime/focusPanel/contextualCard/saveContextualChildField";
import type { DurableChildSubject } from "@/lib/adminV2/runtime/focusPanel/durableSubject/durableChildSubjectModel";

const LENNON: DurableChildSubject = {
    memberId: "cm-lennon",
    personId: null,
    householdId: "cust-kurzman",
    label: "Lennon Kurzman",
    dateOfBirth: "2022-04-11",
    householdName: "Kurzman Family",
    isActive: true,
    truth: { first_name: "Lennon", last_name: "Kurzman", dob: "2022-04-11" },
};

describe("which configured fields a durable host may write", () => {
    it("claims the fields whose canonical home IS the child record", () => {
        for (const key of [
            "child.first_name",
            "child.last_name",
            "child.date_of_birth",
            "child.preferred_name",
            "child.gender",
            "child.allergies",
            "child.medical_notes",
        ]) {
            expect(writeTargetForField(key), key).toBe("child_record");
        }
    });

    it("refuses ENROLLMENT projections — they belong to a participation, not to the child", () => {
        // These are configured-editable on the Child card and are NOT writable from a durable host:
        // they live on the opportunity-customer-member row, and writing one from here would create
        // participation as a side effect of an edit.
        for (const key of ["inquiry_child.program", "inquiry_child.start_date", "inquiry_child.notes"]) {
            expect(writeTargetForField(key), key).not.toBe("child_record");
        }
    });

    it("refuses derived fields rather than pretending they are editable", () => {
        for (const key of ["child.age", "child.display_name", "child.readiness_summary"]) {
            expect(writeTargetForField(key), key).toBeNull();
        }
    });
});

describe("the durable save goes through the canonical authorities", () => {
    it("routes identity through the SAME function the case host calls", async () => {
        patchIdentity.mockClear();
        const result = await saveContextualChildField({
            subject: LENNON,
            fieldKey: "child.first_name",
            value: "Lenny",
        });
        expect(result.ok).toBe(true);
        expect(patchIdentity).toHaveBeenCalledTimes(1);
        // …with the child's own row, and NO opportunity anywhere in the call.
        const call = patchIdentity.mock.calls[0]![0] as { row: { customer_member_id: string } };
        expect(call.row.customer_member_id).toBe("cm-lennon");
        expect(JSON.stringify(call)).not.toContain("opportunit");
    });

    it("routes profile scalars to the member row", async () => {
        patchMember.mockClear();
        const result = await saveContextualChildField({
            subject: LENNON,
            fieldKey: "child.allergies",
            value: "Peanuts",
        });
        expect(result.ok).toBe(true);
        expect(patchMember).toHaveBeenCalledWith("cm-lennon", { allergies: "Peanuts" });
    });

    it("REFUSES a participation field instead of throwing", async () => {
        // A host that must catch an exception to learn a field is not editable will stop catching it.
        const result = await saveContextualChildField({
            subject: LENNON,
            fieldKey: "inquiry_child.program",
            value: "Toddler A",
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain("enrollment");
    });
});
