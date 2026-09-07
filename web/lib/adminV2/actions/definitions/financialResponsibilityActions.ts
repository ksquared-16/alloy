/**
 * Registered actions for who owes what: `billing.configure_responsibility`,
 * `billing.resolve_responsibility`, `billing.reallocate_responsibility`,
 * `billing.configure_expected_funding`, `billing.attribute_payment`.
 *
 * ── TWO AUTHORITIES, DELIBERATELY SEPARATED ──
 *
 * Deciding WHO is responsible is `fin.responsibility` — a new grant, because moving a contractual
 * position between two real people changes nothing about the total owed and everything about who
 * owes it, which neither `fin.write` (bill what was authored) nor `fin.adjust` (forgive what is
 * owed) describes. RESOLVING an existing arrangement over a charge is ordinary billing work and
 * stays `fin.write`: it runs the machine, it decides nothing.
 *
 * ── WHAT NO CALLER MAY SEND ──
 *
 * Not the net, and not an assigned amount. Those are derived server-side from the charge and its
 * Thread 10 reductions; a payload carrying one is REFUSED rather than ignored, because a client
 * that could state the allocatable net could quietly make a family responsible for a number nobody
 * billed them.
 */

import { randomUUID } from "crypto";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import { configureResponsibilityArrangement } from "@/lib/financials/responsibility/arrangementService";
import { configureExpectedFunding } from "@/lib/financials/responsibility/expectedFundingService";
import { attributePaymentToResponsibility } from "@/lib/financials/responsibility/paymentAttributionService";
import { resolveAllocatableNet } from "@/lib/financials/responsibility/resolveAllocatableNet";
import { ResponsibilityError, resolveChargeResponsibility } from "@/lib/financials/responsibility/responsibilityService";
import type { SupabaseClient } from "@supabase/supabase-js";

export const BILLING_CONFIGURE_RESPONSIBILITY_ACTION_KEY = "billing.configure_responsibility";
export const BILLING_RESOLVE_RESPONSIBILITY_ACTION_KEY = "billing.resolve_responsibility";
export const BILLING_REALLOCATE_RESPONSIBILITY_ACTION_KEY = "billing.reallocate_responsibility";
export const BILLING_CONFIGURE_EXPECTED_FUNDING_ACTION_KEY = "billing.configure_expected_funding";
export const BILLING_ATTRIBUTE_PAYMENT_ACTION_KEY = "billing.attribute_payment";

/** Deciding who owes. */
export const BILLING_RESPONSIBILITY_PERMISSION = "fin.responsibility" as const;
/** Running the machine over what was already decided. */
export const BILLING_RESOLVE_PERMISSION = "fin.write" as const;

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

/** The server owns the money. A caller naming any of these has misunderstood the boundary. */
const SERVER_OWNED_FIELDS = ["net_cents", "allocatable_net_cents", "assigned_amount_cents", "gross_cents", "reductions_cents"];

async function permitted(
    supabase: SupabaseClient,
    orgId: string,
    userId: string | null | undefined,
    key: string,
): Promise<boolean> {
    const grants = await resolveActorPermissionGrants(supabase, orgId, userId ?? null);
    return (grants.permissionKeys ?? []).includes(key);
}

function denied(correlationId: string, key: string, code: string): ActionResult {
    return {
        ok: false,
        correlationId,
        status: 403,
        error: `This requires ${key}.`,
        blockers: [{ code, message: "Permission required." }],
    };
}

function failed(correlationId: string, err: unknown, fallback: string): ActionResult {
    const code = err instanceof ResponsibilityError ? err.code : fallback;
    const message = err instanceof Error ? err.message : fallback;
    return { ok: false, correlationId, status: 400, error: message, blockers: [{ code, message }] };
}

// ── CONFIGURE ────────────────────────────────────────────────────────────────────────────────

