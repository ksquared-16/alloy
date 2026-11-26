/** §3E — does the operator surface offer HOUSEHOLD for a CHILD-only charge type? */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-batchA";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("S3E · grain offered per charge type", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);
    await page.getByRole("button", { name: /^Add$/ }).first().click();
    await page.waitForTimeout(4500);

    const tpl = page.locator('[data-financials-overlay="add_charge"] select').first();
    const names = await tpl.locator("option").allTextContents();
    const out: Record<string, unknown> = {};
    for (let i = 0; i < names.length; i++) {
        await tpl.selectOption({ index: i });
        await page.waitForTimeout(2200);
        const s = await page.evaluate(() => {
            const scope = document.querySelector('[data-financials-overlay="add_charge"]') as HTMLElement | null;
            const sels = Array.from(scope?.querySelectorAll("select") ?? []);
            const grain = sels[1];
            return {
                grainOptions: grain ? Array.from(grain.options).map((o) => o.text.trim()) : [],
                grainValue: grain?.value ?? null,
                semantics: /5 configured types\s*\n([^\n]+)/.exec(scope?.innerText ?? "")?.[1] ?? null,
                confirmDisabled: (Array.from(scope?.querySelectorAll("button") ?? [])
                    .find((b) => /^Add charge$/.test((b as HTMLElement).innerText.trim())) as HTMLButtonElement | undefined)?.disabled ?? null,
            };
        });
        out[names[i]] = s;
        log(`${names[i].padEnd(18)} grain=${JSON.stringify(s.grainOptions)} semantics="${s.semantics}"`);
    }

    // The decisive case: tuition is CHILD-only. Select it, then try to say Household.
    const ti = names.findIndex((n) => /tuition/i.test(n));
    if (ti >= 0) {
        await tpl.selectOption({ index: ti });
        await page.waitForTimeout(2500);
        const grain = page.locator('[data-financials-overlay="add_charge"] select').nth(1);
        const can = (await grain.locator("option").allTextContents()).some((o) => /household/i.test(o));
        log(`TUITION offers Household in APPLIES TO: ${can}`);
        if (can) {
            await grain.selectOption({ label: "Household" });
            await page.waitForTimeout(3000);
            const after = await page.evaluate(() => {
                const scope = document.querySelector('[data-financials-overlay="add_charge"]') as HTMLElement | null;
                const btn = Array.from(scope?.querySelectorAll("button") ?? [])
                    .find((b) => /^Add charge$/.test((b as HTMLElement).innerText.trim())) as HTMLButtonElement | undefined;
                return {
                    grainValue: (scope?.querySelectorAll("select")[1] as HTMLSelectElement | undefined)?.value ?? null,
                    confirmDisabled: btn?.disabled ?? null,
                    refusal: /cannot|not permitted|refus|invalid|only.*child/i.test(scope?.innerText ?? ""),
                    text: (scope?.innerText ?? "").slice(0, 900),
                };
            });
            out.TUITION_AS_HOUSEHOLD = after;
            log(`TUITION as HOUSEHOLD → value=${after.grainValue} confirmDisabled=${after.confirmDisabled} refusalShown=${after.refusal}`);
            log(`text:\n${after.text}`);
            await page.screenshot({ path: `${OUT}/s3e-tuition-household.png` });
        }
    }
    writeFileSync(`${OUT}/s3e-grain-matrix.json`, JSON.stringify(out, null, 2));
});
