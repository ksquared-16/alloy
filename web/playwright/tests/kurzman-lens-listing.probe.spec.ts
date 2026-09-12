/**
 * WHERE IS THE KURZMAN CASE, IF NOT ON THE WAITLIST?
 *
 * The Waitlist candidate queue reports count 0. Lead holds 3 cases and Tour 1 — together the 4
 * opportunities the census counted in this tenant. So the case is in one of those two lenses, and
 * the mounted premise "Kurzman Family, on the Waitlist" does not hold at the operator surface.
 *
 * This lists each lens with NO subject_id, because a subject_id the lens rejects replaces the queue
 * with the refusal screen and hides the very rows being counted.
 */
import { test, expect } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012" });

for (const lens of ["lifecycle-wu-lead", "lifecycle-wu-tour", "lifecycle-wu-waitlist"]) {
    test(`list ${lens}`, async ({ page }) => {
        test.setTimeout(120_000);
        await page.goto(`/workspace/work-unit/${lens}`);
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(15_000);
        const body = await page.locator("body").innerText();
        const rows = page.locator("[data-entity-id]");
        const n = await rows.count();
        /* eslint-disable no-console */
        console.log(`\n##### ${lens} : entity rows=${n} namesKurzman=${body.includes("Kurzman")}`);
        for (let i = 0; i < Math.min(n, 12); i++) {
            const r = rows.nth(i);
            console.log(`   [${i}] id=${await r.getAttribute("data-entity-id")} :: ${(await r.innerText()).replace(/\s+/g, " ").slice(0, 90)}`);
        }
        console.log("BODY:\n" + body.slice(0, 1200));
        /* eslint-enable no-console */
        expect(n).toBeGreaterThanOrEqual(0);
    });
}
