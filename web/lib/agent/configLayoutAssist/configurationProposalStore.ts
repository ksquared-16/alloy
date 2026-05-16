import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { logAdminAudit } from "@/lib/adminAuth";

import {
    CONFIG_LAYOUT_ASSIST_INITIAL_STATE,
    isConfigLayoutAssistProposalState,
    permissionKeyForProposalTransition,
    transitionRequiresFailedReason,
    transitionRequiresRejectionReason,
    validateConfigurationProposalTransition,
    type ConfigLayoutAssistProposalState,
} from "./configurationProposalState";
import { hashConfigurationProposal } from "./configurationProposalHash";
import { normalizeConfigurationProposal } from "./configurationProposalNormalize";
import {
    CONFIGURATION_PROPOSAL_VERSION,
    type ConfigurationProposalV1,
} from "./configurationProposalV1";
import { validateConfigurationProposal } from "./configurationProposalValidate";

export type ConfigLayoutAssistProposalRecord = {
    id: string;
    org_id: string;
    proposal_version: number;
    proposal_json: ConfigurationProposalV1;
    proposal_hash: string;
    state: ConfigLayoutAssistProposalState;
    category: string;
    summary: string;
    risk_level: string;
    apply_mode: string;
    permission_requirements: string[];
    created_by: string | null;
    reviewed_by: string | null;
    approved_by: string | null;
    applied_by: string | null;
    rejected_by: string | null;
    failed_reason: string | null;
    rejection_reason: string | null;
    created_at: string;
    updated_at: string;
    reviewed_at: string | null;
    approved_at: string | null;
    applied_at: string | null;
    rejected_at: string | null;
    failed_at: string | null;
    rolled_back_at: string | null;
};

export type ListConfigurationProposalFilters = {
    state?: string;
    category?: string;
    limit?: number;
};

function mapRow(data: Record<string, unknown>): ConfigLayoutAssistProposalRecord {
    const state = String(data.state ?? "draft");
    if (!isConfigLayoutAssistProposalState(state)) {
        throw new Error(`Invalid proposal state in DB: ${state}`);
    }
    return {
        id: String(data.id),
        org_id: String(data.org_id),
        proposal_version: Number(data.proposal_version ?? 1),
        proposal_json: data.proposal_json as ConfigurationProposalV1,
        proposal_hash: String(data.proposal_hash),
        state,
        category: String(data.category),
        summary: String(data.summary),
        risk_level: String(data.risk_level),
        apply_mode: String(data.apply_mode),
        permission_requirements: Array.isArray(data.permission_requirements)
            ? data.permission_requirements.map(String)
            : [],
        created_by: data.created_by != null ? String(data.created_by) : null,
        reviewed_by: data.reviewed_by != null ? String(data.reviewed_by) : null,
        approved_by: data.approved_by != null ? String(data.approved_by) : null,
        applied_by: data.applied_by != null ? String(data.applied_by) : null,
        rejected_by: data.rejected_by != null ? String(data.rejected_by) : null,
        failed_reason: data.failed_reason != null ? String(data.failed_reason) : null,
        rejection_reason: data.rejection_reason != null ? String(data.rejection_reason) : null,
        created_at: String(data.created_at),
        updated_at: String(data.updated_at),
        reviewed_at: data.reviewed_at != null ? String(data.reviewed_at) : null,
        approved_at: data.approved_at != null ? String(data.approved_at) : null,
        applied_at: data.applied_at != null ? String(data.applied_at) : null,
        rejected_at: data.rejected_at != null ? String(data.rejected_at) : null,
        failed_at: data.failed_at != null ? String(data.failed_at) : null,
        rolled_back_at: data.rolled_back_at != null ? String(data.rolled_back_at) : null,
    };
}

function auditLifecycle(
    entity: string,
    id: string,
    changed_fields: string[],
    actor_user_id: string,
    role: string
): void {
    logAdminAudit({ entity, id, changed_fields, actor_user_id, role });
    // TODO(Card 10+): emit workflow_events — config_layout_proposal_created / config_layout_proposal_state_changed
}

