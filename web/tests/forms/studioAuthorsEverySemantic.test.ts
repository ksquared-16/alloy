/**
 * WHAT THE STUDIO CAN ACTUALLY AUTHOR — the second half of `studioOffersEverySemantic`.
 *
 * Offering an answer type in the menu is one thing; being able to TURN A SEMANTIC ON is another,
 * and the real end-to-end certification found the difference the hard way. `structured_address`
 * was missing from the menu, and `supplied_by` was in the menu's reach but impossible to switch on:
 * the inspector declares it by sending `{ source_kind, source_key: "" }` — the administrator has
 * not typed a key yet — and `updateField` dropped exactly that patch, so the checkbox never
 * became checked and the "Which charge template?" box never appeared.
 *
 * These tests drive the same functions the inspector's own handlers call, in the same order, so
 * "the administrator ticks the box and then names the template" is the thing under test.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addField, createBlankSchema, setPartyEntryFields, updateField } from "@/lib/forms/formBuilderSchema";
import { isConfigurationSupplied, suppliedByOf } from "@/lib/forms/fieldSemantics";
import { validateFormSchema } from "@/lib/forms/schema";

const INSPECTOR = join(process.cwd(), "app/adminV2/pos/ProcessingFormQuestionInspector.tsx");

function schemaWithNumber() {
    const blank = createBlankSchema("Cert");
    const { schema, fieldId } = addField(blank, { type: "number", label: "Registration fee" });
    return { schema, fieldId };
}

describe("turning a configuration-supplied value on", () => {
    it("holds the declaration the moment the box is ticked, before any key is typed", () => {
        const { schema, fieldId } = schemaWithNumber();
        // Exactly the patch the inspector's checkbox sends.
        const ticked = updateField(schema, fieldId, {
            supplied_by: { source_kind: "charge_template", source_key: "" },
        });
        const field = ticked.fields.find((f) => f.id === fieldId)!;
        expect(suppliedByOf(field)).not.toBeNull();
        expect(isConfigurationSupplied(field)).toBe(true);
    });

    it("keeps the checkbox checked, so the key input is reachable at all", () => {
        const { schema, fieldId } = schemaWithNumber();
        const ticked = updateField(schema, fieldId, {
            supplied_by: { source_kind: "charge_template", source_key: "" },
        });
        // The inspector renders the key input on `field.supplied_by` being truthy. If the patch is
        // dropped there is no second step to take.
        expect(Boolean(ticked.fields.find((f) => f.id === fieldId)!.supplied_by)).toBe(true);
    });

    it("then stores the key the administrator types", () => {
        const { schema, fieldId } = schemaWithNumber();
        const ticked = updateField(schema, fieldId, {
            supplied_by: { source_kind: "charge_template", source_key: "" },
        });
        const named = updateField(ticked, fieldId, {
            supplied_by: { source_kind: "charge_template", source_key: " registration_fee " },
        });
        expect(suppliedByOf(named.fields.find((f) => f.id === fieldId)!)).toEqual({
            source_kind: "charge_template",
            source_key: "registration_fee",
            resolve_at: "generation",
        });
    });

    it("un-ticking removes the declaration entirely", () => {
        const { schema, fieldId } = schemaWithNumber();
        const on = updateField(schema, fieldId, {
            supplied_by: { source_kind: "charge_template", source_key: "registration_fee" },
        });
        const off = updateField(on, fieldId, { supplied_by: null });
        expect(off.fields.find((f) => f.id === fieldId)!.supplied_by).toBeUndefined();
    });

    it("an incomplete declaration cannot be PUBLISHED — the key is required there", () => {
        const { schema, fieldId } = schemaWithNumber();
        const ticked = updateField(schema, fieldId, {
            supplied_by: { source_kind: "charge_template", source_key: "" },
        });
        expect(() => validateFormSchema(ticked)).toThrow();
        const named = updateField(ticked, fieldId, {
            supplied_by: { source_kind: "charge_template", source_key: "registration_fee" },
        });
        expect(() => validateFormSchema(named)).not.toThrow();
    });

    it("the inspector says the declaration is incomplete rather than leaving it to publish", () => {
        const src = readFileSync(INSPECTOR, "utf8");
        expect(src).toContain('data-testid="form-builder-supplied-needs-key"');
        // Guarded on the KEY being empty, not merely on the declaration existing.
        expect(src).toMatch(/field\.supplied_by\.source_key\.trim\(\)\s*\?\s*null\s*:/);
    });
});

describe("the questions asked about each entry belong to the kind", () => {
    it("a child collection asks for a child's identity, not a person's phone and relationship", () => {
        const blank = createBlankSchema("Cert");
        const { schema, fieldId } = addField(blank, {
            type: "party_collection",
            label: "Other children in your household",
            party_collection: {
                action_key: "add_emergency_contact",
                subject: "person",
                role: "emergency_contact",
                fields: [
                    { type: "short_text", label: "Full name", required: true },
                    { type: "short_text", label: "Phone", required: true },
                    { type: "short_text", label: "Relationship to the child" },
                ],
            },
        });
        const switched = setPartyEntryFields(schema, fieldId, [
            { type: "short_text", label: "Full name", required: true },
            { type: "date", label: "Date of birth" },
        ]);
        const group = switched.fields.find((f) => f.id === fieldId)!;
        if (group.type !== "group") throw new Error("a party collection is a group");
        expect(group.fields.map((f) => f.label)).toEqual(["Full name", "Date of birth"]);
        expect(group.fields.map((f) => f.type)).toEqual(["text", "date"]);
        // Nothing of the previous kind survives.
        expect(JSON.stringify(group.fields)).not.toMatch(/Relationship to the child|Phone/);
    });

    it("entry ids are derived from the group's own id, one naming rule", () => {
        const blank = createBlankSchema("Cert");
        const { schema, fieldId } = addField(blank, {
            type: "party_collection",
            label: "Siblings",
            party_collection: { action_key: "add_child", subject: "child", fields: [] },
        });
        const withFields = setPartyEntryFields(schema, fieldId, [{ type: "date", label: "Date of birth" }]);
        const group = withFields.fields.find((f) => f.id === fieldId)!;
        if (group.type !== "group") throw new Error("a party collection is a group");
        expect(group.fields[0]!.id).toBe(`${fieldId}_date_of_birth`);
    });

    it("every party kind the menu offers states its own entry questions", () => {
        const src = readFileSync(INSPECTOR, "utf8");
        const kinds = [...src.matchAll(/\{ value: "(add_[a-z_]+)", label:/g)].map((m) => m[1]!);
        expect(kinds.length).toBeGreaterThan(0);
        for (const kind of kinds) {
            const preset = new RegExp(`${kind}: \\{[^}]*fields:`).test(src);
            expect(preset, `${kind} has no entry questions of its own`).toBe(true);
        }
    });

    it("changing the kind replaces the entry questions, and never writes them into the declaration", () => {
        const src = readFileSync(INSPECTOR, "utf8");
        expect(src).toContain("setPartyEntryFields(withKind, field.id, entryQuestions)");
        // `fields` must be destructured out before the declaration patch is spread.
        expect(src).toMatch(/const \{ fields: entryQuestions, \.\.\.declaration \} = preset/);
    });
});
