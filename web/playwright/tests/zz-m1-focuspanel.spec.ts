/**
 * PHASE 1 — THE MOUNTED PRODUCT MATRIX, FOCUS PANEL.
 *
 * Against the fixed candidate on :3112. Every claim is a measurement of the rendered surface; where
 * a control legitimately does not exist for this subject the probe says so rather than passing by
 * omission, because "not found" and "works" must never look the same in a matrix.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3112";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const OUT = "../certification/financials";
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(900_000);

const shot = async (p: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: `${OUT}/${n}.png` }); };

/** The Details state that must survive a command round trip. */
const view = (p: Page) => p.evaluate(() => ({
    surface: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? "compact",
    lens: document.querySelector('[data-financials-lens][aria-pressed="true"]')?.getAttribute("data-financials-lens") ?? null,
    filters: [...document.querySelectorAll("[data-financials-filter][data-active]")].map((c) => c.getAttribute("data-financials-filter")).join(","),
    periods: [...document.querySelectorAll("[data-financials-period-toggle]")].map((t) => `${t.getAttribute("data-financials-period-toggle")}=${t.getAttribute("aria-expanded")}`).join(","),
    scroll: Math.round((document.querySelector("[data-financials-detail-scroll]") as HTMLElement | null)?.scrollTop ?? -1),
    rows: document.querySelectorAll("[data-financials-ledger-row]").length,
}));

async function openCompact(page: Page) {
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-financials-card="true"]').first().waitFor({ state: "visible", timeout: 180_000 });
    await page.waitForTimeout(9_000);
}

