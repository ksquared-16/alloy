/**
 * ONE ADDRESS, ONE KEY.
 *
 * Found by reading the generated document at the end of the real certification: the family had
 * given their address, the conversation had accepted it and stopped asking — and the paperwork
 * printed an em dash for the whole address.
 *
 * The conversation derived a ROLE-SCOPED shared key, so a Form may ask for a guardian's address and
 * an emergency contact's without the two colliding. Every other consumer derived the part's key
 * from its own `field_source`, which carries no role. So the address was written where nothing else
 * looked, and the only reader that could find it was the one that wrote it — which is exactly why
 * nothing failed loudly.
 */
import { describe, expect, it } from "vitest";
import { addressPartSharedKey, addressPartSharedKeyByFieldId } from "@/lib/forms/fieldSemantics";
import { addressPartSharedKey as conversationDerivation } from "@/lib/enrollment/informationNeeds/participantAddress";
import { sharedValuesToFieldIds } from "@/lib/forms/packets/sharedValuesToFieldIds";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

function addressGroup(role: string | null): FormField {
    return {
        id: "home",
        type: "group",
        label: "Home address",
        required: false,
        ...(role ? { address_binding: { subject: "person", role } } : { address_binding: { subject: "person" } }),
        fields: [
            { id: "home_address_line1", type: "text", label: "Street address", required: false, field_source: { entity_type: "person", field_key: "address_line1" } },
            { id: "home_city", type: "text", label: "City", required: false, field_source: { entity_type: "person", field_key: "city" } },
            { id: "home_state", type: "text", label: "State", required: false, field_source: { entity_type: "person", field_key: "state" } },
            { id: "home_postal_code", type: "text", label: "ZIP / postal code", required: false, field_source: { entity_type: "person", field_key: "postal_code" } },
        ],
    } as unknown as FormField;
}

const schema = (role: string | null) =>
    ({
        schema_version: 1,
        title: "Cert",
        sections: [{ id: "s1", title: "S", field_ids: ["home"] }],
        fields: [addressGroup(role)],
    }) as unknown as FormSchemaV1;

const STORED = {
    "person.guardian.address_line1": "48 Beacon Street",
    "person.guardian.city": "Brookline",
    "person.guardian.state": "MA",
    "person.guardian.postal_code": "02445",
};

describe("the key has one definition", () => {
    it("the conversation's derivation IS the Forms one — not a second copy", () => {
        expect(conversationDerivation).toBe(addressPartSharedKey);
    });

    it("a role-scoped address names the role in its key", () => {
        const group = addressGroup("guardian");
        if (group.type !== "group") throw new Error("unreachable");
        expect(addressPartSharedKey(group, group.fields[0]!)).toBe("person.guardian.address_line1");
    });

    it("an address with no role keeps the plain canonical key", () => {
        const group = addressGroup(null);
        if (group.type !== "group") throw new Error("unreachable");
        expect(addressPartSharedKey(group, group.fields[1]!)).toBe("person.city");
    });

    it("an explicitly authored shared key still wins", () => {
        const group = addressGroup("guardian");
        if (group.type !== "group") throw new Error("unreachable");
        const field = { ...group.fields[0]!, field_source: { entity_type: "person", field_key: "address_line1", shared_value_key: "custom.key" } } as FormField;
        expect(addressPartSharedKey(group, field)).toBe("custom.key");
    });
});

describe("every reader finds what the conversation wrote", () => {
    it("a role-scoped address reaches the document's field ids", () => {
        const mapped = sharedValuesToFieldIds(schema("guardian"), STORED);
        expect(mapped).toMatchObject({
            home_address_line1: "48 Beacon Street",
            home_city: "Brookline",
            home_state: "MA",
            home_postal_code: "02445",
        });
    });

    it("the defect, stated: the unscoped key must not be what is looked for", () => {
        // What the reader used to look for. Nothing is stored there, and nothing may be invented.
        const mapped = sharedValuesToFieldIds(schema("guardian"), { "person.address_line1": "WRONG PLACE" });
        expect(mapped.home_address_line1).toBeUndefined();
    });

    it("an unroled address still resolves through the ordinary canonical path", () => {
        const mapped = sharedValuesToFieldIds(schema(null), { "person.address_line1": "12 Alder Lane" });
        expect(mapped.home_address_line1).toBe("12 Alder Lane");
    });

    it("two addresses on one Form stay apart — which is what the role is for", () => {
        const twoRoles = {
            schema_version: 1,
            title: "Cert",
            sections: [{ id: "s1", title: "S", field_ids: ["home", "ec"] }],
            fields: [
                addressGroup("guardian"),
                {
                    ...(addressGroup("emergency_contact") as { id: string }),
                    id: "ec",
                    address_binding: { subject: "person", role: "emergency_contact" },
                    fields: [
                        { id: "ec_address_line1", type: "text", label: "Street address", required: false, field_source: { entity_type: "person", field_key: "address_line1" } },
                    ],
                },
            ],
        } as unknown as FormSchemaV1;
        const mapped = sharedValuesToFieldIds(twoRoles, {
            ...STORED,
            "person.emergency_contact.address_line1": "9 Cypress Way",
        });
        expect(mapped.home_address_line1).toBe("48 Beacon Street");
        expect(mapped.ec_address_line1).toBe("9 Cypress Way");
    });

    it("the whole map is offered by field id, so no reader has to know about roles", () => {
        expect([...addressPartSharedKeyByFieldId(schema("guardian"))]).toEqual([
            ["home_address_line1", "person.guardian.address_line1"],
            ["home_city", "person.guardian.city"],
            ["home_state", "person.guardian.state"],
            ["home_postal_code", "person.guardian.postal_code"],
        ]);
    });
});
