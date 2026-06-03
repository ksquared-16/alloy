import type { SupabaseClient } from "@supabase/supabase-js";

import { instantiateWorkFromDefinition } from "@/lib/admin/operationalWork/instantiateWorkFromDefinition";
import type {
    InstantiateWorkResult,
    OperationalWorkContextSnapshot,
} from "@/lib/admin/operationalWork/operationalWorkTypes";
import {
    buildInstantiateWorkWorkflowActionOutputs,
    formatInstantiateWorkWorkflowActionLog,
    type InstantiateWorkWorkflowActionOutputs,
} from "@/lib/admin/operationalWork/workflowInstantiateWork/instantiateWorkWorkflowActionOutputs";
import { parseInstantiateWorkWorkflowActionPayload } from "@/lib/admin/operationalWork/workflowInstantiateWork/parseInstantiateWorkWorkflowActionPayload";
import { resolveInstantiateWorkWorkflowSubject } from "@/lib/admin/operationalWork/workflowInstantiateWork/resolveInstantiateWorkWorkflowSubject";
import type { InstantiateWorkWorkflowActionPayloadV1 } from "@/lib/admin/operationalWork/workflowInstantiateWork/types";
import {
    buildWorkflowInstantiateOperationalProvenance,
    resolveWorkflowInstantiateActor,
    WORKFLOW_INSTANTIATE_ACTOR_UNAVAILABLE_MESSAGE,
} from "@/lib/admin/operationalWork/workflowInstantiateWork/workflowInstantiateWorkActorPolicy";
import { renderTemplate } from "@/lib/workflowTemplate";

export type ExecuteInstantiateWorkWorkflowActionParams = {
    supabase: SupabaseClient;
    orgId: string;
    workflowId: string;
    workflowRunId: string;
    eventId?: string | null;
    actionOrder: number;
    workflowActionId?: string | null;
    actionPayload: Record<string, unknown>;
    workflowPayload: Record<string, unknown>;
};

export type ExecuteInstantiateWorkWorkflowActionResult = {
    status: "completed" | "skipped";
    log: string;
    skipReason?: string;
    outputs: InstantiateWorkWorkflowActionOutputs;
};

export type { InstantiateWorkWorkflowActionOutputs };

export {
    resolveWorkflowInstantiateActor,
    resolveWorkflowInstantiateUserId,
    WORKFLOW_INSTANTIATE_ACTOR_UNAVAILABLE_MESSAGE,
} from "@/lib/admin/operationalWork/workflowInstantiateWork/workflowInstantiateWorkActorPolicy";

function trimOrNull(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s || null;
}

function renderOptionalTemplate(value: string | undefined, workflowPayload: Record<string, unknown>): string | undefined {
    if (!value?.trim()) return undefined;
    return renderTemplate(value, workflowPayload).trim() || undefined;
}

function buildWorkflowInstantiateContextSnapshot(params: {
    workflowPayload: Record<string, unknown>;
    actionContextSnapshot?: Record<string, unknown>;
}): OperationalWorkContextSnapshot | undefined {
    const out: OperationalWorkContextSnapshot = {};
    const base = params.actionContextSnapshot ?? {};

    if (Array.isArray(base.readiness_gap_ids)) {
        const ids = base.readiness_gap_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
        if (ids.length) out.readiness_gap_ids = ids;
    }
    if (Array.isArray(base.attention_reason_codes)) {
        const codes = base.attention_reason_codes.filter(
            (code): code is string => typeof code === "string" && code.trim().length > 0,
        );
        if (codes.length) out.attention_reason_codes = codes;
    }

    const stageKey =
        trimOrNull(base.lifecycle_stage_key) ??
        trimOrNull(params.workflowPayload.lifecycle_stage_key) ??
        trimOrNull(params.workflowPayload.new_status_key);
    if (stageKey) out.lifecycle_stage_key = stageKey;

    const eventType = trimOrNull(params.workflowPayload.event_type);
    if (eventType) out.event_type = eventType;

    return Object.keys(out).length ? out : undefined;
}

function failInstantiateWorkAction(message: string): never {
    throw new Error(`instantiate_work: ${message}`);
}

