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
        /*
         * The surface joins code and name; the shared renderer draws the result and decides the
         * mapped/unmapped state. A code alone is unreadable and a name alone is unsearchable, so
         * the join is the fact worth locking here.
         */
        const src = read(WORKSPACE_DETAIL);
        expect(src).toContain("glCode");
        expect(src).toContain("glAccountName");
        expect(src, "code and name are joined for display").toMatch(/\$\{glCode\} · \$\{glName\}/);
        expect(read("components/operationalCards/FinancialsLedger.tsx")).toContain("data-financials-gl-state");
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
        expect(detail, "as a grouping, through the shared period renderer")
            .toMatch(/FinancialsLedgerPeriod/);
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
        /*
         * The whole function, not a character budget. This sliced the first 2000 characters and
         * broke when a comment grew — measuring how much prose the function carries rather than
         * what it renders.
         */
        const from = card.indexOf("export function AccountSummaryPending");
        const pending = card.slice(from, card.indexOf("\nfunction ", from));
        /* The same three labels, the same two commands, the same classes — so nothing moves. */
        for (const label of ["Current balance", "Due", "Past due", "Payment", "Add"]) {
            expect(pending, `${label} is present in the pending frame`).toContain(label);
        }
        expect(pending).toContain("alloy-os-fdetail__strip--peers");
        expect(pending, "placeholders, never a zero that reads as a balance").not.toMatch(/\$0|0\.00/);
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
        expect(px(tracks[0]!), "Date fits a year-bearing date").toBeGreaterThanOrEqual(78);
        /*
         * DESCRIPTION IS LAST, FLEXIBLE, AND FLOORED.
         *
         * 5F bounded it and it still sat in the visual CENTRE of the row, so the eye crossed free
         * text to get from Child to GL and again from Amount to who owes it. The scan order is now
         * the column order — Date, Type, Child, GL, Amount, Status, Responsible party — and
         * Description is the eighth and only flexible track, taking less than a full fraction so it
         * cannot grow into the identity columns' share. The floor stays because a flex track with
         * no minimum collapses to nothing, and a zero-width preview is worse than a truncated one.
         */
        expect(tracks[7], "Description is last and is the flexible track").toMatch(/^minmax\(\d+px, 0?\.\d+fr\)$/);
        for (const i of [0, 1, 2, 3, 4, 5, 6]) {
            expect(tracks[i], `track ${i} is a fixed identity column`).toMatch(/^\d+px$/);
        }

        /*
         * ── DESCRIPTION IS A PREVIEW, AND MUST NOT DOMINATE ───────────────────────────────────
         *
         * Two failures, in opposite directions, are both locked here because both have happened.
         *
         * STARVED: an over-corrected budget once made the seven fixed tracks sum to more than the
         * ledger had, and Description measured 55px on the running build.
         *
         * DOMINANT: before that, Description held the only flex track and took every spare pixel
         * while the columns that IDENTIFY a row — which child, which GL account, who owes it —
         * truncated around it. A ledger is scanned, and free text is the least identifying thing
         * on it.
         *
         * So: Description flexes, never collapses, and is never the widest column on the row. The
         * workspace ledger measures ~899px at a 1512px viewport after Pass 5E reclaimed the gutter.
         */
        const gapMatch = /\.alloy-os-billingdetail__row \{[\s\S]*?gap:\s*(\d+)px/.exec(css);
        const gap = Number(gapMatch?.[1] ?? 10);
        const fixed = tracks.filter((t) => /^\d+px$/.test(t)).reduce((sum, t) => sum + px(t), 0);
        const description = 899 - fixed - gap * 7;
        expect(description, `Description would be ${description}px at the workspace's ledger width`)
            .toBeGreaterThanOrEqual(100);
        const widestFixed = Math.max(...tracks.filter((t) => /^\d+px$/.test(t)).map(px));
        expect(
            description,
            `Description (${description}px) must not dominate the row — the widest identity column is ${widestFixed}px`,
        ).toBeLessThanOrEqual(widestFixed * 1.6);

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

// ── PASS 5F · BILLING, CHARGES AND LEDGER, CLOSED ───────────────────────────────────────────────

describe("F15 · the ledger names business identities, not model words", () => {
    const LEDGERS = [WORKSPACE_DETAIL, "components/operationalCards/FinancialsDetailCard.tsx"];

    /*
     * "Subject" was a word from the data model standing in for a fact the system already knows.
     * Child, Responsible party and Payer are THREE different financial identities and the product
     * must not collapse them: a child is who a charge is FOR, a responsible party is who OWES it,
     * and a payer is who supplied money. Conflating the first two is how a surface ends up telling
     * an operator that a four-year-old owes $1,850.
     */
    it("heads the ledger with Child and Responsible party, from ONE renderer", () => {
        /*
         * The headings used to be asserted in each surface, which was the weaker claim: it proved
         * two files said the same words on the day it was written, not that they could not drift.
         * Both surfaces now render through `FinancialsLedger`, so the vocabulary is asserted once
         * where it is defined — and each surface is asserted NOT to hand-roll a row of its own,
         * which is the fact that keeps them identical.
         */
        const ledger = code("components/operationalCards/FinancialsLedger.tsx");
        expect(ledger).toMatch(/<span>Child<\/span>/);
        expect(ledger).toMatch(/<span>Responsible party<\/span>/);
        expect(ledger, 'no column is headed "Subject"').not.toMatch(/<span>Subject<\/span>/);
        expect(ledger, 'no column is headed "Source"').not.toMatch(/<span>Source<\/span>/);

        for (const path of LEDGERS) {
            const src = code(path);
            expect(src, `${path} renders through the shared ledger`).toMatch(/FinancialsLedger/);
            expect(
                src,
                `${path} must not hand-roll a ledger row — that is how two grids drift`,
            ).not.toMatch(/alloy-os-billingdetail__row alloy-os-billingdetail__row--head/);
        }
    });

    it("reads the responsible party at the grain the model actually has", () => {
        /*
         * `financial_responsibility_allocations` is keyed by charge_id, so responsibility IS
         * charge-grain and a row can state its own. Nothing is fabricated per child: a charge whose
         * allocations name two people reports "Split" rather than picking one, and a charge with no
         * allocation at all is distinguished from one that names nobody.
         */
        const vm = read("lib/adminV2/runtime/focusPanel/financials/buildFinancialsCardVM.ts");
        expect(vm).toContain("responsiblePartyName");
        expect(vm, "the index is built from the allocations already read, not a second query")
            .toContain("responsibilityByCharge");
        expect(vm, "two parties on one charge is reported, never resolved to one").toContain('"Split"');
        expect(vm, "an unassigned allocation is its own state").toContain("responsibilityUnassigned");

        for (const path of LEDGERS) {
            expect(code(path), `${path} distinguishes unassigned from absent`).toMatch(/Unassigned/);
        }
    });
});

describe("F16 · GL is truthful", () => {
    it("states an unmapped row as a state, never as a dash", () => {
        const ledger = code("components/operationalCards/FinancialsLedger.tsx");
        expect(ledger, "the one renderer says Unmapped").toContain('"Unmapped"');
        expect(ledger, "and never the em-dash form").not.toContain("— unmapped");
        expect(ledger, "and marks the state for the eye and for a test").toContain("data-financials-gl-state");
        const css = read("app/adminV2/components/operationalCardsShared.css");
        expect(css, "and it is toned as attention rather than as a successful value").toMatch(
            /gl-state="unmapped"\]\s*\{[^}]*color:/,
        );
    });

    it("gives the missing mapping an operator surface, gated like every other Financials write", () => {
        /*
         * ROOT CAUSE, from the census: `gl_accounts` held ten active accounts and
         * `gl_account_mappings` held ZERO. The projection was correct and was reporting the truth;
         * what did not exist was any way for an operator to create the missing half. GL Codes were
         * authorable; the category → account mapping was not, anywhere.
         */
        const route = read("app/api/admin/financials/gl-mappings/route.ts");
        expect(route).toContain("assertFinancialsReadAllowed");
        expect(route).toContain("assertFinancialsWriteAllowed");
        expect(route, "the keys are code-owned, so an unknown one is refused rather than created")
            .toContain("Unknown mapping key.");
        expect(route, "and it writes configuration only").not.toMatch(/financial_journal_entries|charges/);

        const panel = read("components/adminV2/settings/financials/accounting/AccountingPostingPanels.tsx");
        expect(panel).toContain("gl-mapping-panel");
        expect(panel, "an operator picks an account, never a mapping key").toContain("AlloySelect");

        const declared = read("scripts/routeCapabilities.declared.json");
        expect(declared, "the route declares its capability").toContain(
            "app/api/admin/financials/gl-mappings/route.ts",
        );
    });
});

