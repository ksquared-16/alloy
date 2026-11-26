/**
 * BP V2 Slice 6A — Due / Past due: the Financials classification (moved unchanged from the card's view
 * model), the cross-household reader over it (paging, scope, truncation, failure), and the two Billing
 * projections. The live suite proves card-to-view parity on real data.
 */
import { describe, expect, it } from "vitest";
import { dueWithinFor, notYetDueFor, pastDueChargeIds, pastDueFor } from "@/lib/financials/account/accountDueClassification";
import * as cardModule from "@/lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM";
import { readAccountDuePositions } from "@/lib/financials/account/accountDuePositions";
import type { AccountChargeLedgerRow } from "@/lib/financials/account/accountChargeLedger";
import { loadOverduePayments, loadPaymentsDue } from "@/lib/businessProcesses/projections/billingProjections";
import { DOMAIN_PROJECTION_CATALOG } from "@/lib/businessProcesses/projections/domainProjectionCatalog";
import type { DomainProjectionScope } from "@/lib/businessProcesses/projections/domainProjectionTypes";
import { projectionTableStub } from "./projectionTableStub";

const TODAY = "2026-10-21";
const row = (chargeId: string, dueDate: string | null, amountCents: number, over: Partial<AccountChargeLedgerRow> = {}): AccountChargeLedgerRow =>
    ({ chargeId, periodKey: "2026-10", categoryKey: "tuition", amountCents, status: "posted", lifecycleStatus: "posted", correctionKind: null, dueDate, ...over }) as AccountChargeLedgerRow;

describe("the classification moved, unchanged, and the card uses it", () => {
    it("the card's view model exports the SAME functions (one copy)", () => {
        expect(cardModule.pastDueFor).toBe(pastDueFor);
        expect(cardModule.notYetDueFor).toBe(notYetDueFor);
    });

    it("boundaries: yesterday past due; today and today+6 due within; today+7 outside; today is not 'not yet due'", () => {
        const rows = [row("y", "2026-10-20", 1000), row("t", TODAY, 1000), row("p6", "2026-10-27", 1000), row("p7", "2026-10-28", 1000)];
        expect(pastDueFor(rows, TODAY)).toMatchObject({ amountCents: 1000, oldestDueDate: "2026-10-20", agingDays: 1 });
        expect(pastDueChargeIds(rows, TODAY)).toEqual(["y"]);
        expect(dueWithinFor(rows, TODAY, "2026-10-27")).toEqual({ amountCents: 2000, nextDueDate: TODAY, lastDueDate: "2026-10-27", chargeIds: ["t", "p6"] });
        expect(notYetDueFor(rows, TODAY)).toEqual({ amountCents: 2000, nextDueDate: "2026-10-27" }); // p6 + p7, never today
    });

    it("residual after applied money; fully settled excluded; reversed and reversal excluded; drafts and undated excluded", () => {
        const rows = [
            row("half", "2026-10-22", 1000),
            row("paid", "2026-10-22", 1000),
            row("rev", "2026-10-22", 1000, { lifecycleStatus: "reversed" }),
            row("revr", "2026-10-22", -1000, { correctionKind: "reversal" }),
            row("draft", "2026-10-22", 1000, { status: "draft" }),
            row("nodue", null, 1000),
        ];
        const applied = new Map([["half", 400], ["paid", 1000]]);
        expect(dueWithinFor(rows, TODAY, "2026-10-27", applied)).toMatchObject({ amountCents: 600, chargeIds: ["half"] });
    });

    it("past due keeps credits (they reduce it) and lists only the positive, still-owed charges as sources", () => {
        const rows = [row("a", "2026-10-01", 1000), row("credit", "2026-10-01", -300), row("settled", "2026-10-02", 500)];
        const applied = new Map([["settled", 500]]);
        expect(pastDueFor(rows, TODAY, applied)?.amountCents).toBe(700);
        expect(pastDueChargeIds(rows, TODAY, applied)).toEqual(["a"]);
    });
});

