/**
 * THE FORM A FAMILY SIGNED MUST STILL OPEN.
 *
 * `__fixtures_admissions_v12_published.json` is the real published schema of Admissions v12
 * (form 57507992, version ee75bbc6) read back from deployed staging — the version Business Process
 * revision 38 pins and Dax's live packet session renders. It is immutable by design, and it was
 * authored before two properties were renamed and two more were implemented, so the strict canonical
 * union rejected 23 of its 58 fields and a parent opening their enrolment link met:
 *
 *     Invalid published schema [INVALID_SCHEMA]
 *
 * These cases are the contract that cannot regress: the historical artifact parses, its semantics
 * survive, and a property nobody has taught the normalizer is still refused.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { safeParseFormSchema, validateFormSchema } from "@/lib/forms/schema";
import {
    LegacyFormSchemaConflictError,
    normalizeLegacyPublishedFormSchema,
} from "@/lib/forms/normalizeLegacyPublishedFormSchema";

const published = JSON.parse(
    readFileSync(resolve(__dirname, "__fixtures_admissions_v12_published.json"), "utf8"),
) as Record<string, unknown>;

/** Find one field by id anywhere in the tree, so a group's child is reachable too. */
function fieldById(schema: unknown, id: string): Record<string, unknown> | null {
    const fields = (schema as { fields?: unknown[] })?.fields;
    if (!Array.isArray(fields)) return null;
    for (const f of fields) {
        const rec = f as Record<string, unknown>;
        if (rec.id === id) return rec;
        const nested = fieldById(rec, id);
        if (nested) return nested;
    }
    return null;
}

describe("the published Admissions v12 artifact", () => {
    it("parses — the participant link is no longer dead", () => {
        const parsed = safeParseFormSchema(published);
        expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 6))).toBe(true);
    });

    it("keeps all 58 fields; nothing was dropped to make it parse", () => {
        const parsed = validateFormSchema(published);
        expect(parsed.fields).toHaveLength(58);
    });

    it("leaves the stored artifact untouched — normalization is a read", () => {
        const before = JSON.stringify(published);
        normalizeLegacyPublishedFormSchema(published);
        expect(JSON.stringify(published)).toBe(before);
    });
});

describe("party_collection became the collection it always named", () => {
    const normalized = normalizeLegacyPublishedFormSchema(published);

    it("binds Parents and guardians to the parents provider", () => {
        const g = fieldById(normalized, "emergency_contacts");
        expect(g?.collection_binding).toEqual({
            collection_provider_ref: "person.contact_role.parents",
            iteration_entity_type: "person",
        });
        expect(g?.party_collection, "the legacy annotation is translated, not kept alongside").toBeUndefined();
    });

    it("binds Other children to the children provider", () => {
        const g = fieldById(normalized, "emergency_contacts_2");
        expect((g?.collection_binding as { collection_provider_ref?: string })?.collection_provider_ref)
            .toBe("children");
    });

    /*
     * The one I previously reported as having no equivalent. It does: the registry DERIVES a provider
     * from every relationship definition, and `person.contact_role.emergency_contacts` is one of
     * them — I had only read the three hardcoded branches above that derivation.
     */
    it("binds Emergency contacts to the emergency-contacts provider", () => {
        const g = fieldById(normalized, "emergency_contacts_3");
        expect((g?.collection_binding as { collection_provider_ref?: string })?.collection_provider_ref)
            .toBe("person.contact_role.emergency_contacts");
    });

    it("never invents a provider the registry cannot resolve", () => {
        expect(() =>
            normalizeLegacyPublishedFormSchema({
                version: 1,
                fields: [{ id: "g", type: "group", label: "G", fields: [], party_collection: { role: "landlord", subject: "person" } }],
            }),
        ).toThrow(LegacyFormSchemaConflictError);
    });
});