describe("F17 · the accounting period has a surface", () => {
    it("shows the calendar, its periods and their open/closed status", () => {
        const panel = read("components/adminV2/settings/financials/accounting/AccountingPostingPanels.tsx");
        expect(panel).toContain("accounting-calendar-panel");
        expect(panel).toContain("accounting-period-table");
        expect(panel, "the period covering today is marked").toContain("accounting-period-current");
        expect(panel, "a tenant with no calendar is told so, not shown an empty table")
            .toContain("accounting-calendar-absent");
        /*
         * NO CLOSE BUTTON, and the panel says why. Closing a period is what makes a month final,
         * it has no governed action, and a control here would either bypass the journal enforcement
         * or pretend. The limit is stated rather than quietly absent.
         */
        expect(panel).toContain("accounting-period-lifecycle-note");
        /*
         * Scoped to the CALENDAR panel: the GL mapping panel in the same file legitimately writes,
         * and an assertion over the whole file would have been read as "this file never writes",
         * which is neither true nor the claim being made.
         */
        const calendarPanel = panel.slice(panel.indexOf("function AccountingCalendarPanel"));
        expect(calendarPanel, "nothing in the calendar panel writes a period").not.toMatch(
            /method:\s*"(POST|PATCH|PUT|DELETE)"/,
        );

        const route = read("app/api/admin/financials/accounting-calendar/route.ts");
        expect(route, "read-only, and gated like every Financials read").toContain("assertFinancialsReadAllowed");
        expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    });

    it("puts both periods and the GL account on the transaction's own detail", () => {
        const detail = code("app/adminV2/financials/FinancialsChargeDetail.tsx");
        expect(detail).toContain('label="Billing period"');
        expect(detail).toContain('label="Accounting period"');
        expect(detail).toContain('label="GL account"');
        expect(detail, "a charge that has not posted has no accounting period, and says so")
            .toContain("Not posted to a period yet");

        const resolver = read("lib/financials/workspace/resolveChargeDetail.ts");
        expect(resolver, "the accounting period is READ from the journal entry").toContain(
            "financial_journal_entries",
        );
        expect(resolver, "and never recomputed here").toContain("accounting_period_id");
        expect(resolver, "while the billing period stays derived by its one authority").toContain(
            "placeInBillingPeriod",
        );
    });
});

