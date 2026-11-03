/**
 * ANNUAL CATALOG FEES — WHO WOULD BE CHARGED, WHEN, AND WHETHER THEY ALREADY WERE. PREVIEW ONLY.
 *
 * ── WHAT IS DECIDED, AND BY WHOM ─────────────────────────────────────────────────────────────
 *
 * Decided by the operator (2026-11-03): an annual Catalog fee is owed by the children its
 * configured scope reaches when the item is marked **Required** (`behavior.required`). A
 * non-required annual item is never billed automatically. Its location (`location_id`, null = all
 * sites) and program (`program_key`, null = every program) are the scope; nothing else is read.
 *
 * PROPOSED, AWAITING REVIEW — and stated as such on every surface that shows it:
 *   · timing: due at the start of each annual period anchored on the child's enrollment, the way
 *     annual tuition periods are already tiled (`billingPeriodFor("annual", …)`): the anchor is the
 *     earliest live accepted tuition term's start, else the agreement's start date;
 *   · grain: one charge per child, written against that child's billable agreement
 *     (`selectBillableAgreement`), never against the household;
 *   · price: the full Catalog price per period — annual is one flat unit, never prorated.
 *
 * ── NOTHING HERE WRITES ─────────────────────────────────────────────────────────────────────
 *
 * There is no write path for annual Catalog fees. `ANNUAL_CATALOG_BILLING_ACTIVE` is false and this
 * module only answers the question; activation is a separate, reviewed change. A fee is never
 * turned into a one-time fee to make it chargeable.
 *
 * ── ONE CHARGE PER CHILD PER ITEM PER YEAR ───────────────────────────────────────────────────
 *
 * The occurrence key is the resolution key the existing charge writer would compute for this
 * charge — `tpl:catalog:<product id>:<period start>:<agreement id>` — so once a write exists the
 * database's `charges_resolution_key_unique` refuses a second charge for the same occurrence. The
 * preview also reads what is already there: any live charge of the same Catalog item for the same
 * child inside the period (by `metadata.catalog_item.product_id`, whatever its date or source) makes
 * that child `already_charged`, so a fee added by hand is never billed again by the schedule.
 *
 * Pure: the caller reads the rows.
 */
import { billingPeriodFor, type BillingPeriod } from "@/lib/financials/billingPeriod";
import { selectBillableAgreement } from "@/lib/financials/catalogCharges/chargeSubjectSite";
import type { CommercialProductDef } from "@/lib/commercial/execution/commercialExport";

/** Annual Catalog billing has no write path. Activation is a separate, reviewed change. */
export const ANNUAL_CATALOG_BILLING_ACTIVE = false as const;

export const ANNUAL_CATALOG_TIMING_PROPOSAL =
    "Proposed: due on each child's enrollment anniversary, full price, one charge per child per year.";

export type AnnualFeeAgreement = {
    id: string;
    customer_member_id: string;
    customer_id: string | null;
    site_location_id: string | null;
    status: string | null;
    start_date: string | null;
    end_date: string | null;
};

/** A live accepted tuition term of an agreement: its program and start. */
export type AnnualFeeTerm = {
    enrollment_agreement_id: string | null;
    program_key: string | null;
    effective_start: string | null;
};

/** A charge already on the books that names a Catalog item. */
export type AnnualFeeExistingCharge = {
    id: string;
    status: string | null;
    service_date: string | null;
    billable_source_type: string | null;
    billable_source_id: string | null;
    product_id: string | null;
    /** The child a household-sourced charge was for (`customer:<id>:child:<member>`), if any. */
    child_member_id: string | null;
};

export type AnnualFeeRecipientState =
    /** The period has begun and no charge of this item exists for the child in it. */
    | "due"
    /** The period begins after the business date. */
    | "upcoming"
    /** A live charge of this item already exists for the child in this period. */
    | "already_charged";

export type AnnualFeeRecipient = {
    childMemberId: string;
    customerId: string | null;
    agreementId: string;
    locationId: string | null;
    programKey: string | null;
    anchor: string;
    anchorSource: "tuition_term" | "agreement_start";
    period: BillingPeriod;
    dueOn: string;
    amountCents: number;
    state: AnnualFeeRecipientState;
    existingChargeId: string | null;
    occurrenceKey: string;
};

export type AnnualFeeExclusion = { childMemberId: string; agreementId: string | null; reason: string };

export type AnnualFeeItemSchedule = {
    productId: string;
    name: string;
    amountCents: number;
    locationId: string | null;
    programKey: string | null;
    /** `scheduled` = a Required annual fee with a posting account; anything else says why not. */
    status: "scheduled" | "not_required" | "not_billable";
    reason: string | null;
    recipients: AnnualFeeRecipient[];
    excluded: AnnualFeeExclusion[];
};

const LIVE_CHARGE_EXCLUDED = new Set(["void", "voided", "cancelled", "canceled", "reversed"]);

export function isAnnualCatalogFee(product: CommercialProductDef): boolean {
    return product.commercialType === "fee" && (product.cadenceKey ?? "").trim() === "annual";
}

export function annualFeeOccurrenceKey(productId: string, periodStart: string, agreementId: string): string {
    return `tpl:catalog:${productId}:${periodStart}:${agreementId}`;
}

