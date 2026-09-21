/**
 * WHAT AUTOPAY MAY COLLECT — the timing decision, and the refusal to invent one.
 *
 * The handler's own suite proves what it DOES with a collectible. This proves how that figure is
 * derived, and the two never stand in for each other.
 *
 * The risk here is narrow and specific: `on_due_date` is a Payments decision, and getting it wrong
 * in either direction is a real harm. Too early charges a family before the money is owed. Too late
 * is a missed collection nobody notices because the surface still says Autopay is on.
 */
import { describe, expect, it, vi } from "vitest";

import { actionableOnOrAfter, resolveAutopayCollectible } from "@/lib/financials/payments/autopayCollectible";

const ORG = "org-1";
const CUSTOMER = "cust-1";

vi.mock("@/lib/financials/childcarePaymentService", () => ({
    /* Outstanding is canonical money arithmetic owned elsewhere; this suite is about WHICH charges. */
    readChargeBalance: vi.fn(async (_s: unknown, _o: string, chargeId: string) => ({
        outstandingCents: Number(chargeId.split("-").pop()) || 0,
    })),
}));

type Row = Record<string, unknown>;

/**
 * Charges keyed so the mocked balance above reads the amount out of the id: `chg-<cents>`.
 *
 * The store HONOURS the `billable_source_id` filter, because that filter is the fix for a real
 * defect: the reader used to scan every posted charge in the organisation and filter in memory,
 * which silently lost charges past PostgREST's 1000-row cap. A fake that ignored the filter would
 * let that regression back in unnoticed.
 */
function store(charges: Row[], agreements: Row[] = []) {
    return {
        from(table: string) {
            const filters: Array<(r: Row) => boolean> = [];
            const self: Record<string, unknown> = {};
            self.select = () => self;
            self.eq = () => self;
            self.in = (col: string, values: unknown[]) => {
                filters.push((r) => values.includes(r[col]));
                return self;
            };
            const source = () => (table === "child_enrollment_agreements" ? agreements : charges);
            self.then = (res: (v: unknown) => unknown) =>
                Promise.resolve({ data: source().filter((r) => filters.every((f) => f(r))), error: null }).then(res);
            return self;
        },
    } as never;
}

const charge = (cents: number, dueDate: string | null, account = CUSTOMER): Row => ({
    id: `chg-${cents}`,
    billable_source_type: "customer",
    billable_source_id: account,
    due_date: dueDate,
    status: "posted",
});

describe("the due date decides, and the offset moves it", () => {
    it("collects a charge due today", async () => {
        const out = await resolveAutopayCollectible(store([charge(50_000, "2026-10-01")]), {
            orgId: ORG, customerId: CUSTOMER, timingOffsetDays: 0, asOf: "2026-10-01",
        });
        expect(out.totalCents).toBe(50_000);
        expect(out.charges).toHaveLength(1);
    });

    it("does not collect a charge that is not due yet, and reports when it will be", async () => {
        const out = await resolveAutopayCollectible(store([charge(50_000, "2026-10-05")]), {
            orgId: ORG, customerId: CUSTOMER, timingOffsetDays: 0, asOf: "2026-10-01",
        });
        expect(out.totalCents).toBe(0);
        expect(out.nextDueDate).toBe("2026-10-05");
    });

    it("still collects a charge that fell due in the past", async () => {
        const out = await resolveAutopayCollectible(store([charge(50_000, "2026-09-01")]), {
            orgId: ORG, customerId: CUSTOMER, timingOffsetDays: 0, asOf: "2026-10-01",
        });
        expect(out.totalCents).toBe(50_000);
    });

    /* A positive offset collects AFTER the due date — the grace period an organisation may want. */
    it("honours a positive offset by waiting that many days past the due date", async () => {
        const args = { orgId: ORG, customerId: CUSTOMER, timingOffsetDays: 3, asOf: "2026-10-02" };
        const early = await resolveAutopayCollectible(store([charge(50_000, "2026-10-01")]), args);
        expect(early.totalCents, "one day after due, but the offset says wait three").toBe(0);

        const onTime = await resolveAutopayCollectible(store([charge(50_000, "2026-10-01")]), {
            ...args, asOf: "2026-10-04",
        });
        expect(onTime.totalCents).toBe(50_000);
    });

    /* A negative offset collects BEFORE the due date, for an organisation that bills in advance. */
    it("honours a negative offset by collecting ahead of the due date", async () => {
        const out = await resolveAutopayCollectible(store([charge(50_000, "2026-10-05")]), {
            orgId: ORG, customerId: CUSTOMER, timingOffsetDays: -4, asOf: "2026-10-01",
        });
        expect(out.totalCents).toBe(50_000);
    });

    it("computes the actionable date from the due date and the offset", () => {
        expect(actionableOnOrAfter("2026-10-01", 0)).toBe("2026-10-01");
        expect(actionableOnOrAfter("2026-10-01", 3)).toBe("2026-10-04");
        expect(actionableOnOrAfter("2026-10-01", -1)).toBe("2026-09-30");
        /* Month boundaries are real dates, not string arithmetic. */
        expect(actionableOnOrAfter("2026-10-31", 1)).toBe("2026-11-01");
    });
});

