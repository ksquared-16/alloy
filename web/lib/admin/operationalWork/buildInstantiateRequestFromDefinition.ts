import { buildOperationalWorkSubjectFingerprint } from "@/lib/admin/operationalWork/operationalWorkDedupe";
import type { InstantiateWorkRequest } from "@/lib/admin/operationalWork/operationalWorkService";
import type {
    OperationalWorkContextSnapshot,
    OperationalWorkInstantiateProvenance,
    OperationalWorkSubject,
} from "@/lib/admin/operationalWork/operationalWorkTypes";
import { resolveAssigneeFromWorkDefinitionPolicy } from "@/lib/admin/operationalWork/workDefinitionAssigneeResolution";
import { resolveDueAtFromWorkDefinitionPolicy } from "@/lib/admin/operationalWork/workDefinitionDueResolution";
import type { EffectiveWorkDefinition } from "@/lib/admin/operationalWork/workDefinitionTypes";

export type BuildInstantiateRequestFromDefinitionParams = {
    definition: EffectiveWorkDefinition;
    orgId: string;
    userId: string;
    subject?: OperationalWorkSubject;
    subjectFingerprint?: string;
    provenance: OperationalWorkInstantiateProvenance;
    contextSnapshot?: OperationalWorkContextSnapshot;
    description?: string | null;
    titleOverride?: string;
    dueAtOverride?: string;
    assigneeOverride?: string | null;
    /** Pre-fetched record owner for record_owner assignee policy. */
    recordOwnerUserId?: string | null;
    periodKey?: string | null;
    idempotencyKey?: string;
    proposalId?: string | null;
    metadata?: Record<string, unknown> | null;
    now?: Date;
};

export type BuildInstantiateRequestFromDefinitionResult =
    | { ok: true; request: Omit<InstantiateWorkRequest, "supabase"> }
    | { ok: false; error: string; message: string; reason: string };

function trimOrNull(v: string | null | undefined): string | null {
    if (v == null) return null;
    const s = v.trim();
    return s || null;
}

function normalizeSubject(subject?: OperationalWorkSubject): OperationalWorkSubject {
    const entityId = trimOrNull(subject?.entityId ?? null);
    return {
        entityType: entityId ? subject?.entityType ?? null : null,
        entityId,
    };
}

export function isSubjectAllowedForWorkDefinition(
    definition: EffectiveWorkDefinition,
    subject: OperationalWorkSubject,
): boolean {
    const entityId = subject.entityId?.trim() || null;
    if (!entityId) {
        return definition.allowed_subjects.some((allowed) => allowed.entity_type === null);
    }
    return definition.allowed_subjects.some(
        (allowed) => allowed.entity_type === subject.entityType && allowed.entity_type != null,
    );
}

/** Map EffectiveWorkDefinition → InstantiateWorkRequest (without supabase). */
export function buildInstantiateRequestFromDefinition(
    params: BuildInstantiateRequestFromDefinitionParams,
): BuildInstantiateRequestFromDefinitionResult {
    const orgId = params.orgId.trim();
    const userId = params.userId.trim();
    const subject = normalizeSubject(params.subject);

    if (!isSubjectAllowedForWorkDefinition(params.definition, subject)) {
        return {
            ok: false,
            error: "SUBJECT_NOT_ALLOWED",
            message: "Work definition does not allow this subject.",
            reason: "subject_not_allowed",
        };
    }

    const title = trimOrNull(params.titleOverride) ?? trimOrNull(params.definition.default_title);
    if (!title) {
        return {
            ok: false,
            error: "TITLE_REQUIRED",
            message: "title is required.",
            reason: "missing_title",
        };
    }

    const dueResolved = resolveDueAtFromWorkDefinitionPolicy({
        duePolicy: params.definition.due_policy,
        dueAtOverride: params.dueAtOverride,
        now: params.now,
    });
    if (!dueResolved.ok) {
        return {
            ok: false,
            error: dueResolved.error,
            message: dueResolved.message,
            reason: "invalid_due_at",
        };
    }

    const assignedToUserId = resolveAssigneeFromWorkDefinitionPolicy({
        assigneePolicy: params.definition.assignee_policy,
        userId,
        recordOwnerUserId: params.recordOwnerUserId,
        assigneeOverride: params.assigneeOverride,
    });

    const subjectFingerprint = buildOperationalWorkSubjectFingerprint({
        orgId,
        entityType: subject.entityType,
        entityId: subject.entityId,
        subjectFingerprint: params.subjectFingerprint,
    });

    const provenance: OperationalWorkInstantiateProvenance = {
        ...params.provenance,
        created_by_user_id: params.provenance.created_by_user_id ?? userId,
        idempotency_key: params.provenance.idempotency_key ?? trimOrNull(params.idempotencyKey) ?? undefined,
    };

    return {
        ok: true,
        request: {
            orgId,
            userId,
            workDefinitionKey: params.definition.key,
            shape: params.definition.default_shape,
            category: params.definition.category,
            title,
            description: params.description ?? null,
            subject,
            subjectFingerprint,
            assignedToUserId,
            dueAt: dueResolved.dueAt,
            provenance,
            contextSnapshot: params.contextSnapshot,
            idempotencyKey: trimOrNull(params.idempotencyKey) ?? undefined,
            dedupePolicy: params.definition.dedupe_policy,
            periodKey: trimOrNull(params.periodKey),
            proposalId: trimOrNull(params.proposalId),
            suggestedActionKeys: params.definition.suggested_action_keys,
            metadata: params.metadata ?? null,
        },
    };
}
