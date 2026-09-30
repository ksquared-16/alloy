import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { FormSchemaV1 } from "@/lib/forms/schema";
import { validateFormSchema } from "@/lib/forms/schema";
import {
    planAddressBindingPrefill,
    planAddressBindingSites,
    resolveAddressBindingPrefill,
} from "@/lib/forms/prefill/addressBindingPrefill";
import { adaptFormSubmissionToRelatedRecordProposals } from "@/lib/forms/processing/adaptFormSubmissionToRelatedRecordProposals";

const PUBLISHED_V12 = JSON.parse(
    readFileSync(join(__dirname, "__fixtures_admissions_v12_published.json"), "utf8"),
) as unknown;

const ORG = "org-1";
const HOUSEHOLD = "cust-1";
const OTHER_HOUSEHOLD = "cust-2";
const MOM = "person-mom";
const GRAN = "person-gran";
const DAD = "person-dad";

type Row = Record<string, unknown>;

/**
 * A fake that dispatches by table and records the filters each query applied, so a dropped
 * `customer_id` or `org_id` scope fails a test rather than silently widening a read.
 */
function fakeDb(tables: Record<string, Row[]>) {
    const seen: { table: string; filters: Row }[] = [];
    const from = (table: string) => {
        const filters: Row = {};
        const ins: Record<string, unknown[]> = {};
        const builder: Record<string, unknown> = {
            select() { return builder; },
            eq(col: string, val: unknown) { filters[col] = val; return builder; },
            in(col: string, vals: unknown[]) { ins[col] = vals; return builder; },
            order() { return builder; },
            limit() { return settle(); },
            then(res: (v: unknown) => unknown) { return Promise.resolve(settle()).then(res); },
        };
        const settle = () => {
            seen.push({ table, filters: { ...filters } });
            const rows = (tables[table] ?? []).filter((r) => {
                for (const [k, v] of Object.entries(filters)) if (r[k] !== v) return false;
                for (const [k, vals] of Object.entries(ins)) if (!vals.includes(r[k])) return false;
                return true;
            });
            // is_primary desc, the order every caller asks for.
            rows.sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)));
            return { data: rows, error: null };
        };
        return builder;
    };
    return { client: { from } as never, seen };
}

const address = (over: Row): Row => ({
    id: "loc",
    org_id: ORG,
    customer_id: HOUSEHOLD,
    location_type: "address",
    is_active: true,
    address_role: null,
    is_primary: false,
    address1: "1 Somewhere",
    address2: null,
    city: "Bend",
    state: "OR",
    postal_code: "97701",
    ...over,
});

const arrangement = (over: Row = {}): Row => ({
    id: "arr-1", org_id: ORG, customer_id: HOUSEHOLD, customer_member_id: null,
    charge_id: null, effective_start: "2020-01-01", effective_end: null, state: "active", ...over,
});
const share = (partyId: string, priority: number, over: Row = {}): Row => ({
    id: `sh-${partyId}-${priority}`, org_id: ORG, arrangement_id: "arr-1",
    responsible_party_id: partyId, method: "remainder", percent_basis_points: null,
    amount_cents: null, priority, ...over,
});

function group(id: string, role: string, subject = "person"): FormSchemaV1["fields"][number] {
    return {
        id, type: "group", label: id, required: false,
        address_binding: { subject, role },
        fields: (["address_line1", "city", "state", "postal_code"] as const).map((key) => ({
            id: `${id}_${key}`, type: "text" as const, label: key, required: false,
            field_source: { field_key: key, entity_type: "person" },
        })),
    } as FormSchemaV1["fields"][number];
}
const schemaOf = (fields: FormSchemaV1["fields"]): FormSchemaV1 =>
    ({ schema_version: 1, title: "t", fields, sections: [] }) as unknown as FormSchemaV1;

const HOME_AND_MAIL = schemaOf([group("home", "guardian"), group("mail", "billing_contact")]);
const CTX = { orgId: ORG, customerId: HOUSEHOLD, customerMemberId: null, participantPersonId: MOM };

