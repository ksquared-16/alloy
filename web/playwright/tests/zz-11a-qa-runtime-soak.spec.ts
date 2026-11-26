/**
 * THREAD 11A — FIXED-CANDIDATE QA RUNTIME · STABILITY PROOF
 *
 * Kelly is about to spend an hour looking at one candidate. The question this spec answers is not
 * "does the UI work" — 5J already proved that. It is narrower and it is about the HOST: while
 * nobody touches it, does the runtime stay exactly where it was put?
 *
 * WHAT A RUNTIME REFRESH ACTUALLY LOOKS LIKE. The defect Kelly reported (LOCAL_HOST_REFRESH_DURING
 * _HUMAN_REVIEW) is a source watcher noticing a write and pushing a new module graph into a live
 * page. From the seat it reads as "the page blinked and I lost my place". So the proof has to
 * distinguish a document that reloaded from one that merely re-rendered, and it has to do that
 * without trusting the absence of a screenshot difference.
 *
 * sessionStorage is the instrument. It survives a document reload inside the same tab and dies with
 * the tab, so a counter incremented from an init script counts DOCUMENT LOADS exactly: 1 means the
 * page Kelly is looking at is the same document that was opened. A React remount, a route reset and
 * an HMR patch all leave different fingerprints, so each is recorded separately:
 *
 *   docLoads        — init script runs, via sessionStorage (a full reload)
 *   mainNavs        — main-frame navigations (a route reset)
 *   hmrMessages     — console text matching Fast Refresh / HMR / hot-update
 *   hmrRequests     — network requests for *.hot-update.* or the dev HMR endpoint
 *   webSockets      — every socket opened; Next's dev HMR channel is a websocket
 *   mountNonce      — a window-scoped id; a change means the JS context was replaced
 *
 * And the state that must survive is sampled at both ends, not just at the end: an overlay that
 * closed and reopened would otherwise read as "retained".
 *
 * Two tabs, because the requirement spans two hosts that cannot both be on screen at once: the
 * Focus Panel Details overlay (lens + period disclosure) and the Financials Accounts selection.
 */
import { expect, test, type Page, type BrowserContext } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = "http://127.0.0.1:3012";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const HOUSEHOLD = "29944d3e-8267-45b7-8dcb-7405060e2573";
const OUT = "../certification/financials";
const MOUNTED = 180_000;
const SOAK_MS = Number(process.env.QA_SOAK_MS ?? 11 * 60 * 1000);
const CANDIDATE = execFileSync("git", ["rev-parse", "HEAD"], { cwd: "/Users/vacilando/Code/alloy-worktrees/financials" }).toString().trim();

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });

const shot = async (p: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: `${OUT}/${n}.png` }); };
const log = (s: string) => console.log(s); // eslint-disable-line no-console

/** Everything a runtime does to a page without being asked. One record per tab. */
type Watch = { name: string; docLoads: number[]; mainNavs: string[]; hmrMessages: string[]; hmrRequests: string[]; webSockets: string[]; errors: string[] };

async function watch(page: Page, name: string): Promise<Watch> {
    const w: Watch = { name, docLoads: [], mainNavs: [], hmrMessages: [], hmrRequests: [], webSockets: [], errors: [] };
    await page.addInitScript(() => {
        const n = Number(sessionStorage.getItem("__qaDocLoads") ?? "0") + 1;
        sessionStorage.setItem("__qaDocLoads", String(n));
        const w = window as unknown as { __qaDocLoads: number; __qaMountNonce: string };
        w.__qaDocLoads = n;
        w.__qaMountNonce = Math.random().toString(36).slice(2);
    });
    page.on("console", (m) => {
        const t = m.text();
        if (/fast refresh|\bHMR\b|hot-update|hot reload|rebuilding|\[webpack\]|turbopack.*(update|reload)/i.test(t)) w.hmrMessages.push(t.slice(0, 200));
    });
    page.on("pageerror", (e) => w.errors.push(String(e).slice(0, 200)));
    page.on("request", (r) => { if (/hot-update|__nextjs_original|_next\/webpack-hmr|turbopack-hmr/.test(r.url())) w.hmrRequests.push(r.url().slice(0, 160)); });
    page.on("websocket", (ws) => w.webSockets.push(ws.url().slice(0, 160)));
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) w.mainNavs.push(f.url().slice(0, 160)); });
    return w;
}

