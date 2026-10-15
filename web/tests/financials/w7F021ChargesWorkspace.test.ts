/**
 * W7-F021 — THE CHARGES WORKSPACE HAS A COHERENT OPERATOR JOB.
 *
 * Accounts is the household workspace. Charges is cross-account charge operations: find charges
 * across the organization (search, charge type, billing period, Needs attention · Scheduled · Posted ·
 * Cancelled), apply one charge to many accounts, clear exceptions, and control tuition billing — which
 * is automatic, with a previewed manual run. A charge opens in the account's own Charge Details.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { applyChargeIndex, chargeIndexViewOf } from "@/lib/financials/workspace/chargeIndex";
import {
    chargeAddRequest,
    legalBulkGrains,
    obligationsFor,
    refusalBeforeSending,
    runWithConcurrency,
    tallyBulk,
    type BulkTarget,
} from "@/lib/financials/bulkCharge/bulkChargePlan";
import type { FinancialWorkRow } from "@/lib/financials/workspace/resolveFinancialWorkQueue";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (rel: string) => read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const awaiting = (key: string, actionable = false, postsOn: string | null = null) =>
    ({ key, label: key, explanation: "", operatorActionable: actionable, postsOn }) as FinancialWorkRow["awaiting"];
const row = (over: Partial<FinancialWorkRow>): FinancialWorkRow =>
    ({
        chargeId: "c",
        customerId: "h1",
        customerMemberId: null,
        enrollmentAgreementId: null,
        householdName: "W7 QA · Tuition Family",
        childName: "Tilly Tuition",
        categoryKey: "tuition",
        categoryLabel: "Tuition",
        description: null,
        amountCents: 120000,
        currencyCode: "USD",
        serviceDate: "2026-11-01",
        periodKey: "2026-11",
        locationScope: "site",
        siteLocationId: "n",
        siteName: "North Campus",
        locationProvenance: "agreement",
        awaiting: awaiting("period_not_started", false, "2026-11-01"),
        status: "draft",
        typeKey: "category:tuition",
        typeLabel: "Tuition",
        billingPeriodKey: "2026-11",
        ...over,
    }) as FinancialWorkRow;

describe("the cross-account index", () => {
    it("reads each charge by what it needs", () => {
        expect(chargeIndexViewOf(row({}))).toBe("scheduled");
        expect(chargeIndexViewOf(row({ awaiting: awaiting("review_required", true) }))).toBe("attention");
        expect(chargeIndexViewOf(row({ awaiting: awaiting("post_failed", false) }))).toBe("attention");
        for (const status of ["posted", "partially_paid", "paid"]) expect(chargeIndexViewOf(row({ status }))).toBe("posted");
        expect(chargeIndexViewOf(row({ status: "void" }))).toBe("cancelled");
    });

    const rows = [
        row({ chargeId: "t1" }),
        row({ chargeId: "m1", householdName: "W7 QA · Monthly Family", childName: "Milo Monthly", typeKey: "template:mat", typeLabel: "Materials", categoryKey: "consumable_fee", billingPeriodKey: "2026-11" }),
        row({ chargeId: "p1", status: "posted", billingPeriodKey: "2026-10", householdName: "Alvarez" }),
        row({ chargeId: "v1", status: "void" }),
    ];

    it("searches household, child or charge type, and filters by type and period", () => {
        expect(applyChargeIndex(rows, { view: "scheduled", query: "tilly" }).rows.map((r) => r.chargeId)).toEqual(["t1"]);
        expect(applyChargeIndex(rows, { view: "scheduled", query: "materials" }).rows.map((r) => r.chargeId)).toEqual(["m1"]);
        expect(applyChargeIndex(rows, { view: "scheduled", typeKey: "category:tuition" }).rows.map((r) => r.chargeId)).toEqual(["t1"]);
        expect(applyChargeIndex(rows, { view: "posted", periodKey: "2026-10" }).rows.map((r) => r.chargeId)).toEqual(["p1"]);
    });

    it("counts every view from the same narrowed rows, and offers only types and periods that exist", () => {
        const r = applyChargeIndex(rows, { view: "scheduled", query: "tuition family" });
        expect(r.counts).toEqual({ attention: 0, scheduled: 1, posted: 0, cancelled: 1 });
        const all = applyChargeIndex(rows, { view: "scheduled" });
        expect(all.typeOptions.map((o) => o.label)).toEqual(["Materials", "Tuition"]);
        expect(all.periodOptions.map((o) => o.label)).toEqual(["November 2026", "October 2026"]);
    });

    it("the route is fin.read, server-scoped, and the work queue's own resolver", () => {
        const route = code("app/api/admin/financials/charge-index/route.ts");
        expect(route).toContain("assertFinancialsReadAllowed");
        expect(route).toMatch(/resolveFinancialWorkQueue\(supabase, \{[\s\S]*statuses: CHARGE_INDEX_STATUSES/);
        expect(route).toMatch(/siteScope: ctx\.siteScope === "restricted"/);
        const decl = JSON.parse(read("scripts/routeCapabilities.declared.json"));
        expect(decl.routes["app/api/admin/financials/charge-index/route.ts"].GET.capability).toBe("fin.read");
        expect(decl.routes["app/api/admin/financials/bulk-charge-targets/route.ts"].GET.capability).toBe("fin.read");
    });

    it("the work queue's draft read is unchanged when no statuses are asked for", () => {
        const resolver = code("lib/financials/workspace/resolveFinancialWorkQueue.ts");
        expect(resolver).toMatch(/\.eq\("status", "draft"\)\s*\.in\("billable_source_type", \[\.\.\.CHILDCARE_BILLABLE_SOURCE_TYPES\]\)\s*\.order\("service_date", \{ ascending: true, nullsFirst: false \}\)/);
    });
});

describe("bulk charge — one canonical charge.add per account", () => {
    const target: BulkTarget = {
        customerId: "h1",
        householdName: "W7 QA · Split Family",
        children: [
            { customerMemberId: "k1", name: "Sasha" },
            { customerMemberId: "k2", name: "Sam" },
        ],
    };
    const input = { templateId: "tpl", category: "one_time", grain: "child" as const, serviceDate: "2026-11-05", amountCents: null };

    it("sends Add Charge's own wire shape, to the household, per child or for the household", () => {
        const child = chargeAddRequest(target, input, "execute");
        expect(child).toMatchObject({ action_key: "charge.add", entity_type: "customer", entity_id: "h1", mode: "execute", confirmation: { confirmed: true } });
        expect(child.payload).toMatchObject({ customer_id: "h1", template_id: "tpl", customer_member_ids: ["k1", "k2"], service_date: "2026-11-05", event_date: "2026-11-05" });
        expect(child.payload).not.toHaveProperty("amount_cents");
        const household = chargeAddRequest({ ...target, children: [] }, { ...input, grain: "household" }, "preview");
        expect(household.payload).toMatchObject({ subject_grain: "household", customer_id: "h1" });
        expect(household).not.toHaveProperty("confirmation");
        const manual = chargeAddRequest(target, { ...input, amountCents: 4000 }, "preview");
        expect(manual.payload).toMatchObject({ amount_cents: 4000 });
    });

    it("never offers or sends a grain the category forbids", () => {
        expect(legalBulkGrains("tuition")).toEqual(["child"]);
        expect(legalBulkGrains("one_time")).toEqual(["child", "household"]);
        expect(refusalBeforeSending({ ...target, children: [] }, { ...input, category: "consumable_fee", grain: "household" })).toMatch(/per child/);
        expect(refusalBeforeSending({ ...target, children: [] }, input)).toMatch(/No child selected/);
        expect(refusalBeforeSending(target, input)).toBeNull();
    });

    it("counts obligations per child, and tallies refused / created / failed per account", () => {
        expect(obligationsFor(target, "child")).toBe(2);
        expect(obligationsFor(target, "household")).toBe(1);
        const t2 = { ...target, customerId: "h2" };
        const t3 = { ...target, customerId: "h3" };
        const tally = tallyBulk([target, t2, t3], "child", {
            h1: { state: "created", chargeIds: ["x"], note: "Posted" },
            h2: { state: "refused", reason: "grain" },
            h3: { state: "failed", reason: "boom" },
        });
        expect(tally).toEqual({ targets: 3, obligations: 4, refused: 1, created: 1, failed: 1 });
    });

    it("runs at bounded concurrency and visits every target once", async () => {
        const seen: number[] = [];
        let live = 0;
        let peak = 0;
        await runWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
            live += 1;
            peak = Math.max(peak, live);
            await new Promise((r) => setTimeout(r, 2));
            seen.push(n);
            live -= 1;
        });
        expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(peak).toBeLessThanOrEqual(3);
    });

    it("the surface previews every target before it can confirm, and excludes tuition", () => {
        const ui = code("app/adminV2/financials/sections/FinancialsBulkAddCharge.tsx");
        expect(ui).toMatch(/chargeAddRequest\(t, input, "preview"\)/);
        expect(ui).toMatch(/chargeAddRequest\(t, input, "execute"\)/);
        expect(ui).toMatch(/previewed && sendable\.length > 0 && !ran \? \(/);
        expect(ui).toMatch(/row\.charge_category !== "tuition"/);
        expect(ui).not.toMatch(/\.from\(|supabase/);
    });
});

describe("the Charges page", () => {
    const page = code("app/adminV2/financials/sections/FinancialsCharges.tsx");

    it("says what it is for, and offers the cross-account jobs", () => {
        expect(page).toContain("Charges across every account");
        expect(page).toContain("To work one household, use Accounts.");
        expect(page).toMatch(/>\s*New bulk charge\s*</);
        expect(page).toMatch(/>\s*Tuition billing\s*</);
    });

    it("searches and filters, and reads charges by view", () => {
        expect(page).toContain('placeholder="Search household, child or charge type"');
        expect(page).toContain('testId="charges-type-filter"');
        expect(page).toContain('testId="charges-period-filter"');
        expect(page).toMatch(/CHARGE_INDEX_VIEWS\.map/);
        expect(page).toContain("/api/admin/financials/charge-index?");
    });

    it("opens a charge in the account's canonical Charge Details, with no second detail pane", () => {
        expect(page).toMatch(/<FinancialsAccountDetail[\s\S]*?openCharge=\{\{ chargeId: open\.chargeId, label: open\.label \}\}[\s\S]*?onSurfacesClosed=/);
        expect(page).not.toContain("FinancialsChargeDetail");
        expect(page).not.toContain("Select financial work");
        const card = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card).toMatch(/: openCharge\s*\?\s*\[\{ kind: "charge_detail", chargeId: openCharge\.chargeId, label: openCharge\.label \}\]/);
        expect(card).toMatch(/if \(openedOnCharge\.current && stack\.length === 0\) onSurfacesClosed\?\.\(\);/);
    });

    it("posts exceptions only through charge.post", () => {
        expect(page).toContain('action_key: "charge.post"');
    });
});

describe("tuition billing is automatic, with manual run control", () => {
    const billing = code("app/adminV2/financials/sections/FinancialsTuitionBilling.tsx");

    it("states the scheduler's status and last run first", () => {
        expect(billing).toContain("/api/admin/financials/periodic-billing-status");
        expect(billing).toContain("Automatic tuition billing");
        expect(billing).toContain("Tuition is generated automatically. Use the run below to preview a period, or to run billing manually when needed.");
        const status = code("app/api/admin/financials/periodic-billing-status/route.ts");
        expect(status).toMatch(/\.from\("scheduled_work_attempts"\)[\s\S]*\.eq\("handler_key", BILLING_PERIODIC_HANDLER_KEY\)/);
        expect(status).toContain("last_run");
    });

    it("the preview names who it bills, and what it already billed", () => {
        expect(billing).toContain("Will bill");
        expect(billing).toContain("Already generated — not billed again");
        const action = code("lib/adminV2/actions/definitions/tuitionGenerationActions.ts");
        expect(action).toMatch(/to_bill_outcomes: result\.outcomes\.filter\(\(o\) => o\.kind === "generated"\)/);
        expect(action).toMatch(/assignment_names: await nameAssignments\(/);
    });
});

describe("Accounts locates a household's tuition without hunting", () => {
    const card = code("components/operationalCards/FinancialsDetailCard.tsx");
    it("filters the ledger by charge type and status, from its own rows, through the one predicate", () => {
        expect(card).toContain('testId="charge-type"');
        expect(card).toContain('testId="status"');
        expect(card).toMatch(/&& \(!chargeType \|\| e\.type === chargeType\)\s*&& \(!statusGroup \|\| ledgerStatusGroup\(e\.status\) === statusGroup\)/);
        expect(card).toMatch(/chargeTypeChoices\.length > 1 \?/);
    });
});

describe("deployed fixes (W7-F021 follow-up, measured on 39a20265)", () => {
    it("Escape that closes a Charges layer or an open menu never reaches the Financials drawer", () => {
        const page = code("app/adminV2/financials/sections/FinancialsCharges.tsx");
        expect(page).toMatch(/armed = layerOpenRef\.current \|\| hasOpenTransientPopup\(document\)/);
        expect(page).toMatch(/window\.addEventListener\("keydown", onCapture, true\)/);
        expect(page).toMatch(/if \(e\.key === "Escape" && armed\) e\.stopPropagation\(\);/);
        expect(page).toMatch(/document\.addEventListener\("keydown", onBubble\)/);
    });

    it("a versioned charge type is ONE filter choice, keyed by the label operators read", () => {
        const resolver = code("lib/financials/workspace/resolveFinancialWorkQueue.ts");
        expect(resolver).toMatch(/typeKey: `type:\$\{\(/);
        expect(resolver).not.toContain("`template:${charge.charge_template_id}`");
    });

    it("the bulk preview's date chain is in the operator's words and names whose dates they are", () => {
        const ui = code("app/adminV2/financials/sections/FinancialsBulkAddCharge.tsx");
        expect(ui).toMatch(/formatDisplayDate\(iso\)/);
        expect(ui).toContain("Dates for {firstTarget?.householdName}");
    });
});

