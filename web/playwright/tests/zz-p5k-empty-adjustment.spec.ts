/**
 * PASS 5K — THE EMPTY ADJUSTMENT FRAME, REPRODUCED.
 *
 * The general Add → Adjustment path does not show it, which is why it looked intermittent. The
 * reachable path is the one an operator actually takes: correct a ledger row, change your mind,
 * then reach for Add. In the pre-5K build a row Adjust raised the Add command in adjustment mode;
 * the band's own Cancel cleared `adjustOpen` but left `entryMode` saying "adjustment", so the
 * command card stayed open rendering the mode selector over nothing at all.
 */
import { test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = "http://127.0.0.1:3012";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const OUT = "../certification/financials";
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);

/** What is actually on the command surface: its mode, and whether it has a body. */
const commandBody = (p: Page) => p.evaluate(() => {
    const host = document.querySelector("[data-financials-overlay]");
    const shell = document.querySelector("[data-universal-card-key='add_adjustment'], [data-universal-card-key='add_charge'], [data-universal-card-key='adjust_charge']");
    const modes = document.querySelectorAll("[data-financials-entry-mode-tab]").length;
    const fields = shell?.querySelectorAll("input, select, textarea").length ?? 0;
    const text = ((shell as HTMLElement | null)?.innerText ?? "").replace(/\s+/g, " ").trim();
    return {
        surface: host?.getAttribute("data-financials-overlay") ?? "compact",
        mode: host?.getAttribute("data-financials-entry-mode") ?? null,
        modeTabs: modes,
        fields,
        /* A body-less destination: the selector is present and nothing else is. */
        emptyFrame: modes > 0 && fields === 0,
        text: text.slice(0, 120),
    };
});

test("row adjust, cancel, then Add", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-financials-card="true"]').first().waitFor({ state: "visible", timeout: 180_000 });
    await page.waitForTimeout(9_000);
    await page.locator('[data-financials-nav="details"]').first().click({ timeout: 20_000 });
    await page.locator('[data-financials-overlay="detail"]').waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(22_000);

    const adjust = page.locator('[data-financials-row-action="adjust"]').first();
    if (!(await adjust.count())) { log("EMPTY_ADJUSTMENT_REPRO NO_ADJUST_CONTROL"); return; }
    await adjust.click({ timeout: 20_000 }).catch(async () => { await adjust.evaluate((e) => (e as HTMLElement).click()); });
    await page.waitForTimeout(3_000);
    log("AFTER_ROW_ADJUST " + JSON.stringify(await commandBody(page)));
    await page.screenshot({ path: `${OUT}/p5k-adjust-raised.png` });

    const cancel = page.locator('[data-testid="adjustment-cancel"]').first();
    if (await cancel.count()) {
        await cancel.click({ timeout: 20_000 });
        await page.waitForTimeout(2_500);
        const state = await commandBody(page);
        log("AFTER_BAND_CANCEL " + JSON.stringify(state));
        log("EMPTY_ADJUSTMENT_FRAME_VISIBLE " + (state.emptyFrame ? "YES" : "NO"));
        await page.screenshot({ path: `${OUT}/p5k-after-band-cancel.png` });
    } else { log("AFTER_BAND_CANCEL NO_CANCEL_CONTROL"); }
});
