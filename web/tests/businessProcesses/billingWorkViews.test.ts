/**
 * BP V2 Slice 5 — Billing review projections over Financials' OWN readers: membership, household grain,
 * scope (actor sites ∩ selection, through Financials' location rule), fin.read, explicit failure,
 * truncation, and the catalog only offering what is implemented.
 */
import { describe, expect, it } from "vitest";
import { loadFundingVariances, loadPaymentExceptions, UNRECOGNIZED_COLLECTION_READ_LIMIT } from "@/lib/businessProcesses/projections/billingProjections";
import { loadChargesNeedingReview } from "@/lib/businessProcesses/projections/chargesNeedingReviewProjection";
import { financialSubsidyReason } from "@/lib/financials/subsidy/subsidyReason";
import { DOMAIN_PROJECTION_CATALOG } from "@/lib/businessProcesses/projections/domainProjectionCatalog";
import { resolveDomainProjection as getDomainProjection } from "@/lib/businessProcesses/projections/domainProjectionRegistry";
import type { DomainProjectionContext, DomainProjectionScope } from "@/lib/businessProcesses/projections/domainProjectionTypes";
import type { UnrecognizedCollection } from "@/lib/financials/payments/collectionRecognition";
import type { FinancialPositionRow } from "@/lib/financials/workspace/resolveFinancialPosition";
import { projectionTableStub } from "./projectionTableStub";

const ORG = "org-1";
const R = "site-r";
const L = "site-l";
const allowRead = (async () => ({ ok: true as const })) as never;
const denyRead = (async () => ({ ok: false as const, message: "no fin.read" })) as never;
const ctx = (scope: DomainProjectionScope): DomainProjectionContext => ({ orgId: ORG, userId: "u-1", scope });
const ALL: DomainProjectionScope = { siteScope: "all", allowedSiteLocationIds: [] };

const tables = {
    customers: [
        { id: "h-1", org_id: ORG, name: "Rivera" },
        { id: "h-2", org_id: ORG, name: "Okafor" },
        { id: "h-3", org_id: ORG, name: "Lund" },
    ],
    child_enrollment_agreements: [
        { id: "ag-r", org_id: ORG, customer_id: "h-1", site_location_id: R },
        { id: "ag-l", org_id: ORG, customer_id: "h-2", site_location_id: L },
        { id: "ag-nosite", org_id: ORG, customer_id: "h-3", site_location_id: null },
    ],
};

const coll = (attemptId: string, sourceType: string, sourceId: string, at: string): UnrecognizedCollection => ({
    attemptId, orgId: ORG, customerId: sourceType === "customer" ? sourceId : null, billableSourceType: sourceType, billableSourceId: sourceId,
    chargeId: null, amountCents: 1000, currency: "usd", rail: "card", payerPersonId: null, providerState: "succeeded", providerStateAt: at,
    expectedSettlementOn: null, paymentMethodId: null, methodBrand: null, methodLast4: null, lastReason: null,
});
const COLLECTIONS = [
    coll("a-2", "enrollment_agreement", "ag-r", "2026-10-02T00:00:00Z"),
    coll("a-1", "enrollment_agreement", "ag-r", "2026-10-01T00:00:00Z"),
    coll("a-3", "enrollment_agreement", "ag-l", "2026-10-03T00:00:00Z"),
    coll("a-4", "customer", "h-3", "2026-10-04T00:00:00Z"),
    coll("a-5", "enrollment_agreement", "ag-nosite", "2026-10-05T00:00:00Z"),
    coll("a-6", "enrollment_agreement", "ag-missing", "2026-10-06T00:00:00Z"),
];

