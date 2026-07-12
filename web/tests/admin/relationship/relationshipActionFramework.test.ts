import { describe, expect, it, vi } from "vitest";
import {
    ADD_EMERGENCY_CONTACT_ACTION_KEY,
    EMERGENCY_CONTACT_ADDED_EVENT_TYPE,
} from "@/lib/admin/actions/addEmergencyContactAction";
import {
    resolveEmergencyMemberContactRoleKey,
} from "@/lib/admin/actions/createLeadChildScopedContactPersistence";
import {
    RELATIONSHIP_ACTION_KEYS,
    isRelationshipActionKey,
    proposalToExecutionRequest,
    readHouseholdAdultCandidatesFromRuntimeRecord,
    readHouseholdChildrenFromRuntimeRecord,
} from "@/lib/admin/relationship/relationshipActionContract";
import {
    bosProposalRequiresConfirmation,
    bosProposalToExecutionRequest,
    parseBosRelationshipActionPrompt,
} from "@/lib/admin/relationship/relationshipActionBosAdapter";
import { RELATIONSHIP_ACTION_EXECUTED_EVENT_TYPE } from "@/lib/admin/relationship/emitRelationshipActionEvent";
import { executeRelationshipAction } from "@/lib/admin/relationship/executeRelationshipAction";
import { resolveRelationshipRoleKeyForAction } from "@/lib/admin/relationship/relationshipActionRoleResolution";
import {
    RELATIONSHIP_ACTION_REGISTRY,
    listRelationshipActionsForBuilder,
    relationshipActionRegistryEntry,
} from "@/lib/admin/relationship/relationshipActionRegistry";
import {
    resolveEmergencyContactScopeMemberIds,
    resolveEmergencyContactScopeTargets,
    resolveRelationshipScopeMemberIds,
    scopeAllowedForAction,
} from "@/lib/admin/relationship/relationshipActionScope";
import {
    resolveRelationshipActionContext,
    shouldShowRelationshipAction,
} from "@/lib/admin/relationship/relationshipActionRuntimeContext";
import { buildLayoutEditorActionCatalogGroups } from "@/lib/layout/layoutEditorActionCatalog";
import {
    LAYOUT_EDITOR_RELATIONSHIP_ACTION_KEYS,
    isAllowedLayoutEditorActionKey,
    makeLayoutEditorActionButtonItem,
} from "@/lib/layout/layoutEditorActionButton";
import { resolveLayoutRuntimeScopedRelationshipContacts } from "@/lib/layout/runtime/layoutRuntimeScopedRelationshipContacts";
import {
    siblingHouseholdMemberContactRows,
    SIBLING_SCOPED_CONTACTS_FIXTURE,
} from "@/tests/admin/fixtures/childScopedContactLinksFixture";

vi.mock("@/lib/admin/relationship/emitRelationshipActionEvent", () => ({
    emitRelationshipActionEvent: vi.fn().mockResolvedValue("evt-1"),
    RELATIONSHIP_ACTION_EXECUTED_EVENT_TYPE: "relationship.action_executed",
}));

vi.mock("@/lib/admin/actions/createLeadChildScopedContactPersistence", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/admin/actions/createLeadChildScopedContactPersistence")>();
    return {
        ...actual,
        loadActiveMemberContactRoleKeys: vi.fn().mockResolvedValue(new Set(["emergency_contact", "authorized_pickup", "billing_contact", "guardian"])),
        ensureContactForPerson: vi.fn().mockResolvedValue("contact-1"),
        applyChildScopedContactAssignments: vi.fn().mockResolvedValue({ links_written: 1, links_skipped_invalid_role: 0 }),
    };
});

vi.mock("@/lib/admin/actions/createLeadRoleContactPersistence", () => ({
    ensureCustomerPersonRoleLink: vi.fn().mockResolvedValue(undefined),
    ensureOpportunityPersonExplicitRole: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/persons/findOrCreatePersonInOrg", () => ({
    findOrCreatePersonInOrgWithMeta: vi.fn().mockResolvedValue({ id: "person-new" }),
}));

vi.mock("@/lib/admin/person/fetchChildScopedContactLinks", () => ({
    memberRowsFromInquiryChildren: vi.fn().mockReturnValue([]),
    attachChildScopedContactLinksToRecord: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/admin/actions/createLeadPersonChildRelationshipPersistence", () => ({
    applyCanonicalChildScopedRelationships: vi.fn().mockResolvedValue({
        relationships_written: 1,
        roles_written: 1,
        skipped: 0,
    }),
}));

vi.mock("@/lib/fields/personChildRelationship/attachPersonChildRelationshipsToEntityRecord", () => ({
    attachPersonChildRelationshipsToEntityRecord: vi.fn().mockResolvedValue([
        {
            customer_member_id: "member-a",
            customer_id: "cust-fixture",
            child_id: null,
            items: [],
        },
    ]),
}));

