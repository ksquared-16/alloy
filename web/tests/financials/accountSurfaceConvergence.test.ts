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

    /*
     * ── SUMMARY, THEN DETAIL. ONE HIERARCHY. ───────────────────────────────────────────────────
     *
     * The locked composition: the Focus Panel's Financials card is the account's single summary and
     * action object, and the expanded detail sits directly beneath it. Both are composed, neither is
     * reimplemented.
     *
     * This assertion previously required only that the workspace detail rendered, and the surface
     * drifted into having TWO summaries — the detail carried its own metric band saying the same
     * figures the card said, under different labels. Order is the thing being locked now, because
     * order is what was wrong.
     */
    it("leads with the summary card and puts the detail directly beneath it", () => {
        const src = read(ACCOUNTS);
        const summaryAt = src.indexOf("<FinancialsAccountDetail");
        const detailAt = src.indexOf("<FinancialsAccountWorkspaceDetail");
        expect(summaryAt, "the command-bearing card is composed, not re-implemented").toBeGreaterThan(-1);
        expect(detailAt, "the expanded detail is rendered").toBeGreaterThan(-1);
        expect(summaryAt, "summary above, detail below").toBeLessThan(detailAt);
    });

    it("carries exactly one summary, not two", () => {
        const detail = read(WORKSPACE_DETAIL);
        expect(detail, "the detail no longer restates the card's figures").not.toContain("data-financials-state-band");
        /* The figures belong to the card above; the detail holds the ledger and the arrangements. */
        for (const restated of ["Gross charged", "Payments received", "Collectible now"]) {
            expect(detail, `${restated} is the summary's to state`).not.toContain(restated);
        }
    });

    /*
     * ── ONE SURFACE, NOT A SET OF DESTINATIONS ─────────────────────────────────────────────────
     *
     * The Accounts placement offers no drill-down. `Details →` is a Focus Panel affordance, where
     * the card is financial context beside some other subject; here the operator has already opened
     * Financials, chosen Accounts and selected a household, and the account's activity is directly
     * beneath. The prop defaults to present so the Focus Panel keeps it.
     */
    it("offers no drill-down from the Accounts placement", () => {
        const src = read(ACCOUNTS);
        expect(src).toContain("showDetailsAction={false}");
        const card = read("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card, "and the Focus Panel still gets it by default").toContain("showDetailsAction = true");
    });

    /*
     * A COMMAND BORROWS THE OPERATOR; IT IS NOT A PLACE THEY GO.
     *
     * `FinancialsCard` enters a command by returning a different tree, which in the Focus Panel is
     * raised by that panel's focused perspective. In Accounts the same return swapped the account
     * HEADER for the form while the ledger stayed below it. The host presents whatever overlay the
     * card has entered as a focused layer instead — presentation only, no second command, no second
     * executor, and no card state lifted out.
     */
    it("presents the card's command mode as a focused layer over the account", () => {
        const src = read(ACCOUNTS);
        expect(src).toContain("alloy-accounts-command-host");
        const css = read("app/adminV2/components/alloyOsRuntime.css");
        expect(css).toContain(".alloy-accounts-command-host");
        expect(css, "the account stays behind a scrim rather than being replaced")
            .toMatch(/\.alloy-accounts-command-host:has\(> \[data-financials-overlay\]\)::before/);
        /*
         * BOUNDED, not a pinned number. This asserted `78svh` and then failed when the bound was
         * raised to fit the Add Charge footer — pinning the value locks the accident rather than
         * the rule. The rule is that the layer is bounded to the viewport at all, so a small screen
         * scrolls the layer instead of pushing the actions off it.
         */
        expect(css, "and the command's own actions stay reachable")
            .toMatch(/\[data-financials-overlay\]\s*\{[^}]*max-height: min\(\d+svh/);
        /* One Add Charge implementation: the workspace composes the card, it does not rebuild it. */
        expect(src).not.toContain("AddChargeCommand");
    });

    /*
     * ── ONE FINANCIALS OBJECT, OPENED TO ITS FULL DEPTH ────────────────────────────────────────
     *
     * Summary, divider, lenses and activity are one bordered surface. They are SIBLINGS in the DOM
     * rather than nested, and that is deliberate: `FinancialsCard` enters a command by returning a
     * different tree, so a body rendered inside it unmounts the instant Add Charge opens and comes
     * back with its lens and scroll reset — which is exactly the state Cancel exists to restore.
     * The shared border is drawn by the placement and suppressed on the card within it.
     */
    it("renders the summary and the account body as one surface", () => {
        const src = read(ACCOUNTS);
        const surfaceAt = src.indexOf("alloy-accounts-account-card");
        expect(surfaceAt, "the placement draws one account surface").toBeGreaterThan(-1);
        const summaryAt = src.indexOf("<FinancialsAccountDetail");
        const bodyAt = src.indexOf("<FinancialsAccountWorkspaceDetail");
        expect(summaryAt).toBeGreaterThan(surfaceAt);
        expect(bodyAt, "both live inside that surface, summary first").toBeGreaterThan(summaryAt);

        const css = read("app/adminV2/components/alloyOsRuntime.css");
        expect(css).toContain(".alloy-accounts-account-card");
        expect(css, "and the card inside it draws no second box")
            .toMatch(/\.alloy-accounts-account-card \.alloy-os-ucard/);
    });

    /* The lenses and the account body are not a second workspace panel with its own chrome. */
    it("gives the account body no card chrome of its own", () => {
        const detail = read(WORKSPACE_DETAIL);
        expect(detail, "the lens region is a divider, not a panel").toContain('data-financials-lenses="true"');
        expect(detail).not.toMatch(/data-financials-lenses="true"[^>]*rounded-xl/);
        expect(detail).not.toMatch(/<section className="rounded-xl border/);
    });

    /*
     * FOCUS PANEL COMPACT, ACCOUNTS EXPANDED. One presentation system, two depths — the difference
     * is what the placement passes, never a second component or a second truth.
     */
    it("keeps the Focus Panel compact and Accounts expanded", () => {
        const card = read("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card, "the drill-down is on by default, so the Focus Panel keeps it")
            .toContain("showDetailsAction = true");
        const accounts = read(ACCOUNTS);
        expect(accounts, "and Accounts turns it off").toContain("showDetailsAction={false}");
        expect(accounts, "Accounts shows the body without asking").toContain("<FinancialsAccountWorkspaceDetail");
        /* Nothing in the Focus Panel path opts into the expanded body. */
        expect(card).not.toContain("alloy-accounts-account-card");
    });

    /*
     * ADD CHARGE FITS. The command body carried its own 420px cap, so the form scrolled inside a
     * layer that had room for it. The host bounds the layer; the body grows to its content.
     */
    it("lets the Add Charge body grow to its content inside the bounded layer", () => {
        const css = read("app/adminV2/components/alloyOsRuntime.css");
        /*
         * Two caps had to go, and the second was the one that hid the footer: `UniversalCard` bounds
         * its body at 324px, and measured at 1280x720 the Add Charge form wanted 547px, so the
         * action row sat at y=721 — one pixel below the fold. Inside this layer both grow and the
         * LAYER does the bounding, so a laptop shows the whole form and a smaller viewport scrolls
         * the layer with the actions still reachable.
         */
        const block = css.slice(css.indexOf(".alloy-accounts-command-host > [data-financials-overlay] .alloy-os-financials__preview"));
        const uncapped = block.slice(0, block.indexOf("}") + 1);
        expect(uncapped, "the command body is uncapped here").toContain("max-height: none");
        expect(uncapped, "and both inner caps are released").toContain(".alloy-os-ucard__body");
        expect(css, "while the layer itself stays bounded for smaller viewports")
            .toMatch(/\[data-financials-overlay\]\s*\{[^}]*max-height: min\(/);
    });

    /*
     * The operator is already in the Financials workspace and has already chosen an account.
     * Requiring `Details →` before showing its ledger asks them to say so twice.
     */
    it("shows the ledger without a further command", () => {
        const src = read(ACCOUNTS);
        expect(src, "no disclosure wraps the account surface").not.toContain("<details");
        const detail = read(WORKSPACE_DETAIL);
        expect(detail).toContain("data-financials-lenses");
        expect(detail, "the ledger is rendered, not gated").toContain("LedgerTable");
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
