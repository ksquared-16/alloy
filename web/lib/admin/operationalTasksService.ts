import type { SupabaseClient } from "@supabase/supabase-js";

import {
    isTaskAssistV1Uuid,
    validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys,
} from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";
import { getTaskAssistProposalById } from "@/lib/agent/taskAssist/taskAssistProposalPersistence";

export type OperationalTaskRow = {
    id: string;
    org_id: string;
    entity_type: string;
    entity_id: string;
    assigned_to_user_id: string | null;
    created_by: string;
    title: string;
    description: string | null;
    due_at: string;
    status: string;
    source: string;
    proposal_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

/** Recompute `opportunities.metadata.next_follow_up_at` from earliest open Task Assist task due_at. */
export async function syncOpportunityNextFollowUpFromOperationalTasks(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
    const { data: tasks, error: listErr } = await params.supabase
        .from("operational_tasks")
        .select("due_at")
        .eq("org_id", params.orgId)
        .eq("entity_type", "opportunities")
        .eq("entity_id", params.opportunityId)
        .eq("source", "task_assist")
        .eq("status", "open");

    if (listErr) {
        console.error("[syncOpportunityNextFollowUpFromOperationalTasks]", listErr);
        return { ok: false, message: listErr.message };
    }

    const rows = (tasks ?? []) as { due_at: string }[];
    let minIso: string | null = null;
    for (const r of rows) {
        const t = r.due_at ? Date.parse(r.due_at) : NaN;
        if (Number.isNaN(t)) continue;
        const iso = new Date(t).toISOString();
        if (!minIso || t < Date.parse(minIso)) minIso = iso;
    }

    const { data: opp, error: oppErr } = await params.supabase
        .from("opportunities")
        .select("metadata")
        .eq("id", params.opportunityId)
        .eq("org_id", params.orgId)
        .maybeSingle();

    if (oppErr || !opp) {
        return { ok: false, message: oppErr?.message ?? "Opportunity not found for sync." };
    }

    const md = ((opp as { metadata?: Record<string, unknown> }).metadata ?? {}) as Record<string, unknown>;
    let nextMd: Record<string, unknown>;
    if (minIso == null) {
        const { next_follow_up_at: _removed, ...rest } = md;
        void _removed;
        nextMd = rest;
    } else {
        nextMd = { ...md, next_follow_up_at: minIso };
    }

    const { error: upErr } = await params.supabase
        .from("opportunities")
        .update({ metadata: nextMd })
        .eq("id", params.opportunityId)
        .eq("org_id", params.orgId);

    if (upErr) {
        console.error("[syncOpportunityNextFollowUpFromOperationalTasks] update", upErr);
        return { ok: false, message: upErr.message };
    }
    return { ok: true };
}

export async function createOperationalTask(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    entityId: string;
    title: string;
    description: string | null;
    dueAtIso: string;
    source: "task_assist";
    proposalId: string | null;
    assignedToUserId: string | null;
    metadata?: Record<string, unknown> | null;
}): Promise<{ ok: true; row: OperationalTaskRow } | { ok: false; error: string; message: string; status?: number }> {
    if (params.proposalId) {
        const pr = await getTaskAssistProposalById({
            supabase: params.supabase,
            orgId: params.orgId,
            proposalId: params.proposalId,
        });
        if (!pr.ok) {
            return { ok: false, error: pr.error, message: pr.message, status: pr.status };
        }
        if (pr.row.entity_type !== "opportunities" || pr.row.entity_id !== params.entityId) {
            return { ok: false, error: "PROPOSAL_ENTITY_MISMATCH", message: "proposal_id does not match entity.", status: 400 };
        }
    }

    const { data, error } = await params.supabase
        .from("operational_tasks")
        .insert({
            org_id: params.orgId,
            entity_type: "opportunities",
            entity_id: params.entityId,
            assigned_to_user_id: params.assignedToUserId,
            created_by: params.userId,
            title: params.title.trim(),
            description: params.description?.trim() || null,
            due_at: params.dueAtIso,
            status: "open",
            source: params.source,
            proposal_id: params.proposalId,
            metadata: params.metadata ?? {},
        })
        .select("*")
        .single();

    if (error || !data) {
        console.error("[createOperationalTask]", error);
        return { ok: false, error: "DB_INSERT_FAILED", message: error?.message ?? "Failed to create task." };
    }

    const row = mapTaskRow(data as Record<string, unknown>);
    if (params.source === "task_assist") {
        await syncOpportunityNextFollowUpFromOperationalTasks({
            supabase: params.supabase,
            orgId: params.orgId,
            opportunityId: params.entityId,
        });
    }
    return { ok: true, row };
}

