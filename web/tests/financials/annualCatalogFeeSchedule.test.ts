/**
 * ANNUAL CATALOG FEES — who would be charged, when, and never twice. Preview only.
 *
 * Decided: Required + configured scope (location, program) decides who. Proposed, under review:
 * due on each child's enrollment anniversary, full price, one charge per child per year.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { CommercialProductDef } from "@/lib/commercial/execution/commercialExport";
import {
    ANNUAL_CATALOG_BILLING_ACTIVE,
    annualFeeOccurrenceKey,
    buildAnnualCatalogFeeSchedule,
    type AnnualFeeAgreement,
    type AnnualFeeExistingCharge,
    type AnnualFeeTerm,
} from "@/lib/financials/catalogRecurring/annualCatalogFeeSchedule";

const SITE_A = "aaaaaaaa-0000-4000-8000-000000000001";
const SITE_B = "aaaaaaaa-0000-4000-8000-000000000002";

function product(id: string, over: Partial<CommercialProductDef> = {}): CommercialProductDef {
    return {
        id, commercialType: "fee", name: id, scope: { programKey: "", locationId: null }, amountCents: 20000,
        cadenceKey: "annual", revenueCategoryId: "rc", behavior: { required: true },
        effective: { start: "2026-07-22", end: null }, isActive: true, ...over,
    };
}

function agreement(id: string, child: string, over: Partial<AnnualFeeAgreement> = {}): AnnualFeeAgreement {
    return { id, customer_member_id: child, customer_id: `hh-${child}`, site_location_id: SITE_A, status: "active", start_date: "2025-09-01", end_date: null, ...over };
}

const ok = () => ({ ok: true as const });

function run(args: {
    products: CommercialProductDef[];
    agreements: AnnualFeeAgreement[];
    terms?: AnnualFeeTerm[];
    charges?: AnnualFeeExistingCharge[];
    asOf?: string;
    accountFor?: (p: CommercialProductDef) => { ok: true } | { ok: false; reason: string };
}) {
    return buildAnnualCatalogFeeSchedule({
        asOf: args.asOf ?? "2026-11-03",
        products: args.products,
        agreements: args.agreements,
        terms: args.terms ?? [],
        charges: args.charges ?? [],
        accountFor: args.accountFor ?? ok,
    });
}

describe("who: Required + configured scope", () => {
    it("a Required annual fee reaches every actively enrolled child; ended agreements and other cadences do not", () => {
        const [item, ...rest] = run({
            products: [product("supply"), product("monthly", { cadenceKey: "monthly" }), product("once", { cadenceKey: null })],
            agreements: [agreement("ag1", "c1"), agreement("ag2", "c2", { status: "ended" })],
        });
        expect(rest).toEqual([]);
        expect(item!.status).toBe("scheduled");
        expect([...new Set(item!.recipients.map((r) => r.childMemberId))]).toEqual(["c1"]);
    });

    it("a non-Required annual fee charges nobody, and says so", () => {
        const [item] = run({ products: [product("reg", { behavior: { required: false } })], agreements: [agreement("ag1", "c1")] });
        expect(item!.status).toBe("not_required");
        expect(item!.recipients).toEqual([]);
        expect(item!.reason).toMatch(/Required/);
    });

    it("location scope: only children whose billable agreement attends that site", () => {
        const [item] = run({
            products: [product("supply", { scope: { programKey: "", locationId: SITE_B } })],
            agreements: [agreement("ag1", "c1"), agreement("ag2", "c2", { site_location_id: SITE_B })],
        });
        expect([...new Set(item!.recipients.map((r) => r.childMemberId))]).toEqual(["c2"]);
    });

    it("program scope: read from the agreement's accepted tuition term; no term is named as unschedulable, never guessed", () => {
        const [item] = run({
            products: [product("supply", { scope: { programKey: "preschool", locationId: null } })],
            agreements: [agreement("ag1", "c1"), agreement("ag2", "c2"), agreement("ag3", "c3")],
            terms: [
                { enrollment_agreement_id: "ag1", program_key: "preschool", effective_start: "2025-09-01" },
                { enrollment_agreement_id: "ag2", program_key: "toddler", effective_start: "2025-09-01" },
            ],
        });
        expect([...new Set(item!.recipients.map((r) => r.childMemberId))]).toEqual(["c1"]);
        expect(item!.excluded).toEqual([{ childMemberId: "c3", agreementId: "ag3", reason: expect.stringMatching(/program is unknown/) }]);
    });

    it("an item with no posting account is not billable by any flow, and lists nobody", () => {
        const [item] = run({
            products: [product("supply")],
            agreements: [agreement("ag1", "c1")],
            accountFor: () => ({ ok: false, reason: "No GL Code is set on this catalog item." }),
        });
        expect(item!.status).toBe("not_billable");
        expect(item!.recipients).toEqual([]);
    });
});

describe("when: the enrollment anniversary (proposed)", () => {
    it("anchors on the earliest accepted tuition term, else the agreement start; lists the current year and the next", () => {
        const [item] = run({
            products: [product("supply")],
            agreements: [agreement("ag1", "c1", { start_date: "2025-08-15" }), agreement("ag2", "c2", { start_date: "2026-01-10" })],
            terms: [
                { enrollment_agreement_id: "ag1", program_key: "p", effective_start: "2025-09-01" },
                { enrollment_agreement_id: "ag1", program_key: "p", effective_start: "2026-02-01" },
            ],
        });
        const c1 = item!.recipients.filter((r) => r.childMemberId === "c1");
        expect(c1.map((r) => [r.anchorSource, r.dueOn, r.period.end, r.state])).toEqual([
            ["tuition_term", "2026-09-01", "2027-08-31", "due"],
            ["tuition_term", "2027-09-01", "2028-08-31", "upcoming"],
        ]);
        const c2 = item!.recipients.filter((r) => r.childMemberId === "c2");
        // Its current year began 2026-01-10, before the item took effect (2026-07-22): not owed.
        expect(c2.map((r) => [r.anchorSource, r.dueOn, r.state])).toEqual([["agreement_start", "2027-01-10", "upcoming"]]);
    });

    it("a year that began before the item took effect is not owed; an agreement ending before a due date is not charged then", () => {
        const [item] = run({
            products: [product("supply", { effective: { start: "2026-07-22", end: null } })],
            agreements: [agreement("ag1", "c1", { start_date: "2025-03-01", end_date: "2027-01-31" })],
        });
        // 2026-03-01 is before the item's start; 2027-03-01 is after the agreement ends.
        expect(item!.recipients).toEqual([]);
    });

    it("full Catalog price, never prorated, for a child who started mid-year", () => {
        const [item] = run({ products: [product("supply", { amountCents: 20000 })], agreements: [agreement("ag1", "c1", { start_date: "2026-10-20" })] });
        expect(item!.recipients.map((r) => r.amountCents)).toEqual([20000, 20000]);
    });

    it("a child starting after today shows only that first anniversary period, upcoming", () => {
        const [item] = run({ products: [product("supply")], agreements: [agreement("ag1", "c1", { start_date: "2026-12-01" })] });
        expect(item!.recipients.map((r) => [r.dueOn, r.state])).toEqual([["2026-12-01", "upcoming"]]);
    });

    it("a 29 February anniversary is not guessed", () => {
        const [item] = run({ products: [product("supply")], agreements: [agreement("ag1", "c1", { start_date: "2024-02-29" })] });
        expect(item!.recipients).toEqual([]);
        expect(item!.excluded[0]!.reason).toMatch(/29 February/);
    });
});

describe("never twice", () => {
    const base = { products: [product("supply")], agreements: [agreement("ag1", "c1", { start_date: "2025-09-01" })] };

    it("an existing live charge of the item for the child in the period — any date, by hand or not — is already charged", () => {
        const [item] = run({
            ...base,
            charges: [{ id: "ch1", status: "posted", service_date: "2026-10-02", billable_source_type: "enrollment_agreement", billable_source_id: "ag1", product_id: "supply", child_member_id: null }],
        });
        const current = item!.recipients.find((r) => r.dueOn === "2026-09-01")!;
        expect(current.state).toBe("already_charged");
        expect(current.existingChargeId).toBe("ch1");
        expect(item!.recipients.find((r) => r.dueOn === "2027-09-01")!.state).toBe("upcoming");
    });

    it("a household-sourced charge of the item for this child counts too; a void one, another item's or another year's does not", () => {
        const [item] = run({
            ...base,
            charges: [
                { id: "void", status: "void", service_date: "2026-09-01", billable_source_type: "enrollment_agreement", billable_source_id: "ag1", product_id: "supply", child_member_id: null },
                { id: "other", status: "posted", service_date: "2026-09-01", billable_source_type: "enrollment_agreement", billable_source_id: "ag1", product_id: "registration", child_member_id: null },
                { id: "lastyear", status: "paid", service_date: "2026-08-31", billable_source_type: "enrollment_agreement", billable_source_id: "ag1", product_id: "supply", child_member_id: null },
            ],
        });
        expect(item!.recipients.find((r) => r.dueOn === "2026-09-01")!.state).toBe("due");

        const [hh] = run({
            ...base,
            charges: [{ id: "hh", status: "draft", service_date: "2026-11-01", billable_source_type: "customer", billable_source_id: "hh-c1", product_id: "supply", child_member_id: "c1" }],
        });
        expect(hh!.recipients.find((r) => r.dueOn === "2026-09-01")!.existingChargeId).toBe("hh");
    });

    it("one charge per child: two agreements for one child schedule once, against the billable agreement", () => {
        const [item] = run({
            products: [product("supply")],
            agreements: [agreement("ag-new", "c1", { status: "active" }), agreement("ag-old", "c1", { status: "active" })],
        });
        expect(item!.recipients.filter((r) => r.dueOn === "2026-09-01").map((r) => r.agreementId)).toEqual(["ag-new"]);
    });

    it("the occurrence key is the resolution key the charge writer computes, so the database index refuses a second charge", () => {
        const [item] = run(base);
        const r = item!.recipients[0]!;
        expect(r.occurrenceKey).toBe(annualFeeOccurrenceKey("supply", r.period.start, "ag1"));
        expect(r.occurrenceKey).toBe("tpl:catalog:supply:2026-09-01:ag1");
        const keys = item!.recipients.map((x) => x.occurrenceKey);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe("nothing bills", () => {
    it("annual Catalog billing is not active", () => {
        expect(ANNUAL_CATALOG_BILLING_ACTIVE).toBe(false);
    });

    it("the schedule's reader and route only select — no insert, update, upsert, delete or rpc", () => {
        const root = path.resolve(__dirname, "../..");
        for (const rel of [
            "lib/financials/catalogRecurring/readAnnualCatalogFeeSchedule.ts",
            "lib/financials/catalogRecurring/annualCatalogFeeSchedule.ts",
            "app/api/admin/financials/annual-catalog-billing/route.ts",
        ]) {
            const src = readFileSync(path.join(root, rel), "utf8");
            expect(src, rel).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
            expect(src, rel).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
        }
    });
});
