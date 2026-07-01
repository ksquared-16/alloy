import { describe, expect, it, vi } from "vitest";

import {
    attachChildScopedContactLinksToRecord,
    childScopedContactLinksFetchFailed,
    CUSTOMER_MEMBER_CONTACTS_LINK_SELECT,
    CUSTOMER_MEMBER_CONTACT_ROLES_SELECT,
    fetchChildScopedContactLinksForMembers,
} from "@/lib/admin/person/fetchChildScopedContactLinks";
import { buildChildLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildChildLayoutRuntimeRecordFromVm";
import { buildPersonLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildPersonLayoutRuntimeRecordFromVm";
import {
    childScopedContactLinksQueryFailed,
    resolveLayoutRuntimeOpportunityRelationshipContactGroups,
    resolveLayoutRuntimeRelatedChildrenForPerson,
    resolveLayoutRuntimeScopedRelationshipContacts,
} from "@/lib/layout/runtime/layoutRuntimeScopedRelationshipContacts";
import { stampLayoutRuntimeActiveRecordContext } from "@/lib/layout/runtime/layoutRuntimeRelatedListActiveRecord";
import {
    siblingHouseholdMemberContactRows,
    siblingHouseholdMemberRows,
    siblingHouseholdRoleRows,
    siblingInquiryChildren,
    SIBLING_SCOPED_CONTACTS_FIXTURE,
} from "@/tests/admin/fixtures/childScopedContactLinksFixture";

function createMockSupabase(options: {
    memberContactRows?: unknown[];
    memberContactError?: { message: string } | null;
    roleRows?: unknown[];
    roleError?: { message: string } | null;
}) {
    return {
        from(table: string) {
            const state: { table: string; filters: Record<string, unknown> } = { table, filters: {} };
            const builder = {
                select(columns: string) {
                    state.filters.select = columns;
                    return builder;
                },
                eq(column: string, value: unknown) {
                    state.filters[column] = value;
                    return builder;
                },
                in(column: string, values: unknown[]) {
                    state.filters[`in:${column}`] = values;
                    return builder;
                },
                then(resolve: (v: unknown) => void) {
                    if (table === "customer_member_contacts") {
                        resolve({
                            data: options.memberContactError ? null : (options.memberContactRows ?? []),
                            error: options.memberContactError ?? null,
                        });
                        return;
                    }
                    if (table === "customer_member_contact_roles") {
                        resolve({
                            data: options.roleError ? null : (options.roleRows ?? []),
                            error: options.roleError ?? null,
                        });
                        return;
                    }
                    resolve({ data: [], error: null });
                },
            };
            return builder;
        },
    };
}

describe("fetchChildScopedContactLinksForMembers schema-valid selects", () => {
    it("uses schema-valid member contact and role label columns", () => {
        expect(CUSTOMER_MEMBER_CONTACTS_LINK_SELECT).not.toMatch(/sort_order/);
        expect(CUSTOMER_MEMBER_CONTACTS_LINK_SELECT).toContain("customer_member_id");
        expect(CUSTOMER_MEMBER_CONTACT_ROLES_SELECT).toContain("role_label");
        expect(CUSTOMER_MEMBER_CONTACT_ROLES_SELECT.split(/,\s*/).map((c) => c.trim())).not.toContain("label");
    });

    it("hydrates sibling fixture rows with distinct emergency contacts per member", async () => {
        const supabase = createMockSupabase({
            memberContactRows: siblingHouseholdMemberContactRows(),
            roleRows: siblingHouseholdRoleRows(),
        });

        const result = await fetchChildScopedContactLinksForMembers(
            supabase as never,
            SIBLING_SCOPED_CONTACTS_FIXTURE.orgId,
            siblingHouseholdMemberRows(),
        );

        expect(childScopedContactLinksFetchFailed(result)).toBe(false);
        expect(result.links.length).toBe(6);

        const recordA = stampLayoutRuntimeActiveRecordContext(
            {
                id: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA,
                customer_member_id: SIBLING_SCOPED_CONTACTS_FIXTURE.memberA,
                _child_scoped_contact_links: result.links,
            },
            { anchorEntity: "child", entityId: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA },
        );
        const recordB = stampLayoutRuntimeActiveRecordContext(
            {
                id: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonB,
                customer_member_id: SIBLING_SCOPED_CONTACTS_FIXTURE.memberB,
                _child_scoped_contact_links: result.links,
            },
            { anchorEntity: "child", entityId: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonB },
        );

        expect(
            resolveLayoutRuntimeScopedRelationshipContacts(recordA, "emergency_contacts_for_child").map(
                (r) => r.display_name,
            ),
        ).toEqual(["Pat Lee"]);
        expect(
            resolveLayoutRuntimeScopedRelationshipContacts(recordB, "emergency_contacts_for_child").map(
                (r) => r.display_name,
            ),
        ).toEqual(["Sam Walsh"]);
    });

    it("reports query failure instead of silently returning empty scoped links", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const supabase = createMockSupabase({
            memberContactError: { message: 'column "sort_order" does not exist' },
        });

        const out: Record<string, unknown> = {};
        const result = await attachChildScopedContactLinksToRecord(
            supabase as never,
            SIBLING_SCOPED_CONTACTS_FIXTURE.orgId,
            siblingHouseholdMemberRows(),
            out,
        );

        expect(result.links).toEqual([]);
        expect(result.memberContactsQueryError).toContain("sort_order");
        expect(out._child_scoped_contact_links_query_failed).toBe(true);
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });
});

describe("drawer runtime hydration from fetched scoped links", () => {
    it("child drawer record carries hydrated scoped links", async () => {
        const supabase = createMockSupabase({
            memberContactRows: siblingHouseholdMemberContactRows(),
            roleRows: siblingHouseholdRoleRows(),
        });
        const vmRecord: Record<string, unknown> = {
            first_name: "Riley",
            last_name: "Brooks",
            _enrollment_mirror: [{ customer_member_id: SIBLING_SCOPED_CONTACTS_FIXTURE.memberA }],
        };
        await attachChildScopedContactLinksToRecord(
            supabase as never,
            SIBLING_SCOPED_CONTACTS_FIXTURE.orgId,
            [{ id: SIBLING_SCOPED_CONTACTS_FIXTURE.memberA, person_id: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA }],
            vmRecord,
        );

        const record = buildChildLayoutRuntimeRecordFromVm({
            vmRecord,
            personId: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA,
        });

        expect(Array.isArray(record._child_scoped_contact_links)).toBe(true);
        expect((record._child_scoped_contact_links as unknown[]).length).toBeGreaterThan(0);
        expect(childScopedContactLinksQueryFailed(record)).toBe(false);
        expect(
            resolveLayoutRuntimeScopedRelationshipContacts(record, "guardians_for_child").map((r) => r.display_name),
        ).toContain("Jordan Lee");
    });

    it("person drawer groups related children from hydrated scoped links", async () => {
        const supabase = createMockSupabase({
            memberContactRows: siblingHouseholdMemberContactRows(),
            roleRows: siblingHouseholdRoleRows(),
        });
        const vmRecord: Record<string, unknown> = {
            _person_relationships: [
                {
                    from_person_id: "person-parent",
                    to_person_id: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA,
                    relationship_type: "parent",
                    _other_person_id: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA,
                    _other_person_name: "Riley Brooks",
                },
            ],
            _household_child_links: [
                {
                    customer_member_id: SIBLING_SCOPED_CONTACTS_FIXTURE.memberA,
                    person_id: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA,
                    display_name: "Riley Brooks",
                },
            ],
        };
        await attachChildScopedContactLinksToRecord(
            supabase as never,
            SIBLING_SCOPED_CONTACTS_FIXTURE.orgId,
            siblingHouseholdMemberRows(),
            vmRecord,
        );

        const record = buildPersonLayoutRuntimeRecordFromVm({
            vmRecord,
            personId: "person-parent",
        });

        const groups = resolveLayoutRuntimeRelatedChildrenForPerson(record);
        expect(groups).toHaveLength(1);
        expect(groups[0]?.child_display_name).toBe("Riley Brooks");
        expect(groups[0]?.contacts.map((c) => c.display_name).sort()).toEqual(
            ["Jordan Lee", "Pat Lee", "Taylor Lee"].sort(),
        );
    });

    it("opportunity multi-child record hydrates grouped contacts", async () => {
        const supabase = createMockSupabase({
            memberContactRows: siblingHouseholdMemberContactRows(),
            roleRows: siblingHouseholdRoleRows(),
        });
        const inquiryChildren = siblingInquiryChildren();
        const vmRecord: Record<string, unknown> = {
            id: "opp-fixture",
            _inquiry_children: inquiryChildren,
            children: inquiryChildren,
        };
        await attachChildScopedContactLinksToRecord(
            supabase as never,
            SIBLING_SCOPED_CONTACTS_FIXTURE.orgId,
            siblingHouseholdMemberRows(),
            vmRecord,
        );

        const groups = resolveLayoutRuntimeOpportunityRelationshipContactGroups(vmRecord, "guardians_for_child");
        expect(groups).toHaveLength(2);
        expect(groups[0]?.contacts.map((c) => c.display_name)).toEqual(["Jordan Lee"]);
        expect(groups[1]?.contacts.map((c) => c.display_name)).toEqual(["Alex Johnson"]);
    });

    it("does not household-fallback when scoped link query failed", () => {
        const record = stampLayoutRuntimeActiveRecordContext(
            {
                id: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA,
                customer_member_id: SIBLING_SCOPED_CONTACTS_FIXTURE.memberA,
                _child_scoped_contact_links: [],
                _child_scoped_contact_links_query_failed: true,
                _household_adult_links: [
                    {
                        person_id: "household-shared-guardian",
                        display_name: "Shared Household Guardian",
                        role_type: "guardian",
                        role_label: "Guardian",
                        is_primary: false,
                        customer_id: "cust-1",
                        is_household_primary_contact: false,
                    },
                ],
            },
            { anchorEntity: "child", entityId: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA },
        );

        expect(
            resolveLayoutRuntimeScopedRelationshipContacts(record, "guardians_for_child").map((r) => r.display_name),
        ).toEqual([]);
    });
});