describe("absence and address_binding are canonical now, not translated", () => {
    it("keeps the author's own wording for an explicit none", () => {
        const parsed = validateFormSchema(published);
        const allergies = fieldById(parsed, "untitled_long_text_4");
        expect(allergies?.absence).toEqual({ label: "No known allergies", offered: true });
    });

    it("does not make an optional field required by carrying an absence", () => {
        const parsed = validateFormSchema(published);
        for (const id of ["untitled_long_text_3", "untitled_long_text_4", "untitled_long_text_10"]) {
            expect(fieldById(parsed, id)?.required, id).toBe(false);
        }
    });

    it("keeps each address group bound to its own person", () => {
        const parsed = validateFormSchema(published);
        expect(fieldById(parsed, "untitled_address")?.address_binding).toEqual({ role: "guardian", subject: "person" });
        expect(fieldById(parsed, "untitled_address_2")?.address_binding).toEqual({ role: "billing_contact", subject: "person" });
    });
});

describe("retention is dropped only where the platform already enforces it", () => {
    it("drops the annotation on a field with no canonical destination", () => {
        const normalized = normalizeLegacyPublishedFormSchema(published);
        const f = fieldById(normalized, "untitled_long_text_3");
        expect(f?.retention).toBeUndefined();
    });

    /*
     * FAIL CLOSED. "No canonical destination" and "here is the destination" cannot both be true, and
     * proposals are produced from field_source — so dropping the annotation would start canonicalising
     * an answer the author marked form-only.
     */
    it("refuses a form-only field that also declares where the answer goes", () => {
        expect(() =>
            normalizeLegacyPublishedFormSchema({
                version: 1,
                fields: [{
                    id: "contradiction",
                    type: "text",
                    label: "Allergies",
                    retention: { kind: "form_only_pending_canonical_owner", owner_hint: "Health" },
                    field_source: { entity_type: "person", field_key: "allergies" },
                }],
            }),
        ).toThrow(/cannot be dropped without changing where the answer goes/);
    });

    it("refuses a retention kind it has not been taught", () => {
        expect(() =>
            normalizeLegacyPublishedFormSchema({
                version: 1,
                fields: [{ id: "f", type: "text", label: "L", retention: { kind: "delete_after_90_days" } }],
            }),
        ).toThrow(LegacyFormSchemaConflictError);
    });
});

describe("conflict law", () => {
    const group = (over: Record<string, unknown>) => ({
        version: 1,
        fields: [{ id: "g", type: "group", label: "Guardians", fields: [{ id: "n", type: "text", label: "Name" }], ...over }],
    });

    it("accepts a legacy annotation that agrees with its canonical replacement", () => {
        const out = normalizeLegacyPublishedFormSchema(group({
            party_collection: { role: "guardian", subject: "person" },
            collection_binding: { collection_provider_ref: "person.contact_role.parents", iteration_entity_type: "person" },
        }));
        const g = fieldById(out, "g");
        expect((g?.collection_binding as { collection_provider_ref?: string })?.collection_provider_ref)
            .toBe("person.contact_role.parents");
        expect(g?.party_collection).toBeUndefined();
    });

    it("FAILS when they disagree rather than choosing one", () => {
        expect(() =>
            normalizeLegacyPublishedFormSchema(group({
                party_collection: { role: "guardian", subject: "person" },
                collection_binding: { collection_provider_ref: "children", iteration_entity_type: "customer_member" },
            })),
        ).toThrow(/disagree about which collection/);
    });
});

describe("strictness is intact", () => {
    it("still refuses a property nobody has taught it", () => {
        const parsed = safeParseFormSchema({
            version: 1,
            fields: [{ id: "f", type: "text", label: "L", invented_property_v9: { anything: true } }],
        });
        expect(parsed.success).toBe(false);
    });

    it("refuses an invented property even beside a translated legacy one", () => {
        const parsed = safeParseFormSchema({
            version: 1,
            fields: [{
                id: "g", type: "group", label: "G", fields: [{ id: "n", type: "text", label: "N" }],
                party_collection: { role: "guardian", subject: "person" },
                invented_property_v9: true,
            }],
        });
        expect(parsed.success, "a normalized field is not a tolerated field").toBe(false);
    });

    it("leaves a schema already written in current terms alone", () => {
        const current = {
            version: 1,
            fields: [{
                id: "g", type: "group", label: "G",
                fields: [{ id: "n", type: "text", label: "N" }],
                collection_binding: { collection_provider_ref: "children", iteration_entity_type: "customer_member" },
            }],
        };
        expect(normalizeLegacyPublishedFormSchema(current)).toEqual(current);
    });
});

