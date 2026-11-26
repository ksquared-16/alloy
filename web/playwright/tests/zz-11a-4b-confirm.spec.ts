/** §4B — name a responsible party and CONFIRM, through billing.configure_responsibility. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-4b";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("4B-confirm · assign and commit", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: /^Charges$/ }).or(page.getByRole("button", { name: /^Charges$/ })).first().click({ timeout: 20_000 });
    await page.waitForTimeout(7000);
    await page.getByRole("tab", { name: /^Posted/ }).or(page.getByRole("button", { name: /^Posted/ })).first().click({ timeout: 15_000 });
    await page.waitForTimeout(6000);
    await page.getByRole("button", { name: /Certhouse Family \$/ }).first().click({ timeout: 15_000 });
    await page.waitForTimeout(6000);

    const before = await page.evaluate(() => ({
        inForce: (document.querySelector('[data-financials-responsibility-arrangement="in-force"]') as HTMLElement | null)?.innerText ?? null,
        parties: Array.from(document.querySelectorAll("[data-financials-responsibility-party]")).map((e) => (e as HTMLElement).innerText.trim()),
        head: (document.body.innerText || "").slice(0, 60),
    }));
    log(`BEFORE inForce: ${before.inForce}`);

    await page.locator('[data-financials-manage-responsibility="open"]').first().click({ timeout: 15_000 });
    await page.waitForTimeout(5000);

    // The panel loads the people who COULD bear the account; each gets an Amount in dollars.
    const open = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("input[type='number']")).map((i) => {
            const row = (i as HTMLElement).closest("label,div,li") as HTMLElement | null;
            return { label: row?.innerText?.trim().replace(/\s+/g, " ").slice(0, 80) ?? null };
        });
        const date = document.querySelector("input[type='date']") as HTMLInputElement | null;
        return { candidates: rows, effectiveStart: date?.value ?? null };
    });
    log(`CANDIDATES: ${JSON.stringify(open.candidates)}`);
    log(`EFFECTIVE START (default): ${open.effectiveStart}`);
    writeFileSync(`${OUT}/4b-confirm-candidates.json`, JSON.stringify({ before, open }, null, 2));
    await page.screenshot({ path: `${OUT}/4b-confirm-form.png` });

    if (!open.candidates.length) { log("NO CANDIDATE ROWS — cannot assign"); return; }

    // $18.00 to the first candidate — the exact obligation 4B is about.
    await page.locator("input[type='number']").first().fill("18.00");
    await page.waitForTimeout(1500);

    const previewBtn = page.getByRole("button", { name: /^Preview$/ }).first();
    if (await previewBtn.count()) { await previewBtn.click({ timeout: 15_000 }); await page.waitForTimeout(6000); }
    const prev = await page.evaluate(() => (document.body.innerText || ""));
    const pi = prev.indexOf("Manage responsibility");
    log(`PREVIEW: ${pi >= 0 ? prev.slice(Math.max(0, pi - 200), pi + 700).replace(/\n+/g, " / ") : "(not found)"}`);
    await page.screenshot({ path: `${OUT}/4b-preview.png` });

    const confirm = page.getByRole("button", { name: /^Confirm$/ }).first();
    if (!(await confirm.count())) { log("NO CONFIRM CONTROL"); return; }
    await confirm.click({ timeout: 15_000 });
    await page.waitForTimeout(9000);
    await page.screenshot({ path: `${OUT}/4b-after-confirm.png` });

    const after = await page.evaluate(() => ({
        done: (document.querySelector('[data-financials-responsibility-done="true"]') as HTMLElement | null)?.innerText ?? null,
        inForce: (document.querySelector('[data-financials-responsibility-arrangement="in-force"]') as HTMLElement | null)?.innerText ?? null,
        empty: (document.querySelector('[data-financials-responsibility-empty="true"]') as HTMLElement | null)?.innerText ?? null,
        body: (document.body.innerText || "").slice(0, 40),
    }));
    log(`AFTER done=${after.done}`);
    log(`AFTER inForce=${after.inForce}`);
    writeFileSync(`${OUT}/4b-after-confirm.json`, JSON.stringify({ before, after }, null, 2));
});
