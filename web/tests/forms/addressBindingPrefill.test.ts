import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { FormSchemaV1 } from "@/lib/forms/schema";
import { validateFormSchema } from "@/lib/forms/schema";
import {
    planAddressBindingPrefill,
    readHouseholdCanonicalAddress,
    resolveAddressBindingPrefill,
} from "@/lib/forms/prefill/addressBindingPrefill";
import { adaptFormSubmissionToRelatedRecordProposals } from "@/lib/forms/processing/adaptFormSubmissionToRelatedRecordProposals";

const PUBLISHED_V12 = JSON.parse(
    readFileSync(join(__dirname, "__fixtures_admissions_v12_published.json"), "utf8"),
) as unknown;

/** One `locations` read, shaped like the real query chain so a dropped filter shows up. */
function fakeSupabase(rows: Record<string, unknown>[], opts: { error?: string } = {}) {
    const calls: { table: string; filters: Record<string, unknown>; select: string; ordered: string[] } = {
        table: "",
        filters: {},
        select: "",
        ordered: [],
    };
    const builder: Record<string, unknown> = {
        select(cols: string) {
            calls.select = cols;
            return builder;
        },
        eq(col: string, val: unknown) {
            calls.filters[col] = val;
            return builder;
        },
        order(col: string) {
            calls.ordered.push(col);
            return builder;
        },
        limit() {
            return Promise.resolve(opts.error ? { data: null, error: { message: opts.error } } : { data: rows, error: null });
        },
    };
    return {
        client: { from: (table: string) => { calls.table = table; return builder; } } as never,
        calls,
    };
}

const ADDRESS_ROW = {
    id: "loc-1",
    address1: "12 Larkspur Lane",
    address2: "Apt 4",
    city: "Bend",
    state: "OR",
    postal_code: "97701",
    is_primary: true,
};

function group(id: string, role: string, subject = "person"): FormSchemaV1["fields"][number] {
    return {
        id,
        type: "group",
        label: id,
        required: false,
        address_binding: { subject, role },
        fields: (["address_line1", "city", "state", "postal_code"] as const).map((key) => ({
            id: `${id}_${key}`,
            type: "text" as const,
            label: key,
            required: false,
            field_source: { field_key: key, entity_type: "person" },
        })),
    } as FormSchemaV1["fields"][number];
}

const schemaOf = (fields: FormSchemaV1["fields"]): FormSchemaV1 =>
    ({ schema_version: 1, title: "t", fields, sections: [] }) as unknown as FormSchemaV1;

describe("address_binding — the authored binding decides whose address", () => {
    it("gives the household's address to a role the relationship model holds in the household", () => {
        const plan = planAddressBindingPrefill(schemaOf([group("home", "guardian")]));
        expect(plan.map((p) => p.outcome)).toEqual(["household_address"]);
        expect(plan[0]!.leaves).toEqual({
            address_line1: "home_address_line1",
            city: "home_city",
            state: "home_state",
            postal_code: "home_postal_code",
        });
    });

    it("gives nothing to a role the relationship model does not know", () => {
        // `billing_contact` is a settings SECTION and a financial responsibility party. It is not one
        // of the relationship definitions, so it has no canonical address authority.
        const plan = planAddressBindingPrefill(schemaOf([group("mail", "billing_contact")]));
        expect(plan[0]!.outcome).toBe("no_canonical_address_authority");
    });

    it("does not hand the family's address to a third party the household merely names", () => {
        /*
         * All five relationship definitions are anchored on the household, so anchoring alone would
         * have offered a family's own address as their doctor's. An emergency contact is excluded for
         * a second reason: the relationship model carries `"address"` in its nested field keys, so
         * their address is theirs and held on the relationship.
         */
        for (const role of ["emergency_contact", "authorized_pickup", "physician", "dentist"]) {
            expect(planAddressBindingPrefill(schemaOf([group("g", role)]))[0]!.outcome).toBe(
                "no_canonical_address_authority",
            );
        }
    });

    it("resolves by the relationship model rather than a spelling this file knows", () => {
        // `guardian` is not a literal in the resolver: it is read from the relationship definitions,
        // so an alias the model does not define earns nothing.
        expect(planAddressBindingPrefill(schemaOf([group("g", "guardian")]))[0]!.outcome).toBe("household_address");
        for (const unknown of ["landlord", "parent_guardian", "billing", "primary_contact"]) {
            expect(planAddressBindingPrefill(schemaOf([group("g", unknown)]))[0]!.outcome).toBe(
                "no_canonical_address_authority",
            );
        }
    });

    it("claims the household's single shared address once, in authored order", () => {
        const plan = planAddressBindingPrefill(schemaOf([group("first", "guardian"), group("second", "guardian")]));
        expect(plan.map((p) => p.outcome)).toEqual(["household_address", "household_address_already_claimed"]);
    });

    it("refuses a subject the platform does not resolve addresses for", () => {
        expect(planAddressBindingPrefill(schemaOf([group("g", "guardian", "vendor")]))[0]!.outcome).toBe(
            "unsupported_subject",
        );
    });

    it("says so when a bound group holds no address leaf", () => {
        const g = {
            id: "g",
            type: "group",
            label: "g",
            required: false,
            address_binding: { subject: "person", role: "guardian" },
            fields: [{ id: "g_note", type: "text", label: "Note", required: false }],
        } as unknown as FormSchemaV1["fields"][number];
        expect(planAddressBindingPrefill(schemaOf([g]))[0]!.outcome).toBe("no_address_leaves");
    });
});

