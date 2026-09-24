/**
 * §7 DEPLOYED MEASUREMENT — after the coalescer landed.
 *
 * Counts requests at the FETCH BOUNDARY (issued), not at the response boundary, because the
 * claim under test is that two callers now issue one request. A response-side count cannot
 * distinguish "one caller" from "two callers sharing one promise" — the fetch wrapper can.
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/dup-deployed";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const all: Record<string, unknown>[] = [];

type Issued = { at: number; url: string; identicalInFlight: number; ms?: number; status?: number };

async function arm(page: Page) {
    await page.addInitScript(() => {
        const w = window as unknown as { __CARD_FETCHES__?: Issued[]; fetch: typeof fetch };
        w.__CARD_FETCHES__ = [];
        const original = w.fetch.bind(window);
        const inFlight = new Map<string, number>();
        w.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
            if (/financials\/card/.test(url)) {
                const started = performance.now();
                const entry = {
                    at: Math.round(started),
                    url: url.replace(/https?:\/\/[^/]+/, "").slice(0, 160),
                    identicalInFlight: inFlight.get(url) ?? 0,
                } as Issued;
                inFlight.set(url, (inFlight.get(url) ?? 0) + 1);
                w.__CARD_FETCHES__!.push(entry);
                return original(input as RequestInfo, init).then(
                    (res) => {
                        inFlight.set(url, Math.max(0, (inFlight.get(url) ?? 1) - 1));
                        entry.ms = Math.round(performance.now() - started);
                        entry.status = res.status;
                        return res;
                    },
                    (e) => { inFlight.set(url, Math.max(0, (inFlight.get(url) ?? 1) - 1)); throw e; },
                );
            }
            return original(input as RequestInfo, init);
        }) as typeof fetch;
    });
}

type ServerTiming = { url: string; ms: number; bytes: number; serverTiming: string | null };
function watchResponses(page: Page) {
    const seen: ServerTiming[] = [];
    page.on("response", async (r) => {
        const u = r.url().replace(/https:\/\/[^/]+/, "");
        if (!/financials\/card/.test(u)) return;
        const t = r.request().timing();
        let bytes = 0;
        try { bytes = (await r.body()).byteLength; } catch { /* streamed */ }
        seen.push({ url: u.slice(0, 160), ms: Math.round(t.responseEnd - t.startTime), bytes, serverTiming: r.headers()["server-timing"] ?? null });
    });
    return seen;
}

/** Everything from the Details click onward is the Financials-owned cost. */
async function openDetails(page: Page, host: "focus" | "accounts", pass: string, responses: ServerTiming[]) {
    await page.evaluate(() => { (window as unknown as { __CARD_FETCHES__: unknown[] }).__CARD_FETCHES__.length = 0; });
    responses.length = 0;
    const click = Date.now();
    if (host === "focus") {
        await page.locator("[data-financials-nav='details']").first().click({ timeout: 20_000 });
    } else {
        await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 20_000 });
    }
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 150_000 });
    const shellAt = Date.now() - click;
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-ledger-row]").length > 0, undefined, { timeout: 180_000 }).catch(() => undefined);
    const firstLedgerAt = Date.now() - click;
    let prev = -1, stable = 0, settledAt = firstLedgerAt;
    for (let i = 0; i < 40 && stable < 2; i++) {
        const n = await page.evaluate(() => document.querySelectorAll("[data-financials-ledger-row]").length);
        if (n === prev && n > 0) stable += 1; else { stable = 0; settledAt = Date.now() - click; }
        prev = n;
        await page.waitForTimeout(300);
    }
    const issued = await page.evaluate(() => (window as unknown as { __CARD_FETCHES__: Issued[] }).__CARD_FETCHES__);
    const r = {
        host, pass, shellAt, firstLedgerAt, settledAt, rows: prev,
        requestsPerDetailsOpen: issued.length,
        firstRequestMs: issued[0]?.ms ?? null,
        secondRequestMs: issued[1]?.ms ?? null,
        joinedCallers: issued.filter((i) => i.identicalInFlight > 0).length,
        issued,
        serverTiming: responses.map((x) => x.serverTiming),
        responseBytes: responses.map((x) => x.bytes),
    };
    log(`${host}/${pass} requests=${issued.length} first=${r.firstRequestMs}ms second=${r.secondRequestMs} shell=${shellAt}ms ledger=${firstLedgerAt}ms settled=${settledAt}ms rows=${prev}`);
    r.serverTiming.filter(Boolean).forEach((s) => log(`    server-timing: ${s}`));
    all.push(r);
    return r;
}

