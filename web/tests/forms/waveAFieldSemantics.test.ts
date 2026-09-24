/**
 * The four things a Form can now SAY about a question.
 *
 * Each follows the move `party_collection` made for repeated people: the structure already existed,
 * and what was missing was the Form stating what it means. None of them creates a store, a writer,
 * or a second copy of anything canonical.
 *
 *   absence      "there are none" is an answer, and this is what it is called
 *   retention    nothing canonical owns this yet, and the Form holds it on purpose
 *   supplied_by  the organisation owns the value; the family is never asked
 *   address      these fields are the parts of one address
 */

import { describe, expect, it } from "vitest";

import {
    ABSENCE_VALUE,
    DEFAULT_ABSENCE_LABEL,
    absenceLabel,
    addressBindingOf,
    addressPartOf,
    addressParts,
    displayWithAbsence,
    formatAddressLine,
    isConfigurationSupplied,
    isFormOnlyEvidence,
    pendingOwnerHint,
} from "@/lib/forms/fieldSemantics";
import { formFieldAsksParticipant } from "@/lib/forms/formFieldCollectsValue";
import { validateFormSchema } from "@/lib/forms/schema";
import type { FormField } from "@/lib/forms/schema";

const field = (o: Record<string, unknown>) => o as unknown as FormField;

const schema = (fields: unknown[]) => ({
    schema_version: 1,
    title: "T",
    fields,
    sections: [{ id: "s", title: "S", field_ids: (fields as { id: string }[]).map((f) => f.id) }],
});

describe("absence — 'there are none' is an authored answer", () => {
    it("uses the words the author wrote", () => {
        expect(absenceLabel(field({ id: "a", type: "text", label: "Allergies", absence: { offered: true, label: "No known allergies" } }))).toBe(
            "No known allergies",
        );
    });

    it("falls back to plain 'None', never to the question's own wording", () => {
        expect(absenceLabel(field({ id: "a", type: "text", label: "Allergies", absence: { offered: true } }))).toBe(DEFAULT_ABSENCE_LABEL);
    });

    it("offers nothing where the author said nothing — no label sniffing", () => {
        // The rule this replaced returned "No known allergies" for ANY label containing "allerg".
        expect(absenceLabel(field({ id: "a", type: "text", label: "Allergy information" }))).toBeNull();
        expect(absenceLabel(field({ id: "b", type: "text", label: "Please list any food sensitivities" }))).toBeNull();
    });

    it("keeps unanswered, explicitly-none and detail as three different states", () => {
        const f = field({ id: "a", type: "text", label: "Allergies", absence: { offered: true, label: "No known allergies" } });
        expect(displayWithAbsence(f, undefined)).toEqual({ kind: "unanswered", text: "" });
        expect(displayWithAbsence(f, "")).toEqual({ kind: "unanswered", text: "" });
        expect(displayWithAbsence(f, ABSENCE_VALUE)).toEqual({ kind: "absent", text: "No known allergies" });
        expect(displayWithAbsence(f, "Peanuts")).toEqual({ kind: "detail", text: "Peanuts" });
    });

    it("stores a structured marker, never the button's own words", () => {
        // Writing the label is what once printed "Middle name: Nothing to add" on a signed form.
        expect(ABSENCE_VALUE).not.toContain("None");
        expect(ABSENCE_VALUE).not.toContain("allerg");
    });

    it("round-trips a custom label through the schema", () => {
        const parsed = validateFormSchema(
            schema([{ id: "a", type: "text", label: "Dietary needs", absence: { offered: true, label: "Not applicable" } }]),
        );
        expect(absenceLabel(parsed.fields[0]!)).toBe("Not applicable");
    });
});

describe("retention — kept as evidence while nothing canonical owns it", () => {
    const held = field({
        id: "h",
        type: "text",
        label: "Immunization notes",
        retention: { kind: "form_only_pending_canonical_owner", owner_hint: "Health" },
    });

    it("says so, and carries the domain the author expects to own it", () => {
        expect(isFormOnlyEvidence(held)).toBe(true);
        expect(pendingOwnerHint(held)).toBe("Health");
    });

    it("is still a normal question for the family", () => {
        expect(formFieldAsksParticipant(held)).toBe(true);
    });

    it("CANNOT also claim a canonical destination — the schema refuses the pair", () => {
        expect(() =>
            validateFormSchema(
                schema([
                    {
                        id: "h",
                        type: "text",
                        label: "Immunization notes",
                        retention: { kind: "form_only_pending_canonical_owner" },
                        field_source: { entity_type: "customer_member", field_key: "notes" },
                    },
                ]),
            ),
        ).toThrow();
    });

    it("an ordinary unbound question is not the same thing", () => {
        expect(isFormOnlyEvidence(field({ id: "x", type: "text", label: "Anything else?" }))).toBe(false);
    });
});

