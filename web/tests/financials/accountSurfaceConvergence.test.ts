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

/**
 * The source with its comments removed.
 *
 * Three locks in this file have now been caught asserting their own EXPLANATORY PROSE: a comment
 * saying why "Account-wide · every site" was removed contains the string, and a comment promising
 * exactly one `overflow-y-auto` counts as a second one. A test that passes judgement on a comment
 * proves nothing about the code, and — worse — a test that FAILS on a comment sends the next person
 * to delete the explanation. Strip them and assert the code.
 */
function code(path: string): string {
    return read(path)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
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
        /*
         * A CLICKABLE backdrop, not a decorative one. This asserted a `::before` scrim, which cannot
         * receive a click — so the only way out of a command was its own Cancel. It is a real
         * element now, and it dismisses through the platform's return-to-base signal.
         */
        expect(css).toContain(".alloy-accounts-command-backdrop");
        expect(css, "the account stays behind a scrim")
            .toMatch(/\.alloy-accounts-command-host:has\(\[data-financials-overlay\]\)[^{]*\{[^}]*position: fixed/);
        const detail = read("app/adminV2/financials/FinancialsAccountDetail.tsx");
        expect(detail, "and the backdrop is clickable").toContain('data-financials-command-backdrop="true"');
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
        const block = css.slice(css.indexOf(".alloy-accounts-command-host [data-financials-overlay] .alloy-os-financials__preview"));
        const uncapped = block.slice(0, block.indexOf("}") + 1);
        expect(uncapped, "the command body is uncapped here").toContain("max-height: none");
        expect(uncapped, "and both inner caps are released").toContain(".alloy-os-ucard__body");
        expect(css, "while the layer itself stays bounded for smaller viewports")
            .toMatch(/\[data-financials-overlay\]\s*\{[^}]*max-height: min\(/);
    });

    /*
     * ── DISMISSAL IS THE PLATFORM'S, NOT A FINANCIALS RULE ─────────────────────────────────────
     *
     * `FinancialsCard` already subscribes to `useDismissSignal(coordination, "financials", …)`, the
     * Focus Panel's return-to-base path, which resets overlay, pending preview and command error
     * together. The workspace never supplied a coordination object, so the signal had nowhere to
     * come from. One handler raises it and every command the card can enter is covered — no
     * per-command document listener, and no Financials-only cancellation doctrine.
     */
    it("dismisses commands through the platform signal, not a bespoke listener", () => {
        const detail = read("app/adminV2/financials/FinancialsAccountDetail.tsx");
        expect(detail).toContain("coordination={coordination}");
        expect(detail).toMatch(/dismissed:[^,]*card: "financials"/);
        expect(detail, "Escape is handled once, for whatever command is open").toContain('e.key !== "Escape"');
        /* One scope-level listener is the platform shape; a listener per command is what is banned. */
        expect((detail.match(/addEventListener/g) ?? []).length).toBeLessThanOrEqual(2);
    });

    /*
     * PERIOD BELONGS WITH ACTIVITY. The summary led with the billing period while the ledger
     * directly beneath it is period-aware, carries a period column and offers an All-periods
     * filter — two statements of the same context. The Focus Panel keeps both, having no ledger.
     */
    /*
     * This used to assert a `display: none` rule that hid the summary's period heading. Hiding
     * markup a component still emits is a workaround, not a decision, and it fails silently the
     * moment a class name moves. The account summary now COMPOSES no period zone — three figures
     * and two commands — and the ledger beneath it is period-GROUPED, which is where a period
     * belongs. The lock is on those two facts.
     */
    it("keeps the billing period with the activity rather than in the account summary", () => {
        const card = read("components/operationalCards/FinancialsCard.tsx");
        const variant = card.slice(card.indexOf("function FinancialsAccountSummaryCard"));
        expect(variant, "the account summary composes no period zone")
            .not.toMatch(/alloy-os-billing__period|Current period/);
        const detail = read(WORKSPACE_DETAIL);
        expect(detail, "and the ledger still carries it").toContain("financials-filter-");
        expect(detail, "as a grouping, in the detail card's own period anatomy")
            .toContain("alloy-os-fdetail__periodhead");
        expect(detail).toContain("periodKey");
    });

    /*
     * ── ONE DATE RULE, THE PLATFORM'S ─────────────────────────────────────────────────────────
     *
     * A ledger row read `2026-12-01` beside a payment that read `Sep 14`. The presentation doctrine
     * already forbids that — "Never YYYY-MM-DD on operator surfaces" — and Financials had a private
     * `toLocaleDateString` plus five raw renders.
     *
     * The helper then changed, and for a financial reason. `formatQueueRowDateCompact` drops the
     * year inside the current year ("Sep 14"), which is right for a work queue and wrong for a
     * ledger: financial activity crosses months, billing periods and fiscal years, and a date
     * without a year cannot be reconciled against a statement. Everything now routes through
     * `formatDisplayDate`, which always carries the year.
     */
    it("formats every operator-facing Financials date through the platform helper", () => {
        const fmt = read("app/adminV2/financials/financialsFormat.ts");
        expect(fmt, "the platform's date authority, not a private formatter")
            .toContain("presentationDateFormat");
        expect(fmt, "and the year-bearing member of it").toContain("formatDisplayDate");
        expect(fmt, "never the year-dropping queue helper on a financial surface")
            .not.toMatch(/formatQueueRowDateCompact\s*\(/);
        /*
         * A CALL, not the word. This asserted the bare string and matched the comment that explains
         * the removal — a test passing judgement on its own prose proves nothing about the code.
         */
        expect(fmt, "no private date formatting survives").not.toMatch(/toLocaleDateString\s*\(/);

        /*
         * THE ADAPTER WAS THE LAST YEAR-DROPPER, and it fed the canonical surface: its private
         * `shortDate` produced "Aug 15" for every row of the Focus Panel Details ledger while its
         * `longDate` produced "Oct 1, 2026" two lines above. Two private formatters, disagreeing.
         */
        const adapter = read("lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard.ts");
        expect(adapter, "no private date formatter in the Financials adapter")
            .not.toMatch(/toLocaleDateString\s*\(/);
        expect(adapter, "and no raw ISO date reaching a label").not.toMatch(/\.slice\(0,\s*10\)/);
        expect(adapter).toContain("formatDisplayDate");

        const surfaces = [
            WORKSPACE_DETAIL,
            "app/adminV2/financials/sections/FinancialsCharges.tsx",
            "app/adminV2/financials/sections/FinancialsActivity.tsx",
            "app/adminV2/financials/sections/FinancialsPayments.tsx",
            "app/adminV2/financials/sections/FinancialsOverview.tsx",
            "components/admin/focusPanel/cards/FinancialsCard.tsx",
        ];
        for (const path of surfaces) {
            const src = read(path);
            /* A raw ISO date reaching JSX — `{row.date}`, `{x.serviceDate}`, `.slice(0, 10)`. */
            expect(src, `${path} must not print a raw date`).not.toMatch(/\{\s*(row|t|p|e)\.(date|serviceDate|receivedAt|postedAt|dueDate)\s*(\?\?[^}]*)?\}/);
            expect(src, `${path} must not truncate an ISO string for display`).not.toMatch(/\.slice\(0,\s*10\)\}/);
        }
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
        expect(detail, "the ledger is rendered, not gated").toContain("LedgerPeriods");
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

// ── PASS 5E · THE WORKSPACE FIT ─────────────────────────────────────────────────────────────────

describe("F9 · the queue is a queue, and the account is already open", () => {
    const ACCOUNTS_SRC = "app/adminV2/financials/sections/FinancialsAccounts.tsx";

    /*
     * A ROW IN THE HOUSE GRAMMAR, NOT A FINANCIAL LIST.
     *
     * Processing, the work-unit queue and the configuration rails all render one shell whose
     * perimeter and elevation come from the Focus Panel card tokens. The rail used to draw its own
     * flat divider list with a navy left edge, which is how it drifted from every other queue in
     * the product. The lock is on the REUSE — a rail that hand-rolls the same look would pass a
     * screenshot and fail the next time the house treatment changes.
     */
    it("renders account rows in the shared queue-row shell", () => {
        const src = read(ACCOUNTS_SRC);
        expect(src).toContain("QUEUE_ROW_CARD_SHELL_CLASS");
        expect(src, "selected state is the canonical Bend Pine treatment")
            .toContain("QUEUE_ROW_CARD_SELECTED_BORDER_CLASS");
        expect(src, "and not a hand-rolled selection edge").not.toMatch(/border-l-alloy-midnight/);
        /* The shell itself must still be the one the rest of the product uses. */
        const shell = read("lib/presentation/runtime/queueRowCardShell.ts");
        expect(shell).toContain("alloy-os-queue-row-card");
        expect(shell).toMatch(/SELECTED_BORDER_CLASS[\s\S]{0,200}alloy-bend-pine/);
    });

    /*
     * SELECTION IS DERIVED, NOT WRITTEN BY AN EFFECT.
     *
     * The Director QA harness lost the operator's position twice to an effect that wrote state
     * during render. Auto-selection is the same shape of problem, so it is a pure function of the
     * cohort and the operator's explicit choice — asserted directly in `accountQueue.test.ts`, and
     * asserted HERE to be the thing the surface actually calls.
     */
    it("derives the open account instead of writing it from an effect", () => {
        const src = read(ACCOUNTS_SRC);
        expect(src).toContain("resolveAccountSelection");
        expect(src, "no effect writes the selection").not.toMatch(/useEffect\([^)]*setChosen/);
        expect(src, "the empty cohort still has its own state").toContain("No household account in scope");
        expect(src, "and a narrowed-to-nothing queue says something different")
            .toContain("No account matches these filters");
    });

    it("offers search, program and room — and never a second site control", () => {
        const src = read(ACCOUNTS_SRC);
        expect(src).toContain("data-financials-account-search");
        expect(src).toContain("financials-account-program");
        expect(src).toContain("financials-account-room");
        /*
         * Site scope is the workspace's, resolved server-side. A site filter inside the rail would
         * be a second answer to a question that already has one — see `accountQueue`.
         */
        expect(src, "site is not re-offered inside the rail").not.toMatch(/All sites|site_location_id/);
    });

    it("names the household once, and states no scope sentence over it", () => {
        const src = read(ACCOUNTS_SRC);
        expect(src, "the selected row is the statement of which account is open")
            .not.toContain("data-financials-detail-household");
        expect(code(ACCOUNTS_SRC), "and the scope sentence is gone").not.toContain("Account-wide · every site");
        expect(src, "identity survives for assistive technology").toMatch(/aria-label=\{`Financials — /);
    });
});

describe("F10 · the controls stay; the activity scrolls", () => {
    it("gives the account exactly one scroll owner, and it is the activity", () => {
        const detail = read(WORKSPACE_DETAIL);
        expect(detail, "the activity region owns the overflow").toContain("data-financials-activity-scroll");
        const scrollers = code(WORKSPACE_DETAIL).match(/overflow-y-auto/g) ?? [];
        expect(scrollers.length, "one scroller inside the account body, never two").toBe(1);
        /* And the lens bar is outside it — controls do not travel with the record. */
        expect(detail.indexOf("data-financials-lensbar")).toBeLessThan(
            detail.indexOf("data-financials-activity-scroll"),
        );

        const css = read("app/adminV2/components/alloyOsRuntime.css");
        expect(css, "the card takes the height it is given").toMatch(
            /\.alloy-accounts-account-card \{[^}]*min-height: 0/,
        );
    });

    it("applies the same principle inside Focus Panel Details", () => {
        const card = read("components/operationalCards/FinancialsDetailCard.tsx");
        expect(card).toContain("data-financials-detail-scroll");
        expect(card.indexOf("data-financials-lenses")).toBeLessThan(card.indexOf("data-financials-detail-scroll"));
        const css = read("app/adminV2/components/operationalCardsShared.css");
        expect(css, "one scroller in the detail, not a second inside the modal").toMatch(
            /\.alloy-os-fdetail__scroll \{[^}]*overflow-y: auto/,
        );
        expect(css).toMatch(/\.alloy-os-billing--detail[^{]*__body \{[^}]*overflow: hidden/);
    });
});

describe("F11 · the three metrics are peers", () => {
    it("gives current balance no more weight than due or past due", () => {
        const card = read("components/operationalCards/FinancialsCard.tsx");
        const variant = card.slice(card.indexOf("function FinancialsAccountSummaryCard"));
        const summary = variant.slice(0, variant.indexOf("\nfunction ", 1));
        expect(summary, "no emphasis on one of three peers").not.toMatch(/label="Current balance"[^/]*strong/);
        expect(summary).toContain("alloy-os-fdetail__strip--peers");
        const css = read("app/adminV2/components/operationalCardsShared.css");
        expect(css, "and the peer treatment sets ONE value size").toMatch(
            /__strip--peers \.alloy-os-fdetail__statvalue \{[^}]*font-size/,
        );
    });

    it("renders the committed anatomy before the figures arrive", () => {
        const card = read("components/operationalCards/FinancialsCard.tsx");
        const pending = card.slice(card.indexOf("export function AccountSummaryPending"));
        /* The same three labels, the same two commands, the same classes — so nothing moves. */
        for (const label of ["Current balance", "Due", "Past due", "Payment", "Add charge"]) {
            expect(pending.slice(0, 2000), `${label} is present in the pending frame`).toContain(label);
        }
        expect(pending.slice(0, 2000)).toContain("alloy-os-fdetail__strip--peers");
        expect(pending.slice(0, 2000), "placeholders, never a zero that reads as a balance")
            .not.toMatch(/\$0|0\.00/);
        const host = read("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(host, "and the account placement uses it while loading").toContain("<AccountSummaryPending />");
    });
});

describe("F12 · a billing period is named, not identified", () => {
    /*
     * `YYYY-MM` is the period's IDENTITY — what a filter carries and an `<input type="month">`
     * holds — and never its NAME. A dated identifier where a human label belongs is the same
     * doctrine violation as a raw ISO date on a ledger row, and it had leaked into four surfaces.
     */
    it("routes every operator-facing period label through the one authority", () => {
        const authority = read("lib/financials/billingPeriod.ts");
        expect(authority).toContain("export function billingPeriodLabel");

        for (const path of [
            "lib/financials/workspace/accountLenses.ts",
            "lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard.ts",
            "app/adminV2/financials/sections/FinancialsCharges.tsx",
            "app/adminV2/financials/sections/FinancialsBulkCharge.tsx",
            WORKSPACE_DETAIL,
        ]) {
            expect(read(path), `${path} must label periods, not print their keys`)
                .toContain("billingPeriodLabel");
        }
    });

    it("does not print a period key where a label belongs", () => {
        /* The filter's VALUE stays canonical; its LABEL does not. */
        const lenses = read("lib/financials/workspace/accountLenses.ts");
        expect(lenses).toContain("label: billingPeriodLabel(value)");
        expect(lenses, "the value an operator's choice carries is still the key")
            .toMatch(/byKey\.set\(value, \{ value,/);

        const charges = read("app/adminV2/financials/sections/FinancialsCharges.tsx");
        expect(charges, "no bare period key interpolated into a row").not.toMatch(/\$\{row\.periodKey\}/);
        const bulk = read("app/adminV2/financials/sections/FinancialsBulkCharge.tsx");
        expect(bulk, "the run result reads as a month").toContain("billingPeriodLabel(result.periodKey)");
        expect(bulk, "and the month input still holds the key").toContain('type="month"');
    });
});

describe("F13 · the ledger grid is prioritised", () => {
    it("gives Type room to render a configured label and lets Description flex", () => {
        const css = read("app/adminV2/components/operationalCardsShared.css");
        const grid = /\.alloy-os-billingdetail__row \{[\s\S]*?grid-template-columns:\s*([^;]+);/.exec(css);
        expect(grid, "the ledger declares its columns").toBeTruthy();
        const tracks = grid![1]!.trim().split(/\s+(?![^(]*\))/);
        expect(tracks.length, "eight columns: date, type, subject, description, gl, amount, status, source")
            .toBe(8);
        const px = (t: string) => Number((/^(\d+)px$/.exec(t) ?? [])[1] ?? NaN);
        expect(px(tracks[1]!), "Type is fixed and wide enough for a configured label")
            .toBeGreaterThanOrEqual(112);
        expect(tracks[3], "Description is the column that flexes").toContain("minmax(0, 1fr)");
        expect(px(tracks[0]!), "Date fits a year-bearing date").toBeGreaterThanOrEqual(78);

        /*
         * ── AND THE FIXED TRACKS MUST LEAVE DESCRIPTION A COLUMN ──────────────────────────────
         *
         * Widening Type is only half the correction. The first attempt made the seven fixed tracks
         * sum to more than the ledger had, and Description — the flexible one — was measured on the
         * running build at 55px. A budget that starves the flex track is the same defect as one
         * that starves Type, and neither is visible in a rule that only checks Type's width.
         *
         * The workspace ledger measures ~850px at a 1512px viewport. Fixed tracks plus gaps must
         * leave Description at least 180px there.
         */
        const gapMatch = /\.alloy-os-billingdetail__row \{[\s\S]*?gap:\s*(\d+)px/.exec(css);
        const gap = Number(gapMatch?.[1] ?? 10);
        const fixed = tracks.filter((t) => /^\d+px$/.test(t)).reduce((sum, t) => sum + px(t), 0);
        const description = 850 - fixed - gap * 7;
        expect(description, `Description would be ${description}px at the workspace's ledger width`)
            .toBeGreaterThanOrEqual(180);

        /* And the lab's copy still agrees — the review surface must not show a different ledger. */
        const lab = read("app/dev/operational-card-lab/cardLab.css");
        const labGrid = /\.alloy-os-billingdetail__row \{[\s\S]*?grid-template-columns:\s*([^;]+);/.exec(lab);
        expect(labGrid![1]!.trim().replace(/\s+/g, " ")).toBe(grid![1]!.trim().replace(/\s+/g, " "));
    });
});

describe("F14 · the queue filters are the house control", () => {
    it("uses AlloySelect rather than a raw browser select", () => {
        for (const path of [
            "app/adminV2/financials/sections/FinancialsAccounts.tsx",
            WORKSPACE_DETAIL,
            "components/operationalCards/FinancialsDetailCard.tsx",
        ]) {
            const src = read(path);
            expect(src, `${path} must use the platform dropdown`).toContain("AlloySelect");
            expect(src, `${path} must not hand-roll a <select> for a filter`)
                .not.toMatch(/<select\b[\s\S]{0,400}data-financials-filter/);
        }
    });
});
