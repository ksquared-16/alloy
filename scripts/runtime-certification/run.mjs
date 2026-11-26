/**
 * Runtime certification — the driver.
 *
 * Orchestrates the primitives in ./measure.mjs against a chosen environment. Every subset records
 * what it measured AND what it could not: a `null` here means NOT MEASURED (probe failure), never
 * "fast". The report distinguishes them, because a probe that silently reports 0 ms is worse than
 * no harness at all.
 */
import { createRequire } from "node:module";
import { RECORDER, arm, feedback, until, stable, centre, realPointer, docLoads, navTiming, p, geometry } from "./measure.mjs";
import { classifyDuplicates, cardReadCounts, remounts, intentionalRemounts, ROSTER_READ } from "./ownership.mjs";

const require = createRequire(import.meta.url);
/** Playwright lives in web/node_modules; the harness must not add a second copy. */
function loadChromium() {
    for (const spec of ["playwright", "../../web/node_modules/playwright/index.mjs"]) {
        try { return require(spec).chromium; } catch { /* try next */ }
    }
    throw new Error("PROBE FAILURE: playwright not resolvable — run from the repo with web/node_modules installed.");
}

async function open(env) {
    const chromium = loadChromium();
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
        ...(env.storageState ? { storageState: env.storageState } : {}),
        viewport: { width: 1600, height: 1000 },
    });
    const page = await ctx.newPage();
    const log = { requests: [], consoleErrors: [], failed: [] };
    page.on("request", (r) => log.requests.push(r.url()));
    page.on("console", (m) => { if (m.type() === "error") log.consoleErrors.push(m.text().slice(0, 300)); });
    page.on("requestfailed", (r) => log.failed.push(r.url()));
    return { browser, page, log };
}

/** WORK UNIT + FOCUS PANEL — cold document entry, N samples. These share one navigation. */
async function certifyWorkUnitAndFocusPanel(env, samples) {
    const runs = [];
    for (let i = 0; i < samples; i++) {
        const { browser, page, log } = await open(env);
        await page.addInitScript(RECORDER);
        await page.goto(`${env.baseUrl}/workspace/work-unit/waitlist`, { waitUntil: "commit", timeout: 90000 });
        await page.waitForTimeout(26000);
        const rc = await page.evaluate(() => window.__RC__);
        const nav = await navTiming(page);
        const api = log.requests.filter((u) => u.includes("/api/"));
        runs.push({ ...nav, marks: rc.marks, frames: rc.frames, mounts: rc.mounts, api, errors: log.consoleErrors.length });
        await browser.close();
    }
    const last = runs.at(-1);
    return {
        workUnit: {
            samples: runs.length,
            p50: {
                ttfb: p(runs.map((r) => r.ttfb), 50), shell: p(runs.map((r) => r.marks.shell), 50),
                rows: p(runs.map((r) => r.marks.rows), 50), firstUsefulCard: p(runs.map((r) => r.marks.firstUsefulCard), 50),
            },
            p90: { rows: p(runs.map((r) => r.marks.rows), 90), firstUsefulCard: p(runs.map((r) => r.marks.firstUsefulCard), 90) },
            apiTotal: last.api.length,
            cardReads: cardReadCounts(last.api),
            duplicates: classifyDuplicates(last.api),
            remounts: remounts(last.mounts),
            intentionalRemounts: intentionalRemounts(last.mounts),
            consoleErrors: last.errors,
        },
        focusPanel: { geometry: geometry(last.frames) },
    };
}

