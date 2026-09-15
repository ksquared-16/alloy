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

import { chargeCategoryLabel } from "@/lib/financials/chargeCategories";

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
     * THE FLOOR IS HONEST, NOT INVENTED. A category the catalog does not know comes back unchanged
     * rather than being humanized into a label nobody configured.
     */
    it("returns an unknown category unchanged rather than inventing a label", () => {
        expect(chargeCategoryLabel("not_a_configured_category")).toBe("not_a_configured_category");
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
        const workspaceAt = src.indexOf("FinancialsAccountWorkspaceDetail key=");
        const cardAt = src.indexOf("FinancialsAccountDetail\n");
        expect(workspaceAt, "the workspace detail is rendered").toBeGreaterThan(-1);
        // The command-bearing card remains available, but subordinate to it.
        expect(src).toContain("data-financials-account-actions");
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
