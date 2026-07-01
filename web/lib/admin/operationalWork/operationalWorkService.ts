import type { SupabaseClient } from "@supabase/supabase-js";

import { enrichOperationalTasksWithAssigneeLabels } from "@/lib/admin/operationalWork/operationalWorkAssigneeEnrichment";
import {
    buildOperationalWorkDedupeKey,
    buildOperationalWorkSubjectFingerprint,
    MANUAL_AD_HOC_WORK_DEFINITION_KEY,
    resolveOperationalWorkDedupePolicy,
    shouldDedupeOperationalWork,
} from "@/lib/admin/operationalWork/operationalWorkDedupe";
import {
    attachOperationalWorkView,
    buildOperationalWorkMetadataForCreate,
    buildOperationalWorkMetadataForInstantiate,
    mapInstantiateProvenanceToTaskSource,
    normalizeInstantiateProvenance,
} from "@/lib/admin/operationalWork/operationalWorkMetadata";
import type {
    InstantiateWorkResult,
    OperationalWorkCategory,
    OperationalWorkContextSnapshot,
    OperationalWorkDedupePolicy,
    OperationalWorkInstanceRow,
    OperationalWorkInstantiateProvenance,
    OperationalWorkShape,
    OperationalWorkSubject,
    OperationalWorkWorkspaceFilter,
} from "@/lib/admin/operationalWork/operationalWorkTypes";
import {
    cancelOperationalTask,
    completeOperationalTask,
    createOperationalTask,
    findOpenOperationalTaskForInstantiateDedupe,
    listOperationalTasksForEntity,
    listOperationalTasksForWorkspace,
    summarizeOperationalTaskCounts,
    syncOpportunityNextFollowUpFromOperationalTasks,
    updateOperationalTaskFields,
    validateOperationalTaskCreateBody,
    type OperationalTaskRow,
} from "@/lib/admin/operationalTasksService";
import type { OperationalTaskWorkspaceRow } from "@/lib/admin/operationalTasksWorkspaceEnrichment";

export type { OperationalTaskRow } from "@/lib/admin/operationalTasksService";
export type { OperationalTaskWorkspaceRow } from "@/lib/admin/operationalTasksWorkspaceEnrichment";
export {
    MANUAL_AD_HOC_WORK_DEFINITION_KEY,
    buildOperationalWorkDedupeKey,
    buildOperationalWorkSubjectFingerprint,
    resolveOperationalWorkDedupePolicy,
} from "@/lib/admin/operationalWork/operationalWorkDedupe";
export {
    OPERATIONAL_WORK_FRAMEWORK_VERSION,
    type InstantiateWorkResult,
    type OperationalWorkCategory,
    type OperationalWorkContextSnapshot,
    type OperationalWorkDedupePolicy,
    type OperationalWorkInstanceRow,
    type OperationalWorkInstantiateProvenance,
    type OperationalWorkMetadataV1,
    type OperationalWorkProvenance,
    type OperationalWorkProvenanceSource,
    type OperationalWorkShape,
    type OperationalWorkSubject,
    type OperationalWorkView,
    type OperationalWorkWorkspaceFilter,
} from "@/lib/admin/operationalWork/operationalWorkTypes";
export {
    attachOperationalWorkView,
    buildOperationalWorkMetadataForCreate,
    buildOperationalWorkMetadataForInstantiate,
    mapInstantiateProvenanceToTaskSource,
    normalizeInstantiateProvenance,
    parseOperationalWorkViewFromTaskRow,
    toOperationalTaskApiRow,
} from "@/lib/admin/operationalWork/operationalWorkMetadata";

export type InstantiateWorkRequest = {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    workDefinitionKey?: string;
    shape?: OperationalWorkShape;
    category?: OperationalWorkCategory;
    title: string;
    description?: string | null;
    subject?: OperationalWorkSubject;
    subjectFingerprint?: string;
    assignedToUserId?: string | null;
    dueAt: string;
    provenance: OperationalWorkInstantiateProvenance;
    contextSnapshot?: OperationalWorkContextSnapshot;
    idempotencyKey?: string;
    dedupePolicy?: OperationalWorkDedupePolicy;
    periodKey?: string | null;
    proposalId?: string | null;
    metadata?: Record<string, unknown> | null;
    suggestedActionKeys?: string[];
};

function trimOrNull(v: string | null | undefined): string | null {
    if (v == null) return null;
    const s = v.trim();
    return s || null;
}

function rejectInstantiate(
    error: string,
    message: string,
    reason: string,
): Extract<InstantiateWorkResult, { status: "rejected" }> {
    return { status: "rejected", error, message, reason, dedupeKey: null };
}

function resolveSubject(params: InstantiateWorkRequest): OperationalWorkSubject {
    return {
        entityType: params.subject?.entityType ?? null,
        entityId: trimOrNull(params.subject?.entityId ?? null),
    };
}

function extractWorkDefinitionKeyFromMetadata(metadata?: Record<string, unknown> | null): string | null {
    if (!metadata || typeof metadata.work_definition_key !== "string") return null;
    const key = metadata.work_definition_key.trim();
    return key || null;
}

