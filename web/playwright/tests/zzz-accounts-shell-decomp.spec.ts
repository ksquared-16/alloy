/**
 * §3/§4/§7 — the Accounts opening, decomposed. "Shell" is not one event.
 *
 * Measures the click through to a usable shell, marking each boundary separately, and censuses
 * every request issued in the window with whether the shell actually waited on it.
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/accounts-shell";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const all: Record<string, unknown>[] = [];

type Req = { url: string; startedAt: number; endedAt: number; bytes: number; status: number };

async function openAccounts(page: Page, pass: string) {
    const reqs: Req[] = [];
    let t0 = Date.now();
    page.on("response", async (r) => {
        const u = r.url().replace(/https:\/\/[^/]+/, "");
        if (!/^\/api\//.test(u)) return;
        let bytes = 0;
        try { bytes = (await r.body()).byteLength; } catch { /* streamed */ }
        reqs.push({ url: u.slice(0, 110), startedAt: Math.round(r.request().timing().startTime), endedAt: Date.now() - t0, bytes, status: r.status() });
    });

    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(11_000);

    /* THE CLICK. Everything from here is the Accounts host's cost. */
    reqs.length = 0;
    t0 = Date.now();
    const at = () => Date.now() - t0;
    const marks: Record<string, number | null> = {};
    const tab = page.locator("[data-workspace-section-tab='accounts']").first();
    await tab.click({ timeout: 20_000 });
    marks.acknowledgement = at();

    /* First DOM geometry for the Accounts pane — anything the host paints. */
    marks.firstGeometry = await page.evaluate(async () => {
        const start = performance.now();
        const seen = () => document.querySelector("[data-financials-section='accounts'], [data-financials-accounts], [data-financials-detail='true']");
        if (seen()) return Math.round(performance.now() - start);
        return await new Promise<number>((res) => {
            const obs = new MutationObserver(() => { if (seen()) { obs.disconnect(); res(Math.round(performance.now() - start)); } });
            obs.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => { obs.disconnect(); res(-1); }, 30_000);
        });
    }).then((d) => (d >= 0 ? at() : null));

    /* An interactive account list: rows the operator can choose from. */
    marks.interactiveList = await page
        .waitForFunction(() => document.querySelectorAll("[data-financials-account-row], [data-financials-account-option]").length > 0, undefined, { timeout: 60_000 })
        .then(() => at(), () => null);

    /* The selected account is established — the Details floor names one. */
    marks.selectedAccount = await page
        .waitForFunction(() => !!document.querySelector("[data-financials-detail='true']"), undefined, { timeout: 60_000 })
        .then(() => at(), () => null);
    marks.usableShell = marks.selectedAccount;

    marks.firstLedger = await page
        .waitForFunction(() => document.querySelectorAll("[data-financials-ledger-row]").length > 0, undefined, { timeout: 120_000 })
        .then(() => at(), () => null);

    let prev = -1, stable = 0, settled = marks.firstLedger ?? at();
    for (let i = 0; i < 40 && stable < 2; i++) {
        const n = await page.evaluate(() => document.querySelectorAll("[data-financials-ledger-row]").length);
        if (n === prev && n > 0) stable += 1; else { stable = 0; settled = at(); }
        prev = n;
        await page.waitForTimeout(250);
    }

    const row = {
        pass, ...marks, settled, rows: prev,
        shellToLedger: marks.firstLedger != null && marks.usableShell != null ? marks.firstLedger - marks.usableShell : null,
        requests: reqs.map((r) => ({ url: r.url, endedAt: r.endedAt, bytes: r.bytes, status: r.status })),
    };
    log(`${pass} ack=${marks.acknowledgement} geometry=${marks.firstGeometry} list=${marks.interactiveList} selected=${marks.selectedAccount} usable=${marks.usableShell} ledger=${marks.firstLedger} settled=${settled} rows=${prev}`);
    log(`  requests in window (${reqs.length}): ${reqs.map((r) => `${r.url.split("?")[0]}@${r.endedAt}ms/${r.bytes}B`).join(", ")}`);
    all.push(row);
    return row;
}

for (const n of [1, 2, 3]) {
    test(`accounts cold ${n}`, async ({ page }) => { await openAccounts(page, `cold-${n}`); });
}
test("accounts warm x4", async ({ page }) => {
    for (let i = 1; i <= 4; i++) {
        await openAccounts(page, `warm-${i}`);
        await page.locator("[data-workspace-section-tab='overview']").first().click({ timeout: 20_000 }).catch(() => undefined);
        await page.waitForTimeout(2_000);
    }
});
test("record", async () => {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/decomposition.json`, JSON.stringify(all, null, 2));
    log(`RECORDED ${all.length} openings`);
    expect(all.length).toBeGreaterThanOrEqual(7);
});
