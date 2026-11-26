/**
 * Phase A capture harness — measures the What's Next / Focus Panel initialization on ONE
 * navigation from the workspace into a work unit, using the real authenticated app + real data
 * (no /dev harness, no seeded fakes). It enables the WN-INIT diagnostics, drives one entry, and
 * writes a timeline (window.__ALLOY_WN_EVENTS) + a network request census + a screenshot.
 *
 * Run: alloy-agent-verify 1 focused-spec playwright/tests/whats-next-init-timeline.spec.ts
 * Output: docs/sprints/active/assets/whats-next-init/<label>-*.{json,png}  (label via WN_LABEL env)
 */
import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";

const LABEL = (process.env.WN_LABEL || "before").replace(/[^a-z0-9_-]/gi, "");
const OUT = path.join(__dirname, "../../../docs/sprints/active/assets/whats-next-init");

type WnEvent = {
    seq: number;
    t: number;
    at: number;
    phase: string;
    subjectId?: string | null;
    runtimeId?: string;
    componentId?: string;
    reqGen?: number;
    cacheKey?: string | null;
    preloadSource?: string;
    cache?: string;
    note?: string;
};

const INTERESTING = /provisioning-answer|opportunity-drawer|drawer.*view-?model|stage-work|tours\/slots|availability-rules|delivery-subjects|form-deliver|layout-runtime/i;

test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true });
});

