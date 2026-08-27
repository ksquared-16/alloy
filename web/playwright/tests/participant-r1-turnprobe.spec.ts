/** One answer, with the runtime's own reply to it printed in full. */
import { test } from "@playwright/test";

const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
const ANSWER = process.env.R1_ANSWER ?? "Alex Sigwalk";
test.use({ storageState: { cookies: [], origins: [] } });

test("what the runtime says back", async ({ page }) => {
    test.setTimeout(180_000);
    test.skip(!TOKEN, "no token");
    page.setDefaultTimeout(25_000);
    page.on("response", async (r) => {
        const path = new URL(r.url()).pathname;
        if (!/enrollment-turn/.test(path)) return;
        let b = "";
        try {
            b = (await r.text()).slice(0, 2500);
        } catch {
            /* consumed */
        }
        console.log(`=== TURN ${r.status()} ${b} ===`);
    });
    page.on("request", (r) => {
        if (/enrollment-turn/.test(new URL(r.url()).pathname)) {
            console.log(`=== SENT ${r.postData()?.slice(0, 600)} ===`);
        }
    });

    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);
    console.log("=== on screen ===\n" + (await page.evaluate(() => document.body.innerText)).slice(0, 1200));
    await page.locator("#participant-composer").fill(ANSWER);
    await page.locator('[aria-label="Send"]').first().click();
    await page.waitForTimeout(12000);
    console.log("=== after ===\n" + (await page.evaluate(() => document.body.innerText)).slice(0, 1200));
});
