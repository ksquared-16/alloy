/**
 * 11B §8 — the final affected surfaces at 1280, 1440 and 1680.
 *
 * Captures, and two measured claims per width: the Details link keeps its own row on the compact
 * card (the arrangement Kelly approved, which this pass must not reopen), and nothing the operator
 * needs is clipped.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-final";
const WIDTHS = [1280, 1440, 1680];
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("final responsive pass", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const artifact: Record<string, unknown> = {};
    const flush = () => writeFileSync(`${OUT}/final-responsive.json`, JSON.stringify(artifact, null, 2));

    for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(14_000);
        expect(page.url(), "an expired QA session redirects everything to /login").not.toContain("/login");

        const measured = await page.evaluate(() => {
            const card = document.querySelector("[data-universal-card-key='financials']") as HTMLElement | null;
            if (!card) return { card: false };
            const r = card.getBoundingClientRect();
            /*
             * THE APPROVED ARRANGEMENT: Details sits on its own row, below the buttons. Measured as
             * geometry rather than asserted from source — a class name cannot tell you whether two
             * elements share a line.
             */
            const details = card.querySelector("a,[data-financials-details-link]") as HTMLElement | null;
            const buttons = Array.from(card.querySelectorAll("button")).filter((b) => (b as HTMLElement).offsetParent !== null);
            const lastButton = buttons[buttons.length - 1] as HTMLElement | undefined;
            return {
                card: true,
                width: Math.round(r.width),
                height: Math.round(r.height),
                clipped: card.scrollHeight > Math.ceil(r.height) + 2,
                detailsTop: details ? Math.round(details.getBoundingClientRect().top) : null,
                lastButtonBottom: lastButton ? Math.round(lastButton.getBoundingClientRect().bottom) : null,
                detailsOnItsOwnRow:
                    details && lastButton
                        ? details.getBoundingClientRect().top >= lastButton.getBoundingClientRect().bottom - 2
                        : null,
            };
        });
        artifact[`focusPanel_${width}`] = measured;
        log(`focus panel @${width}: ${JSON.stringify(measured)}`);
        await page.screenshot({ path: `${OUT}/panel-${width}.png`, fullPage: true });

        /* Assignment commercial setup, at the same width. */
        const child = page.getByRole("button", { name: /^custom/ }).first();
        if (await child.count()) {
            await child.click({ timeout: 20_000 }).catch(() => {});
            await page.waitForTimeout(12_000);
            artifact[`assignment_${width}`] = await page.evaluate(() => {
                const sec = document.querySelector("[data-assignment-discount-forecast]") as HTMLElement | null;
                const sel = document.querySelector("select[data-assignment-tuition-embed='true']") as HTMLElement | null;
                const box = (e: HTMLElement | null) => (e ? { w: Math.round(e.getBoundingClientRect().width), clipped: e.scrollWidth > e.clientWidth + 2 } : null);
                return { discountSection: box(sec), tuitionSelect: box(sel), addException: Boolean(document.querySelector("[data-add-policy-exception]")) };
            });
            log(`assignment @${width}: ${JSON.stringify(artifact[`assignment_${width}`])}`);
            await page.screenshot({ path: `${OUT}/assignment-${width}.png`, fullPage: true });
        }

        /* Organization → Financials: configuration, discounts and the accounting calendar. */
        await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(12_000);
        artifact[`organization_${width}`] = await page.evaluate(() => ({
            horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
            sections: Array.from(document.querySelectorAll("h2,h3")).map((e) => e.textContent?.trim()).filter(Boolean).slice(0, 14),
        }));
        log(`organization @${width}: ${JSON.stringify(artifact[`organization_${width}`]).slice(0, 300)}`);
        await page.screenshot({ path: `${OUT}/organization-${width}.png`, fullPage: true });
        flush();
    }
});