const householdChildren = [
    {
        customer_member_id: SIBLING_SCOPED_CONTACTS_FIXTURE.memberA,
        child_person_id: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA,
        display_name: "Riley Brooks",
    },
    {
        customer_member_id: SIBLING_SCOPED_CONTACTS_FIXTURE.memberB,
        child_person_id: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonB,
        display_name: "Sam Johnson",
    },
];

function mockSupabaseForEmergencyContact() {
    const customerMembers = householdChildren.map((child) => ({
        id: child.customer_member_id,
        person_id: child.child_person_id,
        persons: { first_name: child.display_name.split(" ")[0], last_name: child.display_name.split(" ")[1] },
    }));

    return {
        from: vi.fn((table: string) => {
            if (table === "customer_members") {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockResolvedValue({ data: customerMembers, error: null }),
                        }),
                    }),
                };
            }
            if (table === "persons") {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                maybeSingle: vi.fn().mockResolvedValue({ data: { id: "person-grandma" }, error: null }),
                            }),
                        }),
                    }),
                };
            }
            return { select: vi.fn(), insert: vi.fn() };
        }),
    };
}

describe("relationship action registry", () => {
    it("registers all initial relationship actions", () => {
        for (const key of RELATIONSHIP_ACTION_KEYS) {
            expect(relationshipActionRegistryEntry(key)?.actionKey).toBe(key);
        }
        expect(RELATIONSHIP_ACTION_REGISTRY).toHaveLength(RELATIONSHIP_ACTION_KEYS.length);
    });

    it("gates builder picker entries by surface and context", () => {
        const childDrawer = listRelationshipActionsForBuilder({
            surfaceKey: "child_drawer",
            context: "section_row",
        });
        expect(childDrawer.map((entry) => entry.actionKey)).toContain("add_emergency_contact");
        expect(childDrawer.map((entry) => entry.actionKey)).not.toContain("make_primary_contact");

        const opportunity = listRelationshipActionsForBuilder({
            surfaceKey: "opportunity_drawer",
            context: "section_row",
        });
        expect(opportunity.map((entry) => entry.actionKey)).toContain("add_child");
        expect(opportunity.map((entry) => entry.actionKey)).not.toContain("add_emergency_contact");
    });

    it("generates scope options per action", () => {
        const emergency = relationshipActionRegistryEntry("add_emergency_contact")!;
        expect(scopeAllowedForAction(emergency.allowedScopes, "this_child")).toBe(true);
        expect(scopeAllowedForAction(emergency.allowedScopes, "this_opportunity")).toBe(false);

        const billing = relationshipActionRegistryEntry("add_billing_contact")!;
        expect(scopeAllowedForAction(billing.allowedScopes, "this_opportunity")).toBe(true);
    });
});

describe("relationship action scope", () => {
    it("resolves this_child scope to anchor member only", () => {
        expect(
            resolveRelationshipScopeMemberIds({
                scope: "this_child",
                anchorCustomerMemberId: SIBLING_SCOPED_CONTACTS_FIXTURE.memberA,
                householdChildren,
            }),
        ).toEqual([SIBLING_SCOPED_CONTACTS_FIXTURE.memberA]);
    });

    it("resolves selected siblings scope (legacy alias)", () => {
        expect(
            resolveEmergencyContactScopeTargets({
                scope: "selected_children",
                anchorCustomerMemberId: SIBLING_SCOPED_CONTACTS_FIXTURE.memberA,
                householdChildren,
                selectedCustomerMemberIds: [
                    SIBLING_SCOPED_CONTACTS_FIXTURE.memberA,
                    SIBLING_SCOPED_CONTACTS_FIXTURE.memberB,
                ],
            }).map((child) => child.customer_member_id),
        ).toEqual([
            SIBLING_SCOPED_CONTACTS_FIXTURE.memberA,
            SIBLING_SCOPED_CONTACTS_FIXTURE.memberB,
        ]);
    });

    it("resolves all children in household scope", () => {
        expect(
            resolveEmergencyContactScopeMemberIds({
                scope: "all_children_in_household",
                anchorCustomerMemberId: SIBLING_SCOPED_CONTACTS_FIXTURE.memberA,
                householdChildren,
            }),
        ).toEqual([
            SIBLING_SCOPED_CONTACTS_FIXTURE.memberA,
            SIBLING_SCOPED_CONTACTS_FIXTURE.memberB,
        ]);
    });
});

