/**
 * The bindings Admissions may legitimately carry — and the ones it must not.
 *
 * The runtime became honest enough to expose a configuration problem: the certified Admissions Form
 * connected 4 of its 80 questions to Alloy, so even a family the school has known for months started
 * enrolment with almost nothing reusable. The wrong answer is to bind eighty fields. Every binding
 * is a claim that some record is the AUTHORITY for a fact, and a wrong claim prints one person's
 * answer in another person's box or puts health truth where the Health domain cannot govern it.
 *
 * So this pins the shape of the answer rather than the count: what a legitimate binding looks like,
 * and the four failures that were specifically forbidden.
 *
 * @see docs/audits/active/real-enrollment-certification-v1/ADMISSIONS-CANONICAL-OWNERSHIP.md
 */

import { describe, expect, it } from "vitest";

import { resolveMutationCapability } from "@/lib/fields/mutation/resolveMutationCapability";
import { CUSTOMER_MEMBER_CONFIG_FIELD_KEYS } from "@/lib/fields/customerMemberFieldRegistry";
import { OPERATIONAL_FORM_SYSTEM_FIELDS } from "@/lib/forms/systemFieldRegistry";
import { ENROLLMENT_CONFIRMATION_REQUIRED_KEYS } from "@/lib/enrollment/participantRuntime/enrollmentConfirmationPolicy";
import { naturalFieldLabel } from "@/lib/enrollment/participantRuntime/participantTurnPresentation";
import { artifactPartySlots, broadcastingPartyFieldIds } from "@/lib/enrollment/participantRuntime/artifactPartySlots";
import type { FormSchemaV1 } from "@/lib/forms/schema";

/** The nine bindings this slice authored onto Admissions v8, by destination. */
const AUTHORED = {
    field_1: { entity_type: "customer_member", field_key: "display_name", shared_value_key: "child_full_name" },
    field_78: { entity_type: "customer_member", field_key: "display_name", shared_value_key: "child_full_name" },
    field_6: { entity_type: "guardian", field_key: "guardian_name", shared_value_key: "guardian_name" },
    field_77: { entity_type: "guardian", field_key: "guardian_name", shared_value_key: "guardian_name" },
    field_50: { entity_type: "customer_member", field_key: "eating_habits" },
    field_51: { entity_type: "customer_member", field_key: "special_diet" },
    field_52: { entity_type: "customer_member", field_key: "favorite_foods" },
    field_53: { entity_type: "customer_member", field_key: "foods_refused" },
    field_73: { entity_type: "customer_member", field_key: "temperament" },
} as const;

