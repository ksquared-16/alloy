// @vitest-environment jsdom
/**
 * W7-F027 / F028 / F029 / F030 — THE SCHEDULED CHARGE MODEL, THE CHARGES ROW, INSTANT DETAILS, AND
 * ONE ADJUSTMENTS SURFACE.
 *
 * Census on deployed staging (2026-10-20): Charges → Needs attention held 34 rows, every one an
 * unclassified draft created Aug–Sep before automatic posting — none review-held, none failed — each
 * with a Post button. Charge Details showed its shell in ~56 ms and the charge's own label after
 * ~1.6 s (the resolver awaited ~30 reads one after another). Details still carried a second
 * adjustments table that existed to host Reverse adjustment.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FinancialsChargeDetail from "@/app/adminV2/financials/FinancialsChargeDetail";
import { financialsChargeState } from "@/components/operationalCards/FinancialsLedger";
import { awaitingPostingReason, operatorActionableCount } from "@/lib/financials/posting/awaitingPostingReason";
import { chargeIndexViewOf } from "@/lib/financials/workspace/chargeIndex";
import { resolveChargeDetail } from "@/lib/financials/workspace/resolveChargeDetail";
import type { FinancialWorkRow } from "@/lib/financials/workspace/resolveFinancialWorkQueue";

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const code = (rel: string) => read(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const row = (status: string, metadata: Record<string, unknown> | null) =>
    ({ status, awaiting: awaitingPostingReason(metadata) }) as Pick<FinancialWorkRow, "status" | "awaiting">;

describe("F027 · one operator lifecycle, decided once", () => {
    it("Scheduled activates by itself; only review and a failed activation are a person's decision", () => {
        expect(chargeIndexViewOf(row("draft", { post_gate: "period_not_started", post_not_before: "2026-11-01" }))).toBe("scheduled");
        expect(chargeIndexViewOf(row("draft", { post_gate: "review_required" }))).toBe("attention");
        expect(chargeIndexViewOf(row("draft", { review_required: true }))).toBe("attention");
        expect(chargeIndexViewOf(row("draft", { post_gate: "post_failed", post_attempt: { attempts: 1, attention_required: false } }))).toBe("attention");
        expect(chargeIndexViewOf(row("posted", null))).toBe("posted");
        expect(chargeIndexViewOf(row("void", null))).toBe("cancelled");
    });

    it("the 34 legacy drafts staging held are listed apart, and counted as nobody's work today", () => {
        const legacy = row("draft", {});
        expect(chargeIndexViewOf(legacy)).toBe("legacy");
        expect(legacy.awaiting.label).toBe("Legacy draft");
        expect(operatorActionableCount([legacy.awaiting, legacy.awaiting])).toBe(0);
    });

    it("the ledger and the Charges workspace name a charge with the same rule and the same words", () => {
        expect(financialsChargeState({ status: "draft", awaitingKey: "period_not_started" })).toEqual({ key: "scheduled", label: "Scheduled" });
        expect(financialsChargeState({ status: "scheduled" })).toEqual({ key: "scheduled", label: "Scheduled" });
        expect(financialsChargeState({ status: "draft", awaitingKey: "review_required" })).toEqual({ key: "attention", label: "Review required" });
        expect(financialsChargeState({ status: "draft", awaitingKey: "post_failed" })).toEqual({ key: "attention", label: "Posting failed" });
        expect(financialsChargeState({ status: "draft", awaitingKey: "unclassified" })).toEqual({ key: "legacy", label: "Legacy draft" });
        expect(financialsChargeState({ status: "partially_paid" })).toEqual({ key: "posted", label: "Posted" });
        expect(financialsChargeState({ status: "reversed" })).toEqual({ key: "reversed", label: "Reversed" });
        expect(financialsChargeState({ status: "void" })).toEqual({ key: "cancelled", label: "Cancelled" });
        expect(code("components/operationalCards/FinancialsDetailCard.tsx")).toMatch(/financialsChargeState\(\{ status: e\.status, awaitingKey: e\.awaiting\?\.key \?\? null \}\)/);
        expect(code("app/adminV2/financials/sections/FinancialsCharges.tsx")).toMatch(/financialsChargeState\(\{ status, awaitingKey:/);
    });

    it("no ledger row, compact row or Charges row offers Post; Charge Details offers it only by reason", () => {
        expect(code("lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard.ts")).toMatch(/offersPost: false,/);
        const card = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card).not.toMatch(/data-financials-row-command="charge\.post"/);
        expect(code("app/adminV2/financials/sections/FinancialsCharges.tsx")).not.toMatch(/charge\.post/);
        const exceptional = card.slice(card.indexOf("const exceptionalPost ="), card.indexOf("const detailsBeneath"));
        expect(exceptional).toMatch(/facts\?\.status === "draft" && facts\.awaiting/);
        expect(exceptional).not.toMatch(/period_not_started/);
    });

    it("the Overview exception figure is the Needs attention cohort, not every draft", () => {
        expect(code("lib/metrics/resolvers/financialsMetrics.ts")).toMatch(/"financials\.charges_awaiting_post_count", queue\.counts\.needsAPerson/);
    });
});

describe("F030 · one record, one detail model — no second adjustments table", () => {
    it("Details renders no adjustments table; Reverse adjustment lives on the adjustment's own record", () => {
        const detail = code("components/operationalCards/FinancialsDetailCard.tsx");
        expect(detail).not.toContain("data-financials-adjustments-ledger");
        expect(detail).not.toContain("onReverseAdjustment");
        const card = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card).toMatch(/r\.chargeId === surface\.chargeId && r\.kind === "manual" && !r\.reversedByApplicationId && !r\.reversesApplicationId/);
        expect(card).toMatch(/pop\(\);\s*openReverseAdjustment\(\{ applicationId: reversibleReduction\.applicationId \}\);/);
        /* The existing governed act, unchanged: preview, then execute. */
        expect(card).toMatch(/action_key: "billing\.reverse_adjustment",[\s\S]{0,80}mode: "preview"/);
        expect(card).toMatch(/await runAction\("billing\.reverse_adjustment", \{/);
    });
});

