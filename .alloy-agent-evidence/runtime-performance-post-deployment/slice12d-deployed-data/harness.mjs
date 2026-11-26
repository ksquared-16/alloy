/**
 * P0-7.6 SLICE 12D DEPLOYED MEASUREMENT.
 *
 * Five cold authenticated entries to the representative Work Unit. Captures the middleware
 * timing headers, the route-timing payload (including the four Slice 12D producer sub-spans),
 * the product phase clocks measured IN-PAGE with rAF (never cross-process polling — that
 * artifact cost Slice 9C a false number), and a full timing self-check.
 */
import { createRequire } from "node:module";
import { homedir } from "os"; import { join } from "path"; import fs from "fs";
const webRequire = createRequire("/Users/vacilando/Code/alloy-worktrees/wt1-work-unit-grade-a/web/package.json");
const { chromium } = webRequire("playwright");

const BASE = "https://staging.workwithalloy.com";
const PATHNAME = "/workspace/work-unit/waitlist";
const STORAGE = join(homedir(), ".local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json");
const OUT = "/private/tmp/claude-501/-Users-vacilando-Code-alloy-worktrees-wt1-work-unit-grade-a/cef3de6d-880c-4118-9a12-615c80ff76a4/scratchpad";
const N = Number(process.env.N || 5);
const SETTLE_MS = Number(process.env.SETTLE_MS || 34000);

const CRITICAL = ["business_process", "financials", "attendance", "health_safety"];
const TRACK_A = ["children", "household"];

