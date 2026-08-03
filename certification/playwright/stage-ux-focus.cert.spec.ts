/**
 * Focused capture of the Operator Work region — the surface this sprint makes dominant.
 * Full-page screenshots are too coarse to judge control alignment and density inside one panel.
 */

import { test } from "@playwright/test";
import path from "node:path";

const PHASE = process.env.UX_AUDIT_PHASE || "after";
const OUT = path.join(__dirname, "..", "evidence", "ux-audit", PHASE || "unset");

test("operator work region", async ({ page }) => {
    test.skip(!PHASE, "UX_AUDIT_PHASE not set — capture is opt-in");

    await page.setViewportSize({ width: 1512, height: 982 });
    await page.goto("/adminV2/settings/organization/processes");
    await page.waitForLoadState("domcontentloaded");
    const bosClose = page.getByRole("button", { name: "Close", exact: true });
    if (await bosClose.count()) await bosClose.first().click().catch(() => {});
    await page.getByTestId("business-process-tab-stages").click();
    await page.getByTestId("lifecycle-stage-tab-lead").waitFor({ state: "visible", timeout: 60_000 });
    await page.getByTestId("lifecycle-stage-tab-lead").click();
    await page.getByTestId("stage-editor-v2").waitFor({ state: "visible", timeout: 60_000 });
    await page.waitForTimeout(1500);

    const experience = page.locator("#stage-section-experience");
    const header = experience.locator("> button").first();
    if ((await header.getAttribute("aria-expanded")) === "false") await header.click();
    await page.waitForTimeout(1200);

    await experience.screenshot({ path: path.join(OUT, "lead-04-operator-work.png") });

    const planText = await page
        .getByTestId("lifecycle-stage-operating-plan-editor")
        .innerText()
        .catch(() => "(not found)");
    console.log("\n──── OPERATOR WORK, as rendered ────\n" + planText + "\n────────────────────────────────────\n");
});