describe("payment_exceptions (V1: unrecognized collections)", () => {
    const load = (scope: DomainProjectionScope, rows = COLLECTIONS) =>
        loadPaymentExceptions(projectionTableStub(tables), ctx(scope), { assertRead: allowRead, readUnrecognized: async () => rows });

    it("one row per household; duplicate collections aggregate; the oldest is the representative", async () => {
        const r = await load(ALL);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        const byHh = Object.fromEntries(r.rows.map((x) => [x.subject.id, x]));
        expect(Object.keys(byHh).sort()).toEqual(["h-1", "h-2", "h-3"]);
        expect(byHh["h-1"]!.source).toMatchObject({ kind: "collection_attempt", id: "a-1", count: 2 });
        expect(byHh["h-1"]!.detail?.reason).toBe("Collected by the provider, not yet recorded · 2 collections");
        expect(byHh["h-1"]!.siteLocationId).toBe(R);
        expect(byHh["h-3"]!.siteLocationId).toBeNull(); // household account → org-scoped
        expect(r.truncated).toBe(false);
    });

    it("an agreement with no site, or a source that does not resolve, is never shown under another household", async () => {
        const r = await load(ALL);
        if (!r.ok) throw new Error("refused");
        expect(r.rows.some((x) => x.source.id === "a-5" || x.source.id === "a-6")).toBe(false);
    });

    it("site scope is Financials' rule: restricted actors see their sites only, and never org-scoped household money", async () => {
        const r = await load({ siteScope: "restricted", allowedSiteLocationIds: [R] });
        if (!r.ok) throw new Error("refused");
        expect(r.rows.map((x) => x.subject.id)).toEqual(["h-1"]);
    });

    it("the workspace selection narrows (and hides org-scoped rows); a selection outside the actor's sites shows nothing", async () => {
        const sel = await load({ ...ALL, selectedSiteId: L });
        if (!sel.ok) throw new Error("refused");
        expect(sel.rows.map((x) => x.subject.id)).toEqual(["h-2"]);
        const outside = await load({ siteScope: "restricted", allowedSiteLocationIds: [R], selectedSiteId: L });
        expect(outside.ok && outside.rows.length).toBe(0);
    });

    it("fin.read is enforced here; a failed read is an explicit refusal, never zero", async () => {
        const denied = await loadPaymentExceptions(projectionTableStub(tables), ctx(ALL), { assertRead: denyRead, readUnrecognized: async () => COLLECTIONS });
        expect(denied).toMatchObject({ ok: false, code: "projection_forbidden" });
        const broken = await loadPaymentExceptions(projectionTableStub(tables), ctx(ALL), { assertRead: allowRead, readUnrecognized: async () => { throw new Error("db down"); } });
        expect(broken).toMatchObject({ ok: false, code: "projection_unavailable" });
    });

    it("a full reader page is reported as truncated (unknown beyond the bound)", async () => {
        const many = Array.from({ length: UNRECOGNIZED_COLLECTION_READ_LIMIT }, (_, i) => coll(`x-${String(i).padStart(3, "0")}`, "customer", "h-3", "2026-10-01T00:00:00Z"));
        const r = await load(ALL, many);
        expect(r.ok && r.truncated).toBe(true);
        expect(r.ok && r.rows[0]!.source.count).toBe(UNRECOGNIZED_COLLECTION_READ_LIMIT);
    });
});

describe("funding_variances", () => {
    const vtables = {
        ...tables,
        child_enrollment_agreements: [...tables.child_enrollment_agreements, { id: "ag-r2", org_id: ORG, customer_id: "h-1", site_location_id: R }],
        financial_subsidy_variances: [
            { id: "v-1", org_id: ORG, claim_line_id: "l-1", resolution_kind: null },
            { id: "v-2", org_id: ORG, claim_line_id: "l-2", resolution_kind: null },
            { id: "v-3", org_id: ORG, claim_line_id: "l-3", resolution_kind: null },
            { id: "v-4", org_id: ORG, claim_line_id: "l-4", resolution_kind: "write_off" }, // resolved → never a candidate
            { id: "v-5", org_id: ORG, claim_line_id: "l-5", resolution_kind: null },
            { id: "v-6", org_id: ORG, claim_line_id: "l-6", resolution_kind: null },
        ],
        financial_subsidy_claim_lines: [
            { id: "l-1", org_id: ORG, charge_id: "c-1" },
            { id: "l-2", org_id: ORG, charge_id: "c-2" },
            { id: "l-3", org_id: ORG, charge_id: "c-3" },
            { id: "l-4", org_id: ORG, charge_id: "c-4" },
            { id: "l-5", org_id: ORG, charge_id: "c-5" },
            { id: "l-6", org_id: ORG, charge_id: "c-6" },
        ],
        charges: [
            { id: "c-1", org_id: ORG, status: "posted", billable_source_type: "enrollment_agreement", billable_source_id: "ag-r", service_date: "2026-09-01", currency_code: "usd", amount_cents: 1000 },
            { id: "c-2", org_id: ORG, status: "posted", billable_source_type: "enrollment_agreement", billable_source_id: "ag-r2", service_date: "2026-10-01", currency_code: "usd", amount_cents: 1000 },
            { id: "c-3", org_id: ORG, status: "posted", billable_source_type: "enrollment_agreement", billable_source_id: "ag-r", service_date: "2026-10-02", currency_code: "usd", amount_cents: 1000 },
            { id: "c-4", org_id: ORG, status: "posted", billable_source_type: "enrollment_agreement", billable_source_id: "ag-r", service_date: "2026-10-03", currency_code: "usd", amount_cents: 1000 },
            { id: "c-5", org_id: ORG, status: "posted", billable_source_type: "enrollment_agreement", billable_source_id: "ag-l", service_date: "2026-08-01", currency_code: "usd", amount_cents: 1000 },
            { id: "c-6", org_id: ORG, status: "draft", billable_source_type: "customer", billable_source_id: "h-3", service_date: "2026-10-04", currency_code: "usd", amount_cents: 1000 },
        ],
    };
    // Financials' positions (the calculation is Financials'; these are its outputs for the named charges).
    const POSITIONS: Record<string, Partial<FinancialPositionRow["position"]>> = {
        "c-1": { unresolvedVarianceCents: -500, explanation: { openVarianceStates: ["short_paid"] } as never },
        "c-2": { unresolvedVarianceCents: 200, explanation: { openVarianceStates: ["overpaid"] } as never },
        "c-3": { unresolvedVarianceCents: 0, submittedClaimSuppressionCents: 900, explanation: { openVarianceStates: ["matched"] } as never }, // claimed, not a variance
        "c-5": { unresolvedVarianceCents: -100, explanation: { openVarianceStates: ["denied"] } as never },
    };
    let asked: string[] = [];
    const readPositions = (async (_s: unknown, args: { charges: Array<{ id: string }> }) => {
        asked = args.charges.map((c) => c.id).sort();
        return new Map(args.charges.filter((c) => POSITIONS[c.id]).map((c) => [c.id, { chargeId: c.id, unresolvedVarianceCents: 0, submittedClaimSuppressionCents: 0, expectedSubsidyCents: 0, ...POSITIONS[c.id] }]));
    }) as never;
    const load = (scope: DomainProjectionScope) => loadFundingVariances(projectionTableStub(vtables), ctx(scope), { assertRead: allowRead, readPositions });

    it("candidates = posted childcare charges with an OPEN variance; membership = Financials' position under the Subsidy rule", async () => {
        const r = await load(ALL);
        if (!r.ok) throw new Error(r.message);
        expect(asked).toEqual(["c-1", "c-2", "c-3", "c-5"]); // c-4 resolved, c-6 draft: never asked
        const byHh = Object.fromEntries(r.rows.map((x) => [x.subject.id, x]));
        expect(Object.keys(byHh).sort()).toEqual(["h-1", "h-2"]);
        expect(byHh["h-1"]!.source).toMatchObject({ kind: "charge", id: "c-1", count: 2 });
        expect(byHh["h-1"]!.detail?.reason).toBe("Agency paid something else · short paid, overpaid · 2 charges");
        expect(byHh["h-2"]!.source).toMatchObject({ id: "c-5", count: 1 });
        // The rule is the Subsidy section's, applied to the same positions.
        expect(financialSubsidyReason({ position: POSITIONS["c-3"] as never })).toBe("claimed");
    });

    it("scope is Financials' location rule: restricted R sees only R households; a selection narrows; outside → nothing", async () => {
        const r = await load({ siteScope: "restricted", allowedSiteLocationIds: [R] });
        expect(r.ok && r.rows.map((x) => x.subject.id)).toEqual(["h-1"]);
        expect(asked).toEqual(["c-1", "c-2", "c-3"]);
        const sel = await load({ ...ALL, selectedSiteId: L });
        expect(sel.ok && sel.rows.map((x) => x.subject.id)).toEqual(["h-2"]);
        const outside = await load({ siteScope: "restricted", allowedSiteLocationIds: [R], selectedSiteId: L });
        expect(outside.ok && outside.rows.length).toBe(0);
    });

    it("fin.read and failures refuse explicitly", async () => {
        const denied = await loadFundingVariances(projectionTableStub(vtables), ctx(ALL), { assertRead: denyRead });
        expect(denied).toMatchObject({ ok: false, code: "projection_forbidden" });
        const broken = await loadFundingVariances(projectionTableStub(vtables), ctx(ALL), { assertRead: allowRead, readPositions: (async () => { throw new Error("x"); }) as never });
        expect(broken).toMatchObject({ ok: false, code: "projection_unavailable" });
    });
});

