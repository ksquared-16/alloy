import { describe, expect, it } from "vitest";

import { buildHouseholdCardEvidence } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import {
    householdContactDirty,
    householdContactPatch,
    seedHouseholdContactValues,
    seedHouseholdContactValuesForPerson,
    seedHouseholdContactValuesFromEvidence,
    isEditableHouseholdPersonId,
} from "@/lib/adminV2/runtime/focusPanel/household/householdContactEditState";
import { mergePersonContactIntoFocusPanelTruth } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { PersonContactValues } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";

const TRUTH: Record<string, unknown> = {
    id: "opp-1",
    _identity: { primary_person: { id: "p-1", label: "Jordan Johnson" } },
    "person.primary_contact_name": "Jordan Johnson",
    "person.primary_email": "jordan@example.com",
    "person.primary_phone": "(555) 012-3456",
};

function contextFor(truth: Record<string, unknown>): OperationalContext {
    return {
        subject: { type: "opportunity", id: "opp-1", label: "Johnson Family" },
        businessProcess: { key: null, label: null, stageKey: null },
        perspective: null,
        truth,
        signals: {
            work: { primary: null, items: [], openCount: 0, overdueCount: 0, nextActionLabel: null },
            attention: { needsAttention: false, primaryReason: null, reasonCount: 0 },
            tour: { scheduled: false, startAt: null, statusLabel: null, statusKey: null, bookingId: null },
            communications: { scheduledSendCount: 0, nextFollowUpAt: null, hasOutreach: false, nextScheduledSendId: null },
            billing: { billingConfigured: false, billingContactName: null, billingContactEmail: null, tuitionRateLabel: null, feeBalanceCents: null },
        },
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
        grain: "case",
    } as OperationalContext;
}

describe("seedHouseholdContactValues", () => {
    it("seeds from the combined name + namespaced email/phone", () => {
        const seed = seedHouseholdContactValues(TRUTH);
        expect(seed.personId).toBe("p-1");
        expect(seed.values).toEqual({
            first_name: "Jordan",
            last_name: "Johnson",
            email: "jordan@example.com",
            phone: "(555) 012-3456",
        });
    });

    it("prefers explicit first_name/last_name mirror keys when present", () => {
        const seed = seedHouseholdContactValues({ ...TRUTH, first_name: "Jo", last_name: "Johnson-Smith" });
        expect(seed.values.first_name).toBe("Jo");
        expect(seed.values.last_name).toBe("Johnson-Smith");
    });

    it("returns null personId when no primary person is linked", () => {
        const seed = seedHouseholdContactValues({ "person.primary_contact_name": "Nobody" });
        expect(seed.personId).toBeNull();
    });
});

describe("dirty + patch", () => {
    const baseline: PersonContactValues = { first_name: "Jordan", last_name: "Johnson", email: "j@x.com", phone: "1" };

    it("is clean when unchanged and dirty when any field differs", () => {
        expect(householdContactDirty(baseline, baseline)).toBe(false);
        expect(householdContactDirty({ ...baseline, email: "new@x.com" }, baseline)).toBe(true);
    });

    it("builds a patch of changed fields only, empty string → null", () => {
        const draft: PersonContactValues = { ...baseline, last_name: "Smith", phone: "" };
        expect(householdContactPatch(draft, baseline)).toEqual({ last_name: "Smith", phone: null });
    });

    it("produces an empty patch when nothing changed", () => {
        expect(householdContactPatch(baseline, baseline)).toEqual({});
    });
});

describe("card reflects refreshed truth (merge → recompose → evidence)", () => {
    it("Household evidence shows the saved contact values after the merge", () => {
        const before = buildHouseholdCardEvidence(contextFor(TRUTH));
        expect(before.primaryEmail).toBe("jordan@example.com");

        const mergedTruth = mergePersonContactIntoFocusPanelTruth(TRUTH, "p-1", {
            first_name: "Jordan",
            last_name: "Smith",
            full_name: "Jordan Smith",
            email: "new@example.com",
            phone: "(555) 999-0000",
        });
        const after = buildHouseholdCardEvidence(contextFor(mergedTruth));
        expect(after.primaryEmail).toBe("new@example.com");
        expect(after.primaryPhone).toBe("(555) 999-0000");
        expect(after.primaryContact?.name).toBe("Jordan Smith");
    });
});

