import { test } from "@playwright/test";

/**
 * SHARED RUNTIME — WHAT IS BETWEEN THE BROWSER AND THE HANDLER, MEASURED ON pdx1.
 *
 * Financials once showed ~500-535ms that the handler did not account for: subjects at ~666ms wire
 * against ~131ms server, position at ~1,166ms against ~652ms. Those numbers predate the iad1 -> pdx1
 * co-location, so the first job is not to explain them but to find out whether they still exist.
 *
 * The decomposition rests on knowing what each clock means, so nothing here subtracts across origins:
 *
 *   Server-Timing total  the route handler only. Every instrumented route starts its t0 on the first
 *                        line of the handler body, so the header excludes edge, admission, middleware,
 *                        cold start, response write and anything after the handler returns.
 *   responseStart        the browser's first response byte, on the SAME entry as requestStart, so
 *                        responseStart - requestStart is one duration on one clock.
 *   residual             (responseStart - requestStart) - Server-Timing total. Whatever is real that
 *                        the handler cannot see: network both ways, plus any platform time.
 *
 * /api/build-info is the control. It does no database work, so its residual is the floor that every
 * other route on this connection also pays; anything above that floor belongs to the route.
 *
 * PRIVACY. Sizes, durations, status codes and region identifiers only. No response bodies are read
 * beyond their byte length, and no identifier is reported except the site location the app itself
 * selected, which the probe needs to issue a legitimate request.
 */
const ROUNDS = Number(process.env.RT_ROUNDS ?? "6");

