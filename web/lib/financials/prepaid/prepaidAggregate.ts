/**
 * THE FIRST-ORDER PREPAID AGGREGATE (P0-7.6 · A′).
 *
 * The Focus Panel's first-order Financials card consumes three scalars — available, pending and
 * held cents. The canonical path reaches them by building full payment VIEWS, which issue TWO
 * QUERIES PER PAYMENT (`readPaymentUnappliedCents`, `readPaymentRefundedCents`) inside a loop.
 * That is an N+1, and its cost grows with the account's payment count.
 *
 * This derives the SAME three scalars from four bounded reads, whatever the payment count:
 *
 *   1  payments for the account                      (id, amount_cents, status)
 *   2  active allocations for those payments         (allocated_amount_cents)   ┐ independent
 *   3  refunds referencing those payments            (amount_cents)             ├ of each other
 *   4  holds against those payments                  (held cents by payment)    ┘
 *
 * Reads 2-4 depend only on read 1, so the shape is TWO SERIAL HOPS, not N+1.
 *
 * NOT A SECOND SEMANTIC OWNER. The arithmetic below is the arithmetic the canonical owners already
 * perform — `unapplied = amount − active allocations − non-voided refunds`, `available` iff the
 * receipt is posted, held carved out of the remainder — restated over batched rows instead of
 * per-payment round trips. `prepaidAggregateParity.test.ts` proves it against
 * `resolveAccountPrepaidPosition` over the same fixtures that define the canonical behaviour; if
 * the canonical rule changes, that test fails rather than this drifting quietly.
 *
 * NOTHING IS MAINTAINED. This is a live read. There is no persisted total and no freshness
 * contract, which is why it replaced the maintained-fact candidate the architecture first assumed.
 */

/** A payment row, as read in bulk for the account. */
export type PrepaidPaymentRow = {
    readonly id: string;
    readonly amountCents: number;
    /** Canonical payment status. Only `posted` money is available; everything else is pending. */
    readonly status: string;
};

export type PrepaidAggregateInput = {
    readonly payments: readonly PrepaidPaymentRow[];
    /** Active allocations, by payment id. Voided/superseded allocations must be excluded by the reader. */
    readonly allocatedCentsByPayment: Readonly<Record<string, number>>;
    /** Non-voided refunds referencing each payment, by the REFUNDED payment's id. */
    readonly refundedCentsByPayment: Readonly<Record<string, number>>;
    /** Held cents by payment id. */
    readonly heldCentsByPayment: Readonly<Record<string, number>>;
};

export type PrepaidAggregate = {
    readonly availableCents: number;
    readonly pendingCents: number;
    readonly heldCents: number;
};

/**
 * Sum the account's prepaid position from batched rows.
 *
 * Mirrors `resolveAccountPrepaidPosition` exactly, including the parts that look like edge cases
 * and are not:
 *   · a receipt with nothing left unapplied is NOT a position and contributes nothing;
 *   · a negative remainder is skipped rather than netted against another receipt's good money;
 *   · a hold is bounded by the remainder, so a hold larger than the receipt cannot drive available
 *     money negative;
 *   · holding part of a PENDING receipt never promotes it to available.
 */
export function aggregatePrepaidPosition(input: PrepaidAggregateInput): PrepaidAggregate {
    let availableCents = 0;
    let pendingCents = 0;
    let heldCents = 0;

    for (const p of input.payments) {
        const allocated = input.allocatedCentsByPayment[p.id] ?? 0;
        const refunded = input.refundedCentsByPayment[p.id] ?? 0;
        const unapplied = (Number(p.amountCents) || 0) - allocated - refunded;
        // Zero is spent money and negative would mean applications exceed the receipt; neither is
        // a position, and summing a negative here would net one receipt's error against another.
        if (unapplied <= 0) continue;

        const rawHeld = input.heldCentsByPayment[p.id] ?? 0;
        const held = Math.max(0, Math.min(rawHeld, unapplied));
        const remainder = unapplied - held;

        /*
         * HELD IS CARVED OUT REGARDLESS OF STATUS; STATUS ONLY DECIDES WHERE THE REMAINDER GOES.
         *
         * My first draft kept the whole unapplied amount in `pending` for a pending receipt, on
         * the reasoning that money which has not posted cannot meaningfully be "held". The oracle
         * disagrees and it is right: a hold is a restriction recorded against the receipt, and it
         * is reported whether or not the receipt has cleared. The parity matrix caught this at
         * specimen G2 — pending 40,000 against the oracle's 30,000 — which is precisely the kind
         * of quiet 10,000-cent divergence that would have shipped as a wrong number on a card.
         */
        heldCents += held;
        if (p.status === "posted") availableCents += remainder;
        else pendingCents += remainder;
    }

    return { availableCents, pendingCents, heldCents };
}

/**
 * READ OUTCOMES — why the aggregate cannot be a function of rows alone.
 *
 * `aggregatePrepaidPosition` returns three numbers. Handed empty maps it returns three ZEROES,
 * which is the correct answer for an account with no money and a DANGEROUS LIE for an account
 * whose allocation read failed. The caller cannot tell those apart from the rows, so the outcome
 * must be carried, not inferred: UNKNOWN is not ZERO, and a failed read is not an empty account.
 *
 * Each of the four reads reports its own outcome. Any failure makes the whole position
 * UNAVAILABLE rather than emitting a confident partial amount — a prepaid figure computed from
 * three of four inputs is not a smaller truth, it is a wrong number.
 */