describe("reading the canonical household address", () => {
    it("reads the same locations row the rest of the product reads", async () => {
        const { client, calls } = fakeSupabase([ADDRESS_ROW]);
        const address = await readHouseholdCanonicalAddress(client, "org-1", "cust-1");
        expect(calls.table).toBe("locations");
        expect(calls.filters).toEqual({
            org_id: "org-1",
            customer_id: "cust-1",
            location_type: "address",
            is_active: true,
        });
        expect(calls.ordered).toEqual(["is_primary"]);
        expect(address).toEqual({
            locationId: "loc-1",
            address_line1: "12 Larkspur Lane",
            address_line2: "Apt 4",
            city: "Bend",
            state: "OR",
            postal_code: "97701",
        });
    });

    it("treats a row with no usable lines as no address", async () => {
        const { client } = fakeSupabase([{ id: "loc-2", address1: "  ", city: null, postal_code: null }]);
        expect(await readHouseholdCanonicalAddress(client, "org-1", "cust-1")).toBeNull();
    });

    it("treats a read error as no address rather than throwing at a participant", async () => {
        const { client } = fakeSupabase([], { error: "boom" });
        expect(await readHouseholdCanonicalAddress(client, "org-1", "cust-1")).toBeNull();
    });
});

describe("prefill values", () => {
    it("fills the bound group's structured fields and nothing else", async () => {
        const { client } = fakeSupabase([ADDRESS_ROW]);
        const { values } = await resolveAddressBindingPrefill(
            client,
            "org-1",
            schemaOf([group("home", "guardian"), group("mail", "billing_contact")]),
            { customer_id: "cust-1" },
        );
        expect(values).toEqual({
            home_address_line1: "12 Larkspur Lane",
            home_city: "Bend",
            home_state: "OR",
            home_postal_code: "97701",
        });
        // The unresolvable group is left empty and answerable — never filled with the other address.
        expect(Object.keys(values).some((k) => k.startsWith("mail_"))).toBe(false);
    });

    it("leaves an empty answerable control when the household has no address", async () => {
        const { client } = fakeSupabase([]);
        const { values, plan } = await resolveAddressBindingPrefill(
            client,
            "org-1",
            schemaOf([group("home", "guardian")]),
            { customer_id: "cust-1" },
        );
        expect(values).toEqual({});
        // The plan still says the authority existed: absent data is not absent authority.
        expect(plan[0]!.outcome).toBe("household_address");
    });

    it("reads no person, so no sibling's or contact's address can leak", async () => {
        const { client, calls } = fakeSupabase([ADDRESS_ROW]);
        await resolveAddressBindingPrefill(client, "org-1", schemaOf([group("home", "guardian")]), {
            customer_id: "cust-1",
        });
        expect(calls.table).toBe("locations");
    });

    it("does not read at all when no group can claim an address", async () => {
        const { client, calls } = fakeSupabase([ADDRESS_ROW]);
        const { values } = await resolveAddressBindingPrefill(
            client,
            "org-1",
            schemaOf([group("mail", "billing_contact")]),
            { customer_id: "cust-1" },
        );
        expect(values).toEqual({});
        expect(calls.table).toBe("");
    });
});

describe("the real published Admissions v12", () => {
    const schema = validateFormSchema(PUBLISHED_V12);

    it("resolves Home address to the household and Mailing address to no authority", () => {
        const plan = planAddressBindingPrefill(schema);
        expect(plan).toHaveLength(2);
        expect(plan[0]).toMatchObject({ groupId: "untitled_address", role: "guardian", outcome: "household_address" });
        expect(plan[1]).toMatchObject({
            groupId: "untitled_address_2",
            role: "billing_contact",
            outcome: "no_canonical_address_authority",
        });
    });

    it("binds every authored address leaf of the Home group", () => {
        const [home] = planAddressBindingPrefill(schema);
        expect(home!.leaves).toEqual({
            address_line1: "untitled_address_address_line1",
            city: "untitled_address_city",
            state: "untitled_address_state",
            postal_code: "untitled_address_postal_code",
        });
    });

    it("keeps an address answer as form evidence, proposing no canonical record", () => {
        /*
         * The write side of the contract. Address groups carry `address_binding`, not
         * `collection_binding`, and only collection-bound groups produce proposals — so an address a
         * family types cannot overwrite a person, a household or anybody else's record.
         */
        const bundle = adaptFormSubmissionToRelatedRecordProposals(
            schema,
            {
                untitled_address_address_line1: "99 New Street",
                untitled_address_city: "Redmond",
                untitled_address_2_address_line1: "PO Box 5",
            } as never,
            { formSubmissionId: "sub-1", formDefinitionVersionId: "ee75bbc6" },
        );
        const touched = JSON.stringify(bundle);
        expect(touched).not.toContain("99 New Street");
        expect(touched).not.toContain("PO Box 5");
    });
});
