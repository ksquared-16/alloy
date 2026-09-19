/**
 * P0-7.6 Step 2 — deployed capture.
 *
 * Reads the server's own route-timing marks off the work-unit page (RouteTimingSeed renders them as
 * `#__alloy_route_timing` when ALLOY_ROUTE_TIMING=1) and censuses the first-order API requests.
 *
 * Why the marks and not a network census for the structural claim: the two enrichments Step 2
 * retired were DATABASE reads inside one server route, not HTTP requests, so the browser cannot see
 * them. Neither ever had its own span either — verified against the pre-Step-2 tree — so their cost
 * sat inside `compose_sections.projection_ms`. That section is therefore the attributable signal.
 *
 * Env: PLAYWRIGHT_BASE_URL, PLAYWRIGHT_STORAGE_STATE, P076_LABEL, P076_URL, P076_OUT
 */
import * as fs from "fs";
import * as path from "path";
import { test } from "@playwright/test";

const LABEL = (process.env.P076_LABEL || "sample").replace(/[^a-z0-9_-]/gi, "");
const OUT = process.env.P076_OUT || "/tmp/p076";
const URL_PATH = process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads";

test("p0-7.6 step2 deployed capture", async ({ page }) => {
    test.setTimeout(180_000);
    fs.mkdirSync(OUT, { recursive: true });

    const requests: Array<{ url: string; at: number }> = [];
    const t0 = Date.now();
    page.on("request", (r) => {
        const u = r.url();
        if (/\/api\//.test(u)) requests.push({ url: u.replace(/^https?:\/\/[^/]+/, ""), at: Date.now() - t0 });
    });

    /*
     * VISIBLE-COMPLETE BY DOM QUIESCENCE, NOT networkidle.
     *
     * networkidle never settles on this app — it measured 126s on a page that was visually done in
     * seconds, because something holds a connection open. So completion is measured the way the
     * metric is actually defined: the last moment any visible first-order content CHANGED, followed
     * by a quiet window. Mutations after that window are counted, because the metric requires
     * POST_COMPLETE_VISIBLE_MUTATION_COUNT = 0.
     *
     * This is an operationalisation of the stated definition, not a recovered historical harness —
     * reported as such.
     */
    await page.addInitScript(() => {
        const w = window as unknown as { __p076?: { t0: number; last: number; count: number } };
        w.__p076 = { t0: Date.now(), last: Date.now(), count: 0 };
        const mark = () => { w.__p076!.last = Date.now(); w.__p076!.count++; };
        // addInitScript runs BEFORE the document is parsed, so documentElement can be null and
        // observe() then fails silently — which reported visibleComplete=0 on five straight samples.
        // Observing `document` works from the same point and survives the parse.
        const attach = () => {
            try {
                new MutationObserver(mark).observe(document, {
                    childList: true, subtree: true, characterData: true, attributes: true,
                });
            } catch { /* retried below */ }
        };
        attach();
        document.addEventListener("DOMContentLoaded", attach, { once: true });
    });

    const nav0 = Date.now();
    await page.goto(URL_PATH, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const domMs = Date.now() - nav0;

    const QUIET_MS = 3_000;
    let visibleCompleteMs = -1;
    for (let i = 0; i < 120; i++) {
        const st = await page.evaluate(() => {
            const w = window as unknown as { __p076?: { t0: number; last: number; count: number } };
            return w.__p076 ? { since: Date.now() - w.__p076.last, last: w.__p076.last - w.__p076.t0, count: w.__p076.count } : null;
        });
        if (st && st.since >= QUIET_MS) { visibleCompleteMs = st.last; break; }
        await page.waitForTimeout(500);
    }
    // Anything that changes after the quiet window is a post-complete visible mutation.
    const settleAt = await page.evaluate(() => {
        const w = window as unknown as { __p076?: { count: number } };
        return w.__p076?.count ?? 0;
    });
    await page.waitForTimeout(5_000);
    const postComplete = await page.evaluate((before: number) => {
        const w = window as unknown as { __p076?: { count: number } };
        return (w.__p076?.count ?? 0) - before;
    }, settleAt);
    const idleMs = visibleCompleteMs;

    /*
     * PROVE REAL DATA BEFORE TRUSTING ANY TIMING.
     *
     * An expired QA session renders the same shell with no rows, and a timing taken on an empty
     * surface is fast, plausible and worthless. So the sample carries its own evidence of what was
     * actually on screen; a capture with zero rows is reported as INVALID rather than measured.
     */
    const dataProbe = await page.evaluate(() => {
        const txt = document.body.innerText || "";
        const rows = document.querySelectorAll(
            '[data-work-unit-row], article.alloy-os-ucard, [data-record-row], [role="row"]',
        ).length;
        return {
            rows,
            bodyChars: txt.length,
            signedOut: /sign in|log in|unauthor/i.test(txt.slice(0, 2000)),
            sample: txt.replace(/\s+/g, " ").slice(0, 180),
        };
    });

    const marks = await page.evaluate(() => {
        const el = document.getElementById("__alloy_route_timing");
        try { return el ? JSON.parse(el.textContent || "null") : null; } catch { return null; }
    });
    const buildInfo = await page.evaluate(async () => {
        try { return await (await fetch("/api/build-info")).json(); } catch { return null; }
    });

    const out = {
        label: LABEL, url: URL_PATH, deployedSha: buildInfo?.gitSha ?? null,
        wall: { documentMs: domMs, visibleCompleteMs, postCompleteVisibleMutationCount: postComplete },
        marks,
        dataProbe,
        valid: dataProbe.rows > 0 && !dataProbe.signedOut,
        apiRequestCount: requests.length,
        apiRequests: requests,
        retiredReadProbe: {
            eppEnrichmentHttp: requests.filter((r) => /effective-enrollment|epp/i.test(r.url)).length,
            tourEnrichmentHttp: requests.filter((r) => /tour-bookings|active-tour/i.test(r.url)).length,
        },
    };
    fs.writeFileSync(path.join(OUT, `${LABEL}.json`), JSON.stringify(out, null, 1));
    await page.screenshot({ path: path.join(OUT, `${LABEL}.png`), fullPage: false }).catch(() => {});
    console.log(
        `[p076] ${LABEL} sha=${out.deployedSha?.slice(0, 9)} doc=${domMs}ms visibleComplete=${visibleCompleteMs}ms postMut=${postComplete} `
        + `api=${requests.length} marks=${marks ? "present" : "ABSENT"} rows=${dataProbe.rows} `
        + `valid=${out.valid} signedOut=${dataProbe.signedOut}`,
    );
});
