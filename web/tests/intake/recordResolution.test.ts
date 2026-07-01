import { describe, expect, it, vi } from "vitest";
import { buildCreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { buildCreateLeadCommitPreview } from "@/lib/admin/actions/buildCreateLeadCommitPreview";
import {
    applyResolutionToCommitSelection,
    commitBlockedByResolution,
    linkedPersonIdFromCommitRecord,
    patchCreateLeadCommitResolution,
} from "@/lib/intake/resolve/applyResolutionToCommitSelection";
import {
    evaluateChildPersonMatch,
    evaluateParentPersonMatch,
    parentContactFromCandidate,
} from "@/lib/intake/resolve/matchIdentity";
import { resolveIntakeRecordResolution } from "@/lib/intake/resolve/resolveIntakeRecordResolution";
import type { IntakeHouseholdCandidate } from "@/lib/intake/types";

function baseHousehold(): IntakeHouseholdCandidate {
    return {
        household_id: "hh-1",
        parents_guardians: [
            {
                candidate_id: "parent-1",
                role: "parent",
                first_name: "Sarah",
                last_name: "Emerson",
                emails: ["sarah@example.com"],
                phones: ["5551234567"],
                dob: null,
                age_years: null,
                calculated_age: null,
                program_interest: null,
                source_fact_ids: [],
                confidence: "high",
                validation_state: "valid",
            },
        ],
        parents: [],
        children: [
            {
                candidate_id: "child-1",
                role: "child",
                first_name: "Mia",
                last_name: "Emerson",
                emails: [],
                phones: [],
                dob: "2020-03-15",
                age_years: null,
                calculated_age: null,
                program_interest: null,
                source_fact_ids: [],
                confidence: "high",
                validation_state: "valid",
            },
        ],
        household_contacts: [],
        address: null,
        location: null,
        source: null,
        notes: null,
        program_interest: null,
        desired_start_date: null,
        relationships: [],
        unassigned_fact_ids: [],
        unmapped_facts: [],
        review_warnings: [],
    };
}

type QueryResult = { data: unknown; error: null };

function chainable(result: QueryResult) {
    const chain: Record<string, unknown> = {};
    const methods = ["select", "eq", "ilike", "in", "limit", "maybeSingle", "single"];
    for (const method of methods) {
        chain[method] = vi.fn(() => chain);
    }
    Object.defineProperty(chain, "then", {
        value: (resolve: (v: QueryResult) => void) => Promise.resolve(result).then(resolve),
        enumerable: false,
    });
    chain.maybeSingle = vi.fn(async () => result);
    chain.single = vi.fn(async () => result);
    return chain;
}

function createMockSupabase(handlers: Record<string, () => QueryResult | unknown>) {
    return {
        from: vi.fn((table: string) => {
            const handler = handlers[table];
            if (!handler) throw new Error(`unexpected table ${table}`);
            return handler();
        }),
    };
}

describe("evaluateParentPersonMatch", () => {
    it("exact email match with agreeing name → exact_match", () => {
        const result = evaluateParentPersonMatch({
            firstName: "Sarah",
            lastName: "Emerson",
            emailNorm: "sarah@example.com",
            phoneNorm: null,
            emailMatches: [
                { id: "person-sarah", first_name: "Sarah", last_name: "Emerson", email: "sarah@example.com" },
            ],
            phoneMatches: [],
            nameMatches: [],
        });
        expect(result.confidence).toBe("exact_match");
        expect(result.personId).toBe("person-sarah");
    });

    it("exact phone match → exact_match", () => {
        const result = evaluateParentPersonMatch({
            firstName: "Sarah",
            lastName: "Emerson",
            emailNorm: null,
            phoneNorm: "5551234567",
            emailMatches: [],
            phoneMatches: [
                { id: "person-sarah", first_name: "Sarah", last_name: "Emerson", phone: "5551234567" },
            ],
            nameMatches: [],
        });
        expect(result.confidence).toBe("exact_match");
        expect(result.personId).toBe("person-sarah");
    });

    it("multiple email matches → conflict", () => {
        const result = evaluateParentPersonMatch({
            firstName: "Sarah",
            lastName: "Emerson",
            emailNorm: "sarah@example.com",
            phoneNorm: null,
            emailMatches: [
                { id: "p1", first_name: "Sarah", last_name: "Emerson" },
                { id: "p2", first_name: "Sarah", last_name: "Emerson" },
            ],
            phoneMatches: [],
            nameMatches: [],
        });
        expect(result.confidence).toBe("conflict");
    });

    it("name-only match → possible_match", () => {
        const result = evaluateParentPersonMatch({
            firstName: "Sarah",
            lastName: "Emerson",
            emailNorm: null,
            phoneNorm: null,
            emailMatches: [],
            phoneMatches: [],
            nameMatches: [{ id: "person-sarah", first_name: "Sarah", last_name: "Emerson" }],
        });
        expect(result.confidence).toBe("possible_match");
    });
});

describe("evaluateChildPersonMatch", () => {
    it("full name + DOB → exact_match", () => {
        const result = evaluateChildPersonMatch({
            firstName: "Mia",
            lastName: "Emerson",
            dob: "2020-03-15",
            householdMembers: [],
            orgPersonMatches: [
                {
                    id: "child-person",
                    first_name: "Mia",
                    last_name: "Emerson",
                    date_of_birth: "2020-03-15",
                },
            ],
        });
        expect(result.confidence).toBe("exact_match");
        expect(result.personId).toBe("child-person");
    });
});

describe("resolveIntakeRecordResolution", () => {
    it("parent exact email → link_existing proposal", async () => {
        const household = baseHousehold();
        const supabase = createMockSupabase({
            persons: () =>
                chainable({
                    data: [
                        {
                            id: "person-sarah",
                            first_name: "Sarah",
                            last_name: "Emerson",
                            email: "sarah@example.com",
                        },
                    ],
                    error: null,
                }),
            customer_persons: () =>
                chainable({
                    data: { customer_id: "cust-1" },
                    error: null,
                }),
            customers: () =>
                chainable({
                    data: { name: "Emerson household" },
                    error: null,
                }),
            opportunities: () =>
                chainable({
                    data: [],
                    error: null,
                }),
            customer_members: () =>
                chainable({
                    data: [],
                    error: null,
                }),
        });

        const result = await resolveIntakeRecordResolution(supabase as never, {
            orgId: "org-1",
            source_kind: "create_lead",
            household,
        });

        const parentProposal = result.proposals.find((p) => p.intake_candidate_id === "parent-1");
        expect(parentProposal?.confidence).toBe("exact_match");
        expect(parentProposal?.action).toBe("link_existing");
    });

    it("no match → create_new proposal", async () => {
        const household = baseHousehold();
        household.parents_guardians[0] = {
            ...household.parents_guardians[0]!,
            emails: ["newperson@example.com"],
            phones: [],
        };
        household.children = [];

        const emptyPersons = () =>
            chainable({
                data: [],
                error: null,
            });

        const supabase = createMockSupabase({
            persons: emptyPersons,
            opportunities: emptyPersons,
        });

        const result = await resolveIntakeRecordResolution(supabase as never, {
            orgId: "org-1",
            source_kind: "api_payload",
            household,
        });

        const parentProposal = result.proposals.find((p) => p.intake_candidate_id === "parent-1");
        expect(parentProposal?.confidence).toBe("no_match");
        expect(parentProposal?.action).toBe("create_new");
        expect(result.summary.create_new_count).toBeGreaterThan(0);
    });

    it("open opportunity at location → lead review_required", async () => {
        const household = baseHousehold();
        household.location = {
            label: "Downtown",
            resolved_value: "loc-1",
            resolved_label: "Downtown",
            source_fact_ids: [],
            confidence: "high",
            validation_state: "valid",
        };

        let personsCall = 0;
        const supabase = createMockSupabase({
            persons: () => {
                personsCall += 1;
                if (personsCall === 1) {
                    return chainable({
                        data: [
                            {
                                id: "person-sarah",
                                first_name: "Sarah",
                                last_name: "Emerson",
                                email: "sarah@example.com",
                            },
                        ],
                        error: null,
                    });
                }
                return chainable({ data: [], error: null });
            },
            customer_persons: () =>
                chainable({
                    data: { customer_id: "cust-1" },
                    error: null,
                }),
            customers: () =>
                chainable({
                    data: { name: "Emerson household" },
                    error: null,
                }),
            opportunities: () =>
                chainable({
                    data: [{ id: "opp-open" }],
                    error: null,
                }),
            opportunity_customer_members: () =>
                chainable({
                    data: [],
                    error: null,
                }),
            customer_members: () =>
                chainable({
                    data: [],
                    error: null,
                }),
        });

        const result = await resolveIntakeRecordResolution(supabase as never, {
            orgId: "org-1",
            source_kind: "create_lead",
            household,
            location_id: "loc-1",
        });

        const leadProposal = result.proposals.find((p) => p.intake_candidate_id === "hh-1:lead");
        expect(leadProposal?.action).toBe("review_required");
        expect(leadProposal?.confidence).toBe("probable_match");
    });
});

describe("applyResolutionToCommitSelection", () => {
    it("maps exact parent match to linked commit overlay", async () => {
        const household = baseHousehold();
        const selection = buildCreateLeadCommitSelection(household);

        const supabase = createMockSupabase({
            persons: () =>
                chainable({
                    data: [
                        {
                            id: "person-sarah",
                            first_name: "Sarah",
                            last_name: "Emerson",
                            email: "sarah@example.com",
                        },
                    ],
                    error: null,
                }),
            customer_persons: () =>
                chainable({
                    data: { customer_id: "cust-1" },
                    error: null,
                }),
            customers: () =>
                chainable({
                    data: { name: "Emerson household" },
                    error: null,
                }),
            opportunities: () => chainable({ data: [], error: null }),
            customer_members: () => chainable({ data: [], error: null }),
        });

        const result = await resolveIntakeRecordResolution(supabase as never, {
            orgId: "org-1",
            source_kind: "create_lead",
            household,
        });

        const merged = applyResolutionToCommitSelection(selection, result, household.household_id);
        const parent = merged.parents[0];
        expect(parent?.resolution?.state).toBe("linked");
        expect(parent?.resolution?.action).toBe("link_existing");
        expect(linkedPersonIdFromCommitRecord(parent)).toBe("person-sarah");
    });

    it("commit preview reflects link vs create states", async () => {
        const household = baseHousehold();
        let selection = buildCreateLeadCommitSelection(household);

        const supabase = createMockSupabase({
            persons: () =>
                chainable({
                    data: [
                        {
                            id: "person-sarah",
                            first_name: "Sarah",
                            last_name: "Emerson",
                            email: "sarah@example.com",
                        },
                    ],
                    error: null,
                }),
            customer_persons: () =>
                chainable({
                    data: { customer_id: "cust-1" },
                    error: null,
                }),
            customers: () =>
                chainable({
                    data: { name: "Emerson household" },
                    error: null,
                }),
            opportunities: () => chainable({ data: [], error: null }),
            customer_members: () => chainable({ data: [], error: null }),
        });

        const result = await resolveIntakeRecordResolution(supabase as never, {
            orgId: "org-1",
            source_kind: "create_lead",
            household,
        });
        selection = applyResolutionToCommitSelection(selection, result, household.household_id);

        const preview = buildCreateLeadCommitPreview({
            values: {},
            household,
            selection,
        });

        expect(preview.will_create.some((item) => item.label.includes("Link existing"))).toBe(true);
        expect(preview.will_create.some((item) => item.label.includes("household"))).toBe(true);
    });

    it("operator link_existing selection clears review_required blockers", async () => {
        const household = baseHousehold();
        household.parents_guardians[0] = {
            ...household.parents_guardians[0]!,
            emails: [],
            phones: [],
        };

        let selection = buildCreateLeadCommitSelection(household);
        selection.parents[0] = {
            ...selection.parents[0]!,
            resolution: {
                state: "possible_match",
                action: "review_required",
                confidence: "possible_match",
                linked_entity_id: "person-name-only",
                linked_entity_type: "person",
                match_display_name: "Sarah Emerson",
                candidate_match_id: "match:person:person-name-only",
                reasons: ["Full name match only"],
            },
        };

        const blockedBefore = commitBlockedByResolution(selection);
        expect(blockedBefore.length).toBeGreaterThan(0);

        selection = patchCreateLeadCommitResolution(selection, "parent-1", {
            action: "link_existing",
            selected_match_id: "match:person:person-name-only",
        });

        expect(linkedPersonIdFromCommitRecord(selection.parents[0])).toBe("person-name-only");
        expect(commitBlockedByResolution(selection)).toHaveLength(0);
    });
});

describe("parentContactFromCandidate", () => {
    it("normalizes email and phone from intake candidate", () => {
        const contact = parentContactFromCandidate({
            emails: ["Sarah@Example.com"],
            phones: ["(555) 123-4567"],
            first_name: "Sarah",
            last_name: "Emerson",
        });
        expect(contact.emailNorm).toBe("sarah@example.com");
        expect(contact.phoneNorm).toBe("5551234567");
    });
});
