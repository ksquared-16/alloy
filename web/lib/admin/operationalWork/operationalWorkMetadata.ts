import type {
    OperationalWorkCategory,
    OperationalWorkContextSnapshot,
    OperationalWorkInstanceRow,
    OperationalWorkInstantiateProvenance,
    OperationalWorkMetadataV1,
    OperationalWorkProvenance,
    OperationalWorkProvenanceSource,
    OperationalWorkShape,
    OperationalWorkView,
} from "@/lib/admin/operationalWork/operationalWorkTypes";
import { OPERATIONAL_WORK_FRAMEWORK_VERSION } from "@/lib/admin/operationalWork/operationalWorkTypes";
import type { OperationalTaskRow } from "@/lib/admin/operationalTasksService";

const WORK_CATEGORIES = new Set<OperationalWorkCategory>([
    "information_collection",
    "review",
    "follow_up",
    "decision",
    "resolution",
    "compliance",
    "coordination",
    "other",
]);

const TASK_SHAPES = new Set<OperationalWorkShape>(["task"]);


const PROVENANCE_SOURCES = new Set<OperationalWorkProvenanceSource>([
    "manual",
    "task_assist",
    "workflow",
    "recurrence",
    "system",
    "lifecycle_template",
]);

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function parseCategory(v: unknown): OperationalWorkCategory | null {
    if (typeof v !== "string") return null;
    const key = v.trim() as OperationalWorkCategory;
    return WORK_CATEGORIES.has(key) ? key : null;
}

function parseShape(v: unknown): OperationalWorkShape {
    if (typeof v === "string" && TASK_SHAPES.has(v.trim() as OperationalWorkShape)) {
        return "task";
    }
    return "task";
}

function parseProvenanceSource(v: unknown): OperationalWorkProvenanceSource | null {
    if (typeof v !== "string") return null;
    const trimmed = v.trim();
    if (trimmed === "task_assist_apply") return "task_assist";
    const key = trimmed as OperationalWorkProvenanceSource;
    return PROVENANCE_SOURCES.has(key) ? key : null;
}

/** Map instantiate provenance to operational_tasks.source column (CHECK constraint). */
export function mapInstantiateProvenanceToTaskSource(
    source: OperationalWorkInstantiateProvenance["source"],
): "manual" | "task_assist" {
    if (source === "task_assist" || source === "task_assist_apply") return "task_assist";
    return "manual";
}

function copyWorkflowProvenanceFields(
    target: OperationalWorkProvenance,
    source: OperationalWorkInstantiateProvenance,
): void {
    const createdBy = trimOrNull(source.created_by_user_id);
    if (createdBy) target.created_by_user_id = createdBy;
    const executor = trimOrNull(source.executor_user_id);
    if (executor) target.executor_user_id = executor;
    const workflowId = trimOrNull(source.workflow_id);
    if (workflowId) target.workflow_id = workflowId;
    if (typeof source.workflow_action_order === "number" && Number.isFinite(source.workflow_action_order)) {
        target.workflow_action_order = source.workflow_action_order;
    }
    const workflowActionId = trimOrNull(source.workflow_action_id);
    if (workflowActionId) target.workflow_action_id = workflowActionId;
    const workflowEventId = trimOrNull(source.workflow_event_id);
    if (workflowEventId) target.workflow_event_id = workflowEventId;
    const workflowEventType = trimOrNull(source.workflow_event_type);
    if (workflowEventType) target.workflow_event_type = workflowEventType;
    const mappingMode = trimOrNull(source.workflow_subject_mapping_mode);
    if (mappingMode) target.workflow_subject_mapping_mode = mappingMode;
    if (typeof source.workflow_action_payload_version === "number") {
        target.workflow_action_payload_version = source.workflow_action_payload_version;
    }
}

export function normalizeInstantiateProvenance(
    provenance: OperationalWorkInstantiateProvenance,
    params: { proposalId?: string | null; idempotencyKey?: string | null },
): OperationalWorkProvenance {
    const source = parseProvenanceSource(provenance.source) ?? "manual";
    const out: OperationalWorkProvenance = { source };
    const proposalId = trimOrNull(provenance.proposal_id) ?? trimOrNull(params.proposalId);
    if (proposalId) out.proposal_id = proposalId;
    const workflowRunId = trimOrNull(provenance.workflow_run_id);
    if (workflowRunId) out.workflow_run_id = workflowRunId;
    const idempotencyKey = trimOrNull(provenance.idempotency_key) ?? trimOrNull(params.idempotencyKey);
    if (idempotencyKey) out.idempotency_key = idempotencyKey;
    copyWorkflowProvenanceFields(out, provenance);
    return out;
}