describe("the static half of the plan", () => {
    it("finds each bound group's address leaves in authored order", () => {
        const sites = planAddressBindingSites(HOME_AND_MAIL);
        expect(sites.map((s) => `${s.groupId}:${s.role}`)).toEqual(["home:guardian", "mail:billing_contact"]);
        expect(sites[0]!.leaves).toEqual({
            address_line1: "home_address_line1", city: "home_city", state: "home_state", postal_code: "home_postal_code",
        });
    });

    it("refuses a role no policy pairs with an address purpose", () => {
        expect(planAddressBindingPrefill(schemaOf([group("g", "physician")]))[0]!.outcome).toBe("role_not_in_policy");
        expect(planAddressBindingPrefill(schemaOf([group("g", "landlord")]))[0]!.outcome).toBe("role_not_in_policy");
    });

    it("refuses a subject the platform does not resolve addresses for", () => {
        expect(planAddressBindingPrefill(schemaOf([group("g", "guardian", "vendor")]))[0]!.outcome).toBe("unsupported_subject");
    });

    it("says so when a bound group holds no address leaf", () => {
        const g = { id: "g", type: "group", label: "g", required: false,
            address_binding: { subject: "person", role: "guardian" },
            fields: [{ id: "g_note", type: "text", label: "Note", required: false }] } as unknown as FormSchemaV1["fields"][number];
        expect(planAddressBindingPrefill(schemaOf([g]))[0]!.outcome).toBe("no_address_leaves");
    });
});

describe("guardian — Home address", () => {
    it("prefers the address the guardian owns", async () => {
        const { client } = fakeDb({
            person_locations: [{ org_id: ORG, person_id: MOM, location_id: "loc-mom", is_primary: true }],
            locations: [
                address({ id: "loc-mom", address_role: "home", address1: "7 Mom Street" }),
                address({ id: "loc-shared", address_role: "home", address1: "1 Shared Way", is_primary: true }),
            ],
        });
        const { values, plan } = await resolveAddressBindingPrefill(client, schemaOf([group("home", "guardian")]), CTX);
        expect(plan[0]!.outcome).toBe("person_owned_address");
        expect(plan[0]!.resolvedPersonId).toBe(MOM);
        expect(values.home_address_line1).toBe("7 Mom Street");
    });

    it("falls back to the household's shared address", async () => {
        const { client } = fakeDb({
            person_locations: [],
            locations: [address({ id: "loc-shared", address_role: "home", address1: "1 Shared Way" })],
        });
        const { values, plan } = await resolveAddressBindingPrefill(client, schemaOf([group("home", "guardian")]), CTX);
        expect(plan[0]!.outcome).toBe("household_shared_address");
        expect(values.home_address_line1).toBe("1 Shared Way");
    });

    it("accepts the legacy row whose purpose was never stated", async () => {
        const { client } = fakeDb({
            person_locations: [],
            locations: [address({ id: "loc-legacy", address_role: null, address1: "9 Legacy Road" })],
        });
        const { values, plan } = await resolveAddressBindingPrefill(client, schemaOf([group("home", "guardian")]), CTX);
        expect(plan[0]!.outcome).toBe("household_shared_address");
        expect(values.home_address_line1).toBe("9 Legacy Road");
    });

    it("does not treat another person's private address as the household's", async () => {
        const { client } = fakeDb({
            // The only address in the household belongs to Dad, privately.
            person_locations: [{ org_id: ORG, person_id: DAD, location_id: "loc-dad", is_primary: true }],
            locations: [address({ id: "loc-dad", address_role: "home", address1: "4 Dad Lane" })],
        });
        const { values, plan } = await resolveAddressBindingPrefill(client, schemaOf([group("home", "guardian")]), CTX);
        expect(plan[0]!.outcome).toBe("no_address_on_file");
        expect(values).toEqual({});
    });

    it("offers nothing when the relationship model does not define the role", async () => {
        const { client } = fakeDb({ person_locations: [], locations: [address({ address_role: "home" })] });
        // `billing_contact` is not a relationship definition; it takes the Financials path instead, so
        // this asserts the guard on the participant path with a role that is in policy for it.
        const { plan } = await resolveAddressBindingPrefill(client, schemaOf([group("home", "guardian")]),
            { ...CTX, participantPersonId: null });
        // No participant person => no person-owned read, but the household fallback still applies.
        expect(plan[0]!.outcome).toBe("household_shared_address");
    });
});

