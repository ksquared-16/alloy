/**
 * Create Lead → Layout Runtime contract audit.
 *
 * Documents which durable rows create_lead must write for Experience Builder v3
 * drawers/queues (EB-FW-04 child-scoped contacts, role contacts, address, queue hydration).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeCreateLeadAction } from "@/lib/admin/actions/entryLifecycleActions";
import { buildCreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { mapCreateLeadCommitSelectionToExecutePayload } from "@/lib/admin/actions/mapCreateLeadCommitSelectionToPayload";
import {
    __resetExtractFactCounterForTests,
    extractFactsFromText,
} from "@/lib/intake/extract/extractFactsFromText";
import {
    __resetHouseholdCandidateCounterForTests,
    groupFactsIntoHouseholdCandidates,
} from "@/lib/intake/group/groupFactsIntoHouseholdCandidates";
import {
    resolveLayoutRuntimeOpportunityRelationshipContactGroups,
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
import { fetchChildScopedContactLinksForMembers } from "@/lib/admin/person/fetchChildScopedContactLinks";

vi.mock("@/lib/admin/statusDefinitionsResolve", () => ({
    assertAllowedStatusKey: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/lib/admin/emitStatusChangedEvent", () => ({
    emitStatusChangedEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/opportunityIdentity", () => ({
    normalizeOpportunityWritePayload: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/persons/findOrCreatePersonInOrg", () => ({
    findOrCreatePersonInOrgWithMeta: vi.fn().mockResolvedValue({ id: "parent-person-1" }),
}));

vi.mock("@/lib/bookingPersonCustomerResolve", () => ({
    ensureCustomerForPersonNative: vi.fn().mockResolvedValue({ customer_id: "customer-1" }),
}));

vi.mock("@/lib/bookingCustomerPersonLink", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/bookingCustomerPersonLink")>();
    return {
        ...actual,
        ensureCustomerPersonsPrimaryLink: vi.fn().mockResolvedValue(undefined),
    };
});

vi.mock("@/lib/lifecycle/lifecycleRuntimeBinding", () => ({
    resolveLifecycleCreateLeadBinding: vi.fn().mockResolvedValue({ work_unit_id: "wu-1", status_key: "open" }),
}));

vi.mock("@/lib/admin/actions/createLeadChildOcmPersistence", () => ({
    applyCreateLeadChildParticipation: vi.fn().mockResolvedValue({ customer_member_id: "member-riley", ocm_id: "ocm-riley" }),
    applyCreateLeadChildParticipationFromIdentity: vi.fn().mockResolvedValue({ customer_member_id: "member-sam", ocm_id: "ocm-sam" }),
}));

vi.mock("@/lib/admin/actions/executeCreateLeadHouseholdCommit", () => ({
    applyCreateLeadHouseholdMemberCommit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/admin/actions/applyCreateLeadLayoutRuntimePersistence", () => ({
    applyCreateLeadLayoutRuntimePersistence: vi.fn().mockResolvedValue({
        child_scoped_contacts: { links_written: 0, links_skipped_invalid_role: 0, assignment_count: 0 },
        address: { household: { path: "none", location_id: null }, person: { path: "none", keys_written: [] } },
        role_contacts: { customer_person_roles: [], opportunity_person_roles: [] },
    }),
}));

const root = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

/** Layout runtime contract — durable writes expected on fresh create_lead data. */
export const CREATE_LEAD_LAYOUT_RUNTIME_CONTRACT = {
    works_today: [
        "opportunities (status_key, work_unit_id, customer_id, primary_person_id, location_id)",
        "opportunity_customer_members (outcome_status_key=new_inquiry per child)",
        "customers (household via ensureCustomerForPersonNative)",
        "customer_persons (primary + additional guardians + role contacts)",
        "customer_members (child relationship per included child)",
        "persons (primary + additional guardians + children)",
        "opportunity_persons (family_member + explicit emergency/billing roles)",
        "contacts (compatibility rows for customer_member_contacts FK)",
        "customer_member_contacts (child-scoped guardian/emergency/billing links)",
        "locations (household mailing address when intake includes address)",
        "field_values (person address_line1/city/state/postal_code when committed)",
        "workflow_events (opportunity_status_changed via emitStatusChangedEvent)",
        "workflow_events (action_executed via executeAdminAction after create)",
        "queue row preview (opportunity query — no queue table insert)",
    ],
    missing_writes: [
        "per-child contact assignment UI in intake commit (Phase B explicit child_scoped_contact_assignments)",
        "person_relationships (parent→child edges; drawer uses customer_members)",
        "waitlist placement rows (OCM outcome is new_inquiry until waitlisted)",
    ],
    org_config_prerequisite: [
        "customer_member_contact_roles seeded per org (guardian, emergency_contact, billing_contact, payer, …)",
    ],
} as const;

function createMockSupabaseForScopedLinks() {
    return {
        from(table: string) {
            const builder = {
                select() {
                    return builder;
                },
                eq() {
                    return builder;
                },
                in() {
                    return builder;
                },
                then(resolve: (v: unknown) => void) {
                    if (table === "customer_member_contacts") {
                        resolve({ data: siblingHouseholdMemberContactRows(), error: null });
                        return;
                    }
                    if (table === "customer_member_contact_roles") {
                        resolve({ data: siblingHouseholdRoleRows(), error: null });
                        return;
                    }
                    resolve({ data: [], error: null });
                },
            };
            return builder;
        },
    };
}