function parseContextSnapshot(v: unknown): OperationalWorkContextSnapshot | null {
    if (!isRecord(v)) return null;
    const out: OperationalWorkContextSnapshot = {};
    if (Array.isArray(v.readiness_gap_ids)) {
        out.readiness_gap_ids = v.readiness_gap_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
    }
    if (Array.isArray(v.attention_reason_codes)) {
        out.attention_reason_codes = v.attention_reason_codes.filter(
            (code): code is string => typeof code === "string" && code.trim().length > 0,
        );
    }
    const stage = trimOrNull(v.lifecycle_stage_key);
    if (stage) out.lifecycle_stage_key = stage;
    const eventType = trimOrNull(v.event_type);
    if (eventType) out.event_type = eventType;
    if (!Object.keys(out).length) return null;
    return out;
}

function parseProvenanceFromMetadata(v: unknown): OperationalWorkProvenance | null {
    if (!isRecord(v)) return null;
    const source = parseProvenanceSource(v.source);
    if (!source) return null;
    const out: OperationalWorkProvenance = { source };
    const proposalId = trimOrNull(v.proposal_id);
    if (proposalId) out.proposal_id = proposalId;
    const workflowRunId = trimOrNull(v.workflow_run_id);
    if (workflowRunId) out.workflow_run_id = workflowRunId;
    const idempotencyKey = trimOrNull(v.idempotency_key);
    if (idempotencyKey) out.idempotency_key = idempotencyKey;
    const createdBy = trimOrNull(v.created_by_user_id);
    if (createdBy) out.created_by_user_id = createdBy;
    const executor = trimOrNull(v.executor_user_id);
    if (executor) out.executor_user_id = executor;
    const workflowId = trimOrNull(v.workflow_id);
    if (workflowId) out.workflow_id = workflowId;
    if (typeof v.workflow_action_order === "number" && Number.isFinite(v.workflow_action_order)) {
        out.workflow_action_order = v.workflow_action_order;
    }
    const workflowActionId = trimOrNull(v.workflow_action_id);
    if (workflowActionId) out.workflow_action_id = workflowActionId;
    const workflowEventId = trimOrNull(v.workflow_event_id);
    if (workflowEventId) out.workflow_event_id = workflowEventId;
    const workflowEventType = trimOrNull(v.workflow_event_type);
    if (workflowEventType) out.workflow_event_type = workflowEventType;
    const mappingMode = trimOrNull(v.workflow_subject_mapping_mode);
    if (mappingMode) out.workflow_subject_mapping_mode = mappingMode;
    if (typeof v.workflow_action_payload_version === "number") {
        out.workflow_action_payload_version = v.workflow_action_payload_version;
    }
    return out;
}

function legacyProvenanceFromRow(row: OperationalTaskRow): OperationalWorkProvenance {
    const source = parseProvenanceSource(row.source) ?? "manual";
    const out: OperationalWorkProvenance = { source };
    if (row.proposal_id) out.proposal_id = row.proposal_id;
    return out;
}

/** Parse framework view from a persistence row; legacy rows infer shape and provenance. */
export function parseOperationalWorkViewFromTaskRow(row: OperationalTaskRow): OperationalWorkView {
    const md = row.metadata ?? {};
    const version = md.work_framework_version;

    if (version === OPERATIONAL_WORK_FRAMEWORK_VERSION) {
        const provenance = parseProvenanceFromMetadata(md.provenance) ?? legacyProvenanceFromRow(row);
        return {
            framework_version: OPERATIONAL_WORK_FRAMEWORK_VERSION,
            shape: parseShape(md.shape),
            category: parseCategory(md.category),
            work_definition_key: trimOrNull(md.work_definition_key),
            provenance,
            context_snapshot: parseContextSnapshot(md.context_snapshot),
        };
    }

    return {
        framework_version: OPERATIONAL_WORK_FRAMEWORK_VERSION,
        shape: "task",
        category: parseCategory(md.category),
        work_definition_key: trimOrNull(md.work_definition_key),
        provenance: legacyProvenanceFromRow(row),
        context_snapshot: parseContextSnapshot(md.context_snapshot),
    };
}

export function attachOperationalWorkView(row: OperationalTaskRow): OperationalWorkInstanceRow {
    return { ...row, work: parseOperationalWorkViewFromTaskRow(row) };
}

/**
 * Business Process dimensions surfaced to the workspace tasks client — a read-only,
 * additive projection of fields already present in `metadata` (no schema change). These
 * let Work Items group operational work by its real Business Process / Stage. Fields are
 * `null` when the task is not Business Process–generated.
 *
 * - `department_id` / `lifecycle_provenance`: stamped by `buildBusinessProcessWorkTaskMetadata`.
 * - `lifecycle_stage_key`: top-level BP metadata, or nested `context_snapshot.lifecycle_stage_key`.
 * - `work_definition_key`: framework v1 metadata (present even on manual ad-hoc work).
 *
 * Naming note: this is the flat *task* projection — distinct from `WorkViewConfigV1Stored`
 * (the queue/record Work View config) and from `OperationalWorkView` (the parsed framework
 * view). These three must not be conflated.
 */
export type OperationalTaskBpDimensions = {
    department_id: string | null;
    lifecycle_stage_key: string | null;
    work_definition_key: string | null;
    lifecycle_provenance: string | null;
};

