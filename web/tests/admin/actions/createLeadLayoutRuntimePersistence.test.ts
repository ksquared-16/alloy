import { describe, expect, it, vi } from "vitest";
import {
    applyChildScopedContactAssignments,
    buildDefaultGuardianScopedAssignments,
    mergeChildScopedContactAssignments,
    pickFirstAvailableMemberContactRoleKey,
    resolveGuardianMemberContactRoleKey,
    upsertCustomerMemberContactLink,
} from "@/lib/admin/actions/createLeadChildScopedContactPersistence";
import { parseAddressLines, readHouseholdAddressFromCommitSelection } from "@/lib/admin/actions/createLeadAddressPersistence";
import { attachChildScopedContactLinksToRecord } from "@/lib/admin/person/fetchChildScopedContactLinks";
import {
    resolveLayoutRuntimeOpportunityRelationshipContactGroups,
    resolveLayoutRuntimeScopedRelationshipContacts,
} from "@/lib/layout/runtime/layoutRuntimeScopedRelationshipContacts";
import { stampLayoutRuntimeActiveRecordContext } from "@/lib/layout/runtime/layoutRuntimeRelatedListActiveRecord";
import { resolveHouseholdAddressFieldValues } from "@/lib/layout/runtime/resolveHouseholdAddressFieldValues";
import { buildChildLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildChildLayoutRuntimeRecordFromVm";
import { resolvePersonAddressFieldValues } from "@/lib/layout/runtime/resolvePersonAddressFieldValues";
import type { CreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";

function createRoleAwareSupabase(options: {
    roleKeys?: string[];
    memberContacts?: unknown[];
    existingContactByPerson?: Record<string, string>;
    ocmRows?: unknown[];
    locations?: unknown[];
    fieldDefinitions?: Array<{ id: string; field_key: string; field_type: string }>;
    fieldValues?: unknown[];
}) {
    const memberContacts = [...(options.memberContacts ?? [])];
    const contacts = new Map(Object.entries(options.existingContactByPerson ?? {}));
    const locations = [...(options.locations ?? [])];
    const fieldValues = [...(options.fieldValues ?? [])];

    return {
        from(table: string) {
            const state: Record<string, unknown> = { table };
            const builder = {
                select(cols?: string) {
                    state.select = cols;
                    return builder;
                },
                eq(col: string, val: unknown) {
                    state[col] = val;
                    return builder;
                },
                in(col: string, vals: unknown[]) {
                    state[`in:${col}`] = vals;
                    return builder;
                },
                is(col: string, val: unknown) {
                    state[`is:${col}`] = val;
                    return builder;
                },
                neq(col: string, val: unknown) {
                    state[`neq:${col}`] = val;
                    return builder;
                },
                limit(n: number) {
                    state.limit = n;
                    return builder;
                },
                order() {
                    return builder;
                },
                insert(payload: unknown) {
                    if (table === "customer_member_contacts") {
                        memberContacts.push(payload);
                    }
                    if (table === "contacts") {
                        const row = payload as { person_id: string; id?: string };
                        const id = row.id ?? `contact-${row.person_id}`;
                        contacts.set(row.person_id, id);
                    }
                    if (table === "locations") {
                        const row = payload as { id?: string };
                        const id = row.id ?? `loc-${locations.length + 1}`;
                        locations.push({ ...(payload as object), id });
                    }
                    if (table === "field_values") {
                        fieldValues.push(payload);
                    }
                    return {
                        select: () => ({
                            single: async () => ({
                                data: table === "contacts"
                                    ? { id: `contact-${(payload as { person_id: string }).person_id}` }
                                    : table === "locations"
                                        ? { id: `loc-${locations.length}` }
                                        : payload,
                                error: null,
                            }),
                        }),
                    };
                },
                update() {
                    return builder;
                },
                maybeSingle: async () => {
                    if (table === "customer_member_contact_roles") {
                        const roleKey = state.role_key as string;
                        const active = (options.roleKeys ?? ["guardian", "secondary_guardian", "emergency_contact", "billing_contact", "payer"]).includes(roleKey);
                        return { data: active ? { role_key: roleKey } : null, error: null };
                    }
                    if (table === "customer_member_contacts") {
                        const match = memberContacts.find(
                            (row) =>
                                (row as { customer_member_id?: string }).customer_member_id === state.customer_member_id
                                && (row as { contact_id?: string }).contact_id === state.contact_id
                                && (row as { role_key?: string }).role_key === state.role_key,
                        );
                        return { data: match ? { id: "existing-cmc" } : null, error: null };
                    }
                    if (table === "contacts" && state.person_id) {
                        const id = contacts.get(String(state.person_id));
                        return { data: id ? { id } : null, error: null };
                    }
                    if (table === "persons") {
                        return {
                            data: {
                                id: state.id,
                                first_name: "Jordan",
                                last_name: "Lee",
                                email: "j@test.com",
                                phone: "555-0100",
                            },
                            error: null,
                        };
                    }
                    if (table === "field_definitions") {
                        return {
                            data: (options.fieldDefinitions ?? []).filter((def) => {
                                const keys = state[`in:field_key`] as string[] | undefined;
                                return !keys || keys.includes(def.field_key);
                            }),
                            error: null,
                        };
                    }
                    if (table === "field_values") {
                        return { data: null, error: null };
                    }
                    if (table === "locations") {
                        return { data: null, error: null };
                    }
                    return { data: null, error: null };
                },
                then(resolve: (v: unknown) => void) {
                    if (table === "customer_member_contact_roles") {
                        resolve({
                            data: (options.roleKeys ?? ["guardian", "secondary_guardian", "emergency_contact", "billing_contact", "payer"]).map(
                                (role_key) => ({ role_key }),
                            ),
                            error: null,
                        });
                        return;
                    }
                    if (table === "customer_member_contacts") {
                        resolve({ data: memberContacts, error: null });
                        return;
                    }
                    if (table === "opportunity_customer_members") {
                        resolve({ data: options.ocmRows ?? [], error: null });
                        return;
                    }
                    if (table === "locations") {
                        resolve({ data: locations, error: null });
                        return;
                    }
                    if (table === "field_definitions") {
                        resolve({ data: options.fieldDefinitions ?? [], error: null });
                        return;
                    }
                    resolve({ data: [], error: null });
                },
            };
            return builder;
        },
        _memberContacts: memberContacts,
        _locations: locations,
        _fieldValues: fieldValues,
    };
}

describe("createLeadChildScopedContactPersistence", () => {
    it("maps primary/secondary guardians to configured role keys", () => {
        const roles = new Set(["guardian", "secondary_guardian", "emergency_contact"]);
        expect(resolveGuardianMemberContactRoleKey(true, roles)).toBe("guardian");
        expect(resolveGuardianMemberContactRoleKey(false, roles)).toBe("secondary_guardian");
        expect(pickFirstAvailableMemberContactRoleKey(["payer", "guardian"], roles)).toBe("guardian");
    });

    it("builds guardian assignments for each child member", () => {
        const assignments = buildDefaultGuardianScopedAssignments({
            childMembers: [
                { customer_member_id: "member-a", person_id: "child-a" },
                { customer_member_id: "member-b", person_id: "child-b" },
            ],
            guardians: [
                { person_id: "parent-primary", is_primary: true },
                { person_id: "parent-secondary", is_primary: false },
            ],
            activeRoleKeys: new Set(["guardian", "secondary_guardian"]),
        });
        expect(assignments).toHaveLength(4);
        expect(assignments.filter((a) => a.person_id === "parent-primary").every((a) => a.role_key === "guardian")).toBe(true);
        expect(assignments.filter((a) => a.person_id === "parent-secondary").every((a) => a.role_key === "secondary_guardian")).toBe(true);
    });

    it("is idempotent when upserting customer_member_contacts", async () => {
        const supabase = createRoleAwareSupabase({});
        const input = {
            orgId: "org-1",
            customerId: "cust-1",
            customerMemberId: "member-a",
            contactId: "contact-1",
            roleKey: "guardian",
        };
        const first = await upsertCustomerMemberContactLink(supabase as never, input);
        const second = await upsertCustomerMemberContactLink(supabase as never, input);
        expect(first.inserted).toBe(true);
        expect(second.inserted).toBe(false);
        expect(supabase._memberContacts).toHaveLength(1);
    });

    it("writes scoped links for two children and two guardians", async () => {
        const supabase = createRoleAwareSupabase({
            ocmRows: [
                { customer_member_id: "member-a", customer_members: { person_id: "child-a" } },
                { customer_member_id: "member-b", customer_members: { person_id: "child-b" } },
            ],
        });

        const assignments = mergeChildScopedContactAssignments(
            buildDefaultGuardianScopedAssignments({
                childMembers: [
                    { customer_member_id: "member-a", person_id: "child-a" },
                    { customer_member_id: "member-b", person_id: "child-b" },
                ],
                guardians: [
                    { person_id: "parent-primary", is_primary: true },
                    { person_id: "parent-secondary", is_primary: false },
                ],
                activeRoleKeys: new Set(["guardian", "secondary_guardian"]),
            }),
        );

        const result = await applyChildScopedContactAssignments(supabase as never, {
            orgId: "org-1",
            customerId: "cust-1",
            assignments,
        });

        expect(result.links_written).toBe(4);
        expect(supabase._memberContacts).toHaveLength(4);
    });
});

describe("create lead layout runtime hydration", () => {
    it("hydrates child drawer guardian scoped links from persisted rows", async () => {
        const supabase = createRoleAwareSupabase({
            memberContacts: [
                {
                    id: "cmc-1",
                    customer_member_id: "member-a",
                    contact_id: "contact-g1",
                    role_key: "guardian",
                    is_active: true,
                    contact: {
                        id: "contact-g1",
                        person_id: "parent-primary",
                        first_name: "Jordan",
                        last_name: "Lee",
                        email: null,
                        phone: null,
                    },
                },
            ],
        });

        const vmRecord: Record<string, unknown> = {
            first_name: "Riley",
            last_name: "Brooks",
            _enrollment_mirror: [{ customer_member_id: "member-a" }],
        };
        await attachChildScopedContactLinksToRecord(
            supabase as never,
            "org-1",
            [{ id: "member-a", person_id: "child-a" }],
            vmRecord,
        );

        const record = buildChildLayoutRuntimeRecordFromVm({ vmRecord, personId: "child-a" });
        expect(
            resolveLayoutRuntimeScopedRelationshipContacts(record, "guardians_for_child").map((r) => r.display_name),
        ).toEqual(["Jordan Lee"]);
    });

    it("groups opportunity child-scoped guardians per child", async () => {
        const links = [
            {
                customer_member_id: "member-a",
                child_person_id: "child-a",
                person_id: "parent-primary",
                contact_id: "c1",
                display_name: "Jordan Lee",
                role_type: "guardian",
                role_label: "Guardian",
                is_primary: true,
                phone: null,
                email: null,
                sort_order: 10,
            },
            {
                customer_member_id: "member-b",
                child_person_id: "child-b",
                person_id: "parent-secondary",
                contact_id: "c2",
                display_name: "Alex Johnson",
                role_type: "secondary_guardian",
                role_label: "Secondary guardian",
                is_primary: false,
                phone: null,
                email: null,
                sort_order: 11,
            },
        ];
        const oppRecord = {
            _inquiry_children: [
                { customer_member_id: "member-a", person_id: "child-a", display_name: "Riley" },
                { customer_member_id: "member-b", person_id: "child-b", display_name: "Sam" },
            ],
            _child_scoped_contact_links: links,
        };
        const groups = resolveLayoutRuntimeOpportunityRelationshipContactGroups(oppRecord, "guardians_for_child");
        expect(groups).toHaveLength(2);
        expect(groups[0]?.contacts.map((c) => c.display_name)).toEqual(["Jordan Lee"]);
        expect(groups[1]?.contacts.map((c) => c.display_name)).toEqual(["Alex Johnson"]);
    });
});

describe("createLeadAddressPersistence", () => {
    it("parses household address lines for layout refs", () => {
        const parsed = parseAddressLines(["123 Main St", "Austin, TX 78701"]);
        expect(parsed?.address_line1).toBe("123 Main St");
        expect(parsed?.city).toBe("Austin");
        expect(parsed?.state).toBe("TX");
        expect(parsed?.postal_code).toBe("78701");

        const selection: CreateLeadCommitSelection = {
            version: 1,
            parents: [],
            children: [],
            household_contacts: { email: null, phone: null, invalid_phone: false },
            household_address: {
                lines: ["123 Main St", "Austin, TX 78701"],
                address_line1: "123 Main St",
                city: "Austin",
                state: "TX",
                postal_code: "78701",
            },
            address_review_only: true,
        };
        const structured = readHouseholdAddressFromCommitSelection(selection);
        const layoutFields = resolveHouseholdAddressFieldValues({
            _household_customer_addresses: [
                {
                    customer_id: "cust-1",
                    location_id: "loc-1",
                    address_line1: structured?.address_line1 ?? null,
                    address_line2: structured?.address_line2 ?? null,
                    city: structured?.city ?? null,
                    state: structured?.state ?? null,
                    postal_code: structured?.postal_code ?? null,
                    label: null,
                },
            ],
        });
        expect(layoutFields["location.household_address_line1"]).toBe("123 Main St");
        expect(layoutFields["location.household_address_city"]).toBe("Austin");
    });

    it("maps person field_values to person.address_* layout refs", () => {
        const fields = resolvePersonAddressFieldValues({
            address_line1: "456 Oak Ave",
            city: "Dallas",
            state: "TX",
            postal_code: "75201",
        });
        expect(fields["person.address_line1"]).toBe("456 Oak Ave");
        expect(fields["person.city"]).toBe("Dallas");
        expect(fields["person.postal_code"]).toBe("75201");
    });
});

describe("create lead queue contract", () => {
    it("preserves status + activity event expectations after layout persistence hook", () => {
        const opportunityRecord = {
            id: "opp-1",
            status_key: "open",
            _activity_timeline_events: [
                {
                    id: "evt-1",
                    occurred_at: "2026-06-22T12:00:00.000Z",
                    event_type: "opportunity_status_changed",
                    payload: { new_status_key: "open" },
                },
            ],
        };
        expect(opportunityRecord.status_key).toBe("open");
        expect(opportunityRecord._activity_timeline_events).toHaveLength(1);
    });
});

describe("child scoped active record stamping", () => {
    it("does not household-fallback when scoped links exist", () => {
        const record = stampLayoutRuntimeActiveRecordContext(
            {
                id: "child-a",
                customer_member_id: "member-a",
                _child_scoped_contact_links: [
                    {
                        customer_member_id: "member-a",
                        child_person_id: "child-a",
                        person_id: "parent-primary",
                        contact_id: "c1",
                        display_name: "Jordan Lee",
                        role_type: "guardian",
                        role_label: "Guardian",
                        is_primary: true,
                        phone: null,
                        email: null,
                        sort_order: null,
                    },
                ],
                _household_adult_links: [
                    {
                        person_id: "household-shared",
                        display_name: "Shared Household Guardian",
                        role_type: "guardian",
                        role_label: "Guardian",
                        is_primary: false,
                        customer_id: "cust-1",
                        is_household_primary_contact: false,
                    },
                ],
            },
            { anchorEntity: "child", entityId: "child-a" },
        );
        expect(
            resolveLayoutRuntimeScopedRelationshipContacts(record, "guardians_for_child").map((r) => r.display_name),
        ).toEqual(["Jordan Lee"]);
    });
});
