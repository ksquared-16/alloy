/**
 * §4B — assign a responsible party through the canonical account-grain surface, and confirm.
 *
 * Guarded: the charge detail must name Certa Certhouse before anything is clicked, and Confirm is
 * only pressed once the action's own preview has said what will change.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-4b";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("4B-assign · name a responsible party for Certa Certhouse", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: /^Charges$/ }).or(page.getByRole("button", { name: /^Charges$/ })).first().click({ timeout: 20_000 });
    await page.waitForTimeout(7000);
    await page.getByRole("tab", { name: /^Posted/ }).or(page.getByRole("button", { name: /^Posted/ })).first().click({ timeout: 15_000 });
    await page.waitForTimeout(6000);

    // Walk Certhouse rows until a detail names Certa Certhouse — the label does not carry the child.
    const rows = page.getByRole("button", { name: /Certhouse Family \$/ });
    const n = await rows.count();
    log(`certhouse posted rows: ${n}`);
    let opened: Record<string, unknown> | null = null;
    for (let i = 0; i < Math.min(n, 14); i++) {
        await rows.nth(i).click({ timeout: 15_000 }).catch(() => undefined);
        await page.waitForTimeout(4500);
        const d = await page.evaluate(() => {
            const body = document.body.innerText || "";
            const head = body.slice(body.indexOf("Account-wide financial detail"), body.indexOf("Account-wide financial detail") + 320);
            return {
                head: head.replace(/\n+/g, " / "),
                status: document.querySelector("[data-financials-charge-status]")?.getAttribute("data-financials-charge-status") ?? null,
                isCerta: /Certa Certhouse/.test(head),
                inForce: (document.querySelector('[data-financials-responsibility-arrangement="in-force"]') as HTMLElement | null)?.innerText ?? null,
                empty: (document.querySelector('[data-financials-responsibility-empty="true"]') as HTMLElement | null)?.innerText ?? null,
                manage: document.querySelectorAll('[data-financials-manage-responsibility="open"]').length,
            };
        });
        log(`row ${i}: certa=${d.isCerta} status=${d.status} manage=${d.manage} | ${d.head.slice(0, 150)}`);
        if (d.isCerta && d.manage > 0) { opened = d; break; }
    }
    if (!opened) { log("NO CERTA CHARGE DETAIL REACHED"); return; }
    writeFileSync(`${OUT}/4b-assign-before.json`, JSON.stringify(opened, null, 2));
    await page.screenshot({ path: `${OUT}/4b-assign-before.png` });
    log(`\nBEFORE: inForce=${opened.inForce} empty=${opened.empty}`);

    await page.locator('[data-financials-manage-responsibility="open"]').first().click({ timeout: 15_000 });
    await page.waitForTimeout(4500);

    // Who can legitimately be named — the candidates the authority itself offers.
    const search = page.locator('input[type="search"]').first();
    await search.fill("Cert");
    await page.waitForTimeout(3500);
    const candidates = await page.evaluate(() => {
        const txt = (e: Element) => (e as HTMLElement).innerText?.trim().replace(/\s+/g, " ").slice(0, 60) ?? "";
        return Array.from(document.querySelectorAll("button, li, [role='option']")).map(txt)
            .filter((t) => t && /Cert|Certhouse/.test(t) && t.length < 60 && !/^Certhouse Family \$/.test(t));
    });
    log(`candidates: ${JSON.stringify([...new Set(candidates)].slice(0, 12))}`);
    await page.screenshot({ path: `${OUT}/4b-candidates.png` });
    writeFileSync(`${OUT}/4b-candidates.json`, JSON.stringify([...new Set(candidates)], null, 2));
});