/** Canonical creation authority for operational work (Phase A). */
export async function instantiateWork(request: InstantiateWorkRequest): Promise<InstantiateWorkResult> {
    const orgId = request.orgId?.trim();
    const userId = request.userId?.trim();
    const title = request.title?.trim() ?? "";
    const dueAt = request.dueAt?.trim() ?? "";
    const shape = request.shape ?? "task";

    if (!orgId) {
        return rejectInstantiate("ORG_ID_REQUIRED", "orgId is required.", "missing_org_id");
    }
    if (!userId) {
        return rejectInstantiate("USER_ID_REQUIRED", "userId is required.", "missing_user_id");
    }
    if (!title) {
        return rejectInstantiate("TITLE_REQUIRED", "title is required.", "missing_title");
    }
    if (!dueAt || Number.isNaN(Date.parse(dueAt))) {
        return rejectInstantiate("DUE_AT_INVALID", "dueAt must be a parseable ISO-8601 timestamp.", "invalid_due_at");
    }
    if (!request.provenance?.source) {
        return rejectInstantiate("PROVENANCE_REQUIRED", "provenance.source is required.", "missing_provenance");
    }
    if (shape !== "task") {
        return rejectInstantiate(
            "SHAPE_UNSUPPORTED",
            "Only task-shaped work is supported in Phase A.",
            "checklist_not_supported",
        );
    }

    const subject = resolveSubject(request);
    const entityId = subject.entityId;
    if (entityId && !subject.entityType) {
        return rejectInstantiate(
            "SUBJECT_ENTITY_TYPE_REQUIRED",
            "subject.entityType is required when subject.entityId is set.",
            "invalid_subject",
        );
    }
    if (subject.entityType === "opportunities" && entityId && !/^[0-9a-f-]{36}$/i.test(entityId)) {
        return rejectInstantiate("SUBJECT_ENTITY_ID_INVALID", "subject.entityId must be a UUID.", "invalid_subject");
    }

    const workDefinitionKey =
        trimOrNull(request.workDefinitionKey) ??
        extractWorkDefinitionKeyFromMetadata(request.metadata) ??
        MANUAL_AD_HOC_WORK_DEFINITION_KEY;

    const subjectFingerprint = buildOperationalWorkSubjectFingerprint({
        orgId,
        entityType: subject.entityType,
        entityId,
        subjectFingerprint: request.subjectFingerprint,
    });

    const periodKey = trimOrNull(request.periodKey ?? null);
    const dedupePolicy = resolveOperationalWorkDedupePolicy({
        workDefinitionKey,
        dedupePolicy: request.dedupePolicy,
        periodKey,
    });

    const dedupeKey = shouldDedupeOperationalWork(dedupePolicy)
        ? buildOperationalWorkDedupeKey({ orgId, workDefinitionKey, subjectFingerprint, periodKey })
        : null;

    const idempotencyKey = trimOrNull(request.idempotencyKey ?? request.provenance.idempotency_key ?? null);
    const proposalId = trimOrNull(request.proposalId ?? request.provenance.proposal_id ?? null);

    const existing = await findOpenOperationalTaskForInstantiateDedupe({
        supabase: request.supabase,
        orgId,
        idempotencyKey,
        workDefinitionKey: shouldDedupeOperationalWork(dedupePolicy) ? workDefinitionKey : null,
        subjectFingerprint: shouldDedupeOperationalWork(dedupePolicy) ? subjectFingerprint : null,
        periodKey,
        dedupePolicy,
    });

    if (existing) {
        const reason = idempotencyKey ? "idempotency_key_match" : "open_instance_exists";
        return {
            status: "deduped",
            existingWork: attachOperationalWorkView(existing),
            dedupeKey: dedupeKey ?? buildOperationalWorkDedupeKey({ orgId, workDefinitionKey, subjectFingerprint, periodKey }),
            reason,
        };
    }

    const normalizedProvenance = normalizeInstantiateProvenance(request.provenance, {
        proposalId,
        idempotencyKey,
    });
    const taskSource = mapInstantiateProvenanceToTaskSource(request.provenance.source);
    const metadata = buildOperationalWorkMetadataForInstantiate({
        workDefinitionKey,
        category: request.category,
        subjectFingerprint,
        dedupeKey,
        periodKey,
        provenance: normalizedProvenance,
        contextSnapshot: request.contextSnapshot ?? null,
        callerMetadata: request.metadata,
        suggestedActionKeys: request.suggestedActionKeys,
    });

    const created = await createOperationalTask({
        supabase: request.supabase,
        orgId,
        userId,
        entityId,
        title,
        description: request.description ?? null,
        dueAtIso: dueAt,
        source: taskSource,
        proposalId,
        assignedToUserId: request.assignedToUserId ?? null,
        metadata,
    });

    if (!created.ok) {
        return rejectInstantiate(created.error, created.message, "create_failed");
    }

    return {
        status: "created",
        work: attachOperationalWorkView(created.row),
        dedupeKey,
    };
}

