/**
 * PROSPECTIVE POST-CLOSE CORRECTIONS — resolution and preview, sharing execute's verdict.
 *
 * ── WHY THERE IS NO NEW WRITER HERE ──
 *
 * The census answered the model question before anything was built. The existing reduction
 * authority already represents every part of a prospective correction, and the deployed estate
 * proves it rather than merely permitting it:
 *
 *   source economic fact      `source_charge_id` — a plain FK to `charges`. All 40 deployed
 *                             applications with a source point at a LEGACY charge, so correcting
 *                             legacy history needs no invented canonical historical period.
 *   correction amount         signed `amount_cents`.
 *   correction's own period   resolved from the correction's `effectiveDate`, never the source's.
 *                             9 deployed applications already sit in a different period from their
 *                             source, so source-period independence is live, not aspirational.
 *   idempotency               unique index on `(org_id, idempotency_key)`.
 *   reversal lineage          `reverses_id` / `reversed_by_id`, with one live reversal enforced.
 *
 * So S5 adds no `financial_corrections` table and no second correction writer. What it adds is the
 * part that was genuinely missing: a resolver that can answer, BEFORE anything is written, what a
 * correction would do and whether it would be refused — in the operator's language, and reaching
 * the same verdict execute reaches.
 *
 * ── PREVIEW MUST NOT WRITE, AND MUST STILL AGREE ──
 *
 * These pull in opposite directions. `resolveChargeBillingPeriodBinding` — the authority execute
 * goes through — MATERIALIZES the customer's current and next periods as a side effect. Calling it
 * from a preview would mean hovering over a form creates billing periods, which is the mistake a
 * speculative read must never make.
 *
 * So preview resolves READ-ONLY and still lands on execute's answer, because the only verdict that
 * can differ is "is the destination closed", and a period that does not exist yet cannot be closed:
 *
 *   · a persisted period covers the date  → read its status. CLOSED refuses here exactly as the
 *     binder will refuse there.
 *   · no persisted period covers the date → the calendar says which period the date belongs to, and
 *     execute will materialize it OPEN. Preview names it and reports that it will be opened.
 *
 * Every other refusal (no calendar, ambiguous calendar, unreachable household) is resolved from the
 * same `resolveCustomerCalendar` the binder uses, so those agree by sharing the authority rather
 * than by duplicating its rules.
 *
 * ── DIRECTION IS STATED, NEVER INFERRED FROM A SIGN ──
 *
 * Internally the amount stays canonically signed, because that is what the economic model means and
 * inverting it in a component is how two surfaces start disagreeing about money. But an operator is
 * never asked to reason about signed cents: the resolver returns an explicit direction and a
 * sentence. A positive amount truthfully INCREASES what the family owes — certified behaviour, not
 * a bug — and the word "credit" does not imply a sign.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { BillingPeriodBindingError, resolveChargeCustomerId } from "@/lib/financials/billingPeriods/bindChargeBillingPeriod";
import {
    currentAndNextPeriods,
    resolveCustomerCalendar,
} from "@/lib/financials/billingPeriods/customerBillingPeriodService";

/** What the correction does to the family's position, said rather than signed. */
export type CorrectionDirection = "reduces" | "increases";

export type ProspectiveCorrectionInput = {
    orgId: string;
    enrollmentAgreementId: string;
    customerId?: string | null;
    /** SIGNED cents, canonical. Negative reduces what the family owes; positive increases it. */
    amountCents: number;
    /** The date the CORRECTION belongs to. Its period comes from here, never from the source. */
    effectiveDate: string;
    /** The historical fact being corrected. May belong to a closed period, or to legacy history. */
    sourceChargeId?: string | null;
};

export type CorrectionSourceFact = {
    chargeId: string;
    description: string | null;
    chargeCategory: string | null;
    amountCents: number;
    serviceDate: string | null;
    status: string;
    /** `canonical` sources name a period row; `legacy` ones carry a key and no row. */
    generation: string;
    billingPeriodId: string | null;
    /** The human label for the source's period, whichever generation it is. */
    periodLabel: string | null;
    /** Null for a legacy source — it has no period row, so it has no status. */
    periodStatus: string | null;
};

export type CorrectionDestination = {
    periodKey: string;
    startsOn: string;
    endsOn: string;
    status: "open" | "closed";
    /** Null when the period has not been materialized yet; execute will create it. */
    billingPeriodId: string | null;
    /** True when execute will open this period rather than land in an existing one. */
    willBeCreated: boolean;
};

