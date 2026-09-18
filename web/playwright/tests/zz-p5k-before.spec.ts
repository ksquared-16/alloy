/**
 * PASS 5K — THE BEFORE MEASUREMENT.
 *
 * Taken against the fixed-candidate runtime at 2fb7f6571 BEFORE any 5K edit, because once the
 * candidate is rebuilt the "before" half of every required report is gone. Five defects, measured
 * where Kelly saw them:
 *
 *   A  compact composition — card height beside its neighbour, the Due type size, command geometry
 *   B  the Details commit sequence — every distinct committed state from the click onward
 *   C  the navigation stack — six dismissal paths and where each actually lands
 *   E  Add → Adjustment — whether an empty command body is ever committed
 *
 * Nothing here asserts. A before-measurement that fails stops measuring, and the point is the
 * record, not a verdict.
 */
import { test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = "http://127.0.0.1:3012";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const OUT = "../certification/financials";
const MOUNTED = 180_000;

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(900_000);

const log = (s: string) => console.log(s); // eslint-disable-line no-console
const shot = async (p: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: `${OUT}/${n}.png` }); };

async function openCard(page: Page) {
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    const card = page.locator('[data-financials-card="true"]').first();
    await card.waitFor({ state: "visible", timeout: MOUNTED });
    await page.waitForTimeout(9_000);
    return card;
}

/**
 * EVERY DISTINCT COMMITTED STATE, not a sample. A skeleton that lives 200ms is invisible to a
 * screenshot and obvious to a signature taken every frame, which is the whole disagreement this
 * pass has to settle.
 */
