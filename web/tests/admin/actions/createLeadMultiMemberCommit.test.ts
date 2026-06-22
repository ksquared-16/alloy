import { describe, expect, it, vi, beforeEach } from "vitest";
import { executeCreateLeadAction } from "@/lib/admin/actions/entryLifecycleActions";
import { applyCreateLeadChildParticipation } from "@/lib/admin/actions/createLeadChildOcmPersistence";
import { applyCreateLeadHouseholdMemberCommit } from "@/lib/admin/actions/executeCreateLeadHouseholdCommit";
import { findOrCreatePersonInOrgWithMeta } from "@/lib/persons/findOrCreatePersonInOrg";
import { buildCreateLeadCommitSelection } from "@/lib/intake/commit/createLeadCommitSelection";
import { mapCreateLeadCommitSelectionToExecutePayload } from "@/lib/admin/actions/mapCreateLeadCommitSelectionToPayload";
import {
    __resetExtractFactCounterForTests,
    extractFactsFromText,
} from "@/lib/intake/extract/extractFactsFromText";
import {
    __resetHouseholdCandidateCounterForTests,
    groupFactsIntoHouseholdCandidates,
} from "@/lib/intake/group/groupFactsIntoHouseholdCandidates";

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

vi.mock("@/lib/bookingCustomerPersonLink", () => ({
    ensureCustomerPersonsPrimaryLink: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/lifecycle/lifecycleRuntimeBinding", () => ({
    resolveLifecycleCreateLeadBinding: vi.fn().mockResolvedValue({ work_unit_id: "wu-1", status_key: "open" }),
}));

vi.mock("@/lib/admin/actions/createLeadChildOcmPersistence", () => ({
    applyCreateLeadChildParticipation: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/admin/actions/executeCreateLeadHouseholdCommit", () => ({
    applyCreateLeadHouseholdMemberCommit: vi.fn().mockResolvedValue(undefined),
}));

const MULTI_MEMBER_PASTE = [
    "Sarah & Rudy Emerson 1222344321 sarah@emerson.net",
    "Children: Jet DOB 2/4/2026 and Chet DOB 10/10/2023",
].join("\n");

beforeEach(() => {
    vi.clearAllMocks();
    __resetExtractFactCounterForTests();
    __resetHouseholdCandidateCounterForTests();
});

describe("create lead multi-member commit server path", () => {
    it("calls household member commit when selection payload is present", async () => {
        const household = groupFactsIntoHouseholdCandidates(
            extractFactsFromText({ text: MULTI_MEMBER_PASTE }).facts,
        );
        const selection = buildCreateLeadCommitSelection(household);
        const merged = mapCreateLeadCommitSelectionToExecutePayload({
            values: {
                first_name: "Sarah",
                last_name: "Emerson",
                email: "sarah@emerson.net",
                phone: "1222344321",
                child_first_name: "Jet",
                child_last_name: "Emerson",
                child_date_of_birth: "2026-02-04",
                location_id: "site-1",
            },
            selection,
        });

        const supabase = {
            from: vi.fn((table: string) => {
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
            {
                merged,
                context: { department_id: "dept-1" },
            },
        );

        expect(result.ok).toBe(true);
        expect(findOrCreatePersonInOrgWithMeta).toHaveBeenCalledTimes(1);
        expect(applyCreateLeadChildParticipation).toHaveBeenCalledTimes(1);
        expect(applyCreateLeadHouseholdMemberCommit).toHaveBeenCalledTimes(1);
        expect(applyCreateLeadHouseholdMemberCommit).toHaveBeenCalledWith(
            supabase,
            expect.objectContaining({
                customerId: "customer-1",
                opportunityId: "opp-1",
                primaryPersonId: "parent-person-1",
            }),
        );
    });
});

export const CREATE_LEAD_COMMIT_AUDIT = {
    creates: [
        "persons (primary parent/guardian)",
        "persons (additional approved guardians)",
        "customers (household)",
        "customer_persons (primary + guardian links)",
        "opportunities (lead)",
        "opportunity_persons (primary + secondary guardian links)",
        "persons (included children)",
        "customer_members (child relationship per included child)",
        "opportunity_customer_members (child enrollment row per included child)",
        "workflow_events (status + action_executed)",
    ],
    does_not_create: [
        "excluded household members",
        "addresses",
        "person_relationships rows",
        "contacts table rows on create path",
    ],
} as const;
