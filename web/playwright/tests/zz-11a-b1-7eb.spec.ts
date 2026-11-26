/**
 * §7E-B — days_after_invoice, and §7E-C the no-policy fallback.
 *
 * The second policy is effective SEP 19, which is later than the first and still earlier than the
 * invoice date these charges carry (Sep 25, because Materials bills on a configured offset). It
 * therefore wins by effective_start without anything being backdated.
 */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-b1";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(290_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const posting = (p: Page) => p.evaluate(() => {
    const body = document.body.innerText || "";
    const i = body.indexOf("Account-wide financial detail");
    return body.slice(i, i + 300).replace(/\n+/g, " / ");
});

test("7E-B · days_after_invoice = 10", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const wire: Array<Record<string, unknown>> = [];
    page.on("response", async (res) => {
        if (res.request().method() === "GET" || !res.url().includes("/api/")) return;
        try { wire.push({ url: res.url().replace(/^https?:\/\/[^/]+/, ""), status: res.status(), response: await res.json() }); } catch { /* noop */ }
    });

    await page.goto("/settings/organization/financials?chapter=policies", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11_000);
    await page.getByRole("button", { name: "New policy", exact: true }).first().click();
    await page.waitForTimeout(4000);
    await page.locator('[data-testid="create-policy-type"]').selectOption({ label: "Due date" });
    await page.waitForTimeout(2500);
    const strategy = page.locator('[data-testid="policy-value-strategy"]').first();
    const opts = await strategy.locator("option").allTextContents();
    await strategy.selectOption({ index: opts.findIndex((o) => /days after the invoice date/i.test(o)) });
    await page.waitForTimeout(1500);
    await page.locator('[data-testid="policy-value-offset_days"]').fill("10");
    await page.locator('[data-testid="create-policy-label"]').fill("QA due date — 10 days after invoice");
    await page.locator('[data-testid="create-policy-effective_start"]').fill("2026-09-19");
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: /^Create policy$/ }).first().click();
    await page.waitForTimeout(9000);
    log(`POLICY WIRE: ${JSON.stringify(wire.filter((w) => String(w.url).includes("policies")).map((w) => ({ s: w.status, ok: (w.response as { ok?: boolean })?.ok, e: (w.response as { error?: unknown })?.error })))}`);
    await page.screenshot({ path: `${OUT}/b1-7eb-policy.png` });

    // A new obligation under the newer policy — Certb, so the resolution key differs from 7E-A.
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);
    await page.getByRole("button", { name: /^Add$/ }).first().click();
    await page.waitForTimeout(4500);
    const tpl = page.locator('[data-financials-overlay="add_charge"] select').first();
    const names = await tpl.locator("option").allTextContents();
    await tpl.selectOption({ index: names.findIndex((n) => /materials/i.test(n)) });
    await page.waitForTimeout(3000);
    await page.locator('[data-financials-overlay="add_charge"] select').nth(1).selectOption({ label: "Certb Certhouse" });
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: /^Add charge$/ }).first().click();
    await page.waitForTimeout(12_000);

    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: /^Charges$/ }).or(page.getByRole("button", { name: /^Charges$/ })).first().click({ timeout: 20_000 });
    await page.waitForTimeout(7000);
    await page.getByRole("tab", { name: /^Posted/ }).or(page.getByRole("button", { name: /^Posted/ })).first().click({ timeout: 15_000 });
    await page.waitForTimeout(6000);

    // Both $18 Sep 18 rows exist now; walk them and report each detail's dates.
    const rows = page.getByRole("button", { name: /Certhouse Family \$18\.00 Sep 18, 2026/ });
    const n = await rows.count();
    log(`\$18 Sep-18 rows: ${n}`);
    const seen: string[] = [];
    for (let i = 0; i < Math.min(n, 3); i++) {
        await rows.nth(i).click({ timeout: 15_000 }).catch(() => undefined);
        await page.waitForTimeout(6000);
        const head = await posting(page);
        seen.push(head);
        log(`ROW ${i}: ${head}`);
    }
    writeFileSync(`${OUT}/b1-7eb.json`, JSON.stringify(seen, null, 2));
    await page.screenshot({ path: `${OUT}/b1-7eb.png` });
});
