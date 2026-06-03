import { isTaskAssistV1Uuid } from "@/lib/agent/taskAssist/taskAssistSuggestionValidators";
import { buildOperationalWorkSubjectFingerprint } from "@/lib/admin/operationalWork/operationalWorkDedupe";
import type { OperationalWorkSubject } from "@/lib/admin/operationalWork/operationalWorkTypes";
import type {
    InstantiateWorkWorkflowSubjectMappingV1,
    ResolvedInstantiateWorkWorkflowSubjectResult,
} from "@/lib/admin/operationalWork/workflowInstantiateWork/types";
import { getByPath } from "@/lib/workflowTemplate";

const ENTITY_TYPE_ALIASES: Record<string, OperationalWorkSubject["entityType"]> = {
    opportunity: "opportunities",
    opportunities: "opportunities",
};

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function normalizeOperationalEntityType(raw: unknown): OperationalWorkSubject["entityType"] | "unsupported" {
    if (raw == null || raw === "") return null;
    const key = String(raw).trim().toLowerCase();
    if (key in ENTITY_TYPE_ALIASES) return ENTITY_TYPE_ALIASES[key] ?? null;
    return "unsupported";
}

function resolveUuidFromPath(payload: Record<string, unknown>, path: string): string | null {
    const value = getByPath(payload, path);
    const trimmed = trimOrNull(value != null ? String(value) : null);
    if (!trimmed || !isTaskAssistV1Uuid(trimmed)) return null;
    return trimmed;
}

function fail(error: string, message: string, reason: string): ResolvedInstantiateWorkWorkflowSubjectResult {
    return { ok: false, error, message, reason };
}

function success(
    orgId: string,
    subject: OperationalWorkSubject,
): ResolvedInstantiateWorkWorkflowSubjectResult {
    const subjectFingerprint = buildOperationalWorkSubjectFingerprint({
        orgId,
        entityType: subject.entityType,
        entityId: subject.entityId,
    });
    return { ok: true, subject, subjectFingerprint };
}

function resolveEventPrimaryEntity(
    payload: Record<string, unknown>,
): OperationalWorkSubject | "unsupported" | "missing_id" | null {
    let entityType = normalizeOperationalEntityType(payload.entity_type);
    let entityId = trimOrNull(payload.entity_id != null ? String(payload.entity_id) : null);

    if (entityId && !isTaskAssistV1Uuid(entityId)) {
        entityId = null;
    }

    if (!entityId) {
        const opportunityId = resolveUuidFromPath(payload, "opportunity.id");
        if (opportunityId) {
            entityId = opportunityId;
            if (entityType === null) {
                entityType = "opportunities";
            }
        }
    }

    if (entityType === "unsupported") return "unsupported";
    if (entityId) {
        if (entityType !== "opportunities" && entityType !== null) return "unsupported";
        return {
            entityType: entityType ?? "opportunities",
            entityId,
        };
    }
    if (entityType === "opportunities") return "missing_id";
    return { entityType: null, entityId: null };
}

/** Resolve workflow payload + subject mapping → Operational Work subject + fingerprint. */
export function resolveInstantiateWorkWorkflowSubject(params: {
    orgId: string;
    workflowPayload: Record<string, unknown>;
    subjectMapping: InstantiateWorkWorkflowSubjectMappingV1;
}): ResolvedInstantiateWorkWorkflowSubjectResult {
    const orgId = params.orgId.trim();
    if (!orgId) {
        return fail("ORG_ID_REQUIRED", "orgId is required to resolve subject fingerprint.", "missing_org_id");
    }

    const mapping = params.subjectMapping;
    const payload = params.workflowPayload;

    if (mapping.mode === "event_primary_entity") {
        const resolved = resolveEventPrimaryEntity(payload);
        if (resolved === "unsupported") {
            return fail(
                "SUBJECT_ENTITY_UNSUPPORTED",
                "Operational work v1 supports opportunities subjects only.",
                "unsupported_entity_type",
            );
        }
        if (resolved === "missing_id") {
            return fail(
                "SUBJECT_ID_MISSING",
                "Could not resolve entity id from event primary entity.",
                "event_primary_entity_id_missing",
            );
        }
        if (!resolved) {
            return fail(
                "SUBJECT_UNRESOLVED",
                "Could not resolve subject from event primary entity.",
                "event_primary_entity_unresolved",
            );
        }
        return success(orgId, resolved);
    }

    if (mapping.mode === "path") {
        const entityId = resolveUuidFromPath(payload, mapping.entity_id_path);
        if (!entityId) {
            return fail(
                "SUBJECT_ID_MISSING",
                `Could not resolve entity id at path "${mapping.entity_id_path}".`,
                "path_entity_id_missing",
            );
        }
        if (mapping.entity_type !== "opportunities") {
            return fail(
                "SUBJECT_ENTITY_UNSUPPORTED",
                "Operational work v1 supports opportunities subjects only.",
                "unsupported_entity_type",
            );
        }
        return success(orgId, { entityType: "opportunities", entityId });
    }

    const entityId = mapping.entity_id?.trim() || null;
    if (entityId && !isTaskAssistV1Uuid(entityId)) {
        return fail("SUBJECT_ID_INVALID", "static entity_id must be a UUID when provided.", "invalid_static_entity_id");
    }
    if (mapping.entity_type !== "opportunities" && entityId) {
        return fail(
            "SUBJECT_ENTITY_UNSUPPORTED",
            "Operational work v1 supports opportunities subjects only.",
            "unsupported_entity_type",
        );
    }
    return success(orgId, {
        entityType: entityId ? mapping.entity_type : null,
        entityId,
    });
}
