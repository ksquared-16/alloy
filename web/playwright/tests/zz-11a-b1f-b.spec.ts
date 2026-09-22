/** §B1 — what the canonical pricing-acceptance surface offers for these children. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-b1";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(280_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("B1 · the tuition acceptance surface", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    const shape = await page.evaluate(() => {
        const txt = (document.body.innerText || "");
        return {
            hasTuitionCard: document.querySelectorAll("[data-tuition-option-cadence]").length,
            cadences: Array.from(document.querySelectorAll("[data-tuition-option-cadence]")).map((e) => e.getAttribute("data-tuition-option-cadence")),
            cards: [...new Set(Array.from(document.querySelectorAll("[data-universal-card-key]")).map((e) => e.getAttribute("data-universal-card-key")))],
            mentionsTuition: /Tuition/i.test(txt),
            excerpt: txt.slice(0, 500).replace(/\n+/g, " / "),
        };
    });
    log(`CARDS: ${JSON.stringify(shape.cards)}`);
    log(`tuition option cadences: ${JSON.stringify(shape.cadences)} (count ${shape.hasTuitionCard})`);
    writeFileSync(`${OUT}/b1f-b-cards.json`, JSON.stringify(shape, null, 2));

    // The assignment's own focus panel — open a child record.
    const child = page.getByRole("button", { name: /Certa Certhouse/ }).first();
    if (await child.count()) {
        await child.click();
        await page.waitForTimeout(9000);
        const after = await page.evaluate(() => ({
            cards: [...new Set(Array.from(document.querySelectorAll("[data-universal-card-key]")).map((e) => e.getAttribute("data-universal-card-key")))],
            cadences: Array.from(document.querySelectorAll("[data-tuition-option-cadence]")).map((e) => e.getAttribute("data-tuition-option-cadence")),
            accepted: Array.from(document.querySelectorAll("[data-tuition-accepted], [data-testid*='tuition']")).map((e) => (e as HTMLElement).innerText.trim().slice(0, 80)),
            txt: (document.body.innerText || "").slice(0, 900).replace(/\n+/g, " / "),
        }));
        log(`AFTER CHILD — cards: ${JSON.stringify(after.cards)}`);
        log(`AFTER CHILD — cadences: ${JSON.stringify(after.cadences)}`);
        log(`AFTER CHILD — excerpt: ${after.txt.slice(0, 600)}`);
        writeFileSync(`${OUT}/b1f-b-child.json`, JSON.stringify(after, null, 2));
        await page.screenshot({ path: `${OUT}/b1f-b-child.png` });
    } else {
        log("no Certa control on this surface");
    }
});
