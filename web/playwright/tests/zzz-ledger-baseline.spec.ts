/** BASELINE — decompose the Details ledger wait. Measure only; nothing is optimized here. */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/ledger-perf";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const all: Record<string, unknown>[] = [];

type Net = { url: string; status: number; ms: number; bytes: number; serverTiming: string | null; startedAt: number };

async function instrument(page: Page, t0ref: { t: number }) {
    const net: Net[] = [];
    page.on("response", async (r) => {
        const u = r.url().replace(/https:\/\/[^/]+/, "");
        if (!/^\/api\//.test(u)) return;
        const req = r.request();
        const timing = req.timing();
        let bytes = 0;
        try { bytes = (await r.body()).byteLength; } catch { /* streamed */ }
        net.push({
            url: u.slice(0, 120),
            status: r.status(),
            ms: Math.round(timing.responseEnd - timing.startTime),
            bytes,
            serverTiming: r.headers()["server-timing"] ?? null,
            startedAt: Math.round(Date.now() - t0ref.t),
        });
    });
    return net;
}

async function measureDetails(page: Page, host: "focus" | "accounts", pass: string) {
    const t0ref = { t: Date.now() };
    const net = await instrument(page, t0ref);
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    if (host === "focus") {
        await expect(page.locator("[data-financials-nav='details']").first()).toHaveCount(1, { timeout: 150_000 });
    } else {
        await page.waitForTimeout(13_000);
        await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
        await page.waitForTimeout(11_000);
    }
    /* THE CLICK — everything from here is the Financials-owned cost. */
    net.length = 0;
    t0ref.t = Date.now();
    const click = Date.now();
    if (host === "focus") {
        await page.locator("[data-financials-nav='details']").first().click({ timeout: 20_000 });
    } else {
        await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 20_000 });
    }
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 150_000 });
    const shellAt = Date.now() - click;
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-ledger-row]").length > 0, undefined, { timeout: 180_000 }).catch(() => undefined);
    const firstRowsAt = Date.now() - click;
    /* Settled: the row count stops changing for two consecutive samples. */
    let prev = -1, stable = 0, settledAt = firstRowsAt;
    for (let i = 0; i < 40 && stable < 2; i++) {
        const n = await page.evaluate(() => document.querySelectorAll("[data-financials-ledger-row]").length);
        if (n === prev && n > 0) stable += 1; else { stable = 0; settledAt = Date.now() - click; }
        prev = n;
        await page.waitForTimeout(300);
    }
    const rows = prev;
    const cardReqs = net.filter((n) => /financials\/card/.test(n.url));
    const r = {
        host, pass, shellAt, firstRowsAt, settledAt, rows,
        apiRequestCount: net.length,
        financialsRequests: net.filter((n) => /financ/i.test(n.url)).length,
        slowest: [...net].sort((a, b) => b.ms - a.ms).slice(0, 6).map((n) => `${n.ms}ms ${n.bytes}B ${n.url}`),
        cardRequest: cardReqs.map((n) => ({ ms: n.ms, bytes: n.bytes, startedAt: n.startedAt, serverTiming: n.serverTiming, url: n.url })),
        allRequests: net.map((n) => ({ ms: n.ms, bytes: n.bytes, at: n.startedAt, url: n.url })),
    };
    log(`${host}/${pass} shell=${shellAt}ms firstRows=${firstRowsAt}ms settled=${settledAt}ms rows=${rows} apiReqs=${net.length}`);
    log(`  card: ${JSON.stringify(r.cardRequest)}`);
    log(`  slowest: ${JSON.stringify(r.slowest)}`);
    all.push(r);
    return r;
}

test("focus cold", async ({ page }) => { await measureDetails(page, "focus", "cold"); });
test("focus cold 2", async ({ page }) => { await measureDetails(page, "focus", "cold-2"); });
test("focus warm 1", async ({ page }) => { await measureDetails(page, "focus", "warm-1"); });
test("focus warm 2", async ({ page }) => { await measureDetails(page, "focus", "warm-2"); });
test("focus warm 3", async ({ page }) => { await measureDetails(page, "focus", "warm-3"); });
test("focus warm 4", async ({ page }) => { await measureDetails(page, "focus", "warm-4"); });
test("accounts warm 2", async ({ page }) => { await measureDetails(page, "accounts", "warm-2"); });
test("accounts warm", async ({ page }) => { await measureDetails(page, "accounts", "warm"); });
test("record", async () => {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/after.json`, JSON.stringify(all, null, 2));
    log(`BASELINE RECORDED (${all.length} runs)`);
    expect(all.length).toBeGreaterThanOrEqual(7);
});
