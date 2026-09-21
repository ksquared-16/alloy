import type { SupabaseClient } from "@supabase/supabase-js";

import { placeInBillingPeriod, type BillingCadence } from "@/lib/financials/billingPeriod";
import { readAllPages, readInBatches } from "@/lib/financials/workspace/resolveFinancialPosition";

/**
 * THE ACCOUNT'S CHARGE LEDGER — the canonical account-scoped read, and the ONE owner of the
 * reconciliation-relevant derivations over it.
 *
 * ── WHY THIS MODULE EXISTS ──
 *
 * `reconcileRows` and `pastDueFor` are pure and exported, so the arithmetic of responsibility,
 * balance and past due already had an owner. Their INPUT did not: the account's charges were read
 * and interpreted inside `buildFinancialsCardVMInner`, a private function inside the full
 * Financials view model. Any second consumer — the first-order runtime among them — could reach
 * the arithmetic and not the facts, which is exactly the shape that produces two answers to one
 * money question.
 *
 * So the read and its derivations move here and BOTH consumers use them. Not a copy for A′ and
 * a copy for the card: one implementation, one definition of what period a charge falls in, what
 * category it is, and whether it is posted, scheduled, draft, void or reversed.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT CARRY ──
 *
 * Presentation. No GL account, no template label, no subject name, no reduction provenance, no
 * currency formatting. Those need members, templates, mappings and policies — four more reads
 * that answer how a ledger LOOKS, never what it comes to. A first-order balance must not pay for
 * them, and the card still composes them on top of these rows.
 *
 * ── THE BALANCE MAY NOT BE PARTIAL ──
 *
 * The scan is paged, and exceeding the cap is an UNAVAILABILITY rather than a truncated answer.
 * A workspace may legitimately say "there is more than this scan carried" because it answers an
 * operational question across an organisation. This answers one family's account, where a number
 * derived from part of the ledger is not incomplete — it is wrong. The same rule the card already
 * applied, now applied once for both callers.
 */

/** Sentinel for an empty source list, so PostgREST filters to nothing rather than to everything. */
const NO_SOURCE_SENTINEL = "00000000-0000-0000-0000-000000000000";

/**
 * Not the PostgREST page size — `readAllPages` walks past that. This is the point beyond which one
 * balance read refuses to answer. Kept identical to the card's own cap so the two cannot diverge.
 */
export const ACCOUNT_CHARGE_SCAN_CAP = 25_000;

export const ACCOUNT_CHARGE_SELECT =
    "id, billable_source_type, billable_source_id, source_charge_id, charge_category, charge_type, status, "
    + "amount_cents, currency_code, charge_template_id, service_date, occurs_on, billable_on, due_date, "
    + "posted_at, voided_at, description, metadata, created_at";

/**
 * A charge's lifecycle as the reconciliation reads it.
 *
 * `reversed` is a PROJECTED state, not a stored one: a reversal is a new row pointing at the
 * original through `source_charge_id`, and the original stays exactly as posted because posted
 * money is immutable. Without the link the ledger shows a charge still reading `posted` beside an
 * unexplained credit.
 */
export type AccountChargeLifecycleStatus = "void" | "reversed" | "posted" | "scheduled" | "draft";

/**
 * THE RECONCILIATION INPUT CONTRACT — every field `reconcileRows` and `pastDueFor` actually read,
 * and nothing else.
 *
 * `FinancialsLedgerRow` structurally satisfies this, which is what lets the card keep passing its
 * own richer rows to the same two functions while the first-order runtime passes these.
 */
export type AccountChargeLedgerRow = {
    readonly chargeId: string;
    /*
     * NULLABLE, because `placeInBillingPeriod` is.
     *
     * A charge carrying no placeable date belongs to no period, and `reconcileRows` — which skips
     * any row whose `periodKey` differs from the one being reconciled — correctly excludes it. I
     * first declared this `string`, asserting that `FinancialsLedgerRow` structurally satisfied
     * this contract without checking; it does not, and the typechecker said so at four call
     * sites. Narrowing here would have forced a non-null assertion at the owner and invented a
     * period for a charge that has none.
     */
    readonly periodKey: string | null;
    readonly categoryKey: string;
    readonly amountCents: number;
    readonly status: string;
    readonly lifecycleStatus: AccountChargeLifecycleStatus;
    readonly correctionKind: string | null;
    readonly dueDate: string | null;
};

const t = (v: unknown): string => (v == null ? "" : String(v).trim());

/**
 * Which charges REVERSE which. `status <> 'void'` and `correction_kind = 'reversal'` are the same
 * predicate the database's unique index uses, so this and the constraint agree on what a live
 * reversal is.
 */
export function reversalBySourceChargeId(
    charges: readonly Record<string, unknown>[],
): Map<string, string> {
    const out = new Map<string, string>();
    for (const c of charges) {
        const sourceId = t(c.source_charge_id);
        const kind = t(((c.metadata ?? {}) as Record<string, unknown>).correction_kind);
        if (sourceId && kind === "reversal" && t(c.status) !== "void") out.set(sourceId, t(c.id));
    }
    return out;
}

