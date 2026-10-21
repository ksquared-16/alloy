/**
 * The people the conversation added ARE the form's collection rows — linked to the person, so review
 * does not ask again and Processing links rather than duplicates.
 */
import { describe, expect, it } from "vitest";

import { mergePartyRowsIntoGroup } from "@/lib/enrollment/participantRuntime/partyRowsIntoDrafts";
import type { ChildParty } from "@/lib/enrollment/participantRuntime/childPartyRuntime";
import type { FormField } from "@/lib/forms/schema";

const group = {
    id: "occ_emergency_contacts",
    type: "group",
    label: "Emergency contacts",
    required: false,
    repeat: { min: 1, max: 4 },
    collection_binding: { collection_provider_ref: "person.contact_role.emergency_contacts", iteration_entity_type: "person", iteration_alias: "emergency_contact" },
    fields: [
        { id: "occ_emergency_contacts__full_name", type: "text", label: "Name", required: true, field_source: { entity_type: "person", field_key: "full_name" } },
        { id: "occ_emergency_contacts__phone", type: "text", label: "Phone", required: true, field_source: { entity_type: "person", field_key: "phone" } },
        { id: "occ_emergency_contacts__relationship_type", type: "text", label: "Relationship", required: true, field_source: { entity_type: "person_child_relationship", field_key: "relationship_type" } },
    ],
} as unknown as FormField & { type: "group" };

const grandma: ChildParty = { party_id: "p-gm", person_id: "p-gm", roles: ["emergency_contact", "authorized_pickup"], priority: 1, full_name: "Mary Rivers", phone: "5035550111", email: null, relationship_type: "grandparent" };
const physician: ChildParty = { party_id: "p-dr", person_id: "p-dr", roles: ["physician"], priority: 1, full_name: "Dr. Lee Park", phone: "5035550200", email: null };
const label = (k: string | null | undefined) => (k === "grandparent" ? "Grandparent" : k ?? null);

describe("mergePartyRowsIntoGroup", () => {
    it("writes only the people holding the group's role, linked by person id, with their relationship", () => {
        const rows = mergePartyRowsIntoGroup(group, [], [grandma, physician], label)!;
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            instance_key: "col:person.contact_role.emergency_contacts:p-gm",
            collection: { provider_ref: "person.contact_role.emergency_contacts", item_id: "p-gm", origin: "existing" },
            values: { occ_emergency_contacts__full_name: "Mary Rivers", occ_emergency_contacts__phone: "5035550111", occ_emergency_contacts__relationship_type: "Grandparent" },
        });
    });

    it("drops an untouched placeholder row, adopts a row typed for the same person, and keeps anyone else", () => {
        const saved = [
            { instance_key: "blank", values: {}, collection: { provider_ref: "person.contact_role.emergency_contacts", origin: "respondent_added", iteration_entity_type: "person" } },
            { instance_key: "typed-gm", values: { occ_emergency_contacts__full_name: "mary  rivers", occ_emergency_contacts__phone: "5035559999" }, collection: { provider_ref: "person.contact_role.emergency_contacts", origin: "respondent_added", iteration_entity_type: "person" } },
            { instance_key: "neighbour", values: { occ_emergency_contacts__full_name: "Sam Ng", occ_emergency_contacts__phone: "5035550123" }, collection: { provider_ref: "person.contact_role.emergency_contacts", origin: "respondent_added", iteration_entity_type: "person" } },
        ] as never;
        const rows = mergePartyRowsIntoGroup(group, saved, [grandma], label)!;
        expect(rows.map((r) => r.instance_key)).toEqual(["col:person.contact_role.emergency_contacts:p-gm", "neighbour"]);
        // The family's own saved value wins over the canonical one; canonical fills the blank.
        expect(rows[0]!.values).toMatchObject({ occ_emergency_contacts__phone: "5035559999", occ_emergency_contacts__relationship_type: "Grandparent" });
        expect(rows[0]!.collection).toMatchObject({ item_id: "p-gm", origin: "existing" });
    });

    it("is idempotent: a second sync over its own result changes nothing", () => {
        const once = mergePartyRowsIntoGroup(group, [], [grandma], label)!;
        expect(mergePartyRowsIntoGroup(group, once, [grandma], label)).toBeNull();
    });

    it("a child with nobody in the role gets nothing — no sibling's people, no empty rows", () => {
        expect(mergePartyRowsIntoGroup(group, [], [physician], label)).toBeNull();
        expect(mergePartyRowsIntoGroup(group, [], [], label)).toBeNull();
    });
});
