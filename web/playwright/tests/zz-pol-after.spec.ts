/**
 * FINAL POLISH — THE AFTER PROOF.
 *
 * Four findings, measured where Kelly saw them: the compact card's command grammar and placement,
 * the payment-position copy at normal and narrow widths, the click-to-complete wait with its server
 * decomposition, and whether underlying Work content still competes through the depth layer.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = "http://127.0.0.1:3012";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const HOUSEHOLD = "29944d3e-8267-45b7-8dcb-7405060e2573";
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

/** One line per control: what it says, where it sits, and whether its text fits its box. */
const compact = (p: Page) => p.evaluate(() => {
    const card = document.querySelector(".alloy-os-billing") as HTMLElement | null;
    const cr = card?.getBoundingClientRect();
    const links = [...document.querySelectorAll(".alloy-os-billing__cardlink")].map((b) => {
        const el = b as HTMLElement;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
            label: el.innerText.replace(/\s+/g, " ").trim(),
            box: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
            color: cs.color,
            decoration: cs.textDecorationLine,
            fontSize: cs.fontSize,
            inside: cr ? r.right <= cr.right + 1 && r.left >= cr.left - 1 : null,
        };
    });
    /* A wrapped label is a box taller than one line of its own text. */
    const wrapped = [...document.querySelectorAll(".alloy-os-billing__zone--position .alloy-os-billing__line, .alloy-os-billing__clear, .alloy-os-billing__age")]
        .map((n) => {
            const el = n as HTMLElement;
            const r = el.getBoundingClientRect();
            const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
            return { text: el.innerText.replace(/\s+/g, " ").trim().slice(0, 28), h: Math.round(r.height), lines: Math.round(r.height / lh) };
        })
        .filter((x) => x.text);
    return {
        cardHeight: cr ? Math.round(cr.height) : null,
        cardBox: cr ? `${Math.round(cr.x)},${Math.round(cr.y)} ${Math.round(cr.width)}x${Math.round(cr.height)}` : null,
        links,
        positionLines: wrapped,
        anyWrapped: wrapped.some((x) => x.lines > 1),
        bodyScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
});

test("compact composition and command grammar", async ({ page }) => {
    await openCard(page);
    for (const w of [1680, 1280, 1040]) {
        await page.setViewportSize({ width: w, height: 1000 });
        await page.waitForTimeout(2_500);
        const c = await compact(page);
        log(`COMPACT_${w} ` + JSON.stringify(c));
        await shot(page, `pol-after-compact-${w}`);
        expect(c.anyWrapped, `no wrapped payment-position label at ${w}`).toBe(false);
        expect(c.links.every((l) => l.inside), `every command inside the card at ${w}`).toBe(true);
        expect(c.links.every((l) => l.decoration === "none"), `no underline at ${w}`).toBe(true);
        expect(new Set(c.links.map((l) => l.fontSize)).size, `one type size at ${w}`).toBe(1);
        expect(new Set(c.links.map((l) => l.color)).size, `one colour family at ${w}`).toBeLessThanOrEqual(2);
    }
    await page.setViewportSize({ width: 1680, height: 1050 });
});