describe("F18 · the queue filters like the rest of the product", () => {
    const ACCOUNTS = "app/adminV2/financials/sections/FinancialsAccounts.tsx";

    it("keeps Search visible and hides Filters behind the house button", () => {
        const src = code(ACCOUNTS);
        expect(src, "search is always there").toContain("data-financials-account-search");
        expect(src, "filters are asked for").toContain("data-financials-account-filters-toggle");
        expect(src, "and the panel is conditional").toContain("data-financials-account-filters-panel");
        expect(src, "using the shared toolbar chrome, not a Financials-only drawer")
            .toContain("WS_QUEUE_TOOLBAR_CHROME");
        expect(src, "and the shared search chrome").toContain("WS_FIELD_SEARCH_CHROME");
        /* The count on the button excludes search, which has its own visible field. */
        expect(src).toContain("advancedFilterCount");
    });

    it("filters by the same state vocabulary the rows wear", () => {
        const queue = read("lib/financials/workspace/accountQueue.ts");
        expect(queue, "the filter IS accountState, not a second classification").toContain("accountState(row)");
        expect(queue).toContain("ACCOUNT_STATE_FILTERS");
        expect(queue, "and a state that would empty the queue says so first").toContain("stateCounts");
    });
});

describe("F19 · the operator surface carries no engineering copy", () => {
    it("does not print the running-balance doctrine at an operator", () => {
        for (const path of [WORKSPACE_DETAIL, "components/operationalCards/FinancialsDetailCard.tsx"]) {
            const src = code(path);
            expect(src, `${path} must not name a database table at an operator`).not.toMatch(
                /ledger_transactions/,
            );
            expect(src, `${path} must not print the running-balance paragraph`).not.toMatch(
                /No running balance column/,
            );
        }
        /* The INVARIANT is unchanged: no surface computes a running balance. */
        for (const path of [WORKSPACE_DETAIL, "components/operationalCards/FinancialsDetailCard.tsx"]) {
            expect(code(path), `${path} still computes no running total`).not.toMatch(/runningBalance/);
        }
    });

    it("no longer leaves a responsibility and funding footer under every ledger", () => {
        const src = code(WORKSPACE_DETAIL);
        expect(src, "the permanent footer heading is gone").not.toContain("Who owes it");
        expect(src, "and its empty state with it").not.toContain("No responsibility assigned");
        expect(src, "and the unclaimed-facts line, which described our implementation")
            .not.toContain("Not claimed here");
        /*
         * Neither concept left the product. Responsibility is on every row; funding keeps its own
         * lens, where an operator asks for it deliberately.
         */
        expect(src, "funding is shown under its lens").toMatch(/lens === "funding"/);
        expect(src).toContain("Expected funding");
    });
});

describe("F20 · the two Financials headers do not drift by accident", () => {
    /*
     * The surfaces carry DIFFERENT information on purpose — the Focus Panel is financial context
     * beside another process and states autopay and the next charge; the Accounts header is the
     * dedicated workspace's three-figure position. What they must never do is give the SAME figure
     * two different names, which is what "Balance" here and "Current balance" there was.
     */
    it("uses one label for the balance on both surfaces", () => {
        const accounts = code("components/operationalCards/FinancialsCard.tsx");
        const detail = code("components/operationalCards/FinancialsDetailCard.tsx");
        expect(accounts).toContain('label="Current balance"');
        expect(detail).toContain('label="Current balance"');
        expect(detail, "and not the short form it used to carry").not.toMatch(/label="Balance"/);
    });

    it("keeps one action grammar", () => {
        for (const path of [
            "components/operationalCards/FinancialsCard.tsx",
            "components/operationalCards/FinancialsDetailCard.tsx",
        ]) {
            const src = code(path);
            expect(src, `${path} enters payment by the same word`).toMatch(/>\s*Payment\s*</);
            /* `Add`, not `Add charge`: one command carries both modes, so the label names the act. */
            expect(src, `${path} offers Add as its peer`).toMatch(/>\s*Add\s*</);
        }
    });
});

// ── PASS 5G · ONE LEDGER, ONE MONEY RULE ────────────────────────────────────────────────────────

