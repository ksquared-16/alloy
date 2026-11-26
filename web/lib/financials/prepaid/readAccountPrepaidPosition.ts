import type { SupabaseClient } from "@supabase/supabase-js";

import { CHILDCARE_BILLABLE_SOURCE_TYPES } from "@/lib/financials/billableSource";
import { heldCentsFor, readHoldsForPayments } from "@/lib/financials/prepaid/heldDeposits";
import { readAllPages, readInBatches } from "@/lib/financials/workspace/resolveFinancialPosition";
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

/**
 * Per-phase timing, for the measurement gate that decides whether this acquisition shape fits the
 * first-order budget. Optional and inert when absent: the product path pays nothing for it, and
 * offsets are recorded rather than durations so concurrency is visible instead of inferred.
 */
export type PrepaidReaderPhase = { name: string; at: number; end: number };

export type PrepaidReaderResult = {
    outcome: PrepaidPositionOutcome;
    diagnostics: PrepaidReaderDiagnostics;
    /** Present only when the caller asked for timing. */
    phases?: PrepaidReaderPhase[];
};

const t = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * HOW MANY RECEIPTS ONE ACCOUNT'S PREPAID POSITION MAY SCAN.
 *
 * Matched to `HOUSEHOLD_VIEW_SCAN_CAP`, the cap the household payment view already uses for the
 * same question at the same grain: one account, all of its receipts. It clears the largest measured
 * account — 4,750 receipts on the certification tenant — with room that is not wishful.
 *
 * Reaching it is UNAVAILABLE, never a smaller figure. The workspace's cohort scans may honestly
 * report "there is more"; an account's own money may not, because a total computed from part of a
 * ledger is not a partial answer — it is a wrong one.
 */
export const PREPAID_RECEIPT_SCAN_CAP = 25_000;

/**
 * @param authorized  The caller's request-time Financials read decision. `false` yields FORBIDDEN
 *                    without touching the database — the reader never decides authorization itself.
 */