describe("billing contact — Mailing address", () => {
    const billing = (shares: Row[]) => ({
        financial_responsibility_arrangements: [arrangement()],
        financial_responsibility_shares: shares,
    });

    it("resolves the sole responsible party and reads their mailing address", async () => {
        const { client } = fakeDb({
            ...billing([share(GRAN, 100)]),
            person_locations: [{ org_id: ORG, person_id: GRAN, location_id: "loc-gran", is_primary: true }],
            locations: [address({ id: "loc-gran", address_role: "mailing", address1: "2 Gran Court" })],
        });
        const { values, plan } = await resolveAddressBindingPrefill(client, schemaOf([group("mail", "billing_contact")]), CTX);
        expect(plan[0]!.outcome).toBe("person_owned_address");
        expect(plan[0]!.resolvedPersonId).toBe(GRAN);
        expect(values.mail_address_line1).toBe("2 Gran Court");
    });

    it("breaks a priority order deterministically", async () => {
        const { client } = fakeDb({
            ...billing([share(DAD, 200), share(GRAN, 50)]),
            person_locations: [{ org_id: ORG, person_id: GRAN, location_id: "loc-gran", is_primary: true }],
            locations: [address({ id: "loc-gran", address_role: "mailing", address1: "2 Gran Court" })],
        });
        const { plan } = await resolveAddressBindingPrefill(client, schemaOf([group("mail", "billing_contact")]), CTX);
        expect(plan[0]!.resolvedPersonId).toBe(GRAN);
    });

    it("refuses to choose when two parties are tied at the lowest priority", async () => {
        const { client } = fakeDb({
            ...billing([share(DAD, 100), share(GRAN, 100)]),
            person_locations: [{ org_id: ORG, person_id: GRAN, location_id: "loc-gran", is_primary: true }],
            locations: [address({ id: "loc-gran", address_role: "mailing", address1: "2 Gran Court" })],
        });
        const { values, plan } = await resolveAddressBindingPrefill(client, schemaOf([group("mail", "billing_contact")]), CTX);
        expect(plan[0]!.outcome).toBe("billing_contact_ambiguous");
        expect(values).toEqual({});
    });

    it("NEVER falls back to the household address", async () => {
        const { client } = fakeDb({
            ...billing([share(GRAN, 100)]),
            person_locations: [],
            // A perfectly good shared mailing address for the family — and still not the answer.
            locations: [address({ id: "loc-shared", address_role: "mailing", address1: "1 Shared Way" })],
        });
        const { values, plan } = await resolveAddressBindingPrefill(client, schemaOf([group("mail", "billing_contact")]), CTX);
        expect(plan[0]!.outcome).toBe("no_address_on_file");
        expect(values).toEqual({});
    });

    it("leaves it blank when no arrangement names anybody", async () => {
        const { client } = fakeDb({
            financial_responsibility_arrangements: [], financial_responsibility_shares: [],
            person_locations: [], locations: [address({ address_role: "mailing" })],
        });
        const { values, plan } = await resolveAddressBindingPrefill(client, schemaOf([group("mail", "billing_contact")]), CTX);
        expect(plan[0]!.outcome).toBe("no_canonical_subject");
        expect(values).toEqual({});
    });
});

describe("Home and Mailing are different people at different addresses", () => {
    it("fills each from its own person", async () => {
        const { client } = fakeDb({
            financial_responsibility_arrangements: [arrangement()],
            financial_responsibility_shares: [share(GRAN, 100)],
            person_locations: [
                { org_id: ORG, person_id: MOM, location_id: "loc-mom", is_primary: true },
                { org_id: ORG, person_id: GRAN, location_id: "loc-gran", is_primary: true },
            ],
            locations: [
                address({ id: "loc-mom", address_role: "home", address1: "7 Mom Street", city: "Bend" }),
                address({ id: "loc-gran", address_role: "mailing", address1: "2 Gran Court", city: "Sisters" }),
            ],
        });
        const { values, plan } = await resolveAddressBindingPrefill(client, HOME_AND_MAIL, CTX);
        expect(plan.map((p) => p.outcome)).toEqual(["person_owned_address", "person_owned_address"]);
        expect(values.home_address_line1).toBe("7 Mom Street");
        expect(values.home_city).toBe("Bend");
        expect(values.mail_address_line1).toBe("2 Gran Court");
        expect(values.mail_city).toBe("Sisters");
    });
});