describe("F21 · the lens changes the cohort, never the renderer", () => {
    const LEDGER = "components/operationalCards/FinancialsLedger.tsx";
    const DETAIL = "components/operationalCards/FinancialsDetailCard.tsx";

    /*
     * ── THE ROOT CAUSE OF THE "INTERMITTENT" FORMATTING ───────────────────────────────────────
     *
     * The Details card carried THREE row presentations for one concept: the eight-column grid for
     * charges, a prose block for adjustments ("Raises what is owed · Sep 14, 2026 · Reason…"), and
     * a stack of stat strips for payments. Two of them appeared CONDITIONALLY — the adjustments
     * block rendered under BOTH the All lens and the Credits lens, so the very same lens showed
     * grid rows on an account with no manual reductions and grid rows followed by prose rows on an
     * account with some. Nothing was corrupting a grid; sometimes the thing on screen simply was
     * not the ledger. That is the shape of a defect reported as "sometimes broken formatting".
     */
    it("has exactly one row renderer, and the surfaces do not carry their own", () => {
        const ledger = code(LEDGER);
        expect(ledger, "the row markup is defined here").toContain("alloy-os-billingdetail__row");
        for (const path of [DETAIL, WORKSPACE_DETAIL]) {
            const src = code(path);
            expect(src, `${path} must not define a ledger row of its own`).not.toMatch(
                /className="alloy-os-billingdetail__row alloy-os-billingdetail__row--head"/,
            );
        }
        /* The retired presentations are gone, not merely unreferenced. */
        expect(code(DETAIL), "no prose adjustment row survives").not.toContain("alloy-os-fdetail__adjustment\"");
        expect(code(DETAIL), "no stat-strip payment block survives").not.toContain("alloy-os-fdetail__payment\"");
        expect(code(DETAIL), "adjustments render as ledger rows").toContain("ledgerRowFromAdjustment");
        expect(code(DETAIL), "payments render as ledger rows").toContain("ledgerRowFromPayment");
    });

    it("draws a collapsed period with the same component as an expanded one", () => {
        const ledger = code(LEDGER);
        const period = ledger.slice(ledger.indexOf("export function FinancialsLedgerPeriod"));
        expect(period, "collapse changes what is shown, not how").toContain("Collapsed · select to expand");
        expect(period, "and the open branch uses the shared head and row").toMatch(
            /FinancialsLedgerHead[\s\S]{0,400}FinancialsLedgerRow/,
        );
    });
});

describe("F22 · sign is arithmetic; colour is business state", () => {
    /*
     * A negative amount is not a bad amount. A credit reducing an obligation is negative and
     * ordinary; a refund is negative movement; a reversal's sign depends on what it reverses; a
     * negative balance is money the centre owes the family. Colouring by sign taught an operator to
     * read arithmetic direction as a verdict.
     */
    it("has no sign-derived colour anywhere in the shared ledger", () => {
        const ledger = code("components/operationalCards/FinancialsLedger.tsx");
        expect(ledger, "no ternary on the amount's sign").not.toMatch(/amount(Cents)?\s*<\s*0/);
        expect(ledger, "no credit-coloured class").not.toMatch(/--credit/);
        expect(ledger, "tone arrives from the caller, as business state").toContain("row.tone");

        /* And the Financials surfaces do not colour a figure by its sign either. */
        for (const path of [
            WORKSPACE_DETAIL,
            "components/operationalCards/FinancialsDetailCard.tsx",
            "app/adminV2/financials/sections/FinancialsOverview.tsx",
        ]) {
            const src = code(path);
            expect(src, `${path} must not colour money by its sign`).not.toMatch(
                /amountCents\s*<\s*0[^\n]{0,120}(text-alloy-bend-pine|text-alloy-ember|text-red)/,
            );
        }

        /* The retired rule stays defined-and-neutral so it cannot creep back as "it used to be green". */
        const css = read("app/adminV2/components/operationalCardsShared.css");
        expect(css).toMatch(/__entry-amount--credit \{\s*color: inherit;/);
        /*
         * State tones exist, are named for the STATE, and actually reach the figure. Asserting the
         * class name alone passed while a plant renamed half the selector — a lock that proves a
         * string is present, not that a rule applies.
         */
        expect(css, "attention tones the amount").toMatch(
            /__row--attention \.alloy-os-billingdetail__amount[\s\S]{0,160}color:/,
        );
        expect(css, "muted is a row-level treatment").toMatch(/__row--muted \{[^}]*color:/);
    });
});

describe("F23 · one financial summary grammar", () => {
    it("states the balance once on the detail card", () => {
        const detail = code("components/operationalCards/FinancialsDetailCard.tsx");
        expect(detail, "the card title no longer repeats the balance").not.toMatch(
            /insight=\{`\$\{period\.currentBalance\} balance`\}/,
        );
        expect(detail, "and the metric row still carries it").toContain('label="Current balance"');
    });

    it("shares the core metrics, in the same words, with the workspace", () => {
        const detail = code("components/operationalCards/FinancialsDetailCard.tsx");
        const account = code("components/operationalCards/FinancialsCard.tsx");
        for (const label of ["Current balance", "Due", "Past due"]) {
            expect(detail, `Focus Panel states ${label}`).toContain(`label="${label}"`);
            expect(account, `the workspace states ${label}`).toContain(`label="${label}"`);
        }
        /*
         * Autopay is gone from the metric row: the platform has no autopay model, so the metric
         * could only ever read "Not available yet" — a statement about Alloy in a slot meant for a
         * statement about this family.
         */
        expect(detail, "autopay is not a metric").not.toContain('label="Autopay"');
    });

    it("never renders a metric label above an apparently empty value", () => {
        const account = code("components/operationalCards/FinancialsCard.tsx");
        const from = account.indexOf("export function AccountSummaryPending");
        const pending = account.slice(from, account.indexOf("\nfunction ", from));
        expect(pending, "the pending slot is visibly a placeholder").toContain(
            "alloy-os-financials__pendingvalue",
        );
        expect(pending, "and never a zero").not.toMatch(/\$0|0\.00/);
    });
});

describe("F24 · a host without a projection still gets an account", () => {
    /*
     * ── THE REGRESSION THIS LOCKS ─────────────────────────────────────────────────────────────
     *
     * The card's bootstrap moved to `context.operationalProjection.cards.financials`: the Focus
     * Panel hands the summary down and the card issues no request of its own. Right for the Focus
     * Panel, and it silently broke the Financials WORKSPACE, which composes the same card and
     * builds its own context with no projection in it. `provisioned` was null, that was read as
     * "still provisioning", and the account summary sat in its pending frame indefinitely — three
     * labels over three placeholders — while the ledger beside it hydrated normally.
     *
     * Measured before the repair: body hydrated with 56 rows, summary still pending after 18
     * seconds, the card endpoint answering 200 throughout. The two states are different:
     * "the projection has not arrived yet" and "nobody is sending one" are not the same claim.
     */
    it("distinguishes a pending projection from a host that supplies none", () => {
        const card = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card, "provisioning is only claimed where a projection is actually coming").toMatch(
            /provisioningAccount =\s*context\.operationalProjection != null/,
        );
        expect(card, "and a projection-less host bootstraps the card itself").toContain(
            "hostSuppliesProjection",
        );
        /* The Focus Panel path is untouched: it supplies the object, so the fallback never runs. */
        expect(card).toMatch(/if \(hostSuppliesProjection\) return;/);
    });

    it("keeps the workspace placement free of a projection it cannot build", () => {
        /*
         * The workspace adapter composes a synthetic context deliberately — it is not a Focus Panel
         * and has no projection pipeline. That is allowed, and the card must cope with it rather
         * than the adapter faking a projection shape it does not own.
         */
        const adapter = code("app/adminV2/financials/FinancialsAccountDetail.tsx");
        expect(adapter, "the adapter does not fabricate a projection").not.toContain("operationalProjection");
    });
});

