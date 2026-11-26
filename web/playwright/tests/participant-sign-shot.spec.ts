import { test } from "@playwright/test";
const TOKEN = process.env.PARTICIPANT_TOKEN ?? "";
test.use({ storageState: { cookies: [], origins: [] } });
test("signature preview on the document", async ({ page }) => {
    test.setTimeout(180_000);
    test.skip(!TOKEN, "no token");
    await page.goto(`/forms/embed/${TOKEN}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const enter = page.getByRole("button", { name: /review paperwork/i });
    if (await enter.count()) { await enter.first().click(); await page.waitForTimeout(9000); }
    const proceed = page.getByRole("button", { name: /everything looks good/i }).first();
    if (await proceed.count()) { await proceed.click(); await page.waitForTimeout(9000); }
    // Signature phase: the canvas shows the artifact with the captured mark overlaid.
    const canvas = page.locator("[data-participant-document] canvas").first();
    await canvas.screenshot({ path: "playwright-report/signed-page.png" });
    console.log("=== captured page screenshot ===");
});
