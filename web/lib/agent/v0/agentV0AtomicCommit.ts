/**
 * Single-transaction agent v0 apply via Postgres RPC (see migration agent_v0_atomic_commit_rpc.sql).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type AgentV0AtomicCommitResult =
    | { ok: true; workUnitRow: Record<string, unknown> }
    | {
          ok: false;
          status: 400 | 404 | 409 | 500;
          error: string;
          code: "NOT_FOUND" | "STALE_VERSION" | "RPC_FAILED";
      };

export async function agentV0CommitQueueDefinitionApply(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        userId: string;
        workUnitId: string;
        expectedVersion: number;
        queueDefinition: Record<string, unknown>;
        proposalId: string;
        requestId: string;
        correlationId: string;
        intentJson: unknown;
        resultId: string;
    }
): Promise<AgentV0AtomicCommitResult> {
    const { data, error } = await supabase.rpc("agent_v0_commit_queue_definition_apply", {
        p_org_id: params.orgId,
        p_user_id: params.userId,
        p_work_unit_id: params.workUnitId,
        p_expected_version: params.expectedVersion,
        p_queue_definition: params.queueDefinition,
        p_proposal_id: params.proposalId,
        p_request_id: params.requestId,
        p_correlation_id: params.correlationId,
        p_intent_json: params.intentJson,
        p_result_id: params.resultId,
    });

    if (error) {
        const msg = error.message ?? "";
        if (msg.includes("agent_v0:work_unit_not_found")) {
            return { ok: false, status: 404, error: "Work unit not found", code: "NOT_FOUND" };
        }
        if (msg.includes("agent_v0:stale_queue_definition_version")) {
            return {
                ok: false,
                status: 409,
                error: "queue_definition version mismatch (stale expected_queue_definition_version)",
                code: "STALE_VERSION",
            };
        }
        return { ok: false, status: 500, error: msg, code: "RPC_FAILED" };
    }

    const row = data as Record<string, unknown> | null;
    if (row == null || typeof row !== "object") {
        return { ok: false, status: 500, error: "RPC returned empty payload", code: "RPC_FAILED" };
    }

    return { ok: true, workUnitRow: row };
}
