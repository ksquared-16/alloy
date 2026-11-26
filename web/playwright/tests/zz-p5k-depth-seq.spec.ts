/**
 * PASS 5K — WHEN DOES THE CELL STOP BEING ELEVATED?
 *
 * A command re-opened after a dismissal renders with no backdrop in the DOM. Two things must be
 * separated before touching anything: WHICH open loses the scrim (the second of a kind, or the
 * nth overall), and whether it is particular to the surfaces 5K introduced or is how the grid has
 * always behaved for a command that opens, closes and opens again.
 *
 * So this drives one cycle at a time and reports the depth state after every step, including the
 * grid's own attributes, for a pre-existing command (Add) as well as the new ones.
 */
import { test, type Page } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = "http://127.0.0.1:3012";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);

const depth = (p: Page, label: string) => p.evaluate((tag) => {
    const scrim = document.querySelector('[data-fp-depth-scrim="true"]') as HTMLElement | null;
    const grid = document.querySelector(".alloy-os-focus-panel-grid") as HTMLElement | null;
    const host = document.querySelector("[data-financials-overlay]");
    return `${tag} surface=${host?.getAttribute("data-financials-overlay") ?? "compact"}`
        + ` scrim=${scrim != null}`
        + ` armed=${scrim?.getAttribute("data-fp-scrim-armed") ?? "-"}`
        + ` elevatedCells=${document.querySelectorAll('[data-fp-elevated="true"]').length}`
        + ` gridDepth=${grid?.getAttribute("data-fp-depth") ?? "-"}`
        + ` closing=${grid?.getAttribute("data-fp-closing") ?? "-"}`;
}, label);

async function toDetails(page: Page) {
    await page.locator('[data-financials-nav="details"]').first().click({ timeout: 20_000 });
    await page.locator('[data-financials-overlay="detail"]').waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(3_000);
}

test("elevation across repeated open/dismiss cycles", async ({ page }) => {
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-financials-card="true"]').first().waitFor({ state: "visible", timeout: 180_000 });
    await page.waitForTimeout(9_000);

    // ── A pre-existing command, twice: is losing the backdrop new behaviour or old? ────────────
    for (const pass of [1, 2]) {
        const add = page.locator('[data-financials-command="add"]').first();
        if (!(await add.count())) { log(`ADD_${pass} NO_CONTROL`); break; }
        await add.click({ timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(2_500);
        log(await depth(page, `ADD_open_${pass}`));
        await page.keyboard.press("Escape");
        await page.waitForTimeout(2_500);
        log(await depth(page, `ADD_dismissed_${pass}`));
    }

    await toDetails(page);
    log(await depth(page, "DETAIL_open"));

    for (const pass of [1, 2, 3]) {
        const rev = page.locator('[data-financials-row-action="reverse"]').first();
        if (!(await rev.count())) { log(`REV_${pass} NO_CONTROL`); break; }
        await rev.click({ timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(2_500);
        log(await depth(page, `REV_open_${pass}`));
        const cancel = page.locator('[data-testid="charge-reverse-cancel"]').first();
        if (await cancel.count()) await cancel.click({ timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(2_500);
        log(await depth(page, `REV_dismissed_${pass}`));
    }
});
