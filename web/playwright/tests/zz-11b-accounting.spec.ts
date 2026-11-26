/** §28 — adopt, read, close, persist. On the qualified runtime, through the product. */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-accounting";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(480_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("accounting period lifecycle", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const out: Record<string, unknown> = {};
    const t0 = Date.now();
    await page.goto("/organization/financials?chapter=accounting", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    expect(page.url()).not.toContain("/login");

    const readPanel = async () => page.evaluate(() => {
        const panel = document.querySelector("[data-testid='accounting-calendar-panel']") as HTMLElement | null;
        const rows = Array.from(document.querySelectorAll("[data-testid^='accounting-period-'][data-accounting-period-status]")).map((r) => ({
            key: r.getAttribute("data-testid")?.replace("accounting-period-", ""),
            status: r.getAttribute("data-accounting-period-status"),
            current: r.getAttribute("data-accounting-period-current"),
            text: (r as HTMLElement).innerText.replace(/\n+/g, " · "),
        }));
        return {
            absent: Boolean(document.querySelector("[data-testid='accounting-calendar-absent']")),
            adoptOffered: Boolean(document.querySelector("[data-testid='accounting-calendar-adopt']")),
            summary: (document.querySelector("[data-testid='accounting-calendar-summary']") as HTMLElement | null)?.innerText?.replace(/\n+/g, " · ") ?? null,
            rowCount: rows.length,
            current: rows.find((r) => r.current === "true") ?? null,
            firstThree: rows.slice(0, 3),
            error: (document.querySelector("[data-testid='accounting-action-error']") as HTMLElement | null)?.innerText ?? null,
            panelPresent: Boolean(panel),
        };
    });

    out.before = await readPanel();
    log(`BEFORE: ${JSON.stringify(out.before, null, 1)}`);
    out.loadMs = Date.now() - t0;

    // ── A. adopt ──
    const adopt = page.locator("[data-testid='accounting-calendar-adopt']");
    if (await adopt.count()) {
        await adopt.click({ force: true });
        await page.waitForTimeout(12_000);
    }
    out.afterAdopt = await readPanel();
    log(`\nAFTER ADOPT: ${JSON.stringify(out.afterAdopt, null, 1)}`);
    await page.screenshot({ path: `${OUT}/accounting-adopted.png`, fullPage: true });

    // ── H/I. close the CURRENT period, through preview then confirm ──
    const cur = (out.afterAdopt as { current: { key: string } | null }).current;
    if (cur) {
        const closeBtn = page.locator(`[data-testid='accounting-period-close-${cur.key}']`);
        log(`\nclose control for ${cur.key}: ${await closeBtn.count()}`);
        if (await closeBtn.count()) {
            await closeBtn.click({ force: true });
            await page.waitForTimeout(9000);
            out.preview = await page.evaluate(() => {
                const el = document.querySelector("[data-testid='accounting-close-preview']") as HTMLElement | null;
                return el ? el.innerText.replace(/\n+/g, " / ") : null;
            });
            log(`CLOSE PREVIEW: ${out.preview}`);
            await page.screenshot({ path: `${OUT}/accounting-close-preview.png`, fullPage: true });
            const confirm = page.locator("[data-testid='accounting-close-confirm']");
            if (await confirm.count()) { await confirm.click({ force: true }); await page.waitForTimeout(12_000); }
        }
    }
    out.afterClose = await readPanel();
    log(`\nAFTER CLOSE: ${JSON.stringify(out.afterClose, null, 1)}`);
    await page.screenshot({ path: `${OUT}/accounting-closed.png`, fullPage: true });

    // ── §19/§23: what a charge says about its accounting period. ──
    out.responsive = {};
    for (const w of [1280, 1440, 1680]) {
        await page.setViewportSize({ width: w, height: 1000 });
        await page.waitForTimeout(2200);
        (out.responsive as Record<string, unknown>)[w] = await page.evaluate(() => {
            const p = document.querySelector("[data-testid='accounting-calendar-panel']") as HTMLElement | null;
            const t = document.querySelector("[data-testid='accounting-period-table']") as HTMLElement | null;
            if (!p) return { missing: true };
            const r = p.getBoundingClientRect();
            return {
                width: Math.round(r.width), overflows: r.right > window.innerWidth + 1,
                /* The table has its own scroll container by design; the panel must not scroll. */
                panelClipped: p.scrollWidth > p.clientWidth + 1,
                tableScrolls: t ? t.scrollWidth > t.clientWidth : null,
            };
        });
    }
    log(`\nRESPONSIVE: ${JSON.stringify(out.responsive)}`);
    writeFileSync(`${OUT}/accounting-lifecycle.json`, JSON.stringify(out, null, 2));
});