describe("supplied_by — the organisation's value, never the family's question", () => {
    const fee = field({
        id: "fee",
        type: "text",
        label: "Registration fee",
        supplied_by: { source_kind: "charge_template", source_key: "registration_fee", resolve_at: "generation" },
    });

    it("is recognised as configuration-supplied", () => {
        expect(isConfigurationSupplied(fee)).toBe(true);
    });

    it("is never asked of the participant", () => {
        expect(formFieldAsksParticipant(fee)).toBe(false);
    });

    it("holds a reference, never a duplicated amount", () => {
        const parsed = validateFormSchema(schema([fee as unknown as Record<string, unknown>]));
        const stored = JSON.stringify(parsed.fields[0]);
        expect(stored).toContain("registration_fee");
        expect(stored, "a Form that stores the number is a second place it can go stale").not.toMatch(/amount|cents|\$\d/);
    });

    it("cannot also offer an absence answer — it is not a question", () => {
        expect(() =>
            validateFormSchema(
                schema([
                    {
                        id: "fee",
                        type: "text",
                        label: "Registration fee",
                        supplied_by: { source_kind: "charge_template", source_key: "registration_fee" },
                        absence: { offered: true },
                    },
                ]),
            ),
        ).toThrow();
    });
});

describe("address — four fields, one address", () => {
    const group = field({
        id: "home_address",
        type: "group",
        label: "Home address",
        address_binding: { subject: "person", role: "guardian" },
        fields: [
            { id: "a1", type: "text", label: "Street address", field_source: { entity_type: "person", field_key: "address_line1" } },
            { id: "a2", type: "text", label: "City", field_source: { entity_type: "person", field_key: "city" } },
            { id: "a3", type: "text", label: "State", field_source: { entity_type: "person", field_key: "state" } },
            { id: "a4", type: "text", label: "ZIP / postal code", field_source: { entity_type: "person", field_key: "postal_code" } },
        ],
    });

    it("declares whose address it is", () => {
        expect(addressBindingOf(group)).toEqual({ subject: "person", role: "guardian" });
    });

    it("maps each field to its canonical part, binding first", () => {
        const parts = addressParts(group);
        expect(parts.map((p) => p.part)).toEqual(["address_line1", "city", "state", "postal_code"]);
    });

    it("reads the parts in the order a person writes them, whatever order they were authored in", () => {
        const shuffled = field({
            ...(group as unknown as Record<string, unknown>),
            fields: [...(group as unknown as { fields: unknown[] }).fields].reverse(),
        });
        expect(addressParts(shuffled).map((p) => p.part)).toEqual(["address_line1", "city", "state", "postal_code"]);
    });

    it("never offers the address reading to an ordinary group", () => {
        const plain = field({ id: "g", type: "group", label: "Other", fields: [{ id: "x", type: "text", label: "City" }] });
        expect(addressBindingOf(plain)).toBeNull();
        expect(addressPartOf(plain, (plain as unknown as { fields: FormField[] }).fields[0]!)).toBeNull();
        expect(addressParts(plain)).toEqual([]);
    });

    it("writes one address the way a person writes it", () => {
        expect(formatAddressLine({ address_line1: "12 Alder Lane", city: "Bend", state: "OR", postal_code: "97701" })).toBe(
            "12 Alder Lane, Bend, OR 97701",
        );
    });

    it("closes up around missing parts rather than printing the gaps", () => {
        expect(formatAddressLine({ address_line1: "12 Alder Lane", state: "OR" })).toBe("12 Alder Lane, OR");
        expect(formatAddressLine({})).toBe("");
        expect(formatAddressLine({ city: "Bend", postal_code: "97701" })).toBe("Bend, 97701");
    });

    it("creates no address store — the parts are canonical Person fields", () => {
        const keys = addressParts(group).map(({ field: f }) => f.field_source?.field_key);
        expect(keys).toEqual(["address_line1", "city", "state", "postal_code"]);
        for (const { field: f } of addressParts(group)) expect(f.field_source?.entity_type).toBe("person");
    });
});

describe("the conversation never asks for an address one part at a time", () => {
    it("suppresses the declared parts from the scalar walk", async () => {
        const { addressPartFieldIds } = await import("@/lib/forms/fieldSemantics");
        const declared = {
            fields: [
                {
                    id: "home_address",
                    type: "group",
                    label: "Home address",
                    address_binding: { subject: "person" },
                    fields: [
                        { id: "a1", type: "text", label: "Street address" },
                        { id: "a2", type: "text", label: "City" },
                    ],
                },
                { id: "loose", type: "text", label: "Anything else?" },
            ],
        } as unknown as { fields: FormField[] };
        const ids = addressPartFieldIds(declared);
        expect([...ids].sort()).toEqual(["a1", "a2"]);
        expect(ids.has("loose")).toBe(false);
        expect(ids.has("home_address"), "the address itself is the question, not a suppressed part").toBe(false);
    });

    it("leaves an ordinary group's fields exactly where they were", async () => {
        const { addressPartFieldIds } = await import("@/lib/forms/fieldSemantics");
        const plain = {
            fields: [{ id: "g", type: "group", label: "Other", fields: [{ id: "x", type: "text", label: "City" }] }],
        } as unknown as { fields: FormField[] };
        expect(addressPartFieldIds(plain).size).toBe(0);
    });
});