export type ProspectiveCorrectionResolution = {
    direction: CorrectionDirection;
    amountCents: number;
    /** Always positive — the magnitude an operator reads. */
    magnitudeCents: number;
    source: CorrectionSourceFact | null;
    destination: CorrectionDestination;
    /** True when the source's period is closed, which is the principal S5 case rather than a problem. */
    sourceIsFinalized: boolean;
};

export function correctionDirection(amountCents: number): CorrectionDirection {
    return amountCents < 0 ? "reduces" : "increases";
}

function money(cents: number): string {
    return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/**
 * The operator-facing sentence. Deliberately says what happens to what the family OWES, because
 * "credit of $25" does not tell an operator which way the money moves.
 */
export function correctionDirectionSentence(amountCents: number): string {
    return correctionDirection(amountCents) === "reduces"
        ? `Reduces what the family owes by ${money(amountCents)}`
        : `Increases what the family owes by ${money(amountCents)}`;
}

async function loadSourceFact(
    supabase: SupabaseClient,
    orgId: string,
    sourceChargeId: string,
): Promise<CorrectionSourceFact> {
    const { data, error } = await supabase
        .from("charges")
        .select(
            "id, description, charge_category, amount_cents, service_date, status, billing_period_generation, billing_period_id, legacy_billing_period_key",
        )
        .eq("org_id", orgId)
        .eq("id", sourceChargeId)
        .maybeSingle();
    if (error) throw new BillingPeriodBindingError("source_read_failed", error.message, { sourceChargeId });
    const row = data as {
        id: string; description: string | null; charge_category: string | null; amount_cents: number;
        service_date: string | null; status: string; billing_period_generation: string;
        billing_period_id: string | null; legacy_billing_period_key: string | null;
    } | null;
    if (!row) {
        throw new BillingPeriodBindingError(
            "correction_source_not_found",
            "The charge this correction refers to could not be found on this account.",
            { sourceChargeId },
        );
    }

    let periodLabel = row.legacy_billing_period_key;
    let periodStatus: string | null = null;
    if (row.billing_period_id) {
        const { data: periodRow } = await supabase
            .from("financial_billing_periods")
            .select("period_key, status")
            .eq("org_id", orgId)
            .eq("id", row.billing_period_id)
            .maybeSingle();
        const period = periodRow as { period_key: string; status: string } | null;
        if (period) {
            periodLabel = period.period_key;
            periodStatus = period.status;
        }
    }

    return {
        chargeId: row.id,
        description: row.description,
        chargeCategory: row.charge_category,
        amountCents: row.amount_cents,
        serviceDate: row.service_date,
        status: row.status,
        generation: row.billing_period_generation,
        billingPeriodId: row.billing_period_id,
        periodLabel,
        periodStatus,
    };
}

/**
 * Resolve a prospective correction WITHOUT writing anything.
 *
 * Throws the same `BillingPeriodBindingError` family execute throws, so the canonical HTTP mapping
 * answers a preview refusal and an execute refusal identically — 409 and a business sentence for a
 * closed destination or an unusable calendar, never a 500.
 */
export async function resolveProspectiveCorrection(
    supabase: SupabaseClient,
    input: ProspectiveCorrectionInput,
): Promise<ProspectiveCorrectionResolution> {
    const orgId = (input.orgId ?? "").trim();
    const sourceChargeId = (input.sourceChargeId ?? "").trim();

    const customerId =
        (input.customerId ?? "").trim()
        || (await resolveChargeCustomerId(supabase, {
            orgId,
            billableSourceType: "enrollment_agreement",
            billableSourceId: input.enrollmentAgreementId,
        }));
    if (!customerId) {
        throw new BillingPeriodBindingError(
            "customer_unresolved",
            "This correction does not reach a household, so it has no commercial billing period.",
            { enrollmentAgreementId: input.enrollmentAgreementId },
        );
    }

    /*
     * The calendar authority, shared with the binder. Its refusals are the binder's refusals, which
     * is what keeps preview and execute from drifting apart on configuration conflicts.
     */
    const calendar = await resolveCustomerCalendar(supabase, {
        orgId,
        customerId,
        onDate: input.effectiveDate,
    });
    if (calendar.kind !== "resolved") {
        if (calendar.kind === "ambiguous_locations") {
            throw new BillingPeriodBindingError(
                "billing_calendar_ambiguous",
                "This household attends more than one location and has no billing calendar of its own, so there is no single commercial period to bill into. Set the account's billing calendar first.",
                { customerId },
            );
        }
        throw new BillingPeriodBindingError(
            calendar.kind === "invalid_policy" ? "billing_calendar_invalid" : "billing_calendar_unconfigured",
            "This household has no usable billing calendar, so there is no commercial period to correct into.",
            { customerId },
        );
    }

    const { current } = currentAndNextPeriods(calendar, input.effectiveDate);

    /* READ-ONLY. A period that does not exist yet cannot be closed, so not finding one is fine. */
    const { data: existingRow, error: periodError } = await supabase
        .from("financial_billing_periods")
        .select("id, period_key, starts_on, ends_on, status")
        .eq("org_id", orgId)
        .eq("customer_id", customerId)
        .lte("starts_on", input.effectiveDate)
        .gte("ends_on", input.effectiveDate)
        .maybeSingle();
    if (periodError) {
        throw new BillingPeriodBindingError("period_read_failed", periodError.message, { customerId });
    }
    const existing = existingRow as
        | { id: string; period_key: string; starts_on: string; ends_on: string; status: string }
        | null;

    const destination: CorrectionDestination = existing
        ? {
              periodKey: existing.period_key,
              startsOn: existing.starts_on,
              endsOn: existing.ends_on,
              status: existing.status === "closed" ? "closed" : "open",
              billingPeriodId: existing.id,
              willBeCreated: false,
          }
        : {
              periodKey: current.key,
              startsOn: current.start,
              endsOn: current.end,
              status: "open",
              billingPeriodId: null,
              willBeCreated: true,
          };

    /*
     * THE DESTINATION MUST BE OPEN, and the refusal names the period rather than hopping forward to
     * find one that works. Silently moving a correction to the next open period would re-date the
     * family's money on the operator's behalf; choosing the effective date is their decision.
     */
    if (destination.status === "closed") {
        throw new BillingPeriodBindingError(
            "billing_period_closed",
            `That billing period (${destination.periodKey}) is closed, so a correction cannot be recorded into it. Choose an effective date in an open period.`,
            { customerId, billingPeriodId: destination.billingPeriodId, periodKey: destination.periodKey },
        );
    }

    const source = sourceChargeId ? await loadSourceFact(supabase, orgId, sourceChargeId) : null;

    return {
        direction: correctionDirection(input.amountCents),
        amountCents: input.amountCents,
        magnitudeCents: Math.abs(input.amountCents),
        source,
        destination,
        /* A closed source is the POINT of S5, not an obstacle. Reported, never refused. */
        sourceIsFinalized: source?.periodStatus === "closed",
    };
}

export type ProspectiveCorrectionPreview = {
    summary: string;
    changes: string[];
    resolution: ProspectiveCorrectionResolution;
};

/**
 * The preview an operator reads. Every line is a fact the resolver computed; nothing here does
 * arithmetic of its own, so what is shown is what will happen.
 */
export async function previewProspectiveCorrection(
    supabase: SupabaseClient,
    input: ProspectiveCorrectionInput,
): Promise<ProspectiveCorrectionPreview> {
    const resolution = await resolveProspectiveCorrection(supabase, input);
    const changes: string[] = [];

    if (resolution.source) {
        const s = resolution.source;
        const what = s.description?.trim() || s.chargeCategory || "a charge";
        changes.push(`Corrects: ${what} of ${money(s.amountCents)}${s.serviceDate ? ` from ${s.serviceDate}` : ""}`);
        if (s.periodLabel) {
            changes.push(
                `That charge belongs to ${s.periodLabel}`
                + (s.periodStatus === "closed" ? ", which is closed and stays unchanged" : ""),
            );
        }
    }

    changes.push(
        `Applies to ${resolution.destination.periodKey}`
        + ` (${resolution.destination.startsOn} to ${resolution.destination.endsOn})`
        + (resolution.destination.willBeCreated ? ", which will be opened" : ""),
    );
    changes.push(`Effective ${input.effectiveDate}`);

    return {
        summary: correctionDirectionSentence(resolution.amountCents),
        changes,
        resolution,
    };
}
