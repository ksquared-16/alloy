import type { SupabaseClient } from "@supabase/supabase-js";

import { CHILDCARE_BILLABLE_SOURCE_TYPES } from "@/lib/financials/billableSource";
import { heldCentsFor, readHoldsForPayments } from "@/lib/financials/prepaid/heldDeposits";
import {
    resolvePrepaidPositionOutcome,
    type PrepaidPaymentRow,
    type PrepaidPositionOutcome,
    type ReadOutcome,
} from "@/lib/financials/prepaid/prepaidAggregate";

/**
 * THE CANONICAL FIRST-ORDER PREPAID READER (P0-7.6 · A′).
 *
 * Acquires an account's receipts and the three facts the first-order Financials card consumes —
 * available, pending and held cents — in a bounded number of reads.
 *
 * WHY NOT `customer_id`. `payments` is not scoped by household directly: it is keyed through
 * `billable_source_type` / `billable_source_id`, and the DB permits `job`, `enrollment_agreement`,
 * `customer` or NULL. The canonical Financials VM narrows to the CHILDCARE pair, excluding `job`
 * and legacy NULL-source rows — that narrowing is a product decision, not a schema limit, so it is
 * taken from `CHILDCARE_BILLABLE_SOURCE_TYPES` rather than restated here.
 *
 * WHY TWO HOPS TO REACH THE AGREEMENTS. `child_enrollment_agreements.customer_id` is NULLABLE. An
 * agreement naming only the child is still that household's enrolment, and
 * `resolveBillableSourceHouseholdId` takes the same second hop when resolving forwards. An inverse
 * lookup filtering on `customer_id` alone would silently omit those agreements, drop their
 * receipts, and report money that exists as ZERO.
 *
 * NO LIFECYCLE FILTER ON AGREEMENTS, deliberately. Money already received must not disappear
 * because an agreement later ended, was superseded or was cancelled. The receipt is the fact; the
 * agreement is only how the receipt is addressed.
 *
 * BOUNDED BY SOURCES, NOT BY PAYMENTS. The read count is fixed regardless of how many receipts the
 * account has — which is the property that distinguishes it from the current path, where
 * `resolveHouseholdPaymentViews` issues TWO QUERIES PER PAYMENT.
 *
 * HELD-MONEY SEMANTICS ARE NOT REIMPLEMENTED. `readHoldsForPayments` and `heldCentsFor` own
 * `remainingCents`, which needs the hold dispositions; a second definition of "how much of this
 * receipt is still held" would be the second semantic owner this architecture forbids.
 *
 * NOTHING IS MAINTAINED and authorization is the caller's, evaluated at request time. This reader
 * takes an already-resolved authority decision rather than making one.
 */

export type PrepaidReaderDiagnostics = {
    /** Exact query count, so a per-payment regression is visible rather than inferred. */
    queryCount: number;
    agreementCount: number;
    paymentCount: number;
};

export type PrepaidReaderResult = {
    outcome: PrepaidPositionOutcome;
    diagnostics: PrepaidReaderDiagnostics;
};

const t = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * @param authorized  The caller's request-time Financials read decision. `false` yields FORBIDDEN
 *                    without touching the database — the reader never decides authorization itself.
 */
