/**
 * MONEY THAT IS NOT CANONICALLY AVAILABLE IS NOT PREPAID (§21).
 *
 * ── WHY THIS IS DETERMINISTIC AND CLASSIFIED ─────────────────────────────────────────────────
 *
 * `PREPAID_UNAVAILABLE_STATE_DETERMINISTICALLY_CERTIFIED`. Core's payment model has no
 * operator-reachable way to park a receipt in a pending provider state before Payments
 * productization — there is no card/ACH lifecycle to drive from a surface — so there is no mounted
 * specimen to point a browser at, and inventing a fake provider lifecycle to manufacture one would
 * certify a fiction. The availability predicate itself is the authority, and it is tested directly.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────────────────────
 *
 * `fundAvailabilityOf` is the single place that decides. Only a POSTED receipt is available; every
 * other status — pending, processing, failed, an unknown one this code has never seen — falls to
 * `pending` and is excluded from the available figure. Failing toward do-not-offer is the whole
 * design: offering money the organisation does not yet have is how an operator settles an
 * obligation with funds that later vanish.
 */
import { describe, expect, it } from "vitest";

import { fundAvailabilityOf, resolveAccountPrepaidPosition } from "@/lib/financials/prepaid/availableFunds";

const payment = (over: Partial<Record<string, unknown>> = {}) =>
    ({
        paymentId: "pay-1", status: "posted", unappliedCents: 20_000,
        payerCustomerId: "cust-1", payerLabel: "Cert Certhouse", receivedAt: "2026-09-18",
        ...over,
    }) as never;

describe("THE GATE — only posted money is available", () => {
    it("calls a posted receipt available", () => {
        expect(fundAvailabilityOf({ status: "posted", unappliedCents: 20_000 } as never)).toBe("available");
    });

    /* Every other state, including ones this code has never seen, fails toward do-not-offer. */
    it("calls everything else pending", () => {
        for (const status of ["pending", "processing", "requires_action", "failed", "voided", "", "something_new"]) {
            expect(fundAvailabilityOf({ status, unappliedCents: 20_000 } as never), `${status} is not available`)
                .toBe("pending");
        }
    });
});

describe("THE GATE — pending money never reaches the available figure", () => {
    it("excludes a pending receipt from available and reports it separately", () => {
        const pos = resolveAccountPrepaidPosition([
            payment({ paymentId: "pay-posted", status: "posted", unappliedCents: 20_000 }),
            payment({ paymentId: "pay-pending", status: "pending", unappliedCents: 50_000 }),
        ]);
        expect(pos.availableCents, "only the posted receipt counts").toBe(20_000);
        expect(pos.pendingCents, "and the pending money is still known, not discarded").toBe(50_000);
    });

    /* An account whose every receipt is pending offers NOTHING, however large the sum. */
    it("offers nothing when all the money is pending", () => {
        const pos = resolveAccountPrepaidPosition([
            payment({ paymentId: "p1", status: "processing", unappliedCents: 100_000 }),
            payment({ paymentId: "p2", status: "requires_action", unappliedCents: 250_000 }),
        ]);
        expect(pos.availableCents).toBe(0);
        expect(pos.pendingCents).toBe(350_000);
    });

    /*
     * A FULLY APPLIED RECEIPT IS HISTORY, NOT A POSITION. Listing it as a zero is what would put
     * "prepaid: $0.00" beside every settled receipt an account ever had — the noise the zero-silence
     * doctrine forbids, arriving from the model rather than the surface.
     */
    it("omits a spent receipt entirely rather than reporting it as zero", () => {
        const pos = resolveAccountPrepaidPosition([
            payment({ paymentId: "spent", status: "posted", unappliedCents: 0 }),
        ]);
        expect(pos.availableCents).toBe(0);
        expect(pos.positions, "no zero-valued position is manufactured").toHaveLength(0);
    });

    /*
     * HELD FUNDS BECAME SUPPORTED IN W4. This case previously locked the DECLARATION that they were
     * not — which was the honest answer while nothing marked a receipt as held. `payment_holds` is
     * that mark, so the declaration is now `true` and a zero is a measurement.
     *
     * The doctrine underneath is unchanged and is what the second assertion protects: held money is
     * never counted as available.
     */
    it("declares held funds supported, and still never counts them as available", () => {
        const pos = resolveAccountPrepaidPosition([payment()]);
        expect((pos as unknown as { heldSupported?: boolean }).heldSupported).toBe(true);

        const withHold = resolveAccountPrepaidPosition(
            [payment({ paymentId: "p-held", status: "posted", unappliedCents: 40_000 })],
            { "p-held": 15_000 },
        );
        expect(withHold.heldCents).toBe(15_000);
        expect(withHold.availableCents, "held money is carved out, not added in").toBe(25_000);
    });
});