/* ── The cross-household reader over an in-memory PostgREST ───────────────────────────────────── */
const ORG = "org-1";
const R = "site-r";
const L = "site-l";
function ledgerFixture(extra: Record<string, unknown>[] = []) {
    const charges: Record<string, unknown>[] = [
        { id: "c-r1", org_id: ORG, billable_source_type: "enrollment_agreement", billable_source_id: "ag-r", status: "posted", amount_cents: 1000, due_date: "2026-10-10", metadata: {} },
        { id: "c-r2", org_id: ORG, billable_source_type: "enrollment_agreement", billable_source_id: "ag-r", status: "posted", amount_cents: 2000, due_date: "2026-10-23", metadata: {} },
        { id: "c-r3", org_id: ORG, billable_source_type: "enrollment_agreement", billable_source_id: "ag-r", status: "posted", amount_cents: 500, due_date: "2026-11-30", metadata: {} },
        { id: "c-l1", org_id: ORG, billable_source_type: "enrollment_agreement", billable_source_id: "ag-l", status: "posted", amount_cents: 700, due_date: "2026-10-05", metadata: {} },
        { id: "c-h1", org_id: ORG, billable_source_type: "customer", billable_source_id: "h-3", status: "posted", amount_cents: 900, due_date: TODAY, metadata: {} },
        { id: "c-paid", org_id: ORG, billable_source_type: "enrollment_agreement", billable_source_id: "ag-p", status: "posted", amount_cents: 400, due_date: "2026-10-01", metadata: {} },
        ...extra,
    ];
    return {
        charges,
        child_enrollment_agreements: [
            { id: "ag-r", org_id: ORG, customer_id: "h-1", site_location_id: R },
            { id: "ag-l", org_id: ORG, customer_id: "h-2", site_location_id: L },
            { id: "ag-p", org_id: ORG, customer_id: "h-4", site_location_id: R },
        ],
        payment_allocations: [{ org_id: ORG, payment_id: "p-1", charge_id: "c-paid", allocated_amount_cents: 400, status: "active" }],
        payments: [{ id: "p-1", org_id: ORG, status: "posted" }],
        customers: [{ id: "h-1", org_id: ORG, name: "Rivera" }, { id: "h-2", org_id: ORG, name: "Lund" }, { id: "h-3", org_id: ORG, name: "Okafor" }, { id: "h-4", org_id: ORG, name: "Paid" }],
    };
}
const read = (tables: ReturnType<typeof ledgerFixture>, scope: { siteScope: "all" | "restricted"; allowedSiteLocationIds: string[]; activeSiteLocationId: string | null }, candidateCap?: number) =>
    readAccountDuePositions(projectionTableStub(tables as never), { orgId: ORG, today: TODAY, windowEnd: "2026-10-27", ...scope, candidateCap });

describe("readAccountDuePositions — the card's chain across accounts", () => {
    it("one account per household; multi-charge households keep every source; settled accounts drop out", async () => {
        const r = await read(ledgerFixture(), { siteScope: "all", allowedSiteLocationIds: [], activeSiteLocationId: null });
        if (r.state !== "ok") throw new Error(r.reason);
        const by = Object.fromEntries(r.accounts.map((a) => [a.customerId, a]));
        expect(Object.keys(by).sort()).toEqual(["h-1", "h-2", "h-3"]);
        expect(by["h-1"]!.pastDue).toMatchObject({ amountCents: 1000, oldestDueDate: "2026-10-10" });
        expect(by["h-1"]!.dueWithin).toMatchObject({ amountCents: 2000, chargeIds: ["c-r2"] }); // c-r3 (Nov 30) is outside
        expect(by["h-3"]!.dueWithin).toMatchObject({ chargeIds: ["c-h1"], nextDueDate: TODAY });
        expect(by["h-3"]!.siteLocationId).toBeNull(); // household account → org-scoped
        expect(r.truncated).toBe(false);
    });

    it("scope is Financials' location rule per charge", async () => {
        const rOnly = await read(ledgerFixture(), { siteScope: "restricted", allowedSiteLocationIds: [R], activeSiteLocationId: null });
        expect(rOnly.state === "ok" && rOnly.accounts.map((a) => a.customerId).sort()).toEqual(["h-1"]);
        const selL = await read(ledgerFixture(), { siteScope: "all", allowedSiteLocationIds: [], activeSiteLocationId: L });
        expect(selL.state === "ok" && selL.accounts.map((a) => a.customerId)).toEqual(["h-2"]);
    });

    it("pages past 1,000 and 2,000 rows to completion — no older charge is dropped", async () => {
        const many = Array.from({ length: 2600 }, (_, i) => ({
            id: `m-${String(i).padStart(5, "0")}`, org_id: ORG, billable_source_type: "enrollment_agreement", billable_source_id: "ag-l",
            status: "posted", amount_cents: 100, due_date: i === 0 ? "2026-01-02" : "2026-10-19", metadata: {},
        }));
        const r = await read(ledgerFixture(many), { siteScope: "all", allowedSiteLocationIds: [], activeSiteLocationId: null });
        if (r.state !== "ok") throw new Error(r.reason);
        const h2 = r.accounts.find((a) => a.customerId === "h-2")!;
        expect(h2.pastDue?.amountCents).toBe(700 + 2600 * 100);
        expect(h2.pastDue?.oldestDueDate).toBe("2026-01-02"); // the oldest, first-read row survived paging
        expect(r.candidateCharges).toBe(2600 + 5);
        expect(r.truncated).toBe(false);
    });

    it("a cohort past the candidate cap is TRUNCATED (unknown), never silently short", async () => {
        const r = await read(ledgerFixture(), { siteScope: "all", allowedSiteLocationIds: [], activeSiteLocationId: null }, 3);
        expect(r.state === "ok" && r.truncated).toBe(true);
    });

    it("a failed read is unavailable, not zero", async () => {
        const broken = { ...projectionTableStub(ledgerFixture() as never), from: () => { throw new Error("db down"); } };
        const r = await readAccountDuePositions(broken as never, { orgId: ORG, today: TODAY, windowEnd: "2026-10-27", siteScope: "all", allowedSiteLocationIds: [], activeSiteLocationId: null });
        expect(r).toMatchObject({ state: "unavailable" });
    });
});

