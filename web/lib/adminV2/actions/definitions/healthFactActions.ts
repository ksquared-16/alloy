/**
 * H4 — the registered Health mutation capabilities.
 *
 * Three operator intents over the one canonical seam: assert a fact, correct it, end it. They add
 * exactly two things `healthFactService` deliberately does not have — an operator-facing SUBJECT (a
 * child, not a polymorphic entity pair) and an operator-facing INTENT — and delegate everything
 * else: supersession, the successor-first ordering, provenance and append-only history.
 *
 * ── D-H6 IS ENFORCED BENEATH, NOT HERE ──
 *
 * Each adapter passes the caller's real grants to the service, which refuses without
 * `health.manage`. The check is not repeated in this file, because a second copy is a second thing
 * to keep in agreement — and the first time they disagreed, the laxer one would be the one guarding
 * the write.
 *
 * ── TRUST PROPOSES; THIS WRITES ──
 *
 * When Processing/Trust interprets a form response into a health fact, it emits a proposal and the
 * proposal is applied THROUGH these capabilities. Forms, Trust and the card therefore converge on
 * one writer rather than three implementations of supersession.
 */

import { randomUUID } from "crypto";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { getAdminAccessContextCached } from "@/lib/admin/getAdminAccessContext";
import { HealthAccessDeniedError } from "@/lib/health/healthAccess";
import {
    addHealthFact,
    editHealthFact,
    endHealthFact,
    HealthFactError,
} from "@/lib/health/healthFactService";
import { isHealthFactKind, type HealthFactKind } from "@/lib/health/healthFactModel";
import type { SupabaseClient } from "@supabase/supabase-js";

export const HEALTH_FACT_ADD_ACTION_KEY = "health_fact.add";
export const HEALTH_FACT_EDIT_ACTION_KEY = "health_fact.edit";
export const HEALTH_FACT_END_ACTION_KEY = "health_fact.end";

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function childIdFrom(payload: Record<string, unknown> | undefined, entityId: string | undefined): string {
    return t(payload?.customer_member_id) || t(payload?.child_id) || t(entityId);
}

/**
 * The caller's real grants.
 *
 * Resolved per invocation rather than trusted from the payload — a payload-supplied permission set
 * would be an authorization the caller granted themselves.
 */
async function accessForCaller(): Promise<{ permissionKeys: readonly string[] | null }> {
    const access = await getAdminAccessContextCached();
    // A failed access resolution denies: null is not an empty grant set.
    return { permissionKeys: access.ok ? access.permissionKeys : null };
}

function mapError(err: unknown, correlationId: string): ActionResult {
    if (err instanceof HealthAccessDeniedError) {
        return { ok: false, correlationId, status: 403, error: err.message };
    }
    if (err instanceof HealthFactError) {
        const status = err.code === "not_found" ? 404 : err.code === "invalid_input" ? 400 : 409;
        return { ok: false, correlationId, status, error: err.message };
    }
    return {
        ok: false,
        correlationId,
        status: 500,
        error: err instanceof Error ? err.message : "The health record could not be updated.",
    };
}

const BASE: Pick<
    RegisteredAction,
    "supportedEntityTypes" | "supportedProcessKeys" | "requiredContext" | "audit" | "bosProposalSupport"