/**
 * BLAST RADIUS — the legacy vocabulary is not one bad artifact.
 *
 * Census across every published version on deployed staging found it in FOUR: Admissions Packet v1
 * (published), v2 (published, the pinned one), v3 (draft), and ZZ QA Family Linked v1 (published).
 * So the normalizer maps by what the annotation SAYS — role and subject — never by form id, and
 * these are the other real shapes it has to carry.
 */
describe("other historical artifacts carrying the same vocabulary", () => {
    it("normalizes a party_collection with no scope (ZZ QA Family Linked)", () => {
        const out = normalizeLegacyPublishedFormSchema({
            version: 1,
            fields: [
                {
                    id: "household_children", type: "group", label: "Children",
                    fields: [{ id: "n", type: "text", label: "Name" }],
                    // Real value: this one omits `scope` entirely, where Admissions carries it.
                    party_collection: { subject: "child", allow_add: true, action_key: "add_child", show_known: true },
                },
                {
                    id: "emergency_contacts", type: "group", label: "Emergency contacts",
                    fields: [{ id: "n2", type: "text", label: "Name" }],
                    party_collection: { role: "emergency_contact", scope: "this_child", subject: "person", allow_add: true, action_key: "add_emergency_contact", show_known: true },
                },
            ],
        });
        expect((fieldById(out, "household_children")?.collection_binding as { collection_provider_ref?: string })?.collection_provider_ref)
            .toBe("children");
        expect((fieldById(out, "emergency_contacts")?.collection_binding as { collection_provider_ref?: string })?.collection_provider_ref)
            .toBe("person.contact_role.emergency_contacts");
    });

    it("carries allow_add / action_key / show_known without copying them onto the field", () => {
        // The provider's own relationship definition owns its add action and known-people
        // presentation. A second copy on the field would be a second answer to the same question.
        const out = normalizeLegacyPublishedFormSchema({
            version: 1,
            fields: [{
                id: "g", type: "group", label: "G", fields: [{ id: "n", type: "text", label: "N" }],
                party_collection: { role: "guardian", subject: "person", allow_add: true, action_key: "add_parent_guardian", show_known: true },
            }],
        });
        const g = fieldById(out, "g");
        expect(Object.keys(g ?? {})).not.toContain("allow_add");
        expect(Object.keys(g ?? {})).not.toContain("show_known");
        expect(g?.collection_binding).toEqual({
            collection_provider_ref: "person.contact_role.parents",
            iteration_entity_type: "person",
        });
    });
});

/**
 * WHAT IS PRESERVED BUT NOT YET CONSUMED.
 *
 * `address_binding` now parses and survives into the runtime schema carrying its role and subject,
 * so nothing the author said is lost. Nothing READS it yet: resolving "the billing contact's
 * address" needs a canonical billing role→person authority, and `person.contact_role.billing`
 * exists only in the semantic shape — it is not one of the five relationship definitions the
 * collection registry derives providers from. Inventing that authority here would put address
 * ownership inside the Forms runtime instead of the relationship model that owns it.
 *
 * This case exists so the gap is recorded rather than remembered.
 */
describe("address_binding is preserved and awaits its consumer", () => {
    it("survives the parse with role and subject intact", () => {
        const parsed = validateFormSchema(published);
        const home = fieldById(parsed, "untitled_address");
        expect(home?.address_binding).toEqual({ role: "guardian", subject: "person" });
        // The group's children already say WHAT they hold, through canonical field_source.
        const line1 = fieldById(parsed, "untitled_address_address_line1");
        expect(line1?.field_source).toEqual({ entity_type: "person", field_key: "address_line1" });
    });
});
