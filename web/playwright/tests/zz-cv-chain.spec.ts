/**
 * FINAL CONVERGENCE — the complete placement chain for every card in a row.
 *
 * The question is not whether the grid declares stretch (it does) but which box in the real Work
 * Unit chain stops passing the row height down. Every level is reported for every card, so the
 * first divergence is visible rather than inferred — and rows are compared to each other, because
 * the goal is equal OUTER geometry per row, not one global height.
 */
import { test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const OUT = "../certification/financials";
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3112", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);

const chain = (p: Page) => p.evaluate(() => {
    const describe = (el: Element | null) => {
        if (!el) return null;
        const h = el as HTMLElement;
        const cs = getComputedStyle(h);
        return {
            id: h.className?.toString().split(/\s+/).slice(0, 2).join(" ") || h.tagName,
            h: Math.round(h.getBoundingClientRect().height),
            height: cs.height,
            minHeight: cs.minHeight,
            alignSelf: cs.alignSelf,
            alignItems: cs.alignItems,
            display: cs.display,
            flex: cs.flex,
            position: cs.position,
        };
    };
    const out: Array<Record<string, unknown>> = [];
    for (const node of Array.from(document.querySelectorAll("[data-universal-card-key]"))) {
        const card = node as HTMLElement;
        const r = card.getBoundingClientRect();
        if (r.height === 0) continue;
        out.push({
            key: card.getAttribute("data-universal-card-key"),
            rowBand: Math.round(r.y / 10) * 10,
            area: describe(card.closest("[data-fp-grid-area]")),
            cell: describe(card.closest(".alloy-os-focus-panel-grid__cell")),
            intrinsic: describe(card.closest(".alloy-os-fp-card-intrinsic")),
            cardRoot: describe(card),
        });
    }
    return out.sort((a, b) => (a.rowBand as number) - (b.rowBand as number));
});

async function shoot(page: Page, w: number, name: string) {
    await page.setViewportSize({ width: w, height: 1050 });
    await page.waitForTimeout(2_500);
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/${name}-${w}.png` });
    const c = await chain(page);
    log(`CHAIN_${w}\n` + c.map((x) => JSON.stringify(x)).join("\n"));
    /* Rows, and the delta within each. */
    const rows = new Map<number, Array<{ key: string; h: number }>>();
    for (const x of c as Array<Record<string, never>>) {
        const band = x.rowBand as unknown as number;
        if (!rows.has(band)) rows.set(band, []);
        rows.get(band)!.push({ key: x.key as unknown as string, h: (x.cardRoot as unknown as { h: number }).h });
    }
    for (const [band, cards] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
        const hs = cards.map((k) => k.h);
        log(`ROW_${w}_${band} ` + JSON.stringify({ cards, delta: Math.max(...hs) - Math.min(...hs) }));
    }
}

test("work unit chain", async ({ page }) => {
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-financials-card="true"]').first().waitFor({ state: "visible", timeout: 180_000 });
    await page.waitForTimeout(9_000);
    await shoot(page, 1680, "cv-workunit");
    await shoot(page, 1280, "cv-workunit");
});