describe("a binding needs an owner that can actually hold the answer", () => {
    it("every child-owned destination resolves to a writable capability", () => {
        for (const [id, src] of Object.entries(AUTHORED)) {
            if (src.entity_type !== "customer_member") continue;
            const cap = resolveMutationCapability(`${src.entity_type}.${src.field_key}`);
            expect(cap?.writable, `${id} -> ${src.field_key} must be writable`).toBe(true);
        }
    });

    it("the child-profile destinations are the ones the profile registry actually seeds", () => {
        const profile = new Set<string>(CUSTOMER_MEMBER_CONFIG_FIELD_KEYS);
        for (const key of ["eating_habits", "special_diet", "favorite_foods", "foods_refused", "temperament"]) {
            expect(profile.has(key), `${key} must be a seeded child-profile field`).toBe(true);
        }
    });

    it("binds no Health foundation kind", () => {
        /*
         * D-H5. The profile registry states it directly: allergy, condition, medication and
         * immunization are Health's, and Enrollment must not create a competing destination. Nine
         * Admissions questions are health truth and every one of them stays Form-only.
         */
        const bound = Object.values(AUTHORED).map((s) => s.field_key);
        for (const health of ["allergies", "medical_notes", "medication_flag", "allergy_notes", "immunization"]) {
            expect(bound, `${health} must not be bound by Enrollment`).not.toContain(health);
        }
    });

    it("uses no deprecated registry row", () => {
        const deprecated = new Set(
            OPERATIONAL_FORM_SYSTEM_FIELDS.filter((e) => e.deprecated).map((e) => e.field_key),
        );
        expect(deprecated.size).toBeGreaterThan(0);
        for (const src of Object.values(AUTHORED)) expect(deprecated.has(src.field_key)).toBe(false);
    });

    it("sends a whole name to a whole-name column, never to first_name", () => {
        // The named precedent: a one-box "Student Name" bound to `child_first_name` would file a
        // full name as a given name for every family that used the form.
        for (const id of ["field_1", "field_78"]) {
            expect(AUTHORED[id as keyof typeof AUTHORED].field_key).toBe("display_name");
        }
        expect(AUTHORED.field_6.field_key).toBe("guardian_name");
    });

    it("binds no address, because one composite box is not five canonical parts", () => {
        const bound = Object.values(AUTHORED).map((s) => s.field_key);
        for (const part of ["address", "address_line1", "address_line2", "city", "state", "postal_code"]) {
            expect(bound).not.toContain(part);
        }
    });

    it("puts both new shared keys in front of the parent as confirmations", () => {
        // A known fact nobody is asked about is a fact nobody has verified. Both are D-100 keys, so
        // a family whose record holds them meets "is this still right?" rather than a blank box.
        expect(ENROLLMENT_CONFIRMATION_REQUIRED_KEYS.has("child_full_name")).toBe(true);
        expect(ENROLLMENT_CONFIRMATION_REQUIRED_KEYS.has("guardian_name")).toBe(true);
    });

    it("names the new facts in words, not in the form's own printing", () => {
        // The summary row read "Student Name: · Wrigley Kurzman", trailing colon and all, beside a
        // guardian row that correctly read "Name" — because only the guardian's key was mapped.
        expect(naturalFieldLabel("Student Name:", "child_full_name")).toBe("full name");
        expect(naturalFieldLabel("Parent/Guardian #1 Name:", "guardian_name")).toBe("name");
    });
});

describe("two boxes, one person — and never two people, one datum", () => {
    /** The four numbered-people rows of the real packet, with the two bindings this slice added. */
    const schema = {
        schema_version: 1,
        title: "t",
        fields: [
            { id: "field_1", type: "text", label: "Student Name:", required: true, field_source: AUTHORED.field_1 },
            { id: "field_78", type: "text", label: "Student Name:", required: true, field_source: AUTHORED.field_78 },
            { id: "field_6", type: "text", label: "Parent/Guardian #1 Name:", required: true, field_source: AUTHORED.field_6 },
            { id: "field_77", type: "text", label: "Parent Name:", required: true, field_source: AUTHORED.field_77 },
            { id: "field_9", type: "text", label: "Parent/Guardian #2 Name:", required: true },
            { id: "field_20", type: "text", label: "Emergency Contact #1 Phone Number:", required: true },
        ],
        sections: [{ id: "s", title: "Contact Information", field_ids: ["field_1", "field_78", "field_6", "field_77", "field_9", "field_20"] }],
    } as unknown as FormSchemaV1;

    it("gives the shared guardian binding to exactly one party", () => {
        const byBinding = new Map<string, Set<string>>();
        for (const slot of artifactPartySlots(schema, [])) {
            const f = (schema.fields as { id: string; field_source?: { shared_value_key?: string } }[]).find((x) => x.id === slot.field_id);
            const key = f?.field_source?.shared_value_key;
            if (!key) continue;
            if (!byBinding.has(key)) byBinding.set(key, new Set());
            byBinding.get(key)!.add(`${slot.role}#${slot.ordinal}`);
        }
        expect([...(byBinding.get("guardian_name") ?? [])]).toEqual(["guardian#1"]);
        for (const [key, parties] of byBinding) {
            expect(parties.size, `${key} is claimed by ${[...parties].join(",")}`).toBe(1);
        }
    });

    it("suppresses nothing — no question leaves the conversation", () => {
        /*
         * The broadcast guard removes a party destination whose binding is shared by MORE THAN ONE
         * party, because one answer would otherwise print in several people's boxes. Binding the
         * second guardian's name to the same `guardian_name` would have tripped it and silently
         * deleted both guardians' name questions.
         */
        expect([...broadcastingPartyFieldIds(schema, [])]).toEqual([]);
    });
});
