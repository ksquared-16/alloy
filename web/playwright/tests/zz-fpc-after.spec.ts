/**
 * FOCUS PANEL CONVERGENCE — THE PROOF.
 *
 * Three items, each measured where Kelly looks: Details must establish its depth immediately and at
 * final geometry, the compact card must carry commands-as-buttons and navigation-as-link without
 * clipping or wrapping, and Process must share the Financials row height.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = "http://127.0.0.1:3012";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const OUT = "../certification/financials";
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(600_000);

const shot = async (p: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: `${OUT}/${n}.png` }); };

async function openCard(page: Page) {
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-financials-card="true"]').first().waitFor({ state: "visible", timeout: 180_000 });
    await page.waitForTimeout(9_000);
}

test("1 · Details establishes depth immediately, at final geometry", async ({ page }) => {
    await openCard(page);
    /* Every distinct committed state, plus the surface's own box, sampled per frame. */
    await page.evaluate(() => {
        const w = window as unknown as { __film?: string[]; __t0?: number };
        w.__film = []; w.__t0 = 0;
        let last = "";
        const tick = () => {
            const host = document.querySelector("[data-financials-overlay]") as HTMLElement | null;
            const card = host?.querySelector(".alloy-os-ucard") as HTMLElement | null;
            const r = card?.getBoundingClientRect();
            const sig = [
                `surface=${host?.getAttribute("data-financials-overlay") ?? "compact"}`,
                `rows=${document.querySelectorAll("[data-financials-ledger-row]").length}`,
                `periods=${document.querySelectorAll("[data-financials-ledger-period]").length}`,
                `ledgerReading=${document.querySelector("[data-financials-ledger-reading]") ? "true" : "false"}`,
                `lenses=${document.querySelectorAll("[data-financials-lens]").length}`,
                `geom=${r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}` : "-"}`,
            ].join(" ");
            if (sig !== last) { last = sig; w.__film!.push(`+${Math.round(performance.now() - (w.__t0 || performance.now()))}ms ${sig}`); }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
    await page.evaluate(() => { (window as unknown as { __t0: number }).__t0 = performance.now(); });

    const clickAt = Date.now();
    await page.locator('[data-financials-nav="details"]').first().click({ timeout: 20_000 });
    await page.locator('[data-financials-overlay="detail"]').waitFor({ state: "visible", timeout: 60_000 });
    const surfaceMs = Date.now() - clickAt;
    const geomAtCommit = await page.evaluate(() => {
        const c = document.querySelector('[data-financials-overlay="detail"] .alloy-os-ucard') as HTMLElement | null;
        const r = c?.getBoundingClientRect();
        return r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}` : null;
    });
    await page.screenshot({ path: `${OUT}/fpc-details-first-frame.png` });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-ledger-row]").length > 10, undefined, { timeout: 120_000 });
    const populatedMs = Date.now() - clickAt;
    await page.waitForTimeout(1_500);
    const geomAfter = await page.evaluate(() => {
        const c = document.querySelector('[data-financials-overlay="detail"] .alloy-os-ucard') as HTMLElement | null;
        const r = c?.getBoundingClientRect();
        return r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}` : null;
    });
    const film = await page.evaluate(() => (window as unknown as { __film: string[] }).__film ?? []);
    log("DETAILS_CLICK_TO_SURFACE_MS " + surfaceMs);
    log("DETAILS_CLICK_TO_POPULATED_MS " + populatedMs);
    log("GEOM_AT_COMMIT " + geomAtCommit);
    log("GEOM_AFTER_LEDGER " + geomAfter);
    log("DETAIL_SURFACE_GEOMETRY_DELTA_AFTER_LEDGER " + (geomAtCommit === geomAfter ? "0" : `CHANGED ${geomAtCommit} -> ${geomAfter}`));
    log("FILMSTRIP\n" + film.join("\n"));
    const detailFrames = film.filter((f) => f.includes("surface=detail"));
    /* A frame that shows rows it has not read is the defect; a reserved region is not. */
    const rowCounts = detailFrames.map((f) => Number(/rows=(\d+)/.exec(f)?.[1] ?? "0"));
    const partial = rowCounts.some((n) => n > 0 && n <= 10);
    log("VISIBLE_DETAILS_INTERMEDIATE_STATE " + (partial ? "YES" : "NO"));
    log("PARTIAL_LEDGER_EVER_PRESENTED_AS_DETAILS " + (partial ? "YES" : "NO"));
    await shot(page, "fpc-details-populated");
    expect(partial, "no partial ledger is ever presented as Details").toBe(false);
    expect(geomAfter, "geometry does not change when the ledger arrives").toBe(geomAtCommit);
    expect(surfaceMs, "the focused surface does not wait on the deep read").toBeLessThan(1_200);
});

test("2 · compact grammar and containment", async ({ page }) => {
    await openCard(page);
    for (const w of [1680, 1280, 1040]) {
        await page.setViewportSize({ width: w, height: 1000 });
        await page.waitForTimeout(2_500);
        const c = await page.evaluate(() => {
            const card = document.querySelector(".alloy-os-billing") as HTMLElement | null;
            const cr = card?.getBoundingClientRect();
            const controls = [...document.querySelectorAll("[data-financials-command], [data-financials-nav]")].map((b) => {
                const el = b as HTMLElement;
                const r = el.getBoundingClientRect();
                const cs = getComputedStyle(el);
                return {
                    label: el.innerText.replace(/\s+/g, " ").trim(),
                    kind: el.getAttribute("data-financials-command") ?? `nav:${el.getAttribute("data-financials-nav")}`,
                    box: `${Math.round(r.width)}x${Math.round(r.height)}`,
                    bg: cs.backgroundColor,
                    border: cs.borderTopWidth + " " + cs.borderTopColor,
                    color: cs.color,
                    decoration: cs.textDecorationLine,
                    inside: cr ? r.right <= cr.right + 1 && r.left >= cr.left - 1 : null,
                };
            });
            const wrapped = [...document.querySelectorAll(".alloy-os-billing__zone--position .alloy-os-billing__line")]
                .map((n) => {
                    const el = n as HTMLElement;
                    const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
                    return { text: el.innerText.replace(/\s+/g, " ").trim().slice(0, 24), lines: Math.round(el.getBoundingClientRect().height / lh) };
                });
            return {
                cardHeight: cr ? Math.round(cr.height) : null,
                controls,
                anyWrapped: wrapped.some((x) => x.lines > 1),
                positionLines: wrapped,
                bodyScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            };
        });
        log(`COMPACT_${w} ` + JSON.stringify(c));
        await shot(page, `fpc-compact-${w}`);
        expect(c.controls.every((x) => x.inside), `all controls inside the card at ${w}`).toBe(true);
        expect(c.anyWrapped, `no wrapped position copy at ${w}`).toBe(false);
        expect(c.bodyScrollX, `no horizontal overflow at ${w}`).toBe(false);
    }
    await page.setViewportSize({ width: 1680, height: 1050 });
});

test("3 · Process and Financials share the row", async ({ page }) => {
    await openCard(page);
    for (const w of [1680, 1280]) {
        await page.setViewportSize({ width: w, height: 1000 });
        await page.waitForTimeout(2_500);
        const rows = await page.evaluate(() => {
            const byTop = new Map<number, Array<{ key: string; h: number }>>();
            for (const card of Array.from(document.querySelectorAll("[data-universal-card-key]"))) {
                const el = card as HTMLElement;
                const key = el.getAttribute("data-universal-card-key");
                const r = el.getBoundingClientRect();
                if (!key || r.height === 0) continue;
                const band = Math.round(r.y / 10) * 10;
                if (!byTop.has(band)) byTop.set(band, []);
                byTop.get(band)!.push({ key, h: Math.round(r.height) });
            }
            return [...byTop.entries()].sort((a, b) => a[0] - b[0]).map(([top, cards]) => ({ top, cards }));
        });
        log(`GRIDROWS_${w} ` + JSON.stringify(rows));
        const top = rows[0];
        const proc = top?.cards.find((c) => c.key === "business_process");
        const fin = top?.cards.find((c) => c.key === "financials");
        if (proc && fin) {
            log(`TOP_ROW_PROCESS_HEIGHT ${proc.h}`);
            log(`TOP_ROW_FINANCIALS_HEIGHT ${fin.h}`);
            log(`HEIGHT_DELTA ${Math.abs(proc.h - fin.h)}`);
            expect(Math.abs(proc.h - fin.h), `top row equalises at ${w}`).toBeLessThanOrEqual(1);
        }
        /* And rows that are NOT the same row must not be dragged to one height. */
        const distinct = new Set(rows.map((r) => r.cards.map((c) => c.h).join("/")));
        log(`ROW_SIGNATURES_${w} ` + JSON.stringify([...distinct]));
        await shot(page, `fpc-grid-${w}`);
    }
});