test("M1 · compact card anatomy and commands", async ({ page }) => {
    await openCompact(page);
    log("M1_COMPACT " + JSON.stringify(await page.evaluate(() => {
        const t = (s: string) => (document.querySelector(s) as HTMLElement | null)?.innerText?.replace(/\s+/g, " ").trim() ?? null;
        const controls = [...document.querySelectorAll("[data-financials-command], [data-financials-nav]")].map((b) => ({
            id: (b as HTMLElement).getAttribute("data-financials-command") ?? `nav:${(b as HTMLElement).getAttribute("data-financials-nav")}`,
            label: (b as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
            enabled: !(b as HTMLButtonElement).disabled,
        }));
        return {
            due: t(".alloy-os-billing__amount"),
            pastDue: t(".alloy-os-billing__clear") ?? t(".alloy-os-billing__age"),
            lines: [...document.querySelectorAll(".alloy-os-billing__zone--position .alloy-os-billing__line")].map((n) => (n as HTMLElement).innerText.replace(/\s+/g, " ").trim()),
            period: t(".alloy-os-billing__period"),
            controls,
        };
    })));
    await shot(page, "m1-compact");
});

test("M1 · Details opens ready, with the full ledger", async ({ page }) => {
    await openCompact(page);
    /* The prewarm should mean the ledger is already read by the time anyone clicks. */
    await page.waitForTimeout(4_000);
    await page.evaluate(() => {
        const w = window as unknown as { __f?: string[] };
        w.__f = [];
        const t0 = performance.now();
        let last = "";
        const tick = () => {
            const host = document.querySelector("[data-financials-overlay]");
            const sig = `${host?.getAttribute("data-financials-overlay") ?? "compact"} rows=${document.querySelectorAll("[data-financials-ledger-row]").length} reading=${document.querySelector("[data-financials-ledger-reading]") ? 1 : 0}`;
            if (sig !== last) { last = sig; w.__f!.push(`+${Math.round(performance.now() - t0)}ms ${sig}`); }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
    const t0 = Date.now();
    await page.locator('[data-financials-nav="details"]').first().click({ timeout: 20_000 });
    await page.locator('[data-financials-overlay="detail"]').waitFor({ state: "visible", timeout: 60_000 });
    const surfaceMs = Date.now() - t0;
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-ledger-row]").length > 10, undefined, { timeout: 120_000 });
    const readyMs = Date.now() - t0;
    const film = await page.evaluate(() => (window as unknown as { __f: string[] }).__f ?? []);
    log("M1_DETAILS_SURFACE_MS " + surfaceMs);
    log("M1_DETAILS_READY_MS " + readyMs);
    log("M1_DETAILS_FILM\n" + film.join("\n"));
    const detailFrames = film.filter((f) => f.startsWith("+") && f.includes("detail "));
    const firstRows = Number(/rows=(\d+)/.exec(detailFrames[0] ?? "")?.[1] ?? "0");
    log("M1_FIRST_DETAILS_FRAME_ROWS " + firstRows);
    log("M1_READING_VISIBLE_AFTER_CLICK " + (film.some((f) => f.includes("detail") && f.includes("reading=1")) ? "YES" : "NO"));
    expect(firstRows, "Details arrives with the real ledger, not a partial one").toBeGreaterThan(10);

    log("M1_DETAILS_ANATOMY " + JSON.stringify(await page.evaluate(() => ({
        lenses: [...document.querySelectorAll("[data-financials-lens]")].map((l) => l.getAttribute("data-financials-lens")),
        lensCounts: [...document.querySelectorAll(".alloy-os-fdetail__lenscount")].map((c) => (c as HTMLElement).innerText.trim()),
        periods: [...document.querySelectorAll("[data-financials-period-toggle]")].map((t) => t.getAttribute("data-financials-period-toggle")),
        filters: [...document.querySelectorAll(".alloy-os-fdetail__lensfilters select")].length,
        rows: document.querySelectorAll("[data-financials-ledger-row]").length,
        sampleDates: [...document.querySelectorAll("[data-financials-ledger-row]")].slice(0, 3).map((r) => (r.children[2] as HTMLElement)?.innerText?.trim()),
        glStates: [...new Set([...document.querySelectorAll("[data-financials-gl-state], .alloy-os-billingdetail__gl")].map((g) => (g as HTMLElement).innerText.trim()).slice(0, 6))],
        responsibility: [...new Set([...document.querySelectorAll("[data-financials-responsibility]")].map((r) => (r as HTMLElement).innerText.trim()).slice(0, 6))],
        rowActions: [...new Set([...document.querySelectorAll("[data-financials-row-action]")].map((a) => a.getAttribute("data-financials-row-action")))],
    }))));
    await shot(page, "m1-details");
});

test("M1 · command dismissal restores the same Details", async ({ page }) => {
    await openCompact(page);
    await page.waitForTimeout(3_000);
    await page.locator('[data-financials-nav="details"]').first().click({ timeout: 20_000 });
    await page.locator('[data-financials-overlay="detail"]').waitFor({ state: "visible", timeout: 60_000 });
    await page.waitForTimeout(3_000);
    const lenses = await page.locator("[data-financials-lens]").all();
    if (lenses.length > 1) await lenses[1].click({ timeout: 15_000 }).catch(() => {});
    const tog = page.locator("[data-financials-period-toggle]").first();
    if (await tog.count()) await tog.click({ timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1_200);
    const anchor = await view(page);
    log("M1_ANCHOR " + JSON.stringify(anchor));

    const results: Array<Record<string, unknown>> = [];
    for (const action of ["adjust", "reverse", "post"] as const) {
        const btn = page.locator(`[data-financials-row-action="${action}"]`).first();
        if (!(await btn.count())) { results.push({ action, present: false, note: "no eligible row offers this action" }); continue; }
        await btn.click({ timeout: 15_000 }).catch(async () => { await btn.evaluate((e) => (e as HTMLElement).click(), undefined, { timeout: 8_000 }).catch(() => {}); });
        await page.waitForTimeout(2_500);
        const opened = await view(page);
        if (action !== "post") await shot(page, `m1-command-${action}`);
        const cancel = page.locator('[data-testid$="-cancel"]:visible').first();
        if (await cancel.count()) await cancel.click({ timeout: 12_000 }).catch(() => {});
        await page.waitForTimeout(2_500);
        const landed = await view(page);
        results.push({
            action, present: true, opened: opened.surface, landed: landed.surface,
            lensKept: landed.lens === anchor.lens, periodsKept: landed.periods === anchor.periods,
            filtersKept: landed.filters === anchor.filters, rows: landed.rows,
        });
        for (let i = 0; i < 3 && (await view(page)).surface !== "detail"; i += 1) {
            await page.keyboard.press("Escape"); await page.waitForTimeout(1_500);
        }
    }
    log("M1_DISMISSAL\n" + results.map((r) => JSON.stringify(r)).join("\n"));
    for (const r of results) {
        if (!r.present) continue;
        expect(r.landed, `${r.action} → Cancel returns to Details`).toBe("detail");
        expect(r.lensKept, `${r.action} keeps the lens`).toBe(true);
        expect(r.periodsKept, `${r.action} keeps the disclosures`).toBe(true);
    }
});
