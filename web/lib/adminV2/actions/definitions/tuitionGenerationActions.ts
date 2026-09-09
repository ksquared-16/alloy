/**
 * Registered action: `billing.generate_tuition`.
 *
 * The production entry point for turning accepted pricing terms into draft tuition charges for one
 * service period. It runs on the same action runtime every other operator intent uses, so it is
 * authorized, audited and invocable without a screen — which matters, because Thread 4 will place a
 * surface over it later and a generator reachable only from a page would have to be rebuilt then.
 *
 * ── DETERMINISTIC INPUT, REAL EXECUTION ──
 *
 * The period is named by the caller (`YYYY-MM`) and never inferred from "now": a generation run that
 * silently means "this month" cannot be replayed, cannot be reasoned about at a month boundary, and
 * cannot be certified. Execution is real — it writes through Operational Consumption — and is
 * distinct from the existing simulator, which resolves the same pipeline from a caller-supplied fact.
 *
 * ── WHAT THE CALLER MAY NOT SEND ──
 *
 * No amount, no currency, no cadence, no pricing source. Those come from the accepted term, and a
 * payload carrying one is REFUSED rather than ignored: silently dropping it would let a caller
 * believe it had set a price and leave the difference to be discovered in a ledger.
 *
 * @see web/lib/financials/tuitionGeneration/generateTuitionCharges.ts
 */

import { randomUUID } from "crypto";

import type { ActionResult, RegisteredAction } from "@/lib/adminV2/actions/actionTypes";
import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import { generateTuitionCharges } from "@/lib/financials/tuitionGeneration/generateTuitionCharges";
import { isSubjectlessEntityId } from "@/lib/adminV2/actions/subjectlessActionConstants";
import type { SupabaseClient } from "@supabase/supabase-js";

export const BILLING_GENERATE_TUITION_ACTION_KEY = "billing.generate_tuition";
/** Writing money is `fin.write` — the permission the platform already uses for financial writes. */
export const BILLING_GENERATE_TUITION_PERMISSION = "fin.write" as const;

