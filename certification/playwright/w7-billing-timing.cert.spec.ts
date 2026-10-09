/**
 * W7 BILLING CONFIGURATION CONVERGENCE — MOUNTED, ON THE LOCAL CERTIFICATION STACK.
 *
 * 1. Organization → Financials → Policies leads with "Billing & payment timing". The operator
 *    configures the W7 baseline THROUGH THE PAGE (no SQL): monthly periods, invoice 7 days before
 *    the period, due on the first day of the period, no review — then schedules a change.
 * 2. Add Charge on a real household previews the Nov 5 chain from the server: November, invoiced
 *    Oct 25, due Nov 1, draft until Nov 1. It is NOT committed: no money moves.
 *
 * Preconditions the harness owns (see the W7 certification note): a run-unique `billing_policy`
 * event-date template named by CERT_W7_TEMPLATE_LABEL, and an org with no billing-timing rules yet.
 */
import { expect, test } from "@playwright/test";

const POLICIES = "/settings/organization/financials?chapter=policies";
const TEMPLATE_LABEL = process.env.CERT_W7_TEMPLATE_LABEL || "W7 field trip";
const SHOTS = process.env.CERT_W7_SHOTS || "certification/financials/w7-config";
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test.describe.configure({ mode: "serial" });

test("Policies: the operator configures the W7 baseline through Billing & payment timing", async ({ page }) => {
    test.setTimeout(600_000);
    await page.addInitScript(() => {
        try {
            sessionStorage.setItem("alloy:v1:admV2:shell:bosPresentationState", "closed");
        } catch {
            /* private mode */
        }
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(POLICIES, { waitUntil: "domcontentloaded" });
    const panel = page.getByTestId("billing-timing");
    await expect(panel).toBeVisible({ timeout: 180_000 });
    await expect(page.getByTestId("billing-timing-org-default")).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: `${SHOTS}/policies-before.png`, fullPage: false });

    const value = (rule: string) => page.getByTestId(`billing-timing-value-org-${rule}`);
    const row = (rule: string) => page.getByTestId(`billing-timing-rule-org-${rule}`);
    log(`BEFORE ${JSON.stringify({
        calendar: await value("billing_calendar").innerText(),
        invoice: await value("invoice_timing").innerText(),
        due: await value("due_date").innerText(),
        review: await value("posting_review").innerText(),
    })}`);

    const setRule = async (rule: string, configure?: () => Promise<void>) => {
        await row(rule).getByRole("button", { name: /^(Set|Edit)$/ }).click();
        const editor = page.getByTestId(`billing-timing-editor-${rule}`);
        await expect(editor).toBeVisible({ timeout: 30_000 });
        if (configure) await configure();
        await editor.getByTestId("billing-timing-editor-save").click();
        await expect(editor).toBeHidden({ timeout: 60_000 });
    };

    /* Monthly is the editor's default cadence; 7 days before / on period start are the defaults too. */
    await setRule("billing_calendar");
    await setRule("invoice_timing", async () => {
        await page.getByTestId("billing-timing-editor-invoice-days").fill("7");
    });
    await setRule("due_date");
    await setRule("posting_review");

    await expect(value("billing_calendar")).toHaveText("Monthly · 1st → last day of each month", { timeout: 60_000 });
    await expect(value("invoice_timing")).toHaveText("7 days before the billing period begins");
    await expect(value("due_date")).toHaveText("On the first day of the billing period");
    await expect(value("posting_review")).toHaveText("No review required");
    await expect(page.getByTestId("billing-timing-no-overrides")).toBeVisible();

    /* A scheduled change reads as scheduled, beside today's rule — not as a second current rule. */
    await row("invoice_timing").getByRole("button", { name: "Schedule change" }).click();
    const editor = page.getByTestId("billing-timing-editor-invoice_timing");
    await page.getByTestId("billing-timing-editor-invoice-days").fill("3");
    await editor.locator('input[type="date"]').fill("2027-03-01");
    await editor.getByTestId("billing-timing-editor-save").click();
    await expect(page.getByTestId("billing-timing-scheduled-org-invoice_timing")).toContainText(
        "Scheduled · 3 days before the billing period begins · effective Mar 1, 2027",
        { timeout: 60_000 },
    );
    await expect(value("invoice_timing")).toHaveText("7 days before the billing period begins");

    await row("invoice_timing").getByRole("button", { name: "View history" }).click();
    await expect(page.getByTestId("billing-timing-history-invoice_timing")).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/policies-after.png`, fullPage: false });
    log(`AFTER ${(await panel.innerText()).replace(/\s+/g, " ").slice(0, 900)}`);
});

test("Add Charge previews the Nov 5 chain from the server, and nothing is committed", async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize({ width: 1680, height: 1050 });
    const executeCalls: string[] = [];
    page.on("request", (req) => {
        if (req.url().includes("/api/admin/actions/execute")) executeCalls.push(String(req.postData() ?? ""));
    });
    await page.addInitScript(() => {
        try {
            sessionStorage.setItem("alloy:v1:admV2:shell:bosPresentationState", "closed");
        } catch {
            /* private mode */
        }
    });

    await page.goto("/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded" });
    const rows = page.locator('[data-entity-type="opportunity"][data-entity-id]');
    await expect(rows.first()).toBeVisible({ timeout: 180_000 });
    /*
     * A single-location household: one that attends two locations has no single billing calendar
     * and the preview would (correctly) refuse — a different scenario from the one under test.
     */
    const subject = process.env.CERT_W7_SUBJECT || "Inquiry 2401";
    await rows.filter({ hasText: subject }).first().click();
    const card = page.locator("[data-financials-card='true']").first();
    await expect(card).toHaveCount(1, { timeout: 180_000 });
    await card.scrollIntoViewIfNeeded();
    /* The card's single "Add" affordance opens the command; Add charge is its default mode. */
    const add = card.getByRole("button", { name: /^Add( charge)?/ }).first();
    await expect(add).toBeVisible({ timeout: 120_000 });
    await add.click();
    const chargeMode = page.getByRole("button", { name: /^Add charge$/ }).first();
    if ((await chargeMode.count()) > 0 && !(await page.locator('[data-financials-overlay="add_charge"]').count())) {
        await chargeMode.click().catch(() => undefined);
    }

    const overlay = page.locator('[data-financials-overlay="add_charge"]');
    await expect(overlay).toBeVisible({ timeout: 60_000 });
    /*
     * The command previews its default template on open, and a selection made while that preview
     * is in flight is ignored (one preview at a time). Wait for the first answer before choosing.
     */
    await expect(overlay.locator("[data-addcharge-invoice-date]")).toContainText(/\d{4}/, { timeout: 120_000 });
    log(`DEFAULT_TEMPLATE_PREVIEW ${(await overlay.innerText()).replace(/\s+/g, " ").slice(0, 700)}`);
    await page.screenshot({ path: `${SHOTS}/addcharge-template-exception.png`, fullPage: false });
    await overlay.getByTestId("addcharge-template").click();
    const options = await page.getByRole("option").allInnerTexts();
    log(`TEMPLATE_OPTIONS ${JSON.stringify(options)}`);
    await page.getByRole("option", { name: TEMPLATE_LABEL, exact: true }).first().click({ timeout: 30_000 });
    await expect(overlay.getByTestId("addcharge-template")).toContainText(TEMPLATE_LABEL, { timeout: 60_000 });
    const date = overlay.getByTestId("addcharge-event-date").locator("input");
    await expect(date).toBeVisible({ timeout: 60_000 });
    await date.fill("2026-11-05");
    await date.press("Enter");

    /* The server's preview lands in the card's date fields. */
    await expect(overlay.locator("[data-addcharge-invoice-date]")).toContainText("Oct 25, 2026", { timeout: 90_000 });
    const read = async (sel: string) => ((await overlay.locator(sel).first().innerText().catch(() => "")) || "").trim();
    const fields = {
        text: (await overlay.innerText()).replace(/\s+/g, " "),
        invoice: await read("[data-addcharge-invoice-date]"),
        invoiceRule: await read("[data-addcharge-invoice-rule]"),
        due: await read("[data-addcharge-due-date]"),
        dueRule: await read("[data-addcharge-due-rule]"),
        posting: await read("[data-addcharge-posting-rule]"),
        onConfirm: await read('[data-addcharge-posting="awaits_period"]'),
    };
    log(`ADD_CHARGE ${JSON.stringify(fields)}`);
    expect(fields.text).toContain("November 2026");
    expect(fields.text).not.toContain("December 2026");
    expect(fields.invoiceRule).toBe("7 days before the billing period begins (organization default)");
    expect(fields.due).toContain("Nov 1, 2026");
    expect(fields.dueRule).toBe("On the first day of the billing period (organization default)");
    expect(fields.posting).toMatch(/^Draft until Nov 1, 2026/);
    expect(fields.onConfirm, "confirming does not post a charge whose period has not begun").toMatch(/not owed until its billing period begins on Nov 1, 2026/);
    expect(fields.text).not.toContain("Creates this charge and posts it");
    await page.screenshot({ path: `${SHOTS}/addcharge-nov5-preview.png`, fullPage: false });

    /* Preview only. A commit would carry mode "execute"; none was sent. */
    expect(executeCalls.some((b) => b.includes('"mode":"execute"'))).toBe(false);
});