describe("F25 · Details is one surface, committed when it is asked for", () => {
    /*
     * ── THE DEFECT ────────────────────────────────────────────────────────────────────────────
     *
     * Opening Details produced four surfaces in a row: the compact card, a pending card, a second
     * card at a different span, then the hydrated detail. The cause was that the Details tree was
     * guarded on `vm && reconciliation`, so a deep read in flight fell THROUGH it into the generic
     * card at the bottom of the component — which renders a different anatomy, at `gridSpan="row"`
     * precisely because `expanded` is true.
     *
     * The lock is on the branch, not on the comment explaining it: there must be a Details branch
     * that fires when the data is NOT ready, and it must render the detail card rather than
     * anything else.
     */
    it("renders the Details anatomy before its figures arrive", () => {
        const card = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card, "a Details branch exists for the state where the read has not landed").toMatch(
            /overlay === "detail" && \(!vm \|\| !reconciliation\)/,
        );
        /* And what it renders is the detail card, in its hydrating frame — not a second anatomy. */
        expect(card).toMatch(/<FinancialsDetailCard hydrating/);
        /* Same container and same overlay identity, so the surface is not replaced when data lands. */
        expect(card).toMatch(/data-financials-hydrating="true"/);
    });

    it("states no figure it has not read", () => {
        /*
         * `$0.00` from a loading state is a financial claim about a family. The hydrating evidence
         * must carry the em dash — the card's own vocabulary for "no answer yet" — and no money.
         */
        const adapter = code("lib/adminV2/runtime/focusPanel/financials/adaptFinancialsVmToFinancialsCard.ts");
        const start = adapter.indexOf("export function hydratingFinancialsEvidence");
        expect(start, "the hydrating frame exists").toBeGreaterThan(-1);
        const body = adapter.slice(start);
        expect(body, "no money literal in a frame that has read nothing").not.toMatch(/\$\d/);
        expect(body, "and no zero standing in for an unread figure").not.toMatch(/: 0[,\s]/);
        expect(body).toContain("—");
    });

    it("keeps the loading ledger's columns rather than claiming the family has none", () => {
        const detail = code("components/operationalCards/FinancialsDetailCard.tsx");
        /* "Nothing charged yet" must not be reachable while the account is still being read. */
        expect(detail).toMatch(/hydrating \?[\s\S]{0,400}data-financials-ledger-hydrating/);
        /* The same head component as the hydrated ledger, so the grid does not shift underneath. */
        const hydratingBlock = detail.slice(detail.indexOf("data-financials-ledger-hydrating"));
        expect(hydratingBlock.slice(0, 400)).toContain("<FinancialsLedgerHead />");
    });
});