test("whats-next init timeline (one workspace -> work-unit navigation)", async ({ page }) => {
    test.setTimeout(120_000);

    // Enable diagnostics before any app code runs.
    await page.addInitScript(() => {
        (window as unknown as { __ALLOY_WN_DEBUG?: boolean }).__ALLOY_WN_DEBUG = true;
    });

    const requests: { url: string; method: string; at: number }[] = [];
    const consoleWn: string[] = [];
    const t0 = Date.now();
    page.on("request", (req) => {
        const url = req.url();
        if (INTERESTING.test(url)) requests.push({ url: url.replace(/^https?:\/\/[^/]+/, ""), method: req.method(), at: Date.now() - t0 });
    });
    page.on("console", (msg) => {
        const txt = msg.text();
        if (txt.includes("[WN-INIT]")) consoleWn.push(txt);
    });

    await page.setViewportSize({ width: 1600, height: 1000 });

    // Direct-navigation mode (WN_DIRECT_URL): bypass the workspace + hover-prefetch and load a work
    // unit URL cold — this exercises the K2 COLD entry path (no intent-warmed answer), the exact
    // scenario the in-flight dedup guards under Strict Mode's double-invoke.
    const directUrl = process.env.WN_DIRECT_URL?.trim();
    if (directUrl) {
        await page.goto(directUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.evaluate(() => {
            const w = window as unknown as { __ALLOY_WN_EVENTS?: unknown[]; __ALLOY_WN_SEQ?: number; __ALLOY_WN_T0?: number };
            // do NOT reset here — capture the cold entry from load
        });
        const cardDirect = page.locator('[data-work-card="true"]').first();
        await cardDirect.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(4000);
        const evDirect = (await page.evaluate(() => (window as unknown as { __ALLOY_WN_EVENTS?: WnEvent[] }).__ALLOY_WN_EVENTS ?? [])) as WnEvent[];
        const censusDirect: Record<string, number> = {};
        for (const r of requests) {
            const key = r.url.split("?")[0].replace(/\/[0-9a-f-]{8,}/gi, "/:id");
            censusDirect[key] = (censusDirect[key] ?? 0) + 1;
        }
        const summaryDirect = {
            label: LABEL,
            mode: "direct",
            currentUrl: page.url(),
            eventCount: evDirect.length,
            coldFetches: evDirect.filter((e) => e.phase === "provisioning.cold.fetch").length,
            coldDedupHits: evDirect.filter((e) => e.phase === "provisioning.cold.dedup-hit").length,
            warmHits: evDirect.filter((e) => e.phase === "provisioning.client.warm-hit").length,
            provisioningNetwork: requests.filter((r) => /provisioning-answer/.test(r.url)).length,
            requestCensus: censusDirect,
        };
        fs.writeFileSync(path.join(OUT, `${LABEL}-summary.json`), JSON.stringify(summaryDirect, null, 2));
        fs.writeFileSync(path.join(OUT, `${LABEL}-events.json`), JSON.stringify(evDirect, null, 2));
        await page.screenshot({ path: path.join(OUT, `${LABEL}-whats-next.png`), fullPage: false, animations: "disabled" });
        // eslint-disable-next-line no-console
        console.log("WN-TIMELINE-SUMMARY " + JSON.stringify(summaryDirect));
        expect(page.url()).not.toContain("/login");
        return;
    }

    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded", timeout: 60_000 });
    // Let the queue settle.
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});

    // Find the first real work-unit entry. Try several selectors; log which one matched.
    const candidates = [
        '[data-wu-queue-row="true"]',
        "[data-wu-queue-row]",
        'a[href*="/work-unit/"]',
        '[data-queue-row="true"]',
        '[role="row"][data-record-id]',
        '[data-work-unit-open]',
    ];
    let matchedSelector: string | null = null;
    let entry = null as Awaited<ReturnType<typeof page.$>> | null;
    for (const sel of candidates) {
        const el = await page.$(sel);
        if (el) {
            matchedSelector = sel;
            entry = el;
            break;
        }
    }

    // Reset the timeline so we capture exactly ONE navigation into the work unit.
    await page.evaluate(() => {
        const w = window as unknown as { __ALLOY_WN_EVENTS?: unknown[]; __ALLOY_WN_SEQ?: number; __ALLOY_WN_T0?: number };
        w.__ALLOY_WN_EVENTS = [];
        w.__ALLOY_WN_SEQ = 0;
        w.__ALLOY_WN_T0 = undefined;
    });
    requests.length = 0;
    const navStart = Date.now();

    if (entry) {
        await entry.scrollIntoViewIfNeeded().catch(() => {});
        await entry.click({ timeout: 15_000 }).catch(() => {});
    }

    // Wait for the What's Next card to appear + settle.
    const card = page.locator('[data-work-card="true"]').first();
    await card.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    // Let settlement (seed -> enriched) complete.
    await page.waitForTimeout(4000);

    const timeToStableMs = Date.now() - navStart;

    const events = (await page.evaluate(() => {
        return (window as unknown as { __ALLOY_WN_EVENTS?: WnEvent[] }).__ALLOY_WN_EVENTS ?? [];
    })) as WnEvent[];

    // Census: how many times each interesting endpoint was hit for this one navigation.
    const census: Record<string, number> = {};
    for (const r of requests) {
        const key = r.url.split("?")[0].replace(/\/[0-9a-f-]{8,}/gi, "/:id");
        census[key] = (census[key] ?? 0) + 1;
    }

    const bodyPhases = events.filter((e) => e.phase === "focusPanel.body").map((e) => e.note);
    const summary = {
        label: LABEL,
        matchedSelector,
        cardVisible: await card.isVisible().catch(() => false),
        currentUrl: page.url(),
        timeToStableMs,
        eventCount: events.length,
        loadingShellsRendered: bodyPhases,
        focusPanelMounts: events.filter((e) => e.phase === "focusPanel.mount").length,
        recordRuntimeFetchStarts: events.filter((e) => e.phase === "recordRuntime.fetch.start").length,
        recordRuntimeApplies: events.filter((e) => e.phase === "recordRuntime.fetch.apply").length,
        deferredStageWorkFetches: events.filter((e) => e.phase === "recordRuntime.deferred.fetch").length,
        eventReloads: events.filter((e) => e.phase === "recordRuntime.event.reload").length,
        cardComposes: events.filter((e) => e.phase === "currentWorkCard.compose").length,
        requestCensus: census,
        totalInterestingRequests: requests.length,
    };

    fs.writeFileSync(path.join(OUT, `${LABEL}-summary.json`), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(OUT, `${LABEL}-events.json`), JSON.stringify(events, null, 2));
    fs.writeFileSync(path.join(OUT, `${LABEL}-requests.json`), JSON.stringify(requests, null, 2));
    fs.writeFileSync(path.join(OUT, `${LABEL}-console.txt`), consoleWn.join("\n"));
    await page.screenshot({ path: path.join(OUT, `${LABEL}-whats-next.png`), fullPage: false, animations: "disabled" });

    // eslint-disable-next-line no-console
    console.log("WN-TIMELINE-SUMMARY " + JSON.stringify(summary));

    // The spec always writes evidence; assert only that we reached an authenticated app frame.
    expect(page.url()).not.toContain("/login");
});
