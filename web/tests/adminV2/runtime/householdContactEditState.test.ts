import { describe, expect, it } from "vitest";

import { buildHouseholdCardEvidence } from "@/lib/adminV2/runtime/focusPanel/household/buildHouseholdCardEvidence";
import {
    householdContactDirty,
    householdContactPatch,
    seedHouseholdContactValues,
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
            tour: { scheduled: false, startAt: null, statusLabel: null },
        },
        capabilities: { canMutate: true, maskedChannels: false },
        status: "ready",
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

        const mergedTruth = mergePersonContactIntoFocusPanelTruth(TRUTH, {
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
