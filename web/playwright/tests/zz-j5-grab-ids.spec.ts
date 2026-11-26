import { test } from "@playwright/test";
test("grab subject ids", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(14_000);
    const ids: string[] = [];
    for (let i = 1; i < 4; i += 1) {
        const ok = await page.evaluate(`(() => { const r=[...document.querySelectorAll('.alloy-os-queue-row-card')]; if (r.length<=${i}) return false; r[${i}].click(); return true; })()`);
        if (!ok) break;
        await page.waitForTimeout(5000);
        const id = await page.evaluate(`document.querySelector('[data-focus-panel-body-subject]')?.getAttribute('data-focus-panel-body-subject') || null`);
        if (id && !ids.includes(id as string)) ids.push(id as string);
    }
    console.log(`[ids] ${ids.join(",")}`);
});