const liveNonce = (p: Page) => p.evaluate(() => {
    const w = window as unknown as { __qaDocLoads?: number; __qaMountNonce?: string };
    return { docLoads: w.__qaDocLoads ?? -1, nonce: w.__qaMountNonce ?? "none", href: location.pathname + location.search };
});

/** The four states Kelly must not lose. Read from the DOM, never from a variable we set. */
const detailState = (p: Page) => p.evaluate(() => ({
    overlay: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null,
    lens: document.querySelector('[data-financials-lens][aria-pressed="true"]')?.getAttribute("data-financials-lens") ?? null,
    rows: document.querySelectorAll("[data-financials-ledger-row]").length,
    periods: [...document.querySelectorAll("[data-financials-ledger-period]")]
        .map((s) => `${s.querySelector("[data-financials-period-toggle]")?.getAttribute("data-financials-period-toggle")}=${s.querySelector("[data-financials-period-toggle]")?.getAttribute("aria-expanded")}`)
        .join(","),
    scroll: Math.round((document.querySelector("[data-financials-detail-scroll]") as HTMLElement | null)?.scrollTop ?? -1),
}));

const accountState = (p: Page) => p.evaluate(() => ({
    section: document.querySelector('[data-workspace-section-tab][aria-selected="true"], [data-workspace-section-tab].is-active')?.textContent?.trim() ?? null,
    selectedAccount: document.querySelector("[data-financials-account-detail], [data-adminv2-financials-account-detail]")?.getAttribute("data-account-id")
        ?? (document.querySelector("[data-financials-account-row][aria-selected='true']")?.getAttribute("data-financials-account-row") ?? null),
    accountHeading: (document.querySelector("[data-adminv2-financials-workspace] h1, [data-adminv2-financials-workspace] h2") as HTMLElement | null)?.innerText.trim().slice(0, 80) ?? null,
    rows: document.querySelectorAll("[data-financials-ledger-row]").length,
}));

/** The server's own account of itself, taken from outside the browser. */
function serverFacts(): Record<string, string> {
    const out: Record<string, string> = {};
    try {
        const pids = execFileSync("bash", ["-lc", "/usr/sbin/lsof -nP -iTCP:3012 -sTCP:LISTEN -t | sort -u | tr '\\n' ' '"]).toString().trim();
        out.listenerPids = pids;
        out.psTree = execFileSync("bash", ["-lc", `ps -o pid=,ppid=,lstart=,command= -p ${pids.split(/\s+/).join(",")} 2>/dev/null | cut -c1-160`]).toString().trim();
    } catch (e) { out.error = String(e).slice(0, 160); }
    return out;
}

/** Any write under the served source tree would be what a watcher reacts to. */
function sourceFingerprint(): string {
    return execFileSync("bash", ["-lc",
        "cd /Users/vacilando/Code/alloy-worktrees/financials && git rev-parse HEAD && git status --porcelain | grep -v next-env.d.ts | wc -l | tr -d ' ' && find app components lib -type f -newermt '-30 minutes' 2>/dev/null | wc -l | tr -d ' '",
    ], { cwd: "/Users/vacilando/Code/alloy-worktrees/financials/web" }).toString().trim().replace(/\n/g, " | ");
}