/** The category a charge reconciles under. `charge_category`, else `charge_type`, else one-time. */
export function accountChargeCategoryKey(charge: Record<string, unknown>): string {
    return t(charge.charge_category) || t(charge.charge_type) || "one_time";
}

/**
 * A charge's lifecycle, from its own status plus the reversal link and today's date.
 *
 * A draft whose billable date has not arrived is SCHEDULED, and one whose date has arrived but
 * which was never posted is a DRAFT. Neither is owed, and they are different facts: a period
 * holding only unposted drafts otherwise reconciles to zero with nothing explaining where the
 * money went. A draft is not a debt; it is also not nothing.
 */
export function accountChargeLifecycleStatus(
    charge: Record<string, unknown>,
    reversedByChargeId: string | null,
    today: string,
): AccountChargeLifecycleStatus {
    const status = t(charge.status);
    if (status === "void") return "void";
    if (status !== "draft") return reversedByChargeId ? "reversed" : "posted";
    const billableOn = t(charge.billable_on) || null;
    return billableOn && billableOn > today ? "scheduled" : "draft";
}

/**
 * Raw charge rows → the reconciliation input contract. PURE.
 *
 * `grain` is the organisation's commercial cadence when the caller knows it. Omitted means
 * monthly, which is what every existing caller groups by — a ledger that silently regrouped would
 * restate history it did not generate.
 */
export function deriveAccountChargeLedgerRows(
    charges: readonly Record<string, unknown>[],
    today: string,
    grain?: { cadence: BillingCadence; anchor: string } | null,
): AccountChargeLedgerRow[] {
    const reversals = reversalBySourceChargeId(charges);
    return charges.map((c) => {
        const reversedByChargeId = reversals.get(t(c.id)) ?? null;
        return {
            chargeId: t(c.id),
            periodKey: placeInBillingPeriod(c, grain).key,
            categoryKey: accountChargeCategoryKey(c),
            amountCents: Number(c.amount_cents ?? 0),
            status: t(c.status),
            lifecycleStatus: accountChargeLifecycleStatus(c, reversedByChargeId, today),
            correctionKind: t(((c.metadata ?? {}) as Record<string, unknown>).correction_kind) || null,
            dueDate: t(c.due_date) || null,
        };
    });
}

export type AccountChargeLedgerRead =
    | { state: "ok"; rows: AccountChargeLedgerRow[]; raw: Record<string, unknown>[]; billableSourceIds: string[] }
    | { state: "unavailable"; reason: string };

/**
 * Read one account's charge ledger.
 *
 * SCOPE. An account's charges hang off two kinds of billable source: its enrolment AGREEMENTS,
 * and the HOUSEHOLD itself — the pre-enrolment fees (waitlist, registration, deposit) that have no
 * agreement to hang off. `billable_source_type` already carries the distinction; nothing is
 * invented here, and reading only the agreements would make those fees unreachable.
 *
 * AN ABSENT AGREEMENT IS NOT AN EMPTY ACCOUNT. A family incurs charges before they enrol, so no
 * agreement means the household is the only source, never that there is nothing to read.
 */
export async function readAccountChargeLedger(
    supabase: SupabaseClient,
    args: {
        orgId: string;
        /** Household grain. Required unless a member id resolves one. */
        customerId: string | null;
        /** Narrow to one child's agreements when the subject is a child. */
        customerMemberId?: string | null;
        today: string;
        grain?: { cadence: BillingCadence; anchor: string } | null;
    },
): Promise<AccountChargeLedgerRead> {
    const memberId = t(args.customerMemberId);
    const customerId = t(args.customerId) || null;
    if (!memberId && !customerId) return { state: "unavailable", reason: "no account subject in scope" };

    let agreementQuery = supabase
        .from("child_enrollment_agreements")
        .select("id, customer_member_id, customer_id, status")
        .eq("org_id", args.orgId);
    agreementQuery = memberId
        ? agreementQuery.eq("customer_member_id", memberId)
        : agreementQuery.eq("customer_id", customerId as string);

    const { data: agreementRows, error: agreementError } = await agreementQuery;
    // A failed agreement read is UNAVAILABLE. Treating it as "no agreements" would silently narrow
    // the account to its household charges and report a balance short by every enrolment's tuition.
    if (agreementError) return { state: "unavailable", reason: `account agreements unavailable: ${agreementError.message}` };

    const agreements = (agreementRows ?? []) as Array<{ id: string; customer_id: string | null }>;
    const resolvedCustomerId = customerId ?? (t(agreements[0]?.customer_id) || null);
    const billableSourceIds = [
        ...agreements.map((a) => t(a.id)).filter(Boolean),
        ...(resolvedCustomerId ? [resolvedCustomerId] : []),
    ];

    let page: { rows: Record<string, unknown>[]; truncated: boolean };
    try {
        page = await readAllPages<Record<string, unknown>>(
            "account charges",
            ACCOUNT_CHARGE_SCAN_CAP,
            (fromIndex, toIndex) =>
                supabase
                    .from("charges")
                    .select(ACCOUNT_CHARGE_SELECT)
                    .eq("org_id", args.orgId)
                    .in("billable_source_id", billableSourceIds.length ? billableSourceIds : [NO_SOURCE_SENTINEL])
                    // Ordered by `id` because paging over a non-unique key can repeat or skip rows
                    // across page boundaries, and a repeated charge is money counted twice.
                    .order("id", { ascending: true })
                    .range(fromIndex, toIndex) as never,
        );
    } catch (e: unknown) {
        return { state: "unavailable", reason: `account charges unavailable: ${e instanceof Error ? e.message : String(e)}` };
    }

    if (page.truncated) {
        return {
            state: "unavailable",
            reason: `this account holds more than ${ACCOUNT_CHARGE_SCAN_CAP.toLocaleString()} charges, `
                + "which is more than one balance read may carry",
        };
    }

    return {
        state: "ok",
        rows: deriveAccountChargeLedgerRows(page.rows, args.today, args.grain),
        raw: page.rows,
        billableSourceIds,
    };
}

