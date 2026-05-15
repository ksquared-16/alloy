import type { SupabaseClient } from "@supabase/supabase-js";

import type { TaskAssistSuggestionV1 } from "@/lib/agent/taskAssist/types";
import { proposalTypeFromTaskType } from "@/lib/agent/taskAssist/taskAssistProposalPayload";

export type TaskAssistProposalRow = {
    id: string;
    org_id: string;
    actor_user_id: string;
    created_by: string;
    agent_key: string;
    proposal_type: string;
    entity_type: string;
    entity_id: string;
    status: string;
    payload: TaskAssistSuggestionV1;
    validation_errors: unknown;
    warnings: unknown;
    expires_at: string | null;
    approved_at: string | null;
    approved_by: string | null;
    rejected_at: string | null;
    rejected_by: string | null;
    applied_at: string | null;
    applied_by: string | null;
    applied_result: Record<string, unknown>;
    created_at: string;
    updated_at: string;
};

function isExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return false;
    const ms = Date.parse(expiresAt);
    if (Number.isNaN(ms)) return false;
    return ms <= Date.now();
}

export async function createTaskAssistProposal(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    suggestion: TaskAssistSuggestionV1;
    expiresAt: string | null;
}): Promise<{ ok: true; row: TaskAssistProposalRow } | { ok: false; error: string; message: string }> {
    const proposalType = proposalTypeFromTaskType(params.suggestion.task_type);
    if (!proposalType) {
        return { ok: false, error: "PROPOSAL_TYPE_UNSUPPORTED", message: "Only draft_sms / draft_email proposals can be persisted in V1.1 Card 2." };
    }

    if (params.suggestion.entity_id.trim() !== params.suggestion.entity_id) {
        return { ok: false, error: "ENTITY_ID_INVALID", message: "entity_id must be trimmed UUID." };
    }

    const normalized: TaskAssistSuggestionV1 = {
        ...params.suggestion,
        org_id: params.orgId,
        actor_user_id: params.userId,
    };

    const { data, error } = await params.supabase
        .from("task_assist_proposals")
        .insert({
            org_id: params.orgId,
            actor_user_id: params.userId,
            created_by: params.userId,
            agent_key: "task_assist",
            proposal_type: proposalType,
            entity_type: "opportunities",
            entity_id: normalized.entity_id.trim(),
            status: "draft",
            payload: normalized as unknown as Record<string, unknown>,
            validation_errors: [],
            warnings: normalized.warnings ?? [],
            expires_at: params.expiresAt,
        })
        .select("*")
        .single();

    if (error || !data) {
        console.error("[createTaskAssistProposal]", error);
        return { ok: false, error: "DB_INSERT_FAILED", message: error?.message ?? "Failed to create proposal." };
    }

    return { ok: true, row: mapProposalRow(data as Record<string, unknown>) };
}

export async function listTaskAssistProposalsForEntity(params: {
    supabase: SupabaseClient;
    orgId: string;
    entityType: "opportunities";
    entityId: string;
}): Promise<{ ok: true; rows: TaskAssistProposalRow[] } | { ok: false; error: string; message: string }> {
    const { data, error } = await params.supabase
        .from("task_assist_proposals")
        .select("*")
        .eq("org_id", params.orgId)
        .eq("entity_type", params.entityType)
        .eq("entity_id", params.entityId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("[listTaskAssistProposalsForEntity]", error);
        return { ok: false, error: "DB_LIST_FAILED", message: error.message };
    }

    return { ok: true, rows: (data ?? []).map((r) => mapProposalRow(r as Record<string, unknown>)) };
}

export async function getTaskAssistProposalById(params: {
    supabase: SupabaseClient;
    orgId: string;
    proposalId: string;
}): Promise<{ ok: true; row: TaskAssistProposalRow } | { ok: false; error: string; message: string; status: number }> {
    const { data, error } = await params.supabase
        .from("task_assist_proposals")
        .select("*")
        .eq("org_id", params.orgId)
        .eq("id", params.proposalId)
        .maybeSingle();

    if (error) {
        console.error("[getTaskAssistProposalById]", error);
        return { ok: false, error: "DB_READ_FAILED", message: error.message, status: 500 };
    }
    if (!data) {
        return { ok: false, error: "NOT_FOUND", message: "Proposal not found.", status: 404 };
    }
    return { ok: true, row: mapProposalRow(data as Record<string, unknown>) };
}