export async function readAccountPrepaidPosition(
    supabase: SupabaseClient,
    args: { orgId: string; householdId: string; authorized: boolean },
): Promise<PrepaidReaderResult> {
    const orgId = t(args.orgId);
    const householdId = t(args.householdId);
    const diagnostics: PrepaidReaderDiagnostics = { queryCount: 0, agreementCount: 0, paymentCount: 0 };

    if (!args.authorized) return { outcome: { state: "forbidden" }, diagnostics };
    if (!orgId || !householdId) {
        // An unidentified account is not an empty one.
        return { outcome: { state: "unavailable", reason: "missing org or household identity" }, diagnostics };
    }

    // ── HOP 1 — the household's children, so agreements naming only a child are reachable. ───────
    diagnostics.queryCount += 1;
    const membersRes = await supabase
        .from("customer_members")
        .select("id")
        .eq("org_id", orgId)
        .eq("customer_id", householdId);
    if (membersRes.error) {
        return { outcome: { state: "unavailable", reason: "household members unreadable" }, diagnostics };
    }
    const memberIds = ((membersRes.data ?? []) as Array<{ id?: unknown }>).map((m) => t(m.id)).filter(Boolean);

    // ── HOP 2 — agreements by household OR by one of its children. No lifecycle filter. ──────────
    diagnostics.queryCount += 1;
    const agreementFilter = memberIds.length
        ? `customer_id.eq.${householdId},customer_member_id.in.(${memberIds.join(",")})`
        : `customer_id.eq.${householdId}`;
    const agreementsRes = await supabase
        .from("child_enrollment_agreements")
        .select("id")
        .eq("org_id", orgId)
        .or(agreementFilter);
    if (agreementsRes.error) {
        return { outcome: { state: "unavailable", reason: "enrolment agreements unreadable" }, diagnostics };
    }
    const agreementIds = ((agreementsRes.data ?? []) as Array<{ id?: unknown }>).map((a) => t(a.id)).filter(Boolean);
    diagnostics.agreementCount = agreementIds.length;

    // ── HOP 3 — the account's inbound childcare receipts. ────────────────────────────────────────
    diagnostics.queryCount += 1;
    const sourceFilter = agreementIds.length
        ? `and(billable_source_type.eq.customer,billable_source_id.eq.${householdId}),`
          + `and(billable_source_type.eq.enrollment_agreement,billable_source_id.in.(${agreementIds.join(",")}))`
        : `and(billable_source_type.eq.customer,billable_source_id.eq.${householdId})`;
    const paymentsRes = await supabase
        .from("payments")
        .select("id, amount_cents, status")
        .eq("org_id", orgId)
        .eq("direction", "inbound")
        // Refund rows are not receipts; they are read separately as reductions of one.
        .is("refunds_payment_id", null)
        .in("billable_source_type", [...CHILDCARE_BILLABLE_SOURCE_TYPES])
        .or(sourceFilter);
    if (paymentsRes.error) {
        return { outcome: { state: "unavailable", reason: "payments unreadable" }, diagnostics };
    }
    const payments: PrepaidPaymentRow[] = ((paymentsRes.data ?? []) as Array<Record<string, unknown>>).map((p) => ({
        id: t(p.id),
        amountCents: Number(p.amount_cents) || 0,
        status: t(p.status),
    })).filter((p) => p.id);
    diagnostics.paymentCount = payments.length;

    const ok = <T,>(value: T): ReadOutcome<T> => ({ state: "ok", value });
    if (!payments.length) {
        // A household with no receipts is KNOWN-EMPTY, which is a real answer and not a failure.
        return {
            outcome: resolvePrepaidPositionOutcome({
                payments: ok<readonly PrepaidPaymentRow[]>([]),
                allocations: ok<Readonly<Record<string, number>>>({}),
                refunds: ok<Readonly<Record<string, number>>>({}),
                holds: ok<Readonly<Record<string, number>>>({}),
            }),
            diagnostics,
        };
    }
    const paymentIds = payments.map((p) => p.id);

    // ── HOP 4 — allocations, refunds and holds together. Batched, never per payment. ─────────────
    diagnostics.queryCount += 3; // holds costs a further disposition read inside the canonical reader
    const [allocRes, refundRes, holds] = await Promise.all([
        supabase
            .from("payment_allocations")
            .select("payment_id, allocated_amount_cents")
            .eq("org_id", orgId)
            .eq("status", "active")
            .in("payment_id", paymentIds),
        supabase
            .from("payments")
            .select("refunds_payment_id, amount_cents")
            .eq("org_id", orgId)
            .neq("status", "voided")
            .in("refunds_payment_id", paymentIds),
        readHoldsForPayments(supabase, { orgId, paymentIds }).then(
            (h) => ({ ok: true as const, holds: h }),
            () => ({ ok: false as const, holds: [] }),
        ),
    ]);
    diagnostics.queryCount += 1; // the dispositions read inside readHoldsForPayments

    const sumBy = (rows: Array<Record<string, unknown>>, key: string, amount: string) => {
        const out: Record<string, number> = {};
        for (const r of rows) {
            const id = t(r[key]);
            if (!id) continue;
            out[id] = (out[id] ?? 0) + (Number(r[amount]) || 0);
        }
        return out;
    };

    return {
        outcome: resolvePrepaidPositionOutcome({
            payments: ok<readonly PrepaidPaymentRow[]>(payments),
            allocations: allocRes.error
                ? { state: "unavailable", reason: "allocations unreadable" }
                : ok(sumBy((allocRes.data ?? []) as Array<Record<string, unknown>>, "payment_id", "allocated_amount_cents")),
            refunds: refundRes.error
                ? { state: "unavailable", reason: "refunds unreadable" }
                : ok(sumBy((refundRes.data ?? []) as Array<Record<string, unknown>>, "refunds_payment_id", "amount_cents")),
            holds: holds.ok
                ? ok(Object.fromEntries(paymentIds.map((id) => [id, heldCentsFor(id, holds.holds)])))
                : { state: "unavailable", reason: "holds unreadable" },
        }),
        diagnostics,
    };
}
