/**
 * §3 / §20 — THE ADJUSTMENT STACKING DEFECT, MEASURED RATHER THAN DESCRIBED.
 *
 * The Director's report: Add → Charge presents correctly; Add → Adjustment leaves the underlying
 * Financials card visibly protruding behind the Adjustment card. Previously narrowed to
 * content/overflow within the same shared lifted element, not a second overlay.
 *
 * This spec measures BOTH commands in the SAME session at three viewports and prints the geometry
 * and the computed properties that decide it. It asserts nothing about the defect: run against the
 * deployed build it records the defect, and run against the repaired build it records its absence.
 * A spec that asserted the defect would have to be inverted to prove the fix, and then neither run
 * would be comparable to the other.
 *
 * WHAT MAKES THE DIAGNOSIS FALSIFIABLE: the band's own `max-height` / `overflow-y` and its
 * `scrollHeight > clientHeight`. If the band is its own scroll container inside a host that is
 * already one, that is a nested scroll trap and the card is sized to the band rather than to its
 * content — which is the mechanism, not an opinion about it.
 */
import { expect, test } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.setTimeout(600_000);

const log = (s: string) => console.log(s); // eslint-disable-line no-console

const VIEWPORTS = [
    { name: "phone", width: 390, height: 844 },
    { name: "tablet", width: 834, height: 1112 },
    { name: "desktop", width: 1680, height: 1050 },
];

type Box = {
    x: number; y: number; w: number; h: number; bottom: number; right: number;
    zIndex: string; position: string; maxHeight: string; overflowY: string;
    border: string; radius: string; background: string;
    scrollH: number; clientH: number; selfScrolls: boolean;
} | null;

/**
 * What the probe answers.
 *
 * Declared because `page.evaluate` of a STRING expression returns `{}` to TypeScript — it has no
 * function body to infer from — so every field read off it is an error. The probe stays a string
 * (one evaluate, nothing shifting between reads) and the shape is stated here instead.
 */
type Probe = {
    url: string;
    overlay: string | null;
    commandCard: Box;
    commandBody: Box;
    adjustmentBand: Box;
    addChargeBody: Box;
    floor: Box;
    scrollersInsideCommand: number | null;
    liftedAboveCommand: Array<{ cls: string; z: string }> | null;
};

/** Geometry and the properties that decide it — read in one evaluate so nothing can shift between. */
const PROBE = `(() => {
    const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
            x: Math.round(r.x), y: Math.round(r.y),
            w: Math.round(r.width), h: Math.round(r.height),
            bottom: Math.round(r.bottom), right: Math.round(r.right),
            zIndex: cs.zIndex, position: cs.position,
            maxHeight: cs.maxHeight, overflowY: cs.overflowY,
            border: cs.borderTopWidth, radius: cs.borderTopLeftRadius,
            background: cs.backgroundColor,
            scrollH: el.scrollHeight, clientH: el.clientHeight,
            selfScrolls: el.scrollHeight > el.clientHeight + 1,
        };
    };
    const q = (sel) => document.querySelector(sel);
    const card = q('.alloy-os-ucard[data-universal-card-modal="command"]');
    const body = card ? card.querySelector('.alloy-os-ucard__body') : null;
    const band = q('[data-testid="adjustment-panel"]');
    const addcharge = q('.alloy-os-addcharge');
    const floor = q('[data-financials-surface-role="floor"]');
    return {
        url: location.pathname,
        overlay: (q('[data-financials-overlay]') || {}).dataset ? q('[data-financials-overlay]').dataset.financialsOverlay : null,
        commandCard: box(card),
        commandBody: box(body),
        adjustmentBand: box(band),
        addChargeBody: box(addcharge),
        floor: box(floor),
        /*
         * HOW MANY SCROLL CONTAINERS SIT INSIDE THE COMMAND. One is the host's and is correct.
         * Two is the nested trap §20 forbids.
         */
        scrollersInsideCommand: card
            ? Array.from(card.querySelectorAll('*')).filter((el) => {
                  const cs = getComputedStyle(el);
                  return (cs.overflowY === 'auto' || cs.overflowY === 'scroll')
                      && el.scrollHeight > el.clientHeight + 1;
              }).length
            : null,
        /* Is anything painting ABOVE the command card's own layer? */
        liftedAboveCommand: card
            ? Array.from(card.querySelectorAll('*')).filter((el) => {
                  const z = parseInt(getComputedStyle(el).zIndex, 10);
                  return Number.isFinite(z) && z > 60;
              }).map((el) => ({ cls: el.className, z: getComputedStyle(el).zIndex })).slice(0, 6)
            : null,
    };
})()`;

async function openFinancialsDetails(page: import("@playwright/test").Page) {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    const details = page
        .locator("[data-financials-card='true']")
        .getByRole("button", { name: /^Details/ })
        .first();
    await expect(details).toHaveCount(1);
    await details.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);
}

for (const vp of VIEWPORTS) {
    test(`stacking geometry — ${vp.name} ${vp.width}x${vp.height}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await openFinancialsDetails(page);

        /* ── ADD → CHARGE: the one that presents correctly, as the control ───────────────────── */
        const add = page.getByRole("button", { name: /^Add$/ }).first();
        await expect(add).toHaveCount(1);
        await add.click({ timeout: 20_000 });
        await page.waitForTimeout(6_000);
        const charge = (await page.evaluate(PROBE)) as Probe;
        log(`\n[${vp.name}] ADD → CHARGE\n${JSON.stringify(charge, null, 1)}`);

        /* ── ADD → ADJUSTMENT: the reported defect, same session, same card ──────────────────── */
        const adjustTab = page.locator('[data-financials-entry-mode-tab="adjustment"]').first();
        if ((await adjustTab.count()) > 0) {
            await adjustTab.click({ timeout: 20_000 });
            await page.waitForTimeout(6_000);
            const adjustment = (await page.evaluate(PROBE)) as Probe;
            log(`\n[${vp.name}] ADD → ADJUSTMENT\n${JSON.stringify(adjustment, null, 1)}`);

            /*
             * THE COMPARISON THAT MATTERS, stated rather than asserted: the two commands share one
             * host, so a difference in the host card's height between them can only come from what
             * each put inside it.
             */
            log(
                `\n[${vp.name}] DELTA  chargeCardH=${charge?.commandCard?.h ?? "—"}`
                + `  adjustCardH=${adjustment?.commandCard?.h ?? "—"}`
                + `  bandSelfScrolls=${adjustment?.adjustmentBand?.selfScrolls ?? "—"}`
                + `  bandMaxH=${adjustment?.adjustmentBand?.maxHeight ?? "—"}`
                + `  bandZ=${adjustment?.adjustmentBand?.zIndex ?? "—"}`
                + `  scrollersInCommand=${adjustment?.scrollersInsideCommand ?? "—"}`,
            );
        } else {
            log(`\n[${vp.name}] ADJUSTMENT TAB NOT PRESENT — recording that rather than inferring it`);
        }

        /* A screenshot per viewport, so the geometry has a picture beside it. */
        await page.screenshot({
            path: `../certification/financials/adjustment-ux/stacking-${vp.name}.png`,
            fullPage: false,
        });
    });
}
