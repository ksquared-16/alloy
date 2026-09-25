/**
 * WHAT THE SELECTED ACCOUNT ACTUALLY WAITS FOR.
 *
 * The account list is now interactive at ~856ms cold and the selected Details pane settles at
 * ~2,426ms. This measures the 1,570ms between them, per milestone, and records which network
 * answers each milestone actually waited on. Measurement only — nothing is repaired here.
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/details-floor";
const COLD = Number(process.env.COLD_N ?? 5);
const WARM = Number(process.env.WARM_N ?? 8);

test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(2_400_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const all: Record<string, unknown>[] = [];

async function reach(page: Page) {
    for (let attempt = 1; attempt <= 2; attempt++) {
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
        if (attempt === 2) throw new Error(`workspace never mounted at ${page.url()}`);
    }
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-account-row]").length > 1, undefined, { timeout: 180_000 });
    await page.waitForTimeout(3_000);
}

/** Select the nth account row and time every milestone from the click. */
async function selectAccount(page: Page, nth: number, kind: string, pass: string) {
    const net: Array<{ url: string; query: string; start: number; end: number; ms: number; bytes: number }> = [];
    const t0 = { t: Date.now() };
    const onResponse = async (r: import("@playwright/test").Response) => {
        const full = r.url().replace(/https:\/\/[^/]+/, "");
        const u = full.split("?")[0];
        if (!/^\/api\//.test(u)) return;
        let bytes = 0;
        try { bytes = (await r.body()).byteLength; } catch { /* streamed */ }
        /* responseEnd is already relative to startTime; subtracting the two is meaningless. */
        const ms = Math.round(r.request().timing().responseEnd);
        const end = Date.now() - t0.t;
        net.push({ url: u.slice(0, 90), query: (full.split("?")[1] ?? "").slice(0, 60), start: end - ms, end, ms, bytes });
    };
    page.on("response", onResponse);

    const rows = page.locator("[data-financials-account-row]");
    const target = await rows.nth(nth).getAttribute("data-financials-account-row");
    const click = Date.now();
    t0.t = click;
    const at = () => Date.now() - click;
    await rows.nth(nth).click({ timeout: 30_000 });

    const selectedRow = await page.waitForFunction(
        (id) => !!document.querySelector(`[data-financials-account-row="${id}"][data-financials-account-selected="true"]`),
        target, { timeout: 60_000 }).then(at).catch(() => null);

    /* FLOOR GEOMETRY — the Details surface exists at all. */
    const floorGeometry = await page.waitForFunction(
        () => !!document.querySelector("[data-financials-detail='true']"), undefined, { timeout: 180_000 }).then(at).catch(() => null);

    /* USABLE FLOOR — the regions an operator reads are all present. */
    const usableFloor = await page.waitForFunction(() => {
        const d = document.querySelector("[data-financials-detail='true']");
        if (!d) return false;
        return !!d.querySelector("[data-financials-lenses]") && !!d.querySelector("[data-financials-row-group], [data-financials-ledger-reading], [data-financials-ledger-empty], [data-financials-ledger-hydrating]");
    }, undefined, { timeout: 180_000 }).then(at).catch(() => null);

    /* FIRST FINANCIAL MEANING — any KPI showing a real figure rather than a placeholder. */
    const firstMeaning = await page.waitForFunction(() => {
        const t = document.querySelector("[data-financials-account-card]")?.textContent ?? "";
        return /\$\d/.test(t);
    }, undefined, { timeout: 180_000 }).then(at).catch(() => null);

    const ledger = await page.waitForFunction(
        () => document.querySelectorAll("[data-financials-ledger-row]").length > 0, undefined, { timeout: 180_000 }).then(at).catch(() => null);

    /*
     * SETTLED IS A STABLE COUNT, AND ZERO IS A COUNT. Requiring n > 0 made an account with no
     * ledger rows wait the full timeout — 190 seconds recorded as its "settled" time, which is a
     * measurement artefact and not a product fact. Stability is judged once the region has stopped
     * saying it is reading.
     */
    let prev = -1, stable = 0, settled: number | null = null;
    for (let i = 0; i < 40 && stable < 2; i++) {
        const n = await page.evaluate(() => {
            const reading = document.querySelector("[data-financials-ledger-reading], [data-financials-ledger-hydrating]");
            return reading ? -1 : document.querySelectorAll("[data-financials-ledger-row]").length;
        });
        if (n >= 0 && n === prev) stable += 1; else { stable = 0; settled = at(); }
        prev = n;
        await page.waitForTimeout(250);
    }
    page.off("response", onResponse);

    /*
     * §19/§20 — did the prewarm buy time, or only move the work?
     *
     * PREWARM_HEAD_START is how long the account's read had been in the air when the click landed.
     * A card request that starts before 0 was warmed; one starting after 0 was not.
     */
    const cardReqs = net.filter((n) => /financials\/card$/.test(n.url));
    const mine = cardReqs.filter((n) => n.query.includes(encodeURIComponent(target ?? "\u0000")) || n.query.includes(target ?? "\u0000"));
    const warmed = mine.find((n) => n.start < 0) ?? null;
    const row = { kind, pass, account: target, selectedRow, floorGeometry, usableFloor, firstMeaning, ledger, settled, rows: prev,
        prewarmHeadStart: warmed ? -warmed.start : 0,
        cardRequestStart: mine.length ? Math.min(...mine.map((n) => n.start)) : null,
        cardResponseAt: mine.length ? Math.max(...mine.map((n) => n.end)) : null,
        cardRequestsForThisAccount: mine.length,
        cardRequestsTotal: cardReqs.length,
        cardBytesTotal: cardReqs.reduce((a, n) => a + n.bytes, 0),
        unusedCardRequests: cardReqs.length - mine.length,
        unusedCardBytes: cardReqs.filter((n) => !mine.includes(n)).reduce((a, n) => a + n.bytes, 0),
        requests: cardReqs.slice(0, 12) };
    log(`   card reqs: mine=${mine.length} total=${cardReqs.length} headStart=${warmed ? -warmed.start : 0}ms unusedBytes=${row.unusedCardBytes}`);
    log(`${kind}/${pass} selected=${selectedRow} floor=${floorGeometry} usable=${usableFloor} meaning=${firstMeaning} ledger=${ledger} settled=${settled} rows=${prev}`);
    log(`   requests: ${net.filter((n) => /financ/i.test(n.url)).map((n) => `${n.url.split("/").pop()} start${n.start >= 0 ? "+" : ""}${n.start} end+${n.end}`).join(" ")}`);
    all.push(row);
    return row;
}

test("cold selections", async ({ browser }) => {
    for (let i = 0; i < COLD; i++) {
        const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 }, baseURL: "https://staging.workwithalloy.com" });
        const page = await ctx.newPage();
        try { await reach(page); await selectAccount(page, i % 4, "cold", `c${i + 1}`); }
        finally { await ctx.close(); }
    }
});

