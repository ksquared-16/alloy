import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(120_000);
test("resolved due-date line", async ({ page }) => {
    mkdirSync("../certification/financials/11a-b1", { recursive: true });
    await page.goto("/settings/organization/financials?chapter=policies", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11_000);
    const txt = await page.evaluate(() => (document.body.innerText || ""));
    const i = txt.indexOf("Resolved (org default)");
    const panel = i >= 0 ? txt.slice(i, i + 600).replace(/\n+/g, " / ") : "(panel absent)";
    console.log(`RESOLVED PANEL: ${panel}`); // eslint-disable-line no-console
    const j = txt.indexOf("QA due date");
    console.log(`policy label present: ${j >= 0} ${j >= 0 ? txt.slice(j - 80, j + 120).replace(/\n+/g, " / ") : ""}`); // eslint-disable-line no-console
    writeFileSync("../certification/financials/11a-b1/b1-due-panel.txt", panel);
    await page.screenshot({ path: "../certification/financials/11a-b1/b1-due-panel.png" });
});