/** Project the Business Process dimensions already present in a task's metadata. */
export function extractOperationalTaskBpDimensions(row: OperationalTaskRow): OperationalTaskBpDimensions {
    const md = isRecord(row.metadata) ? row.metadata : {};
    const ctx = isRecord(md.context_snapshot) ? md.context_snapshot : null;
    return {
        department_id: trimOrNull(md.department_id),
        lifecycle_stage_key: trimOrNull(md.lifecycle_stage_key) ?? (ctx ? trimOrNull(ctx.lifecycle_stage_key) : null),
        work_definition_key: trimOrNull(md.work_definition_key),
        lifecycle_provenance: trimOrNull(md.lifecycle_provenance),
    };
}

/**
 * Strip the parsed work view for API responses while preserving the legacy task JSON shape,
 * and additively surface the Business Process dimensions (read-only projection of metadata).
 * Existing fields — including the full `metadata` jsonb — are preserved.
 */
export function toOperationalTaskApiRow<T extends OperationalTaskRow>(
    row: T & { work?: OperationalWorkView },
): T & OperationalTaskBpDimensions {
    const { work: _work, ...task } = row;
    void _work;
    return { ...(task as T), ...extractOperationalTaskBpDimensions(row) };
}

const FRAMEWORK_METADATA_KEYS = new Set([
    "work_framework_version",
    "shape",
    "category",
    "work_definition_key",
    "subject_fingerprint",
    "dedupe_period_key",
    "dedupe_key",
    "provenance",
    "context_snapshot",
    "suggested_action_keys",
]);

/** Build metadata for create — merges caller bag with framework keys (caller cannot override framework keys). */
export function buildOperationalWorkMetadataForCreate(params: {
    source: "task_assist" | "manual";
    proposalId: string | null;
    callerMetadata?: Record<string, unknown> | null;
}): Record<string, unknown> {
    const caller = isRecord(params.callerMetadata) ? params.callerMetadata : {};
    const passthrough: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(caller)) {
        if (!FRAMEWORK_METADATA_KEYS.has(key)) {
            passthrough[key] = value;
        }
    }

    const category = parseCategory(caller.category) ?? undefined;
    const workDefinitionKey = trimOrNull(caller.work_definition_key) ?? undefined;
    const contextSnapshot = parseContextSnapshot(caller.context_snapshot) ?? undefined;

    const provenance: OperationalWorkProvenance = {
        source: params.source,
    };
    if (params.proposalId) {
        provenance.proposal_id = params.proposalId;
    } else {
        const callerProposal = isRecord(caller.provenance) ? trimOrNull(caller.provenance.proposal_id) : null;
        if (callerProposal) provenance.proposal_id = callerProposal;
    }

    const framework: OperationalWorkMetadataV1 = {
        work_framework_version: OPERATIONAL_WORK_FRAMEWORK_VERSION,
        shape: "task",
        provenance,
    };
    if (category) framework.category = category;
    if (workDefinitionKey) framework.work_definition_key = workDefinitionKey;
    if (contextSnapshot) framework.context_snapshot = contextSnapshot;

    if (Array.isArray(caller.suggested_action_keys)) {
        const keys = caller.suggested_action_keys.filter((k): k is string => typeof k === "string" && k.trim().length > 0);
        if (keys.length) framework.suggested_action_keys = keys;
    }

    return { ...passthrough, ...framework };
}

/** Build metadata for instantiateWork — includes dedupe identity fields. */
export function buildOperationalWorkMetadataForInstantiate(params: {
    workDefinitionKey: string;
    category?: OperationalWorkCategory;
    subjectFingerprint: string;
    dedupeKey: string | null;
    periodKey?: string | null;
    provenance: OperationalWorkProvenance;
    contextSnapshot?: OperationalWorkContextSnapshot | null;
    callerMetadata?: Record<string, unknown> | null;
    suggestedActionKeys?: string[];
}): Record<string, unknown> {
    const caller = isRecord(params.callerMetadata) ? params.callerMetadata : {};
    const passthrough: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(caller)) {
        if (!FRAMEWORK_METADATA_KEYS.has(key)) {
            passthrough[key] = value;
        }
    }

    const framework: OperationalWorkMetadataV1 = {
        work_framework_version: OPERATIONAL_WORK_FRAMEWORK_VERSION,
        shape: "task",
        work_definition_key: params.workDefinitionKey,
        subject_fingerprint: params.subjectFingerprint,
        provenance: params.provenance,
    };
    const category = params.category ?? parseCategory(caller.category) ?? undefined;
    if (category) framework.category = category;
    if (params.dedupeKey) framework.dedupe_key = params.dedupeKey;
    const periodKey = trimOrNull(params.periodKey);
    if (periodKey) framework.dedupe_period_key = periodKey;
    const contextSnapshot = params.contextSnapshot ?? parseContextSnapshot(caller.context_snapshot) ?? undefined;
    if (contextSnapshot) framework.context_snapshot = contextSnapshot;
    if (params.suggestedActionKeys?.length) framework.suggested_action_keys = params.suggestedActionKeys;

    return { ...passthrough, ...framework };
}
