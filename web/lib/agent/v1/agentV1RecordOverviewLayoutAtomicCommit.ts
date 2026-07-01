/**
 * Single-transaction agent v1 apply via Postgres RPC (see migration agent_v1_record_overview_layout).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type AgentV1RecordOverviewLayoutAtomicResult =
    | { ok: true; layoutRow: Record<string, unknown> }
    | {
          ok: false;
          status: 400 | 404 | 409 | 500;
          error: string;
          code: "NOT_FOUND" | "STALE_VERSION" | "RPC_FAILED";
      };

export async function agentV1CommitRecordOverviewLayoutApply(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        userId: string;
        entityTypeDb: string;
        surface: string;
        expectedVersion: number;
        config: Record<string, unknown>;
        proposalId: string;
        requestId: string;
        correlationId: string;
        intentJson: unknown;
        resultId: string;
    }
): Promise<AgentV1RecordOverviewLayoutAtomicResult> {
    const { data, error } = await supabase.rpc("agent_v1_commit_record_overview_layout_apply", {
        p_org_id: params.orgId,
        p_user_id: params.userId,
        p_entity_type: params.entityTypeDb,
        p_surface: params.surface,
        p_expected_version: params.expectedVersion,
        p_config: params.config,
        p_proposal_id: params.proposalId,
        p_request_id: params.requestId,
        p_correlation_id: params.correlationId,
        p_intent_json: params.intentJson,
        p_result_id: params.resultId,
    });

    if (error) {
        const msg = error.message ?? "";
        if (msg.includes("agent_v1:no_record_overview_layout_row")) {
            return { ok: false, status: 404, error: "Record overview layout row not found", code: "NOT_FOUND" };
        }
        if (msg.includes("agent_v1:stale_record_overview_layout_version")) {
            return {
                ok: false,
                status: 409,
                error: "record_overview_layout config version mismatch (stale expected_config_version)",
                code: "STALE_VERSION",
            };
        }
        return { ok: false, status: 500, error: msg, code: "RPC_FAILED" };
    }

    const row = data as Record<string, unknown> | null;
    if (row == null || typeof row !== "object") {
        return { ok: false, status: 500, error: "RPC returned empty payload", code: "RPC_FAILED" };
    }

    return { ok: true, layoutRow: row };
}