test("shared runtime connection residual", async ({ page }) => {
    test.setTimeout(1_800_000);

    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(14_000);

    const out = await page.evaluate(`(async (rounds) => {
        const sha = await (async () => {
            try { const r = await fetch("/api/build-info", { cache: "no-store" }); return ((await r.json()) || {}).gitSha || null; }
            catch (e) { return null; }
        })();

        // A site location the app itself is configured with — the probe never invents an identifier.
        let siteLocationId = null;
        try {
            const r = await fetch("/api/admin/locations?hierarchy=1", { credentials: "include" });
            const j = await r.json();
            const walk = (n) => {
                if (!n || siteLocationId) return;
                if (Array.isArray(n)) { for (const x of n) walk(x); return; }
                if (typeof n === "object") {
                    if (n.id && (n.location_type === "site" || n.type === "site" || n.kind === "site")) { siteLocationId = n.id; return; }
                    for (const k of Object.keys(n)) walk(n[k]);
                }
            };
            walk(j);
            if (!siteLocationId) {
                const flat = JSON.stringify(j).match(/"id":"([0-9a-f-]{36})"/);
                siteLocationId = flat ? flat[1] : null;
            }
        } catch (e) { /* reported as null; the financials specimens are then skipped, never faked */ }

        /*
         * THE EDGE CONTROL — where does the half second actually live?
         *
         * A static asset is served by the CDN at the ingress the browser reached, and never travels
         * to the function region. Its time-to-first-byte is therefore the browser-to-edge round trip
         * alone. Every function route below pays that PLUS the edge-to-function leg, so the
         * difference between the two localises the cost to a segment instead of leaving it as an
         * unattributed residual. Chosen from the assets this page actually loaded, so it is a real
         * same-origin request on the same connection and not a synthetic one.
         */
        let staticAsset = null;
        try {
            const cand = performance.getEntriesByType("resource")
                .map((e) => e.name)
                .filter((n) => n.indexOf("/_next/static/") !== -1 && n.indexOf(".js") !== -1);
            staticAsset = cand.length ? cand[0] : null;
        } catch (e) { /* reported absent */ }

        const q = siteLocationId ? "?siteLocationId=" + encodeURIComponent(siteLocationId) : null;
        const ROUTES = [
            { key: "static_edge", url: staticAsset, family: "edge_control" },
            /*
             * THE MIDDLEWARE CONTROL, inside the function region.
             *
             * Middleware matches every path except static assets, and on a matched request it builds
             * a Supabase server client and resolves identity before the route is even chosen. The two
             * provider-webhook paths return from middleware on their second line, before any of that.
             * Both are POST-only, so a GET is a side-effect-free 405 that still travels the full
             * browser -> edge -> pdx1 path. Against build-info, which pays middleware auth in full,
             * the pair separates "the network got there" from "the application spent time before the
             * handler" without needing the route-timing flag that staging does not set.
             */
            { key: "mw_skipped", url: "/api/webhooks/resend", family: "mw_control" },
            { key: "build_info",   url: "/api/build-info", family: "control" },
            { key: "locations",    url: "/api/admin/locations?hierarchy=1", family: "shared" },
            { key: "fin_subjects", url: q ? "/api/admin/financials/subjects" + q : null, family: "financials" },
            { key: "fin_position", url: q ? "/api/admin/financials/position" + q : null, family: "financials" },
            { key: "queue_totals", url: "/api/admin/queue-view-totals", family: "workunit" },
            { key: "records_children", url: "/api/admin/records/children", family: "records" },
        ];

        const parseServerTiming = (h) => {
            const out = {};
            if (!h) return out;
            for (const part of h.split(",")) {
                const m = part.trim().match(/^([A-Za-z0-9_\\-]+);dur=([0-9.]+)/);
                if (m) out[m[1]] = Number(m[2]);
            }
            return out;
        };

        const samples = [];
        for (let round = 0; round < rounds; round += 1) {
            for (const r of ROUTES) {
                if (!r.url) { samples.push({ round, key: r.key, skipped: "no_site_location" }); continue; }
                const before = performance.getEntriesByType("resource").length;
                const t0 = performance.now();
                let status = null, hdrs = {}, bytes = null, err = null;
                try {
                    const res = await fetch(r.url, { credentials: "include", cache: "no-store" });
                    status = res.status;
                    hdrs = {
                        serverTiming: res.headers.get("server-timing"),
                        vercelId: res.headers.get("x-vercel-id"),
                        vercelCache: res.headers.get("x-vercel-cache"),
                        age: res.headers.get("age"),
                    };
                    const tHeaders = performance.now() - t0;
                    const body = await res.text();
                    bytes = body.length;
                    hdrs.tHeadersMs = Math.round(tHeaders);
                } catch (e) { err = String((e && e.name) || e).slice(0, 60); }
                const wall = Math.round(performance.now() - t0);

                // The entry for THIS request: published on completion, so it appears after the body is
                // read, and it is found by position rather than by name so a same-URL retry cannot be
                // mistaken for it.
                let rt = null;
                for (let i = 0; i < 60 && rt == null; i += 1) {
                    const all = performance.getEntriesByType("resource");
                    for (let j = all.length - 1; j >= before; j -= 1) {
                        if (all[j].name.indexOf(r.url.split("?")[0]) !== -1) { rt = all[j]; break; }
                    }
                    if (rt == null) await new Promise((z) => setTimeout(z, 20));
                }
                const st = parseServerTiming(hdrs.serverTiming);
                const e = rt;
                const num = (x) => (typeof x === "number" ? Math.round(x * 10) / 10 : null);
                samples.push({
                    round, key: r.key, family: r.family, status, err, bytes, wall,
                    tHeadersMs: hdrs.tHeadersMs ?? null,
                    serverTotal: st.total ?? null,
                    serverSpans: st,
                    vercelId: hdrs.vercelId, vercelCache: hdrs.vercelCache, age: hdrs.age,
                    rt: e ? {
                        startTime: num(e.startTime),
                        // Connection reuse: equal pairs mean the browser skipped that phase entirely.
                        domainLookupStart: num(e.domainLookupStart), domainLookupEnd: num(e.domainLookupEnd),
                        connectStart: num(e.connectStart), connectEnd: num(e.connectEnd),
                        secureConnectionStart: num(e.secureConnectionStart),
                        requestStart: num(e.requestStart), responseStart: num(e.responseStart), responseEnd: num(e.responseEnd),
                        protocol: e.nextHopProtocol || null,
                        transferSize: e.transferSize == null ? null : e.transferSize,
                        encodedBodySize: e.encodedBodySize == null ? null : e.encodedBodySize,
                        reused: e.connectStart === e.connectEnd && e.domainLookupStart === e.domainLookupEnd,
                    } : null,
                });
            }
        }
        return { sha, siteLocationIdPresent: !!siteLocationId, samples };
    })(${ROUNDS})`);

    console.log(`[rt] ${JSON.stringify(out)}`);
});
