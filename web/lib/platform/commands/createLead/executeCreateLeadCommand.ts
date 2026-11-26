"use client";

/**
 * Create Lead — shared client execution adapter (Command Surface V3, Phase 1).
 *
 * Delegates to {@link executePlatformCommandViaActionsApi} so BOS and Work Unit
 * share one path into `POST /api/admin/actions/execute` → Command Runtime.
 */

import { CREATE_LEAD_ACTION_ENTITY_ID } from "@/lib/admin/actions/createLeadActionConstants";
import { CREATE_LEAD_ACTION_KEY } from "@/lib/platform/commands/createLead/createLeadRequiredInputs";
import type { ActionResult } from "@/lib/adminV2/actions/actionTypes";
import { executePlatformCommandViaActionsApi } from "@/lib/platform/commands/runtime/executePlatformCommandViaActionsApi";

export type ExecuteCreateLeadCommandInput = {
    /** Canonical create_lead payload field map (manual values or BOS-parsed values). */
    payload: Record<string, unknown>;
    departmentId?: string | null;
    workUnitId?: string | null;
    /** Physical surface for audit/analytics (e.g. "work_unit", "bos_recommendations"). */
    surface?: string;
};

/**
 * Execute Create Lead through the registered command runtime and return the standardized
 * command result. Never throws on a handled execute failure — returns an {@link ActionResultError}
 * so the surface controller can render recovery copy and preserve inputs.
 */
export async function executeCreateLeadCommand(
    input: ExecuteCreateLeadCommandInput
): Promise<ActionResult> {
    return executePlatformCommandViaActionsApi({
        commandKey: CREATE_LEAD_ACTION_KEY,
        entityType: "opportunity",
        entityId: CREATE_LEAD_ACTION_ENTITY_ID,
        payload: input.payload,
        departmentId: input.departmentId,
        workUnitId: input.workUnitId,
        surface: input.surface ?? "work_unit",
        origin:
            (input.surface ?? "").includes("bos") || input.surface === "bos_recommendations"
                ? "bos"
                : "operator_ui",
        networkErrorMessage:
            "I couldn’t reach the server to create the lead. Check your connection and try again.",
        failureErrorMessage:
            "I couldn’t create the lead. Review the information and try again.",
    });
}
