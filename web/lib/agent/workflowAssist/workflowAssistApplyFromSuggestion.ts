import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminContextSuccess } from "@/lib/admin/getAdminContext";
import { logAdminAudit } from "@/lib/adminAuth";
import type { WorkflowAssistSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";
import { verifyWorkflowAssistSuggestionId } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";

export type WorkflowAssistApplyExecResult =
    | { ok: true; workflow_id: string; workflow: Record<string, unknown> }
    | { ok: false; error: string; message: string; status: number };

const ALLOWED_PATCH = ["name", "description", "event_type", "entity_type", "enabled"] as const;

/**
 * Applies a validated {@link WorkflowAssistSuggestionV1} using the same field rules as
 * `web/app/api/admin/workflows/**` routes (no bypass).
 */
export async function executeWorkflowAssistApply(params: {
    supabase: SupabaseClient;
    ctx: AdminContextSuccess;
    proposal: WorkflowAssistSuggestionV1;
}): Promise<WorkflowAssistApplyExecResult> {
    const { supabase, ctx, proposal } = params;
    if (proposal.org_id !== ctx.orgId) {
        return { ok: false, error: "ORG_MISMATCH", message: "Proposal org does not match session.", status: 403 };
    }
    if (proposal.actor_user_id !== ctx.userId) {
        return { ok: false, error: "ACTOR_MISMATCH", message: "Proposal actor does not match session user.", status: 403 };
    }
    if (!verifyWorkflowAssistSuggestionId(proposal)) {
        return { ok: false, error: "SUGGESTION_ID_MISMATCH", message: "Invalid suggestion id.", status: 400 };
    }

    if (proposal.proposal_kind === "create_workflow") {
        const row = proposal.draft_row;
        if (!row) {
            return { ok: false, error: "INTERNAL", message: "Missing draft_row.", status: 500 };
        }
        const insertRow: Record<string, unknown> = {
            org_id: ctx.orgId,
            created_by: ctx.userId,
            name: row.name,
            description: row.description ?? null,
            event_type: row.event_type,
            entity_type: row.entity_type,
            enabled: false,
        };
        const { data, error } = await supabase.from("workflows").insert([insertRow]).select().single();
        if (error || !data) {
            return {
                ok: false,
                error: "WORKFLOW_INSERT_FAILED",
                message: error?.message ?? "Insert failed",
                status: 400,
            };
        }
        const wf = data as Record<string, unknown>;
        const wid = String(wf.id ?? "");
        logAdminAudit({
            entity: "workflows",
            id: wid,
            changed_fields: ["insert_via_workflow_assist"],
            actor_user_id: ctx.userId,
            role: ctx.role,
        });
        return { ok: true, workflow_id: wid, workflow: wf };
    }

    const wid = proposal.target_workflow_id;
    if (!wid) {
        return { ok: false, error: "INTERNAL", message: "Missing target workflow id.", status: 500 };
    }

    const { data: existing } = await supabase.from("workflows").select("id").eq("id", wid).eq("org_id", ctx.orgId).maybeSingle();
    if (!existing) {
        return { ok: false, error: "NOT_FOUND", message: "Workflow not found in org.", status: 404 };
    }

    const patch = proposal.patch;
    if (!patch || typeof patch !== "object") {
        return { ok: false, error: "INTERNAL", message: "Missing patch.", status: 500 };
    }

    const updates: Record<string, unknown> = {};
    const patchRec = patch as Record<string, unknown>;
    for (const key of ALLOWED_PATCH) {
        if (patchRec[key] === undefined) continue;
        updates[key] = patchRec[key];
    }
    if (Object.keys(updates).length === 0) {
        return { ok: false, error: "EMPTY_PATCH", message: "No updates to apply.", status: 400 };
    }

    const { data, error } = await supabase.from("workflows").update(updates).eq("id", wid).eq("org_id", ctx.orgId).select().single();
    if (error?.code === "PGRST116" || (!data && !error)) {
        return { ok: false, error: "NOT_FOUND", message: "Workflow not found after update.", status: 404 };
    }
    if (error) {
        return { ok: false, error: "WORKFLOW_UPDATE_FAILED", message: error.message, status: 400 };
    }
    const wf = data as Record<string, unknown>;
    logAdminAudit({
        entity: "workflows",
        id: wid,
        changed_fields: Object.keys(updates),
        actor_user_id: ctx.userId,
        role: ctx.role,
    });
    return { ok: true, workflow_id: wid, workflow: wf };
}
