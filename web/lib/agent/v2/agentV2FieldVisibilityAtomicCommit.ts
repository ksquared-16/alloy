/**
 * Single-transaction field visibility apply via Postgres RPC (see migration agent_v2_field_visibility).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FieldVisibilityFlagsV0 } from "@/lib/agent/v2/fieldVisibilityConfigV0";

export type AgentV2FieldVisibilityAtomicResult =
    | { ok: true; fieldRow: Record<string, unknown> }
    | {
          ok: false;
          status: 400 | 404 | 409 | 500;
          error: string;
          code: "NOT_FOUND" | "STALE_VERSION" | "RPC_FAILED";
      };

export async function agentV2CommitFieldVisibilityApply(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        userId: string;
        fieldDefinitionId: string;
        expectedUpdatedAt: string;
        mergedVisibility: FieldVisibilityFlagsV0;
        proposalId: string;
        requestId: string;
        correlationId: string;
        intentJson: unknown;
        resultId: string;
    }
): Promise<AgentV2FieldVisibilityAtomicResult> {
    const vis = params.mergedVisibility;
    const { data, error } = await supabase.rpc("agent_v2_commit_field_visibility_apply", {
        p_org_id: params.orgId,
        p_user_id: params.userId,
        p_field_definition_id: params.fieldDefinitionId,
        p_expected_updated_at: params.expectedUpdatedAt,
        p_is_visible_in_form: vis.is_visible_in_form,
        p_is_visible_in_drawer: vis.is_visible_in_drawer,
        p_is_visible_in_table: vis.is_visible_in_table,
        p_is_visible_in_public_booking: vis.is_visible_in_public_booking,
        p_proposal_id: params.proposalId,
        p_request_id: params.requestId,
        p_correlation_id: params.correlationId,
        p_intent_json: params.intentJson,
        p_result_id: params.resultId,
    });

    if (error) {
        const msg = error.message ?? "";
        if (msg.includes("agent_v2:field_definition_not_found")) {
            return { ok: false, status: 404, error: "Field definition not found", code: "NOT_FOUND" };
        }
        if (msg.includes("agent_v2:stale_field_definition")) {
            return {
                ok: false,
                status: 409,
                error: "field_definitions row was modified (stale expected_updated_at)",
                code: "STALE_VERSION",
            };
        }
        return { ok: false, status: 500, error: msg, code: "RPC_FAILED" };
    }

    const row = data as Record<string, unknown> | null;
    if (row == null || typeof row !== "object") {
        return { ok: false, status: 500, error: "RPC returned empty payload", code: "RPC_FAILED" };
    }

    return { ok: true, fieldRow: row };
}
