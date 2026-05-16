import { describe, expect, it, vi } from "vitest";

import { executeWorkflowAssistApply } from "@/lib/agent/workflowAssist/workflowAssistApplyFromSuggestion";
import { buildWorkflowAssistSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";
import { buildTourReminderActionScaffolds } from "@/lib/workflows/workflowScopeMetadata";

const orgId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const deptId = "33333333-3333-4333-8333-333333333333";

function mockSupabase(insertWorkflow: Record<string, unknown>, insertActionsError: string | null = null) {
    const workflowInsert = vi.fn().mockResolvedValue({ data: insertWorkflow, error: null });
    const actionsInsert = vi.fn().mockResolvedValue({ error: insertActionsError });
    return {
        from: (table: string) => {
            if (table === "workflows") {
                return { insert: () => ({ select: () => ({ single: workflowInsert }) }) };
            }
            if (table === "workflow_actions") {
                return { insert: actionsInsert };
            }
            if (table === "workflows" && "select" in {}) {
                return {};
            }
            return {
                select: () => ({
                    eq: () => ({
                        eq: () => ({ maybeSingle: async () => ({ data: { id: "x" } }) }),
                    }),
                }),
                update: () => ({
                    eq: () => ({
                        eq: () => ({ select: () => ({ single: async () => ({ data: {}, error: null }) }) }),
                    }),
                }),
            };
        },
    } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

describe("executeWorkflowAssistApply create_workflow", () => {
    it("inserts disabled workflow with metadata.scope and action scaffolds", async () => {
        const deptId = "33333333-3333-4333-8333-333333333333";
        const scaffolds = buildTourReminderActionScaffolds(3);
        const parsed = {
            version: 1 as const,
            proposal_kind: "create_workflow" as const,
            draft: {
                name: "Tour Reminder Draft",
                description: "test",
                event_type: "opportunity_schedule_tour_followup",
                entity_type: "opportunity",
                enabled: false,
                metadata: { scope: { department_id: deptId } },
                draft_action_scaffolds: scaffolds,
            },
        };
        const proposal = buildWorkflowAssistSuggestionV1({
            orgId,
            actorUserId: userId,
            parsed,
            scope_labels: { department_name: "Enrollment" },
        });

        let capturedInsert: Record<string, unknown> = {};
        const supabase = {
            from: (table: string) => {
                if (table === "workflows") {
                    return {
                        insert: (rows: Record<string, unknown>[]) => {
                            capturedInsert = (rows[0] ?? {}) as Record<string, unknown>;
                            return {
                                select: () => ({
                                    single: async () => ({
                                        data: { id: "wf-new", ...rows[0] },
                                        error: null,
                                    }),
                                }),
                            };
                        },
                    };
                }
                if (table === "workflow_actions") {
                    return {
                        insert: vi.fn().mockResolvedValue({ error: null }),
                    };
                }
                return {};
            },
        } as unknown as import("@supabase/supabase-js").SupabaseClient;

        const result = await executeWorkflowAssistApply({
            supabase,
            ctx: { ok: true, orgId, userId, role: "admin" } as import("@/lib/admin/getAdminContext").AdminContextSuccess,
            proposal,
        });

        expect(result.ok).toBe(true);
        expect(capturedInsert?.enabled).toBe(false);
        expect((capturedInsert?.metadata as { scope?: { department_id?: string } })?.scope?.department_id).toBe(deptId);
    });
});
