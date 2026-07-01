import { describe, it, expect } from "vitest";
import { isRecipientSelected, toggleRecipientSelection, isRecipientEligible, selectionSummary } from "@/lib/communications/v2/familyWorkspace/composerSelection";
import type { RecipientVM } from "@/lib/communications/v2/familyWorkspace/types";

const mk = (id: string, name: string, emailOk: boolean): RecipientVM => ({
    id, displayName: name, roleType: "parent", roleLabel: "Parent", isPrimary: true, tier: "primary", email: emailOk ? "a@b.com" : null, phone: null,
    channels: {
        email: { hasAddress: emailOk, providerBound: true, available: emailOk, unavailableReason: emailOk ? null : "No email on file", marketing: "unset", transactional: "unset", canSendTransactional: emailOk, canSendMarketing: emailOk },
        sms: { hasAddress: false, providerBound: true, available: false, unavailableReason: "No phone on file", marketing: "unset", transactional: "unset", canSendTransactional: false, canSendMarketing: false },
    },
});
const mom = mk("p-mom", "Sarah Rivera", true);
const dad = mk("p-dad", "Carlos Rivera", false);

describe("composerSelection", () => {
    it("toggles eligible recipients on/off", () => {
        let sel: string[] = [];
        sel = toggleRecipientSelection(sel, "p-mom", true);
        expect(sel).toEqual(["p-mom"]);
        sel = toggleRecipientSelection(sel, "p-mom", true);
        expect(sel).toEqual([]);
    });
    it("never selects an ineligible recipient", () => {
        expect(toggleRecipientSelection([], "p-dad", false)).toEqual([]);
    });
    it("isRecipientSelected / isRecipientEligible", () => {
        expect(isRecipientSelected(["p-mom"], "p-mom")).toBe(true);
        expect(isRecipientEligible(mom, "email")).toBe(true);
        expect(isRecipientEligible(dad, "email")).toBe(false);
        expect(isRecipientEligible(dad, "note")).toBe(true);
    });
    it("summarizes selection", () => {
        expect(selectionSummary([], [mom, dad])).toBe("Select recipients");
        expect(selectionSummary(["p-mom"], [mom, dad])).toBe("Sarah Rivera");
        expect(selectionSummary(["p-mom", "p-dad"], [mom, dad])).toBe("Sarah Rivera +1");
    });
});
