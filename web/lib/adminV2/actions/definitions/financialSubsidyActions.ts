/**
 * Registered actions for subsidy: agency and programme configuration, authorization, claim build
 * and submission, remittance advice, settlement, reconciliation and variance resolution.
 *
 * All of them run under `fin.subsidy` — a fourth financial authority, because recording an
 * authorization, submitting a claim and reconciling a remittance change what the provider expects
 * from an agency and, under the approved policy, what a family is asked to pay this month. None of
 * that is billing (`fin.write`), forgiving (`fin.adjust`) or reassigning (`fin.responsibility`).
 *
 * ── WHAT NO CALLER MAY SEND ──
 *
 * Not an outstanding, not a collectible amount, not a suppression. Those are derived by
 * `resolveFamilyCollectible` from Thread 8's outstanding and submitted claim lines; a payload
 * carrying one is REFUSED, because a client that could state a family's collectible amount could
 * decide what a family is asked to pay.
 */

import { randomUUID } from "crypto";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import { resolveFamilyCollectible } from "@/lib/financials/subsidy/resolveFamilyCollectible";
import {
    reconcileRemittance,
    recordRemittanceAdvice,
    resolveSubsidyVariance,
    settleRemittanceWithPayment,
    VARIANCE_RESOLUTIONS,
    type VarianceResolution,
} from "@/lib/financials/subsidy/remittanceService";
import {
    buildSubsidyClaim,
    recordSubsidyAuthorization,
    submitSubsidyClaim,
    SubsidyError,
    upsertFundingAgency,
    upsertSubsidyProgram,
} from "@/lib/financials/subsidy/subsidyService";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SUBSIDY_PERMISSION = "fin.subsidy" as const;
export const SUBSIDY_ACTION_KEYS = {
    configureAgency: "subsidy.configure_agency",
    configureProgram: "subsidy.configure_program",
    recordAuthorization: "subsidy.record_authorization",
    buildClaim: "subsidy.build_claim",
    submitClaim: "subsidy.submit_claim",
    recordRemittance: "subsidy.record_remittance",
    settleRemittance: "subsidy.settle_remittance",
    reconcileRemittance: "subsidy.reconcile_remittance",
    resolveVariance: "subsidy.resolve_variance",
} as const;

/** The server owns every one of these. A caller naming one has misunderstood the boundary. */
const SERVER_OWNED_FIELDS = [
    "outstanding_cents",
    "collectible_cents",
    "currently_collectible_cents",
    "suppression_cents",
    "expected_subsidy_cents",
];

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

async function permitted(supabase: SupabaseClient, orgId: string, userId: string | null | undefined): Promise<boolean> {
    const grants = await resolveActorPermissionGrants(supabase, orgId, userId ?? null);
    return (grants.permissionKeys ?? []).includes(SUBSIDY_PERMISSION);
}

function serverOwnedBlockers(payload: Record<string, unknown> | undefined) {
    const sent = SERVER_OWNED_FIELDS.filter((f) => payload && f in payload);
    return sent.length === 0
        ? []
        : [
              {
                  code: "server_owned_amount",
                  message:
                      `What a family currently owes is derived from the posted charge, its payments and the `
                      + `claims actually submitted — never from the caller (${sent.join(", ")}).`,
                  field: sent[0],
              },
          ];
}

function failed(correlationId: string, err: unknown, fallback: string): ActionResult {
    const code = err instanceof SubsidyError ? err.code : fallback;
    const message = err instanceof Error ? err.message : fallback;
    return { ok: false, correlationId, status: 400, error: message, blockers: [{ code, message }] };
}

