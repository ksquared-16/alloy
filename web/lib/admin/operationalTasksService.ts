import type { SupabaseClient } from "@supabase/supabase-js";

import {
    isTaskAssistV1Uuid,
    validateTaskAssistV1ParsedJsonNoForbiddenWorkflowKeys,
} from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";
import type { OperationalWorkDedupePolicy } from "@/lib/admin/operationalWork/operationalWorkTypes";
import {
    enrichOperationalTasksForWorkspace,
    type OperationalTaskWorkspaceRow,
} from "@/lib/admin/operationalTasksWorkspaceEnrichment";
import { getTaskAssistProposalById } from "@/lib/agent/taskAssist/taskAssistProposalPersistence";

export type OperationalTaskRow = {
    id: string;
    org_id: string;
    entity_type: string | null;
    entity_id: string | null;
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
    entityId: string | null;
    title: string;
    description: string | null;
    dueAtIso: string;
    source: "task_assist" | "manual";
    proposalId: string | null;
    assignedToUserId: string | null;
    metadata?: Record<string, unknown> | null;
}): Promise<{ ok: true; row: OperationalTaskRow } | { ok: false; error: string; message: string; status?: number }> {
    const linkedEntityId = params.entityId?.trim() || null;

    if (params.proposalId) {
        if (!linkedEntityId) {
            return {
                ok: false,
                error: "PROPOSAL_REQUIRES_ENTITY",
                message: "proposal_id requires a linked opportunity.",
                status: 400,
            };
        }
        const pr = await getTaskAssistProposalById({
            supabase: params.supabase,
            orgId: params.orgId,
            proposalId: params.proposalId,
        });
        if (!pr.ok) {
            return { ok: false, error: pr.error, message: pr.message, status: pr.status };
        }
        if (pr.row.entity_type !== "opportunities" || pr.row.entity_id !== linkedEntityId) {
            return { ok: false, error: "PROPOSAL_ENTITY_MISMATCH", message: "proposal_id does not match entity.", status: 400 };
        }
    }

    const { data, error } = await params.supabase
        .from("operational_tasks")
        .insert({
            org_id: params.orgId,
            entity_type: linkedEntityId ? "opportunities" : null,
            entity_id: linkedEntityId,
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
    if (
        linkedEntityId &&
        (params.source === "task_assist" || params.source === "manual")
    ) {
        await syncOpportunityNextFollowUpFromOperationalTasks({
            supabase: params.supabase,
            orgId: params.orgId,
            opportunityId: linkedEntityId,
        });
    }
    return { ok: true, row };
}

/** Find an open task matching instantiate dedupe criteria (Phase A). */
export async function findOpenOperationalTaskForInstantiateDedupe(params: {
    supabase: SupabaseClient;
    orgId: string;
    idempotencyKey?: string | null;
    workDefinitionKey?: string | null;
    subjectFingerprint?: string | null;
    periodKey?: string | null;
    dedupePolicy: OperationalWorkDedupePolicy;
}): Promise<OperationalTaskRow | null> {
    const idempotencyKey = params.idempotencyKey?.trim() || null;
    if (idempotencyKey) {
        const { data, error } = await params.supabase
            .from("operational_tasks")
            .select("*")
            .eq("org_id", params.orgId)
            .eq("status", "open")
            .filter("metadata->provenance->>idempotency_key", "eq", idempotencyKey)
            .limit(1)
            .maybeSingle();
        if (error) {
            console.error("[findOpenOperationalTaskForInstantiateDedupe:idempotency]", error);
        } else if (data) {
            return mapTaskRow(data as Record<string, unknown>);
        }
    }

    if (params.dedupePolicy === "none") return null;

    const workDefinitionKey = params.workDefinitionKey?.trim() || null;
    const subjectFingerprint = params.subjectFingerprint?.trim() || null;
    if (!workDefinitionKey || !subjectFingerprint) return null;

    let query = params.supabase
        .from("operational_tasks")
        .select("*")
        .eq("org_id", params.orgId)
        .eq("status", "open")
        .filter("metadata->>work_definition_key", "eq", workDefinitionKey)
        .filter("metadata->>subject_fingerprint", "eq", subjectFingerprint);

    if (params.dedupePolicy === "definition_subject_period") {
        const periodKey = params.periodKey?.trim() || "";
        query = query.filter("metadata->>dedupe_period_key", "eq", periodKey);
    }

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) {
        console.error("[findOpenOperationalTaskForInstantiateDedupe:definition]", error);
        return null;
    }
    if (!data) return null;
    return mapTaskRow(data as Record<string, unknown>);
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

export type OperationalTaskWorkspaceFilter =
    | "open"
    | "due_today"
    | "overdue"
    | "completed"
    | "all"
    | "assigned_to_me"
    | "unassigned";

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
}): Promise<{ ok: true; rows: OperationalTaskWorkspaceRow[] } | { ok: false; error: string; message: string }> {
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 200);
    let q = params.supabase
        .from("operational_tasks")
        .select("*")
        .eq("org_id", params.orgId)
        .order("due_at", { ascending: true })
        .limit(limit);

    if (params.filter === "completed") {
        q = q.in("status", ["completed", "canceled"]);
    } else if (params.filter !== "all") {
        q = q.eq("status", "open");
    }

    if (params.filter === "assigned_to_me") {
        q = q.eq("assigned_to_user_id", params.userId);
    } else if (params.filter === "unassigned") {
        q = q.is("assigned_to_user_id", null);
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

    const enriched = await enrichOperationalTasksForWorkspace({
        supabase: params.supabase,
        orgId: params.orgId,
        tasks: rows,
    });

    return { ok: true, rows: enriched };
}