async function coldRun(page: Page, host: "focus" | "accounts", pass: string) {
    /* pass is used in the readiness log below. */
    await arm(page);
    const responses = watchResponses(page);
    const client = await page.context().newCDPSession(page);
    await client.send("Network.setCacheDisabled", { cacheDisabled: true });
    /*
     * A cold navigation occasionally lands with the panel not yet mounted. One re-navigation is
     * allowed and REPORTED, because a run that silently retried would hide a session that expired.
     */
    for (let attempt = 1; attempt <= 2; attempt++) {
        await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
        if (host === "accounts") {
            await page.waitForTimeout(13_000);
            await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 }).catch(() => undefined);
            await page.waitForTimeout(11_000);
            if (await page.locator("[data-workspace-section-tab='accounts']").count()) break;
        } else if (await page.locator("[data-financials-nav='details']").first().count()
            || await page.locator("[data-financials-nav='details']").first().waitFor({ timeout: 120_000 }).then(() => true, () => false)) {
            break;
        }
        log(`  ${host}/${pass}: entry surface not ready on attempt ${attempt} (url=${page.url()})`);
        if (attempt === 2) throw new Error(`entry surface never mounted for ${host}/${pass} at ${page.url()}`);
    }
    expect(page.url(), "the governed QA session is live").not.toContain("/login");
    await client.send("Network.setCacheDisabled", { cacheDisabled: false });
    return openDetails(page, host, pass, responses);
}

for (const n of [1, 2, 3, 4, 5]) {
    test(`focus cold ${n}`, async ({ page }) => { await coldRun(page, "focus", `cold-${n}`); });
}

test("focus warm x8", async ({ page }) => {
    await arm(page);
    const responses = watchResponses(page);
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-financials-nav='details']").first()).toHaveCount(1, { timeout: 150_000 });
    for (let i = 1; i <= 8; i++) {
        await openDetails(page, "focus", `warm-${i}`, responses);
        /* Return to the resting surface so the next opening is a real opening. */
        await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
        await expect(page.locator("[data-financials-nav='details']").first()).toHaveCount(1, { timeout: 150_000 });
    }
});

for (const n of [1, 2]) {
    test(`accounts cold ${n}`, async ({ page }) => { await coldRun(page, "accounts", `cold-${n}`); });
}

test("accounts warm x3", async ({ page }) => {
    await arm(page);
    const responses = watchResponses(page);
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(11_000);
    for (let i = 1; i <= 3; i++) {
        await openDetails(page, "accounts", `warm-${i}`, responses);
        await page.locator("[data-workspace-section-tab='overview']").first().click({ timeout: 20_000 }).catch(() => undefined);
        await page.waitForTimeout(2500);
    }
});

test("record", async () => {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/deployed.json`, JSON.stringify(all, null, 2));
    const focus = all.filter((r) => r.host === "focus");
    const worst = Math.max(...all.map((r) => r.requestsPerDetailsOpen as number));
    const med = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    log(`\n=== FINANCIALS_CARD_REQUESTS_PER_DETAILS_OPEN: max=${worst} across ${all.length} openings ===`);
    log(`focus firstLedger median=${med(focus.map((r) => r.firstLedgerAt as number))}ms min=${Math.min(...focus.map((r) => r.firstLedgerAt as number))}ms max=${Math.max(...focus.map((r) => r.firstLedgerAt as number))}ms`);
    expect(all.length).toBeGreaterThanOrEqual(18);
    expect(worst, "FINANCIALS_CARD_REQUESTS_PER_DETAILS_OPEN must be 1").toBe(1);
});
