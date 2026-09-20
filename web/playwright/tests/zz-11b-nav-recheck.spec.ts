import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-audit";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("can an operator click into the chapters", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const R: Record<string, unknown> = {};
    await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    expect(page.url()).not.toContain("/login");

    /* Every control an operator could press, by its ACCESSIBLE NAME — not by my guess at one. */
    R.controls = await page.evaluate(() =>
        Array.from(document.querySelectorAll("button,a[href],[role='button'],[role='link'],[role='tab']"))
            .map((e) => ({ tag: e.tagName, name: (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40), disabled: (e as HTMLButtonElement).disabled ?? false }))
            .filter((c) => c.name.length > 0));
    log(`CONTROLS: ${JSON.stringify(R.controls)}`);

    /* Now actually press the one an operator hunting for discounts would press. */
    const results: Record<string, unknown> = {};
    for (const chapter of ["Policies", "Tuition", "Accounting"]) {
        await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(12_000);
        const btn = page.getByRole("button", { name: new RegExp(`^Open ${chapter}$`, "i") }).first();
        const present = (await btn.count()) > 0;
        if (!present) { results[chapter] = { affordance: null, reached: false }; continue; }
        const label = (await btn.textContent())?.replace(/\s+/g, " ").trim() ?? null;
        await btn.click({ timeout: 20_000 });
        await page.waitForTimeout(13_000);
        results[chapter] = {
            affordance: label,
            url: page.url(),
            reached: page.url().includes("chapter="),
            body: await page.evaluate(() => ({
                headings: Array.from(document.querySelectorAll("h1,h2,h3")).map((e) => e.textContent?.trim()).filter(Boolean).slice(0, 8),
                accountingPanel: Boolean(document.querySelector('[data-testid="accounting-calendar-panel"]')),
                closeControls: document.querySelectorAll('[data-testid^="accounting-period-close-"]').length,
                mentionsDiscount: /discount/i.test(document.body.innerText || ""),
                mentionsBillingFrequency: /billing frequenc/i.test(document.body.innerText || ""),
            })),
        };
        log(`${chapter}: ${JSON.stringify(results[chapter]).slice(0, 400)}`);
        await page.screenshot({ path: `${OUT}/nav-${chapter}.png`, fullPage: true });
    }
    R.chapters = results;
    writeFileSync(`${OUT}/nav-recheck.json`, JSON.stringify(R, null, 2));
});