test("the fixed-candidate runtime does not move while nobody touches it", async ({ browser }) => {
    test.setTimeout(SOAK_MS + 600_000);
    const context: BrowserContext = await browser.newContext({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });

    // ── IDENTITY, BEFORE ANYTHING ELSE ─────────────────────────────────────────────────────────
    const info = await (await context.request.get(`${BASE}/api/build-info`)).json();
    log("BUILD_INFO " + JSON.stringify(info));
    const html = await (await context.request.get(`${BASE}/adminV2/workspace`)).text();
    log("DEV_CLIENT_MARKERS " + JSON.stringify({
        reactRefresh: /react-refresh|__webpack_require__\.\$Refresh/.test(html),
        hmrEndpoint: /webpack-hmr|turbopack-hmr|__nextjs_original-stack/.test(html),
        devOverlay: /nextjs-portal|__next_devtools|next-dev-overlay/.test(html),
        bytes: html.length,
    }));
    log("SERVER_BEFORE " + JSON.stringify(serverFacts()));
    log("SOURCE_BEFORE " + sourceFingerprint());

    // ── TAB A · FOCUS PANEL → DETAILS, A LENS, A COLLAPSED PERIOD ──────────────────────────────
    const a = await context.newPage();
    const wa = await watch(a, "focus-panel-details");
    await a.goto(`${LANE}?subject_id=${SUBJECT}`);
    await a.waitForLoadState("domcontentloaded");
    const card = a.locator('[data-financials-card="true"]').first();
    await expect(card).toBeVisible({ timeout: MOUNTED });
    await a.waitForTimeout(9_000);
    await card.getByRole("button", { name: /^Details/ }).first().click({ timeout: 20_000 });
    await expect(a.locator('[data-financials-overlay="detail"]')).toBeVisible({ timeout: 60_000 });
    await a.waitForTimeout(20_000); // the ledger commits at once; wait for the complete commit

    const lenses = await a.locator("[data-financials-lens]").all();
    if (lenses.length > 1) await lenses[1].click({ timeout: 20_000 });
    await a.waitForTimeout(1_500);
    const toggle = a.locator("[data-financials-period-toggle]").first();
    if (await toggle.count()) { await toggle.click({ timeout: 20_000 }); await a.waitForTimeout(1_200); }
    const aBefore = { ...(await detailState(a)), ...(await liveNonce(a)) };
    log("TAB_A_BEFORE " + JSON.stringify(aBefore));
    await shot(a, "qa-runtime-A-before");

    // ── TAB B · FINANCIALS → ACCOUNTS → A SELECTED ACCOUNT ─────────────────────────────────────
    const b = await context.newPage();
    const wb = await watch(b, "financials-accounts");
    await b.goto("/workspace");
    await b.waitForLoadState("domcontentloaded");
    await b.locator('[data-adminv2-sidebar-modal-nav="financials"]').first().click({ force: true });
    const shell = b.locator("[data-adminv2-financials-workspace]");
    await expect(shell).toBeVisible({ timeout: MOUNTED });
    await shell.locator("[data-workspace-section-tab]").filter({ hasText: "Accounts" }).first().click();
    const row = shell.locator(`[data-financials-account-row="${HOUSEHOLD}"]`);
    await expect(row).toBeVisible({ timeout: MOUNTED });
    await row.click({ timeout: 20_000 }).catch(async () => { await row.evaluate((el) => (el as HTMLElement).click()); });
    await b.waitForTimeout(20_000);
    const bBefore = { ...(await accountState(b)), ...(await liveNonce(b)) };
    log("TAB_B_BEFORE " + JSON.stringify(bBefore));
    await shot(b, "qa-runtime-B-before");

    /*
     * BASELINE. Everything above was the tester driving the app, and a client-side route change
     * fires framenavigated exactly like a reset would. Only what happens from here — with nobody
     * touching anything — can be charged to the runtime, so the counters are read as deltas.
     */
    const base = { aNavs: wa.mainNavs.length, bNavs: wb.mainNavs.length, aSock: wa.webSockets.length, bSock: wb.webSockets.length };
    log("SOAK_BASELINE " + JSON.stringify(base));

    // ── THE SOAK · NOBODY TOUCHES ANYTHING ─────────────────────────────────────────────────────
    const t0 = Date.now();
    const samples: string[] = [];
    while (Date.now() - t0 < SOAK_MS) {
        await a.waitForTimeout(60_000);
        const [na, nb] = [await liveNonce(a), await liveNonce(b)];
        const pids = serverFacts().listenerPids ?? "?";
        samples.push(`+${Math.round((Date.now() - t0) / 1000)}s pids=${pids} A(loads=${na.docLoads} nonce=${na.nonce} ${na.href}) B(loads=${nb.docLoads} nonce=${nb.nonce} ${nb.href})`);
        log("SOAK " + samples[samples.length - 1]);
    }
    const elapsed = Math.round((Date.now() - t0) / 1000);

    // ── WHAT THE RUNTIME DID ───────────────────────────────────────────────────────────────────
    const aAfter = { ...(await detailState(a)), ...(await liveNonce(a)) };
    const bAfter = { ...(await accountState(b)), ...(await liveNonce(b)) };
    log("TAB_A_AFTER " + JSON.stringify(aAfter));
    log("TAB_B_AFTER " + JSON.stringify(bAfter));
    await shot(a, "qa-runtime-A-after");
    await shot(b, "qa-runtime-B-after");
    log("SERVER_AFTER " + JSON.stringify(serverFacts()));
    log("SOURCE_AFTER " + sourceFingerprint());
    log("SOAK_SECONDS " + elapsed);
    for (const w of [wa, wb]) {
        log(`WATCH ${w.name} navs=${w.mainNavs.length} hmrMessages=${w.hmrMessages.length} hmrRequests=${w.hmrRequests.length} sockets=${w.webSockets.length} errors=${w.errors.length}`);
        if (w.mainNavs.length) log(`  navs: ${w.mainNavs.join(" ")}`);
        if (w.hmrMessages.length) log(`  hmr: ${w.hmrMessages.join(" | ")}`);
        if (w.webSockets.length) log(`  sockets: ${w.webSockets.join(" ")}`);
        if (w.errors.length) log(`  errors: ${w.errors.join(" | ")}`);
    }

    // ── THE ASSERTIONS ─────────────────────────────────────────────────────────────────────────
    expect(elapsed, "a stability proof shorter than ten minutes proves nothing").toBeGreaterThanOrEqual(600);
    expect(info.gitSha, "the runtime names the candidate it serves").toBe(CANDIDATE);
    expect(info.nodeEnv, "and it is a production runtime").toBe("production");
    /*
     * THE DATABASE THE SESSION BELONGS TO. The first production build of this candidate baked
     * NEXT_PUBLIC_SUPABASE_URL from web/.env.production.local — a local cert stack — while the
     * server kept the trusted hosted project, so browser and server would have read different
     * databases with nothing on screen saying so. The QA session cookie names its own project
     * (sb-<ref>-auth-token), so the runtime is held to that ref rather than to a remembered value.
     */
    const sessionRef = JSON.parse(readFileSync(STORAGE, "utf8")).cookies
        .map((c: { name: string }) => /^sb-([a-z0-9]{16,32})-auth-token/.exec(c.name)?.[1])
        .find(Boolean);
    log("SESSION_PROJECT_REF " + sessionRef);
    expect(info.supabaseProjectRef, "the runtime reads the database this QA session belongs to").toBe(sessionRef);

    expect(aAfter.docLoads, "tab A is the same document Kelly opened").toBe(1);
    expect(bAfter.docLoads, "tab B is the same document Kelly opened").toBe(1);
    expect(aAfter.nonce, "tab A's JS context was never replaced").toBe(aBefore.nonce);
    expect(bAfter.nonce, "tab B's JS context was never replaced").toBe(bBefore.nonce);

    expect(wa.hmrMessages.length + wb.hmrMessages.length, "no Fast Refresh / HMR message reached either page").toBe(0);
    expect(wa.hmrRequests.length + wb.hmrRequests.length, "no hot-update was requested").toBe(0);
    expect(wa.mainNavs.length - base.aNavs, "tab A never navigated during the soak").toBe(0);
    expect(wb.mainNavs.length - base.bNavs, "tab B never navigated during the soak").toBe(0);

    expect(aAfter.overlay, "the Details overlay is still open").toBe("detail");
    expect(aAfter.lens, "the selected lens survived").toBe(aBefore.lens);
    expect(aAfter.periods, "every period disclosure is where Kelly left it").toBe(aBefore.periods);
    expect(aAfter.rows, "the committed ledger is still committed").toBe(aBefore.rows);
    expect(bAfter.accountHeading, "the selected Financials account survived").toBe(bBefore.accountHeading);

    await context.close();
});