function isYmd(v: string | null | undefined): v is string {
    return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function effectiveOn(product: CommercialProductDef, ymd: string): boolean {
    const { start, end } = product.effective;
    return (!start || start <= ymd) && (!end || end >= ymd);
}

/**
 * The schedule of every annual Catalog fee: for a Required one, each in-scope child's current
 * period and the next, with its state; for any other, why it is not scheduled.
 *
 * `accountFor` is the Catalog's own posting-account rule (`resolveCatalogChargeAccount`): an item
 * with no account is not billable by any flow, and the schedule says so instead of listing people.
 */
export function buildAnnualCatalogFeeSchedule(input: {
    asOf: string;
    products: readonly CommercialProductDef[];
    /** Every child agreement in the org, NEWEST FIRST per child (the command's read order). */
    agreements: readonly AnnualFeeAgreement[];
    terms: readonly AnnualFeeTerm[];
    charges: readonly AnnualFeeExistingCharge[];
    accountFor: (product: CommercialProductDef) => { ok: true } | { ok: false; reason: string };
}): AnnualFeeItemSchedule[] {
    const { asOf } = input;

    const byChild = new Map<string, AnnualFeeAgreement[]>();
    for (const a of input.agreements) {
        const child = (a.customer_member_id ?? "").trim();
        if (!child) continue;
        byChild.set(child, [...(byChild.get(child) ?? []), a]);
    }
    const termsByAgreement = new Map<string, AnnualFeeTerm[]>();
    for (const t of input.terms) {
        const id = (t.enrollment_agreement_id ?? "").trim();
        if (!id) continue;
        termsByAgreement.set(id, [...(termsByAgreement.get(id) ?? []), t]);
    }

    return input.products.filter(isAnnualCatalogFee).map((product): AnnualFeeItemSchedule => {
        const base = {
            productId: product.id,
            name: product.name,
            amountCents: product.amountCents,
            locationId: product.scope.locationId,
            programKey: product.scope.programKey || null,
            recipients: [] as AnnualFeeRecipient[],
            excluded: [] as AnnualFeeExclusion[],
        };
        if (!product.isActive) return { ...base, status: "not_billable", reason: "Inactive." };
        if (product.behavior?.required !== true) {
            return { ...base, status: "not_required", reason: "Not marked Required, so nobody is charged automatically." };
        }
        if (!(product.amountCents > 0)) return { ...base, status: "not_billable", reason: "Priced at $0.00." };
        const account = input.accountFor(product);
        if (!account.ok) return { ...base, status: "not_billable", reason: account.reason };

        const programKey = (product.scope.programKey ?? "").trim();
        for (const [child, rows] of byChild) {
            /* ONE agreement per child — the one a charge for this child is written against. */
            const agreement = selectBillableAgreement(rows)!;
            const exclude = (reason: string) => base.excluded.push({ childMemberId: child, agreementId: agreement.id, reason });
            if ((agreement.status ?? "").trim() !== "active") continue; // not enrolled: not in scope, not listed
            if (product.scope.locationId && agreement.site_location_id !== product.scope.locationId) continue;

            const terms = termsByAgreement.get(agreement.id) ?? [];
            const programs = [...new Set(terms.map((t) => (t.program_key ?? "").trim()).filter(Boolean))];
            if (programKey) {
                if (programs.length === 0) { exclude("No accepted tuition term, so the program is unknown."); continue; }
                if (!programs.includes(programKey)) continue;
            }

            const termStarts = terms.map((t) => t.effective_start).filter(isYmd).sort();
            const anchor = termStarts[0] ?? (isYmd(agreement.start_date) ? agreement.start_date : null);
            if (!anchor) { exclude("No enrollment start date to anchor the annual period on."); continue; }
            const anchorSource = termStarts[0] ? "tuition_term" : "agreement_start";
            /* `billingPeriodFor` would name 29 February in a common year; the anniversary is a decision, not a guess. */
            if (anchor.endsWith("-02-29")) { exclude("Enrollment anniversary is 29 February — its date in other years is not decided."); continue; }

            const current = billingPeriodFor("annual", anchor, asOf < anchor ? anchor : asOf);
            const periods = asOf < anchor ? [current] : [current, billingPeriodFor("annual", anchor, addOneDay(current.end))];
            for (const period of periods) {
                const dueOn = period.start;
                if (isYmd(agreement.end_date) && agreement.end_date < dueOn) continue;
                if (!effectiveOn(product, dueOn)) continue;
                const existing = input.charges.find(
                    (c) =>
                        c.product_id === product.id
                        && !LIVE_CHARGE_EXCLUDED.has((c.status ?? "").trim())
                        && isYmd(c.service_date) && c.service_date >= period.start && c.service_date <= period.end
                        && ((c.billable_source_type === "enrollment_agreement" && rows.some((r) => r.id === c.billable_source_id))
                            || c.child_member_id === child),
                );
                base.recipients.push({
                    childMemberId: child,
                    customerId: agreement.customer_id,
                    agreementId: agreement.id,
                    locationId: agreement.site_location_id,
                    programKey: programs[0] ?? null,
                    anchor,
                    anchorSource,
                    period,
                    dueOn,
                    amountCents: product.amountCents,
                    state: existing ? "already_charged" : dueOn <= asOf ? "due" : "upcoming",
                    existingChargeId: existing?.id ?? null,
                    occurrenceKey: annualFeeOccurrenceKey(product.id, period.start, agreement.id),
                });
            }
        }
        base.recipients.sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.childMemberId.localeCompare(b.childMemberId));
        return { ...base, status: "scheduled", reason: null };
    });
}

function addOneDay(ymd: string): string {
    const d = new Date(`${ymd}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}
