import { describe, expect, it, vi } from "vitest";

import type { TaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/types";
import { TASK_ASSIST_AGENT_KEY } from "@/lib/agent/taskAssist/types";
import {
    approveTaskAssistProposal,
    createTaskAssistProposal,
    markTaskAssistProposalApplied,
    rejectTaskAssistProposal,
} from "@/lib/agent/taskAssist/taskAssistProposalPersistence";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const oppId = "33333333-3333-4333-8333-333333333333";
const personId = "44444444-4444-4444-8444-444444444444";
const proposalId = "55555555-5555-4555-8555-555555555555";

function baseSuggestion(overrides: Partial<TaskAssistSuggestionV1> = {}): TaskAssistSuggestionV1 {
    return {
        version: 1,
        agent_key: TASK_ASSIST_AGENT_KEY,
        suggestion_id: "a".repeat(48),
        generated_at_iso: "2026-05-14T12:00:00.000Z",
        org_id: orgId,
        actor_user_id: userId,
        source_surface: "opportunity_drawer",
        task_type: "draft_sms",
        entity_type: "opportunities",
        entity_id: oppId,
        context_summary: "ctx",
        recipient_candidates: [{ person_id: personId, display_label: "P", has_sms: true, has_email: true }],
        selected_recipient: null,
        channel: "sms",
        draft_subject: null,
        draft_body: "hello",
        scheduled_for_iso: null,
        reminder_due_at_iso: null,
        assumptions: [],
        missing_inputs: [],
        warnings: [],
        validation_errors: [],
        confidence: { mode: "deterministic" },
        approval_required: true,
        apply_intent: { kind: "none" },
        ...overrides,
    };
}

function rowDraft(): Record<string, unknown> {
    return {
        id: proposalId,
        org_id: orgId,
        actor_user_id: userId,
        created_by: userId,
        agent_key: "task_assist",
        proposal_type: "draft_sms",
        entity_type: "opportunities",
        entity_id: oppId,
        status: "draft",
        payload: baseSuggestion(),
        validation_errors: [],
        warnings: [],
        expires_at: null,
        approved_at: null,
        approved_by: null,
        rejected_at: null,
        rejected_by: null,
        applied_at: null,
        applied_by: null,
        applied_result: {},
        created_at: "2026-05-14T12:00:00.000Z",
        updated_at: "2026-05-14T12:00:00.000Z",
    };
}

describe("taskAssistProposalPersistence", () => {
    it("createTaskAssistProposal rejects non-draft_sms / draft_email task_type", async () => {
        const supabase = {} as never;
        const r = await createTaskAssistProposal({
            supabase,
            orgId,
            userId,
            suggestion: baseSuggestion({ task_type: "draft_in_app" }),
            expiresAt: null,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("PROPOSAL_TYPE_UNSUPPORTED");
    });

    it("approve rejects expired draft", async () => {
        const past = new Date(Date.now() - 60_000).toISOString();
        const supabase = {
            from() {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({
                                    data: { ...rowDraft(), expires_at: past },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            },
        } as never;

        const r = await approveTaskAssistProposal({ supabase, orgId, userId, proposalId });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("PROPOSAL_EXPIRED");
    });

    it("approve updates draft → approved", async () => {
        const upd = vi.fn().mockReturnValue({
            eq: () => ({
                eq: () => ({
                    eq: () => ({
                        select: () => ({
                            maybeSingle: async () => ({
                                data: { ...rowDraft(), status: "approved", approved_at: "2026-05-14T12:01:00.000Z", approved_by: userId },
                                error: null,
                            }),
                        }),
                    }),
                }),
            }),
        });
        const supabase = {
            from(table: string) {
                if (table !== "task_assist_proposals") throw new Error(table);
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({ data: rowDraft(), error: null }),
                            }),
                        }),
                    }),
                    update: upd,
                };
            },
        } as never;

        const r = await approveTaskAssistProposal({ supabase, orgId, userId, proposalId });
        expect(r.ok).toBe(true);
        expect(upd).toHaveBeenCalled();
    });

    it("reject refuses non-draft", async () => {
        const supabase = {
            from() {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({
                                    data: { ...rowDraft(), status: "approved" },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            },
        } as never;

        const r = await rejectTaskAssistProposal({ supabase, orgId, userId, proposalId });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("INVALID_STATUS");
    });

    it("markTaskAssistProposalApplied requires approved", async () => {
        const supabase = {
            from() {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({
                                    data: { ...rowDraft(), status: "draft" },
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            },
        } as never;

        const r = await markTaskAssistProposalApplied({ supabase, orgId, proposalId, appliedBy: userId });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.error).toBe("INVALID_STATUS");
    });
});