describe("F26 · the row carries its own actions", () => {
    /*
     * The detail surface used to end in a footer of links — Reverse credit → Reverse credit → …
     * → Add adjustment — one entry per transaction, stacked under a ledger that already had a row
     * for each. An operator had to match a link to a row by reading both.
     */
    it("offers Reverse and Adjust on the transaction itself", () => {
        const detail = code("components/operationalCards/FinancialsDetailCard.tsx");
        expect(detail, "a posted charge can be unwound from its row").toContain('data-charge-command="charge.reverse"');
        expect(detail, "and adjusted from the same row").toContain('data-charge-command="billing.adjust_account"');
    });

    it("has no footer link farm left to fall back to", () => {
        const detail = code("components/operationalCards/FinancialsDetailCard.tsx");
        expect(detail, "the stacked payment/adjustment link farm is gone").not.toContain("alloy-os-fdetail__paymentops");
    });

    it("does not hide a row action behind hover alone", () => {
        /*
         * Accessibility is not a hover state. Every row action is a real button with a title and an
         * accessible name, and the CSS may reveal it on hover but must not be the only way to it —
         * so the lock is that the actions are focusable buttons in the markup, which keyboard
         * traversal reaches whatever the pointer does.
         */
        const ledger = code("components/operationalCards/FinancialsLedger.tsx");
        expect(ledger).toMatch(/<button[\s\S]{0,300}data-financials-row-action/);
        expect(ledger).toMatch(/aria-label=\{title\}/);
    });

    it("keeps Reverse and Adjust distinct", () => {
        const detail = read("components/operationalCards/FinancialsDetailCard.tsx");
        /*
         * Read WITH comments on purpose: the two verbs mean different things to a business and the
         * distinction has to survive in the titles an operator actually reads.
         */
        expect(detail).toMatch(/title="Unwind this charge[^"]*"/);
        expect(detail).toMatch(/title="Adjust this charge[^"]*"/);
    });
});

describe("F27 · manual entry honours the configured review boundary", () => {
    /*
     * ── WHAT WAS THROWN AWAY ──────────────────────────────────────────────────────────────────
     *
     * `resolveChargeFromTemplate` has always computed whether a charge needs review — the
     * `posting_review` Financial Policy OR'd with the template's own `review_required` — and
     * `writeTemplateDraftCharge` discarded it. So manual Add imposed the same ceremony on every
     * organization, including the ones that had configured no review boundary at all. Nothing new
     * was invented to fix it: the decision the tenant had already made is now carried to the caller.
     */
    it("carries the resolver's answer out of the draft writer", () => {
        const service = code("lib/financials/chargeLifecycle/chargeLifecycleService.ts");
        expect(service).toMatch(/reviewRequired: boolean/);
        expect(service, "sourced from the resolver, never recomputed").toMatch(/reviewRequired: intent\.reviewRequired/);
    });

    it("posts through the canonical writer when no boundary is configured", () => {
        const actions = code("lib/adminV2/actions/definitions/financialChargeActions.ts");
        expect(actions).toMatch(/!written\.reviewRequired/);
        expect(actions, "the one posting authority, not a second one").toContain("postChildcareCharge");
        /* And it reports what it did, so the surface never has to guess. */
        expect(actions).toMatch(/review_required/);
        expect(actions).toMatch(/posted/);
    });

    it("writes no second charge path of its own", () => {
        const actions = code("lib/adminV2/actions/definitions/financialChargeActions.ts");
        expect(actions, "still exactly one draft writer").toContain("writeTemplateDraftCharge");
        expect(actions, "and no direct insert beside it").not.toMatch(/from\("financial_charges"\)[\s\S]{0,80}\.insert/);
    });
});

describe("F28 · one entry command, and a footer that ranks its commands", () => {
    it("offers Payment, then Add, then Details as navigation", () => {
        const compact = code("components/operationalCards/FinancialsCard.tsx");
        expect(compact).toMatch(/data-financials-command="payment"/);
        expect(compact).toMatch(/data-financials-command="add"/);
        /* `Add charge` was the old label; the command now carries the mode, so the label is `Add`. */
        expect(compact, "no surface still says Add charge").not.toMatch(/>Add charge</);
    });

    it("puts charge and adjustment in one shell rather than two places", () => {
        const panel = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(panel).toMatch(/data-financials-entry-mode-tab/);
        expect(panel).toMatch(/role="tablist"/);
        /* One writer each, still: the mode chooses the body, not a new action. */
        expect(panel).toContain("billing.adjust_account");
    });

    it("binds the source transaction when Adjust is raised from a row", () => {
        const panel = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(panel).toMatch(/openAdjustForCharge/);
        expect(panel, "the row's charge becomes the adjustment's source").toMatch(
            /setAdjustSourceChargeId\(args\.chargeId\)/,
        );
        expect(panel, "and the unified command opens in Adjustment mode").toMatch(
            /setEntryMode\("adjustment"\)[\s\S]{0,80}setOverlay\("add_charge"\)/,
        );
    });
});

