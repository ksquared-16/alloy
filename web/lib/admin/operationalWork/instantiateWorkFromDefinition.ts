import type { SupabaseClient } from "@supabase/supabase-js";

import { buildInstantiateRequestFromDefinition } from "@/lib/admin/operationalWork/buildInstantiateRequestFromDefinition";
import { instantiateWork, type InstantiateWorkRequest } from "@/lib/admin/operationalWork/operationalWorkService";
import type {
    InstantiateWorkResult,
    OperationalWorkContextSnapshot,
    OperationalWorkInstantiateProvenance,
    OperationalWorkSubject,
} from "@/lib/admin/operationalWork/operationalWorkTypes";
import {
    fetchOpportunityRecordOwnerUserId,
} from "@/lib/admin/operationalWork/workDefinitionAssigneeResolution";
import type { ResolveWorkDefinitionsParams } from "@/lib/admin/operationalWork/workDefinitionTypes";
import { resolveWorkDefinition } from "@/lib/admin/operationalWork/resolveWorkDefinition";

export type InstantiateWorkFromDefinitionParams = {
    supabase: SupabaseClient;
    orgId: string;
    userId: string;
    workDefinitionKey: string;
    subject?: OperationalWorkSubject;
    subjectFingerprint?: string;
    provenance: OperationalWorkInstantiateProvenance;
    contextSnapshot?: OperationalWorkContextSnapshot;
    description?: string | null;
    titleOverride?: string;
    dueAtOverride?: string;
    assigneeOverride?: string | null;
    periodKey?: string | null;
    idempotencyKey?: string;
    proposalId?: string | null;
    metadata?: Record<string, unknown> | null;
    /** Lifecycle metadata + stage for definition resolution. */
    resolveParams?: ResolveWorkDefinitionsParams;
    now?: Date;
};

function rejectFromDefinition(
    error: string,
    message: string,
    reason: string,
): Extract<InstantiateWorkResult, { status: "rejected" }> {
    return { status: "rejected", error, message, reason, dedupeKey: null };
}

/**
 * Resolve a Work Definition and instantiate runtime work via Phase A authority.
 * Does not write directly to operational_tasks.
 */
export async function instantiateWorkFromDefinition(
    params: InstantiateWorkFromDefinitionParams,
): Promise<InstantiateWorkResult> {
    const orgId = params.orgId?.trim();
    const userId = params.userId?.trim();
    const workDefinitionKey = params.workDefinitionKey?.trim();

    if (!orgId) return rejectFromDefinition("ORG_ID_REQUIRED", "orgId is required.", "missing_org_id");
    if (!userId) return rejectFromDefinition("USER_ID_REQUIRED", "userId is required.", "missing_user_id");
    if (!workDefinitionKey) {
        return rejectFromDefinition("DEFINITION_KEY_REQUIRED", "workDefinitionKey is required.", "missing_definition_key");
    }
    if (!params.provenance?.source) {
        return rejectFromDefinition("PROVENANCE_REQUIRED", "provenance.source is required.", "missing_provenance");
    }

    const definition = resolveWorkDefinition(workDefinitionKey, params.resolveParams ?? {});
    if (!definition) {
        return rejectFromDefinition(
            "WORK_DEFINITION_NOT_AVAILABLE",
            "Work definition is unknown, disabled, or not available for this context.",
            "definition_not_available",
        );
    }

    let recordOwnerUserId: string | null | undefined = undefined;
    const subject = params.subject ?? { entityType: null, entityId: null };
    const needsRecordOwner =
        params.assigneeOverride === undefined &&
        definition.assignee_policy.kind === "record_owner" &&
        subject.entityType === "opportunities" &&
        subject.entityId?.trim();

    if (needsRecordOwner) {
        recordOwnerUserId = await fetchOpportunityRecordOwnerUserId({
            supabase: params.supabase,
            orgId,
            opportunityId: subject.entityId!.trim(),
        });
    }

    const built = buildInstantiateRequestFromDefinition({
        definition,
        orgId,
        userId,
        subject,
        subjectFingerprint: params.subjectFingerprint,
        provenance: params.provenance,
        contextSnapshot: params.contextSnapshot,
        description: params.description,
        titleOverride: params.titleOverride,
        dueAtOverride: params.dueAtOverride,
        assigneeOverride: params.assigneeOverride,
        recordOwnerUserId,
        periodKey: params.periodKey,
        idempotencyKey: params.idempotencyKey,
        proposalId: params.proposalId,
        metadata: params.metadata,
        now: params.now,
    });

    if (!built.ok) {
        return rejectFromDefinition(built.error, built.message, built.reason);
    }

    const request: InstantiateWorkRequest = {
        ...built.request,
        supabase: params.supabase,
    };

    return instantiateWork(request);
}
