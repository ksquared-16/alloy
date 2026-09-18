/**
 * PASS 5K — DOES THE REVERSE COMMAND HAVE A BACKDROP?
 *
 * Adjust dismisses on an outside click and Reverse does not, and the probe could not even find a
 * scrim to click while Reverse was open. That is either a missing elevation for one surface or a
 * timing artefact, and the difference matters: a command that destroys money must be dismissable
 * by every gesture the others are. This reports what is actually in the DOM for each.
 */
import { test, type Page } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = "http://127.0.0.1:3012";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);

const depth = (p: Page) => p.evaluate(() => {
    const scrim = document.querySelector('[data-fp-depth-scrim="true"]') as HTMLElement | null;
    const cell = document.querySelector('[data-fp-elevated="true"]') as HTMLElement | null;
    const host = document.querySelector("[data-financials-overlay]");
    const b = scrim?.getBoundingClientRect();
    return {
        surface: host?.getAttribute("data-financials-overlay") ?? "compact",
        scrimPresent: scrim != null,
        scrimArmed: scrim?.getAttribute("data-fp-scrim-armed") ?? null,
        scrimBox: b ? `${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}x${Math.round(b.height)}` : null,
        scrimPointerEvents: scrim ? getComputedStyle(scrim).pointerEvents : null,
        elevatedCell: cell?.getAttribute("data-fp-grid-area") ?? cell?.className?.toString().slice(0, 40) ?? null,
    };
});

test("scrim presence for each command surface", async ({ page }) => {
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-financials-card="true"]').first().waitFor({ state: "visible", timeout: 180_000 });
    await page.waitForTimeout(9_000);
    await page.locator('[data-financials-nav="details"]').first().click({ timeout: 20_000 });
    await page.locator('[data-financials-overlay="detail"]').waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(3_000);
    log("DEPTH_detail " + JSON.stringify(await depth(page)));

    for (const action of ["adjust", "reverse"] as const) {
        const btn = page.locator(`[data-financials-row-action="${action}"]`).first();
        if (!(await btn.count())) { log(`DEPTH_${action} NO_CONTROL`); continue; }
        await btn.click({ timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(3_000);
        log(`DEPTH_${action} ` + JSON.stringify(await depth(page)));
        const cancel = page.locator('[data-testid$="-cancel"]:visible').first();
        if (await cancel.count()) await cancel.click({ timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(2_500);
    }
});
