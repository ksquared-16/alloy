/** §7E step 1 — open the financial EXECUTION policy form and read what it offers. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-b1";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(290_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("B1 · the execution policy authoring form", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/settings/organization/financials?chapter=policies", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11_000);

    const buttons = await page.evaluate(() => [...new Set(Array.from(document.querySelectorAll("button"))
        .map((b) => (b as HTMLElement).innerText.trim().replace(/\s+/g, " ")).filter(Boolean))]);
    log(`buttons: ${buttons.join(" | ").slice(0, 600)}`);

    // "New policy" (lowercase p) is the FINANCIAL EXECUTION authoring surface; "New Policy" is the
    // commercial/discount one. They live on the same chapter and are different authorities.
    const exec = page.getByRole("button", { name: "New policy", exact: true }).first();
    log(`exact 'New policy' count: ${await exec.count()}`);
    if (await exec.count()) { await exec.click(); await page.waitForTimeout(4500); }
    await page.screenshot({ path: `${OUT}/b1-execpolicy-form.png` });

    const form = await page.evaluate(() => ({
        selects: Array.from(document.querySelectorAll("select")).map((s) => ({
            testid: s.getAttribute("data-testid") ?? s.getAttribute("name"),
            value: s.value,
            options: Array.from(s.options).map((o) => o.text.trim()),
        })),
        inputs: Array.from(document.querySelectorAll("input")).map((i) => ({
            type: i.type, name: i.getAttribute("name") ?? i.getAttribute("data-testid") ?? i.getAttribute("placeholder"),
        })).slice(0, 14),
        buttons: [...new Set(Array.from(document.querySelectorAll("button")).map((b) => (b as HTMLElement).innerText.trim()).filter(Boolean))].slice(0, 30),
    }));
    writeFileSync(`${OUT}/b1-execpolicy-form.json`, JSON.stringify(form, null, 2));
    log(`SELECTS: ${JSON.stringify(form.selects, null, 1).slice(0, 1400)}`);
    log(`INPUTS: ${JSON.stringify(form.inputs)}`);
    log(`BUTTONS: ${form.buttons.join(" | ").slice(0, 400)}`);
});
