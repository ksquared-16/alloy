/** Is the floating rail anchored to the viewport or to the workspace? Four widths answer it. */
import { expect, test } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012" });

test("rail anchor across widths", async ({ page }) => {
    test.setTimeout(500_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/workspace/work-unit/enrolled-children?subject_id=b5b62172-8b27-44ff-a852-b11b8888a6cd");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('[data-financials-card="true"]').first()).toBeVisible({ timeout: 180_000 });
    await page.waitForTimeout(8_000);

    for (const [w, h] of [[1280, 900], [1440, 900], [1680, 1050], [1920, 1080]] as const) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(3_500);
        const m = await page.evaluate(() => {
            const b = (sel: string) => {
                const el = document.querySelector(sel) as HTMLElement | null;
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return { x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width) };
            };
            const card = document.querySelector('[data-financials-card="true"]') as HTMLElement | null;
            const details = card ? [...card.querySelectorAll("button")].find((x) => (x.innerText || "").trim().startsWith("Details")) : null;
            let reach: boolean | null = null;
            if (details) {
                const r = details.getBoundingClientRect();
                const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                reach = at === details || details.contains(at as Node);
            }
            return {
                vw: window.innerWidth,
                overlay: b('[data-adminv2-bos-rail-overlay="true"]'),
                content: b("[data-adminv2-workspace-ambient-root]"),
                card: card ? b('[data-financials-card="true"]') : null,
                detailsReachable: reach,
                railOffsetVar: getComputedStyle(document.documentElement).getPropertyValue("--adminv2-workspace-command-rail-offset").trim(),
            };
        });
        // eslint-disable-next-line no-console
        console.log(`ANCHOR_${w} ` + JSON.stringify(m));
    }
});