/** OPERATIONS — one authoritative roster request per new (site,date); none when already satisfied. */
async function certifyOperations(env) {
    const { browser, page, log } = await open(env);
    const roster = [];
    page.on("request", (r) => { if (ROSTER_READ.test(r.url())) roster.push(r.url()); });
    await page.goto(`${env.baseUrl}/workspace`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(15000);
    const opsBtn = await centre(page, 'b.getAttribute("aria-label")&&b.getAttribute("aria-label").startsWith("Operations")');
    if (!opsBtn) { await browser.close(); return { operations: { probeFailure: "Operations control not resolvable" } }; }
    const before = roster.length;
    await realPointer(page, opsBtn);
    await page.waitForTimeout(9000);
    const openRosterRequests = roster.length - before;
    // A sub-lens on an already-satisfied (site,date) must not refetch.
    const satisfiedBefore = roster.length;
    const staff = await page.evaluate(() => {
        const el = [...document.querySelectorAll("button,[role=tab]")].find((b) => (b.innerText || "").trim() === "Staff" && b.getBoundingClientRect().width > 0);
        if (!el) return null; const r = el.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    let satisfiedRefetch = null;
    if (staff) { await realPointer(page, staff); await page.waitForTimeout(6000); satisfiedRefetch = roster.length - satisfiedBefore; }
    await browser.close();
    return { operations: { openRosterRequests, satisfiedRefetch, totalRosterRequests: roster.length, consoleErrors: log.consoleErrors.length } };
}

/** WORKSPACE / ORGANIZATION — real pointer, zero document loads, shell preserved BY NODE IDENTITY. */
async function certifyNavigation(env) {
    const { browser, page, log } = await open(env);
    await page.goto(`${env.baseUrl}/workspace`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(15000);
    await page.evaluate(() => { window.__SHELL__ = document.querySelector("[data-adminv2-workspace-shell]"); });
    const transitions = [];
    /*
     * A SUBSET MUST NOT BE ABLE TO HANG THE CERTIFICATION.
     *
     * Observed: this subset ran past 20 minutes on deployed staging without producing output, because
     * each transition can spend its full `until` budget AND its full `stable` budget, and a control
     * that never resolves leaves the page in a state where the next one cannot either. A harness
     * nobody can finish running is a harness nobody runs.
     *
     * Past the deadline the remaining transitions are recorded as PROBE FAILURES — not as passes, and
     * not as fast.
     */
    const deadline = Date.now() + 8 * 60 * 1000;
    const go = async (name, pred, usefulFn) => {
        if (Date.now() > deadline) { transitions.push({ name, probeFailure: "navigation subset deadline exceeded before this transition ran" }); return; }
        const c = await centre(page, pred);
        if (!c) { transitions.push({ name, probeFailure: "control not resolvable" }); return; }
        const navB = await docLoads(page);
        await arm(page);
        const t0 = Date.now();
        await realPointer(page, c);
        const useful = await until(page, usefulFn, 20000);
        const fb = await feedback(page);
        const st = await stable(page, t0, 1200, 20000);
        const sh = await page.evaluate(() => window.__SHELL__ === document.querySelector("[data-adminv2-workspace-shell]"));
        transitions.push({ name, feedback: fb, useful, stable: st, docLoads: (await docLoads(page)) - navB, shellSameNode: sh });
    };
    await go("Workspace -> Work Unit", 'b.getAttribute("href")==="/workspace/work-unit/waitlist"', () => /Adjust/.test(document.body.innerText));
    await go("Work Unit -> Workspace", 'b.getAttribute("href")==="/workspace"', () => /TODAY.S WORK/.test(document.body.innerText));
    await go("Workspace -> /organization", 'b.getAttribute("href")==="/organization"', () => /Configuration Domains/.test(document.body.innerText));
    await go("/organization -> programs-locations", 'b.getAttribute("href")==="/organization/programs-locations"', () => location.pathname.includes("programs-locations"));
    await browser.close();
    return { workspace: { transitions, consoleErrors: log.consoleErrors.length } };
}

export async function runCertification({ env, subset, samples }) {
    const out = { subsets: subset, environment: env.name };
    try {
        const { browser, page } = await open(env);
        await page.goto(`${env.baseUrl}/api/build-info`, { waitUntil: "domcontentloaded", timeout: 60000 });
        out.deployedSha = await page.evaluate(() => { try { return JSON.parse(document.body.innerText).gitSha; } catch { return null; } });
        await browser.close();
    } catch { out.deployedSha = null; }

    if (subset.includes("work-unit") || subset.includes("focus-panel")) Object.assign(out, await certifyWorkUnitAndFocusPanel(env, samples));
    if (subset.includes("operations")) Object.assign(out, await certifyOperations(env));
    if (subset.includes("workspace") || subset.includes("organization")) Object.assign(out, await certifyNavigation(env));
    return out;
}
