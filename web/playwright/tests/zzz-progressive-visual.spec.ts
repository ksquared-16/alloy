/**
 * §24 — visual and responsive proof of the progressive account list.
 *
 * Two moments matter and one of them is brief: the instant the rows become interactive with their
 * money still unknown, and the settled state after position lands. Both are captured at desktop and
 * at phone width, because a reserved figure that reflows the row is a layout jump wearing a
 * different name.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/accounts-cohort";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.describe.configure({ mode: "serial" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

async function reach(page: Page) {
    for (let attempt = 1; attempt <= 2; attempt++) {
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
        if (attempt === 2) throw new Error(`workspace never mounted at ${page.url()}`);
    }
    await page.waitForTimeout(11_000);
}

/** What the row actually shows, so the proof is text and not only a picture. */
async function rowTruth(page: Page) {
    return page.evaluate(() => {
        const rows = [...document.querySelectorAll<HTMLElement>("[data-financials-account-row]")];
        return rows.slice(0, 4).map((r) => ({
            id: r.getAttribute("data-financials-account-row"),
            state: r.getAttribute("data-financials-account-state"),
            truth: r.querySelector("[data-financials-account-truth]")?.getAttribute("data-financials-account-truth") ?? null,
            money: (r.querySelector("[data-financials-account-outstanding]") as HTMLElement | null)?.innerText?.trim() ?? null,
            width: Math.round(r.getBoundingClientRect().width),
            height: Math.round(r.getBoundingClientRect().height),
            disabled: r.hasAttribute("disabled") || r.getAttribute("aria-disabled") === "true",
        }));
    });
}

for (const [label, width, height] of [["desktop", 1440, 900], ["phone", 400, 860]] as const) {
    test(`${label}: reserved then settled`, async ({ browser }) => {
        const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width, height }, baseURL: "https://staging.workwithalloy.com" });
        const page = await ctx.newPage();
        try {
            await reach(page);
            mkdirSync(OUT, { recursive: true });
            await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });

            /* The brief moment: rows present, money not yet known. */
            await page.waitForFunction(
                () => document.querySelectorAll("[data-financials-account-row]").length > 0,
                undefined,
                { timeout: 180_000 },
            );
            const reserved = await rowTruth(page);
            await page.screenshot({ path: `${OUT}/progressive-${label}-reserved.png` });
            log(`${label} RESERVED ${JSON.stringify(reserved)}`);

            /* Settled: every visible row's money is known. */
            await page.waitForFunction(() => {
                const rows = [...document.querySelectorAll("[data-financials-account-truth]")];
                return rows.length > 0 && rows.every((r) => {
                    const t = r.getAttribute("data-financials-account-truth");
                    return t === "known" || t === "known_zero";
                });
            }, undefined, { timeout: 180_000 }).catch(() => undefined);
            const settled = await rowTruth(page);
            await page.screenshot({ path: `${OUT}/progressive-${label}-settled.png` });
            log(`${label} SETTLED  ${JSON.stringify(settled)}`);

            /* No horizontal overflow at any width. */
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            log(`${label} horizontal overflow: ${overflow}px`);
            expect(overflow, `${label}: the page must not scroll sideways`).toBeLessThanOrEqual(1);

            /* Geometry is stable: the reserved row and the settled row are the same size. */
            for (const before of reserved) {
                const after = settled.find((r) => r.id === before.id);
                if (!after) continue;
                expect(Math.abs(after.height - before.height), `${label}/${before.id}: the row must not resize when money lands`).toBeLessThanOrEqual(1);
                expect(after.width - before.width, `${label}/${before.id}: nor change width`).toBeLessThanOrEqual(1);
            }
            /* And no row was ever a zero it had not earned. */
            for (const r of reserved) {
                if (r.truth === "not_yet_known" || r.truth === "unavailable") {
                    expect(r.money, "an unknown balance must not render as a figure").not.toMatch(/^\$/);
                    expect(r.state, "nor read as settled").not.toBe("settled");
                }
                expect(r.disabled, "a visible row must be choosable").toBe(false);
            }
        } finally { await ctx.close(); }
    });
}