describe("relationship action contract runtime helpers", () => {
    it("reads household children and adults from runtime record", () => {
        const record = {
            customer_id: "cust-1",
            customer_member_id: SIBLING_SCOPED_CONTACTS_FIXTURE.memberA,
            "child.id": SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA,
            "child.name": "Riley Brooks",
            _household_children: [
                {
                    customer_member_id: SIBLING_SCOPED_CONTACTS_FIXTURE.memberB,
                    person_id: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonB,
                    display_name: "Sam Johnson",
                },
            ],
            _household_adult_links: [{ person_id: "person-grandma", display_name: "Grandma Susan" }],
        };
        expect(readHouseholdChildrenFromRuntimeRecord(record)).toHaveLength(2);
        expect(readHouseholdAdultCandidatesFromRuntimeRecord(record)[0]?.person_id).toBe("person-grandma");
    });

    it("resolveEmergencyMemberContactRoleKey prefers emergency_contact then emergency", () => {
        expect(resolveEmergencyMemberContactRoleKey(new Set(["guardian", "emergency_contact"]))).toBe("emergency_contact");
        expect(resolveEmergencyMemberContactRoleKey(new Set(["guardian", "emergency"]))).toBe("emergency");
        expect(resolveEmergencyMemberContactRoleKey(new Set(["guardian"]))).toBeNull();
    });

    it("resolveRelationshipRoleKeyForAction maps authorized pickup fallback", () => {
        expect(
            resolveRelationshipRoleKeyForAction({
                actionKey: "add_authorized_pickup",
                activeRoleKeys: new Set(["pickup"]),
            }),
        ).toBe("pickup");
    });
});

describe("relationship action builder catalog", () => {
    it("includes all relationship action keys in drawer action keys", () => {
        for (const key of LAYOUT_EDITOR_RELATIONSHIP_ACTION_KEYS) {
            expect(isAllowedLayoutEditorActionKey(key)).toBe(true);
            expect(isRelationshipActionKey(key)).toBe(true);
        }
    });

    it("shows relationship actions group on child drawer", () => {
        expect(ADD_EMERGENCY_CONTACT_ACTION_KEY).toBe("add_emergency_contact");
        const groups = buildLayoutEditorActionCatalogGroups({
            surfaceKey: "child_drawer",
            context: "section_row",
        });
        const relationship = groups.find((group) => group.groupKey === "relationship_actions");
        expect(relationship?.actions.some((action) => action.actionKey === "add_emergency_contact")).toBe(true);
        expect(relationship?.actions.some((action) => action.actionKey === "add_authorized_pickup")).toBe(true);

        const personDrawer = buildLayoutEditorActionCatalogGroups({
            surfaceKey: "person_drawer",
            context: "contact_block",
        });
        expect(
            personDrawer
                .flatMap((group) => group.actions)
                .some((action) => action.actionKey === "make_primary_contact"),
        ).toBe(true);
    });

    it("insert creates valid layout action button item", () => {
        const item = makeLayoutEditorActionButtonItem({ actionKey: "add_billing_contact" });
        expect(item.refKey).toBe("_action_button");
        expect(item.metadata?.layoutEditorActionButton).toMatchObject({
            actionKey: "add_billing_contact",
        });
    });
});

describe("relationship action runtime context", () => {
    const anchorRecord = {
        id: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA,
        customer_id: "cust-fixture",
        customer_member_id: SIBLING_SCOPED_CONTACTS_FIXTURE.memberA,
        "child.id": SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA,
        "child.name": "Riley Brooks",
        _household_children: householdChildren.map((child) => ({
            customer_member_id: child.customer_member_id,
            person_id: child.child_person_id,
            display_name: child.display_name,
        })),
        _household_adult_links: [{ person_id: "person-grandma", display_name: "Grandma Susan" }],
    };

    it("resolves child drawer action context", () => {
        const ctx = resolveRelationshipActionContext({ anchorRecord, sourceSurface: "child_drawer" });
        expect(ctx?.anchorCustomerMemberId).toBe(SIBLING_SCOPED_CONTACTS_FIXTURE.memberA);
        expect(ctx?.householdChildren.length).toBeGreaterThanOrEqual(2);
        expect(shouldShowRelationshipAction({ context: ctx, canMutate: true })).toBe(true);
        expect(shouldShowRelationshipAction({ context: ctx, canMutate: false })).toBe(false);
    });

    it("emergency contacts widget shows scoped emergency contact rows", () => {
        const record = {
            ...anchorRecord,
            _child_scoped_contact_links: siblingHouseholdMemberContactRows()
                .filter((row) => row.role_key === "emergency_contact")
                .map((row) => ({
                    customer_member_id: row.customer_member_id,
                    child_person_id:
                        row.customer_member_id === SIBLING_SCOPED_CONTACTS_FIXTURE.memberA ?
                            SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA
                        :   SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonB,
                    person_id: row.contact.person_id,
                    contact_id: row.contact_id,
                    display_name: [row.contact.first_name, row.contact.last_name].filter(Boolean).join(" "),
                    role_type: row.role_key,
                    role_label: "Emergency contact",
                    is_primary: false,
                    phone: null,
                    email: null,
                    sort_order: null,
                })),
        };
        const contacts = resolveLayoutRuntimeScopedRelationshipContacts(record, "emergency_contacts_for_child");
        expect(contacts.some((row) => row.display_name.includes("Pat"))).toBe(true);
    });
});

