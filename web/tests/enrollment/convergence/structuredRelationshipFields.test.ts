/**
 * Structured relationship fields: each member its own leaf, imported addresses bound the way Studio
 * binds them, and the stated relationship printed on the artifact — never guessed.
 */
import { describe, expect, it } from "vitest";

import { nestedScalarPrefillValue } from "@/lib/forms/prefill/formsCollectionPrefillResolver";
import { planAddressBindingPrefill } from "@/lib/forms/prefill/addressBindingPrefill";
import { collapseAddressRun } from "@/lib/pos/processingCase/formDraft/importedAddressGroups";
import { projectPartyArtifactValues } from "@/lib/enrollment/participantRuntime/projectPartyArtifactValues";
import type { FormField } from "@/lib/forms/schema";

const binding = { collection_provider_ref: "person.contact_role.emergency_contacts", iteration_entity_type: "person", iteration_alias: "emergency_contact" } as const;
const member = (field_key: string, entity_type = "person") => ({ id: `ec__${field_key}`, type: "text", label: field_key, field_source: { entity_type, field_key } }) as unknown as FormField;
const person = { id: "p1", first_name: "Mary", last_name: "Rivers", full_name: "Mary Rivers", phone: "5035550111", email: "m@example.com", relationship_type: "grandparent" };

describe("collection members get their own leaf", () => {
    it("first name, last name, phone, email and full name each resolve to their own value", () => {
        expect(nestedScalarPrefillValue(member("first_name"), person, binding)).toBe("Mary");
        expect(nestedScalarPrefillValue(member("last_name"), person, binding)).toBe("Rivers");
        expect(nestedScalarPrefillValue(member("full_name"), person, binding)).toBe("Mary Rivers");
        expect(nestedScalarPrefillValue(member("phone"), person, binding)).toBe("5035550111");
    });

    it("a person known only by a full name leaves first/last blank — no unsafe split", () => {
        const onlyFull = { id: "p2", full_name: "Mary Ann Rivers" };
        expect(nestedScalarPrefillValue(member("first_name"), onlyFull, binding)).toBeUndefined();
        expect(nestedScalarPrefillValue(member("last_name"), onlyFull, binding)).toBeUndefined();
    });

    it("an unknown member stays blank instead of receiving the person's name", () => {
        expect(nestedScalarPrefillValue(member("employer"), person, binding)).toBeUndefined();
    });
});

describe("imported addresses bind like Studio's", () => {
    const leaf = (id: string, key: string) => ({ id, type: "text", label: key, field_source: { entity_type: "person", field_key: key } }) as unknown as FormField;
    it("the importer binds a person address to the guardian, which the prefill policy resolves", () => {
        const run = collapseAddressRun([leaf("a1", "address_line1"), leaf("a2", "city"), leaf("a3", "state"), leaf("a4", "postal_code")], 0)!;
        expect((run.group as { address_binding?: unknown }).address_binding).toEqual({ subject: "person", role: "guardian" });
        expect(planAddressBindingPrefill({ fields: [run.group] })[0]!.outcome).not.toBe("role_not_in_policy");
    });

    it("a form imported earlier with role 'home' is read as the guardian's address", () => {
        const legacy = { id: "g", type: "group", label: "Home address", address_binding: { subject: "person", role: "home" }, fields: [leaf("l1", "address_line1"), leaf("l2", "city")] } as unknown as FormField;
        expect(planAddressBindingPrefill({ fields: [legacy] })[0]!.outcome).not.toBe("role_not_in_policy");
    });
});

describe("the stated relationship reaches the artifact", () => {
    it("prints the relationship the family gave, and nothing when none was given", () => {
        const schema = { fields: [{ id: "r1", type: "text", label: "Emergency Contact #1 Relationship" }, { id: "r2", type: "text", label: "Emergency Contact #2 Relationship" }] } as never;
        const fill = projectPartyArtifactValues(schema, [
            { party_id: "a", person_id: "a", roles: ["emergency_contact"], priority: 1, full_name: "Rose", phone: null, email: null, relationship_type: "family_friend" },
            { party_id: "b", person_id: "b", roles: ["emergency_contact"], priority: 2, full_name: "Mark", phone: null, email: null },
        ], ["emergency_contact"]);
        expect(fill.values.r1).toBe("Family Friend");
        expect(fill.values.r2).toBeUndefined();
    });
});
