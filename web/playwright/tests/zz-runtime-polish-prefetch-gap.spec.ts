import { test, expect } from "@playwright/test";

/**
 * INVESTIGATION (no behavior change): the "pre-fetch gap".
 *
 * Question: selected-record / provisioning requests do not start until ~9-12s
 * after navigation. Break the 0 -> first-request window into measurable phases,
 * anchored on the browser's OWN Navigation Timing (navigationStart = 0), so we
 * can attribute the gap to: route compile / server render / HTML arrival / JS
 * chunk download / module eval / hydration / effect / request-start.
 *
 * Run identically against `next dev` (3013) and a local `next build && next start`
 * by pointing PLAYWRIGHT_BASE_URL at each; the numbers are directly comparable.
 */

const ROUTE = "/workspace/work-unit/new-leads";
const CARDS = ["household", "children", "billing_preview", "milestones"];

const tagApi = (url: string): string | null => {
    if (url.includes("/provisioning-answer")) return "provisioning_answer";
    if (/\/view-models\/drawer\/opportunity\/[^/]+\/stage-work/.test(url)) return "view_model_stage_work";
    if (/\/view-models\/drawer\/opportunity\/[^/?]+(\?|$)/.test(url)) return "view_model_enriched";
    if (url.includes("/communications/family-workspace")) return "comms_family_workspace";
    if (url.includes("/financial-config/")) return "financial_config";
    if (url.includes("/entity-labels")) return "entity_labels";
    return null;
};