export async function summarizeOperationalTaskCounts(params: {
    supabase: SupabaseClient;
    orgId: string;
}): Promise<
    | { ok: true; open: number; due_soon: number; overdue: number }
    | { ok: false; error: string; message: string }
> {
    /*
     * COUNTED IN THE DATABASE, NOT OVER A PAGE.
     *
     * These counts were derived by listing open tasks with `limit: 200` and measuring the array. That
     * makes 200 the silent ceiling of `open`, and makes `overdue` / `due_soon` counts of whatever
     * happened to fit on that page ordered by due date — so an org with more than 200 open work items
     * would be told a number that is wrong and looks plausible. A badge is a denominator claim; it has
     * to be counted, not sampled.
     */
    const now = new Date();
    const soonCutoff = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const base = () =>
        params.supabase
            .from("operational_tasks")
            .select("id", { count: "exact", head: true })
            .eq("org_id", params.orgId)
            .eq("status", "open");

    const [openRes, overdueRes, dueSoonRes] = await Promise.all([
        base(),
        base().lt("due_at", now.toISOString()),
        base().gte("due_at", now.toISOString()).lte("due_at", soonCutoff.toISOString()),
    ]);

    const failed = [openRes, overdueRes, dueSoonRes].find((r) => r.error);
    if (failed?.error) {
        return { ok: false, error: "DB_COUNT_FAILED", message: failed.error.message };
    }

    return {
        ok: true,
        open: openRes.count ?? 0,
        due_soon: dueSoonRes.count ?? 0,
        overdue: overdueRes.count ?? 0,
    };
}

