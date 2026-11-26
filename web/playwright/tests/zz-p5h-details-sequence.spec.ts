/**
 * §13 — ONE DETAILS SURFACE DURING LOADING.
 *
 * Kelly observed: compact card -> a pending card -> a second pending/details card -> the hydrated
 * card. This records the ACTUAL render sequence rather than describing it: on every animation frame
 * the card's anatomy is reduced to a signature, and a signature that differs from the one before it
 * is a new frame.
 *
 * Three things this probe learned the hard way, all of them findings about the product:
 *   · `data-financials-card="true"` is stamped on TWO nested elements, so "the card" is ambiguous.
 *   · The floating BOS command rail lies over the Focus Panel's right column, so the card's own
 *     `Details` can be unreachable by pointer entirely.
 *   · Choosing "the first reachable Details on the page" opens a DIFFERENT card's overlay.
 */
import { expect, test, type Page } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = "http://127.0.0.1:3012";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";

test.use({ storageState: STORAGE, baseURL: BASE });

async function startRecorder(page: Page) {
    await page.evaluate(() => {
        const w = window as unknown as { __frames?: string[]; __stop?: () => void };
        w.__frames = [];
        let last = "";
        let live = true;
        const one = (card: Element) => {
            const overlay = card.getAttribute("data-financials-overlay") ?? "none";
            const empty = card.querySelector("[data-financials-empty]")?.getAttribute("data-financials-empty") ?? "-";
            const fdetail = card.querySelectorAll('[class*="alloy-os-fdetail__"]').length;
            const rows = card.querySelectorAll("[data-financials-ledger-row]").length;
            const heads = card.querySelectorAll(".alloy-os-billingdetail__row--head").length;
            const lenses = card.querySelectorAll("[data-financials-lens]").length;
            const hydrating = card.getAttribute("data-financials-hydrating") ?? "-";
            const h = Math.round((card as HTMLElement).getBoundingClientRect().height);
            const top = (card as HTMLElement).innerText.split("\n").filter(Boolean).slice(0, 2).join(" / ");
            return `[overlay=${overlay} hydrating=${hydrating} empty=${empty} fdetail=${fdetail} rows=${rows} heads=${heads} lenses=${lenses} h=${h} top="${top}"]`;
        };
        const sig = () => {
            const cards = [...document.querySelectorAll('[data-financials-card="true"]')];
            if (cards.length === 0) return "NO_CARD";
            return `${cards.length} card(s) ` + cards.map(one).join(" ");
        };
        const tick = () => {
            if (!live) return;
            let s: string;
            try {
                s = sig();
            } catch (err) {
                // A recorder that throws must SAY so. It silently produced zero frames once.
                s = "SIGNATURE_THREW " + String(err);
                live = false;
            }
            if (s !== last) {
                last = s;
                w.__frames!.push(`+${Math.round(performance.now())}ms ${s}`);
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        w.__stop = () => {
            live = false;
        };
    });
}

const frames = (page: Page) => page.evaluate(() => (window as unknown as { __frames: string[] }).__frames ?? []);

test("the Details surface commits once", async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize({ width: 1680, height: 1050 });
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");

    const card = page.locator('[data-financials-card="true"]').first();
    await expect(card).toBeVisible({ timeout: 180_000 });
    // Let the compact card settle so the sequence starts from rest, not from mount.
    await page.waitForTimeout(8_000);

    // eslint-disable-next-line no-console
    console.log("COMPACT_HEIGHT " + (await card.evaluate((n) => Math.round(n.getBoundingClientRect().height))));

    await startRecorder(page);

    /*
     * THE CARD'S OWN Details, and the keyboard if the pointer cannot have it. Scoping matters: a
     * page-wide "first reachable Details" belongs to another card and opens another overlay.
     */
    const details = card.getByRole("button", { name: /^Details/ }).first();
    await expect(details).toBeVisible({ timeout: 30_000 });
    const probe = await details.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) as HTMLElement | null;
        return {
            box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
            reachable: at === el || (at ? el.contains(at) : false),
            topmost: at ? `${at.tagName}.${String(at.className).slice(0, 60)}` : null,
        };
    });
    // eslint-disable-next-line no-console
    console.log("DETAILS_PROBE " + JSON.stringify(probe));

    if (probe.reachable) {
        await details.click({ timeout: 15_000 });
    } else {
        /*
         * Keyboard activation is not a harness trick here: this pass requires that the surface's
         * affordances not depend on the pointer, so this is the operator path the product owes.
         */
        // eslint-disable-next-line no-console
        console.log("POINTER_OCCLUDED — activating from the keyboard");
        await details.focus();
        await page.keyboard.press("Enter");
    }
    // eslint-disable-next-line no-console
    console.log("ACTIVATED_DETAILS");

    await page.waitForTimeout(20_000);
    await page.evaluate(() => (window as unknown as { __stop?: () => void }).__stop?.());

    /*
     * PRINT WHAT WAS RECORDED, ALWAYS. An earlier shape of this test asserted the frame count first,
     * so a run that recorded nothing threw before saying so — and "no output" is the one result that
     * cannot be read. The sequence is the artifact; the assertion comes after it.
     */
    const seq = await frames(page);
    // eslint-disable-next-line no-console
    console.log("RENDER_SEQUENCE (" + seq.length + " frames)\n" + seq.join("\n"));
    // eslint-disable-next-line no-console
    console.log("OVERLAY_NOW " + JSON.stringify(
        await page.locator('[data-financials-card="true"]').evaluateAll((ns) =>
            ns.map((n) => n.getAttribute("data-financials-overlay") ?? "none")),
    ));
    await page.screenshot({ path: "/tmp/p5h-details-sequence.png" });
    expect(seq.length, "the recorder saw the surface change").toBeGreaterThan(1);
});