describe("relationship action BOS adapter", () => {
    it("maps emergency contact prompt to proposal requiring confirmation", () => {
        const parsed = parseBosRelationshipActionPrompt(
            "Add Grandma Susan as emergency contact for Billie and her siblings.",
        );
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        expect(parsed.proposal.actionKey).toBe("add_emergency_contact");
        expect(parsed.proposal.scope).toBe("all_children_in_household");
        expect(bosProposalRequiresConfirmation(parsed.proposal)).toBe(true);
    });

    it("proposal maps to execution request without bypassing confirmation", () => {
        const parsed = parseBosRelationshipActionPrompt("Add Uncle Mike as authorized pickup for Riley.");
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) return;
        const request = bosProposalToExecutionRequest({
            ...parsed.proposal,
            sourceCustomerId: "cust-1",
            sourceRecordId: "child-1",
        });
        expect(request.actionKey).toBe("add_authorized_pickup");
        expect(request.confirmationRequired).toBe(true);
        expect(proposalToExecutionRequest({
            ...parsed.proposal,
            sourceCustomerId: "cust-1",
            sourceRecordId: "child-1",
        }).confirmationRequired).toBe(true);
    });
});

describe("executeRelationshipAction", () => {
    it("adds emergency contact to one child", async () => {
        const result = await executeRelationshipAction(mockSupabaseForEmergencyContact() as never, {
            actionKey: "add_emergency_contact",
            sourceSurface: "child_drawer",
            sourceRecordId: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA,
            sourceEntityType: "child",
            sourceChildPersonId: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA,
            sourceCustomerId: "cust-fixture",
            anchorCustomerMemberId: SIBLING_SCOPED_CONTACTS_FIXTURE.memberA,
            selectedPersonId: "person-grandma",
            scope: "this_child",
            orgId: "org-1",
        });
        expect(result.ok).toBe(true);
        expect(result.links_written).toBeGreaterThan(0);
        expect(result.role_key).toBe("emergency_contact");
    });


    it("link_existing_person uses PCR for child-scoped emergency contact", async () => {
        const result = await executeRelationshipAction(mockSupabaseForEmergencyContact() as never, {
            actionKey: "link_existing_person",
            sourceSurface: "child_drawer",
            sourceRecordId: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA,
            sourceEntityType: "child",
            sourceChildPersonId: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA,
            sourceCustomerId: "cust-fixture",
            anchorCustomerMemberId: SIBLING_SCOPED_CONTACTS_FIXTURE.memberA,
            selectedPersonId: "person-grandma",
            roleKey: "emergency_contact",
            scope: "this_child",
            orgId: "org-1",
        });
        expect(result.ok).toBe(true);
        expect(result.affected_record_preview.some((row) => row.table === "person_child_relationships")).toBe(true);
        expect(result.affected_record_preview.some((row) => row.table === "customer_member_contacts")).toBe(false);
    });
    it("rejects invalid scope for action", async () => {
        await expect(
            executeRelationshipAction(mockSupabaseForEmergencyContact() as never, {
                actionKey: "add_emergency_contact",
                sourceSurface: "child_drawer",
                sourceRecordId: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA,
                sourceEntityType: "child",
                sourceCustomerId: "cust-fixture",
                anchorCustomerMemberId: SIBLING_SCOPED_CONTACTS_FIXTURE.memberA,
                selectedPersonId: "person-grandma",
                scope: "this_opportunity",
                orgId: "org-1",
            }),
        ).rejects.toThrow(/not allowed/i);
    });

    it("rejects make_primary_contact on unified executor", async () => {
        await expect(
            executeRelationshipAction(mockSupabaseForEmergencyContact() as never, {
                actionKey: "make_primary_contact",
                sourceSurface: "person_drawer",
                sourceRecordId: "person-1",
                sourceEntityType: "person",
                sourceCustomerId: "cust-fixture",
                scope: "household",
                orgId: "org-1",
            }),
        ).rejects.toThrow(/dedicated executor/i);
    });
});

describe("relationship action events", () => {
    it("uses unified relationship.action_executed event type", () => {
        expect(RELATIONSHIP_ACTION_EXECUTED_EVENT_TYPE).toBe("relationship.action_executed");
    });

    it("legacy emergency event type remains documented", () => {
        expect(EMERGENCY_CONTACT_ADDED_EVENT_TYPE).toBe("relationship.emergency_contact_added");
    });
});
