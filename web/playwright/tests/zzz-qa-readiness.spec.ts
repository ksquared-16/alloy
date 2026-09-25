/**
 * FINAL BOUNDED UX INSPECTION — items A-G and the responsive pass, against the deployed product.
 * Measurement and capture only; nothing is repaired from here.
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/qa-readiness";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.describe.configure({ mode: "serial" });
test.setTimeout(2_400_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const found: Record<string, unknown>[] = [];

async function reachAccounts(page: Page) {
    for (let a = 1; a <= 2; a++) {
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
        if (a === 2) throw new Error("workspace never mounted");
    }
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-ledger-row]").length > 0, undefined, { timeout: 180_000 }).catch(() => undefined);
    await page.waitForTimeout(3_000);
}

test("A · the gap between the lenses and the first ledger row", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await reachAccounts(page);
    const gap = await page.evaluate(() => {
        const lenses = document.querySelector("[data-financials-lenses]");
        const row = document.querySelector("[data-financials-ledger-row]");
        const head = document.querySelector(".alloy-os-billingdetail__ledger [role='row'], .alloy-os-billingdetail__ledger");
        if (!lenses || !row) return null;
        const l = lenses.getBoundingClientRect();
        const r = row.getBoundingClientRect();
        const h = head?.getBoundingClientRect() ?? null;
        return { lensesBottom: Math.round(l.bottom), firstRowTop: Math.round(r.top), gap: Math.round(r.top - l.bottom), headTop: h ? Math.round(h.top) : null, lensesToHead: h ? Math.round(h.top - l.bottom) : null };
    });
    log(`A WHITESPACE: ${JSON.stringify(gap)}`);
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/A-ledger-gap.png` });
    found.push({ item: "A", gap });
    expect(gap, "the ledger and its controls must both be present to measure").not.toBeNull();
});

test("B · a bounded sweep for the intermittent ledger formatting", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await reachAccounts(page);
    const anomalies: unknown[] = [];
    const lenses = page.locator("[data-financials-lens]");
    const lensCount = Math.min(await lenses.count(), 6);
    for (let width of [1280, 1440, 1680]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(700);
        for (let i = 0; i < lensCount; i++) {
            await lenses.nth(i).click({ timeout: 15_000 }).catch(() => undefined);
            await page.waitForTimeout(650);
            const bad = await page.evaluate((w) => {
                const rows = [...document.querySelectorAll("[data-financials-ledger-row]")];
                const out: Array<Record<string, unknown>> = [];
                const heights = rows.map((r) => Math.round(r.getBoundingClientRect().height));
                const median = heights.slice().sort((a, b) => a - b)[Math.floor(heights.length / 2)] ?? 0;
                rows.forEach((r, idx) => {
                    const b = r.getBoundingClientRect();
                    const overflows = r.scrollWidth - r.clientWidth > 2;
                    const tall = median > 0 && b.height > median * 2.2;
                    const outside = b.right > document.documentElement.clientWidth + 2;
                    if (overflows || tall || outside) out.push({ w, idx, h: Math.round(b.height), median, overflows, tall, outside });
                });
                return out;
            }, width);
            if (bad.length) anomalies.push(...bad);
        }
    }
    log(`B FORMATTING ANOMALIES: ${anomalies.length}`);
    for (const a of anomalies.slice(0, 8)) log(`   ${JSON.stringify(a)}`);
    if (anomalies.length) await page.screenshot({ path: `${OUT}/B-formatting.png` });
    found.push({ item: "B", anomalies: anomalies.slice(0, 20), count: anomalies.length });
});

test("C · site filter persistence across section navigation", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await reachAccounts(page);
    const before = await page.evaluate(() => {
        const s = document.querySelector("[data-workspace-site-filter] select, [data-financials-site-filter] select, select[name*='site']") as HTMLSelectElement | null;
        return s ? { value: s.value, options: s.options.length, label: s.selectedOptions[0]?.textContent ?? null } : null;
    });
    log(`C site control: ${JSON.stringify(before)}`);
    let after: unknown = null;
    if (before && before.options > 1) {
        await page.evaluate(() => {
            const s = document.querySelector("[data-workspace-site-filter] select, [data-financials-site-filter] select, select[name*='site']") as HTMLSelectElement | null;
            if (!s) return;
            const other = [...s.options].find((o) => o.value && o.value !== s.value);
            if (other) { s.value = other.value; s.dispatchEvent(new Event("change", { bubbles: true })); }
        });
        await page.waitForTimeout(3_500);
        const picked = await page.evaluate(() => (document.querySelector("[data-workspace-site-filter] select, [data-financials-site-filter] select, select[name*='site']") as HTMLSelectElement | null)?.value ?? null);
        await page.locator("[data-workspace-section-tab='overview']").first().click({ timeout: 30_000 }).catch(() => undefined);
        await page.waitForTimeout(2_500);
        await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 }).catch(() => undefined);
        await page.waitForTimeout(3_500);
        const back = await page.evaluate(() => (document.querySelector("[data-workspace-site-filter] select, [data-financials-site-filter] select, select[name*='site']") as HTMLSelectElement | null)?.value ?? null);
        after = { picked, afterReturn: back, persisted: picked === back };
    }
    log(`C PERSISTENCE: ${JSON.stringify(after)}`);
    found.push({ item: "C", before, after });
});

test("D/E/F · Overview, dropdowns, Description", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await reachAccounts(page);

    const desc = await page.evaluate(() => {
        const rows = [...document.querySelectorAll("[data-financials-ledger-row]")].slice(0, 6);
        return rows.map((r) => {
            const t = (r as HTMLElement).innerText.replace(/\s+/g, " ").trim();
            return { text: t.slice(0, 110), overflows: r.scrollWidth - r.clientWidth > 2, h: Math.round(r.getBoundingClientRect().height) };
        });
    });
    log(`F DESCRIPTION rows: ${JSON.stringify(desc)}`);
    await page.screenshot({ path: `${OUT}/F-description.png` });

    const selects = await page.evaluate(() => {
        const natives = [...document.querySelectorAll("select")].filter((s) => (s as HTMLElement).offsetParent !== null);
        return natives.map((s) => ({ name: s.getAttribute("name"), cls: (s.className || "").slice(0, 40), w: Math.round(s.getBoundingClientRect().width) }));
    });
    log(`E VISIBLE NATIVE SELECTS: ${selects.length} ${JSON.stringify(selects.slice(0, 5))}`);
    await page.screenshot({ path: `${OUT}/E-controls.png` });

    await page.locator("[data-workspace-section-tab='overview']").first().click({ timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(6_000);
    const overview = await page.evaluate(() => {
        const t = document.body.innerText;
        return {
            hasMoney: /\$[\d,]+\.\d\d/.test(t),
            zeros: (t.match(/\$0\.00/g) ?? []).length,
            needsDecision: /Needs Decision|Needs decision/.test(t),
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
    });
    log(`D OVERVIEW: ${JSON.stringify(overview)}`);
    await page.screenshot({ path: `${OUT}/D-overview.png` });
    found.push({ item: "DEF", desc, selects, overview });
});

test("17 · responsive sweep", async ({ page }) => {
    const results: unknown[] = [];
    for (const width of [1280, 1440, 1680]) {
        await page.setViewportSize({ width, height: 900 });
        await reachAccounts(page);
        const r = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            backdrop: !!document.querySelector("[data-financials-overlay] ~ [class*='scrim'], [class*='backdrop']:not([hidden])"),
            rows: document.querySelectorAll("[data-financials-ledger-row]").length,
            lenses: !!document.querySelector("[data-financials-lenses]"),
        }));
        log(`17 width ${width}: ${JSON.stringify(r)}`);
        await page.screenshot({ path: `${OUT}/R-${width}.png` });
        results.push({ width, ...r });
        expect(r.overflow, `${width}: no horizontal overflow`).toBeLessThanOrEqual(1);
    }
    found.push({ item: "responsive", results });
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/ux-inspection.json`, JSON.stringify(found, null, 2));
    expect(found.length).toBeGreaterThan(0);
});
