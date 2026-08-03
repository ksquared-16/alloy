/**
 * Shared BOS / Command Surface client → Command Runtime bridge.
 *
 * All conversational and operator Command Surfaces POST through
 * `/api/admin/actions/execute`, which delegates facade-supported keys to
 * `executeCommandInvocation` exactly once. This helper does not invent executors.
 */

import type { ActionResult, ActionResultOk } from "@/lib/adminV2/actions/actionTypes";

export type ExecutePlatformCommandViaActionsApiInput = {
    commandKey: string;
    entityType: string;
    entityId: string;
    payload?: Record<string, unknown>;
    departmentId?: string | null;
    workUnitId?: string | null;
    surface?: string | null;
    /** Defaults to bos — server maps origin into Command Runtime. */
    origin?: "bos" | "operator_ui" | "automation" | "workflow";
    mode?: "preview" | "execute";
    confirmation?: { confirmed: boolean; confirmationValue?: string };
    previewToken?: string;
    /** Operator-facing network/failure copy. */
    networkErrorMessage?: string;
    failureErrorMessage?: string;
};

type ExecuteEnvelope = {
    ok?: boolean;
    correlation_id?: string;
    data?: {
        execution_result?: Record<string, unknown> & {
            opportunity_id?: string;
            id?: string;
            processing_case_id?: string;
            mode?: string;
        };
        affected_id?: string | null;
    };
    error?: { message?: string } | string;
};

function errorMessage(json: ExecuteEnvelope, fallback: string): string {
    if (typeof json.error === "string") return json.error || fallback;
    return json.error?.message ?? fallback;
}

export async function executePlatformCommandViaActionsApi(
    input: ExecutePlatformCommandViaActionsApiInput
): Promise<ActionResult> {
    const networkError =
        input.networkErrorMessage ??
        "I couldn’t reach the server to run this Command. Check your connection and try again.";
    const failureError =
        input.failureErrorMessage ??
        "I couldn’t run this Command. Review the information and try again.";

    let res: Response;
    try {
        res = await fetch("/api/admin/actions/execute", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action_key: input.commandKey,
                entity_type: input.entityType,
                entity_id: input.entityId,
                mode: input.mode ?? "execute",
                context: {
                    surface: input.surface ?? "bos_recommendations",
                    department_id: input.departmentId ?? null,
                    work_unit_id: input.workUnitId ?? null,
                    origin: input.origin ?? "bos",
                },
                payload: input.payload ?? {},
                confirmation: input.confirmation,
                preview_token: input.previewToken,
            }),
        });
    } catch {
        return {
            ok: false,
            correlationId: "",
            status: 0,
            error: networkError,
        };
    }

    const json = (await res.json().catch(() => ({}))) as ExecuteEnvelope;
    if (!res.ok || json.ok === false) {
        return {
            ok: false,
            correlationId: json.correlation_id ?? "",
            status: res.status,
            error: errorMessage(json, failureError),
        };
    }

    const detail = json.data?.execution_result ?? {};
    const mode = detail.mode != null ? String(detail.mode).trim() : "";
    const processingCaseId =
        detail.processing_case_id != null ? String(detail.processing_case_id).trim() : "";
    const affectedId =
        (json.data?.affected_id != null ? String(json.data.affected_id).trim() : "") ||
        (detail.opportunity_id != null ? String(detail.opportunity_id).trim() : "") ||
        (detail.id != null ? String(detail.id).trim() : "");

    const result: ActionResultOk = {
        ok: true,
        correlationId: json.correlation_id ?? "",
        result: {
            actionKey: input.commandKey,
            entityType: input.entityType,
            entityId: affectedId || processingCaseId || input.entityId,
            affectedId: affectedId || null,
            detail: {
                ...detail,
                mode: mode || undefined,
                processing_case_id: processingCaseId || undefined,
            },
        },
    };
    return result;
}