/**
 * HOW MUCH POSTED MONEY HAS BEEN APPLIED TO EACH CHARGE.
 *
 * ── THE ONE BALANCE RULE ──
 *
 * An application counts only when it is ACTIVE and its parent payment is POSTED. A pending attempt
 * has not arrived; a reversed application was given back; neither moves a balance. The rule lives
 * here once, and `buildFinancialsCardVM` states the same predicate for the card's richer payment
 * rows — quoted from `jobPaymentBalances` rather than re-derived, so the childcare card and the
 * job drawer cannot answer the same question differently.
 *
 * ── WHY BOTH READS ARE BATCHED ──
 *
 * The charge ids go into the URL. On an account with a few hundred charges the request came back
 * `414 URI Too Long`, the error was discarded with the response, and the card read the empty
 * result as "none of this has been paid" — showing a family the whole balance again after they
 * had settled it. The payment-status read grows the same way and is batched for the same reason:
 * an over-long URI would be discarded exactly where a payment's status decides whether it counts.
 */
export async function readAppliedByChargeId(
    supabase: SupabaseClient,
    args: { orgId: string; chargeIds: readonly string[] },
): Promise<{ state: "ok"; appliedByChargeId: Map<string, number> } | { state: "unavailable"; reason: string }> {
    const chargeIds = [...new Set(args.chargeIds.map((c) => t(c)).filter(Boolean))];
    if (!chargeIds.length) return { state: "ok", appliedByChargeId: new Map() };

    let allocRows: Array<Record<string, unknown>>;
    try {
        allocRows = await readInBatches<Record<string, unknown>>(
            "money applied to these charges",
            chargeIds,
            (batch) => supabase
                .from("payment_allocations")
                .select("payment_id, charge_id, allocated_amount_cents, status")
                .eq("org_id", args.orgId)
                .eq("status", "active")
                .in("charge_id", batch) as never,
        );
    } catch (e: unknown) {
        /*
         * A FAILED APPLICATIONS READ IS UNAVAILABLE, NEVER "NOTHING HAS BEEN PAID".
         *
         * Returning an empty map here produces a confident balance equal to the full
         * responsibility — the exact failure the batching above exists to prevent, arrived at a
         * different way. Money is the one place a partial read must refuse to answer.
         */
        return { state: "unavailable", reason: `payment applications unavailable: ${e instanceof Error ? e.message : String(e)}` };
    }

    const paymentIds = [...new Set(allocRows.map((r) => t(r.payment_id)).filter(Boolean))];
    if (!paymentIds.length) return { state: "ok", appliedByChargeId: new Map() };

    let statusRows: Array<Record<string, unknown>>;
    try {
        statusRows = await readInBatches<Record<string, unknown>>(
            "statuses of payments named by applications",
            paymentIds,
            (batch) => supabase.from("payments").select("id, status").eq("org_id", args.orgId).in("id", batch) as never,
        );
    } catch (e: unknown) {
        return { state: "unavailable", reason: `payment statuses unavailable: ${e instanceof Error ? e.message : String(e)}` };
    }

    const statusByPaymentId = new Map(statusRows.map((r) => [t(r.id), t(r.status).toLowerCase()]));
    const appliedByChargeId = new Map<string, number>();
    for (const raw of allocRows) {
        const paymentId = t(raw.payment_id);
        const chargeId = t(raw.charge_id);
        if (!paymentId || !chargeId) continue;
        if (statusByPaymentId.get(paymentId) !== "posted") continue;
        appliedByChargeId.set(chargeId, (appliedByChargeId.get(chargeId) ?? 0) + (Number(raw.allocated_amount_cents) || 0));
    }
    return { state: "ok", appliedByChargeId };
}