const configureResponsibility: RegisteredAction = {
    actionKey: BILLING_CONFIGURE_RESPONSIBILITY_ACTION_KEY,
    defaultLabel: "Configure responsibility",
    description: "Record which named parties contractually bear a family's obligations, from a date.",
    supportedEntityTypes: ["child", "person", "opportunity_customer_member", "opportunity"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const blockers: Array<{ code: string; message: string; field?: string }> = [];
        if (!t(payload?.customer_id)) {
            blockers.push({ code: "missing_account", message: "Name the account this arrangement is for.", field: "customer_id" });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(t(payload?.effective_start))) {
            blockers.push({ code: "invalid_effective_start", message: "Name the date this arrangement starts.", field: "effective_start" });
        }
        const shares = Array.isArray(payload?.shares) ? (payload!.shares as unknown[]) : [];
        if (shares.length === 0) {
            blockers.push({ code: "no_shares", message: "An arrangement must name at least one responsible party.", field: "shares" });
        }
        const sent = SERVER_OWNED_FIELDS.filter((f) => payload && f in payload);
        if (sent.length > 0) {
            blockers.push({
                code: "server_owned_amount",
                message:
                    `What there is to allocate is derived from the charge and its reductions, never from the caller `
                    + `(${sent.join(", ")}).`,
                field: sent[0],
            });
        }
        return blockers.length > 0 ? { ok: false, blockers } : { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ supabase, ctx }) {
        const ok = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, BILLING_RESPONSIBILITY_PERMISSION);
        return {
            eligible: ok,
            blockers: ok ? [] : [{ code: "responsibility_permission_required", message: `Requires ${BILLING_RESPONSIBILITY_PERMISSION}.` }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    /** The division, before anyone is made responsible for it. */
    async buildPreview({ payload }) {
        const shares = (Array.isArray(payload?.shares) ? payload!.shares : []) as Array<Record<string, unknown>>;
        return {
            summary: `${shares.length} responsible ${shares.length === 1 ? "party" : "parties"} from ${t(payload?.effective_start)}.`,
            changes: shares.map((s) =>
                s.method === "percentage"
                    ? `${Number(s.percent_basis_points ?? 0) / 100}% · ${t(s.responsible_party_id)}`
                    : s.method === "fixed"
                      ? `$${(Number(s.amount_cents ?? 0) / 100).toFixed(2)} · ${t(s.responsible_party_id)}`
                      : `remainder · ${t(s.responsible_party_id)}`,
            ),
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, BILLING_RESPONSIBILITY_PERMISSION))) {
            return denied(correlationId, BILLING_RESPONSIBILITY_PERMISSION, "responsibility_permission_required");
        }
        try {
            const shares = (payload!.shares as Array<Record<string, unknown>>).map((s) => ({
                responsiblePartyId: t(s.responsible_party_id),
                method: t(s.method) as "percentage" | "fixed" | "remainder",
                percentBasisPoints: s.percent_basis_points == null ? null : Number(s.percent_basis_points),
                amountCents: s.amount_cents == null ? null : Number(s.amount_cents),
                priority: s.priority == null ? null : Number(s.priority),
            }));
            const result = await configureResponsibilityArrangement(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                customerId: t(payload?.customer_id),
                customerMemberId: t(payload?.customer_member_id) || null,
                opportunityCustomerMemberId: t(payload?.opportunity_customer_member_id) || null,
                effectiveStart: t(payload?.effective_start),
                effectiveEnd: t(payload?.effective_end) || null,
                shares,
                sourceKey: t(payload?.source_key) || null,
                sourceReference: t(payload?.source_reference) || null,
                actorUserId: ctx.userId ?? null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: BILLING_CONFIGURE_RESPONSIBILITY_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId) || result.arrangementId,
                    affectedId: result.arrangementId,
                    detail: { arrangement_id: result.arrangementId, superseded_id: result.supersededId, shares: result.shares },
                },
            };
        } catch (err) {
            return failed(correlationId, err, "configure_failed");
        }
    },
};

// ── RESOLVE / REALLOCATE ─────────────────────────────────────────────────────────────────────