async function armFilmstrip(page: Page) {
    await page.evaluate(() => {
        const w = window as unknown as { __film?: string[] };
        w.__film = [];
        const t0 = performance.now();
        let last = "";
        const tick = () => {
            const host = document.querySelector("[data-financials-overlay]");
            const cards = document.querySelectorAll('[data-financials-card="true"]');
            const detail = document.querySelector('[data-financials-overlay="detail"]') as HTMLElement | null;
            const box = (detail ?? (cards[0] as HTMLElement | undefined));
            const r = box?.getBoundingClientRect();
            const sig = [
                `surface=${host?.getAttribute("data-financials-overlay") ?? "compact"}`,
                `cards=${cards.length}`,
                `hydrating=${document.querySelector("[data-financials-hydrating]") ? "true" : "false"}`,
                `ledgerPending=${document.querySelectorAll("[data-financials-ledger-hydrating]").length > 0}`,
                `rows=${document.querySelectorAll("[data-financials-ledger-row]").length}`,
                `periods=${document.querySelectorAll("[data-financials-ledger-period]").length}`,
                `lenses=${document.querySelectorAll("[data-financials-lens]").length}`,
                `opacity=${box ? getComputedStyle(box).opacity : "-"}`,
                `geom=${r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}` : "-"}`,
            ].join(" ");
            if (sig !== last) { last = sig; w.__film!.push(`+${Math.round(performance.now() - t0)}ms ${sig}`); }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}
const film = (p: Page) => p.evaluate(() => (window as unknown as { __film: string[] }).__film ?? []);

/** The Details state that must survive a command round trip. */
const viewState = (p: Page) => p.evaluate(() => ({
    surface: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? "compact",
    lens: document.querySelector('[data-financials-lens][aria-pressed="true"]')?.getAttribute("data-financials-lens") ?? null,
    filters: [...document.querySelectorAll("[data-financials-filter][data-active]")].map((c) => c.getAttribute("data-financials-filter")).join(","),
    periods: [...document.querySelectorAll("[data-financials-period-toggle]")].map((t) => `${t.getAttribute("data-financials-period-toggle")}=${t.getAttribute("aria-expanded")}`).join(","),
    scroll: Math.round((document.querySelector("[data-financials-detail-scroll]") as HTMLElement | null)?.scrollTop ?? -1),
    rows: document.querySelectorAll("[data-financials-ledger-row]").length,
}));

test("A · compact composition and command containment", async ({ page }) => {
    const card = await openCard(page);
    for (const w of [1680, 1440, 1280, 1040]) {
        await page.setViewportSize({ width: w, height: 1000 });
        await page.waitForTimeout(2_500);
        log(`COMPACT_${w} ` + JSON.stringify(await page.evaluate(() => {
            const fin = document.querySelector('[data-financials-card="true"]') as HTMLElement | null;
            const finCard = fin?.closest("[data-fp-grid-area]") as HTMLElement | null;
            const neighbours = [...document.querySelectorAll("[data-universal-card-key]")].map((n) => ({
                key: n.getAttribute("data-universal-card-key"),
                h: Math.round(n.getBoundingClientRect().height),
            }));
            const amount = document.querySelector(".alloy-os-billing__amount") as HTMLElement | null;
            const cmds = [...document.querySelectorAll(".alloy-os-billing__commands > *")].map((b) => {
                const r = b.getBoundingClientRect();
                return { label: (b as HTMLElement).innerText.trim(), x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) };
            });
            const host = (document.querySelector(".alloy-os-billing__commands")?.closest(".alloy-os-ucard") as HTMLElement | null)?.getBoundingClientRect();
            return {
                financialsHeight: fin ? Math.round(fin.getBoundingClientRect().height) : null,
                financialsAreaHeight: finCard ? Math.round(finCard.getBoundingClientRect().height) : null,
                cards: neighbours,
                dueFontSize: amount ? getComputedStyle(amount).fontSize : null,
                dueLineHeight: amount ? getComputedStyle(amount).lineHeight : null,
                commands: cmds,
                cardRight: host ? Math.round(host.right) : null,
                commandsOverflow: host ? cmds.some((c) => c.right > Math.round(host.right) + 1) : null,
                bodyScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            };
        })));
        await shot(page, `p5k-before-compact-${w}`);
    }
    await page.setViewportSize({ width: 1680, height: 1050 });
    await page.waitForTimeout(1_500);
    void card;
});

test("B · the Details commit sequence", async ({ page }) => {
    const card = await openCard(page);
    await armFilmstrip(page);
    await card.getByRole("button", { name: /^Details$/ }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(1_000);
    await shot(page, "p5k-before-details-first-frame");
    await page.waitForTimeout(24_000);
    await shot(page, "p5k-before-details-complete");
    log("DETAILS_FILMSTRIP_BEFORE\n" + (await film(page)).join("\n"));
});

test("C · the navigation stack, six dismissals", async ({ page }) => {
    const card = await openCard(page);
    await card.getByRole("button", { name: /^Details$/ }).first().click({ timeout: 20_000 });
    await page.locator('[data-financials-overlay="detail"]').waitFor({ state: "visible", timeout: 60_000 });
    await page.waitForTimeout(20_000);

    // Put the Details view into a state worth losing.
    const lenses = await page.locator("[data-financials-lens]").all();
    if (lenses.length > 1) await lenses[1].click({ timeout: 15_000 }).catch(() => {});
    const tog = page.locator("[data-financials-period-toggle]").first();
    if (await tog.count()) await tog.click({ timeout: 15_000 }).catch(() => {});
    await page.evaluate(() => { const s = document.querySelector("[data-financials-detail-scroll]") as HTMLElement | null; if (s) s.scrollTop = 220; });
    await page.waitForTimeout(1_200);
    const anchor = await viewState(page);
    log("STACK_ANCHOR " + JSON.stringify(anchor));

    for (const [kind, dismiss] of [
        ["cancel", async () => { await page.getByRole("button", { name: /^Cancel$/ }).first().click({ timeout: 10_000 }); }],
        ["outside", async () => { await page.mouse.click(8, 8); }],
        ["escape", async () => { await page.keyboard.press("Escape"); }],
    ] as const) {
        for (const action of ["adjust", "reverse"] as const) {
            const btn = page.locator(`[data-financials-row-action="${action}"], [data-financials-row-command="charge.${action}"]`).first();
            if (!(await btn.count())) { log(`STACK ${action}/${kind} NO_CONTROL`); continue; }
            await btn.click({ timeout: 15_000 }).catch(async () => { await btn.evaluate((e) => (e as HTMLElement).click()); });
            await page.waitForTimeout(3_000);
            const opened = await viewState(page);
            await dismiss().catch(() => {});
            await page.waitForTimeout(3_000);
            const landed = await viewState(page);
            log(`STACK ${action}/${kind} opened=${JSON.stringify(opened)} landed=${JSON.stringify(landed)}`);
            await shot(page, `p5k-before-stack-${action}-${kind}`);
            // Re-establish Details if the dismissal dropped us elsewhere.
            if (landed.surface !== "detail") {
                const again = page.locator('[data-financials-nav="details"]').first();
                if (await again.count()) { await again.click({ timeout: 10_000 }).catch(() => {}); await page.waitForTimeout(18_000); }
            }
        }
    }
});

test("D+E · Reverse surface and the Add mode switch", async ({ page }) => {
    const card = await openCard(page);
    await card.getByRole("button", { name: /^Details$/ }).first().click({ timeout: 20_000 });
    await page.locator('[data-financials-overlay="detail"]').waitFor({ state: "visible", timeout: 60_000 });
    await page.waitForTimeout(20_000);
    const rev = page.locator('[data-financials-row-action="reverse"], [data-financials-row-command="charge.reverse"]').first();
    if (await rev.count()) {
        await rev.click({ timeout: 15_000 }).catch(async () => { await rev.evaluate((e) => (e as HTMLElement).click()); });
        await page.waitForTimeout(3_500);
        log("REVERSE_SURFACE_BEFORE " + JSON.stringify(await page.evaluate(() => {
            const panels = [...document.querySelectorAll('[class*="reversepanel"], [class*="__movepanel"], [data-testid*="reverse"], [data-financials-command-shell]')].map((n) => {
                const r = n.getBoundingClientRect();
                return { cls: (n as HTMLElement).className.toString().slice(0, 70), x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) };
            });
            return { panels, overlay: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null };
        })));
        await shot(page, "p5k-before-reverse-surface");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(2_000);
    } else { log("REVERSE_SURFACE_BEFORE NO_REVERSIBLE_ROW"); }

    // ── ADD → ADJUSTMENT ───────────────────────────────────────────────────────────────────────
    await page.keyboard.press("Escape");
    await page.waitForTimeout(2_000);
    const addBtn = page.locator('[data-financials-command="add"]').first();
    if (await addBtn.count()) {
        await addBtn.click({ timeout: 15_000 });
        await page.locator('[data-financials-overlay="add_charge"]').waitFor({ state: "visible", timeout: 60_000 });
        await page.waitForTimeout(2_500);
        await armFilmstrip(page);
        await page.locator('[data-financials-entry-mode-tab="adjustment"]').click({ timeout: 15_000 });
        await page.waitForTimeout(600);
        log("ADJUSTMENT_FIRST_FRAME " + JSON.stringify(await page.evaluate(() => {
            const host = document.querySelector('[data-financials-overlay="add_charge"]') as HTMLElement | null;
            const fields = host?.querySelectorAll("input, select, textarea").length ?? 0;
            return { fields, bodyText: (host?.innerText ?? "").replace(/\s+/g, " ").slice(0, 200), height: host ? Math.round(host.getBoundingClientRect().height) : null };
        })));
        await shot(page, "p5k-before-adjustment-first-frame");
        await page.waitForTimeout(6_000);
        log("ADJUSTMENT_SETTLED " + JSON.stringify(await page.evaluate(() => {
            const host = document.querySelector('[data-financials-overlay="add_charge"]') as HTMLElement | null;
            return { fields: host?.querySelectorAll("input, select, textarea").length ?? 0, height: host ? Math.round(host.getBoundingClientRect().height) : null };
        })));
        log("ADJUSTMENT_FILMSTRIP\n" + (await film(page)).join("\n"));
        await shot(page, "p5k-before-adjustment-settled");
    } else { log("ADD_MODE_SWITCH NO_ADD_CONTROL"); }
});
