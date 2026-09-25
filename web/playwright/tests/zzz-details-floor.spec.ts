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
