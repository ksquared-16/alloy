/**
 * What staff may change on a person's communication preferences — and what they may not.
 */
import { describe, expect, it } from "vitest";

import { allowedPreferenceChanges } from "@/lib/communications/v2/personCommunicationPreferences";
import { ADD_PERSON_EXCLUDED_FIELD_KEYS } from "@/components/admin/opportunity/actions/AddPersonModal";

describe("allowedPreferenceChanges", () => {
    it("routine messages: staff can turn them off, and back on", () => {
        expect(allowedPreferenceChanges({ control: "opt_out", state: "unset", lastSource: null })).toEqual({ allowed: ["Blocked"], lockedReason: null });
        expect(allowedPreferenceChanges({ control: "opt_out", state: "opted_out", lastSource: "operator_person_record" })).toEqual({ allowed: ["Allowed"], lockedReason: null });
    });

    it("a STOP or an unsubscribe is the person's own — staff cannot reverse it", () => {
        const stop = allowedPreferenceChanges({ control: "opt_out", state: "opted_out", lastSource: "sms_keyword" });
        expect(stop.allowed).toEqual([]);
        expect(stop.lockedReason).toMatch(/STOP/);
        expect(allowedPreferenceChanges({ control: "opt_out", state: "opted_out", lastSource: "recipient_unsubscribe" }).allowed).toEqual([]);
        expect(allowedPreferenceChanges({ control: "always_allowed", state: "opted_out", lastSource: "sms_keyword" }).allowed).toEqual([]);
    });

    it("marketing needs the person's own opt-in: staff may only opt out", () => {
        expect(allowedPreferenceChanges({ control: "opt_in", state: "unset", lastSource: null }).allowed).toEqual(["Blocked"]);
        expect(allowedPreferenceChanges({ control: "opt_in", state: "opted_out", lastSource: null }).allowed).toEqual([]);
    });

    it("essential messages are policy, not a switch", () => {
        expect(allowedPreferenceChanges({ control: "always_allowed", state: "unset", lastSource: null }).allowed).toEqual([]);
    });
});

describe("Add Person does not offer unenforced consent checkboxes", () => {
    it.each(["sms_opt_in", "email_opt_in", "communication_opt_out", "sms_consent", "email_consent"])("%s is not asked", (key) => {
        expect(ADD_PERSON_EXCLUDED_FIELD_KEYS.has(key)).toBe(true);
    });
});
