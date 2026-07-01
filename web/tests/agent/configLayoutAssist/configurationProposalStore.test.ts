import { describe, expect, it, vi } from "vitest";

import { normalizeConfigurationProposal } from "@/lib/agent/configLayoutAssist/configurationProposalNormalize";
import {
    CONFIGURATION_PROPOSAL_VERSION,
    type ConfigurationProposalV1,
} from "@/lib/agent/configLayoutAssist/configurationProposalV1";
import {
    createConfigurationProposalRecord,
    getConfigurationProposalRecord,
    listConfigurationProposalRecords,
    transitionConfigurationProposalState,
} from "@/lib/agent/configLayoutAssist/configurationProposalStore";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const proposalId = "55555555-5555-4555-8555-555555555555";

function validProposal(overrides: Partial<ConfigurationProposalV1> = {}): ConfigurationProposalV1 {
    return normalizeConfigurationProposal({
        version: CONFIGURATION_PROPOSAL_VERSION,
        id: "client-id-ignored-on-create",
        category: "layout",
        intent: "expose_field",
        summary: "Expose notes",
        rationale: ["operator request"],
        impacted_entities: ["opportunity"],
        risk_level: "low",
        requires_approval: true,
        permission_requirements: [],
        proposed_operations: [
            {
                operation_id: "op-1",
                kind: "expose_field_on_layout",
                entity_type: "opportunity",
                field_key: "notes",
                layout_key: "default",
                before: { is_visible_in_drawer: false },
                after: { is_visible_in_drawer: true },
                rationale: ["show in drawer"],
                required_permissions: [],
            },
        ],
        apply_mode: "single_operation",
        generated_by: "deterministic",
        created_at: "2026-05-16T12:00:00.000Z",
        ...overrides,
    });
}

function rowDraft(proposalJson: ConfigurationProposalV1): Record<string, unknown> {
    return {
        id: proposalId,
        org_id: orgId,
        proposal_version: 1,
        proposal_json: proposalJson,
        proposal_hash: "abc123",
        state: "draft",
        category: proposalJson.category,
        summary: proposalJson.summary,
        risk_level: proposalJson.risk_level,
        apply_mode: proposalJson.apply_mode,
        permission_requirements: proposalJson.permission_requirements,
        created_by: userId,
        reviewed_by: null,
        approved_by: null,
        applied_by: null,
        rejected_by: null,
        failed_reason: null,
        rejection_reason: null,
        created_at: "2026-05-16T12:00:00.000Z",
        updated_at: "2026-05-16T12:00:00.000Z",
        reviewed_at: null,
        approved_at: null,
        applied_at: null,
        rejected_at: null,
        failed_at: null,
        rolled_back_at: null,
    };
}

describe("configurationProposalStore", () => {
    it("rejects invalid proposal on create", async () => {
        const bad = validProposal();
        bad.proposed_operations[0]!.kind = "not_a_kind" as "create_field";
        const supabase = {} as never;
        const r = await createConfigurationProposalRecord({
            supabase,
            orgId,
            userId,
            proposal: bad,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("PROPOSAL_VALIDATION_FAILED");
    });

    it("create stores normalized proposal in draft", async () => {
        const proposal = validProposal();
        const insertSpy = vi.fn().mockReturnValue({
            select: () => ({
                single: async () => ({
                    data: rowDraft({ ...proposal, id: proposalId }),
                    error: null,
                }),
            }),
        });
        const supabase = { from: () => ({ insert: insertSpy }) } as never;

        const r = await createConfigurationProposalRecord({ supabase, orgId, userId, proposal });
        expect(r.ok).toBe(true);
        expect(insertSpy).toHaveBeenCalled();
        const payload = insertSpy.mock.calls[0]![0] as Record<string, unknown>;
        expect(payload.state).toBe("draft");
        expect(payload.org_id).toBe(orgId);
    });

    it("transition rejects without rejection reason", async () => {
        const proposal = validProposal();
        const supabase = {
            from() {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({ data: rowDraft(proposal), error: null }),
                            }),
                        }),
                    }),
                    update: vi.fn(),
                };
            },
        } as never;

        const r = await transitionConfigurationProposalState({
            supabase,
            orgId,
            userId,
            proposalId,
            input: { to_state: "rejected" },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("REJECTION_REASON_REQUIRED");
    });

    it("transition draft → reviewed updates state without mutating proposal_json", async () => {
        const proposal = validProposal();
        const updateSpy = vi.fn().mockReturnValue({
            eq: () => ({
                eq: () => ({
                    select: () => ({
                        single: async () => ({
                            data: { ...rowDraft(proposal), state: "reviewed", reviewed_by: userId },
                            error: null,
                        }),
                    }),
                }),
            }),
        });
        const supabase = {
            from() {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({ data: rowDraft(proposal), error: null }),
                            }),
                        }),
                    }),
                    update: updateSpy,
                };
            },
        } as never;

        const r = await transitionConfigurationProposalState({
            supabase,
            orgId,
            userId,
            proposalId,
            input: { to_state: "reviewed" },
        });
        expect(r.ok).toBe(true);
        expect(updateSpy).toHaveBeenCalled();
        const patch = updateSpy.mock.calls[0]![0] as Record<string, unknown>;
        expect(patch.state).toBe("reviewed");
        expect(patch).not.toHaveProperty("proposal_json");
    });

    it("rejects invalid transition draft → applied", async () => {
        const proposal = validProposal();
        const supabase = {
            from() {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({ data: rowDraft(proposal), error: null }),
                            }),
                        }),
                    }),
                };
            },
        } as never;

        const r = await transitionConfigurationProposalState({
            supabase,
            orgId,
            userId,
            proposalId,
            input: { to_state: "applied" },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("TRANSITION_NOT_ALLOWED");
    });

    it("list rejects invalid state filter", async () => {
        const supabase = {} as never;
        const r = await listConfigurationProposalRecords({
            supabase,
            orgId,
            filters: { state: "not_a_state" },
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("INVALID_STATE_FILTER");
    });

    it("get by id returns record", async () => {
        const proposal = validProposal();
        const supabase = {
            from: () => ({
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({ data: rowDraft(proposal), error: null }),
                        }),
                    }),
                }),
            }),
        } as never;

        const r = await getConfigurationProposalRecord({ supabase, orgId, proposalId });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.record.proposal_json.summary).toBe("Expose notes");
    });
});