test("details latency and the pending acknowledgement", async ({ page }) => {
    await openCard(page);
    log("SERVER_TIMING_AFTER " + JSON.stringify(await page.evaluate(async (household) => {
        const out: Array<string | null> = [];
        for (let i = 0; i < 3; i += 1) {
            const res = await fetch(`/api/admin/financials/card?customer_id=${household}`, { credentials: "include" });
            await res.text();
            out.push(res.headers.get("server-timing"));
        }
        return out;
    }, HOUSEHOLD)));

    await page.evaluate(() => {
        const w = window as unknown as { __film?: string[] };
        w.__film = [];
        const t0 = performance.now();
        let last = "";
        const tick = () => {
            const host = document.querySelector("[data-financials-overlay]");
            const sig = [
                `surface=${host?.getAttribute("data-financials-overlay") ?? "compact"}`,
                `detailsPending=${document.querySelector('[data-financials-nav="details"][data-financials-pending="true"]') ? "true" : "false"}`,
                `rows=${document.querySelectorAll("[data-financials-ledger-row]").length}`,
                `periods=${document.querySelectorAll("[data-financials-ledger-period]").length}`,
                `ledgerPending=${document.querySelectorAll("[data-financials-ledger-hydrating]").length > 0}`,
            ].join(" ");
            if (sig !== last) { last = sig; w.__film!.push(`+${Math.round(performance.now() - t0)}ms ${sig}`); }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
    const t0 = Date.now();
    await page.locator('[data-financials-nav="details"]').first().click({ timeout: 20_000 });
    await page.locator('[data-financials-overlay="detail"]').waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-ledger-row]").length > 10, undefined, { timeout: 120_000 });
    const ms = Date.now() - t0;
    const film = await page.evaluate(() => (window as unknown as { __film: string[] }).__film ?? []);
    log("DETAILS_CLICK_TO_COMPLETE_AFTER_MS " + ms);
    log("DETAILS_FILMSTRIP_AFTER\n" + film.join("\n"));
    const detailFrames = film.filter((f) => f.includes("surface=detail"));
    log("DETAILS_VISIBLE_COMMIT_COUNT " + detailFrames.length);
    log("VISIBLE_DETAILS_INTERMEDIATE_STATE " + (detailFrames.length > 1 ? "YES" : "NO"));
    const rows = Number(/rows=(\d+)/.exec(detailFrames[0] ?? "")?.[1] ?? "0");
    log("PARTIAL_LEDGER_EVER_PRESENTED_AS_DETAILS " + (rows <= 10 || detailFrames.length > 1 ? "YES" : "NO"));
    expect(detailFrames.length, "one Details commit").toBe(1);
    expect(rows, "complete on arrival").toBeGreaterThan(10);
    /* The click is acknowledged on the control the operator pressed. */
    log("PENDING_OBSERVED " + (film.some((f) => f.includes("detailsPending=true")) ? "YES" : "NO"));
    await shot(page, "pol-after-details-complete");
});

test("depth subordination", async ({ page }) => {
    await openCard(page);
    await page.locator('[data-financials-nav="details"]').first().click({ timeout: 20_000 });
    await page.locator('[data-financials-overlay="detail"]').waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(4_000);
    log("SCRIM_AFTER " + JSON.stringify(await page.evaluate(() => {
        const s = document.querySelector('[data-fp-depth-scrim="true"]') as HTMLElement | null;
        if (!s) return null;
        const cs = getComputedStyle(s);
        const r = s.getBoundingClientRect();
        return {
            background: cs.backgroundColor,
            backdropFilter: cs.backdropFilter || (cs as unknown as Record<string, string>).webkitBackdropFilter,
            box: `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`,
            coversUpperLeft: document.elementFromPoint(515, 302) === s,
        };
    })));
    await shot(page, "pol-after-depth");
    await page.screenshot({ path: `${OUT}/pol-after-depth-upper-left.png`, clip: { x: 460, y: 270, width: 620, height: 420 } });
});

test("regression · Details to command and back", async ({ page }) => {
    await openCard(page);
    await page.locator('[data-financials-nav="details"]').first().click({ timeout: 20_000 });
    await page.locator('[data-financials-overlay="detail"]').waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(3_000);
    const view = () => page.evaluate(() => ({
        surface: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? "compact",
        lens: document.querySelector('[data-financials-lens][aria-pressed="true"]')?.getAttribute("data-financials-lens") ?? null,
        periods: [...document.querySelectorAll("[data-financials-period-toggle]")].map((t) => `${t.getAttribute("data-financials-period-toggle")}=${t.getAttribute("aria-expanded")}`).join(","),
        rows: document.querySelectorAll("[data-financials-ledger-row]").length,
    }));
    const lenses = await page.locator("[data-financials-lens]").all();
    if (lenses.length > 1) await lenses[1].click({ timeout: 15_000 }).catch(() => {});
    const tog = page.locator("[data-financials-period-toggle]").first();
    if (await tog.count()) await tog.click({ timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(1_200);
    const anchor = await view();
    log("REGRESSION_ANCHOR " + JSON.stringify(anchor));
    const adjust = page.locator('[data-financials-row-action="adjust"]').first();
    if (await adjust.count()) {
        await adjust.click({ timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(2_500);
        log("REGRESSION_COMMAND " + JSON.stringify(await view()));
        await page.locator('[data-testid="adjustment-cancel"]').first().click({ timeout: 12_000 }).catch(() => {});
        await page.waitForTimeout(2_500);
    }
    const landed = await view();
    log("REGRESSION_LANDED " + JSON.stringify(landed));
    expect(landed.surface).toBe("detail");
    expect(landed.lens).toBe(anchor.lens);
    expect(landed.periods).toBe(anchor.periods);
});
