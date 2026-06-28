/**
 * Reference implementation (Phase 1.2): Confirm Tour.
 *
 * confirm_tour is an operational action (it confirms a tour booking), so per doctrine
 * it is registered. The mutation reuses the canonical `executeAdminAction` confirm_tour
 * handler (which resolves the active booking and calls `confirmTourBooking`), so manual
 * UI, queue, drawer, and BOS all execute through the same runtime.
 */

import { randomUUID } from "crypto";
import { executeAdminAction } from "@/lib/admin/actions/executeAdminAction";
import {
    eligible,
    toDelegateContext,
    type ActionResult,
    type RegisteredAction,
} from "@/lib/adminV2/actions/actionTypes";

export const CONFIRM_TOUR_ACTION_KEY = "confirm_tour";

function trimmed(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

export const confirmTourAction: RegisteredAction = {
    actionKey: CONFIRM_TOUR_ACTION_KEY,
    defaultLabel: "Confirm tour",
    description: "Confirm the active tour booking for this record.",
    supportedEntityTypes: ["opportunity"],
    supportedProcessKeys: ["enrollment"],
    requiredContext: { requiresEntityId: true, requiresOpportunity: true, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "workflow", mutates: true },
    confirmationPolicy: "required",
    bosProposalSupport: true,

    validatePayload(payload) {
        const src = payload ?? {};
        const value: Record<string, unknown> = { ...src };
        if (src.booking_id != null) value.booking_id = trimmed(src.booking_id);
        return { ok: true, value };
    },

    async resolveEligibility({ invocation }) {
        // The active-booking check is enforced authoritatively at execute; eligibility
        // only requires a target record so the runtime can proceed to the booking lookup.
        const hasRecord = Boolean(invocation.entityId.trim());
        return eligible({
            eligible: hasRecord,
            blockers: hasRecord
                ? []
                : [{ code: "missing_entity", message: "A record is required to confirm a tour." }],
        });
    },

    async buildPreview() {
        return {
            summary: "Confirm the active tour booking for this record.",
            changes: ["Tour booking → confirmed"],
            before: null,
            after: null,
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        const delegated = await executeAdminAction(
            supabase,
            { orgId: ctx.orgId, userId: ctx.userId ?? undefined, accessScope: ctx.accessScope },
            {
                actionKey: CONFIRM_TOUR_ACTION_KEY,
                entityType: "opportunity",
                entityId: invocation.entityId,
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
            };
        }
        const exec = delegated.execution_result ?? {};
        const bookingId = trimmed((exec as Record<string, unknown>).booking_id) || null;
        return {
            ok: true,
            correlationId: delegated.correlation_id ?? correlationId,
            result: {
                actionKey: CONFIRM_TOUR_ACTION_KEY,
                entityType: "opportunity",
                entityId: invocation.entityId,
                affectedId: bookingId,
                detail: exec as Record<string, unknown>,
            },
        };
    },
};
