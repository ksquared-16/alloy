/**
 * Two things the first deployed pass measured badly:
 *   1. the landing TILE cue — `h3.closest("div")` grabbed the heading's own wrapper, so every
 *      tile summary came back empty. Read the tile by its own container instead.
 *   2. the ACTIVE exception count — `[data-exception-live]` was counted without reading what it
 *      is attached to, and a count alone cannot say whether the active answer is clean.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11b-deployed-qa";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("the landing tiles, read as tiles", async ({ page }) => {
    await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    expect(page.url()).not.toContain("/login");
    const tiles = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-testid^='financials-landing-tile-']")).map((el) => {
            const t = (el as HTMLElement).innerText.replace(/\s+/g, " ").trim();
            const btn = Array.from(el.querySelectorAll("button")).find((b) => /^open /i.test(b.textContent ?? ""));
            return {
                testid: el.getAttribute("data-testid"),
                text: t,
                openControl: btn?.textContent?.trim() ?? null,
                controlTag: btn?.tagName ?? null,
                namesDiscount: /discount/i.test(t),
            };
        }),
    );
    log(`TILES: ${JSON.stringify(tiles, null, 1)}`);
    writeFileSync(`${OUT}/deployed-tiles.json`, JSON.stringify(tiles, null, 2));
});

test("the discount fixture's ACTIVE answer", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");
    const child = page.getByRole("button", { name: /^custom/ }).first();
    if (await child.count()) { await child.click({ timeout: 20_000 }); await page.waitForTimeout(13_000); }

    /* What the OPERATOR sees: every element carrying a lifecycle marker, with its own text. */
    const dom = await page.evaluate(() => ({
        live: Array.from(document.querySelectorAll("[data-exception-live]")).map((e) => ({
            attr: e.getAttribute("data-exception-live"),
            tag: e.tagName,
            text: (e as HTMLElement).innerText?.replace(/\s+/g, " ").slice(0, 200),
        })),
        ended: Array.from(document.querySelectorAll("[data-exception-ended]")).map((e) => ({
            attr: e.getAttribute("data-exception-ended"),
            tag: e.tagName,
            text: (e as HTMLElement).innerText?.replace(/\s+/g, " ").slice(0, 200),
        })),
    }));
    log(`DOM LIVE: ${JSON.stringify(dom.live, null, 1)}`);
    log(`DOM ENDED: ${JSON.stringify(dom.ended, null, 1)}`);

    /* The lifecycle AUTHORITY, for the same assignment — appliesNow / isLiveNow / ended / superseded. */
    const api = await page.evaluate(async () => {
        const r = await fetch("/api/admin/financials/reduction-forecast", { credentials: "include" });
        if (!r.ok) return { status: r.status };
        const b = await r.json();
        const ex = (b.exceptions ?? []) as Array<Record<string, unknown>>;
        return {
            status: r.status,
            total: ex.length,
            activeNow: ex.filter((e) => e.isLiveNow === true).length,
            appliesNow: ex.filter((e) => e.appliesNow === true).length,
            ended: ex.filter((e) => e.ended === true).length,
            superseded: ex.filter((e) => e.superseded === true).length,
            rows: ex.map((e) => ({ id: e.id, reason: String(e.reason ?? "").slice(0, 80), appliesNow: e.appliesNow, isLiveNow: e.isLiveNow, ended: e.ended, superseded: e.superseded })),
            forecast: b.forecast,
        };
    });
    log(`LIFECYCLE AUTHORITY: ${JSON.stringify(api, null, 1).slice(0, 2500)}`);
    writeFileSync(`${OUT}/deployed-fixture.json`, JSON.stringify({ dom, api }, null, 2));
});