export type ReadOutcome<T> =
    | { readonly state: "ok"; readonly value: T }
    | { readonly state: "unavailable"; readonly reason: string }
    | { readonly state: "forbidden" };

export type PrepaidPositionOutcome =
    | { readonly state: "ok"; readonly position: PrepaidAggregate }
    | { readonly state: "unavailable"; readonly reason: string }
    | { readonly state: "forbidden" };

/**
 * Resolve the account's prepaid position from four read outcomes.
 *
 * FORBIDDEN is checked before UNAVAILABLE: a caller who may not see the money must be told that,
 * not told the read failed, and certainly not shown a zero.
 */
export function resolvePrepaidPositionOutcome(reads: {
    payments: ReadOutcome<readonly PrepaidPaymentRow[]>;
    allocations: ReadOutcome<Readonly<Record<string, number>>>;
    refunds: ReadOutcome<Readonly<Record<string, number>>>;
    holds: ReadOutcome<Readonly<Record<string, number>>>;
}): PrepaidPositionOutcome {
    const all = [reads.payments, reads.allocations, reads.refunds, reads.holds];
    if (all.some((r) => r.state === "forbidden")) return { state: "forbidden" };
    const failed = all.find((r) => r.state === "unavailable");
    if (failed && failed.state === "unavailable") return { state: "unavailable", reason: failed.reason };

    return {
        state: "ok",
        position: aggregatePrepaidPosition({
            payments: (reads.payments as { state: "ok"; value: readonly PrepaidPaymentRow[] }).value,
            allocatedCentsByPayment: (reads.allocations as { state: "ok"; value: Readonly<Record<string, number>> }).value,
            refundedCentsByPayment: (reads.refunds as { state: "ok"; value: Readonly<Record<string, number>> }).value,
            heldCentsByPayment: (reads.holds as { state: "ok"; value: Readonly<Record<string, number>> }).value,
        }),
    };
}

/**
 * THE READER'S SCOPING PROBLEM — read this before building it (P0-7.6 · A′ Slice 1 item C-reader).
 *
 * The pure aggregate above is proven against the oracle. The READER that feeds it is NOT yet
 * built, and it is harder than the four-reads sketch implies, for a reason worth recording rather
 * than rediscovering.
 *
 * AN ACCOUNT'S PAYMENTS ARE NOT SELECTABLE BY `customer_id`. `payments` is scoped by
 * `billable_source_type` / `billable_source_id`, and the canonical reader
 * (`resolveHouseholdPaymentViews`) therefore SCANS the org's inbound childcare payments in pages
 * and resolves each distinct source to a household afterwards. A diagnostic query I measured
 * earlier used `.eq("customer_id", …)`; that is not the same query and its timings are not
 * evidence about this reader.
 *
 * THE BOUNDED SHAPE, from the two source types in `CHILDCARE_BILLABLE_SOURCE_TYPES`:
 *   · `customer`             — `billable_source_id` IS the household id;
 *   · `enrollment_agreement` — resolves through `child_enrollment_agreements` to the household.
 *
 * MY FIRST VERSION OF THIS NOTE WAS INCOMPLETE IN A WAY THAT WOULD HAVE CAUSED A FALSE ZERO.
 * It said the household's agreements are "child_enrollment_agreements by customer".
 * `child_enrollment_agreements.customer_id` IS NULLABLE, and `resolveBillableSourceHouseholdId`
 * falls back to the agreement's `customer_member_id` → `customer_members.customer_id` when it is
 * absent. An inverse lookup that filtered on `customer_id` alone would silently omit those
 * agreements, drop their receipts, and report prepaid money that exists as ZERO — the precise
 * failure this architecture's UNKNOWN/ZERO rules exist to prevent, arrived at from the other side.
 *
 * TWO CANDIDATE READER DESIGNS, neither yet measured:
 *
 *   (i) INVERSE TRAVERSAL — members for the household, then agreements by `customer_id` OR
 *       `customer_member_id`, then payments by source, then batched allocations || refunds ||
 *       holds, then dispositions. Bounded by agreement/member count rather than payment count,
 *       but roughly seven reads at FIVE hops of depth. At the ~120 ms per hop this database shows,
 *       that is ~600 ms — which would make the CARD path binding (it currently ends at 197 ms
 *       against a 428 ms queue path) and put the product model at roughly 1,001 ms, i.e. AT the
 *       target with no headroom. Depth is the risk here, not row count.
 *
 *  (ii) SCAN-AND-BATCH — keep the canonical shape (paged org scan of inbound childcare payments,
 *       sources resolved to households) and replace ONLY the per-payment N+1 with batched
 *       allocation, refund and hold reads. Far shallower, and it removes the part that actually
 *       scales with payment count. Its exposure is the org-wide scan, which the canonical path
 *       already accepts and caps.
 *
 * (ii) looks the better trade for the first-order budget, because the N+1 is what scales while the
 * scan is already bounded and already paid today. Neither is chosen here: this is a note about
 * what the measurement must decide, not a decision taken without one.
 *
 * REUSE `readHoldsForPayments` rather than reimplementing it: `remainingCents` needs the
 * dispositions, and a second implementation of "how much of this receipt is still held" would be
 * exactly the second semantic owner this architecture forbids.
 *
 * PARITY MUST BE RE-PROVEN AT THE READER LEVEL. The matrix above proves the ARITHMETIC matches;
 * it says nothing about whether the reader selects the same receipts the canonical path does.
 * Those are different claims and only the first is currently evidenced.
 */