function handleServiceResult(
    parsed: InstantiateWorkWorkflowActionPayloadV1,
    result: InstantiateWorkResult,
    subjectFingerprint: string,
): ExecuteInstantiateWorkWorkflowActionResult {
    if (result.status === "created" || result.status === "aggregated") {
        const outputs = buildInstantiateWorkWorkflowActionOutputs({ parsed, result, subjectFingerprint });
        return { status: "completed", log: formatInstantiateWorkWorkflowActionLog(outputs), outputs };
    }

    if (result.status === "deduped") {
        if (parsed.on_deduped === "fail") {
            failInstantiateWorkAction(`deduped open work exists (${result.existingWork.id})`);
        }
        const outputs = buildInstantiateWorkWorkflowActionOutputs({ parsed, result, subjectFingerprint });
        return { status: "completed", log: formatInstantiateWorkWorkflowActionLog(outputs), outputs };
    }

    if (result.error === "WORK_DEFINITION_NOT_AVAILABLE") {
        if (parsed.on_disabled_definition === "fail") {
            failInstantiateWorkAction(result.message || "work definition not available");
        }
        const outputs = buildInstantiateWorkWorkflowActionOutputs({
            parsed,
            result,
            subjectFingerprint,
            outcomeOverride: "skipped",
        });
        return {
            status: "skipped",
            skipReason: result.reason || "definition_not_available",
            log: formatInstantiateWorkWorkflowActionLog(outputs),
            outputs,
        };
    }

    if (parsed.on_rejected === "skip") {
        const outputs = buildInstantiateWorkWorkflowActionOutputs({
            parsed,
            result,
            subjectFingerprint,
            outcomeOverride: "skipped",
        });
        return {
            status: "skipped",
            skipReason: result.reason || "instantiate_rejected",
            log: formatInstantiateWorkWorkflowActionLog(outputs),
            outputs,
        };
    }

    const outputs = buildInstantiateWorkWorkflowActionOutputs({ parsed, result, subjectFingerprint });
    failInstantiateWorkAction(outputs.message || outputs.error || "instantiate rejected");
}

/** Execute instantiate_work workflow action via operational work service chain. */
export async function executeInstantiateWorkWorkflowAction(
    params: ExecuteInstantiateWorkWorkflowActionParams,
): Promise<ExecuteInstantiateWorkWorkflowActionResult> {
    const orgId = params.orgId.trim();
    if (!orgId) {
        failInstantiateWorkAction("orgId is required");
    }

    const parsed = parseInstantiateWorkWorkflowActionPayload(params.actionPayload);
    if (!parsed.ok) {
        failInstantiateWorkAction(`${parsed.error}: ${parsed.message}`);
    }
    const action = parsed.payload;

    const subjectResolved = resolveInstantiateWorkWorkflowSubject({
        orgId,
        workflowPayload: params.workflowPayload,
        subjectMapping: action.subject,
    });
    if (!subjectResolved.ok) {
        failInstantiateWorkAction(`${subjectResolved.error}: ${subjectResolved.message}`);
    }

    const actor = resolveWorkflowInstantiateActor(params.workflowPayload);
    if (!actor.ok) {
        failInstantiateWorkAction(actor.message);
    }

    const provenance = buildWorkflowInstantiateOperationalProvenance({
        workflowRunId: params.workflowRunId,
        workflowId: params.workflowId,
        actionOrder: params.actionOrder,
        workflowActionId: params.workflowActionId,
        eventId: params.eventId,
        eventType: trimOrNull(params.workflowPayload.event_type),
        actorUserId: actor.actorUserId,
        executorUserId: actor.executorUserId,
        executorSource: actor.executorSource,
        subjectMapping: action.subject,
        actionPayloadVersion: action.version,
    });

    const contextSnapshot = buildWorkflowInstantiateContextSnapshot({
        workflowPayload: params.workflowPayload,
        actionContextSnapshot: action.context_snapshot,
    });

    const stageKey = contextSnapshot?.lifecycle_stage_key ?? trimOrNull(params.workflowPayload.new_status_key);

    const result = await instantiateWorkFromDefinition({
        supabase: params.supabase,
        orgId,
        userId: actor.executorUserId,
        workDefinitionKey: action.work_definition_key,
        subject: subjectResolved.subject,
        subjectFingerprint: subjectResolved.subjectFingerprint,
        provenance,
        contextSnapshot,
        description: renderOptionalTemplate(action.description, params.workflowPayload) ?? null,
        titleOverride: renderOptionalTemplate(action.title, params.workflowPayload),
        dueAtOverride: renderOptionalTemplate(action.due_at, params.workflowPayload),
        assigneeOverride: action.assigned_to_user_id?.trim() || undefined,
        periodKey: renderOptionalTemplate(action.period_key, params.workflowPayload) ?? null,
        resolveParams: stageKey ? { stageKey } : undefined,
    });

    return handleServiceResult(action, result, subjectResolved.subjectFingerprint);
}