> = {
    supportedEntityTypes: ["opportunity_customer_member", "child", "person"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: true, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
};

const addFact: RegisteredAction = {
    ...BASE,
    actionKey: HEALTH_FACT_ADD_ACTION_KEY,
    defaultLabel: "Add health fact",
    description: "Record an allergy, condition, medication or immunization for a child.",
    confirmationPolicy: "none",

    validatePayload(payload) {
        const src = payload ?? {};
        if (!isHealthFactKind(src.fact_kind)) {
            return {
                ok: false,
                blockers: [
                    { code: "missing_fact_kind", message: "Choose what kind of health fact this is.", field: "fact_kind" },
                ],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ payload, invocation }) {
        const childId = childIdFrom(payload, invocation?.entityId);
        return {
            eligible: Boolean(childId),
            blockers: childId ? [] : [{ code: "missing_child", message: "A child is required." }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    async buildPreview({ payload }) {
        return {
            summary: `Record ${t(payload?.fact_kind) || "health fact"} for ${t(payload?.child_label) || "this child"}`,
            changes: ["A new health fact is asserted. Nothing existing is overwritten."],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const row = await addHealthFact(supabase as SupabaseClient, {
                access: await accessForCaller(),
                orgId: ctx.orgId,
                subjectEntityType: "customer_member",
                subjectEntityId: childIdFrom(payload, invocation.entityId),
                factKind: payload.fact_kind as HealthFactKind,
                payload: (payload.payload ?? {}) as Record<string, unknown>,
                // An operator asserting a fact IS the provenance. It is never inferred.
                sourceKind: "operator",
                sourceRef: t(payload.source_ref) || null,
                relatedFactId: t(payload.related_fact_id) || null,
                effectiveFrom: t(payload.effective_from) || null,
                actorUserId: ctx.userId ?? null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: HEALTH_FACT_ADD_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: childIdFrom(payload, invocation.entityId),
                    affectedId: row.id,
                    detail: { fact_kind: row.fact_kind },
                },
            };
        } catch (err) {
            return mapError(err, correlationId);
        }
    },
};

const editFact: RegisteredAction = {
    ...BASE,
    actionKey: HEALTH_FACT_EDIT_ACTION_KEY,
    defaultLabel: "Correct health fact",
    description: "Correct a health fact. The original is superseded, never overwritten.",
    confirmationPolicy: "none",

    validatePayload(payload) {
        const src = payload ?? {};
        if (!t(src.fact_id)) {
            return {
                ok: false,
                blockers: [{ code: "missing_fact", message: "A health fact is required.", field: "fact_id" }],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ payload }) {
        const factId = t(payload?.fact_id);
        return {
            eligible: Boolean(factId),
            blockers: factId ? [] : [{ code: "missing_fact", message: "A health fact is required." }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    async buildPreview() {
        return {
            summary: "Correct this health fact",
            changes: ["A corrected fact is recorded and the original is superseded — the history survives."],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const { created } = await editHealthFact(supabase as SupabaseClient, {
                access: await accessForCaller(),
                orgId: ctx.orgId,
                factId: t(payload.fact_id),
                payload: (payload.payload ?? {}) as Record<string, unknown>,
                sourceKind: "operator",
                sourceRef: t(payload.source_ref) || null,
                relatedFactId: t(payload.related_fact_id) || null,
                actorUserId: ctx.userId ?? null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: HEALTH_FACT_EDIT_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: childIdFrom(payload, invocation.entityId),
                    affectedId: created.id,
                    detail: { supersedes: created.supersedes_id },
                },
            };
        } catch (err) {
            return mapError(err, correlationId);
        }
    },
};

const endFact: RegisteredAction = {
    ...BASE,
    actionKey: HEALTH_FACT_END_ACTION_KEY,
    defaultLabel: "End health fact",
    description: "Record that a health fact no longer applies. Never a deletion.",
    confirmationPolicy: "none",

    validatePayload(payload) {
        const src = payload ?? {};
        if (!t(src.fact_id)) {
            return {
                ok: false,
                blockers: [{ code: "missing_fact", message: "A health fact is required.", field: "fact_id" }],
            };
        }
        return { ok: true, value: src };
    },

    async resolveEligibility({ payload }) {
        const factId = t(payload?.fact_id);
        return {
            eligible: Boolean(factId),
            blockers: factId ? [] : [{ code: "missing_fact", message: "A health fact is required." }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    async buildPreview() {
        return {
            summary: "End this health fact",
            changes: ["The fact is closed with an end date. The record stays and says when it stopped applying."],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        try {
            const row = await endHealthFact(supabase as SupabaseClient, {
                access: await accessForCaller(),
                orgId: ctx.orgId,
                factId: t(payload.fact_id),
                effectiveTo: t(payload.effective_to) || null,
                reason: t(payload.reason) || null,
                actorUserId: ctx.userId ?? null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: HEALTH_FACT_END_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: childIdFrom(payload, invocation.entityId),
                    affectedId: row.id,
                    detail: { status: row.status, effective_to: row.effective_to },
                },
            };
        } catch (err) {
            return mapError(err, correlationId);
        }
    },
};

export const healthFactActions: RegisteredAction[] = [addFact, editFact, endFact];