export async function approveTaskAssistProposal(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    proposalId: string;
}): Promise<{ ok: true; row: TaskAssistProposalRow } | { ok: false; error: string; message: string; status: number }> {
    const cur = await getTaskAssistProposalById({
        supabase: params.supabase,
        orgId: params.orgId,
        proposalId: params.proposalId,
    });
    if (!cur.ok) return cur;

    if (cur.row.status !== "draft") {
        return { ok: false, error: "INVALID_STATUS", message: "Only draft proposals can be approved.", status: 409 };
    }
    if (isExpired(cur.row.expires_at)) {
        return { ok: false, error: "PROPOSAL_EXPIRED", message: "Proposal has expired.", status: 410 };
    }

    const now = new Date().toISOString();
    const { data, error } = await params.supabase
        .from("task_assist_proposals")
        .update({
            status: "approved",
            approved_at: now,
            approved_by: params.userId,
        })
        .eq("org_id", params.orgId)
        .eq("id", params.proposalId)
        .eq("status", "draft")
        .select("*")
        .maybeSingle();

    if (error || !data) {
        return { ok: false, error: "DB_UPDATE_FAILED", message: error?.message ?? "Approve failed (row may have changed).", status: 409 };
    }

    return { ok: true, row: mapProposalRow(data as Record<string, unknown>) };
}

export async function rejectTaskAssistProposal(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    proposalId: string;
}): Promise<{ ok: true; row: TaskAssistProposalRow } | { ok: false; error: string; message: string; status: number }> {
    const cur = await getTaskAssistProposalById({
        supabase: params.supabase,
        orgId: params.orgId,
        proposalId: params.proposalId,
    });
    if (!cur.ok) return cur;

    if (cur.row.status !== "draft") {
        return { ok: false, error: "INVALID_STATUS", message: "Only draft proposals can be rejected.", status: 409 };
    }

    const now = new Date().toISOString();
    const { data, error } = await params.supabase
        .from("task_assist_proposals")
        .update({
            status: "rejected",
            rejected_at: now,
            rejected_by: params.userId,
        })
        .eq("org_id", params.orgId)
        .eq("id", params.proposalId)
        .eq("status", "draft")
        .select("*")
        .maybeSingle();

    if (error || !data) {
        return { ok: false, error: "DB_UPDATE_FAILED", message: error?.message ?? "Reject failed.", status: 409 };
    }

    return { ok: true, row: mapProposalRow(data as Record<string, unknown>) };
}

/**
 * Mark an **approved** proposal as **applied** (e.g. after successful send in a later card). Does not send.
 */
export async function markTaskAssistProposalApplied(params: {
    supabase: SupabaseClient;
    orgId: string;
    proposalId: string;
    appliedBy: string;
    appliedResult?: Record<string, unknown> | null;
}): Promise<{ ok: true; row: TaskAssistProposalRow } | { ok: false; error: string; message: string; status: number }> {
    const cur = await getTaskAssistProposalById({
        supabase: params.supabase,
        orgId: params.orgId,
        proposalId: params.proposalId,
    });
    if (!cur.ok) return cur;

    if (cur.row.status !== "approved") {
        return { ok: false, error: "INVALID_STATUS", message: "Only approved proposals can be marked applied.", status: 409 };
    }

    const now = new Date().toISOString();
    const { data, error } = await params.supabase
        .from("task_assist_proposals")
        .update({
            status: "applied",
            applied_at: now,
            applied_by: params.appliedBy,
            applied_result: params.appliedResult ?? {},
        })
        .eq("org_id", params.orgId)
        .eq("id", params.proposalId)
        .eq("status", "approved")
        .select("*")
        .maybeSingle();

    if (error || !data) {
        return { ok: false, error: "DB_UPDATE_FAILED", message: error?.message ?? "Mark applied failed.", status: 409 };
    }

    return { ok: true, row: mapProposalRow(data as Record<string, unknown>) };
}

function mapProposalRow(data: Record<string, unknown>): TaskAssistProposalRow {
    return {
        id: String(data.id),
        org_id: String(data.org_id),
        actor_user_id: String(data.actor_user_id),
        created_by: String(data.created_by),
        agent_key: String(data.agent_key),
        proposal_type: String(data.proposal_type),
        entity_type: String(data.entity_type),
        entity_id: String(data.entity_id),
        status: String(data.status),
        payload: data.payload as TaskAssistSuggestionV1,
        validation_errors: data.validation_errors,
        warnings: data.warnings,
        expires_at: data.expires_at != null ? String(data.expires_at) : null,
        approved_at: data.approved_at != null ? String(data.approved_at) : null,
        approved_by: data.approved_by != null ? String(data.approved_by) : null,
        rejected_at: data.rejected_at != null ? String(data.rejected_at) : null,
        rejected_by: data.rejected_by != null ? String(data.rejected_by) : null,
        applied_at: data.applied_at != null ? String(data.applied_at) : null,
        applied_by: data.applied_by != null ? String(data.applied_by) : null,
        applied_result: (data.applied_result as Record<string, unknown>) ?? {},
        created_at: String(data.created_at),
        updated_at: String(data.updated_at),
    };
}
