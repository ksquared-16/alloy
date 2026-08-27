/**
 * One artifact, one set of values — the document and the list beside it must agree.
 *
 * The review list used to compile from the draft form payload while the document rendered from a
 * fuller assembly, so a parent could read "Guardian: Sylvie Bergeron" on the document and see that
 * same destination blank in the summary next to it. Two answers to one question.
 */

import { describe, expect, it } from "vitest";

import { resolveArtifactValues } from "@/lib/enrollment/participantRuntime/resolveArtifactValues";
import type { ChildParty } from "@/lib/enrollment/participantRuntime/childPartyRuntime";
import type { FormSchemaV1 } from "@/lib/forms/schema";

const SCHEMA = {
    title: "Admissions",
    fields: [
        { id: "child_name", type: "text", label: "Student Name" },
        { id: "g1_name", type: "text", label: "Parent/Guardian #1 Name" },
        { id: "g1_phone", type: "text", label: "Parent/Guardian #1 Phone Number", field_source: { entity_type: "person", field_key: "phone" } },
        { id: "e1_phone", type: "text", label: "Emergency Contact #1 Phone Number", field_source: { entity_type: "person", field_key: "phone" } },
        { id: "e2_phone", type: "text", label: "Emergency Contact #2 Phone Number", field_source: { entity_type: "person", field_key: "phone" } },
        { id: "doc_name", type: "text", label: "Primary Physician Name" },
        { id: "doc_phone", type: "text", label: "Primary Physician Phone Number", field_source: { entity_type: "person", field_key: "phone" } },
        { id: "note", type: "text", label: "Anything else we should know" },
    ],
    sections: [{ id: "s", title: "Page 1", field_ids: ["child_name", "g1_name", "g1_phone", "e1_phone", "e2_phone", "doc_name", "doc_phone", "note"] }],
} as unknown as FormSchemaV1;

const party = (name: string, roles: string[], priority: number, phone: string): ChildParty => ({
    party_id: name, person_id: name, roles, priority, full_name: name, phone, email: null,
});

const PARTIES = [
    party("Sylvie Bergeron", ["guardian"], 1, "5035550211"),
    party("Thierry Bergeron", ["emergency_contact"], 1, "5035550193"),
    party("Colette Fournier", ["emergency_contact"], 2, "5035550233"),
];

const resolve = (draftValues: Record<string, unknown>, parties = PARTIES) =>
    resolveArtifactValues({
        schema: SCHEMA,
        draftValues,
        prefilled: { note: "from the conversation", g1_phone: "5559999999" },
        parties,
        nowIso: "2026-08-27T10:00:00.000Z",
    });

describe("the resolved values every surface reads", () => {
    it("fills each party destination from its OWN person", () => {
        const { values } = resolve({});
        expect(values.g1_name).toBe("Sylvie Bergeron");
        expect(values.g1_phone).toBe("5035550211");
        expect(values.e1_phone).toBe("5035550193");
        expect(values.e2_phone).toBe("5035550233");
    });

    it("leaves a destination blank when nobody holds that role", () => {
        // The physician was declined. A blank is the truth; someone else's number would not be.
        const { values } = resolve({});
        expect(values.doc_phone).toBeUndefined();
        expect(values.doc_name).toBeUndefined();
    });

    it("CLEARS a stale draft value on a party-owned destination", () => {
        /*
         * The contamination case at the seam the review list now reads.
         *
         * A draft ordinarily WINS — a correction the parent just made must not be overwritten by
         * the conversation's older answer. A party destination is the exception, because no earlier
         * step can know that these three boxes belong to three different people: whatever is sitting
         * in one of them, the canonical party is the answer.
         */
        const { values } = resolve({ g1_phone: "9998887777", e1_phone: "9998887777", e2_phone: "9998887777" });
        expect(values.g1_phone).toBe("5035550211");
        expect(values.e1_phone).toBe("5035550193");
        expect(values.e2_phone).toBe("5035550233");
    });

    it("still lets the draft win on a NON-party destination", () => {
        // The rule is narrow. A correction to an ordinary answer survives prefill, as it always did.
        const { values } = resolve({ note: "what the parent typed at review" });
        expect(values.note).toBe("what the parent typed at review");
        expect(values.child_name).toBeUndefined();
    });

    it("names every party-owned destination, filled or blank", () => {
        const { partyOwnedFieldIds } = resolve({});
        for (const id of ["g1_name", "g1_phone", "e1_phone", "e2_phone", "doc_name", "doc_phone"]) {
            expect(partyOwnedFieldIds.has(id), id).toBe(true);
        }
        expect(partyOwnedFieldIds.has("note"), "an ordinary question is nobody's destination").toBe(false);
    });

    it("is deterministic, and a correction moves exactly one value", () => {
        const before = resolve({}).values;
        expect(resolve({}).values).toEqual(before);

        const corrected = PARTIES.map((p) => (p.full_name === "Colette Fournier" ? { ...p, phone: "5035550999" } : p));
        const after = resolve({}, corrected).values;
        const moved = Object.keys(after).filter((k) => after[k] !== before[k]);
        expect(moved).toEqual(["e2_phone"]);
    });
});
