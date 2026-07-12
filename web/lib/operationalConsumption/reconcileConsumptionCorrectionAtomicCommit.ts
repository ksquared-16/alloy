/**
 * Single-transaction D12a correction reconciliation via Postgres RPC (DP-1).
 * See migration 20260716000000_consumption_correction_lineage_and_reconcile_rpc.sql.
 *
 * The ONLY new `.rpc(` under web/lib/operationalConsumption/**. Mirrors the house
 * `*AtomicCommit.ts` convention (agentV0AtomicCommit, mutations/domains/*): build
 * the pre-resolved plan in TypeScript, call the RPC ONCE, destructure {data,error},
 * string-match the `reconcile_consumption:` sentinels to a typed result. The RPC
 * performs ALL reconciliation writes all-or-nothing; this wrapper writes nothing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReconcileConsumptionPlan } from "@/lib/operationalConsumption/consumptionTypes";

export type ReconcileConsumptionSuccess = {
    ok: true;
    consumptionEventId: string;
    priorConsumptionEventId: string | null;
    obligationIds: string[];
    reparentedObligationIds: string[];
    supersededObligationIds: string[];
    retiredChargeIds: string[];
    createdChargeIds: string[];
};

export type ReconcileConsumptionFailure = {
    ok: false;
    code: "no_prior_event" | "rpc_failed";
    error: string;
};

export type ReconcileConsumptionResult = ReconcileConsumptionSuccess | ReconcileConsumptionFailure;

/** Serialize the camelCase plan into the snake_case `p_plan` jsonb the RPC reads. */
export function toPlanJson(plan: ReconcileConsumptionPlan): Record<string, unknown> {
    const ce = plan.correctionEvent;
    return {
        correction_event: {
            idempotency_key: ce.idempotencyKey,
            event_type_id: ce.eventTypeId,
            event_key: ce.eventKey,
            source_family: ce.sourceFamily,
            source_entity_type: ce.sourceEntityType,
            source_entity_id: ce.sourceEntityId,
            subject_type: ce.subjectType,
            subject_id: ce.subjectId,
            location_id: ce.locationId,
            occurs_on: ce.occursOn,
            effective_on: ce.effectiveOn,
            status: ce.status,
            context: ce.context ?? {},
        },
        prior_fact_id: plan.priorFactId,
        new_obligations: plan.newObligations.map((o) => ({
            resolution_key: o.resolutionKey,
            obligation_kind: o.obligationKind,
            charge_template_id: o.chargeTemplateId,
            service_id: o.serviceId,
            amount_cents: o.amountCents,
            currency_code: o.currencyCode,
            responsibility_key: o.responsibilityKey,
            occurs_on: o.occursOn,
            billable_on: o.billableOn,
            period_start: o.periodStart,
            period_end: o.periodEnd,
            review_required: o.reviewRequired,
            status: o.status,
            review_status_stale: o.reviewStatusStale,
            explanation: o.explanation ?? {},
            charge: o.charge
                ? {
                      op: o.charge.op,
                      draft_charge_id: o.charge.draftChargeId ?? null,
                      billable_source_id: o.charge.billableSourceId,
                      charge_type: o.charge.chargeType ?? "fee",
                      charge_category: o.charge.chargeCategory,
                      currency_code: o.charge.currencyCode,
                      amount_cents: o.charge.amountCents,
                      service_date: o.charge.serviceDate,
                      occurs_on: o.charge.occursOn,
                      billable_on: o.charge.billableOn,
                      charge_template_id: o.charge.chargeTemplateId,
                      service_id: o.charge.serviceId,
                      description: o.charge.description,
                      metadata: o.charge.metadata ?? {},
                  }
                : null,
        })),
        retire_charge_ids: plan.retireChargeIds,
    };
}

function strArray(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Call the atomic reconciliation RPC once. Never writes here; the RPC owns the transaction. */
export async function reconcileConsumptionCorrection(
    supabase: SupabaseClient,
    params: { orgId: string; actorUserId: string | null; plan: ReconcileConsumptionPlan },
): Promise<ReconcileConsumptionResult> {
    const { data, error } = await supabase.rpc("reconcile_consumption_correction", {
        p_org_id: params.orgId,
        p_actor_user_id: params.actorUserId,
        p_plan: toPlanJson(params.plan),
    });

    if (error) {
        const msg = error.message ?? "";
        if (msg.includes("reconcile_consumption:no_prior_event")) {
            return { ok: false, code: "no_prior_event", error: msg };
        }
        return { ok: false, code: "rpc_failed", error: msg };
    }

    const row = (data ?? {}) as Record<string, unknown>;
    if (!row || row.ok !== true || typeof row.consumption_event_id !== "string") {
        return { ok: false, code: "rpc_failed", error: "reconcile RPC returned no result" };
    }

    return {
        ok: true,
        consumptionEventId: row.consumption_event_id,
        priorConsumptionEventId: (row.prior_consumption_event_id as string) ?? null,
        obligationIds: strArray(row.obligation_ids),
        reparentedObligationIds: strArray(row.reparented_obligation_ids),
        supersededObligationIds: strArray(row.superseded_obligation_ids),
        retiredChargeIds: strArray(row.retired_charge_ids),
        createdChargeIds: strArray(row.created_charge_ids),
    };
}