describe("F29 · a filter that shrinks still reads", () => {
    /*
     * The select primitive's base rule is `width: 100%; min-width: 0`, which is right in a form
     * column and collapses in a shrink-to-fit rail: the value ellipsises to nothing and the operator
     * is left with a chevron, or a clipped one. The workspace header rail was repaired for exactly
     * this; the lens rail needed the same content floor.
     */
    it("gives the lens rail's selects a content floor and a ceiling", () => {
        const css = read("app/adminV2/components/operationalCardsShared.css");
        const rule = css.slice(css.indexOf(".alloy-os-fdetail__lensfilters .alloy-select"));
        expect(rule.slice(0, 200), "the rail's selects size to their content").toMatch(/width:\s*auto/);
        expect(rule.slice(0, 200), "with a floor wide enough for the ordinary labels").toMatch(/min-width:\s*[\d.]+rem/);
        expect(rule.slice(0, 200), "and a ceiling so one label cannot eat the bar").toMatch(/max-width:\s*[\d.]+rem/);
    });

    it("keeps one owner for the property", () => {
        const css = read("app/adminV2/components/operationalCardsShared.css");
        const shrink = css.slice(css.indexOf(".alloy-os-fdetail__lensfilters > *"));
        expect(shrink.slice(0, 120), "the shrink rule no longer sets a width floor too").not.toMatch(/min-width/);
    });
});

describe("F30 · the account pane commits one geometry", () => {
    /*
     * ── THE DEFECT, MEASURED ON THE SURFACE IT WAS REPORTED ON ────────────────────────────────
     *
     * Financials → Accounts → selected account committed at 1066x120 and SHRANK to 1066x93 1.4
     * seconds later, when the read landed. One card, one tree, one account, the same anatomy in
     * both frames — so not a second representation, and not the data arriving either: 120px is
     * `FOCUS_PANEL_RESERVED_MIN_HEIGHT` to the pixel.
     *
     * That floor was introduced for the Focus Panel's subject switch, where the card genuinely
     * collapsed 409 → 69 → 409 because its loading state is a one-line loader. The account
     * variant's loading state is `AccountSummaryPending`, which is the same three metrics over the
     * same two commands as the resolved summary — already the right shape, already the right
     * height. A floor under it could only ever be the wrong height.
     *
     * After: both frames 1066x93. Structural delta 0.
     */
    it("reserves a footprint only where the card can still collapse", () => {
        const card = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card, "the reserve is a decision, not an unconditional style").toMatch(
            /reservesFootprint\s*=\s*reservingAccount && summaryVariant !== "account"/,
        );
        /* And the style follows that decision rather than the broader condition. */
        expect(card).toMatch(/style=\{\s*reservesFootprint/);
        expect(card, "the marker reports the same decision the style made").toMatch(
            /data-financials-reserved=\{reservesFootprint \? "true" : undefined\}/,
        );
    });

    it("still commits the anatomy while the account resolves", () => {
        /*
         * Removing the floor must not become removing the frame. The account variant's pending
         * state is the committed anatomy; that is WHY it needs no floor, so the two facts are
         * locked together.
         */
        const card = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(card).toMatch(/summaryVariant === "account" \?[\s\S]{0,40}<AccountSummaryPending \/>/);
    });
});