function resolveAction(key: string, allowReallocation: boolean): RegisteredAction {
    const permission = allowReallocation ? BILLING_RESPONSIBILITY_PERMISSION : BILLING_RESOLVE_PERMISSION;
    return {
        actionKey: key,
        defaultLabel: allowReallocation ? "Reallocate responsibility" : "Resolve responsibility",
        description: allowReallocation
            ? "Move a posted charge's responsibility onto the arrangement now in force, with lineage."
            : "Divide a charge's net between the parties the arrangement in force names.",
        supportedEntityTypes: ["child", "person", "opportunity_customer_member", "opportunity"],
        supportedProcessKeys: [],
        requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
        audit: { eventType: "action_executed", category: "record", mutates: true },
        bosProposalSupport: false,
        confirmationPolicy: "none",

        validatePayload(payload) {
            const blockers: Array<{ code: string; message: string; field?: string }> = [];
            if (!t(payload?.charge_id)) {
                blockers.push({ code: "missing_charge", message: "Name the charge to divide.", field: "charge_id" });
            }
            if (allowReallocation && t(payload?.reason).length < 3) {
                blockers.push({
                    code: "reason_required",
                    message: "Say why responsibility is moving. This changes what one real person owes another.",
                    field: "reason",
                });
            }
            const sent = SERVER_OWNED_FIELDS.filter((f) => payload && f in payload);
            if (sent.length > 0) {
                blockers.push({
                    code: "server_owned_amount",
                    message: `The allocatable net is derived from the charge, never from the caller (${sent.join(", ")}).`,
                    field: sent[0],
                });
            }
            return blockers.length > 0 ? { ok: false, blockers } : { ok: true, value: payload ?? {} };
        },

        async resolveEligibility({ supabase, ctx }) {
            const ok = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, permission);
            return {
                eligible: ok,
                blockers: ok ? [] : [{ code: "responsibility_permission_required", message: `Requires ${permission}.` }],
                availableTransitions: [],
                requiredInputs: [],
            };
        },

        /** What there is to divide, read from the charge itself — never from the caller. */
        async buildPreview({ supabase, ctx, payload }) {
            try {
                const net = await resolveAllocatableNet(supabase as SupabaseClient, {
                    orgId: ctx.orgId,
                    chargeId: t(payload?.charge_id),
                });
                return {
                    summary: `$${(net.netCents / 100).toFixed(2)} to divide.`,
                    changes: [
                        `Gross $${(net.grossCents / 100).toFixed(2)}`,
                        `Reductions $${(net.reductionsCents / 100).toFixed(2)}`,
                        ...net.reductions.map((r) => `· ${r.explanation ?? "reduction"}`),
                    ],
                };
            } catch (err) {
                return { summary: err instanceof Error ? err.message : "Nothing to divide.", changes: [] };
            }
        },

        async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
            const correlationId = randomUUID();
            if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, permission))) {
                return denied(correlationId, permission, "responsibility_permission_required");
            }
            try {
                const outcome = await resolveChargeResponsibility(supabase as SupabaseClient, {
                    orgId: ctx.orgId,
                    chargeId: t(payload?.charge_id),
                    actorUserId: ctx.userId ?? null,
                    allowReallocation,
                    reallocationReason: allowReallocation ? t(payload?.reason) : null,
                });
                return {
                    ok: true,
                    correlationId,
                    result: {
                        actionKey: key,
                        entityType: invocation.entityType,
                        entityId: t(invocation.entityId) || t(payload?.charge_id),
                        affectedId: t(payload?.charge_id),
                        detail: { ...outcome },
                    },
                };
            } catch (err) {
                return failed(correlationId, err, "resolve_failed");
            }
        },
    };
}

// ── FUNDING + ATTRIBUTION ────────────────────────────────────────────────────────────────────

