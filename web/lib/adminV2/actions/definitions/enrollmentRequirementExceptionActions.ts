/**
 * Registered actions: `enrollment.requirement_exception.grant` and `.revoke`.
 *
 * The minimum operator interaction the governed exception needs, expressed through the same action
 * runtime every other operator intent already uses — not a waiver workspace, not a second command
 * surface, not a settings page.
 *
 * ── AUTHORIZATION IS ENFORCED BENEATH, NOT HERE ──
 *
 * Each adapter passes the caller's real grants to the service, which refuses without
 * `enrollment.requirement_exception.manage`. The check is not repeated in this file: a second copy
 * is a second thing to keep in agreement, and the laxer one would be the one guarding the write.
 *
 * ── THE SUBJECT IS THE PARTICIPATION ──
 *
 * `entityId` is the Enrollment Participation (`opportunity_customer_members.id`) — the durable
 * Enrollment subject. The payload states the stage and the exact requirement, because
 * `requirement_id` is stable only within its stage.
 *
 * @see web/lib/enrollment/completion/requirementExceptionService.ts
 */

import { randomUUID } from "crypto";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import type { RequirementExceptionIdentity } from "@/lib/enrollment/completion/requirementException";
import {
    grantRequirementException,
    revokeRequirementException,
} from "@/lib/enrollment/completion/requirementExceptionService";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ENROLLMENT_REQUIREMENT_EXCEPTION_GRANT_ACTION_KEY = "enrollment.requirement_exception.grant";
export const ENROLLMENT_REQUIREMENT_EXCEPTION_REVOKE_ACTION_KEY = "enrollment.requirement_exception.revoke";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function identityFrom(
    payload: Record<string, unknown> | undefined,
    orgId: string,
    entityId: string | undefined,
): RequirementExceptionIdentity {
    return {
        orgId,
        participationId: t(payload?.enrollment_participation_id) || t(entityId),
        stageKey: t(payload?.stage_key),
        requirementId: t(payload?.requirement_id),
    };
}

const BASE: Pick<
    RegisteredAction,
    "supportedEntityTypes" | "supportedProcessKeys" | "requiredContext" | "audit" | "bosProposalSupport"
> = {
    supportedEntityTypes: ["opportunity_customer_member", "child"],
    supportedProcessKeys: ["enrollment"],
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
};

/** A refusal from the service is an operator-readable message, and 403 when it is authorization. */
function refuse(refusal: { code: string; detail: string }, correlationId: string): ActionResult {
    const status = refusal.code === "requirement_exception_permission_required"
        ? 403
        : refusal.code.startsWith("missing_")
            ? 400
            : 500;
    return { ok: false, correlationId, status, error: refusal.detail };
}