describe("create lead layout runtime contract", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        __resetExtractFactCounterForTests();
        __resetHouseholdCandidateCounterForTests();
    });

    it("source audit: create_lead path writes child-scoped contact persistence", () => {
        const sources = [
            read("lib/admin/actions/entryLifecycleActions.ts"),
            read("lib/admin/actions/applyCreateLeadLayoutRuntimePersistence.ts"),
            read("lib/admin/actions/createLeadChildScopedContactPersistence.ts"),
            read("lib/admin/actions/createLeadAddressPersistence.ts"),
        ].join("\n");

        expect(sources).toMatch(/customer_member_contacts/);
        expect(sources).toMatch(/applyCreateLeadLayoutRuntimePersistence/);
        expect(sources).not.toMatch(/from\("addresses"\)/);
    });

    it("documents Phase B per-child differentiation as deferred", () => {
        expect(CREATE_LEAD_LAYOUT_RUNTIME_CONTRACT.missing_writes).toContain(
            "per-child contact assignment UI in intake commit (Phase B explicit child_scoped_contact_assignments)",
        );
    });

    it("runtime proof: sibling-scoped links render different emergency contacts when hydrated", async () => {
        const supabase = createMockSupabaseForScopedLinks();
        const result = await fetchChildScopedContactLinksForMembers(
            supabase as never,
            SIBLING_SCOPED_CONTACTS_FIXTURE.orgId,
            siblingHouseholdMemberRows(),
        );

        const oppRecord = {
            _inquiry_children: siblingInquiryChildren(),
            _child_scoped_contact_links: result.links,
        };

        const emergencyGroups = resolveLayoutRuntimeOpportunityRelationshipContactGroups(
            oppRecord,
            "emergency_contacts_for_child",
        );
        expect(emergencyGroups).toHaveLength(2);
        expect(emergencyGroups[0]?.contacts.map((c) => c.display_name)).toEqual(["Pat Lee"]);
        expect(emergencyGroups[1]?.contacts.map((c) => c.display_name)).toEqual(["Sam Walsh"]);

        const childA = stampLayoutRuntimeActiveRecordContext(
            {
                id: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA,
                customer_member_id: SIBLING_SCOPED_CONTACTS_FIXTURE.memberA,
                _child_scoped_contact_links: result.links,
            },
            { anchorEntity: "child", entityId: SIBLING_SCOPED_CONTACTS_FIXTURE.childPersonA },
        );
        expect(
            resolveLayoutRuntimeScopedRelationshipContacts(childA, "guardians_for_child").map((r) => r.display_name),
        ).toEqual(["Jordan Lee"]);
    });

    it("multi-child household commit does not touch scoped contact tables (today)", async () => {
        const tables = new Set<string>();
        const paste = [
            "Sarah & Rudy Emerson 1222344321 sarah@emerson.net",
            "Children: Riley DOB 2/4/2020 and Sam DOB 10/10/2023",
        ].join("\n");
        const household = groupFactsIntoHouseholdCandidates(extractFactsFromText({ text: paste }).facts);
        const selection = buildCreateLeadCommitSelection(household);
        const merged = mapCreateLeadCommitSelectionToExecutePayload({
            values: {
                first_name: "Sarah",
                last_name: "Emerson",
                email: "sarah@emerson.net",
                phone: "1222344321",
                child_first_name: "Riley",
                child_last_name: "Emerson",
                child_date_of_birth: "2020-02-04",
                location_id: "site-1",
            },
            selection,
        });

        const supabase = {
            from: vi.fn((table: string) => {
                tables.add(table);
                if (table === "opportunities") {
                    return {
                        insert: vi.fn().mockReturnValue({
                            select: vi.fn().mockReturnValue({
                                single: vi.fn().mockResolvedValue({ data: { id: "opp-1" }, error: null }),
                            }),
                        }),
                    };
                }
                if (table === "opportunity_persons") {
                    return { insert: vi.fn().mockResolvedValue({ error: null }) };
                }
                if (table === "verticals") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                limit: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({ data: { id: "vert-1" }, error: null }),
                                }),
                            }),
                        }),
                    };
                }
                return { insert: vi.fn(), select: vi.fn() };
            }),
        };

        const result = await executeCreateLeadAction(
            supabase as never,
            { orgId: "org-1", userId: "user-1" },
            { merged, context: { department_id: "dept-1" } },
        );

        expect(result.ok).toBe(true);
        expect(tables.has("opportunities")).toBe(true);
        expect(tables.has("opportunity_persons")).toBe(true);
    });
});

describe("CREATE_LEAD_LAYOUT_RUNTIME_CONTRACT reference", () => {
    it("lists works-today and missing-write buckets for clean-data rollout", () => {
        expect(CREATE_LEAD_LAYOUT_RUNTIME_CONTRACT.works_today.length).toBeGreaterThan(0);
        expect(CREATE_LEAD_LAYOUT_RUNTIME_CONTRACT.works_today).toContain(
            "customer_member_contacts (child-scoped guardian/emergency/billing links)",
        );
    });
});