export async function readAccountPrepaidPosition(
    supabase: SupabaseClient,
    args: { orgId: string; householdId: string; authorized: boolean; measure?: boolean },
): Promise<PrepaidReaderResult> {
    const orgId = t(args.orgId);
    const householdId = t(args.householdId);
    const diagnostics: PrepaidReaderDiagnostics = { queryCount: 0, agreementCount: 0, paymentCount: 0 };
    const t0 = args.measure ? performance.now() : 0;
    const phases: PrepaidReaderPhase[] | undefined = args.measure ? [] : undefined;
    const at = () => (args.measure ? Math.round(performance.now() - t0) : 0);
    const phase = async <T,>(name: string, run: () => Promise<T>): Promise<T> => {
        if (!phases) return run();
        const a = at();
        const v = await run();
        phases.push({ name, at: a, end: at() });
        return v;
    };
    const done = (outcome: PrepaidPositionOutcome): PrepaidReaderResult =>
        phases ? { outcome, diagnostics, phases } : { outcome, diagnostics };

    if (!args.authorized) return done({ state: "forbidden" });
    if (!orgId || !householdId) {
        // An unidentified account is not an empty one.
        return done({ state: "unavailable", reason: "missing org or household identity" });
    }

    // ── HOP 1 — the household's children, so agreements naming only a child are reachable. ───────
    diagnostics.queryCount += 1;
    const membersRes = await phase("members", () => Promise.resolve(supabase
        .from("customer_members")
        .select("id")
        .eq("org_id", orgId)
        .eq("customer_id", householdId)));
    if (membersRes.error) {
        return done({ state: "unavailable", reason: "household members unreadable" });
    }
    const memberIds = ((membersRes.data ?? []) as Array<{ id?: unknown }>).map((m) => t(m.id)).filter(Boolean);

    // ── HOP 2 — agreements by household OR by one of its children. No lifecycle filter. ──────────
    diagnostics.queryCount += 1;
    const agreementFilter = memberIds.length
        ? `customer_id.eq.${householdId},customer_member_id.in.(${memberIds.join(",")})`
        : `customer_id.eq.${householdId}`;
    const agreementsRes = await phase("agreements", () => Promise.resolve(supabase
        .from("child_enrollment_agreements")
        .select("id")
        .eq("org_id", orgId)
        .or(agreementFilter)));
    if (agreementsRes.error) {
        return done({ state: "unavailable", reason: "enrolment agreements unreadable" });
    }
    const agreementIds = ((agreementsRes.data ?? []) as Array<{ id?: unknown }>).map((a) => t(a.id)).filter(Boolean);
    diagnostics.agreementCount = agreementIds.length;

    // ── HOP 3 — the account's inbound childcare receipts. ────────────────────────────────────────
    diagnostics.queryCount += 1;
    const sourceFilter = agreementIds.length
        ? `and(billable_source_type.eq.customer,billable_source_id.eq.${householdId}),`
          + `and(billable_source_type.eq.enrollment_agreement,billable_source_id.in.(${agreementIds.join(",")}))`
        : `and(billable_source_type.eq.customer,billable_source_id.eq.${householdId})`;
    /*
     * ── PAGED, BECAUSE AN UNPAGED COHORT WAS A SCALE BOUNDARY (Payments V1 · W6-A) ──────────────
     *
     * This was one unpaged select. PostgREST answers at most `db-max-rows` — 1,000 here — to ANY
     * single query, with no error and no header anyone reads, so an account with more receipts than
     * that was answered with a page the caller treated as whole. HOP 4's `.in("payment_id", …)`
     * over those thousand ids then overflowed the request URI and failed outright, so the account
     * reported `unavailable`.
     *
     * That failure was HONEST — never a false zero — which is why it was safe to carry out of W6-B.
     * It was still a ceiling: measured on the certification tenant, a household holding 4,750
     * receipts on one agreement could not report a prepaid position at all.
     *
     * `readAllPages` is the canonical primitive and its doctrine decides the hard part: order
     * totally so paging cannot repeat or skip a row, and DECIDE WHAT TRUNCATION MEANS. For a single
     * account's money that is not negotiable — "a number computed from part of a ledger is wrong,
     * not partial" — so reaching the cap stays UNAVAILABLE rather than becoming a smaller figure
     * that looks whole.
     */
    const paymentsPaged = await phase("payments", async () => {
        try {
            const out = await readAllPages<Record<string, unknown>>(
                "account prepaid receipts",
                PREPAID_RECEIPT_SCAN_CAP,
                (from, to) => supabase
                    .from("payments")
                    .select("id, amount_cents, status")
                    .eq("org_id", orgId)
                    .eq("direction", "inbound")
                    // Refund rows are not receipts; they are read separately as reductions of one.
                    .is("refunds_payment_id", null)
                    .in("billable_source_type", [...CHILDCARE_BILLABLE_SOURCE_TYPES])
                    .or(sourceFilter)
                    /* Unique terminal key: range paging over a non-unique order repeats or skips. */
                    .order("id", { ascending: true })
                    .range(from, to),
            );
            return { rows: out.rows as Array<Record<string, unknown>> | null, truncated: out.truncated };
        } catch {
            return { rows: null as Array<Record<string, unknown>> | null, truncated: false };
        }
    });
    if (!paymentsPaged.rows) {
        return done({ state: "unavailable", reason: "payments unreadable" });
    }
    if (paymentsPaged.truncated) {
        /* More receipts than the scan may carry. A partial monetary figure is worse than none. */
        return done({ state: "unavailable", reason: "account exceeds the prepaid receipt scan cap" });
    }
    const payments: PrepaidPaymentRow[] = paymentsPaged.rows.map((p) => ({
        id: t(p.id),
        amountCents: Number(p.amount_cents) || 0,
        status: t(p.status),
    })).filter((p) => p.id);
    diagnostics.paymentCount = payments.length;

    const ok = <T,>(value: T): ReadOutcome<T> => ({ state: "ok", value });
    if (!payments.length) {
        // A household with no receipts is KNOWN-EMPTY, which is a real answer and not a failure.
        return done(resolvePrepaidPositionOutcome({
            payments: ok<readonly PrepaidPaymentRow[]>([]),
            allocations: ok<Readonly<Record<string, number>>>({}),
            refunds: ok<Readonly<Record<string, number>>>({}),
            holds: ok<Readonly<Record<string, number>>>({}),
        }));
    }
    const paymentIds = payments.map((p) => p.id);

    // ── HOP 4 — allocations, refunds and holds together. Batched, never per payment. ─────────────
    diagnostics.queryCount += 3; // holds costs a further disposition read inside the canonical reader
    const [allocRes, refundRes, holds] = await Promise.all([
        /*
         * BATCHED BY ID — the second half of the same defect. `readInBatches` spends the id list in
         * chunks of `ID_BATCH` so the request URI cannot overflow however many receipts the account
         * holds, and it throws rather than returning an empty result: a read that fails is an
         * error, never a cheaper falsehood.
         */
        phase("allocations", async () => {
            try {
                const rows = await readInBatches<Record<string, unknown>>(
                    "account prepaid allocations",
                    paymentIds,
                    (batch) => supabase
                        .from("payment_allocations")
                        .select("payment_id, allocated_amount_cents")
                        .eq("org_id", orgId)
                        .eq("status", "active")
                        .in("payment_id", batch),
                );
                return { data: rows as Array<Record<string, unknown>> | null, error: null as { message: string } | null };
            } catch (e) {
                return { data: null, error: { message: String(e) } };
            }
        }),
        phase("refunds", async () => {
            try {
                const rows = await readInBatches<Record<string, unknown>>(
                    "account prepaid refunds",
                    paymentIds,
                    (batch) => supabase
                        .from("payments")
                        .select("refunds_payment_id, amount_cents")
                        .eq("org_id", orgId)
                        .neq("status", "voided")
                        .in("refunds_payment_id", batch),
                );
                return { data: rows as Array<Record<string, unknown>> | null, error: null as { message: string } | null };
            } catch (e) {
                return { data: null, error: { message: String(e) } };
            }
        }),
        phase("holds", () => readHoldsForPayments(supabase, { orgId, paymentIds }).then(
            (h) => ({ ok: true as const, holds: h }),
            () => ({ ok: false as const, holds: [] }),
        )),
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

    return done(resolvePrepaidPositionOutcome({
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
    }));
}