describe("F31 · one command identity, whichever primitive renders it", () => {
    /*
     * The period-variant footer carried no `data-financials-command` while the account variant's
     * identical commands did. The commands were never different — same handler props, same host.
     * `FooterAction` simply accepted `children` and `onClick` and dropped everything else, so a
     * command rendered through it could not say which command it was. That is the defect `Action`
     * already carries a comment about, from the Process card.
     */
    it("lets the footer primitive carry a command's identity", () => {
        const kit = code("components/cardLab/CardLabKit.tsx");
        expect(kit, "FooterAction forwards what a caller legitimately puts on a button").toMatch(
            /FooterAction\(\s*\{ children, \.\.\.rest \}/,
        );
        expect(kit, "and still owns the visual contract").toMatch(
            /className="alloy-os-ucard__action alloy-os-ucard__action--system5"/,
        );
    });

    it("names Payment and Add the same way in every variant", () => {
        const compact = code("components/operationalCards/FinancialsCard.tsx");
        const payment = compact.match(/data-financials-command="payment"/g) ?? [];
        const add = compact.match(/data-financials-command="add"/g) ?? [];
        /* Period footer, account summary, the pending frame, and the compact footer. */
        expect(payment.length, "every Payment entry is named").toBeGreaterThanOrEqual(3);
        expect(add.length, "every Add entry is named").toBeGreaterThanOrEqual(3);
    });

    it("keeps Details a navigation, not a command", () => {
        /*
         * Details goes somewhere; Payment and Add do something. The footer was composed to make
         * exactly that distinction, so the marker keeps it rather than flattening all three into
         * one vocabulary for the convenience of a selector.
         */
        const compact = code("components/operationalCards/FinancialsCard.tsx");
        expect(compact).toMatch(/data-financials-nav="details"/);
        expect(compact, "Details is never stamped as a command").not.toMatch(
            /data-financials-command="details"/,
        );
    });
});

describe("F32 · the Details shell's height is not a function of its rows", () => {
    /*
     * ── WHAT WAS MEASURED, AND WHAT IT MEANT ──────────────────────────────────────────────────
     *
     * First committed Details frame vs fully hydrated, 42 rows → 95 rows:
     *
     *   gridArea      426 → 426   delta 0      the shell the operator sees
     *   intrinsic     426 → 426   delta 0
     *   detailScroll  556 → 552   delta -4     bounded; content 1474 → 4979 inside it
     *   ledgerBand     45 → 3447               grows INSIDE the scroller, as designed
     *   overlayRoot    52 →   84               a wrapper whose first child measures 0px
     *
     * So the committed shell does not grow, and the ledger body owns its own overflow. The lock is
     * on the property that made that true: the scroll region is the single bounded owner, and no
     * height anywhere is derived from how many rows came back in the first cohort.
     */
    it("gives the ledger body one bounded scroll owner", () => {
        const css = read("app/adminV2/components/operationalCardsShared.css");
        const rule = css.slice(css.indexOf(".alloy-os-fdetail__scroll"));
        expect(rule.slice(0, 300), "the record scrolls").toMatch(/overflow-y:\s*auto/);
    });

    it("sizes no surface from a row count", () => {
        for (const path of [
            "components/operationalCards/FinancialsDetailCard.tsx",
            "components/admin/focusPanel/cards/FinancialsCard.tsx",
        ]) {
            const src = code(path);
            /*
             * A height computed from `rows.length` is exactly the defect §3 names: commit to the
             * first cohort's size, then enlarge when the rest arrives.
             */
            expect(src, `${path} derives no height from the rows`).not.toMatch(
                /(height|minHeight|maxHeight)[^;\n]{0,40}rows\.length/,
            );
        }
    });
});

describe("F33 · exactly one element is the card", () => {
    /*
     * Mounted instrumentation counted TWO `[data-financials-card]` elements for one card on screen:
     * the placement shell and, nested directly inside it, the approved card's own body — same box,
     * same height, both claiming to be the thing. Every selector that asked for "the card" got an
     * ambiguous answer, including this suite's own probes.
     *
     * Stated as an instrumentation and DOM-identity defect, which is what it is. It is NOT the
     * user-visible loading defect: that was a reserved geometry floor, measured separately, and
     * nothing here changes what the operator sees.
     */
    it("keeps the marker on the placement shell and nowhere beneath it", () => {
        const approved = code("components/operationalCards/FinancialsCard.tsx");
        expect(approved, "the body is a body, not a second card").toContain('data-financials-card-body="true"');
        expect(approved, "and no element in the approved card claims to be a card root").not.toMatch(
            /data-financials-card="true"/,
        );
    });

    it("leaves the root's identity attributes with the root", () => {
        /*
         * The root is the element that can answer WHICH account, WHICH subject filter and WHICH
         * overlay — so those attributes and the marker belong to the same element.
         */
        const panel = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        expect(panel).toMatch(/data-financials-card="true"/);
        expect(panel).toMatch(/data-financials-account=/);
        expect(panel).toMatch(/data-financials-subject=/);
    });
});

describe("F34 · a command control is hosted by the platform card", () => {
    /*
     * ── THE THIRD TIME THIS SURFACE LEARNED IT ────────────────────────────────────────────────
     *
     * An elevated Focus Panel cell makes every direct child inert —
     * `…[data-fp-elevated="true"] > * { pointer-events: none }` — and grants `pointer-events: auto`
     * to `.alloy-os-ucard` alone. Add charge hit this first, Payment hit it second, and Pass 5H's
     * Charge/Adjustment control hit it third: rendered as a bare div beside the command card it
     * measured
     *
     *   {reachable: false, topmost: "BUTTON.alloy-os-fp-depth-scrim", pointerEvents: "none"}
     *
     * — visible, keyboard-focusable, and unclickable. After hosting it inside the card:
     *
     *   {reachable: true, topmost: "BUTTON.", pointerEvents: "auto"}
     *
     * The lock is that neither mode renders its controls outside a platform card.
     */
    it("puts the mode control inside the command's own card", () => {
        const panel = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        /* Charge mode: the control is handed to the command card as a slot, not rendered beside it. */
        expect(panel).toMatch(/modeSlot=\{entryModes\}/);
        /* Adjustment mode: hosted by the platform card, exactly as Payment is. */
        expect(panel).toMatch(/data-universal-card-key="add_adjustment"/);
        const adjustmentHost = panel.slice(panel.indexOf('data-universal-card-key="add_adjustment"'));
        expect(adjustmentHost.slice(0, 400), "the mode control and the band share that host").toContain(
            "{entryModes}",
        );
    });

    it("declares the mode control once", () => {
        const panel = code("components/admin/focusPanel/cards/FinancialsCard.tsx");
        const declarations = panel.match(/className="alloy-os-financials__entrymodes"/g) ?? [];
        expect(declarations.length, "one control, rendered by whichever host is on screen").toBe(1);
    });

    it("keeps the command card as the interactive host it was built to be", () => {
        const command = code("components/operationalCards/AddChargeCommand.tsx");
        /* The slot renders INSIDE the UniversalCard, never before it. */
        const cardStart = command.indexOf("<UniversalCard");
        expect(command.indexOf("{modeSlot}"), "the slot is inside the card").toBeGreaterThan(cardStart);
    });
});
