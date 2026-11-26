/**
 * Commercial Execution — preview request parsing (pure, Phase 8).
 *
 * Turns a raw request body into a typed CommercialContext (+ optional FundingPlan
 * and horizon) for the preview builder. Pure and defensive; returns a typed error
 * for the route to surface. No DB, no writes.
 */

import type { CommercialContext, EvaluationMode, PayerType } from "@/lib/commercial/execution/executionTypes";
import type { DateRange } from "@/lib/commercial/execution/schedule";
import type { FundingPlan, PayerAllocationInstruction, PayerRef } from "@/lib/commercial/execution/funding";

const MODES: EvaluationMode[] = ["actual", "hypothetical", "projected"];
const PAYER_INTENTS: PayerType[] = ["private_pay", "subsidy", "corporate"];

function s(v: unknown): string | null {
    return v != null && String(v).trim() ? String(v).trim() : null;
}
function n(v: unknown): number | null {
    return v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseCommercialContext(body: Record<string, unknown>): ParseResult<CommercialContext> {
    const programKey = s(body.program_key ?? body.programKey);
    if (!programKey) return { ok: false, error: "program_key is required" };
    const asOf = s(body.as_of ?? body.asOf);
    if (!asOf) return { ok: false, error: "as_of (YYYY-MM-DD) is required" };
    const modeRaw = s(body.mode) ?? "hypothetical";
    const mode = (MODES as string[]).includes(modeRaw) ? (modeRaw as EvaluationMode) : "hypothetical";
    const payerIntentRaw = s(body.payer_intent ?? body.payerIntent);
    const payerIntent = payerIntentRaw && (PAYER_INTENTS as string[]).includes(payerIntentRaw) ? (payerIntentRaw as PayerType) : undefined;

    const periodStart = s(body.period_start ?? body.periodStart);
    const periodEnd = s(body.period_end ?? body.periodEnd);

    const context: CommercialContext = {
        subject: {
            type: (s(body.subject_type) as CommercialContext["subject"]["type"]) ?? "prospect",
            id: s(body.subject_id),
            members: Array.isArray(body.members) ? body.members.map((m) => String(m)) : undefined,
        },
        scope: {
            programKey,
            offeringId: s(body.offering_id ?? body.offeringId) ?? undefined,
            variantId: s(body.variant_id ?? body.variantId) ?? undefined,
            locationId: s(body.location_id ?? body.locationId),
        },
        commitment: {
            cadenceKey: s(body.cadence_key ?? body.cadenceKey) ?? undefined,
            scheduleBasis: s(body.schedule_basis ?? body.scheduleBasis) ?? undefined,
            payerIntent,
        },
        asOf,
        period: periodStart ? { start: periodStart, end: periodEnd ?? undefined } : undefined,
        mode,
    };
    return { ok: true, value: context };
}

/** Optional horizon for expand(). Returns null when absent; error when malformed. */
export function parseHorizon(body: Record<string, unknown>): ParseResult<DateRange | null> {
    const h = body.horizon;
    if (h == null || typeof h !== "object") return { ok: true, value: null };
    const start = s((h as Record<string, unknown>).start);
    const end = s((h as Record<string, unknown>).end);
    if (!start || !end) return { ok: false, error: "horizon requires both start and end (YYYY-MM-DD)" };
    if (end < start) return { ok: false, error: "horizon.end must be on/after horizon.start" };
    return { ok: true, value: { start, end } };
}

function parsePayer(raw: Record<string, unknown>): PayerRef | null {
    const partyType = s(raw.party_type ?? raw.partyType);
    const source = s(raw.source);
    if (!partyType || !source) return null;
    return { partyType, partyId: s(raw.party_id ?? raw.partyId), source: source as PayerRef["source"], label: s(raw.label) ?? undefined };
}

/** Optional funding plan for attribute(). Returns null when absent. */
export function parseFundingPlan(body: Record<string, unknown>): ParseResult<FundingPlan | null> {
    const p = body.funding_plan ?? body.fundingPlan;
    if (p == null || typeof p !== "object") return { ok: true, value: null };
    const plan = p as Record<string, unknown>;
    const primary = plan.primary && typeof plan.primary === "object" ? parsePayer(plan.primary as Record<string, unknown>) : null;
    if (!primary) return { ok: false, error: "funding_plan.primary requires party_type and source" };
    const allocations: PayerAllocationInstruction[] = [];
    if (Array.isArray(plan.allocations)) {
        for (const a of plan.allocations) {
            if (!a || typeof a !== "object") continue;
            const row = a as Record<string, unknown>;
            const payer = row.payer && typeof row.payer === "object" ? parsePayer(row.payer as Record<string, unknown>) : null;
            const basis = s(row.basis);
            if (!payer || (basis !== "fixed_amount" && basis !== "percentage" && basis !== "coverage_rule")) continue;
            const target = s(row.target);
            allocations.push({
                payer,
                basis,
                value: n(row.value) ?? undefined,
                target: target === "tuition" || target === "fees" ? target : "all",
            });
        }
    }
    return { ok: true, value: { primary, allocations: allocations.length ? allocations : undefined } };
}