describe("what is deliberately never collected", () => {
    /*
     * A CHARGE WITH NO DUE DATE HAS NO `on_due_date` MOMENT. Collecting it anyway would be Autopay
     * inventing a due date that Financials declined to state.
     */
    it("never collects a charge that has no due date", async () => {
        const out = await resolveAutopayCollectible(store([charge(50_000, null)]), {
            orgId: ORG, customerId: CUSTOMER, timingOffsetDays: 0, asOf: "2026-10-01",
        });
        expect(out.totalCents).toBe(0);
        expect(out.charges).toEqual([]);
    });

    it("never collects another account's charge", async () => {
        const out = await resolveAutopayCollectible(store([charge(50_000, "2026-10-01", "cust-OTHER")]), {
            orgId: ORG, customerId: CUSTOMER, timingOffsetDays: 0, asOf: "2026-10-01",
        });
        expect(out.totalCents).toBe(0);
    });

    /* A settled charge is history. Including it would put a $0 collection in front of the provider. */
    it("omits a charge with nothing outstanding", async () => {
        const out = await resolveAutopayCollectible(store([charge(0, "2026-10-01")]), {
            orgId: ORG, customerId: CUSTOMER, timingOffsetDays: 0, asOf: "2026-10-01",
        });
        expect(out.charges).toEqual([]);
    });
});

describe("the account's charges are found through both billable sources", () => {
    /*
     * Tuition is billed to an ENROLMENT AGREEMENT, not to the customer. If the reader only looked
     * for charges whose source is the customer, Autopay would silently never collect tuition —
     * which is most of what a family owes.
     */
    it("collects a charge billed to one of the account's enrolment agreements", async () => {
        const out = await resolveAutopayCollectible(
            store(
                [{ id: "chg-40000", billable_source_type: "enrollment_agreement", billable_source_id: "ea-1", due_date: "2026-10-01", status: "posted" }],
                [{ id: "ea-1" }],
            ),
            { orgId: ORG, customerId: CUSTOMER, timingOffsetDays: 0, asOf: "2026-10-01" },
        );
        expect(out.totalCents).toBe(40_000);
    });

    it("never collects a charge billed to another family's agreement", async () => {
        const out = await resolveAutopayCollectible(
            store(
                [{ id: "chg-40000", billable_source_type: "enrollment_agreement", billable_source_id: "ea-OTHER", due_date: "2026-10-01", status: "posted" }],
                [{ id: "ea-1" }],
            ),
            { orgId: ORG, customerId: CUSTOMER, timingOffsetDays: 0, asOf: "2026-10-01" },
        );
        expect(out.totalCents).toBe(0);
    });
});

describe("several charges", () => {
    it("sums only the charges that have come due, oldest first", async () => {
        const out = await resolveAutopayCollectible(
            store([
                charge(30_000, "2026-10-01"),
                charge(20_000, "2026-09-15"),
                charge(90_000, "2026-11-01"),
            ]),
            { orgId: ORG, customerId: CUSTOMER, timingOffsetDays: 0, asOf: "2026-10-01" },
        );
        expect(out.totalCents, "the November charge is not due").toBe(50_000);
        expect(out.charges.map((c) => c.dueDate)).toEqual(["2026-09-15", "2026-10-01"]);
        expect(out.nextDueDate).toBe("2026-11-01");
    });
});