const configureFunding: RegisteredAction = {
    actionKey: BILLING_CONFIGURE_EXPECTED_FUNDING_ACTION_KEY,
    defaultLabel: "Configure expected funding",
    description: "Record where a responsible party's share is expected to be funded from. Not a payment.",
    supportedEntityTypes: ["child", "person", "opportunity_customer_member"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const blockers: Array<{ code: string; message: string; field?: string }> = [];
        if (!t(payload?.share_id) && !t(payload?.allocation_id)) {
            blockers.push({
                code: "missing_anchor",
                message: "Expected funding attaches to a responsibility share or allocation.",
                field: "share_id",
            });
        }
        if (!t(payload?.funding_source_label)) {
            blockers.push({ code: "missing_source_label", message: "Name the funding source.", field: "funding_source_label" });
        }
        if (!t(payload?.funding_source_type)) {
            blockers.push({ code: "missing_source_type", message: "Say what kind of funding this is.", field: "funding_source_type" });
        }
        return blockers.length > 0 ? { ok: false, blockers } : { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ supabase, ctx }) {
        const ok = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, BILLING_RESPONSIBILITY_PERMISSION);
        return {
            eligible: ok,
            blockers: ok ? [] : [{ code: "responsibility_permission_required", message: `Requires ${BILLING_RESPONSIBILITY_PERMISSION}.` }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    async buildPreview({ payload }) {
        return {
            summary: `Expected from ${t(payload?.funding_source_label)} — not a payment, and it reduces nothing owed.`,
            changes: [],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, BILLING_RESPONSIBILITY_PERMISSION))) {
            return denied(correlationId, BILLING_RESPONSIBILITY_PERMISSION, "responsibility_permission_required");
        }
        try {
            const result = await configureExpectedFunding(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                shareId: t(payload?.share_id) || null,
                allocationId: t(payload?.allocation_id) || null,
                arrangementId: t(payload?.arrangement_id) || null,
                fundingSourceType: t(payload?.funding_source_type) as never,
                fundingSourceLabel: t(payload?.funding_source_label),
                fundingSourceReference: t(payload?.funding_source_reference) || null,
                basis: (t(payload?.basis) || "fixed_amount") as "percentage" | "fixed_amount",
                percentBasisPoints: payload?.percent_basis_points == null ? null : Number(payload.percent_basis_points),
                expectedAmountCents: payload?.expected_amount_cents == null ? null : Number(payload.expected_amount_cents),
                effectiveStart: t(payload?.effective_start) || null,
                effectiveEnd: t(payload?.effective_end) || null,
                idempotencyKey: t(payload?.idempotency_key) || `fef:${correlationId}`,
                actorUserId: ctx.userId ?? null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: BILLING_CONFIGURE_EXPECTED_FUNDING_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId) || result.fundingId,
                    affectedId: result.fundingId,
                    detail: { funding_id: result.fundingId, idempotent: result.idempotent },
                },
            };
        } catch (err) {
            return failed(correlationId, err, "funding_failed");
        }
    },
};

const attributePayment: RegisteredAction = {
    actionKey: BILLING_ATTRIBUTE_PAYMENT_ACTION_KEY,
    defaultLabel: "Attribute payment to responsibility",
    description: "Explain whose share a payment application satisfied. Reduces nothing on its own.",
    supportedEntityTypes: ["child", "person", "opportunity_customer_member"],
    supportedProcessKeys: [],
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const blockers: Array<{ code: string; message: string; field?: string }> = [];
        if (!t(payload?.payment_allocation_id)) {
            blockers.push({ code: "missing_application", message: "Name the payment application.", field: "payment_allocation_id" });
        }
        if (!t(payload?.responsibility_allocation_id)) {
            blockers.push({ code: "missing_allocation", message: "Name the responsibility it satisfied.", field: "responsibility_allocation_id" });
        }
        const amount = Number(payload?.amount_cents);
        if (!Number.isInteger(amount) || amount <= 0) {
            blockers.push({ code: "invalid_amount", message: "An attribution is a whole, positive number of cents.", field: "amount_cents" });
        }
        return blockers.length > 0 ? { ok: false, blockers } : { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ supabase, ctx }) {
        const ok = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, BILLING_RESOLVE_PERMISSION);
        return {
            eligible: ok,
            blockers: ok ? [] : [{ code: "billing_permission_required", message: `Requires ${BILLING_RESOLVE_PERMISSION}.` }],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    async buildPreview({ payload }) {
        return {
            summary: `Explains $${(Number(payload?.amount_cents ?? 0) / 100).toFixed(2)} of an application. Moves no balance.`,
            changes: [],
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId, BILLING_RESOLVE_PERMISSION))) {
            return denied(correlationId, BILLING_RESOLVE_PERMISSION, "billing_permission_required");
        }
        try {
            const result = await attributePaymentToResponsibility(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                paymentAllocationId: t(payload?.payment_allocation_id),
                responsibilityAllocationId: t(payload?.responsibility_allocation_id),
                amountCents: Number(payload?.amount_cents),
                idempotencyKey: t(payload?.idempotency_key) || `pra:${correlationId}`,
                actorUserId: ctx.userId ?? null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: BILLING_ATTRIBUTE_PAYMENT_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId) || result.attributionId,
                    affectedId: result.attributionId,
                    detail: { attribution_id: result.attributionId, idempotent: result.idempotent },
                },
            };
        } catch (err) {
            return failed(correlationId, err, "attribution_failed");
        }
    },
};

export const financialResponsibilityActions: RegisteredAction[] = [
    configureResponsibility,
    resolveAction(BILLING_RESOLVE_RESPONSIBILITY_ACTION_KEY, false),
    resolveAction(BILLING_REALLOCATE_RESPONSIBILITY_ACTION_KEY, true),
    configureFunding,
    attributePayment,
];
