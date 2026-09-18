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

import { installVisibleCompletionProbe } from "../support/visibleCompletionProbe";

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
    await page.addInitScript(installVisibleCompletionProbe);

    const nav0 = Date.now();
    await page.goto(URL_PATH, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const domMs = Date.now() - nav0;

    const QUIET_MS = Number(process.env.P076_QUIET_MS || 3000);
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
     * The V2 answer, and the evidence that it is an answer rather than a window setting.
     *
     * `visibleCompleteV1` is the quiet-window number and MUST move when P076_QUIET_MS moves.
     * `visibleCompleteV2` is the last authoritative mutation inside a blocking region and MUST NOT:
     * it is a timestamp of something that happened, not of the observer giving up. Running this
     * spec at two windows is therefore a falsifiable test of the metric itself.
     */
    const v2 = await page.evaluate(() => {
        const V2 = window as unknown as {
            __p076v2?: {
                lastBlockingAuthoritativeMs: number;
                perSection: Record<string, {
                    firstMs: number; lastMs: number; lastVisibleMs: number;
                    data: number; structure: number; anim: number;
                    imageExpected: boolean; imageFinalMs: number;
                }>;
                kinds: Record<string, number>;
                blockingSeen: string[];
            };
        };
        const s = V2.__p076v2;
        if (!s) return null;
        return {
            visibleCompleteV2Ms: s.lastBlockingAuthoritativeMs,
            blockingSectionsSeen: s.blockingSeen.slice().sort(),
            // The visible DAG: which blocking region finished last, and what it was doing.
            perSection: Object.fromEntries(
                Object.entries(s.perSection).sort((a, b) => b[1].lastMs - a[1].lastMs),
            ),
            mutationKinds: s.kinds,
        };
    });

    /*
     * PROVE REAL DATA BEFORE TRUSTING ANY TIMING.
     *
     * An expired QA session renders the same shell with no rows, and a timing taken on an empty
     * surface is fast, plausible and worthless. So the sample carries its own evidence of what was
     * actually on screen; a capture with zero rows is reported as INVALID rather than measured.
     */
    const regions = await page.evaluate(() => {
        const R = (window as unknown as { __p076r?: Record<string, {first:number;last:number;count:number}> }).__p076r ?? {};
        const present: Record<string,string> = {};
        document.querySelectorAll("[data-alloy-section-id]").forEach((el) => {
            const id = el.getAttribute("data-alloy-section-id")!;
            present[id] = el.getAttribute("data-alloy-section-name") || "";
        });
        const late = (window as unknown as { __p076late?: unknown[] }).__p076late ?? [];
        return { mutations: R, presentSections: present, lateMutations: late };
    });

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
        wall: {
            documentMs: domMs,
            // V1, kept only so the artifact stays visible beside the answer that replaces it.
            visibleCompleteV1QuietWindowMs: visibleCompleteMs,
            quietWindowMs: QUIET_MS,
            postCompleteVisibleMutationCount: postComplete,
        },
        metricV2: v2,
        marks,
        dataProbe,
        regions,
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
        `[p076] ${LABEL} sha=${out.deployedSha?.slice(0, 9)} doc=${domMs}ms `
        + `V1(quiet=${QUIET_MS})=${visibleCompleteMs}ms V2=${v2?.visibleCompleteV2Ms}ms `
        + `lastBlocking=${Object.keys(v2?.perSection ?? {})[0] ?? "none"} `
        + `blockingSeen=${v2?.blockingSectionsSeen.length ?? 0} postMut=${postComplete} `
        + `api=${requests.length} marks=${marks ? "present" : "ABSENT"} rows=${dataProbe.rows} sections=${Object.keys(regions.presentSections).length} `
        + `valid=${out.valid} signedOut=${dataProbe.signedOut}`,
    );
});
