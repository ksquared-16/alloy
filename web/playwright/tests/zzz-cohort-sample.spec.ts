/**
 * THE MOUNTED SAMPLE — cold n>=5, warm n>=8, both parallel routes decomposed.
 *
 * This is the measurement the instrumentation was promoted for. It replaces a performance guess
 * with evidence, so it reports what it saw and asserts almost nothing: a gate that fails here would
 * only tempt a reader to treat a bad sample as a bad product.
 *
 * Two rules it exists to honour:
 *   - Never sum parallel durations. Subjects and position are fetched concurrently, so the list's
 *     wait is max(), and each route's phases are read as COMPLETION OFFSETS, not deltas.
 *   - Never collapse a compound phase back into one timer.
 */
import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/accounts-shell";
const ENTRY = "/workspace/work-unit/enrolled-children";
const COLD = 5;
const WARM = 8;

test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(2_400_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

/*
 * `startedAt` is not optional detail. A route's wire time says what the SERVER spent; it cannot say
 * when the browser got round to asking. If click -> interactive is far larger than max(branch),
 * the missing time is either request initiation or client render, and only the start offset tells
 * those apart. Without it a slow mount reads as a slow query.
 */
type RouteSample = { url: string; startedAt: number; endedAt: number; ms: number; bytes: number; phases: Record<string, number>; offsets: Record<string, number> };
type Opening = {
    pass: string;
    kind: "cold" | "warm";
    click: number;
    acknowledgement: number | null;
    geometry: number | null;
    listVisible: number | null;
    listInteractive: number | null;
    selectedAccount: number | null;
    settled: number | null;
    rows: number;
    routes: RouteSample[];
};
const all: Opening[] = [];

/** `name;dur=12.3, name_at;dur=45.6` -> deltas and completion offsets, kept apart. */
function parseServerTiming(header: string) {
    const phases: Record<string, number> = {};
    const offsets: Record<string, number> = {};
    for (const part of header.split(",")) {
        const m = part.trim().match(/^([^;]+);dur=([0-9.]+)/);
        if (!m) continue;
        const [, rawName, rawMs] = m;
        const ms = Number(rawMs);
        if (rawName.endsWith("_at")) offsets[rawName.slice(0, -3)] = ms;
        else phases[rawName] = ms;
    }
    return { phases, offsets };
}

/*
 * Returns the collector AND its detach. The warm pass opens Accounts nine times on one page, so a
 * listener left attached each round would accumulate past Node's max-listener warning and keep
 * appending to an array whose opening has already been recorded.
 */
function watch(page: Page, clickAt: () => number) {
    const routes: RouteSample[] = [];
    const onResponse = async (r: import("@playwright/test").Response) => {
        const u = r.url().replace(/https:\/\/[^/]+/, "").split("?")[0];
        if (!/financials\/(subjects|position)$/.test(u)) return;
        let bytes = 0;
        try { bytes = (await r.body()).byteLength; } catch { /* streamed */ }
        const t = r.request().timing();
        const header = r.headers()["server-timing"] ?? "";
        const endedAt = Date.now() - clickAt();
        /*
         * Playwright's ResourceTiming.startTime is a WALL-CLOCK epoch value; every other field,
         * responseEnd included, is already relative to it. Subtracting one from the other yields a
         * number near -1.79e12, which is how the first baseline run reported its wire times.
         */
        const ms = Math.round(t.responseEnd);
        routes.push({ url: u, startedAt: endedAt - ms, endedAt, ms, bytes, ...parseServerTiming(header) });
    };
    page.on("response", onResponse);
    return { routes, detach: () => page.off("response", onResponse) };
}

async function reachFinancials(page: Page) {
    for (let attempt = 1; attempt <= 2; attempt++) {
        await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
        log(`  workspace nav not ready on attempt ${attempt} (url=${page.url()})`);
        if (attempt === 2) throw new Error(`workspace nav never mounted at ${page.url()}`);
    }
    await page.waitForTimeout(11_000);
}

async function openAccounts(page: Page, pass: string, kind: "cold" | "warm"): Promise<Opening> {
    let clickTs = Date.now();
    const { routes, detach } = watch(page, () => clickTs);

    const tab = page.locator("[data-workspace-section-tab='accounts']").first();
    const click = Date.now();
    clickTs = click;
    const at = () => Date.now() - click;
    await tab.click({ timeout: 30_000 });
    const acknowledgement = at();

    const geometry = await page
        .waitForFunction(() => !!document.querySelector("[data-financials-section='accounts'], [data-financials-accounts], [data-financials-detail='true']"), undefined, { timeout: 120_000 })
        .then(at).catch(() => null);

    /* VISIBLE: rows exist. */
    const listVisible = await page
        .waitForFunction(() => document.querySelectorAll("[data-financials-account-row], [data-financials-account-option]").length > 0, undefined, { timeout: 180_000 })
        .then(at).catch(() => null);

    /*
     * INTERACTIVE is not the same thing, and the difference is the point of the target. A row that
     * is present but disabled, aria-busy, or still empty of text is not one an operator can choose.
     */
    const listInteractive = await page
        .waitForFunction(() => {
            const rows = [...document.querySelectorAll<HTMLElement>("[data-financials-account-row], [data-financials-account-option]")];
            if (rows.length === 0) return false;
            const first = rows[0];
            if (first.getAttribute("aria-disabled") === "true" || first.hasAttribute("disabled")) return false;
            if (first.closest("[aria-busy='true']")) return false;
            return (first.innerText ?? "").trim().length > 0;
        }, undefined, { timeout: 180_000 })
        .then(at).catch(() => null);

    const selectedAccount = await page
        .waitForFunction(() => !!document.querySelector("[data-financials-detail='true']"), undefined, { timeout: 180_000 })
        .then(at).catch(() => null);

    /* Settled: the ledger row count stops changing for two consecutive samples. */
    let prev = -1, stable = 0, settled: number | null = null;
    for (let i = 0; i < 40 && stable < 2; i++) {
        const n = await page.evaluate(() => document.querySelectorAll("[data-financials-ledger-row]").length);
        if (n === prev && n > 0) stable += 1; else { stable = 0; settled = at(); }
        prev = n;
        await page.waitForTimeout(300);
    }

    await page.waitForTimeout(1_500);
    detach();
    const o: Opening = { pass, kind, click: 0, acknowledgement, geometry, listVisible, listInteractive, selectedAccount, settled, rows: prev, routes: [...routes] };
    log(`${kind}/${pass} ack=${acknowledgement} geom=${geometry} visible=${listVisible} INTERACTIVE=${listInteractive} selected=${selectedAccount} settled=${settled} rows=${prev}`);
    for (const r of o.routes) {
        const off = Object.entries(r.offsets).sort((a, b) => a[1] - b[1]).map(([k, v]) => `${k}@${v.toFixed(0)}`).join(" ");
        log(`    ${r.url} start+${r.startedAt} end+${r.endedAt} (${r.ms}ms wire, ${r.bytes}B) :: ${off}`);
    }
    all.push(o);
    return o;
}

for (let i = 1; i <= COLD; i++) {
    test(`cold ${i}`, async ({ browser }) => {
        /* A genuinely cold opening: its own context, its own cache, its own service worker scope. */
        const ctx: BrowserContext = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 }, baseURL: "https://staging.workwithalloy.com" });
        const page = await ctx.newPage();
        try {
            await reachFinancials(page);
            await openAccounts(page, `c${i}`, "cold");
        } finally { await ctx.close(); }
    });
}

test(`warm x${WARM}`, async ({ page }) => {
    await reachFinancials(page);
    await openAccounts(page, "warmup", "warm");
    all.pop(); /* the first opening in a fresh page is not warm; it primes it */
    for (let i = 1; i <= WARM; i++) {
        await page.locator("[data-workspace-section-tab='overview']").first().click({ timeout: 30_000 }).catch(() => undefined);
        await page.waitForTimeout(2_500);
        await openAccounts(page, `w${i}`, "warm");
    }
});

test("record", async () => {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/mounted-sample.json`, JSON.stringify(all, null, 2));
    const p50 = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN; };
    for (const kind of ["cold", "warm"] as const) {
        const set = all.filter((a) => a.kind === kind);
        const inter = set.map((a) => a.listInteractive).filter((n): n is number => typeof n === "number");
        log(`\n${kind.toUpperCase()} n=${set.length}  interactive P50=${p50(inter)}ms  [${[...inter].sort((a, b) => a - b).join(", ")}]`);
    }
    log(`\nRECORDED ${all.length} openings -> ${OUT}/mounted-sample.json`);
    expect(all.length).toBeGreaterThanOrEqual(COLD + WARM);
});
