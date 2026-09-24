/**
 * Authoring, saving, reloading — the four new statements survive the round trip an administrator
 * actually performs, and the schema refuses the incoherent combinations rather than leaving two
 * readers to disagree.
 *
 * Persist goes through `normalizeFormSchemaForPersist` and comes back through `validateFormSchema`,
 * which is the same pair the save path uses. A statement that cannot survive that is a statement
 * the product does not really have.
 */

import { describe, expect, it } from "vitest";

import { addField, createBlankSchema, normalizeFormSchemaForPersist, updateField } from "@/lib/forms/formBuilderSchema";
import { validateFormSchema } from "@/lib/forms/schema";
import {
    absenceLabel,
    addressBindingOf,
    addressParts,
    isConfigurationSupplied,
    isFormOnlyEvidence,
    pendingOwnerHint,
} from "@/lib/forms/fieldSemantics";
import { formFieldAsksParticipant } from "@/lib/forms/formFieldCollectsValue";

/** Save and reload, exactly as the product does. */
const roundTrip = (schema: Parameters<typeof normalizeFormSchemaForPersist>[0]) =>
    validateFormSchema(JSON.parse(JSON.stringify(normalizeFormSchemaForPersist(schema))));

const blank = () => createBlankSchema("Admissions draft");

describe("an administrator authors an absence answer", () => {
    it("survives save and reload with the words they chose", () => {
        const added = addField(blank(), { type: "short_text", label: "Allergies" });
        const edited = updateField(added.schema, added.fieldId, {
            absence: { offered: true, label: "No known allergies" },
        });
        const reloaded = roundTrip(edited);
        expect(absenceLabel(reloaded.fields.find((f) => f.id === added.fieldId)!)).toBe("No known allergies");
    });

    it("turning it off removes it rather than leaving an empty statement", () => {
        const added = addField(blank(), { type: "short_text", label: "Allergies" });
        const on = updateField(added.schema, added.fieldId, { absence: { offered: true, label: "None" } });
        const off = updateField(on, added.fieldId, { absence: null });
        expect(JSON.stringify(roundTrip(off))).not.toContain("absence");
    });
});

describe("an administrator marks a question as kept on the form for now", () => {
    it("survives the round trip with the owner they named", () => {
        const added = addField(blank(), { type: "long_text", label: "Immunization notes" });
        const edited = updateField(added.schema, added.fieldId, {
            retention: { kind: "form_only_pending_canonical_owner", owner_hint: "Health" },
        });
        const field = roundTrip(edited).fields.find((f) => f.id === added.fieldId)!;
        expect(isFormOnlyEvidence(field)).toBe(true);
        expect(pendingOwnerHint(field)).toBe("Health");
        // Still an ordinary question for the family.
        expect(formFieldAsksParticipant(field)).toBe(true);
    });

    it("clears a canonical binding rather than letting the operator author a contradiction", () => {
        const added = addField(blank(), {
            type: "short_text",
            label: "Immunization notes",
            field_source: { entity_type: "customer_member", field_key: "notes" },
        });
        const edited = updateField(added.schema, added.fieldId, {
            retention: { kind: "form_only_pending_canonical_owner" },
        });
        const field = roundTrip(edited).fields.find((f) => f.id === added.fieldId)!;
        expect(field.field_source, "a held question must not also claim an owner").toBeUndefined();
        expect(isFormOnlyEvidence(field)).toBe(true);
    });
});

describe("an administrator points a value at organization configuration", () => {
    it("stores the reference and survives reload", () => {
        const added = addField(blank(), { type: "short_text", label: "Registration fee" });
        const edited = updateField(added.schema, added.fieldId, {
            supplied_by: { source_kind: "charge_template", source_key: "registration_fee" },
        });
        const reloaded = roundTrip(edited);
        const field = reloaded.fields.find((f) => f.id === added.fieldId)!;
        expect(isConfigurationSupplied(field)).toBe(true);
        expect(field.supplied_by?.source_key).toBe("registration_fee");
        expect(field.supplied_by?.resolve_at).toBe("generation");
        expect(formFieldAsksParticipant(field)).toBe(false);
        expect(JSON.stringify(reloaded), "the Form must not carry a second copy of the amount").not.toMatch(
            /amount_cents|"amount"/,
        );
    });

    it("drops an absence answer, because a supplied value is not the family's question", () => {
        const added = addField(blank(), { type: "short_text", label: "Registration fee" });
        const withAbsence = updateField(added.schema, added.fieldId, { absence: { offered: true } });
        const supplied = updateField(withAbsence, added.fieldId, {
            supplied_by: { source_kind: "charge_template", source_key: "registration_fee" },
        });
        // The schema refuses the pair; the builder removes it so nobody meets that as an error.
        expect(() => roundTrip(supplied)).not.toThrow();
        expect(roundTrip(supplied).fields.find((f) => f.id === added.fieldId)!.absence).toBeUndefined();
    });
});

describe("an administrator adds a structured address", () => {
    const authored = () => {
        const added = addField(blank(), {
            type: "structured_address",
            label: "Home address",
            address: { subject: "person", role: "guardian" },
        });
        return { id: added.fieldId, schema: roundTrip(added.schema) };
    };

    it("is ONE question in the builder and one address in the schema", () => {
        const { id, schema } = authored();
        const group = schema.fields.find((f) => f.id === id)!;
        expect(addressBindingOf(group)).toEqual({ subject: "person", role: "guardian" });
        expect(schema.fields.filter((f) => f.id === id)).toHaveLength(1);
    });

    it("composes the four canonical Person fields — no new address model", () => {
        const { id, schema } = authored();
        const group = schema.fields.find((f) => f.id === id)!;
        expect(addressParts(group).map((p) => p.part)).toEqual(["address_line1", "city", "state", "postal_code"]);
        for (const { field } of addressParts(group)) {
            expect(field.field_source?.entity_type).toBe("person");
        }
    });

    it("names no parent_address_1 / parent_address_2 concepts", () => {
        const { schema } = authored();
        expect(JSON.stringify(schema)).not.toMatch(/address_1\b|address_2\b|parent_address/);
    });

    it("appears once in its section, not as four separate questions", () => {
        const { id, schema } = authored();
        const section = schema.sections.find((sec) => sec.field_ids.includes(id))!;
        expect(section.field_ids.filter((f) => f.startsWith(id))).toEqual([id]);
    });
});
