/**
 * PASS 5I — THE PRE-FIX EVIDENCE, captured in one session.
 *
 * Kelly's human inspection overrides the earlier automated conclusion that the Details transition
 * was clean, so this does not count card roots: it records what the SURFACE looks like on every
 * animation frame for the first second, with component identity, variant, geometry and anatomy, and
 * takes a filmstrip beside it.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = "http://127.0.0.1:3012";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const OUT = "../certification/financials";
const TAG = process.env.P5I_TAG ?? "B";
const MOUNTED = 180_000;

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });

const shot = async (page: Page, name: string) => {
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/${name}.png` });
};

/** The visual identity of every Financials-ish surface on the page, not just card roots. */
async function armFilmstrip(page: Page) {
    await page.evaluate(() => {
        const w = window as unknown as { __film?: string[] };
        w.__film = [];
        let last = "";
        const describe = (el: Element) => {
            const e = el as HTMLElement;
            const r = e.getBoundingClientRect();
            const cs = getComputedStyle(e);
            const cls = String(e.className).split(" ").filter((c) => c.startsWith("alloy-os")).slice(0, 3).join(".");
            return [
                `cls=${cls || "-"}`,
                `ucard=${e.getAttribute("data-universal-card-key") ?? "-"}`,
                `overlay=${e.getAttribute("data-financials-overlay") ?? "-"}`,
                `account=${(e.getAttribute("data-financials-account") ?? "-").slice(0, 8)}`,
                `box=${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.x)},${Math.round(r.y)}`,
                `vis=${cs.visibility}/${cs.opacity}`,
                `stats=${e.querySelectorAll(".alloy-os-fdetail__stat").length}`,
                `lenses=${e.querySelectorAll("[data-financials-lens]").length}`,
                `rows=${e.querySelectorAll("[data-financials-ledger-row]").length}`,
                `heads=${e.querySelectorAll(".alloy-os-billingdetail__row--head").length}`,
                `skel=${e.querySelectorAll("[data-financials-card-skeleton], [aria-busy='true']").length}`,
                `title="${(e.querySelector(".alloy-os-ucard__title") as HTMLElement | null)?.innerText?.trim() ?? "-"}"`,
            ].join(" ");
        };
        const tick = () => {
            const nodes = [...document.querySelectorAll('[data-financials-card="true"], [data-financials-card-body], [data-universal-card-key], .alloy-os-addcharge-host')];
            const sig = nodes.length === 0 ? "NONE" : nodes.map((n, i) => `#${i} ${describe(n)}`).join("\n    ");
            if (sig !== last) { last = sig; w.__film!.push(`+${Math.round(performance.now())}ms (${nodes.length})\n    ${sig}`); }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

const film = (page: Page) => page.evaluate(() => (window as unknown as { __film: string[] }).__film ?? []);

test("5I pre-fix evidence", async ({ page }) => {
    test.setTimeout(900_000);
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    const card = page.locator('[data-financials-card="true"]').first();
    await expect(card).toBeVisible({ timeout: MOUNTED });
    await page.waitForTimeout(9_000);

    // ── 1 · COMPACT CARD, BEFORE ───────────────────────────────────────────────────────────────
    const compact = await card.evaluate((n) => {
        const r = n.getBoundingClientRect();
        const lines = (n as HTMLElement).innerText.split("\n").map((l) => l.trim()).filter(Boolean);
        const btns = [...n.querySelectorAll("button")].map((b) => {
            const br = b.getBoundingClientRect();
            return { label: (b as HTMLElement).innerText.trim(), x: Math.round(br.x), y: Math.round(br.y), w: Math.round(br.width), h: Math.round(br.height) };
        });
        return { h: Math.round(r.height), w: Math.round(r.width), lines, buttons: btns.filter((b) => b.label) };
    });
    // eslint-disable-next-line no-console
    console.log(`COMPACT_${TAG} ` + "" + JSON.stringify(compact, null, 1));
    await shot(page, `p5i-${TAG}01-compact`);

    // ── 8 · THE DETAILS TRANSITION, FRAME BY FRAME ─────────────────────────────────────────────
    await armFilmstrip(page);
    const details = card.getByRole("button", { name: /^Details/ }).first();
    await details.click({ timeout: 20_000 });
    await shot(page, `p5i-${TAG}02-details-frame0`);
    await page.waitForTimeout(250);
    await shot(page, `p5i-${TAG}03-details-250ms`);
    await page.waitForTimeout(250);
    await shot(page, `p5i-${TAG}04-details-500ms`);
    await page.waitForTimeout(1_000);
    const firstSecond = await film(page);
    // eslint-disable-next-line no-console
    console.log(`FILMSTRIP_${TAG} (` + "" + firstSecond.length + " distinct frames in the first ~1.5s)\n" + firstSecond.join("\n"));
    await page.waitForTimeout(16_000);
    await shot(page, `p5i-${TAG}05-details-hydrated`);

    // ── 7 · WHAT IS BEHIND THE OVERLAY ─────────────────────────────────────────────────────────
    const behind = await page.evaluate(() => {
        const overlay = document.querySelector('[data-financials-overlay="detail"]') as HTMLElement | null;
        const or = overlay?.getBoundingClientRect();
        const out: Record<string, unknown>[] = [];
        for (const el of [...document.querySelectorAll("[data-universal-card-key], [data-focus-panel-grid-cell]")]) {
            const e = el as HTMLElement;
            const r = e.getBoundingClientRect();
            if (r.width < 40 || r.height < 24) continue;
            const cs = getComputedStyle(e);
            out.push({
                key: e.getAttribute("data-universal-card-key") ?? e.getAttribute("data-focus-panel-grid-cell"),
                cls: String(e.className).slice(0, 60),
                box: `${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.x)},${Math.round(r.y)}`,
                opacity: cs.opacity,
                zIndex: cs.zIndex,
                text: e.innerText.replace(/\s+/g, " ").slice(0, 60),
                overlapsOverlay: or ? !(r.right < or.left || r.left > or.right || r.bottom < or.top || r.top > or.bottom) : null,
            });
        }
        return { overlayBox: or ? `${Math.round(or.width)}x${Math.round(or.height)}@${Math.round(or.x)},${Math.round(or.y)}` : null, surfaces: out };
    });
    // eslint-disable-next-line no-console
    console.log("BEHIND_OVERLAY " + JSON.stringify(behind, null, 1));

    // ── 4/6 · LEDGER ROW ANATOMY AND RESPONSIBLE PARTY ─────────────────────────────────────────
    const ledger = await page.evaluate(() => {
        const rows = [...document.querySelectorAll("[data-financials-ledger-row]")].slice(0, 8).map((r) => {
            const e = r as HTMLElement;
            const cells = [...e.children].map((c) => (c as HTMLElement).innerText.replace(/\s+/g, " ").trim());
            return { h: Math.round(e.getBoundingClientRect().height), cells, actions: e.querySelectorAll("[data-charge-command]").length };
        });
        const heights = [...document.querySelectorAll("[data-financials-ledger-row]")].map((r) => Math.round(r.getBoundingClientRect().height));
        return {
            rows,
            distinctHeights: [...new Set(heights)],
            responsibleBlank: [...document.querySelectorAll("[data-financials-responsible]")].filter((n) => (n as HTMLElement).innerText.trim() === "—").length,
            responsibleTotal: document.querySelectorAll("[data-financials-responsible]").length,
        };
    });
    // eslint-disable-next-line no-console
    console.log(`LEDGER_${TAG} ` + "" + JSON.stringify(ledger, null, 1));
    await shot(page, `p5i-${TAG}06-ledger-rows`);

    // ── 9 · PAYMENTS LENS ──────────────────────────────────────────────────────────────────────
    const payments = page.locator('[data-financials-lens="payments"]');
    if (await payments.count()) {
        await payments.click({ timeout: 20_000 });
        await page.waitForTimeout(4_000);
        const lens = await page.evaluate(() => {
            const rows = [...document.querySelectorAll("[data-financials-ledger-row]")].slice(0, 6).map((r) => ({
                h: Math.round(r.getBoundingClientRect().height),
                cells: [...r.children].map((c) => (c as HTMLElement).innerText.replace(/\s+/g, " ").trim()),
            }));
            return {
                ledgerRows: document.querySelectorAll("[data-financials-ledger-row]").length,
                heads: document.querySelectorAll(".alloy-os-billingdetail__row--head").length,
                headings: [...document.querySelectorAll(".alloy-os-billingdetail__row--head span")].map((s) => (s as HTMLElement).innerText.trim()),
                rows,
                bodyText: (document.querySelector("[data-financials-detail-scroll]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 400) ?? null,
            };
        });
        // eslint-disable-next-line no-console
        console.log(`PAYMENTS_LENS_${TAG} ` + "" + JSON.stringify(lens, null, 1));
        await shot(page, `p5i-${TAG}07-payments-lens`);
    }
});