const MULTI_TRUTH: Record<string, unknown> = {
    id: "opp-1",
    _identity: { primary_person: { id: "p-1", label: "Peyton Manning" } },
    "person.primary_contact_name": "Peyton Manning",
    "person.primary_email": "peyton@example.com",
    "person.primary_phone": "(555) 111-2222",
    _opportunity_persons: [
        { id: "op-1", person_id: "p-1", role_type: "primary_contact", name: "Peyton Manning", phone: "(555) 111-2222", email: "peyton@example.com" },
        { id: "op-2", person_id: "p-2", role_type: "parent", name: "Lillie Manning", phone: "(555) 333-4444", email: "lillie@example.com" },
    ],
};

describe("seedHouseholdContactValuesForPerson — targeted per-row editing", () => {
    it("seeds the PRIMARY contact by id", () => {
        const seed = seedHouseholdContactValuesForPerson(MULTI_TRUTH, "p-1");
        expect(seed?.name).toBe("Peyton Manning");
        expect(seed?.values).toMatchObject({ first_name: "Peyton", last_name: "Manning", email: "peyton@example.com" });
    });

    it("seeds a SECOND parent / additional contact by id (not the primary)", () => {
        const seed = seedHouseholdContactValuesForPerson(MULTI_TRUTH, "p-2");
        expect(seed?.personId).toBe("p-2");
        expect(seed?.name).toBe("Lillie Manning");
        expect(seed?.values).toMatchObject({ first_name: "Lillie", last_name: "Manning", email: "lillie@example.com", phone: "(555) 333-4444" });
    });

    it("returns null for an unknown / empty person", () => {
        expect(seedHouseholdContactValuesForPerson(MULTI_TRUTH, "nope")).toBeNull();
        expect(seedHouseholdContactValuesForPerson(MULTI_TRUTH, "  ")).toBeNull();
    });
});

describe("mergePersonContactIntoFocusPanelTruth — updates the correct person", () => {
    it("updates a SECOND contact's row by id without touching the primary keys", () => {
        const merged = mergePersonContactIntoFocusPanelTruth(MULTI_TRUTH, "p-2", {
            first_name: "Lillie",
            last_name: "Manning-Smith",
            full_name: "Lillie Manning-Smith",
            email: "lillie.new@example.com",
            phone: "(555) 999-0000",
        });
        const rows = merged._opportunity_persons as { person_id: string; name: string; email: string }[];
        expect(rows.find((r) => r.person_id === "p-2")).toMatchObject({ name: "Lillie Manning-Smith", email: "lillie.new@example.com" });
        // primary (p-1) untouched
        expect(rows.find((r) => r.person_id === "p-1")?.name).toBe("Peyton Manning");
        expect(merged["person.primary_email"]).toBe("peyton@example.com");
        // original immutable
        expect((MULTI_TRUTH._opportunity_persons as { email: string }[])[1]!.email).toBe("lillie@example.com");
    });

    it("updates the primary keys when the edited person IS the primary", () => {
        const merged = mergePersonContactIntoFocusPanelTruth(MULTI_TRUTH, "p-1", {
            first_name: "Peyton",
            last_name: "Manning",
            full_name: "Peyton Manning",
            email: "peyton.new@example.com",
        });
        expect(merged["person.primary_email"]).toBe("peyton.new@example.com");
        const rows = merged._opportunity_persons as { person_id: string; email: string }[];
        expect(rows.find((r) => r.person_id === "p-1")?.email).toBe("peyton.new@example.com");
    });
});

describe("isEditableHouseholdPersonId + evidence seed", () => {
    it("blocks synthetic ids", () => {
        expect(isEditableHouseholdPersonId("primary")).toBe(false);
        expect(isEditableHouseholdPersonId("secondary:Name")).toBe(false);
    });

    it("fills gaps from evidence when family row is thin", () => {
        const seed = seedHouseholdContactValuesFromEvidence(
            {
                primary_person_id: "p-1",
                _opportunity_persons: [
                    { person_id: "p-1", display_name: "Kelly Kurzman", email: "", phone: "", is_primary: true },
                ],
            },
            { personId: "p-1", name: "Kelly Kurzman", email: "kelly@x.com", phone: "555" },
        );
        expect(seed?.values.email).toBe("kelly@x.com");
        expect(seed?.values.phone).toBe("555");
    });
});
