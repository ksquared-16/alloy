/**
 * DIAGNOSIS, NOT CERTIFICATION. Which Financials variant does the live placement render, and what
 * density produced it? Run against whatever runtime is up; the formal mounted proof comes later on
 * a fixed production candidate.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-regression";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(400_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("which Financials variant is placed", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    await page.screenshot({ path: `${OUT}/diag-lane.png` });

    const r = await page.evaluate(() => {
        const host = document.querySelector('[data-financials-card="true"]');
        const sparse = document.querySelector('[data-financials-card="compact"]');
        const rich = document.querySelector('[data-financials-card-body="true"]');
        const uc = document.querySelector('[data-universal-card-key="financials"]') as HTMLElement | null;
        const zoneHeads = Array.from(document.querySelectorAll(".alloy-os-billing__zone-head")).map((e) => (e as HTMLElement).innerText.trim());
        const lines = Array.from(document.querySelectorAll(".alloy-os-billing__line-label")).map((e) => (e as HTMLElement).innerText.trim());
        return {
            hostPresent: !!host,
            RENDERED_VARIANT: sparse ? "FinancialsCompactCard (SPARSE)" : rich ? "FinancialsCard body (RICH/approved)" : "neither",
            universalCardDensity: uc?.getAttribute("data-density") ?? uc?.dataset?.density ?? null,
            universalCardAttrs: uc ? Array.from(uc.attributes).map((a) => `${a.name}=${a.value}`).filter((s) => /density|span|grid|key/.test(s)) : [],
            zoneHeads,
            lines,
            cardText: (host as HTMLElement | null)?.innerText?.slice(0, 400) ?? null,
        };
    });
    writeFileSync(`${OUT}/diag.json`, JSON.stringify(r, null, 2));
    /* eslint-disable no-console */
    log(`host present     : ${r.hostPresent}`);
    log(`RENDERED VARIANT : ${r.RENDERED_VARIANT}`);
    log(`density attrs    : ${JSON.stringify(r.universalCardAttrs)}`);
    log(`zone heads       : ${JSON.stringify(r.zoneHeads)}`);
    log(`line labels      : ${JSON.stringify(r.lines)}`);
    log(`--- card text ---\n${r.cardText}`);
    /* eslint-enable no-console */
});
