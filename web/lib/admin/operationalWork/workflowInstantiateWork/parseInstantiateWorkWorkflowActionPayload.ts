import { MANUAL_AD_HOC_WORK_DEFINITION_KEY } from "@/lib/admin/operationalWork/operationalWorkDedupe";
import { isKnownWorkDefinitionKey } from "@/lib/admin/operationalWork/platformWorkDefinitionCatalog";
import type {
    InstantiateWorkWorkflowActionPayloadV1,
    InstantiateWorkWorkflowDedupedPolicy,
    InstantiateWorkWorkflowFailurePolicy,
    InstantiateWorkWorkflowSubjectEntityType,
    InstantiateWorkWorkflowSubjectMappingV1,
    ParsedInstantiateWorkWorkflowActionPayloadResult,
} from "@/lib/admin/operationalWork/workflowInstantiateWork/types";

const ALLOWED_PAYLOAD_KEYS = new Set([
    "version",
    "work_definition_key",
    "subject",
    "title",
    "description",
    "due_at",
    "assigned_to_user_id",
    "context_snapshot",
    "period_key",
    "on_disabled_definition",
    "on_deduped",
    "on_rejected",
]);

const SAFE_PATH_PATTERN = /^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)*$/;

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object" && !Array.isArray(v);
}

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function parseFailurePolicy(v: unknown, fallback: InstantiateWorkWorkflowFailurePolicy): InstantiateWorkWorkflowFailurePolicy {
    const raw = trimOrNull(v);
    if (raw === "skip" || raw === "fail") return raw;
    return fallback;
}

function parseDedupedPolicy(v: unknown, fallback: InstantiateWorkWorkflowDedupedPolicy): InstantiateWorkWorkflowDedupedPolicy {
    const raw = trimOrNull(v);
    if (raw === "soft_success" || raw === "fail") return raw;
    return fallback;
}

function parseSubjectEntityType(v: unknown): InstantiateWorkWorkflowSubjectEntityType | "invalid" {
    if (v === null) return null;
    const raw = trimOrNull(v);
    if (raw === "opportunities" || raw === "opportunity") return "opportunities";
    return "invalid";
}

function parseSubjectMapping(v: unknown): InstantiateWorkWorkflowSubjectMappingV1 | null {
    if (!isRecord(v)) return null;
    const mode = trimOrNull(v.mode);
    if (mode === "event_primary_entity") {
        return { mode: "event_primary_entity" };
    }
    if (mode === "path") {
        const entityType = parseSubjectEntityType(v.entity_type);
        if (entityType === "invalid") return null;
        const entityIdPath = trimOrNull(v.entity_id_path);
        if (!entityIdPath || !SAFE_PATH_PATTERN.test(entityIdPath)) return null;
        return { mode: "path", entity_type: entityType, entity_id_path: entityIdPath };
    }
    if (mode === "static") {
        const entityType = parseSubjectEntityType(v.entity_type);
        if (entityType === "invalid") return null;
        if (v.entity_id === null || v.entity_id === "") {
            return { mode: "static", entity_type: entityType, entity_id: null };
        }
        const entityId = trimOrNull(v.entity_id);
        if (!entityId) return null;
        return { mode: "static", entity_type: entityType, entity_id: entityId };
    }
    return null;
}

function reject(error: string, message: string, reason: string): ParsedInstantiateWorkWorkflowActionPayloadResult {
    return { ok: false, error, message, reason };
}

/** Parse and validate instantiate_work workflow action payload (v1). */
export function parseInstantiateWorkWorkflowActionPayload(
    body: unknown,
): ParsedInstantiateWorkWorkflowActionPayloadResult {
    if (!isRecord(body)) {
        return reject("BAD_PAYLOAD_SHAPE", "Payload must be a JSON object.", "invalid_payload_shape");
    }

    for (const key of Object.keys(body)) {
        if (!ALLOWED_PAYLOAD_KEYS.has(key)) {
            return reject("UNKNOWN_PAYLOAD_KEYS", `Unexpected payload key: ${key}`, "unknown_payload_key");
        }
    }

    const version = body.version;
    if (version !== 1) {
        return reject("VERSION_UNSUPPORTED", "Payload version must be 1.", "unsupported_version");
    }

    const workDefinitionKey = trimOrNull(body.work_definition_key);
    if (!workDefinitionKey) {
        return reject("WORK_DEFINITION_KEY_REQUIRED", "work_definition_key is required.", "missing_work_definition_key");
    }
    if (workDefinitionKey === MANUAL_AD_HOC_WORK_DEFINITION_KEY) {
        return reject(
            "WORK_DEFINITION_KEY_NOT_ALLOWED",
            "manual_ad_hoc cannot be instantiated by workflow actions.",
            "manual_ad_hoc_not_allowed",
        );
    }
    if (!isKnownWorkDefinitionKey(workDefinitionKey)) {
        return reject(
            "WORK_DEFINITION_KEY_UNKNOWN",
            "work_definition_key must be a known platform catalog key.",
            "unknown_work_definition_key",
        );
    }

    const subject = parseSubjectMapping(body.subject);
    if (!subject) {
        return reject(
            "SUBJECT_MAPPING_INVALID",
            "subject must be a valid v1 mapping (event_primary_entity, path, or static).",
            "invalid_subject_mapping",
        );
    }

    const contextSnapshot = body.context_snapshot;
    if (contextSnapshot != null && !isRecord(contextSnapshot)) {
        return reject("CONTEXT_SNAPSHOT_INVALID", "context_snapshot must be an object when provided.", "invalid_context_snapshot");
    }

    const dueAt = trimOrNull(body.due_at);
    if (dueAt && Number.isNaN(Date.parse(dueAt))) {
        return reject("DUE_AT_INVALID", "due_at must be a parseable ISO-8601 timestamp when provided.", "invalid_due_at");
    }

    const payload: InstantiateWorkWorkflowActionPayloadV1 = {
        version: 1,
        work_definition_key: workDefinitionKey,
        subject,
        on_disabled_definition: parseFailurePolicy(body.on_disabled_definition, "skip"),
        on_deduped: parseDedupedPolicy(body.on_deduped, "soft_success"),
        on_rejected: parseFailurePolicy(body.on_rejected, "fail"),
    };

    const title = trimOrNull(body.title);
    if (title) payload.title = title;
    const description = trimOrNull(body.description);
    if (description) payload.description = description;
    if (dueAt) payload.due_at = new Date(dueAt).toISOString();
    const assignee = trimOrNull(body.assigned_to_user_id);
    if (assignee) payload.assigned_to_user_id = assignee;
    if (contextSnapshot) payload.context_snapshot = contextSnapshot;
    const periodKey = trimOrNull(body.period_key);
    if (periodKey) payload.period_key = periodKey;

    return { ok: true, payload };
}