const grantAction: RegisteredAction = {
    ...BASE,
    actionKey: ENROLLMENT_REQUIREMENT_EXCEPTION_GRANT_ACTION_KEY,
    defaultLabel: "Except this requirement",
    description:
        "Record that one Enrollment requirement does not apply to this child. The requirement stays visibly outstanding and separately excepted — nothing is marked submitted.",
    // An exception is a decision about one family's paperwork. It is confirmed, not clicked past.
    confirmationPolicy: "required",

    validatePayload(payload) {
        const src = payload ?? {};
        const blockers = [];
        if (!t(src.requirement_id)) {
            blockers.push({ code: "missing_requirement", message: "Choose the requirement to except.", field: "requirement_id" });
        }
        if (!t(src.stage_key)) {
            blockers.push({ code: "missing_stage", message: "The requirement's stage is required.", field: "stage_key" });
        }
        if (!t(src.reason)) {
            blockers.push({ code: "missing_reason", message: "State why this requirement is excepted.", field: "reason" });
        }
        if (blockers.length) return { ok: false, blockers };
        return { ok: true, value: src };
    },

    async resolveEligibility({ payload, invocation }) {
        const subject = t(payload?.enrollment_participation_id) || t(invocation?.entityId);
        return {
            eligible: Boolean(subject),
            blockers: subject ? [] : [{ code: "missing_subject", message: "An Enrollment participation is required." }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    async buildPreview({ payload }) {
        return {
            summary: `Except "${t(payload?.requirement_id) || "this requirement"}" for this enrolment`,
            changes: [
                "The requirement stops blocking completion.",
                "Its own status is unchanged — it stays outstanding, and separately excepted.",
                "No form submission is created.",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        const client = supabase as SupabaseClient;
        const identity = identityFrom(payload, ctx.orgId, invocation.entityId);
        const outcome = await grantRequirementException(client, {
            actor: {
                permissionKeys: (await resolveActorPermissionGrants(client, ctx.orgId, ctx.userId)).permissionKeys,
                userId: ctx.userId ?? null,
            },
            identity,
            reason: t(payload?.reason),
        });
        if (!outcome.ok) return refuse(outcome.refusal, correlationId);
        return {
            ok: true,
            correlationId,
            result: {
                actionKey: ENROLLMENT_REQUIREMENT_EXCEPTION_GRANT_ACTION_KEY,
                entityType: invocation.entityType,
                entityId: identity.participationId,
                affectedId: outcome.record.id,
                // `changed: false` is the retry answer — the decision already stood.
                detail: { requirement_id: identity.requirementId, stage_key: identity.stageKey, changed: outcome.changed },
            },
        };
    },
};

const revokeAction: RegisteredAction = {
    ...BASE,
    actionKey: ENROLLMENT_REQUIREMENT_EXCEPTION_REVOKE_ACTION_KEY,
    defaultLabel: "Withdraw this exception",
    description:
        "Withdraw a requirement exception. If the requirement is still outstanding it blocks completion again from this moment.",
    confirmationPolicy: "required",

    validatePayload(payload) {
        const src = payload ?? {};
        const blockers = [];
        if (!t(src.requirement_id)) {
            blockers.push({ code: "missing_requirement", message: "Choose the exception to withdraw.", field: "requirement_id" });
        }
        if (!t(src.stage_key)) {
            blockers.push({ code: "missing_stage", message: "The requirement's stage is required.", field: "stage_key" });
        }
        if (blockers.length) return { ok: false, blockers };
        return { ok: true, value: src };
    },

    async resolveEligibility({ payload, invocation }) {
        const subject = t(payload?.enrollment_participation_id) || t(invocation?.entityId);
        return {
            eligible: Boolean(subject),
            blockers: subject ? [] : [{ code: "missing_subject", message: "An Enrollment participation is required." }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    async buildPreview({ payload }) {
        return {
            summary: `Withdraw the exception on "${t(payload?.requirement_id) || "this requirement"}"`,
            changes: [
                "The requirement blocks completion again if it is still outstanding.",
                "The withdrawn exception is kept, with who withdrew it and when.",
            ],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        const client = supabase as SupabaseClient;
        const identity = identityFrom(payload, ctx.orgId, invocation.entityId);
        const outcome = await revokeRequirementException(client, {
            actor: {
                permissionKeys: (await resolveActorPermissionGrants(client, ctx.orgId, ctx.userId)).permissionKeys,
                userId: ctx.userId ?? null,
            },
            identity,
            reason: t(payload?.reason) || null,
        });
        if (!outcome.ok) return refuse(outcome.refusal, correlationId);
        return {
            ok: true,
            correlationId,
            result: {
                actionKey: ENROLLMENT_REQUIREMENT_EXCEPTION_REVOKE_ACTION_KEY,
                entityType: invocation.entityType,
                entityId: identity.participationId,
                affectedId: outcome.record?.id ?? null,
                detail: { requirement_id: identity.requirementId, stage_key: identity.stageKey, changed: outcome.changed },
            },
        };
    },
};

export const enrollmentRequirementExceptionActions: RegisteredAction[] = [grantAction, revokeAction];