export async function listOperationalTasksForEntity(params: {
    supabase: SupabaseClient;
    orgId: string;
    entityType: "opportunities";
    entityId: string;
}): Promise<{ ok: true; rows: OperationalTaskRow[] } | { ok: false; error: string; message: string }> {
    const { data, error } = await params.supabase
        .from("operational_tasks")
        .select("*")
        .eq("org_id", params.orgId)
        .eq("entity_type", params.entityType)
        .eq("entity_id", params.entityId)
        .order("due_at", { ascending: true });

    if (error) {
        console.error("[listOperationalTasksForEntity]", error);
        return { ok: false, error: "DB_LIST_FAILED", message: error.message };
    }
    return { ok: true, rows: (data ?? []).map((r) => mapTaskRow(r as Record<string, unknown>)) };
}

export type OperationalTaskWorkspaceFilter = "open" | "due_today" | "overdue" | "completed" | "all";

function startOfLocalDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfLocalDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Org-scoped operational tasks for workspace task view (opportunities entity type). */
export async function listOperationalTasksForWorkspace(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    filter: OperationalTaskWorkspaceFilter;
    limit?: number;
}): Promise<{ ok: true; rows: OperationalTaskRow[] } | { ok: false; error: string; message: string }> {
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 200);
    let q = params.supabase
        .from("operational_tasks")
        .select("*")
        .eq("org_id", params.orgId)
        .eq("entity_type", "opportunities")
        .order("due_at", { ascending: true })
        .limit(limit);

    if (params.filter === "completed") {
        q = q.in("status", ["completed", "canceled"]);
    } else if (params.filter !== "all") {
        q = q.eq("status", "open");
    }

    const { data, error } = await q;
    if (error) {
        console.error("[listOperationalTasksForWorkspace]", error);
        return { ok: false, error: "DB_LIST_FAILED", message: error.message };
    }

    let rows = (data ?? []).map((r) => mapTaskRow(r as Record<string, unknown>));
    const now = new Date();
    const dayStart = startOfLocalDay(now);
    const dayEnd = endOfLocalDay(now);

    if (params.filter === "due_today") {
        rows = rows.filter((r) => {
            const t = Date.parse(r.due_at);
            return !Number.isNaN(t) && t >= dayStart.getTime() && t <= dayEnd.getTime();
        });
    } else if (params.filter === "overdue") {
        rows = rows.filter((r) => {
            const t = Date.parse(r.due_at);
            return !Number.isNaN(t) && t < now.getTime();
        });
    }

    return { ok: true, rows };
}

export async function summarizeOperationalTaskCounts(params: {
    supabase: SupabaseClient;
    orgId: string;
}): Promise<
    | { ok: true; open: number; due_soon: number; overdue: number }
    | { ok: false; error: string; message: string }
> {
    const listed = await listOperationalTasksForWorkspace({
        supabase: params.supabase,
        orgId: params.orgId,
        userId: "",
        filter: "open",
        limit: 200,
    });
    if (!listed.ok) return listed;
    const now = Date.now();
    const soonCutoff = now + 24 * 60 * 60 * 1000;
    let due_soon = 0;
    let overdue = 0;
    for (const r of listed.rows) {
        const t = Date.parse(r.due_at);
        if (Number.isNaN(t)) continue;
        if (t < now) overdue += 1;
        else if (t <= soonCutoff) due_soon += 1;
    }
    return { ok: true, open: listed.rows.length, due_soon, overdue };
}

async function getOperationalTaskById(params: {
    supabase: SupabaseClient;
    orgId: string;
    taskId: string;
}): Promise<{ ok: true; row: OperationalTaskRow } | { ok: false; error: string; message: string; status: number }> {
    const { data, error } = await params.supabase
        .from("operational_tasks")
        .select("*")
        .eq("org_id", params.orgId)
        .eq("id", params.taskId)
        .maybeSingle();

    if (error) {
        return { ok: false, error: "DB_READ_FAILED", message: error.message, status: 500 };
    }
    if (!data) {
        return { ok: false, error: "NOT_FOUND", message: "Task not found.", status: 404 };
    }
    return { ok: true, row: mapTaskRow(data as Record<string, unknown>) };
}

