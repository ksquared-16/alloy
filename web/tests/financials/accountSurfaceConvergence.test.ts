/**
 * THE SURFACE DECISION, HELD BY TEST.
 *
 * Two presentation grains over one financial truth. The rules that keep them from drifting are not
 * matters of taste, so they are asserted here rather than left to review:
 *
 *   - the workspace detail must READ the canonical account authority and compute no money of its own;
 *   - it must not be the compact Focus Panel card wearing a wider container;
 *   - operator-visible values must resolve through the owning catalog, never leak the key;
 *   - the card must not claim a payment-setup fact nothing produces.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { chargeCategoryLabel, isDeclaredChargeCategory } from "@/lib/financials/chargeCategories";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const WORKSPACE_DETAIL = "app/adminV2/financials/FinancialsAccountWorkspaceDetail.tsx";
const ACCOUNTS = "app/adminV2/financials/sections/FinancialsAccounts.tsx";

describe("F5A · operator labels resolve through the owning catalog", () => {
    it("turns configured charge-category keys into the operator's words", () => {
        expect(chargeCategoryLabel("consumable_fee")).toBe("Consumable fee");
        expect(chargeCategoryLabel("tuition")).toBe("Tuition");
        expect(chargeCategoryLabel("late_pickup")).toBe("Late pickup");
        expect(chargeCategoryLabel("subsidy_offset")).toBe("Subsidy offset");
    });

    /*
     * ── A REVERSAL, AND THE EVIDENCE FOR IT ────────────────────────────────────────────────────
     *
     * This used to require an unknown category to come back UNCHANGED — "the floor is honest, not
     * invented" — on the grounds that humanising it produced a label nobody configured. Mounted
     * certification showed what that costs: a payment receipt in the Accounts workspace read
     * `late_pickup_fee` beside the money it settled. `late_pickup_fee` is a real category on real
     * tenants and is not in the declared vocabulary, so the honest floor was a stored key on an
     * operator's screen.
     *
     * And the codebase already disagreed with itself about it: the payment chooser kept this
     * humanising rule PRIVATELY, so the chooser said "Late pickup fee" while the receipt for the
     * very same charge said `late_pickup_fee`.
     *
     * The distinction that resolves it: reading a key aloud is not naming it. "Late pickup fee"
     * asserts nothing `late_pickup_fee` does not already assert — same token, same words, minus the
     * underscores. Inventing a label would be substituting DIFFERENT words, and nothing here does
     * that. Callers that must genuinely tell a declared category from a tenant's own ask
     * `isDeclaredChargeCategory`, which is that question and only that question.
     */
    it("reads an unknown category aloud without renaming it", () => {
        expect(chargeCategoryLabel("not_a_configured_category")).toBe("Not a configured category");
        expect(chargeCategoryLabel("late_pickup_fee")).toBe("Late pickup fee");
        /* Same words as the key, never different ones. */
        expect(chargeCategoryLabel("late_pickup_fee").toLowerCase().replace(/ /g, "_")).toBe("late_pickup_fee");
        /* And whether the vocabulary knows it stays a separate, answerable question. */
        expect(isDeclaredChargeCategory("not_a_configured_category")).toBe(false);
        expect(isDeclaredChargeCategory("tuition")).toBe(true);
    });

    it("never hands a raw stored key to a surface", () => {
        for (const key of ["late_pickup_fee", "registration_fee", "materials_fee", "some_tenant_category"]) {
            expect(chargeCategoryLabel(key), `${key} reaches the operator as language`).not.toMatch(/_/);
        }
    });

    it("resolves the payment application label through the catalog, not the raw key", () => {
        const src = read("lib/financials/paymentApplicationView.ts");
        expect(src).toContain("chargeCategoryLabel");
        // The old shape fell straight through to the key.
        expect(src).not.toContain('charge?.charge_category?.trim() || "Charge"');
    });
});

describe("F5B · GL context is shown at transaction grain", () => {
    it("renders the resolved GL code and account name in the ledger", () => {
        const src = read(WORKSPACE_DETAIL);
        expect(src).toContain("glCode");
        expect(src).toContain("glAccountName");
        expect(src).toContain("data-financials-gl");
    });
});

