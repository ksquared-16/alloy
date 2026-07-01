import { describe, expect, it } from "vitest";
import {
    buildConsentByContact,
    combineMarketingStates,
    consentOperatorStatus,
    personConsentFromPreferenceRows,
    resolveHouseholdConsentDisplay,
} from "@/lib/communications/v2/householdCommunicationPreferences";

describe("householdCommunicationPreferences", () => {
    it("maps preference rows to email/sms/marketing triplet", () => {
        const rows = [
            { person_id: "p1", category: "email_transactional", state: "opted_in" },
            { person_id: "p1", category: "sms_transactional", state: "opted_out" },
            { person_id: "p1", category: "email_marketing", state: "opted_in" },
            { person_id: "p1", category: "sms_marketing", state: "unset" },
        ];
        expect(personConsentFromPreferenceRows(rows, "p1")).toEqual({
            email: "opted_in",
            sms: "opted_out",
            marketing: "unset",
        });
    });

    it("combines marketing categories with strictest-wins logic", () => {
        expect(combineMarketingStates("opted_in", "opted_in")).toBe("opted_in");
        expect(combineMarketingStates("opted_out", "opted_in")).toBe("opted_out");
        expect(combineMarketingStates("unset", "opted_in")).toBe("unset");
    });

    it("uses primary contact for household display", () => {
        const byContact = buildConsentByContact(["p1", "p2"], [
            { person_id: "p1", category: "email_transactional", state: "opted_in" },
            { person_id: "p2", category: "email_transactional", state: "opted_out" },
        ]);
        expect(resolveHouseholdConsentDisplay(byContact, "p1", ["p2"]).email).toBe("opted_in");
        expect(consentOperatorStatus("unset")).toBe("Unknown");
        expect(consentOperatorStatus("opted_in")).toBe("Allowed");
        expect(consentOperatorStatus("opted_out")).toBe("Blocked");
    });
});