/** Every subsidy action shares one shape: same permission, same refusal, same audit. */
function subsidyAction(config: {
    key: string;
    label: string;
    description: string;
    validate: (payload: Record<string, unknown> | undefined) => Array<{ code: string; message: string; field?: string }>;
    preview: (payload: Record<string, unknown> | undefined) => { summary: string; changes: string[] };
    run: (
        supabase: SupabaseClient,
        ctx: { orgId: string; userId: string | null | undefined },
        payload: Record<string, unknown>,
    ) => Promise<{ affectedId: string | null; detail: Record<string, unknown> }>;
}): RegisteredAction {
    return {
        actionKey: config.key,
        defaultLabel: config.label,
        description: config.description,
        supportedEntityTypes: ["child", "person", "opportunity_customer_member", "opportunity"],
        supportedProcessKeys: [],
        requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
        audit: { eventType: "action_executed", category: "record", mutates: true },
        bosProposalSupport: false,
        confirmationPolicy: "none",

        validatePayload(payload) {
            const blockers = [...config.validate(payload), ...serverOwnedBlockers(payload)];
            return blockers.length > 0 ? { ok: false, blockers } : { ok: true, value: payload ?? {} };
        },

        async resolveEligibility({ supabase, ctx }) {
            const ok = await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId);
            return {
                eligible: ok,
                blockers: ok ? [] : [{ code: "subsidy_permission_required", message: `Requires ${SUBSIDY_PERMISSION}.` }],
                availableTransitions: [],
                requiredInputs: [],
            };
        },

        async buildPreview({ payload }) {
            return config.preview(payload);
        },

        async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
            const correlationId = randomUUID();
            if (!(await permitted(supabase as SupabaseClient, ctx.orgId, ctx.userId))) {
                return {
                    ok: false,
                    correlationId,
                    status: 403,
                    error: `This requires ${SUBSIDY_PERMISSION}.`,
                    blockers: [{ code: "subsidy_permission_required", message: "Permission required." }],
                };
            }
            try {
                const outcome = await config.run(
                    supabase as SupabaseClient,
                    { orgId: ctx.orgId, userId: ctx.userId },
                    payload ?? {},
                );
                return {
                    ok: true,
                    correlationId,
                    result: {
                        actionKey: config.key,
                        entityType: invocation.entityType,
                        entityId: t(invocation.entityId) || (outcome.affectedId ?? config.key),
                        affectedId: outcome.affectedId,
                        detail: outcome.detail,
                    },
                };
            } catch (err) {
                return failed(correlationId, err, "subsidy_failed");
            }
        },
    };
}

const requireFields = (payload: Record<string, unknown> | undefined, fields: Array<[string, string]>) =>
    fields
        .filter(([field]) => !t(payload?.[field]))
        .map(([field, message]) => ({ code: `missing_${field}`, message, field }));