describe("F7 · one truth, two grains", () => {
    it("reads the canonical account authority rather than computing money", () => {
        const src = read(WORKSPACE_DETAIL);
        expect(src).toContain("/api/admin/financials/card");
        /*
         * NO SECOND CALCULATION PATH. The detail may choose which canonical figures to show; it may
         * not derive new ones. These are the services that MAKE money move or resolve it.
         */
        // Imports, not prose: the file may NAME the authority it reads in a comment.
        const imports = src.split("\n").filter((l) => l.trimStart().startsWith("import"));
        for (const forbidden of [
            "resolveAllocatableNet", "computeCollectiblePosition", "reconcileRows",
            "childcarePaymentService", "manualReductionService", "buildFinancialsCardVM",
        ]) {
            expect(
                imports.some((l) => l.includes(forbidden)),
                `workspace detail must not import ${forbidden}`,
            ).toBe(false);
        }
    });

    it("is not the compact Focus Panel card in a wider container", () => {
        const src = read(WORKSPACE_DETAIL);
        // It may explain the distinction in prose; it may not render or import the card.
        expect(src.includes("<FinancialsCard")).toBe(false);
        const imports = src.split("\n").filter((l) => l.trimStart().startsWith("import"));
        expect(imports.some((l) => l.includes("FinancialsCard"))).toBe(false);
    });

    it("leads the Accounts detail with the workspace grain", () => {
        const src = read(ACCOUNTS);
        expect(src.indexOf("<FinancialsAccountWorkspaceDetail"), "the workspace detail is rendered")
            .toBeGreaterThan(-1);
        // The command-bearing card remains available, composed rather than re-implemented.
        expect(src).toContain("data-financials-account-actions");
        expect(src).toContain("<FinancialsAccountDetail");
    });

    /*
     * SELECTION COMMITS; IT DOES NOT REMOUNT.
     *
     * This assertion used to require `FinancialsAccountWorkspaceDetail key=` — and that `key` was
     * the defect. Keying the detail by the selected id remounted it on every click, so a remounted
     * component had no state to render and the whole surface fell back to "Reading the account…",
     * discarding the household and the section structure that were already known at the instant of
     * the click along with the figures that genuinely had to be fetched.
     *
     * The lock is now on the fact rather than on the spelling: one persistent instance, which is
     * what lets the shell render immediately and the money arrive into it.
     */
    it("does not remount the account detail on selection", () => {
        const src = read(ACCOUNTS);
        const openTag = src.slice(
            src.indexOf("<FinancialsAccountWorkspaceDetail"),
            src.indexOf("<FinancialsAccountWorkspaceDetail") + 400,
        );
        expect(openTag, "a key would throw the rendered shell away on every click").not.toMatch(/\bkey=/);
        const detail = read(WORKSPACE_DETAIL);
        expect(detail, "and the subject is committed synchronously").toContain("wantedRef");
        expect(detail, "with late responses for a previous account dropped")
            .toMatch(/wantedRef\.current !== wanted/);
    });
});

describe("F8 · a payment reads as a business object", () => {
    const src = read(WORKSPACE_DETAIL);

    it("leads with received, payer and method", () => {
        expect(src).toContain("data-financials-payer");
        expect(src).toContain("payerLabel");
        expect(src).toMatch(/Received|Refunded/);
    });

    it("keeps received, applied, unapplied and refunded as four distinct figures", () => {
        for (const f of ["appliedCents", "unappliedCents", "refundedCents", "amountCents"]) {
            expect(src.includes(f), `payment must state ${f}`).toBe(true);
        }
    });

    /* History stays inspectable and stays quiet — collapsed, never removed. */
    it("subordinates reversed applications without hiding them", () => {
        expect(src).toContain("data-financials-reversed-applications");
        expect(src).toContain("<details");
        expect(src).toContain('data-application-status="reversed"');
        expect(src).toContain('data-application-status="active"');
    });
});

describe("F2 · the card does not claim a payment fact nothing produces", () => {
    it("stops asserting that no payment method is on file", () => {
        /*
         * The EXPRESSION, not the word. These files explain the defect in prose, so a bare string
         * match would fail on the explanation and pass on a regression that quietly restored the
         * fallback under a different sentence.
         */
        const adapter = read("lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard.ts");
        expect(adapter).not.toContain('paymentSetup ?? "No payment method on file"');
        expect(adapter).toContain("paymentLine: vm.paymentSetup ?? null");
        const card = read("components/operationalCards/FinancialsCard.tsx");
        expect(card).not.toContain('autopayLabel ?? "No autopay"');
        const detail = read("components/operationalCards/FinancialsDetailCard.tsx");
        expect(detail).not.toContain('autopayLabel ?? "None"');
    });

    /* ACH readiness IS real — it reads the merchant row — and must not be suppressed with it. */
    it("preserves genuine ACH readiness", () => {
        const vm = read("lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM.ts");
        expect(vm).toContain("ach_readiness");
    });
});
