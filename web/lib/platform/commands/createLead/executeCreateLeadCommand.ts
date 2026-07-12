"use client";

/**
 * Create Lead — shared client execution adapter (Command Surface V3, Phase 1).
 *
 * The single client entry point any Command Surface variant (Work Unit Actions, BOS proposal,
 * manual) uses to run Create Lead. It POSTs the command payload to
 * `POST /api/admin/actions/execute` against the registered `create_lead` action and normalizes
 * the response into the platform {@link ActionResultOk}/{@link ActionResultError} contract the
 * Create Lead command model and surface controller already consume.
 *
 * Doctrine:
 *  - **No forked mutation path.** This reuses the same execute route and registered action as
 *    the existing modal (`executeCreateLeadFromModal`); it adds no server business logic.
 *  - **Client-only normalization.** It maps the HTTP envelope to the command result shape; it
 *    does not validate, persist, or transform domain data — the server remains authoritative.
 *  - Reused by every Create Lead entry point so BOS and Work Unit converge on one lifecycle.
 *
 * @see web/lib/admin/actions/entryLifecycleActionClient.ts (canonical POST helper, reused)
 * @see docs/sprints/archive/06_2026/command_surface_v3.md
 */

import { CREATE_LEAD_ACTION_ENTITY_ID } from "@/lib/admin/actions/createLeadActionConstants";
import { CREATE_LEAD_ACTION_KEY } from "@/lib/platform/commands/createLead/createLeadRequiredInputs";
import type { ActionResult, ActionResultOk } from "@/lib/adminV2/actions/actionTypes";

export type ExecuteCreateLeadCommandInput = {
    /** Canonical create_lead payload field map (manual values or BOS-parsed values). */
    payload: Record<string, unknown>;
    departmentId?: string | null;
    workUnitId?: string | null;
    /** Physical surface for audit/analytics (e.g. "work_unit", "bos_recommendations"). */
    surface?: string;
};

type ExecuteEnvelope = {
    ok?: boolean;
    correlation_id?: string;
    data?: {
        execution_result?: Record<string, unknown> & { opportunity_id?: string; id?: string };
        affected_id?: string | null;
    };
    error?: { message?: string } | string;
};

function errorMessage(json: ExecuteEnvelope, fallback: string): string {
    if (typeof json.error === "string") return json.error || fallback;
    return json.error?.message ?? fallback;
}

/**
 * Execute Create Lead through the registered command runtime and return the standardized
 * command result. Never throws on a handled execute failure — returns an {@link ActionResultError}
 * so the surface controller can render recovery copy and preserve inputs.
 */
export async function executeCreateLeadCommand(
    input: ExecuteCreateLeadCommandInput
): Promise<ActionResult> {
    let res: Response;
    try {
        res = await fetch("/api/admin/actions/execute", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action_key: CREATE_LEAD_ACTION_KEY,
                entity_type: "opportunity",
                entity_id: CREATE_LEAD_ACTION_ENTITY_ID,
                context: {
                    surface: input.surface ?? "work_unit",
                    department_id: input.departmentId ?? null,
                    work_unit_id: input.workUnitId ?? null,
                },
                payload: input.payload,
            }),
        });
    } catch {
        return {
            ok: false,
            correlationId: "",
            status: 0,
            error: "I couldn’t reach the server to create the lead. Check your connection and try again.",
        };
    }

    const json = (await res.json().catch(() => ({}))) as ExecuteEnvelope;

    if (!res.ok || json.ok === false) {
        return {
            ok: false,
            correlationId: json.correlation_id ?? "",
            status: res.status,
            error: errorMessage(json, "I couldn’t create the lead. Review the information and try again."),
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
            actionKey: CREATE_LEAD_ACTION_KEY,
            entityType: "opportunity",
            entityId: affectedId || processingCaseId,
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