export const financialSubsidyActions: RegisteredAction[] = [
    subsidyAction({
        key: SUBSIDY_ACTION_KEYS.configureAgency,
        label: "Configure funding agency",
        description: "Record a funder with a stable identity, so it can be a payer and a remittance can reconcile to it.",
        validate: (p) => requireFields(p, [["agency_key", "Name a stable key for the agency."], ["name", "Name the agency."]]),
        preview: (p) => ({ summary: `Funding agency ${t(p?.name)}.`, changes: [] }),
        run: async (supabase, ctx, payload) => {
            const result = await upsertFundingAgency(supabase, {
                orgId: ctx.orgId,
                agencyKey: t(payload.agency_key),
                name: t(payload.name),
                jurisdiction: t(payload.jurisdiction) || null,
                externalReference: t(payload.external_reference) || null,
                actorUserId: ctx.userId ?? null,
            });
            return { affectedId: result.agencyId, detail: { agency_id: result.agencyId } };
        },
    }),

    subsidyAction({
        key: SUBSIDY_ACTION_KEYS.configureProgram,
        label: "Configure subsidy programme",
        description: "Record a funding programme an agency runs. Configuration only — no jurisdiction is encoded in the platform.",
        validate: (p) => requireFields(p, [["agency_id", "Name the agency."], ["program_key", "Name a stable key."], ["name", "Name the programme."]]),
        preview: (p) => ({ summary: `Programme ${t(p?.name)}.`, changes: [] }),
        run: async (supabase, ctx, payload) => {
            const result = await upsertSubsidyProgram(supabase, {
                orgId: ctx.orgId,
                agencyId: t(payload.agency_id),
                programKey: t(payload.program_key),
                name: t(payload.name),
                fundingSourceType: t(payload.funding_source_type) || null,
                jurisdiction: t(payload.jurisdiction) || null,
                claimRules: (payload.claim_rules as Record<string, unknown>) ?? null,
                actorUserId: ctx.userId ?? null,
            });
            return { affectedId: result.programId, detail: { program_id: result.programId } };
        },
    }),

    subsidyAction({
        key: SUBSIDY_ACTION_KEYS.recordAuthorization,
        label: "Record subsidy authorization",
        description: "Record which child an agency authorized, for what period and how much. Effective-dated; supersedes rather than edits.",
        validate: (p) =>
            requireFields(p, [
                ["program_id", "Name the programme."],
                ["customer_id", "Name the account."],
                ["customer_member_id", "Name the child."],
            ]).concat(
                /^\d{4}-\d{2}-\d{2}$/.test(t(p?.coverage_start))
                    ? []
                    : [{ code: "invalid_coverage_start", message: "Name the date coverage starts.", field: "coverage_start" }],
            ),
        preview: (p) => ({
            summary: `Authorized from ${t(p?.coverage_start)}${t(p?.coverage_end) ? ` to ${t(p?.coverage_end)}` : ""}.`,
            changes: [
                t(p?.authorized_amount_cents) ? `Authorized $${(Number(p?.authorized_amount_cents) / 100).toFixed(2)}` : "",
                t(p?.family_copay_cents) ? `Agency states a family copay of $${(Number(p?.family_copay_cents) / 100).toFixed(2)} — recorded, not applied` : "",
            ].filter(Boolean),
        }),
        run: async (supabase, ctx, payload) => {
            const result = await recordSubsidyAuthorization(supabase, {
                orgId: ctx.orgId,
                programId: t(payload.program_id),
                customerId: t(payload.customer_id),
                customerMemberId: t(payload.customer_member_id),
                opportunityCustomerMemberId: t(payload.opportunity_customer_member_id) || null,
                externalCaseId: t(payload.external_case_id) || null,
                externalAuthorizationId: t(payload.external_authorization_id) || null,
                coverageStart: t(payload.coverage_start),
                coverageEnd: t(payload.coverage_end) || null,
                authorizedUnits: payload.authorized_units == null ? null : Number(payload.authorized_units),
                authorizedUnitKind: t(payload.authorized_unit_kind) || null,
                authorizedAmountCents: payload.authorized_amount_cents == null ? null : Number(payload.authorized_amount_cents),
                rateCents: payload.rate_cents == null ? null : Number(payload.rate_cents),
                familyCopayCents: payload.family_copay_cents == null ? null : Number(payload.family_copay_cents),
                sourceDocumentId: t(payload.source_document_id) || null,
                sourceKey: t(payload.source_key) || null,
                notes: t(payload.notes) || null,
                actorUserId: ctx.userId ?? null,
            });
            return {
                affectedId: result.authorizationId,
                detail: { authorization_id: result.authorizationId, superseded_id: result.supersededId },
            };
        },
    }),

    subsidyAction({
        key: SUBSIDY_ACTION_KEYS.buildClaim,
        label: "Build subsidy claim",
        description: "Assemble a period's claim from the obligations that actually carry expected funding. Idempotent.",
        validate: (p) =>
            requireFields(p, [["authorization_id", "Name the authorization."]]).concat(
                /^\d{4}-\d{2}$/.test(t(p?.period_key))
                    ? []
                    : [{ code: "invalid_period", message: "Name the service period, as YYYY-MM.", field: "period_key" }],
            ),
        preview: (p) => ({ summary: `Build the ${t(p?.period_key)} claim. Building is not submitting.`, changes: [] }),
        run: async (supabase, ctx, payload) => {
            const result = await buildSubsidyClaim(supabase, {
                orgId: ctx.orgId,
                authorizationId: t(payload.authorization_id),
                periodKey: t(payload.period_key),
                actorUserId: ctx.userId ?? null,
            });
            return { affectedId: result.claimId, detail: { ...result } };
        },
    }),

    subsidyAction({
        key: SUBSIDY_ACTION_KEYS.submitClaim,
        label: "Submit subsidy claim",
        description: "Send the claim to the agency. This is the event that may suppress family collection for its attributed amount.",
        validate: (p) => requireFields(p, [["claim_id", "Name the claim."]]),
        preview: () => ({
            summary: "Submitting may suppress family collection for the attributed amount. It is not payment.",
            changes: [],
        }),
        run: async (supabase, ctx, payload) => {
            const result = await submitSubsidyClaim(supabase, {
                orgId: ctx.orgId,
                claimId: t(payload.claim_id),
                externalReference: t(payload.external_reference) || null,
                actorUserId: ctx.userId ?? null,
            });
            return { affectedId: result.claimId, detail: { ...result } };
        },
    }),

    subsidyAction({
        key: SUBSIDY_ACTION_KEYS.recordRemittance,
        label: "Record remittance advice",
        description: "Record what the agency said it is paying. Advice is evidence, not cash.",
        validate: (p) =>
            requireFields(p, [["agency_id", "Name the agency."], ["idempotency_key", "Give the advice a stable identity."]]).concat(
                Array.isArray(p?.lines) && (p!.lines as unknown[]).length > 0
                    ? []
                    : [{ code: "no_lines", message: "A remittance must say which claim lines it answers.", field: "lines" }],
            ),
        preview: (p) => ({
            summary: `Advice for $${(Number(p?.total_amount_cents ?? 0) / 100).toFixed(2)}. Records no cash.`,
            changes: [],
        }),
        run: async (supabase, ctx, payload) => {
            const result = await recordRemittanceAdvice(supabase, {
                orgId: ctx.orgId,
                agencyId: t(payload.agency_id),
                externalRemittanceId: t(payload.external_remittance_id) || null,
                adviceDate: t(payload.advice_date) || null,
                totalAmountCents: Number(payload.total_amount_cents ?? 0),
                sourceDocumentId: t(payload.source_document_id) || null,
                lines: (payload.lines as Array<Record<string, unknown>>).map((l) => ({
                    claimLineId: t(l.claim_line_id),
                    amountCents: Number(l.amount_cents ?? 0),
                    state: (t(l.state) || undefined) as never,
                    adjustmentReason: t(l.adjustment_reason) || null,
                    denialReason: t(l.denial_reason) || null,
                })),
                idempotencyKey: t(payload.idempotency_key),
                actorUserId: ctx.userId ?? null,
            });
            return { affectedId: result.remittanceId, detail: { ...result } };
        },
    }),

    subsidyAction({
        key: SUBSIDY_ACTION_KEYS.settleRemittance,
        label: "Settle remittance with payment",
        description: "Attach the payment that actually arrived. Cash enters through Thread 8, never here.",
        validate: (p) => requireFields(p, [["remittance_id", "Name the remittance."], ["payment_id", "Name the payment that settled it."]]),
        preview: () => ({ summary: "Links an agency receipt to the advice it settled.", changes: [] }),
        run: async (supabase, ctx, payload) => {
            const result = await settleRemittanceWithPayment(supabase, {
                orgId: ctx.orgId,
                remittanceId: t(payload.remittance_id),
                paymentId: t(payload.payment_id),
                settledDate: t(payload.settled_date) || null,
                actorUserId: ctx.userId ?? null,
            });
            return { affectedId: result.remittanceId, detail: { ...result } };
        },
    }),

    subsidyAction({
        key: SUBSIDY_ACTION_KEYS.reconcileRemittance,
        label: "Reconcile remittance",
        description: "Compare what was claimed with what arrived and record the difference. Resolves nothing by itself.",
        validate: (p) => requireFields(p, [["remittance_id", "Name the remittance."]]),
        preview: () => ({
            summary: "Writes a variance per claim line. A shortfall stays unresolved until somebody chooses.",
            changes: [],
        }),
        run: async (supabase, ctx, payload) => {
            const result = await reconcileRemittance(supabase, {
                orgId: ctx.orgId,
                remittanceId: t(payload.remittance_id),
                actorUserId: ctx.userId ?? null,
            });
            return { affectedId: result.remittanceId, detail: { ...result } };
        },
    }),

    subsidyAction({
        key: SUBSIDY_ACTION_KEYS.resolveVariance,
        label: "Resolve subsidy variance",
        description: "Name what happens to a difference the agency did not pay. There is no default.",
        validate: (p) =>
            requireFields(p, [["variance_id", "Name the variance."]]).concat(
                (VARIANCE_RESOLUTIONS as readonly string[]).includes(t(p?.resolution))
                    ? []
                    : [
                          {
                              code: "invalid_resolution",
                              message: `Choose one of: ${VARIANCE_RESOLUTIONS.join(", ")}.`,
                              field: "resolution",
                          },
                      ],
            ),
        preview: (p) => ({
            summary: `Resolve as ${t(p?.resolution)}.`,
            changes:
                t(p?.resolution) === "write_off"
                    ? ["Writes a Thread 10 adjustment — the family genuinely stops owing it."]
                    : t(p?.resolution) === "accept_family_responsibility"
                      ? ["Writes no money. The family was always responsible; the claim simply stops suppressing collection."]
                      : [],
        }),
        run: async (supabase, ctx, payload) => {
            const result = await resolveSubsidyVariance(supabase, {
                orgId: ctx.orgId,
                varianceId: t(payload.variance_id),
                resolution: t(payload.resolution) as VarianceResolution,
                note: t(payload.note) || null,
                reference: t(payload.reference) || null,
                actorUserId: ctx.userId ?? null,
            });
            return { affectedId: result.varianceId, detail: { ...result } };
        },
    }),
];

/** The read seam Thread 4 must consume rather than recompute. */
export { resolveFamilyCollectible };