export async function createConfigurationProposalRecord(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    proposal: ConfigurationProposalV1;
    createdByRole?: string;
}): Promise<
    | { ok: true; record: ConfigLayoutAssistProposalRecord }
    | { ok: false; error: string; message: string; validation?: ReturnType<typeof validateConfigurationProposal> }
> {
    const normalized = normalizeConfigurationProposal({
        ...params.proposal,
        created_by: params.proposal.created_by ?? params.userId,
    });
    const validation = validateConfigurationProposal(normalized);
    if (!validation.ok) {
        return {
            ok: false,
            error: "PROPOSAL_VALIDATION_FAILED",
            message: validation.issues.map((i) => i.message).join("; "),
            validation,
        };
    }

    const id = randomUUID();
    const storedProposal: ConfigurationProposalV1 = {
        ...normalized,
        id,
        created_at: normalized.created_at || new Date().toISOString(),
    };
    const proposal_hash = hashConfigurationProposal(storedProposal);

    const { data, error } = await params.supabase
        .from("config_layout_assist_proposals")
        .insert({
            id,
            org_id: params.orgId,
            proposal_version: CONFIGURATION_PROPOSAL_VERSION,
            proposal_json: storedProposal,
            proposal_hash,
            state: CONFIG_LAYOUT_ASSIST_INITIAL_STATE,
            category: storedProposal.category,
            summary: storedProposal.summary,
            risk_level: storedProposal.risk_level,
            apply_mode: storedProposal.apply_mode,
            permission_requirements: storedProposal.permission_requirements,
            created_by: params.userId,
        })
        .select("*")
        .single();

    if (error || !data) {
        console.error("[createConfigurationProposalRecord]", error);
        return { ok: false, error: "DB_INSERT_FAILED", message: error?.message ?? "Insert failed." };
    }

    const record = mapRow(data as Record<string, unknown>);
    auditLifecycle(
        "config_layout_assist_proposals",
        record.id,
        ["created", "state:draft"],
        params.userId,
        params.createdByRole ?? "admin"
    );

    return { ok: true, record };
}

export async function getConfigurationProposalRecord(params: {
    supabase: SupabaseClient;
    orgId: string;
    proposalId: string;
}): Promise<
    | { ok: true; record: ConfigLayoutAssistProposalRecord }
    | { ok: false; error: string; message: string; status: number }
> {
    const { data, error } = await params.supabase
        .from("config_layout_assist_proposals")
        .select("*")
        .eq("org_id", params.orgId)
        .eq("id", params.proposalId)
        .maybeSingle();

    if (error) {
        console.error("[getConfigurationProposalRecord]", error);
        return { ok: false, error: "DB_READ_FAILED", message: error.message, status: 500 };
    }
    if (!data) {
        return { ok: false, error: "NOT_FOUND", message: "Proposal not found.", status: 404 };
    }
    return { ok: true, record: mapRow(data as Record<string, unknown>) };
}

export async function listConfigurationProposalRecords(params: {
    supabase: SupabaseClient;
    orgId: string;
    filters?: ListConfigurationProposalFilters;
}): Promise<
    | { ok: true; records: ConfigLayoutAssistProposalRecord[] }
    | { ok: false; error: string; message: string }
> {
    const state = params.filters?.state?.trim();
    if (state && !isConfigLayoutAssistProposalState(state)) {
        return { ok: false, error: "INVALID_STATE_FILTER", message: `Invalid state filter: ${state}` };
    }

    let q = params.supabase
        .from("config_layout_assist_proposals")
        .select("*")
        .eq("org_id", params.orgId)
        .order("created_at", { ascending: false });

    if (state) {
        q = q.eq("state", state);
    }

    const category = params.filters?.category?.trim();
    if (category) {
        q = q.eq("category", category);
    }

    const limit = params.filters?.limit;
    if (limit != null && limit > 0) {
        q = q.limit(Math.min(limit, 200));
    } else {
        q = q.limit(100);
    }

    const { data, error } = await q;
    if (error) {
        console.error("[listConfigurationProposalRecords]", error);
        return { ok: false, error: "DB_LIST_FAILED", message: error.message };
    }

    return { ok: true, records: (data ?? []).map((r) => mapRow(r as Record<string, unknown>)) };
}