/** Installed before any document script: an in-page rAF observer. */
function observer() {
    const first = {};              // card key -> ms when its PAINTED card first existed
    const cellTimeline = [];       // [ms, cellCount]
    const marks = {};
    const mark = (k) => { if (marks[k] == null) marks[k] = Math.round(performance.now()); };
    let lastCells = -1;
    const tick = () => {
        try {
            if (document.querySelector("[data-destination-shell]")) mark("destination_shell");
            // The PAINTED operator card — never the transparent wrapper (Slice 9C paint contract).
            for (const el of document.querySelectorAll("article.alloy-os-ucard[data-universal-card-key]")) {
                const k = el.getAttribute("data-universal-card-key");
                if (k && first[k] == null) first[k] = Math.round(performance.now());
            }
            // Configured cells: painted AND reserved. A reserved cell carries no card key, so
            // counting only card keys under-reports the structure (the Slice 10 artifact).
            const cells = document.querySelectorAll("[data-fp-grid-area]").length;
            if (cells !== lastCells) { cellTimeline.push([Math.round(performance.now()), cells]); lastCells = cells; }
        } catch { /* a diagnostic must never break the page */ }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    window.__alloyPhase = () => ({ first, cellTimeline, marks });
}

const b = await chromium.launch();
const samples = [];
for (let i = 0; i < N; i++) {
    // A FRESH CONTEXT per sample: new cache, new connection — a genuinely cold entry.
    const ctx = await b.newContext({ storageState: STORAGE, viewport: { width: 1600, height: 1000 } });
    const page = await ctx.newPage();
    await page.addInitScript(observer);

    const navEpoch = Date.now();
    const reqs = [];
    page.on("requestfinished", (r) => {
        try {
            const t = r.timing(); const u = new URL(r.url());
            reqs.push({
                path: u.pathname, kind: r.resourceType(),
                startRel: Math.round(t.startTime - navEpoch),
                duration: t.responseEnd >= 0 ? Math.round(t.responseEnd) : null,
                ttfb: t.responseStart >= 0 ? Math.round(t.responseStart) : null,
            });
        } catch { /* ignore */ }
    });
    let mw = null;
    page.on("response", (r) => {
        try {
            if (r.request().resourceType() !== "document") return;
            if (new URL(r.url()).pathname !== PATHNAME) return;
            if (mw) return;
            const h = r.headers();
            mw = { t0: h["x-alloy-mw-t0"] ?? null, auth_ms: h["x-alloy-mw-auth-ms"] ?? null, admin: h["x-alloy-admin-mw"] ?? null };
        } catch { /* ignore */ }
    });

    await page.goto(`${BASE}${PATHNAME}`, { waitUntil: "commit", timeout: 90000 }).catch(() => {});
    await page.waitForTimeout(SETTLE_MS);

    const phase = await page.evaluate(() => (window.__alloyPhase ? window.__alloyPhase() : null));
    const rt = await page.evaluate(() => {
        const el = document.getElementById("__alloy_route_timing");
        if (!el) return null;
        try { return JSON.parse(el.textContent || "null"); } catch { return "PARSE_ERROR"; }
    });
    const browserNav = await page.evaluate(() => {
        const n = performance.getEntriesByType("navigation")[0];
        return n ? { start: Math.round(n.startTime), duration: Math.round(n.duration), ttfb: Math.round(n.responseStart), respEnd: Math.round(n.responseEnd) } : null;
    });

    // ── §4 TIMING SELF-CHECK ──────────────────────────────────────────────────────────
    // Only requests that BELONG to this navigation. A warm-up with startRel < 0 started
    // before the navigation epoch and is not ours (the Slice 11B harness fault).
    const mine = reqs.filter((r) => r.startRel >= 0);
    const warmups = reqs.filter((r) => r.startRel < 0);
    const doc = mine.find((r) => r.path === PATHNAME && r.kind === "document");
    const prov = mine.filter((r) => /provisioning-answer/.test(r.path));

    const first = phase?.first ?? {};
    const cellTimeline = phase?.cellTimeline ?? [];
    const maxCells = cellTimeline.reduce((m, [, c]) => Math.max(m, c), 0);
    const publishedStructure = maxCells > 0 ? (cellTimeline.find(([, c]) => c === maxCells) || [null])[0] : null;
    const critTimes = CRITICAL.map((k) => first[k]).filter((v) => typeof v === "number");
    const trackTimes = TRACK_A.map((k) => first[k]).filter((v) => typeof v === "number");
    const allTimes = Object.values(first).filter((v) => typeof v === "number");

    samples.push({
        i,
        mw,
        rt,
        spans: rt?.route_compose_spans ?? null,
        producers: rt?.route_compose_spans?.producers ?? null,
        document: doc ? { ttfb: doc.ttfb, duration: doc.duration, startRel: doc.startRel } : null,
        browser_nav: browserNav,
        outer_unattributed: rt?.route_compose_spans && typeof rt.compose_wall_ms === "number"
            ? rt.compose_wall_ms - (
                (rt.route_compose_spans.route_identity_ms ?? 0) + (rt.route_compose_spans.admin_client_ms ?? 0) +
                (rt.route_compose_spans.document_actor_ms ?? 0) + (rt.route_compose_spans.inner_compose_ms ?? 0) +
                (rt.route_compose_spans.card_producers_ms ?? 0))
            : null,
        phases: {
            destination_shell: phase?.marks?.destination_shell ?? null,
            published_structure: publishedStructure,
            first_critical: critTimes.length ? Math.min(...critTimes) : null,
            last_critical: critTimes.length ? Math.max(...critTimes) : null,
            track_a_meaningful: trackTimes.length ? Math.max(...trackTimes) : null,
            final: allTimes.length ? Math.max(...allTimes) : null,
        },
        critical_first_meaningful: Object.fromEntries(CRITICAL.map((k) => [k, first[k] ?? null])),
        coherence: critTimes.length ? Math.max(...critTimes) - Math.min(...critTimes) : null,
        cell_timeline: cellTimeline,
        cells_max: maxCells,
        painted_keys: Object.keys(first).sort(),
        provisioning_reqs: prov.length,
        self_check: {
            warmups_excluded: warmups.length,
            negative_durations: mine.filter((r) => r.duration != null && r.duration < 0).length,
            doc_playwright: doc ? { duration: doc.duration, ttfb: doc.ttfb } : null,
            doc_browser: browserNav ? { duration: browserNav.duration, ttfb: browserNav.ttfb } : null,
            doc_agreement_ms: doc && browserNav ? Math.abs(doc.duration - browserNav.duration) : null,
            route_timing_present: rt != null && rt !== "PARSE_ERROR",
        },
    });
    console.log(`sample ${i}: doc=${doc?.duration} shell=${phase?.marks?.destination_shell} struct=${publishedStructure} crit=${critTimes.length ? Math.min(...critTimes) : "-"} producers=${JSON.stringify(rt?.route_compose_spans?.producers ?? null)}`);
    await ctx.close();
}
await b.close();
fs.writeFileSync(`${OUT}/s12e-samples.json`, JSON.stringify(samples, null, 1));
console.log(`\nwrote ${samples.length} samples`);
