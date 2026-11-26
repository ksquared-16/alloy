/**
 * WHAT DOES THE DRAWER KNOW ABOUT THE CHILD'S OWN LOCATION THAT COMMIT DOES NOT?
 *
 * Commit carries `location_id: null` with `_participation_source: "ocm"`, which reads as "this
 * child owns no site". Yet settlement REMOVES the "Inherited from lead" badge, i.e. concludes the
 * site is owned. Both cannot be right, and the answer decides whether the commit claim is a false
 * claim (repair the claim) or the drawer is contradicting an authoritative commit answer.
 */
import { test } from "@playwright/test";

test("capture drawer child location", async ({ page }) => {
    const hits: string[] = [];
    page.on("response", async (res) => {
        if (!/view-models\/drawer\/opportunity/.test(res.url())) return;
        try {
            const body = await res.text();
            const i = body.indexOf("_inquiry_children");
            const start = i !== -1 ? i : body.indexOf("children");
            if (start !== -1) hits.push(body.slice(start, start + 2500));
        } catch { /* body unavailable */ }
    });
    await page.goto(process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads", {
        waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(Number(process.env.P076_SETTLE_MS || 11000));

    console.log(`[drw] drawerBodies=${hits.length}`);
    hits.slice(0, 1).forEach((h, i) => console.log(`[drw-${i}] ${h.replace(/\s+/g, " ").slice(0, 1600)}`));

    // Also read what the rendered card concluded.
    const rendered = await page.evaluate(() => {
        const el = document.querySelector('article.alloy-os-ucard[data-universal-card-key="children"]');
        return el ? (el as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 220) : "no children card";
    });
    console.log(`[drw-rendered] ${rendered}`);
});