export type TransitionConfigurationProposalInput = {
    to_state: ConfigLayoutAssistProposalState;
    rejection_reason?: string | null;
    failed_reason?: string | null;
};

function buildStatePatch(
    to: ConfigLayoutAssistProposalState,
    userId: string,
    input: TransitionConfigurationProposalInput
): Record<string, unknown> {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { state: to };

    switch (to) {
        case "reviewed":
            patch.reviewed_at = now;
            patch.reviewed_by = userId;
            break;
        case "approved":
            patch.approved_at = now;
            patch.approved_by = userId;
            break;
        case "applied":
            patch.applied_at = now;
            patch.applied_by = userId;
            break;
        case "rejected":
            patch.rejected_at = now;
            patch.rejected_by = userId;
            patch.rejection_reason = input.rejection_reason?.trim() || null;
            break;
        case "failed":
            patch.failed_at = now;
            patch.failed_reason = input.failed_reason?.trim() || null;
            break;
        case "rolled_back":
            patch.rolled_back_at = now;
            break;
        default:
            break;
    }
    return patch;
}

/**
 * Transition lifecycle state only — does not execute proposal operations (Card 6).
 */
export async function transitionConfigurationProposalState(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    proposalId: string;
    input: TransitionConfigurationProposalInput;
    actorRole?: string;
}): Promise<
    | { ok: true; record: ConfigLayoutAssistProposalRecord; permission_key: string }
    | { ok: false; error: string; message: string; status: number }
> {
    const cur = await getConfigurationProposalRecord({
        supabase: params.supabase,
        orgId: params.orgId,
        proposalId: params.proposalId,
    });
    if (!cur.ok) return cur;

    const tr = validateConfigurationProposalTransition(cur.record.state, params.input.to_state);
    if (!tr.ok) {
        return { ok: false, error: tr.code, message: tr.message, status: 409 };
    }

    if (transitionRequiresRejectionReason(tr.to)) {
        const reason = params.input.rejection_reason?.trim();
        if (!reason) {
            return {
                ok: false,
                error: "REJECTION_REASON_REQUIRED",
                message: "rejection_reason is required when rejecting a proposal.",
                status: 400,
            };
        }
    }

    if (transitionRequiresFailedReason(tr.to)) {
        const reason = params.input.failed_reason?.trim();
        if (!reason) {
            return {
                ok: false,
                error: "FAILED_REASON_REQUIRED",
                message: "failed_reason is required when marking a proposal failed.",
                status: 400,
            };
        }
    }

    const patch = buildStatePatch(tr.to, params.userId, params.input);
    const { data, error } = await params.supabase
        .from("config_layout_assist_proposals")
        .update(patch)
        .eq("org_id", params.orgId)
        .eq("id", params.proposalId)
        .select("*")
        .single();

    if (error || !data) {
        console.error("[transitionConfigurationProposalState]", error);
        return { ok: false, error: "DB_UPDATE_FAILED", message: error?.message ?? "Update failed.", status: 500 };
    }

    const record = mapRow(data as Record<string, unknown>);
    const permission_key = permissionKeyForProposalTransition(tr.to);

    auditLifecycle(
        "config_layout_assist_proposals",
        record.id,
        [`state:${cur.record.state}->${tr.to}`],
        params.userId,
        params.actorRole ?? "admin"
    );

    return { ok: true, record, permission_key };
}

export { validateConfigurationProposalTransition };