function t(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

const PRICE_FIELDS = ["amount_cents", "amount", "currency", "currency_code", "cadence_key", "rate_cents"];

const generateTuition: RegisteredAction = {
    actionKey: BILLING_GENERATE_TUITION_ACTION_KEY,
    defaultLabel: "Generate tuition",
    description:
        "Create draft tuition charges for one service period from the accepted pricing terms. "
        + "Creates drafts only; posting stays a separate, authoritative step.",
    supportedEntityTypes: ["opportunity_customer_member", "opportunity", "child", "person"],
    supportedProcessKeys: [],
    // The subject is the PERIOD, not a record. An entity id narrows the run when one is given.
    requiredContext: { requiresEntityId: false, requiresOpportunity: false, requiresCustomer: false },
    audit: { eventType: "action_executed", category: "record", mutates: true },
    bosProposalSupport: false,
    confirmationPolicy: "none",

    validatePayload(payload) {
        const blockers: Array<{ code: string; message: string; field?: string }> = [];
        const periodKey = t(payload?.period_key);
        if (!/^\d{4}-\d{2}$/.test(periodKey)) {
            blockers.push({
                code: "missing_period",
                message: "Name the service period to bill, as YYYY-MM.",
                field: "period_key",
            });
        }
        /*
         * A PRICE IN THE PAYLOAD IS REFUSED, NOT DROPPED. There is no override-by-amount anywhere in
         * this path: tuition is the amount the family accepted, and a caller sending one has
         * misunderstood something worth naming.
         */
        const sent = PRICE_FIELDS.filter((f) => payload && f in payload);
        if (sent.length > 0) {
            blockers.push({
                code: "pricing_not_accepted_from_caller",
                message:
                    `Tuition comes from the accepted pricing term, never from the caller (${sent.join(", ")}). `
                    + "Change the accepted term if the price is wrong.",
                field: sent[0],
            });
        }
        return blockers.length > 0 ? { ok: false, blockers } : { ok: true, value: payload ?? {} };
    },

    async resolveEligibility({ supabase, ctx }) {
        const grants = await resolveActorPermissionGrants(supabase as SupabaseClient, ctx.orgId, ctx.userId);
        const permitted = (grants.permissionKeys ?? []).includes(BILLING_GENERATE_TUITION_PERMISSION);
        return {
            eligible: permitted,
            blockers: permitted
                ? []
                : [
                      {
                          code: "generation_permission_required",
                          message: `Generating tuition requires ${BILLING_GENERATE_TUITION_PERMISSION}.`,
                      },
                  ],
            availableTransitions: [],
            requiredInputs: [],
        };
    },

    /** What the run WOULD do, without writing: the same resolution, reported. */
    async buildPreview({ supabase, ctx, payload, invocation }) {
        const periodKey = t(payload?.period_key);
        const scope = scopeFrom(payload, invocation?.entityId);
        const { previewTuitionGeneration } = await import(
            "@/lib/financials/tuitionGeneration/previewTuitionGeneration"
        );
        const result = await previewTuitionGeneration(supabase as SupabaseClient, {
            orgId: ctx.orgId,
            periodKey,
            opportunityCustomerMemberIds: scope,
        });
        return {
            summary:
                `${result.counts.generated} to bill, ${result.counts.notDue} not due, `
                + `${result.counts.refused} refused for ${periodKey}`,
            changes: result.outcomes
                .slice(0, 20)
                .map((o) =>
                    o.kind === "generated"
                        ? `${o.assignmentId} · ${(o.amountCents / 100).toFixed(2)} ${o.currencyCode}`
                        : `${o.assignmentId} · ${o.kind === "refused" ? o.reason : o.kind === "not_due" ? o.reason : "error"}`,
                ),
            /*
             * STRUCTURED, BECAUSE A SURFACE HAS TO SHOW THE EXCEPTIONS, NOT JUST COUNT THEM.
             *
             * `summary` and `changes` are prose and a caller can only render them. A bulk run
             * needs the tally and the rows that will NOT be billed, so an operator confirms
             * knowing what is being left behind rather than discovering it afterwards. The
             * exceptions are carried whole; the generated rows stay in `changes`, since a
             * hundred successful lines are a log and the failures are the decision.
             */
            after: {
                period_key: periodKey,
                counts: result.counts,
                total_amount_cents: result.outcomes.reduce(
                    (sum, o) => sum + (o.kind === "generated" ? o.amountCents : 0),
                    0,
                ),
                refused_outcomes: result.outcomes.filter((o) => o.kind === "refused"),
                not_due_outcomes: result.outcomes.filter((o) => o.kind === "not_due"),
                error_outcomes: result.outcomes.filter((o) => o.kind === "error"),
                already_posted_outcomes: result.outcomes.filter((o) => o.kind === "already_posted"),
            },
        };
    },

    async execute({ supabase, ctx, invocation, payload }): Promise<ActionResult> {
        const correlationId = randomUUID();
        const grants = await resolveActorPermissionGrants(supabase as SupabaseClient, ctx.orgId, ctx.userId);
        if (!(grants.permissionKeys ?? []).includes(BILLING_GENERATE_TUITION_PERMISSION)) {
            return {
                ok: false,
                correlationId,
                status: 403,
                error: `Generating tuition requires ${BILLING_GENERATE_TUITION_PERMISSION}.`,
                blockers: [{ code: "generation_permission_required", message: "Permission required." }],
            };
        }
        try {
            const result = await generateTuitionCharges(supabase as SupabaseClient, {
                orgId: ctx.orgId,
                periodKey: t(payload?.period_key),
                actorUserId: ctx.userId ?? null,
                opportunityCustomerMemberIds: scopeFrom(payload, invocation.entityId),
                cadenceKey: t(payload?.cadence) || undefined,
                today: t(payload?.today) || null,
            });
            return {
                ok: true,
                correlationId,
                result: {
                    actionKey: BILLING_GENERATE_TUITION_ACTION_KEY,
                    entityType: invocation.entityType,
                    entityId: t(invocation.entityId) || result.periodKey,
                    affectedId: result.outcomes.find((o) => o.kind === "generated")?.assignmentId ?? null,
                    detail: {
                        period_key: result.periodKey,
                        service_period: result.servicePeriod,
                        /*
                         * COUNTS STAY COUNTS. `refused` and `errors` were both a number and a list
                         * here, and the list won — so a caller reading `errors` got an array where
                         * it expected a total. The outcomes an operator has to act on are named
                         * separately rather than overwriting the tally.
                         */
                        ...result.counts,
                        refused_outcomes: result.outcomes.filter((o) => o.kind === "refused"),
                        error_outcomes: result.outcomes.filter((o) => o.kind === "error"),
                    },
                },
            };
        } catch (err) {
            return {
                ok: false,
                correlationId,
                status: 400,
                error: err instanceof Error ? err.message : "Tuition generation failed.",
            };
        }
    },
};

/** A bounded subject scope, when the caller named one. Absent, the whole org's terms are considered. */
function scopeFrom(
    payload: Record<string, unknown> | undefined,
    entityId: string | undefined,
): string[] | null {
    const listed = Array.isArray(payload?.opportunity_customer_member_ids)
        ? (payload!.opportunity_customer_member_ids as unknown[]).map((v) => t(v)).filter(Boolean)
        : [];
    if (listed.length > 0) return listed;
    /*
     * "NO SUBJECT" IS NOT A SUBJECT. The transport transmits a sentinel for an action that
     * declares it needs no record, and treating that sentinel as an assignment id would narrow
     * the run to a record that does not exist — zero charges, indistinguishable from a period
     * with nothing to bill.
     */
    const fromEntity = isSubjectlessEntityId(entityId) ? "" : t(entityId);
    const single = t(payload?.opportunity_customer_member_id) || fromEntity;
    return single ? [single] : null;
}

export const tuitionGenerationActions: RegisteredAction[] = [generateTuition];