test("warm selections", async ({ page }) => {
    await reach(page);
    await selectAccount(page, 0, "warm", "prime");
    all.pop();
    for (let i = 0; i < WARM; i++) await selectAccount(page, (i % 5) + 1, "warm", `w${i + 1}`);
});

test("rapid A to B, and a prewarm nobody consumes", async ({ page }) => {
    await reach(page);
    const rows = page.locator("[data-financials-account-row]");

    /*
     * ── A PREWARM NOBODY CONSUMES ──────────────────────────────────────────────────────────────
     *
     * Hover one account, then select a DIFFERENT one. The first read is started and never used,
     * which is exactly the waste a read-ahead can quietly introduce. §20 asks what that costs, so
     * it is produced deliberately rather than hoped to be absent.
     */
    const wasted: Array<{ url: string; bytes: number }> = [];
    const onResponse = async (r: import("@playwright/test").Response) => {
        const u = r.url().replace(/https:\/\/[^/]+/, "");
        if (!/financials\/card\?/.test(u)) return;
        let bytes = 0;
        try { bytes = (await r.body()).byteLength; } catch { /* streamed */ }
        wasted.push({ url: u.slice(0, 80), bytes });
    };
    page.on("response", onResponse);

    const hoverTarget = await rows.nth(6).getAttribute("data-financials-account-row");
    await rows.nth(6).hover();
    await page.waitForTimeout(1_600);
    const clickTarget = await rows.nth(7).getAttribute("data-financials-account-row");
    await rows.nth(7).click({ timeout: 30_000 });
    await page.waitForTimeout(4_000);
    page.off("response", onResponse);

    const unconsumed = wasted.filter((w) => w.url.includes(encodeURIComponent(hoverTarget ?? "\u0000")) || w.url.includes(hoverTarget ?? "\u0000"));
    const unusedBytes = unconsumed.reduce((a, w) => a + w.bytes, 0);
    log(`UNCONSUMED PREWARM hovered=${hoverTarget?.slice(0, 8)} clicked=${clickTarget?.slice(0, 8)} reqs=${unconsumed.length} bytes=${unusedBytes} totalCardReqs=${wasted.length}`);
    all.push({ kind: "waste", pass: "unconsumed", hovered: hoverTarget, clicked: clickTarget, unconsumedRequests: unconsumed.length, unconsumedBytes: unusedBytes, totalCardRequests: wasted.length });

    /*
     * ── RAPID A TO B ───────────────────────────────────────────────────────────────────────────
     *
     * Two selections with no pause between them. B must be what settles, and A's answer - which is
     * still in the air - must not appear under it.
     */
    const aId = await rows.nth(0).getAttribute("data-financials-account-row");
    const bId = await rows.nth(3).getAttribute("data-financials-account-row");
    await rows.nth(0).click({ timeout: 30_000 });
    await page.waitForTimeout(120);
    const clickB = Date.now();
    await rows.nth(3).click({ timeout: 30_000 });
    const frames: Array<{ at: number; selected: string | null; floorAccount: string | null }> = [];
    for (const d of [150, 300, 600, 1200, 2500, 4000]) {
        await page.waitForTimeout(d - (frames.length ? [150, 300, 600, 1200, 2500, 4000][frames.length - 1] : 0));
        frames.push(await page.evaluate(() => ({
            at: 0,
            selected: document.querySelector("[data-financials-account-row][data-financials-account-selected='true']")?.getAttribute("data-financials-account-row") ?? null,
            floorAccount: document.querySelector("[data-financials-detail='true']")?.closest("[data-financials-detail-account]")?.getAttribute("data-financials-detail-account")
                ?? document.querySelector("[data-financials-detail-account]")?.getAttribute("data-financials-detail-account") ?? null,
        })).then((f) => ({ ...f, at: Date.now() - clickB })));
    }
    log(`RAPID A->B  A=${aId?.slice(0, 8)} B=${bId?.slice(0, 8)}`);
    for (const f of frames) {
        const underA = f.floorAccount === aId && f.selected === bId;
        log(`   +${f.at}ms selected=${f.selected?.slice(0, 8)} floorFor=${f.floorAccount?.slice(0, 8)}${underA ? "  <<< A TRUTH UNDER B" : ""}`);
        expect(underA, "A's floor may never appear under B").toBe(false);
        if (f.selected) expect(f.selected, "B is the selection B's click made").toBe(bId);
    }
    all.push({ kind: "rapid", pass: "a-to-b", a: aId, b: bId, frames });
});

test("record", async () => {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/floor-sample.json`, JSON.stringify(all, null, 2));
    const p50 = (xs: number[]) => { const s = xs.filter((n) => typeof n === "number").sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
    for (const kind of ["cold", "warm"]) {
        const S = all.filter((a) => a.kind === kind) as Array<Record<string, number>>;
        if (!S.length) continue;
        log(`\n${kind.toUpperCase()} n=${S.length}  selected=${p50(S.map((s) => s.selectedRow))}  floor=${p50(S.map((s) => s.floorGeometry))}  USABLE=${p50(S.map((s) => s.usableFloor))}  meaning=${p50(S.map((s) => s.firstMeaning))}  ledger=${p50(S.map((s) => s.ledger))}  settled=${p50(S.map((s) => s.settled))}`);
    }
    expect(all.length).toBeGreaterThanOrEqual(COLD + WARM);
});
