/**
 * PASS 5K — THE MOUNTED PROOF.
 *
 * Five defects were reported together because they are one interaction system, so they are proven
 * together, in the order an operator meets them: the compact card, the click into Details, a row
 * command and its dismissal, and the Add selector's two modes. Each test records what the surface
 * actually did rather than asserting that a class name exists.
 */
import { expect, test, type Page } from "@playwright/test";
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
    await page.locator('[data-financials-card="true"]').first().waitFor({ state: "visible", timeout: MOUNTED });
    await page.waitForTimeout(9_000);
}

/** Every distinct committed state, sampled per animation frame. */
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
            const box = detail ?? (cards[0] as HTMLElement | undefined);
            const r = box?.getBoundingClientRect();
            const sig = [
                `surface=${host?.getAttribute("data-financials-overlay") ?? "compact"}`,
                `cards=${cards.length}`,
                `deepRead=${document.querySelector("[data-financials-ledger-hydrating]") ? "pending" : "resolved"}`,
                `hydrating=${document.querySelector("[data-financials-hydrating]") ? "true" : "false"}`,
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

const viewState = (p: Page) => p.evaluate(() => ({
    surface: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? "compact",
    lens: document.querySelector('[data-financials-lens][aria-pressed="true"]')?.getAttribute("data-financials-lens") ?? null,
    filters: [...document.querySelectorAll("[data-financials-filter][data-active]")].map((c) => c.getAttribute("data-financials-filter")).join(","),
    periods: [...document.querySelectorAll("[data-financials-period-toggle]")].map((t) => `${t.getAttribute("data-financials-period-toggle")}=${t.getAttribute("aria-expanded")}`).join(","),
    scroll: Math.round((document.querySelector("[data-financials-detail-scroll]") as HTMLElement | null)?.scrollTop ?? -1),
    rows: document.querySelectorAll("[data-financials-ledger-row]").length,
}));

const compactGeometry = (p: Page) => p.evaluate(() => {
    const fin = document.querySelector('[data-financials-card="true"]') as HTMLElement | null;
    const amount = document.querySelector(".alloy-os-billing__amount") as HTMLElement | null;
    const cmds = [...document.querySelectorAll(".alloy-os-billing__commands > *")].map((b) => {
        const r = b.getBoundingClientRect();
        return { label: (b as HTMLElement).innerText.trim(), x: Math.round(r.x), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) };
    });
    const host = (document.querySelector(".alloy-os-billing__commands")?.closest(".alloy-os-ucard") as HTMLElement | null)?.getBoundingClientRect();
    const dueClipped = amount ? amount.scrollWidth > Math.ceil(amount.getBoundingClientRect().width) + 1 : null;
    return {
        financialsHeight: fin ? Math.round(fin.getBoundingClientRect().height) : null,
        cards: [...document.querySelectorAll("[data-universal-card-key]")].map((n) => ({
            key: n.getAttribute("data-universal-card-key"), h: Math.round(n.getBoundingClientRect().height),
        })),
        dueFontSize: amount ? getComputedStyle(amount).fontSize : null,
        dueClipped,
        commands: cmds,
        cardRight: host ? Math.round(host.right) : null,
        commandsOverflow: host ? cmds.some((c) => c.right > Math.round(host.right) + 1) : null,
        bodyScrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
});

test("A · compact composition, at every supported width", async ({ page }) => {
    await openCard(page);
    for (const w of [1680, 1440, 1280, 1040]) {
        await page.setViewportSize({ width: w, height: 1000 });
        await page.waitForTimeout(2_500);
        const g = await compactGeometry(page);
        log(`COMPACT_${w} ` + JSON.stringify(g));
        await shot(page, `p5k-after-compact-${w}`);
        expect(g.commandsOverflow, `commands stay inside the card at ${w}`).toBe(false);
        expect(g.dueClipped, `Due is not clipped at ${w}`).toBe(false);
        expect(g.bodyScrollX, `no horizontal overflow at ${w}`).toBe(false);
    }
    await page.setViewportSize({ width: 1680, height: 1050 });
});

test("B · Details commits once, and commits complete", async ({ page }) => {
    await openCard(page);
    await armFilmstrip(page);
    await page.locator('[data-financials-nav="details"]').first().click({ timeout: 20_000 });
    await page.waitForTimeout(1_200);
    await shot(page, "p5k-after-details-first-frame");
    await page.waitForTimeout(26_000);
    await shot(page, "p5k-after-details-complete");
    const frames = await film(page);
    log("DETAILS_FILMSTRIP_AFTER\n" + frames.join("\n"));

    const detailFrames = frames.filter((f) => f.includes("surface=detail"));
    log("DETAILS_COMMITS " + detailFrames.length);
    /*
     * ONE committed Details state, and it is the final one. More than one distinct Details
     * signature means the operator watched it change after arriving — the defect itself.
     */
    expect(detailFrames.length, "exactly one visible Details commit").toBe(1);
    expect(detailFrames[0], "no skeleton").toContain("hydrating=false");
    expect(detailFrames[0], "its deep read was already resolved").toContain("deepRead=resolved");
    const rows = Number(/rows=(\d+)/.exec(detailFrames[0] ?? "")?.[1] ?? "0");
    const periods = Number(/periods=(\d+)/.exec(detailFrames[0] ?? "")?.[1] ?? "0");
    log(`FIRST_DETAILS_FRAME rows=${rows} periods=${periods}`);
    expect(rows, "the first Details frame carries the full ledger, not a 3-row cohort").toBeGreaterThan(10);
    expect(periods, "and its billing periods").toBeGreaterThan(1);
    log("VISIBLE_DETAILS_INTERMEDIATE_STATE " + (detailFrames.length > 1 ? "YES" : "NO"));
    log("PARTIAL_LEDGER_EVER_PRESENTED_AS_DETAILS " + (rows <= 10 || detailFrames.length > 1 ? "YES" : "NO"));
});

test("C · the stack returns to Details, exactly as it was", async ({ page }) => {
    test.setTimeout(600_000);
    await openCard(page);
    await page.locator('[data-financials-nav="details"]').first().click({ timeout: 20_000 });
    await page.locator('[data-financials-overlay="detail"]').waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(3_000);

    // A Details state worth losing: a lens, a closed period, a scrolled ledger.
    const lenses = await page.locator("[data-financials-lens]").all();
    if (lenses.length > 1) await lenses[1].click({ timeout: 15_000 }).catch(() => {});
    const tog = page.locator("[data-financials-period-toggle]").first();
    if (await tog.count()) await tog.click({ timeout: 15_000 }).catch(() => {});
    await page.evaluate(() => { const s = document.querySelector("[data-financials-detail-scroll]") as HTMLElement | null; if (s) s.scrollTop = 200; });
    await page.waitForTimeout(1_200);
    const anchor = await viewState(page);
    log("STACK_ANCHOR " + JSON.stringify(anchor));
    await shot(page, "p5k-after-stack-anchor");

    const dismissals = [
        ["cancel", async () => { await page.locator('[data-testid$="-cancel"]:visible').first().click({ timeout: 12_000 }); }],
        /*
         * OUTSIDE MEANS THE SCRIM, NOT THE SCREEN. The Focus Panel's depth layer owns dismissal and
         * publishes it through an armed backdrop; a click at the top-left of the viewport lands on
         * the app chrome, outside the panel, and correctly dismisses nothing. Clicking the scrim is
         * the gesture an operator actually makes, and its armed state is recorded so a backdrop
         * that is present but inert cannot pass as a dismissal.
         */
        /*
         * OUTSIDE MEANS A POINT ON THE SCRIM, NOT THE SCREEN AND NOT THE SCRIM'S CENTRE. A click at
         * the top-left of the viewport lands on the app chrome, outside the Focus Panel, and
         * correctly dismisses nothing. A forced click on the scrim ELEMENT is worse: Playwright
         * dispatches at its centre, which the elevated card covers, so the card receives it. The
         * gesture an operator makes is a click on visible backdrop beside the card, so that is what
         * this computes — and the scrim's armed state is recorded, because a backdrop that is
         * present but inert must not pass as a dismissal.
         */
        /*
         * OUTSIDE MEANS A POINT THAT ACTUALLY HITS THE BACKDROP.
         *
         * Three gestures were tried and two were wrong in instructive ways. A click at the viewport
         * corner lands on the app chrome, outside the Focus Panel, and correctly dismisses nothing.
         * A forced click on the scrim ELEMENT is dispatched at its centre, which the elevated card
         * covers, so the card receives it. And a computed offset works for one command's geometry
         * and lands on the next one's card.
         *
         * So the point is not computed and hoped for: candidates are tested with elementFromPoint
         * and the first that genuinely resolves to the scrim is clicked. A test that cannot say it
         * hit the backdrop cannot say the backdrop does not work.
         */
        /*
         * OUTSIDE MEANS A POINT THAT PROVABLY HITS THE BACKDROP.
         *
         * Four gestures were tried before this one held, and the failures were all the probe's:
         * a viewport-corner click lands on app chrome outside the panel; a forced click on the
         * scrim element is dispatched at its centre, which the elevated card covers; a computed
         * offset fits one command's geometry and lands on the next one's card; and reading the
         * scrim through a Playwright locator stalled indefinitely on one surface while a direct
         * DOM read showed the scrim present, armed and hit-testable the whole time.
         *
         * So the whole enquiry happens in one evaluate — no locator retry semantics — and it
         * returns what it found. The click is dispatched only at a point whose elementFromPoint IS
         * the scrim, and the target it resolved to is reported either way, because a test that
         * cannot say what it hit cannot say the backdrop is broken.
         */
        ["outside", async () => {
            const probe = await page.evaluate(() => {
                const el = document.querySelector('[data-fp-depth-scrim="true"]') as HTMLElement | null;
                if (!el) return { scrim: false as const };
                const b = el.getBoundingClientRect();
                const tried: string[] = [];
                for (const fx of [0.03, 0.5, 0.97]) {
                    for (const fy of [0.03, 0.3, 0.7, 0.97]) {
                        const x = Math.round(b.x + b.width * fx);
                        const y = Math.round(b.y + b.height * fy);
                        const hit = document.elementFromPoint(x, y);
                        if (hit === el) return { scrim: true as const, armed: el.getAttribute("data-fp-scrim-armed"), x, y, tried };
                        tried.push(`${x},${y}->${(hit as HTMLElement | null)?.className?.toString().slice(0, 28) ?? "null"}`);
                    }
                }
                return { scrim: true as const, armed: el.getAttribute("data-fp-scrim-armed"), x: null, y: null, tried };
            });
            log("SCRIM " + JSON.stringify(probe));
            if (!("x" in probe) || probe.x == null || probe.y == null) return;
            await page.mouse.click(probe.x, probe.y);
        }],
        ["escape", async () => { await page.keyboard.press("Escape"); }],
    ] as const;

    const results: Array<Record<string, unknown>> = [];
    for (const action of ["adjust", "reverse"] as const) {
        for (const [kind, dismiss] of dismissals) {
            const btn = page.locator(`[data-financials-row-action="${action}"]`).first();
            if (!(await btn.count())) { log(`STACK ${action}/${kind} NO_CONTROL`); continue; }
            await btn.click({ timeout: 15_000 }).catch(async () => {
                /* Bounded: a detached locator makes an unbounded evaluate wait for the whole test. */
                await btn.evaluate((e) => (e as HTMLElement).click(), undefined, { timeout: 8_000 }).catch(() => {});
            });
            await page.waitForTimeout(2_500);
            const opened = await viewState(page);
            if (kind === "cancel" && action === "reverse") await shot(page, "p5k-after-reverse-command");
            if (kind === "cancel" && action === "adjust") await shot(page, "p5k-after-adjust-command");
            await Promise.race([
                dismiss().catch(() => {}),
                page.waitForTimeout(20_000),
            ]);
            await page.waitForTimeout(2_500);
            const landed = await viewState(page);
            log(`STACK ${action}/${kind} opened=${opened.surface} landed=${JSON.stringify(landed)}`);
            results.push({
                path: `${action}/${kind}`,
                opened: opened.surface,
                returned: landed.surface === "detail",
                lensKept: landed.lens === anchor.lens,
                periodsKept: landed.periods === anchor.periods,
                filtersKept: landed.filters === anchor.filters,
                scroll: landed.scroll,
            });
            /*
             * Re-establish Details so one bad path cannot strand the rest of the matrix — the first
             * run of this proved the hazard: a stuck command surface made all three reverse paths
             * report NO_CONTROL, which reads like an absent feature rather than a stuck surface.
             */
            for (let attempt = 0; attempt < 3 && (await viewState(page)).surface !== "detail"; attempt += 1) {
                const anyCancel = page.locator('[data-testid$="-cancel"]:visible, button:has-text("Cancel"):visible').first();
                if (await anyCancel.count()) await anyCancel.click({ timeout: 8_000 }).catch(() => {});
                else await page.keyboard.press("Escape").catch(() => {});
                await page.waitForTimeout(1_500);
                if ((await viewState(page)).surface === "compact") {
                    const again = page.locator('[data-financials-nav="details"]').first();
                    if (await again.count()) { await again.click({ timeout: 10_000 }).catch(() => {}); await page.waitForTimeout(8_000); }
                }
            }
        }
    }
    log("STACK_MATRIX\n" + results.map((r) => JSON.stringify(r)).join("\n"));
    for (const r of results) {
        expect(r.returned, `${r.path} returns to Details`).toBe(true);
        expect(r.lensKept, `${r.path} keeps the lens`).toBe(true);
        expect(r.periodsKept, `${r.path} keeps the disclosures`).toBe(true);
        expect(r.filtersKept, `${r.path} keeps the filters`).toBe(true);
    }
});

test("D+E · the Reverse shell, and the Add modes", async ({ page }) => {
    await openCard(page);
    await page.locator('[data-financials-nav="details"]').first().click({ timeout: 20_000 });
    await page.locator('[data-financials-overlay="detail"]').waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(3_000);

    const rev = page.locator('[data-financials-row-action="reverse"]').first();
    if (await rev.count()) {
        await rev.click({ timeout: 15_000 }).catch(async () => { await rev.evaluate((e) => (e as HTMLElement).click()); });
        await page.waitForTimeout(2_500);
        log("REVERSE_SHELL " + JSON.stringify(await page.evaluate(() => {
            const host = document.querySelector('[data-financials-overlay="reverse_charge"]') as HTMLElement | null;
            const card = host?.querySelector(".alloy-os-ucard") as HTMLElement | null;
            const r = card?.getBoundingClientRect();
            const facts = [...(host?.querySelectorAll("[data-testid^='charge-reverse-']") ?? [])].map((n) => n.getAttribute("data-testid"));
            return {
                surface: host?.getAttribute("data-financials-overlay") ?? null,
                shell: host?.getAttribute("data-financials-command-shell") ?? null,
                usesMovePanel: host?.querySelector(".alloy-os-fdetail__movepanel") != null,
                facts,
                geom: r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}` : null,
                withinViewport: r ? r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1 : null,
            };
        })));
        await shot(page, "p5k-after-reverse-shell");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(2_000);
    } else { log("REVERSE_SHELL NO_REVERSIBLE_ROW"); }

    // ── THE PATH THAT PRODUCED THE EMPTY FRAME ────────────────────────────────────────────────
    const adjust = page.locator('[data-financials-row-action="adjust"]').first();
    if (await adjust.count()) {
        await adjust.click({ timeout: 15_000 }).catch(async () => { await adjust.evaluate((e) => (e as HTMLElement).click()); });
        await page.waitForTimeout(2_500);
        const cancel = page.locator('[data-testid="adjustment-cancel"]').first();
        if (await cancel.count()) { await cancel.click({ timeout: 12_000 }); await page.waitForTimeout(2_500); }
    }
    /*
     * Add is the COMPACT card's control, so the operator has to be back on the compact card to
     * reach it — the previous run looked for it while Details was still open and measured nothing.
     * This is also the exact journey §5 names: a row adjustment, cancelled, then Add.
     */
    for (let i = 0; i < 3 && (await page.locator("[data-financials-overlay]").count()) > 0; i += 1) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(1_800);
    }
    log("BACK_ON_COMPACT " + JSON.stringify(await viewState(page)));
    const add = page.locator('[data-financials-command="add"]').first();
    if (await add.count()) {
        await add.click({ timeout: 15_000 }).catch(async () => { await add.evaluate((e) => (e as HTMLElement).click()); });
        await page.waitForTimeout(2_500);
    }
    const modeState = async () => page.evaluate(() => {
        const host = document.querySelector("[data-financials-overlay]");
        const shell = document.querySelector("[data-universal-card-key='add_adjustment'], [data-universal-card-key='add_charge']");
        const modes = document.querySelectorAll("[data-financials-entry-mode-tab]").length;
        const fields = shell?.querySelectorAll("input, select, textarea").length ?? 0;
        const widths = [...document.querySelectorAll("[data-financials-entry-mode-tab]")].map((t) => Math.round(t.getBoundingClientRect().width));
        return {
            surface: host?.getAttribute("data-financials-overlay") ?? "compact",
            mode: host?.getAttribute("data-financials-entry-mode") ?? null,
            modeTabs: modes, fields, widths,
            emptyFrame: modes > 0 && fields === 0,
            text: ((shell as HTMLElement | null)?.innerText ?? "").replace(/\s+/g, " ").slice(0, 90),
        };
    });
    log("ADD_REOPENED " + JSON.stringify(await modeState()));
    const tab = page.locator('[data-financials-entry-mode-tab="adjustment"]').first();
    if (await tab.count()) {
        await tab.click({ timeout: 12_000 });
        await page.waitForTimeout(500);
        const first = await modeState();
        log("ADJUSTMENT_FIRST_FRAME " + JSON.stringify(first));
        await shot(page, "p5k-after-adjustment-first-frame");
        expect(first.emptyFrame, "the adjustment mode never commits without its body").toBe(false);
        log("EMPTY_ADJUSTMENT_FRAME_VISIBLE " + (first.emptyFrame ? "YES" : "NO"));
        expect(new Set(first.widths).size, "the two modes stay equal in width").toBe(1);
    }
});

test("F · keyboard reach and focus", async ({ page }) => {
    await openCard(page);
    await page.locator('[data-financials-nav="details"]').first().click({ timeout: 20_000 });
    await page.locator('[data-financials-overlay="detail"]').waitFor({ state: "visible", timeout: 120_000 });
    await page.waitForTimeout(3_000);
    log("A11Y " + JSON.stringify(await page.evaluate(() => {
        const focusable = (n: Element) => {
            const el = n as HTMLElement;
            el.focus();
            return document.activeElement === el;
        };
        const rowActions = [...document.querySelectorAll("[data-financials-row-action]")];
        const periodToggles = [...document.querySelectorAll("[data-financials-period-toggle]")];
        const lenses = [...document.querySelectorAll("[data-financials-lens]")];
        return {
            rowActions: rowActions.length,
            rowActionsFocusable: rowActions.filter(focusable).length,
            periodToggles: periodToggles.length,
            periodTogglesFocusable: periodToggles.filter(focusable).length,
            lenses: lenses.length,
            lensesFocusable: lenses.filter(focusable).length,
            rowActionsLabelled: rowActions.filter((n) => (n.getAttribute("aria-label") ?? "").length > 0).length,
        };
    })));
});