export async function getOperationalTaskById(params: {
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
    if (row.source === "task_assist" && row.entity_id) {
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
    if (row.source === "task_assist" && row.entity_id) {
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
    assignedToUserId?: string | null;
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
    if (params.assignedToUserId !== undefined) {
        if (params.assignedToUserId === null || params.assignedToUserId === "") {
            patch.assigned_to_user_id = null;
        } else {
            const id = params.assignedToUserId.trim();
            if (!isTaskAssistV1Uuid(id)) {
                return { ok: false, error: "ASSIGNED_INVALID", message: "assigned_to_user_id must be a UUID or null.", status: 400 };
            }
            patch.assigned_to_user_id = id;
        }
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
    if (row.source === "task_assist" && row.entity_id) {
        await syncOpportunityNextFollowUpFromOperationalTasks({
            supabase: params.supabase,
            orgId: params.orgId,
            opportunityId: row.entity_id,
        });
    }
    return { ok: true, row };
}

export function validateOperationalTaskCreateBody(body: unknown): { ok: false; error: string; message: string } | { ok: true; value: {
    entity_type: "opportunities" | null;
    entity_id: string | null;
    title: string;
    description: string | null;
    due_at: string;
    source: "task_assist" | "manual";
    proposal_id: string | null;
    assigned_to_user_id: string | null;
    work_definition_key: string | null;
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
        "work_definition_key",
        "metadata",
    ]);
    for (const k of Object.keys(body)) {
        if (!allowed.has(k)) {
            return { ok: false, error: "UNKNOWN_BODY_KEYS", message: `Unexpected key: ${k}` };
        }
    }
    if (body.entity_type != null && body.entity_type !== "" && body.entity_type !== "opportunities") {
        return { ok: false, error: "ENTITY_TYPE_UNSUPPORTED", message: "entity_type must be opportunities when provided." };
    }

    const entityIdRaw = body.entity_id;
    let entityId: string | null = null;
    if (entityIdRaw != null && entityIdRaw !== "") {
        if (typeof entityIdRaw !== "string") {
            return { ok: false, error: "ENTITY_ID_INVALID", message: "entity_id must be a UUID string or null." };
        }
        entityId = entityIdRaw.trim();
        if (!entityId || !isTaskAssistV1Uuid(entityId)) {
            return { ok: false, error: "ENTITY_ID_INVALID", message: "entity_id must be a UUID." };
        }
        if (body.entity_type !== "opportunities") {
            return { ok: false, error: "ENTITY_TYPE_REQUIRED", message: "entity_type must be opportunities when entity_id is set." };
        }
    } else if (body.entity_type === "opportunities") {
        return { ok: false, error: "ENTITY_ID_REQUIRED", message: "entity_id is required when entity_type is opportunities." };
    }
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
        return { ok: false, error: "TITLE_REQUIRED", message: "title is required." };
    }
    const dueRaw = typeof body.due_at === "string" ? body.due_at.trim() : "";
    if (!dueRaw || Number.isNaN(Date.parse(dueRaw))) {
        return { ok: false, error: "DUE_AT_INVALID", message: "due_at must be a parseable ISO-8601 timestamp." };
    }
    const sourceRaw = typeof body.source === "string" ? body.source.trim().toLowerCase() : "";
    const source = sourceRaw === "task_assist" || sourceRaw === "manual" ? sourceRaw : null;
    if (!source) {
        return { ok: false, error: "SOURCE_INVALID", message: "source must be task_assist or manual." };
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
    let workDefinitionKey: string | null = null;
    if (body.work_definition_key != null && body.work_definition_key !== "") {
        if (typeof body.work_definition_key !== "string") {
            return { ok: false, error: "WORK_DEFINITION_KEY_INVALID", message: "work_definition_key must be a string or null." };
        }
        workDefinitionKey = body.work_definition_key.trim() || null;
    } else if (typeof metadata.work_definition_key === "string" && metadata.work_definition_key.trim()) {
        workDefinitionKey = metadata.work_definition_key.trim();
    }

    return {
        ok: true,
        value: {
            entity_type: entityId ? "opportunities" : null,
            entity_id: entityId,
            title,
            description,
            due_at: new Date(Date.parse(dueRaw)).toISOString(),
            source,
            proposal_id: proposalId,
            assigned_to_user_id: assigned,
            work_definition_key: workDefinitionKey,
            metadata,
        },
    };
}

function mapTaskRow(data: Record<string, unknown>): OperationalTaskRow {
    return {
        id: String(data.id),
        org_id: String(data.org_id),
        entity_type: data.entity_type != null ? String(data.entity_type) : null,
        entity_id: data.entity_id != null ? String(data.entity_id) : null,
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