describe("F029 · Charge Details paints from the clicked row, then reconciles", () => {
    let host: HTMLDivElement;
    let root: Root;
    let release: (body: unknown) => void;

    beforeEach(() => {
        (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
        host = document.createElement("div");
        document.body.appendChild(host);
        root = createRoot(host);
        vi.stubGlobal(
            "fetch",
            vi.fn(
                () =>
                    new Promise((resolve) => {
                        release = (body) => resolve({ ok: true, json: async () => body } as Response);
                    }),
            ),
        );
    });
    afterEach(() => {
        act(() => root.unmount());
        host.remove();
        vi.unstubAllGlobals();
    });

    const authoritative = {
        ok: true,
        detail: {
            chargeId: "c1", label: "Field trip (renamed)", description: null, currencyCode: "USD", status: "posted",
            serviceDate: "2026-10-14", invoiceDate: "2026-10-14", dueDate: "2026-11-01", postedAt: "2026-10-14T18:00:00Z",
            customerId: "h", customerMemberId: null, householdName: "Alvarez Household (demo)", childName: null,
            billableSourceType: "customer", enrollmentAgreementId: null, position: null,
            responsibility: { allocatedCents: 0, unassignedCents: 0, parties: [] }, expectedFunding: [], applications: [], accountArrangement: null,
        },
    };

    it("the label, amount, state and dates are on screen before the read returns — no empty card", () => {
        act(() => {
            root.render(
                <FinancialsChargeDetail
                    chargeId="c1"
                    bare
                    seed={{ label: "Field trip", status: "scheduled", awaiting: { key: "period_not_started", label: "Scheduled · activates Nov 1, 2026", explanation: "", postsOn: "2026-11-01" }, amountLabel: "$40.00", serviceDate: "2026-11-01", billingPeriodLabel: "November 2026", responsibleParty: "Dana Alvarez" }}
                />,
            );
        });
        const section = host.querySelector("[data-financials-charge-detail]")!;
        expect(section.getAttribute("data-financials-charge-detail-provisional")).toBe("true");
        expect(host.querySelector('[data-financials-charge-label="true"]')!.textContent).toBe("Field trip");
        expect(host.textContent).toContain("$40.00");
        expect(host.textContent).toContain("Scheduled · activates");
        expect(host.textContent).toContain("November 2026");
        expect(host.querySelector("[data-financials-charge-detail-loading]")).toBeNull();
    });

    it("the authoritative read REPLACES the seed — a charge that changed is shown as it is now", async () => {
        act(() => {
            root.render(<FinancialsChargeDetail chargeId="c1" bare seed={{ label: "Field trip", status: "scheduled", amountLabel: "$40.00" }} />);
        });
        await act(async () => {
            release(authoritative);
        });
        expect(host.querySelector("[data-financials-charge-detail-provisional]")).toBeNull();
        expect(host.querySelector('[data-financials-charge-label="true"]')!.textContent).toBe("Field trip (renamed)");
        expect(host.textContent).toContain("Posted");
        expect(host.textContent).not.toContain("Scheduled · activates");
    });

    it("without a seed it still never claims anything: the reserved shell, then the record", () => {
        act(() => {
            root.render(<FinancialsChargeDetail chargeId="c1" bare />);
        });
        expect(host.querySelector("[data-financials-charge-detail-loading]")).not.toBeNull();
    });
});

describe("F029 · the resolver's independent reads run side by side", () => {
    /** Every PostgREST call takes 25 ms; record how many are in flight at once. */
    function delayedDb() {
        let live = 0;
        let peak = 0;
        let calls = 0;
        const charge = {
            id: "c1", billable_source_type: "customer", billable_source_id: "h", amount_cents: 4000, currency_code: "USD",
            status: "posted", service_date: "2026-10-14", posted_at: "2026-10-14", description: "Field trip", charge_template_id: "t",
            billable_on: "2026-10-14", occurs_on: null, due_date: null, created_at: "2026-10-14", charge_category: "one_time",
            charge_type: null, metadata: {}, created_by: "u1", updated_at: null, updated_by: null, posted_by: "u2", job_id: null,
            source_charge_id: null, billing_period_id: "bp",
        };
        const answer = (table: string, single: boolean) => {
            if (table === "charges") return single ? charge : [charge];
            return single ? null : [];
        };
        const from = (table: string) => {
            const chain: Record<string, unknown> = {};
            for (const m of ["select", "eq", "in", "not", "limit", "order", "is", "lte", "gte", "neq", "or"]) chain[m] = () => chain;
            const run = (single: boolean) => {
                calls += 1;
                live += 1;
                peak = Math.max(peak, live);
                return new Promise((resolve) =>
                    setTimeout(() => {
                        live -= 1;
                        resolve({ data: answer(table, single), error: null });
                    }, 25),
                );
            };
            chain.maybeSingle = () => run(true);
            chain.single = () => run(true);
            chain.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => run(false).then(ok, ko);
            return chain;
        };
        const db = {
            from,
            rpc: () => Promise.resolve({ data: null, error: null }),
            auth: { admin: { getUserById: () => Promise.resolve({ data: { user: null }, error: null }) } },
        };
        return { db: db as never, stats: () => ({ live, peak, calls }) };
    }

    it("more than one read is in flight at once, and the critical path is far shorter than the sum", async () => {
        const { db, stats } = delayedDb();
        const t0 = Date.now();
        const detail = await resolveChargeDetail(db, { orgId: "o", chargeId: "c1" });
        const elapsed = Date.now() - t0;
        expect(detail?.chargeId).toBe("c1");
        const { peak, calls } = stats();
        expect(peak, "independent reads overlap").toBeGreaterThanOrEqual(5);
        /* Serial would be calls × 25 ms; overlapped it is a handful of waves. */
        expect(elapsed, `elapsed ${elapsed}ms for ${calls} reads`).toBeLessThan(calls * 25 * 0.6);
    });
});