test("prefetch gap phase breakdown", async ({ page }) => {
    const serverPhases: Record<string, unknown> = {};

    // Capture server-side compose breakdown from response bodies.
    page.on("response", async (res) => {
        const k = tagApi(res.url());
        if (k !== "view_model_enriched" && k !== "provisioning_answer") return;
        try {
            const body = await res.json();
            if (body?.timing?.phases_ms) serverPhases[`${k}_phases_ms`] = body.timing.phases_ms;
        } catch {
            /* non-json / already consumed */
        }
    });

    await page.goto(ROUTE, { waitUntil: "commit" });

    // Poll for card-meaningful milestones, measured in the PAGE's timeline
    // (performance.now() == ms since this document's navigationStart).
    const cardMeaningfulAt: Record<string, number> = {};
    let firstMeaningful = -1;
    let allMeaningful = -1;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
        const s = await page.evaluate((cards) => {
            const now = performance.now();
            const totalCells = document.querySelectorAll("[data-focus-panel-grid-cell]").length;
            const reservedNow = document.querySelectorAll('[data-focus-panel-cell-reserved="true"]').length;
            const state: Record<string, string> = {};
            for (const c of cards) {
                const preparing = document.querySelector(`[data-focus-panel-cell-preparing="${c}"]`);
                state[c] = preparing ? "reserved" : totalCells > 0 ? "meaningful" : "absent";
            }
            return { now, totalCells, reservedNow, state };
        }, CARDS);
        if (s.totalCells > 0) {
            if (firstMeaningful < 0 && s.reservedNow < s.totalCells) firstMeaningful = Math.round(s.now);
            for (const c of CARDS) {
                if (!(c in cardMeaningfulAt) && s.state[c] === "meaningful") cardMeaningfulAt[c] = Math.round(s.now);
            }
            if (s.reservedNow === 0 && Object.keys(cardMeaningfulAt).length >= CARDS.length) {
                allMeaningful = Math.round(s.now);
                await page.waitForTimeout(400);
                break;
            }
        }
        await page.waitForTimeout(80);
    }

    // Pull the authoritative browser timeline: Navigation + Resource Timing.
    const timeline = await page.evaluate(() => {
        const tag = (url: string): string | null => {
            if (url.includes("/provisioning-answer")) return "provisioning_answer";
            if (/\/view-models\/drawer\/opportunity\/[^/]+\/stage-work/.test(url)) return "view_model_stage_work";
            if (/\/view-models\/drawer\/opportunity\/[^/?]+(\?|$)/.test(url)) return "view_model_enriched";
            if (url.includes("/communications/family-workspace")) return "comms_family_workspace";
            if (url.includes("/financial-config/")) return "financial_config";
            if (url.includes("/entity-labels")) return "entity_labels";
            return null;
        };
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];

        const navPhases = nav
            ? {
                  fetchStart: Math.round(nav.fetchStart),
                  requestStart: Math.round(nav.requestStart),
                  responseStart_TTFB: Math.round(nav.responseStart),
                  responseEnd_htmlDone: Math.round(nav.responseEnd),
                  domInteractive: Math.round(nav.domInteractive),
                  domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
                  domComplete: Math.round(nav.domComplete),
                  loadEventEnd: Math.round(nav.loadEventEnd),
              }
            : null;

        // Critical API requests, each with startTime relative to navigationStart.
        const apis = res
            .map((r) => ({ k: tag(r.name), startTime: Math.round(r.startTime), responseEnd: Math.round(r.responseEnd) }))
            .filter((r) => r.k) as { k: string; startTime: number; responseEnd: number }[];
        apis.sort((a, b) => a.startTime - b.startTime);
        const firstApiStart = apis.length ? apis[0].startTime : -1;
        const firstProvisioning = apis.find((a) => a.k === "provisioning_answer");
        const firstProvisioningStart = firstProvisioning ? firstProvisioning.startTime : -1;

        // JS chunk download: separate the CRITICAL initial bundle (chunks that started downloading
        // BEFORE the first provisioning request — i.e. on the hydration critical path) from chunks
        // pulled later (dynamic imports on interaction/card render). Critical bytes is the low-variance
        // metric for "how much JS gates the first selected-record request".
        const chunks = res
            .filter((r) => /\/_next\/static\/.*\.js(\?|$)/.test(r.name))
            .map((r) => ({ start: Math.round(r.startTime), end: Math.round(r.responseEnd), size: r.transferSize || 0 }));
        const gate = firstProvisioningStart >= 0 ? firstProvisioningStart : Number.POSITIVE_INFINITY;
        const criticalChunks = chunks.filter((c) => c.start <= gate);
        const chunkWindow = chunks.length
            ? {
                  totalCount: chunks.length,
                  totalTransferBytes: chunks.reduce((a, c) => a + c.size, 0),
                  firstStart: Math.min(...chunks.map((c) => c.start)),
                  lastEnd: Math.max(...chunks.map((c) => c.end)),
                  // Critical path = before first provisioning request fires.
                  criticalCount: criticalChunks.length,
                  criticalTransferBytes: criticalChunks.reduce((a, c) => a + c.size, 0),
                  criticalLastEnd: criticalChunks.length ? Math.max(...criticalChunks.map((c) => c.end)) : 0,
              }
            : null;

        // Optional hydration marks (present only if app instrumentation emits them).
        const marks = performance
            .getEntriesByType("mark")
            .filter((m) => /hydrat|prefetch|provision|record-work/i.test(m.name))
            .map((m) => ({ name: m.name, t: Math.round(m.startTime) }));

        return { navPhases, chunkWindow, apis, firstApiStart, firstProvisioningStart, marks };
    });

    console.log(`PREFETCH_NAV ${JSON.stringify(timeline.navPhases)}`);
    console.log(`PREFETCH_CHUNKS ${JSON.stringify(timeline.chunkWindow)}`);
    console.log(`PREFETCH_APIS ${JSON.stringify(timeline.apis)}`);
    console.log(`PREFETCH_FIRST_API_START_MS ${timeline.firstApiStart}`);
    console.log(`PREFETCH_FIRST_PROVISIONING_MS ${timeline.firstProvisioningStart}`);
    console.log(`PREFETCH_MARKS ${JSON.stringify(timeline.marks)}`);
    console.log(`PREFETCH_SERVER_PHASES ${JSON.stringify(serverPhases)}`);
    console.log(`PREFETCH_CARDS ${JSON.stringify({ firstMeaningful, allMeaningful, cardMeaningfulAt })}`);

    expect(timeline.navPhases).not.toBeNull();
});