export async function completeOperationalTask(params: {
    supabase: SupabaseClient;
    orgId: string;
    taskId: string;
}): Promise<{ ok: true; row: OperationalTaskRow } | { ok: false; error: string; message: string; status: number }> {
    const cur = await getOperationalTaskById(params);
    if (!cur.ok) return cur;
    if (cur.row.status !== "open") {
        return { ok: false, error: "INVALID_STATUS", message: "Only open tasks can be completed.", status: 409 };
    }

    const { data, error } = await params.supabase
        .from("operational_tasks")
        .update({ status: "completed" })
        .eq("org_id", params.orgId)
        .eq("id", params.taskId)
        .eq("status", "open")
        .select("*")
        .maybeSingle();

    if (error || !data) {
        return { ok: false, error: "DB_UPDATE_FAILED", message: error?.message ?? "Complete failed.", status: 409 };
    }
    const row = mapTaskRow(data as Record<string, unknown>);
    if (row.source === "task_assist") {
        await syncOpportunityNextFollowUpFromOperationalTasks({
            supabase: params.supabase,
            orgId: params.orgId,
            opportunityId: row.entity_id,
        });
    }
    return { ok: true, row };
}

export async function cancelOperationalTask(params: {
    supabase: SupabaseClient;
    orgId: string;
    taskId: string;
}): Promise<{ ok: true; row: OperationalTaskRow } | { ok: false; error: string; message: string; status: number }> {
    const cur = await getOperationalTaskById(params);
    if (!cur.ok) return cur;
    if (cur.row.status !== "open") {
        return { ok: false, error: "INVALID_STATUS", message: "Only open tasks can be canceled.", status: 409 };
    }

    const { data, error } = await params.supabase
        .from("operational_tasks")
        .update({ status: "canceled" })
        .eq("org_id", params.orgId)
        .eq("id", params.taskId)
        .eq("status", "open")
        .select("*")
        .maybeSingle();

    if (error || !data) {
        return { ok: false, error: "DB_UPDATE_FAILED", message: error?.message ?? "Cancel failed.", status: 409 };
    }
    const row = mapTaskRow(data as Record<string, unknown>);
    if (row.source === "task_assist") {
        await syncOpportunityNextFollowUpFromOperationalTasks({
            supabase: params.supabase,
            orgId: params.orgId,
            opportunityId: row.entity_id,
        });
    }
    return { ok: true, row };
}

export async function updateOperationalTaskFields(params: {
    supabase: SupabaseClient;
    orgId: string;
    taskId: string;
    title?: string;
    description?: string | null;
    dueAtIso?: string;
}): Promise<{ ok: true; row: OperationalTaskRow } | { ok: false; error: string; message: string; status: number }> {
    const cur = await getOperationalTaskById(params);
    if (!cur.ok) return cur;
    if (cur.row.status !== "open") {
        return { ok: false, error: "INVALID_STATUS", message: "Only open tasks can be edited.", status: 409 };
    }

    const patch: Record<string, unknown> = {};
    if (params.title != null) {
        const t = params.title.trim();
        if (!t) return { ok: false, error: "TITLE_REQUIRED", message: "title cannot be empty.", status: 400 };
        patch.title = t;
    }
    if (params.description !== undefined) {
        patch.description = params.description?.trim() || null;
    }
    if (params.dueAtIso != null) {
        const dueMs = Date.parse(params.dueAtIso);
        if (Number.isNaN(dueMs)) {
            return { ok: false, error: "DUE_INVALID", message: "due_at must be a valid ISO datetime.", status: 400 };
        }
        patch.due_at = new Date(dueMs).toISOString();
    }
    if (!Object.keys(patch).length) {
        return { ok: true, row: cur.row };
    }

    const { data, error } = await params.supabase
        .from("operational_tasks")
        .update(patch)
        .eq("org_id", params.orgId)
        .eq("id", params.taskId)
        .eq("status", "open")
        .select("*")
        .maybeSingle();

    if (error || !data) {
        return { ok: false, error: "DB_UPDATE_FAILED", message: error?.message ?? "Update failed.", status: 409 };
    }
    const row = mapTaskRow(data as Record<string, unknown>);
    if (row.source === "task_assist") {
        await syncOpportunityNextFollowUpFromOperationalTasks({
            supabase: params.supabase,
            orgId: params.orgId,
            opportunityId: row.entity_id,
        });
    }
    return { ok: true, row };
}