/* ── The two Billing projections over the reader ─────────────────────────────────────────────── */
const allowRead = (async () => ({ ok: true as const })) as never;
const denyRead = (async () => ({ ok: false as const, message: "no fin.read" })) as never;
const ctx = (scope: DomainProjectionScope) => ({ orgId: ORG, userId: "u", scope });
const ALL: DomainProjectionScope = { siteScope: "all", allowedSiteLocationIds: [] };
const ACCOUNTS = {
    state: "ok" as const, truncated: false, candidateCharges: 4,
    accounts: [
        { customerId: "h-1", householdName: "Rivera", siteLocationId: R, pastDue: { amountCents: 130000, oldestDueDate: "2026-10-10", agingDays: 11 }, pastDueChargeIds: ["c-1", "c-2"], dueWithin: { amountCents: 2500, nextDueDate: TODAY, lastDueDate: "2026-10-25", chargeIds: ["c-3", "c-4"] } },
        { customerId: "h-2", householdName: null, siteLocationId: L, pastDue: { amountCents: -200, oldestDueDate: "2026-10-01", agingDays: 20 }, pastDueChargeIds: [], dueWithin: null },
    ],
};
const deps = (over: Record<string, unknown> = {}) => ({ assertRead: allowRead, readDue: (async () => ACCOUNTS) as never, businessDate: (async () => TODAY) as never, ...over });

describe("payments_due / overdue_payments — group, label and present Financials' answer", () => {
    it("overdue: one row per household with a POSITIVE past due (the card's display rule); the oldest charge is the source", async () => {
        const r = await loadOverduePayments(projectionTableStub({}), ctx(ALL), deps());
        if (!r.ok) throw new Error(r.message);
        expect(r.rows).toHaveLength(1);
        expect(r.rows[0]!.source).toMatchObject({ kind: "charge", id: "c-1", count: 2 });
        expect(r.rows[0]!.detail?.reason).toBe("$1,300.00 past due · since Oct 10 · 11 days");
    });

    it("due: amounts and dates are Financials'; due today is said as today", async () => {
        const r = await loadPaymentsDue(projectionTableStub({}), ctx(ALL), deps());
        if (!r.ok) throw new Error(r.message);
        expect(r.rows.map((x) => x.subject.id)).toEqual(["h-1"]);
        expect(r.rows[0]!.detail?.reason).toBe("$25.00 due today · through Oct 25");
        expect(r.rows[0]!.source).toMatchObject({ id: "c-3", count: 2 });
    });

    it("fin.read, a failed reader and an unreadable business date are explicit refusals; truncation is carried", async () => {
        expect(await loadOverduePayments(projectionTableStub({}), ctx(ALL), deps({ assertRead: denyRead }))).toMatchObject({ ok: false, code: "projection_forbidden" });
        expect(await loadOverduePayments(projectionTableStub({}), ctx(ALL), deps({ readDue: (async () => ({ state: "unavailable", reason: "x" })) as never }))).toMatchObject({ ok: false, code: "projection_unavailable" });
        expect(await loadPaymentsDue(projectionTableStub({}), ctx(ALL), deps({ businessDate: (async () => { throw new Error("tz"); }) as never }))).toMatchObject({ ok: false, code: "projection_unavailable" });
        const t = await loadPaymentsDue(projectionTableStub({}), ctx(ALL), deps({ readDue: (async () => ({ ...ACCOUNTS, truncated: true })) as never }));
        expect(t.ok && t.truncated).toBe(true);
    });

    it("the catalog now offers both; billing-period variances remain unoffered", () => {
        const keys = DOMAIN_PROJECTION_CATALOG.billing.map((p) => p.key);
        expect(keys).toEqual(expect.arrayContaining(["payments_due", "overdue_payments"]));
        expect(keys).not.toContain("billing_period_variances");
    });
});
