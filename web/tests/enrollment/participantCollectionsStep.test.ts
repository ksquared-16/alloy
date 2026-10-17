/**
 * THE PEOPLE STEP — relationship collections asked as part of the journey, from the same rows the
 * review edits and the submit sends. Driven with the real published Admissions v12 schema.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { validateFormSchema } from "@/lib/forms/schema";
import { compileParticipantArtifact } from "@/lib/enrollment/participantRuntime/compileParticipantArtifact";
import {
    collectionPrompt,
    collectionsAwaitingMembers,
    oneMemberOf,
} from "@/lib/enrollment/participantRuntime/collectionsAwaitingMembers";
import { composeFamilyEnrollmentExperience } from "@/lib/enrollment/family/familyEnrollmentExperience";

const SCHEMA = validateFormSchema(JSON.parse(readFileSync(resolve(__dirname, "../forms/__fixtures_admissions_v12_published.json"), "utf8")));
const row = (values: Record<string, unknown>) => ({ values });
const compiled = (values: Record<string, unknown>, groups: Record<string, { values: Record<string, unknown> }[]> = {}) =>
    compileParticipantArtifact(SCHEMA, values, undefined, groups);

describe("which collections the journey asks for", () => {
    it("with nobody named yet: guardians (1) and emergency contacts (2), in document order", () => {
        expect(collectionsAwaitingMembers(compiled({ untitled_yes_no_13: false }))).toEqual([
            { fieldId: "emergency_contacts", label: "Parents and guardians", complete: 0, needed: 1 },
            { fieldId: "emergency_contacts_3", label: "Emergency contacts", complete: 0, needed: 2 },
        ]);
    });

    it("other children are asked for only when the family said there are some", () => {
        const ids = (v: boolean) => collectionsAwaitingMembers(compiled({ untitled_yes_no_13: v })).map((c) => c.fieldId);
        expect(ids(true)).toContain("emergency_contacts_2");
        expect(ids(false)).not.toContain("emergency_contacts_2");
    });

    it("counts complete members only — a blank or half-filled row does not satisfy the minimum", () => {
        const ec = (groups: Record<string, { values: Record<string, unknown> }[]>) =>
            collectionsAwaitingMembers(compiled({ untitled_yes_no_13: false }, groups)).find((c) => c.fieldId === "emergency_contacts_3");
        expect(ec({ emergency_contacts_3: [row({}), row({ emergency_contacts_3_full_name: "Only a name" })] })?.complete).toBe(0);
        expect(ec({ emergency_contacts_3: [row({ emergency_contacts_3_full_name: "A", emergency_contacts_3_phone: "1" })] })?.complete).toBe(1);
        expect(ec({ emergency_contacts_3: [
            row({ emergency_contacts_3_full_name: "A", emergency_contacts_3_phone: "1" }),
            row({ emergency_contacts_3_full_name: "B", emergency_contacts_3_phone: "2" }),
        ] })).toBeUndefined();
    });

    it("nothing is asked once every shown collection meets its minimum", () => {
        expect(collectionsAwaitingMembers(compiled({ untitled_yes_no_13: false }, {
            emergency_contacts: [row({ emergency_contacts_full_name: "Pat", emergency_contacts_phone: "1" })],
            emergency_contacts_3: [
                row({ emergency_contacts_3_full_name: "A", emergency_contacts_3_phone: "1" }),
                row({ emergency_contacts_3_full_name: "B", emergency_contacts_3_phone: "2" }),
            ],
        }))).toEqual([]);
    });
});

describe("the prompt speaks about people, never numbered slots", () => {
    it.each([
        ["Emergency contacts", 0, 2, "Add an emergency contact", "We need 2 — 0 added so far."],
        ["Emergency contacts", 1, 2, "Add another emergency contact", "We need 2 — 1 added so far."],
        ["Parents and guardians", 0, 1, "Add a parent or guardian", "We need one parent or guardian."],
        ["Other children in your household", 0, 1, "Add another child in your household", "We need one other child in your household."],
    ])("%s (%i of %i)", (label, complete, needed, title, detail) => {
        expect(collectionPrompt({ fieldId: "g", label, complete, needed })).toEqual({ title, detail });
    });

    it("singularizes the people it asks for", () => {
        expect(oneMemberOf("Authorized pickups")).toBe("authorized pickup");
        expect(oneMemberOf("Physicians")).toBe("physician");
    });
});

describe("the family's payment row", () => {
    it("a fee that is not due yet says so — not \"0.00 due\"", () => {
        const f = composeFamilyEnrollmentExperience({
            opportunityId: null, familyName: "F", sharedInformationComplete: false, children: [],
            financials: { state: "NOT_DUE", grossCents: 0, expectedFundingCents: 0, collectibleNowCents: 0, appliedCents: 0, outstandingCents: 0, lines: [] },
        });
        expect(f.progress.find((p) => p.key === "payment")?.detail).toBe("Not due yet");
    });
});
