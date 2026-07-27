/**
 * Reference implementation (Phase 4): Create Lead.
 *
 * Capture-first action: no target record exists yet. The mutation reuses the
 * canonical `executeAdminAction` / `executeCreateLeadAction` path (single source of
 * truth for record creation), so manual UI and BOS-confirmed proposals create
 * records identically.
 */

import { randomUUID } from "crypto";
import { executeAdminAction } from "@/lib/admin/actions/executeAdminAction";
import { CREATE_LEAD_ACTION_ENTITY_ID } from "@/lib/admin/actions/createLeadActionConstants";
import {
    toDelegateContext,
    type ActionResult,
    type RegisteredAction,
} from "@/lib/adminV2/actions/actionTypes";
import {
    CREATE_LEAD_ACTION_KEY,
    buildCreateLeadPreview,
    trimmedValue as trimmed,
} from "@/lib/platform/commands/createLead/createLeadRequiredInputs";
import { resolveCreateLeadEligibilityForInvocation } from "@/lib/platform/commands/createLead/resolveCreateLeadEligibilityForInvocation";

export { CREATE_LEAD_ACTION_KEY };

export const createLeadAction: RegisteredAction = {
    actionKey: CREATE_LEAD_ACTION_KEY,
    defaultLabel: "Create lead",
    description: "Create a new opportunity and household from captured contact details.",
    supportedEntityTypes: ["opportunity"],
    supportedProcessKeys: ["enrollment"],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    confirmationPolicy: "required",
    bosProposalSupport: true,

    validatePayload(payload) {
        const src = payload ?? {};
        const value: Record<string, unknown> = { ...src };
        for (const key of ["first_name", "last_name", "email", "phone"]) {
            if (src[key] != null) value[key] = trimmed(src[key]);
        }
        return { ok: true, value };
    },

    async resolveEligibility({ supabase, ctx, invocation, payload }) {
        return resolveCreateLeadEligibilityForInvocation({
            supabase,
            orgId: ctx.orgId,
            invocation,
            payload,
        });
    },

    async buildPreview({ payload }) {
        return buildCreateLeadPreview(payload);
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        const delegated = await executeAdminAction(
            supabase,
            { orgId: ctx.orgId, userId: ctx.userId ?? undefined, accessScope: ctx.accessScope },
            {
                actionKey: CREATE_LEAD_ACTION_KEY,
                entityType: "opportunity",
                entityId: CREATE_LEAD_ACTION_ENTITY_ID,
                context: toDelegateContext(invocation.context),
                payload,
            }
        );
        if (!delegated.ok) {
            return {
                ok: false,
                correlationId: delegated.correlation_id ?? correlationId,
                status: delegated.status,
                error: delegated.error,
                completionRequirements: delegated.completion_requirements,
                actionPreflight: delegated.action_preflight,
            };
        }
        const exec = delegated.execution_result ?? {};
        const opportunityId = trimmed((exec as Record<string, unknown>).opportunity_id) || null;
        return {
            ok: true,
            correlationId: delegated.correlation_id ?? correlationId,
            result: {
                actionKey: CREATE_LEAD_ACTION_KEY,
                entityType: "opportunity",
                entityId: opportunityId ?? "",
                affectedId: opportunityId,
                detail: exec as Record<string, unknown>,
            },
        };
    },
};
