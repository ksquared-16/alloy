/**
 * The invariant: **platform chrome must not make underlying primary actions
 * unreachable.**
 *
 * This spec measures rather than asserts a conclusion. It records, at two real
 * desktop viewports and on two different Organization surfaces, whether the
 * floating BOS assistant geometrically covers a page's primary action controls —
 * and whether a click on them actually lands.
 *
 * It exists because the earlier evidence was imprecise: the "x 24–344" figure in
 * the first report came from an inspection tab at a narrow width, not from a
 * certification viewport. A durable blocker needs the real numbers, on the real
 * surfaces, at the real default — and the default matters most, because
 * `recommendBosPresentation` returns "floating" unconditionally, so an operator
 * with no stored preference gets this panel on every admin surface.
 */
import { expect, test } from "@playwright/test";

const COMMUNICATIONS = "/organization/communications";
const ACCESS = "/organization/access";
const PROGRAMS = "/organization/programs-locations";

type Page = import("@playwright/test").Page;

type Rect = { x: number; y: number; width: number; height: number };

async function panelRect(page: Page): Promise<(Rect & { z: string; pointerEvents: string }) | null> {
    return page.evaluate(() => {
        const el = document.querySelector('[data-adminv2-bos-rail-overlay="true"]');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") return null;
        return {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            z: cs.zIndex,
            pointerEvents: cs.pointerEvents,
        };
    });
}

/** Every primary action on the page, with whether the panel covers its centre. */
async function actionCoverage(page: Page) {
    return page.evaluate(() => {
        const panel = document.querySelector('[data-adminv2-bos-rail-overlay="true"]');
        const pr = panel?.getBoundingClientRect() ?? null;
        const buttons = Array.from(document.querySelectorAll("button, a[href]"))
            .filter((el) => {
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
            })
            .slice(0, 200);

        let covered = 0;
        const coveredLabels: string[] = [];
        for (const el of buttons) {
            const r = el.getBoundingClientRect();
            const cx = r.x + r.width / 2;
            const cy = r.y + r.height / 2;
            if (cy < 0 || cy > window.innerHeight) continue;
            // What is actually on top at this point? This is the question that
            // matters — geometry alone could be a false alarm if the panel does
            // not take pointer events.
            const top = document.elementFromPoint(cx, cy);
            const interceptedByPanel = Boolean(panel && top && panel.contains(top) && !el.contains(top));
            const inPanelRect = Boolean(pr && cx >= pr.x && cx <= pr.right && cy >= pr.y && cy <= pr.bottom);
            if (interceptedByPanel || (inPanelRect && top !== el && !el.contains(top))) {
                covered += 1;
                coveredLabels.push((el.textContent ?? "").trim().slice(0, 40) || el.tagName);
            }
        }
        return { total: buttons.length, covered, coveredLabels, viewport: { w: window.innerWidth, h: window.innerHeight } };
    });
}

for (const viewport of [
    { name: "common desktop", width: 1440, height: 900 },
    { name: "smaller desktop", width: 1280, height: 720 },
]) {
    test.describe(`BOS reachability — ${viewport.name} ${viewport.width}x${viewport.height}`, () => {
        test.use({ viewport: { width: viewport.width, height: viewport.height } });

        test("records the floating panel's default geometry", async ({ page }) => {
            await page.goto(COMMUNICATIONS);
            await expect(page.getByTestId("organization-communications-page")).toBeVisible();
            const rect = await panelRect(page);
            // Evidence, not a pass/fail: a null rect means the assistant is not
            // floating here, which is itself the answer.
            console.log(`[BOS] ${viewport.name} panel=`, JSON.stringify(rect));
            expect(true).toBe(true);
        });

        test("no primary action on Organization Communications is unreachable", async ({ page }) => {
            await page.goto(COMMUNICATIONS);
            await expect(page.getByTestId("organization-communications-page")).toBeVisible();
            const coverage = await actionCoverage(page);
            console.log(`[BOS] communications ${viewport.name} coverage=`, JSON.stringify(coverage));
            expect(
                coverage.covered,
                `platform chrome covers ${coverage.covered} action(s): ${coverage.coveredLabels.join(", ")}`,
            ).toBe(0);
        });

        test("no primary action on another Organization page is unreachable", async ({ page }) => {
            // Proves whether this is Communications-specific or shared-chrome.
            await page.goto(ACCESS);
            await page.waitForLoadState("domcontentloaded");
            const coverage = await actionCoverage(page);
            console.log(`[BOS] access ${viewport.name} coverage=`, JSON.stringify(coverage));
            expect(
                coverage.covered,
                `platform chrome covers ${coverage.covered} action(s): ${coverage.coveredLabels.join(", ")}`,
            ).toBe(0);
        });

        test("no primary action on a third Organization page is unreachable", async ({ page }) => {
            await page.goto(PROGRAMS);
            await page.waitForLoadState("domcontentloaded");
            const coverage = await actionCoverage(page);
            console.log(`[BOS] programs ${viewport.name} coverage=`, JSON.stringify(coverage));
            expect(coverage.covered, `covers: ${coverage.coveredLabels.join(", ")}`).toBe(0);
        });

        test("actions stay reachable after SCROLLING — the actual failure mode", async ({ page }) => {
            await page.goto(COMMUNICATIONS);
            await expect(page.getByTestId("organization-communications-page")).toBeVisible();
            // Scroll every scrollable region to the bottom, which is what put
            // controls under the fixed panel before the reserve existed.
            await page.evaluate(() => {
                document.querySelectorAll("*").forEach((el) => {
                    const e = el as HTMLElement;
                    if (e.scrollHeight > e.clientHeight + 40) e.scrollTop = e.scrollHeight;
                });
                window.scrollTo(0, document.body.scrollHeight);
            });
            const coverage = await actionCoverage(page);
            console.log(`[BOS] scrolled ${viewport.name} coverage=`, JSON.stringify(coverage));
            expect(coverage.covered, `covers: ${coverage.coveredLabels.join(", ")}`).toBe(0);
        });

        test("with the assistant CLOSED nothing is covered either", async ({ page }) => {
            await page.goto(COMMUNICATIONS);
            await expect(page.getByTestId("organization-communications-page")).toBeVisible();
            await page.evaluate(() => document.documentElement.setAttribute("data-bos-presentation", "closed"));
            const coverage = await actionCoverage(page);
            expect(coverage.covered).toBe(0);
        });

        test("the channel Configure controls actually receive a click", async ({ page }) => {
            await page.goto(COMMUNICATIONS);
            await expect(page.getByTestId("organization-communications-page")).toBeVisible();
            // The operator's real gesture, with the assistant exactly as it ships.
            // No dismissal here — that is the whole point of this spec.
            await page.getByTestId("communications-configure-sms").click({ timeout: 15_000 });
            await expect(page.getByTestId("communications-channel-dialog")).toBeVisible();
        });
    });
}
