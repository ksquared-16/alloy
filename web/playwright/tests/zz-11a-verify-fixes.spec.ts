/**
 * DID THE TWO FIXES ACTUALLY LAND ON THE SCREEN?
 *
 * The broad proof under-reported both: it never TICKED a child checkbox, so the per-child summary
 * correctly stayed hidden, and it read policy options from the commercial form without opening the
 * financial panel's own authoring control. Both are probe limits, and asserting around them would
 * have shipped two wrong verdicts.
 */
import { test } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-mounted";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3112", viewport: { width: 1680, height: 1050 } });
test.setTimeout(400_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("FIX 1 · financial execution policies are authorable on /organization/financials", async ({ page }) => {
    await page.goto("/settings/organization/financials?chapter=policies", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11_000);
    const section = await page.locator('[data-testid="financial-execution-policies"]').count();
    log(`${section ? "OK  " : "GAP "} the Financial execution policies section is mounted (${section})`);
    if (!section) return;

    await page.locator('[data-testid="financial-execution-policies"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/fix1-financial-policies.png`, fullPage: false });

    const sectionText = await page.locator('[data-testid="financial-execution-policies"]').innerText();
    log(`--- section text ---\n${sectionText.slice(0, 900)}`);

    // Open the panel's OWN create control and read the type vocabulary it offers.
    const addBtn = page.locator('[data-testid="financial-execution-policies"] button').filter({ hasText: /new|add|create/i }).first();
    if (await addBtn.count()) {
        await addBtn.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: `${OUT}/fix1-financial-policy-form.png` });
        const opts = await page.locator('[data-testid="financial-execution-policies"] select option').allTextContents();
        log(`OPTIONS: ${opts.join(" | ").slice(0, 700)}`);
        for (const t of ["Due date", "Proration", "Posting review", "Deposit", "Billing cadence"]) {
            log(`${opts.some((o) => o.trim().toLowerCase() === t.toLowerCase()) ? "OK  " : "GAP "} type "${t}" offered`);
        }
        for (const s of ["On the invoice date", "Days after the invoice date", "On the first day of the billing period", "Days after the billing period starts"]) {
            log(`${opts.some((o) => o.trim() === s) ? "OK  " : "... "} due strategy "${s}"`);
        }
    } else {
        log("GAP  the panel exposes no create control");
    }
});

test("FIX 2 · ticking a sibling states the per-child economics", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    const add = page.getByRole("button", { name: /^Add$/ }).first();
    if (!(await add.count())) { log("GAP  no Add control"); return; }
    await add.click();
    await page.waitForTimeout(4500);

    const boxes = page.locator("[data-addcharge-child]");
    const n = await boxes.count();
    log(`${n > 0 ? "OK  " : "GAP "} sibling checkboxes rendered (${n})`);
    if (!n) return;

    await boxes.first().check();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/fix2-multichild-selected.png` });

    const sum = page.locator("[data-addcharge-childsum]");
    const has = await sum.count();
    log(`${has ? "OK  " : "GAP "} per-child summary appears once a sibling is ticked`);
    if (has) log(`SUMMARY: ${(await sum.first().innerText()).replace(/\n/g, " ")}`);

    const checked = await page.locator("[data-addcharge-child]:checked").count();
    log(`checked siblings: ${checked}`);
});
