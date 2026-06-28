/**
 * Reference implementation (Phase 3): Update Status.
 *
 * Generic case-grain status change for opportunities. Enrollment is the first
 * consumer but the contract is not enrollment-specific.
 *
 * Eligibility + transition validation reuse the canonical status modules
 * (status_definitions, status_transition_rules). The mutation reuses the canonical
 * `updateOpportunityStatusWithEvent` helper so we never fork the status-write path.
 */

import { randomUUID } from "crypto";
import { assertAllowedStatusKey } from "@/lib/admin/statusDefinitionsResolve";
import { validateOpportunityStatusTransitionForAction } from "@/lib/admin/actions/entryLifecycleActions";
import { updateOpportunityStatusWithEvent } from "@/lib/opportunities/updateOpportunityStatusWithEvent";
import { emitEvent } from "@/lib/emitEvent";
import {
    eligible,
    toDelegateContext,
    type ActionBlocker,
    type ActionHandlerDeps,
    type ActionRequiredInput,
    type ActionResult,
    type RegisteredAction,
} from "@/lib/adminV2/actions/actionTypes";
import {
    loadOpportunityStatusContext,
    resolveAvailableStatusTransitions,
    resolveStatusTransitionBlockers,
} from "@/lib/adminV2/actions/actionEligibility";

export const UPDATE_STATUS_ACTION_KEY = "update_status";

function trimmed(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function targetStatusKey(payload: Record<string, unknown>): string {
    return trimmed(payload.status_key) || trimmed(payload.target_status_key);
}

export const updateStatusAction: RegisteredAction = {
    actionKey: UPDATE_STATUS_ACTION_KEY,
    defaultLabel: "Update status",
    description: "Move a record to a configured status, validated server-side against transition rules.",
    supportedEntityTypes: ["opportunity"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: true, requiresOpportunity: true, requiresCustomer: false },
    audit: { eventType: "opportunity_status_changed", category: "status_lifecycle", mutates: true },
    confirmationPolicy: "required",
    bosProposalSupport: true,

    validatePayload(payload) {
        const value: Record<string, unknown> = { ...(payload ?? {}) };
        const sk = targetStatusKey(value);
        if (sk) value.status_key = sk;
        return { ok: true, value };
    },

    async resolveEligibility({ supabase, ctx, invocation, payload }) {
        const context = await loadOpportunityStatusContext(supabase, ctx.orgId, invocation.entityId);
        if (!context.found) {
            return eligible({
                eligible: false,
                blockers: [{ code: "not_found", message: "Record not found in this organization." }],
            });
        }

        const { options } = await resolveAvailableStatusTransitions(
            supabase,
            ctx.orgId,
            "opportunity",
            context.statusKey
        );

        const requiredInputs: ActionRequiredInput[] = [
            {
                key: "status_key",
                label: "New status",
                type: "status",
                required: true,
                options: options.map((o) => ({ value: o.key, label: o.label })),
            },
            {
                key: "note",
                label: "Note",
                type: "textarea",
                required: false,
                hint: "Optional context recorded with the change.",
            },
        ];

        const target = targetStatusKey(payload);
        if (!target) {
            // No destination chosen yet — eligible to open, operator must pick a status.
            return eligible({ eligible: options.length > 0, availableTransitions: options, requiredInputs });
        }

        const blockers = await resolveStatusTransitionBlockers({
            supabase,
            orgId: ctx.orgId,
            entityType: "opportunity",
            entityId: invocation.entityId,
            actionKey: invocation.actionKey,
            fromStatusKey: context.statusKey,
            toStatusKey: target,
            departmentId: invocation.context?.department_id ?? null,
            workUnitId: invocation.context?.work_unit_id ?? context.workUnitId,
            metadata: context.metadata,
            payload,
        });

        return eligible({
            eligible: blockers.length === 0,
            blockers,
            availableTransitions: options,
            requiredInputs,
        });
    },

    async buildPreview({ supabase, ctx, invocation, payload }) {
        const context = await loadOpportunityStatusContext(supabase, ctx.orgId, invocation.entityId);
        const { definitions } = await resolveAvailableStatusTransitions(
            supabase,
            ctx.orgId,
            "opportunity",
            context.statusKey
        );
        const labelFor = (key: string | null): string => {
            if (!key) return "(none)";
            return definitions.find((d) => d.status_key === key)?.status_label?.trim() || key;
        };
        const target = targetStatusKey(payload);
        const fromLabel = labelFor(context.statusKey);
        const toLabel = labelFor(target || null);
        return {
            summary: target
                ? `Change status from ${fromLabel} to ${toLabel}.`
                : "Choose a new status for this record.",
            changes: target ? [`status_key: ${context.statusKey ?? "(none)"} → ${target}`] : [],
            before: { status_key: context.statusKey },
            after: target ? { status_key: target } : null,
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        const entityId = invocation.entityId.trim();
        const target = targetStatusKey(payload);
        if (!entityId) {
            return { ok: false, correlationId, status: 400, error: "A record is required to update status." };
        }
        if (!target) {
            return {
                ok: false,
                correlationId,
                status: 400,
                error: "A new status is required.",
                blockers: [{ code: "missing_required_input", message: "Select a new status.", field: "status_key" }],
            };
        }

        const transition = await validateOpportunityStatusTransitionForAction(
            supabase,
            { orgId: ctx.orgId, userId: ctx.userId ?? undefined, accessScope: ctx.accessScope },
            {
                actionKey: invocation.actionKey,
                entityId,
                toStatusKey: target,
                merged: payload,
                context: toDelegateContext(invocation.context),
            }
        );
        if (!transition.ok) {
            const blockers: ActionBlocker[] = [
                { code: "transition_blocked", message: transition.error, field: "status_key" },
            ];
            return { ok: false, correlationId, status: transition.status, error: transition.error, blockers };
        }

        const allowed = await assertAllowedStatusKey(supabase, ctx.orgId, "opportunities", target);
        if (!allowed.ok) {
            return {
                ok: false,
                correlationId,
                status: 400,
                error: allowed.message,
                blockers: [{ code: "invalid_transition", message: allowed.message, field: "status_key" }],
            };
        }

        const note = trimmed(payload.note);
        const { error } = await updateOpportunityStatusWithEvent({
            supabase,
            orgId: ctx.orgId,
            opportunityId: entityId,
            newStatusKey: target,
            previousStatusKey: transition.oldStatusKey,
            actorUserId: ctx.userId ?? null,
            eventMetadata: {
                source: "action_runtime",
                action_key: invocation.actionKey,
                ...(note ? { note } : {}),
            },
            normalizeContext: "actionRuntime:update_status",
        });
        if (error) {
            return { ok: false, correlationId, status: 400, error: error.message };
        }

        try {
            await emitEvent({
                org_id: ctx.orgId,
                event_type: "action_executed",
                entity_type: "opportunity",
                entity_id: entityId,
                payload: { action_key: invocation.actionKey, actor_user_id: ctx.userId ?? null, new_status_key: target },
            });
        } catch (e) {
            console.warn("[updateStatusAction] action_executed emit failed", e);
        }

        return {
            ok: true,
            correlationId,
            result: {
                actionKey: invocation.actionKey,
                entityType: "opportunity",
                entityId,
                affectedId: entityId,
                detail: { old_status_key: transition.oldStatusKey, new_status_key: target },
            },
        };
    },
};
