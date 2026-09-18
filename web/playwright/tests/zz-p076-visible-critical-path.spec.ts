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
        /*
         * PER-REGION ATTRIBUTION, not DOM-wide quiescence.
         *
         * Every visible region carries data-alloy-section-id from the canonical section registry, so
         * each mutation can be attributed to the region that owns it. DOM-wide quiescence answers
         * WHEN the page stopped changing; it cannot say WHICH visible region changed last, and the
         * communications finding showed that distinction decides the whole programme.
         *
         * Mutations outside any registered section are recorded as "__unattributed" rather than
         * dropped — if completion is being set by unattributed churn, that is the finding.
         */
        const R = (window as unknown as { __p076r?: Record<string, {first:number;last:number;count:number}> });
        R.__p076r = {};
        const attribute = (n: Node | null): string => {
            let el: Node | null = n;
            while (el && el.nodeType !== 1) el = el.parentNode;
            let cur = el as Element | null;
            while (cur) {
                const id = cur.getAttribute?.("data-alloy-section-id");
                if (id) return id;
                cur = cur.parentElement;
            }
            return "__unattributed";
        };
        /*
         * ── METRIC V2: WHAT KIND OF CHANGE WAS THAT? ──
         *
         * V1 answered "when did the DOM stop changing for N ms". That is not a property of the
         * product: the same page measured 4,697ms at N=3s and 7,155ms at N=8s. The number tracked
         * the window, because a surface that animates, prewarms and polls NEVER goes quiet — so the
         * answer was always "the last background twitch", whenever the observer happened to give up.
         *
         * V2 asks a question the page can actually answer: WHEN DID THE LAST CHANGE THAT AN OPERATOR
         * WOULD CALL "STILL LOADING" HAPPEN, INSIDE A REGION THAT BLOCKS THE SURFACE?
         *
         * Two independent narrowings, and both are needed:
         *
         *   1. BLOCKING, read from `data-alloy-section-blocking`, which alloySectionMap emits. The
         *      registry is the one place that says what blocks; this file does not keep a second
         *      list to drift against it. Communications proved why: it churns for seconds after the
         *      surface is usable, and it is not first-paint — counting it was the whole error.
         *
         *   2. AUTHORITATIVE, not presentational. A fade settling is not the surface still arriving.
         */
        type Kind = "AUTHORITATIVE_DATA" | "AUTHORITATIVE_STRUCTURE" | "PRESENTATIONAL_ANIMATION";
        const ANIMATION_ATTRS = new Set(["class", "style", "aria-busy", "aria-hidden"]);
        const classify = (r: MutationRecord): Kind => {
            if (r.type === "attributes") {
                const n = r.attributeName ?? "";
                // class/style/aria-busy carry the transitions, skeleton swaps and busy flags. They
                // change constantly and none of them means "data is still arriving".
                if (ANIMATION_ATTRS.has(n) || /^data-(motion|anim|transition|framer)/.test(n)) {
                    return "PRESENTATIONAL_ANIMATION";
                }
                return "AUTHORITATIVE_DATA";
            }
            if (r.type === "characterData") return "AUTHORITATIVE_DATA";
            // childList: an element appearing or leaving is structure; text-only churn is data.
            const els = [...Array.from(r.addedNodes), ...Array.from(r.removedNodes)]
                .filter((n) => n.nodeType === 1).length;
            return els > 0 ? "AUTHORITATIVE_STRUCTURE" : "AUTHORITATIVE_DATA";
        };

        /*
         * THE OWNING SECTION, AND WHY "NEAREST BLOCKING ANCESTOR" WAS THE WRONG QUESTION.
         *
         * First cut walked up to the nearest ancestor marked blocking. Measured against deployed
         * staging that produced V2 == V1 to the millisecond on both windows (9306/9306, 9086/9086),
         * with every sample blaming WU-00 — because WU-00 is the persistent OS shell, an ancestor of
         * the entire page. "Inside a blocking section" was true of every mutation on the surface, so
         * the narrowing narrowed nothing and V2 was V1 wearing a different name.
         *
         * A section that CONTAINS another registered section is a container, not a region that
         * paints. So attribute each mutation to its LEAF-MOST section and ignore containers: churn
         * whose closest owner is the shell is, by construction, outside every content region.
         *
         * Derived live from the DOM — no id is named here, so this cannot drift from the registry
         * and needs no second list of "things that do not count".
         */
        /*
         * Memoize only the POSITIVE. "Is a container" is time-varying in one direction: the shell
         * exists before the regions inside it do, so the first mutation on WU-00 sees no descendant
         * section and a two-sided cache pins it as a leaf for the rest of the run — which is exactly
         * what happened, and left WU-00 driving completion again after the rule was added.
         * Once a section has contained another, it never stops having done so.
         */
        const knownContainer = new WeakSet<Element>();
        const isContainer = (el: Element): boolean => {
            if (knownContainer.has(el)) return true;
            if (el.querySelector("[data-alloy-section-id]")) {
                knownContainer.add(el);
                return true;
            }
            return false;
        };
        const blockingHost = (n: Node | null): string | null => {
            let el: Node | null = n;
            while (el && el.nodeType !== 1) el = el.parentNode;
            let cur = el as Element | null;
            while (cur) {
                const id = cur.getAttribute?.("data-alloy-section-id");
                if (id) {
                    // Leaf-most section owns it. A container owns nothing it does not paint itself.
                    if (isContainer(cur)) return null;
                    return cur.getAttribute("data-alloy-section-blocking") === "true" ? id : null;
                }
                cur = cur.parentElement;
            }
            return null;
        };

        const V2 = window as unknown as {
            __p076v2?: {
                lastBlockingAuthoritativeMs: number;
                perSection: Record<string, { lastMs: number; data: number; structure: number; anim: number }>;
                kinds: Record<Kind, number>;
                blockingSeen: string[];
            };
        };
        V2.__p076v2 = {
            lastBlockingAuthoritativeMs: -1,
            perSection: {},
            kinds: { AUTHORITATIVE_DATA: 0, AUTHORITATIVE_STRUCTURE: 0, PRESENTATIONAL_ANIMATION: 0 },
            blockingSeen: [],
        };

        const mark = (recs?: MutationRecord[]) => {
            const now = Date.now();
            w.__p076!.last = now; w.__p076!.count++;
            for (const r of recs ?? []) {
                const key = attribute(r.target);
                const t = now - w.__p076!.t0;
                const e = R.__p076r![key] ?? { first: t, last: t, count: 0 };
                e.last = t; e.count++;
                R.__p076r![key] = e;

                // ── V2 ──
                const kind = classify(r);
                const v2 = V2.__p076v2!;
                v2.kinds[kind]++;
                const host = blockingHost(r.target);
                if (host) {
                    if (!v2.blockingSeen.includes(host)) v2.blockingSeen.push(host);
                    const ps = v2.perSection[host] ?? { lastMs: -1, data: 0, structure: 0, anim: 0 };
                    if (kind === "PRESENTATIONAL_ANIMATION") {
                        ps.anim++;
                    } else {
                        if (kind === "AUTHORITATIVE_DATA") ps.data++; else ps.structure++;
                        ps.lastMs = t;
                        // THE METRIC. Only an authoritative change, only inside a blocking region.
                        if (t > v2.lastBlockingAuthoritativeMs) v2.lastBlockingAuthoritativeMs = t;
                    }
                    v2.perSection[host] = ps;
                }

                /*
                 * WHAT mutated, not just where. WU-00 is an outer wrapper, so nearest-ancestor
                 * attribution makes it a catch-all; without the target's identity we cannot tell
                 * genuine late first-order content from shell churn, and that distinction is the
                 * whole question.
                 */
                const LATE = (window as unknown as { __p076late?: unknown[] });
                LATE.__p076late = LATE.__p076late || [];
                if (t > 4000 && (LATE.__p076late as unknown[]).length < 80) {
                    const el = (r.target.nodeType === 1 ? r.target : r.target.parentElement) as Element | null;
                    (LATE.__p076late as unknown[]).push({
                        t, region: key, kind, blocking: host,
                        type: r.type,
                        tag: el?.tagName ?? null,
                        cls: (el?.getAttribute?.("class") || "").slice(0, 70),
                        txt: (el?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
                        added: r.addedNodes?.length ?? 0,
                    });
                }
            }
        };
        // addInitScript runs BEFORE the document is parsed, so documentElement can be null and
        // observe() then fails silently — which reported visibleComplete=0 on five straight samples.
        // Observing `document` works from the same point and survives the parse.
        const attach = () => {
            try {
                new MutationObserver((recs) => mark(recs)).observe(document, {
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
                perSection: Record<string, { lastMs: number; data: number; structure: number; anim: number }>;
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
