/**
 * §5 — CAN AN OPERATOR REACH THE FOCUS PANEL'S FINANCIALS COMMANDS WHILE BOS IS PRESENT?
 *
 * Measured, at the viewport the defect was found at and at a larger desktop, before anything in the
 * shared chrome is touched. For each command: its box, whether `elementFromPoint` returns it, and
 * what is on top of it when it does not. Plus the BOS overlay's own box, the operational band vars,
 * and whether the page overflows horizontally.
 */
import { expect, test, type Page } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = "http://127.0.0.1:3012";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";

test.use({ storageState: STORAGE, baseURL: BASE });

async function report(page: Page, label: string) {
    const data = await page.evaluate(() => {
        const card = document.querySelector('[data-financials-card="true"]') as HTMLElement | null;
        const reach = (el: Element | null) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) as HTMLElement | null;
            const ok = at === el || el.contains(at as Node);
            return {
                box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
                reachable: ok,
                topmost: ok ? null : at ? `${at.tagName}.${String(at.className).slice(0, 50)}` : null,
            };
        };
        const overlay = document.querySelector('[data-adminv2-bos-rail-overlay="true"]') as HTMLElement | null;
        const or = overlay?.getBoundingClientRect();
        const cs = getComputedStyle(document.documentElement);
        const byText = (t: string) =>
            card ? [...card.querySelectorAll("button")].find((b) => (b.innerText || "").trim().startsWith(t)) ?? null : null;
        return {
            viewport: { w: window.innerWidth, h: window.innerHeight },
            bosPresentation: document.documentElement.getAttribute("data-bos-presentation"),
            bosOverlay: or
                ? { x: Math.round(or.x), y: Math.round(or.y), w: Math.round(or.width), h: Math.round(or.height) }
                : null,
            band: {
                left: cs.getPropertyValue("--operational-workspace-left").trim(),
                width: cs.getPropertyValue("--operational-workspace-width").trim(),
                right: cs.getPropertyValue("--operational-workspace-right").trim(),
            },
            card: card ? (() => { const r = card.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width) }; })() : null,
            payment: reach(byText("Payment")),
            add: reach(byText("Add")),
            details: reach(byText("Details")),
            bosComposerReachable: (() => {
                const c = document.querySelector("[data-command-surface-rail-composer]") as HTMLElement | null;
                if (!c) return null;
                const r = c.getBoundingClientRect();
                const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                return c.contains(at as Node) || at === c;
            })(),
            horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        };
    });
    // eslint-disable-next-line no-console
    console.log(`BOS_${label} ` + JSON.stringify(data, null, 1));
    return data;
}

test("Financials commands are reachable while BOS is present", async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('[data-financials-card="true"]').first()).toBeVisible({ timeout: 180_000 });
    await page.waitForTimeout(6_000);
    await report(page, "1280x720");
    await page.screenshot({ path: "/tmp/p5h-bos-1280.png" });

    /*
     * 1280x900 IS THE CONFIGURATION THE OCCLUSION WAS FIRST MEASURED AT. It has to be re-measured
     * rather than assumed from the two either side of it: the rail is 400px wide and anchored, so
     * viewport height changes what the panel's column does, not just its width.
     */
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(4_000);
    await report(page, "1280x900");
    await page.screenshot({ path: "/tmp/p5h-bos-1280x900.png" });

    await page.setViewportSize({ width: 1680, height: 1050 });
    await page.waitForTimeout(4_000);
    await report(page, "1680x1050");
    await page.screenshot({ path: "/tmp/p5h-bos-1680.png" });
});