function mapWorkspaceRow(row: OperationalTaskWorkspaceRow): OperationalTaskWorkspaceRow & { work: OperationalWorkInstanceRow["work"] } {
    return { ...row, work: attachOperationalWorkView(row).work };
}

/** Back-compat create wrapper — delegates to instantiateWork. */
export async function createWorkInstance(params: {
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
}): Promise<
    | { ok: true; row: OperationalWorkInstanceRow; instantiateStatus: "created" | "deduped" }
    | { ok: false; error: string; message: string; status?: number }
> {
    const entityId = params.entityId?.trim() || null;
    const workDefinitionKey =
        extractWorkDefinitionKeyFromMetadata(params.metadata) ?? MANUAL_AD_HOC_WORK_DEFINITION_KEY;

    const result = await instantiateWork({
        supabase: params.supabase,
        orgId: params.orgId,
        userId: params.userId,
        workDefinitionKey,
        title: params.title,
        description: params.description,
        subject: entityId ? { entityType: "opportunities", entityId } : { entityType: null, entityId: null },
        assignedToUserId: params.assignedToUserId,
        dueAt: params.dueAtIso,
        provenance: { source: params.source },
        proposalId: params.proposalId,
        metadata: params.metadata,
        dedupePolicy: workDefinitionKey === MANUAL_AD_HOC_WORK_DEFINITION_KEY ? "none" : undefined,
    });

    if (result.status === "rejected") {
        return { ok: false, error: result.error, message: result.message, status: 400 };
    }
    if (result.status === "aggregated") {
        return { ok: true, row: result.work, instantiateStatus: "created" };
    }
    if (result.status === "deduped") {
        return { ok: true, row: result.existingWork, instantiateStatus: "deduped" };
    }
    return { ok: true, row: result.work, instantiateStatus: "created" };
}

export async function listWorkForEntity(params: {
    supabase: SupabaseClient;
    orgId: string;
    entityType: "opportunities";
    entityId: string;
}): Promise<{ ok: true; rows: OperationalWorkInstanceRow[] } | { ok: false; error: string; message: string }> {
    const listed = await listOperationalTasksForEntity(params);
    if (!listed.ok) return listed;
    const enriched = await enrichOperationalTasksWithAssigneeLabels({
        supabase: params.supabase,
        tasks: listed.rows,
    });
    return { ok: true, rows: enriched.map(attachOperationalWorkView) };
}

export async function listWorkForWorkspace(params: {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    filter: OperationalWorkWorkspaceFilter;
    limit?: number;
}): Promise<
    | { ok: true; rows: Array<OperationalTaskWorkspaceRow & { work: OperationalWorkInstanceRow["work"] }> }
    | { ok: false; error: string; message: string }
> {
    const listed = await listOperationalTasksForWorkspace(params);
    if (!listed.ok) return listed;
    return { ok: true, rows: listed.rows.map(mapWorkspaceRow) };
}

export async function summarizeWorkCounts(params: {
    supabase: SupabaseClient;
    orgId: string;
}): Promise<
    | { ok: true; open: number; due_soon: number; overdue: number }
    | { ok: false; error: string; message: string }
> {
    return summarizeOperationalTaskCounts(params);
}

export async function completeWorkInstance(params: {
    supabase: SupabaseClient;
    orgId: string;
    workId: string;
}): Promise<
    | { ok: true; row: OperationalWorkInstanceRow }
    | { ok: false; error: string; message: string; status: number }
> {
    const completed = await completeOperationalTask({
        supabase: params.supabase,
        orgId: params.orgId,
        taskId: params.workId,
    });
    if (!completed.ok) return completed;
    return { ok: true, row: attachOperationalWorkView(completed.row) };
}

export async function cancelWorkInstance(params: {
    supabase: SupabaseClient;
    orgId: string;
    workId: string;
}): Promise<
    | { ok: true; row: OperationalWorkInstanceRow }
    | { ok: false; error: string; message: string; status: number }
> {
    const canceled = await cancelOperationalTask({
        supabase: params.supabase,
        orgId: params.orgId,
        taskId: params.workId,
    });
    if (!canceled.ok) return canceled;
    return { ok: true, row: attachOperationalWorkView(canceled.row) };
}

export async function updateWorkInstanceFields(params: {
    supabase: SupabaseClient;
    orgId: string;
    workId: string;
    title?: string;
    description?: string | null;
    dueAtIso?: string;
    assignedToUserId?: string | null;
}): Promise<
    | { ok: true; row: OperationalWorkInstanceRow }
    | { ok: false; error: string; message: string; status: number }
> {
    const updated = await updateOperationalTaskFields({
        supabase: params.supabase,
        orgId: params.orgId,
        taskId: params.workId,
        title: params.title,
        description: params.description,
        dueAtIso: params.dueAtIso,
        assignedToUserId: params.assignedToUserId,
    });
    if (!updated.ok) return updated;
    return { ok: true, row: attachOperationalWorkView(updated.row) };
}

export { validateOperationalTaskCreateBody as validateWorkCreateBody, syncOpportunityNextFollowUpFromOperationalTasks };
