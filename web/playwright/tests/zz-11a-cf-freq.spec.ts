/** §4 — the Billing Frequencies configuration surface. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-cf";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("frequencies surface", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/settings/organization/financials?chapter=tuition", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11_000);
    const tab = page.getByRole("button", { name: /Billing Frequencies/i }).or(page.getByRole("tab", { name: /Billing Frequencies/i })).first();
    log(`tab count: ${await tab.count()}`);
    if (await tab.count()) { await tab.click(); await page.waitForTimeout(7000); }
    await page.screenshot({ path: `${OUT}/cf-freq.png` });
    const shape = await page.evaluate(() => ({
        text: (document.body.innerText || "").replace(/\n+/g, " / ").slice(0, 1600),
        buttons: [...new Set(Array.from(document.querySelectorAll("button")).map((b) => (b as HTMLElement).innerText.trim()).filter(Boolean))].slice(0, 30),
        selects: Array.from(document.querySelectorAll("select")).map((s) => ({ id: s.getAttribute("data-testid") ?? s.getAttribute("name"), options: Array.from(s.options).map((o) => o.text.trim()).slice(0, 12) })),
        inputs: Array.from(document.querySelectorAll("input")).map((i) => ({ type: i.type, id: i.getAttribute("data-testid") ?? i.getAttribute("name") ?? i.getAttribute("placeholder") })).slice(0, 12),
    }));
    log(`BUTTONS: ${shape.buttons.join(" | ").slice(0, 500)}`);
    log(`SELECTS: ${JSON.stringify(shape.selects)}`);
    log(`INPUTS: ${JSON.stringify(shape.inputs)}`);
    log(`TEXT: ${shape.text.slice(0, 900)}`);
    writeFileSync(`${OUT}/cf-freq.json`, JSON.stringify(shape, null, 2));
});