export function validateOperationalTaskCreateBody(body: unknown): { ok: false; error: string; message: string } | { ok: true; value: {
    entity_id: string;
    title: string;
    description: string | null;
    due_at: string;
    source: "task_assist";
    proposal_id: string | null;
    assigned_to_user_id: string | null;
    metadata: Record<string, unknown>;
} } {
    if (!isRecord(body)) {
        return { ok: false, error: "BAD_JSON_SHAPE", message: "Body must be a JSON object." };
    }
    const wf = validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys(body);
    if (wf.length) {
        return { ok: false, error: "WORKFLOW_KEYS_FORBIDDEN", message: wf[0] ?? "Forbidden key." };
    }
    const allowed = new Set([
        "entity_type",
        "entity_id",
        "title",
        "description",
        "due_at",
        "source",
        "proposal_id",
        "assigned_to_user_id",
        "metadata",
    ]);
    for (const k of Object.keys(body)) {
        if (!allowed.has(k)) {
            return { ok: false, error: "UNKNOWN_BODY_KEYS", message: `Unexpected key: ${k}` };
        }
    }
    if (body.entity_type !== "opportunities") {
        return { ok: false, error: "ENTITY_TYPE_UNSUPPORTED", message: "entity_type must be opportunities." };
    }
    const entityId = typeof body.entity_id === "string" ? body.entity_id.trim() : "";
    if (!entityId || !isTaskAssistV1Uuid(entityId)) {
        return { ok: false, error: "ENTITY_ID_INVALID", message: "entity_id must be a UUID." };
    }
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
        return { ok: false, error: "TITLE_REQUIRED", message: "title is required." };
    }
    const dueRaw = typeof body.due_at === "string" ? body.due_at.trim() : "";
    if (!dueRaw || Number.isNaN(Date.parse(dueRaw))) {
        return { ok: false, error: "DUE_AT_INVALID", message: "due_at must be a parseable ISO-8601 timestamp." };
    }
    const source = body.source === "task_assist" ? "task_assist" : null;
    if (!source) {
        return { ok: false, error: "SOURCE_INVALID", message: "source must be task_assist for this route." };
    }
    let proposalId: string | null = null;
    if (body.proposal_id != null && body.proposal_id !== "") {
        if (typeof body.proposal_id !== "string") {
            return { ok: false, error: "PROPOSAL_ID_INVALID", message: "proposal_id must be a UUID string or null." };
        }
        const pid = body.proposal_id.trim();
        if (!isTaskAssistV1Uuid(pid)) {
            return { ok: false, error: "PROPOSAL_ID_INVALID", message: "proposal_id must be a UUID." };
        }
        proposalId = pid;
    }
    let assigned: string | null = null;
    if (body.assigned_to_user_id != null && body.assigned_to_user_id !== "") {
        if (typeof body.assigned_to_user_id !== "string") {
            return { ok: false, error: "ASSIGNED_INVALID", message: "assigned_to_user_id must be a UUID string or null." };
        }
        assigned = body.assigned_to_user_id.trim();
    }
    const description = typeof body.description === "string" ? body.description.trim() || null : null;
    const metadata = isRecord(body.metadata) ? (body.metadata as Record<string, unknown>) : {};

    return {
        ok: true,
        value: {
            entity_id: entityId,
            title,
            description,
            due_at: new Date(Date.parse(dueRaw)).toISOString(),
            source,
            proposal_id: proposalId,
            assigned_to_user_id: assigned,
            metadata,
        },
    };
}

function mapTaskRow(data: Record<string, unknown>): OperationalTaskRow {
    return {
        id: String(data.id),
        org_id: String(data.org_id),
        entity_type: String(data.entity_type),
        entity_id: String(data.entity_id),
        assigned_to_user_id: data.assigned_to_user_id != null ? String(data.assigned_to_user_id) : null,
        created_by: String(data.created_by),
        title: String(data.title),
        description: data.description != null ? String(data.description) : null,
        due_at: String(data.due_at),
        status: String(data.status),
        source: String(data.source),
        proposal_id: data.proposal_id != null ? String(data.proposal_id) : null,
        metadata: (data.metadata as Record<string, unknown>) ?? {},
        created_at: String(data.created_at),
        updated_at: String(data.updated_at),
    };
}