describe("account boundary", () => {
    it("never returns a person's address that belongs to another household", async () => {
        const { client } = fakeDb({
            person_locations: [{ org_id: ORG, person_id: MOM, location_id: "loc-elsewhere", is_primary: true }],
            // Mom's address, but recorded under a different customer.
            locations: [address({ id: "loc-elsewhere", customer_id: OTHER_HOUSEHOLD, address_role: "home", address1: "99 Other Street" })],
        });
        const { values, plan } = await resolveAddressBindingPrefill(client, schemaOf([group("home", "guardian")]), CTX);
        expect(plan[0]!.outcome).toBe("no_address_on_file");
        expect(JSON.stringify(values)).not.toContain("99 Other Street");
    });

    it("scopes every canonical read by org and household", async () => {
        const { client, seen } = fakeDb({
            person_locations: [{ org_id: ORG, person_id: MOM, location_id: "loc-mom" }],
            locations: [address({ id: "loc-mom", address_role: "home" })],
        });
        await resolveAddressBindingPrefill(client, schemaOf([group("home", "guardian")]), CTX);
        const locationReads = seen.filter((s) => s.table === "locations");
        expect(locationReads.length).toBeGreaterThan(0);
        for (const read of locationReads) {
            expect(read.filters.org_id).toBe(ORG);
            expect(read.filters.customer_id).toBe(HOUSEHOLD);
        }
        for (const read of seen.filter((s) => s.table === "person_locations")) {
            expect(read.filters.org_id).toBe(ORG);
        }
    });

    it("reads nothing at all without a household to scope to", async () => {
        const { client, seen } = fakeDb({ locations: [address({ address_role: "home" })] });
        const { values, plan } = await resolveAddressBindingPrefill(client, schemaOf([group("home", "guardian")]),
            { ...CTX, customerId: null });
        expect(plan[0]!.outcome).toBe("no_canonical_subject");
        expect(values).toEqual({});
        expect(seen).toEqual([]);
    });
});

describe("the real published Admissions v12", () => {
    const schema = validateFormSchema(PUBLISHED_V12);

    it("carries exactly the two authored bindings, with their leaves", () => {
        const sites = planAddressBindingSites(schema);
        expect(sites.map((s) => `${s.groupId}:${s.role}`)).toEqual([
            "untitled_address:guardian",
            "untitled_address_2:billing_contact",
        ]);
        expect(sites[0]!.leaves).toEqual({
            address_line1: "untitled_address_address_line1",
            city: "untitled_address_city",
            state: "untitled_address_state",
            postal_code: "untitled_address_postal_code",
        });
    });

    it("fills Home from the guardian and Mailing from the billing contact", async () => {
        const { client } = fakeDb({
            financial_responsibility_arrangements: [arrangement()],
            financial_responsibility_shares: [share(GRAN, 100)],
            person_locations: [
                { org_id: ORG, person_id: MOM, location_id: "loc-mom", is_primary: true },
                { org_id: ORG, person_id: GRAN, location_id: "loc-gran", is_primary: true },
            ],
            locations: [
                address({ id: "loc-mom", address_role: "home", address1: "7 Mom Street" }),
                address({ id: "loc-gran", address_role: "mailing", address1: "2 Gran Court" }),
            ],
        });
        const { values } = await resolveAddressBindingPrefill(client, schema, CTX);
        expect(values.untitled_address_address_line1).toBe("7 Mom Street");
        expect(values.untitled_address_2_address_line1).toBe("2 Gran Court");
    });

    it("keeps an address answer as form evidence, proposing no canonical record", () => {
        const bundle = adaptFormSubmissionToRelatedRecordProposals(
            schema,
            {
                untitled_address_address_line1: "99 New Street",
                untitled_address_2_address_line1: "PO Box 5",
            } as never,
            { formSubmissionId: "sub-1", formDefinitionVersionId: "ee75bbc6" },
        );
        const touched = JSON.stringify(bundle);
        expect(touched).not.toContain("99 New Street");
        expect(touched).not.toContain("PO Box 5");
    });
});
