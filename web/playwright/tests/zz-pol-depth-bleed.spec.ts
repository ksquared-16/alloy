/**
 * FINAL POLISH — WHAT IS PAINTING THROUGH THE FOCUSED DETAILS LAYER?
 *
 * Underlying Work content (a PAYMENT heading, an amount, a "Record payment" action) stays visually
 * prominent in the upper-left while Financials Details is the active depth. The fix must be in the
 * depth COMPOSITION, not a selector that hides that particular section, so the first job is to find
 * out what actually lets it through: is it outside the scrim's box, above it in the stacking order,
 * or in a stacking context the scrim cannot cover?
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

const bleed = (p: Page) => p.evaluate(() => {
    const scrim = document.querySelector('[data-fp-depth-scrim="true"]') as HTMLElement | null;
    const sb = scrim?.getBoundingClientRect();

    /*
     * POINTS, NOT A TEXT SEARCH. The screenshot shows exactly where the bleed is — a PAYMENT
     * heading, an amount and a Record-payment control just left of the Details card and inside the
     * scrim's box — so this asks what is painted at those points and walks up the ancestry until it
     * finds whatever out-ranks the scrim. A text scan missed them; the compositor cannot.
     */
    const stackOf = (el: Element | null) => {
        const chain: string[] = [];
        let n: Element | null = el;
        for (let i = 0; n && i < 9; i += 1) {
            const cs = getComputedStyle(n as HTMLElement);
            const cls = (n as HTMLElement).className?.toString().slice(0, 44) || (n as HTMLElement).tagName;
            chain.push(`${cls} z=${cs.zIndex} pos=${cs.position} op=${cs.opacity}${cs.transform !== "none" ? " tf" : ""}${cs.filter !== "none" ? " flt" : ""}${cs.isolation !== "auto" ? " iso" : ""}`);
            n = n.parentElement;
        }
        return chain;
    };

    const probes = [[515, 302], [515, 330], [527, 366], [1150, 1029]] as Array<[number, number]>;
    return {
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        scrimBox: sb ? `${Math.round(sb.x)},${Math.round(sb.y)} ${Math.round(sb.width)}x${Math.round(sb.height)}` : null,
        scrimZ: scrim ? getComputedStyle(scrim).zIndex : null,
        points: probes.map(([x, y]) => {
            const hit = document.elementFromPoint(x, y);
            return {
                at: `${x},${y}`,
                text: ((hit as HTMLElement | null)?.innerText ?? "").trim().replace(/\s+/g, " ").slice(0, 26),
                coveredByScrim: hit === scrim,
                stack: stackOf(hit),
            };
        }),
    };
});

test("what bleeds through the focused Details layer", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-financials-card="true"]').first().waitFor({ state: "visible", timeout: 180_000 });
    await page.waitForTimeout(9_000);
    await page.locator('[data-financials-nav="details"]').first().click({ timeout: 20_000 });
    await page.locator('[data-financials-overlay="detail"]').waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(4_000);
    log("BLEED " + JSON.stringify(await bleed(page), null, 1));
    await page.screenshot({ path: `${OUT}/pol-depth-bleed.png` });
    await page.screenshot({ path: `${OUT}/pol-depth-bleed-upper-left.png`, clip: { x: 0, y: 120, width: 720, height: 560 } });
});