describe("charges_needing_review — Financials' own post-failed vs review distinction in the reason", () => {
    const row = (chargeId: string, customerId: string, key: string, label: string) =>
        ({ chargeId, customerId, householdName: "Rivera", status: "draft", serviceDate: "2026-10-01", siteLocationId: R, awaiting: { key, label, operatorActionable: key !== "period_not_started" } }) as never;
    const load = (rows: unknown[]) =>
        loadChargesNeedingReview(projectionTableStub({}), ctx(ALL), { assertRead: allowRead, readQueue: (async () => ({ rows, readLimitReached: false })) as never });

    it("one charge keeps Financials' label; several state the split", async () => {
        const one = await load([row("c-1", "h-1", "post_failed", "Posting failed")]);
        expect(one.ok && one.rows[0]!.detail?.reason).toBe("Posting failed");
        const many = await load([row("c-1", "h-1", "post_failed", "Posting failed"), row("c-2", "h-1", "review_required", "Needs review"), row("c-3", "h-1", "review_required", "Needs review")]);
        expect(many.ok && many.rows[0]!.detail?.reason).toBe("1 failed to post · 2 need review");
        expect(many.ok && many.rows[0]!.source.count).toBe(3);
    });

    it("a draft waiting on its period is not attention (Financials' classification, unchanged)", async () => {
        const r = await load([row("c-9", "h-1", "period_not_started", "Waiting for its period")]);
        expect(r.ok && r.rows.length).toBe(0);
    });
});

describe("only implemented Billing views are offered or resolvable", () => {
    it("catalog = registry = the three implemented keys; due / overdue / period variances are not configurable", () => {
        const keys = DOMAIN_PROJECTION_CATALOG.billing.map((p) => p.key).sort();
        expect(keys).toEqual(["charges_needing_review", "funding_variances", "payment_exceptions"]);
        for (const k of keys) expect(getDomainProjection("billing", k)).not.toBeNull();
        for (const blocked of ["payments_due", "overdue_payments", "billing_period_variances"]) {
            expect(getDomainProjection("billing", blocked)).toBeNull();
        }
    });
});
