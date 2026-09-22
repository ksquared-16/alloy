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
     * RESPONSE END, not just request start. A dependency edge is "this landed, then that painted";
     * with start times alone the gap between a request and a mutation is unattributable and the
     * long pole cannot honestly be traced to anything.
     */
    const responses: Array<{ url: string; at: number; status: number }> = [];
    /*
     * The drawer VM's OWN compose phases, read from the response body.
     *
     * `composeOpportunityDrawerViewModel` already records `timing.compose_ms` and a `phases_ms` map
     * covering every compose phase, and the route returns them. Settlement is written when that
     * view model reaches the panel, so these phases ARE the settlement server DAG — there is no
     * need to add a parallel timing system to discover what is already measured and shipped.
     */
    let drawerVmTiming: unknown = null;
    /*
     * THE ROUTE'S OWN TOTAL, WHICH THE COMPOSER'S PHASES DO NOT COVER.
     *
     * compose_ms accounts for a median 2,203ms of a 3,685ms wall — 41% of the endpoint is spent
     * OUTSIDE the composer and that is where all the run-to-run variance lives. The route already
     * ships X-Alloy-Server-Duration (whole handler) beside X-Alloy-Drawer-VM-Compose-Ms, so the
     * split into route overhead and network transfer needs no new server instrumentation at all:
     *   wall - serverDuration  = network + queueing
     *   serverDuration - compose = gate + assertRowOrg + participant resolve + card producers
     *                              + JSON serialization
     */
    let drawerVmServerHeaders: Record<string, string | null> = {};
    /*
     * THE COMPLETION OWNER'S OWN SERVER DAG.
     *
     * /api/admin/queue-view-totals is what FIRST_ORDER_VISIBLE_COMPLETE now waits on — WU-03's final
     * authoritative mutation lands ~11ms after it responds. Its Server-Timing header carries the
     * phase decomposition; the request body carries the configured view set it was asked for, and
     * the response carries which views answered vs stayed UNKNOWN.
     *
     * All three are captured because the phases alone cannot separate fixed setup from per-view
     * cost, and because the configured view set is part of the specimen's identity: a count that got
     * faster because a view left the configuration has not got faster.
     */
    let queueViewTotals: Record<string, unknown> | null = null;
    page.on("response", (r) => {
        const u = r.url();
        if (/\/api\/admin\/queue-view-totals/.test(u)) {
            const h = r.headers();
            const req = r.request();
            let requested: unknown = null;
            try {
                requested = JSON.parse(req.postData() || "null");
            } catch {
                requested = null;
            }
            const targets = Array.isArray((requested as { targets?: unknown[] })?.targets)
                ? ((requested as { targets: Array<Record<string, unknown>> }).targets)
                : [];
            queueViewTotals = {
                status: r.status(),
                serverTiming: h["server-timing"] ?? null,
                requestedTargetCount: targets.length,
                requestedViewIds: targets.map((t) => String(t.workViewId ?? "")),
                /*
                 * THE GROUP KEY, not just the view id.
                 *
                 * The route groups by (workUnitId, queueKey) and memoizes access + department
                 * metadata BY workUnitId. So five groups over ONE work unit resolve access once
                 * and await it five times, while five groups over five work units resolve it five
                 * times. `qvt_access` accumulates awaits and cannot tell those apart — only the
                 * distinct work-unit count can, and it decides whether there is any duplication
                 * inside this request at all.
                 */
                requestedTargets: targets.map((t) => ({
                    w: String(t.workUnitId ?? ""),
                    q: String(t.queueKey ?? ""),
                    v: String(t.workViewId ?? ""),
                })),
                distinctWorkUnitIds: [...new Set(targets.map((t) => String(t.workUnitId ?? "")))],
                distinctQueueKeys: [...new Set(targets.map((t) => String(t.queueKey ?? "")))],
                distinctGroupKeys: [
                    ...new Set(targets.map((t) => String(t.workUnitId ?? "") + "::" + String(t.queueKey ?? ""))),
                ],
                selectedSiteId: (requested as { selectedSiteId?: unknown })?.selectedSiteId ?? null,
            };
            void r
                .json()
                .then((j: { totals?: Array<{ workViewId?: string; count?: number | null; known?: boolean }> }) => {
                    const totals = Array.isArray(j?.totals) ? j.totals : [];
                    if (queueViewTotals) {
                        queueViewTotals.returnedCount = totals.length;
                        // `known:false` is UNKNOWN, which must never be read as a count of zero.
                        queueViewTotals.knownCount = totals.filter((t) => t.known).length;
                        queueViewTotals.unknownViewIds = totals
                            .filter((t) => !t.known)
                            .map((t) => String(t.workViewId ?? ""));
                        queueViewTotals.counts = totals.map((t) => ({
                            v: String(t.workViewId ?? ""),
                            c: t.count ?? null,
                            k: !!t.known,
                        }));
                    }
                })
                .catch(() => {});
        }
        if (/\/api\/admin\/view-models\/drawer\/opportunity\//.test(u) && r.status() === 200) {
            const h = r.headers();
            drawerVmServerHeaders = {
                serverDurationMs: h["x-alloy-server-duration"] ?? null,
                composeMs: h["x-alloy-drawer-vm-compose-ms"] ?? null,
                structureSettled: h["x-alloy-drawer-vm-structure-settled"] ?? null,
                routePhases: h["x-alloy-drawer-vm-route-phases"] ?? null,
            };
            void r
                .json()
                .then((j: { timing?: unknown }) => {
                    if (j && typeof j === "object" && j.timing) drawerVmTiming = j.timing;
                })
                .catch(() => {});
        }
        if (/\/api\//.test(u)) responses.push({ url: u.replace(/^https?:\/\/[^/]+/, ""), at: Date.now() - t0, status: r.status() });
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

    /*
     * OPTIONAL WARM-UP NAVIGATION — the normal operator path, not a manufactured cache hit.
     *
     * The product warms the drawer VM from exactly two events: a lens/pill switch, and a
     * /workspace-surface load. A direct navigation to a work-unit URL performs NEITHER, which is
     * why every cold sample missed the cache — NOT_STARTED, not eviction. An operator who lands on
     * /workspace and then opens a Work Unit takes a different path, and this measures that path
     * WITHOUT touching the product: visit the warm-up URL, let its idle prewarm run, then navigate
     * and measure the second navigation exactly as before.
     *
     * The probe re-installs per document, so every timestamp below is relative to the MEASURED
     * navigation, not the warm-up.
     */
    const WARM_URL = process.env.P076_WARM_URL || "";
    let warmRequests = 0;
    if (WARM_URL) {
        const seen = (r: { url(): string }) => {
            if (/\/api\/admin\/view-models\/drawer\/opportunity\//.test(r.url())) warmRequests++;
        };
        page.on("request", seen);
        await page.goto(WARM_URL, { waitUntil: "domcontentloaded", timeout: 120_000 });
        // The workspace prewarm fires on an idle callback (up to ~2.5s), so give it room to finish
        // rather than racing it — a warm sample that did not warm proves nothing.
        await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(Number(process.env.P076_WARM_SETTLE_MS || 6000));
        page.off("request", seen);
    }

    /*
     * THE OWNERSHIP PROOF: withhold the drawer response entirely.
     *
     * If first-order truth is genuinely document-owned, every blocking area except Children —
     * which is deliberately still drawer-owned — must reach authoritative finality without the
     * drawer ever answering. Nothing else demonstrates that as directly as never sending it.
     */
    let drawerBlocked = 0;
    if (process.env.P076_BLOCK_DRAWER === "1") {
        await page.route(/\/api\/admin\/view-models\/drawer\/opportunity\//, (route) => {
            drawerBlocked++;
            return route.abort();
        });
    }

    const nav0 = Date.now();
    await page.goto(URL_PATH, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const domMs = Date.now() - nav0;

    /*
     * THE NAVIGATION'S OWN TIMELINE — so the interval between "server finished" and "first paint"
     * is not a generic bucket.
     *
     * page_total says when the server stopped composing; FIRST_PAINT says when the operator saw an
     * authoritative card. Everything between was previously reported as one ~650ms lump, which is
     * 21% of the product metric and therefore exactly the kind of residual this programme keeps
     * proving is not what it looks like. These are all on the page's own clock (origin
     * navigationStart), the same clock the completion probe uses.
     */
    const navTiming = await page.evaluate(() => {
        const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        if (!n) return null;
        const r = (v: number) => Math.round(v);
        return {
            requestStart: r(n.requestStart),
            responseStart: r(n.responseStart),
            responseEnd: r(n.responseEnd),
            domInteractive: r(n.domInteractive),
            domContentLoadedEventEnd: r(n.domContentLoadedEventEnd),
            loadEventEnd: r(n.loadEventEnd),
            encodedBodySize: n.encodedBodySize,
            decodedBodySize: n.decodedBodySize,
            /** TTFB and transfer, separated — transfer is the only one that is actually the wire. */
            ttfbMs: r(n.responseStart - n.requestStart),
            transferMs: r(n.responseEnd - n.responseStart),
            /** Parse/execute to interactive, then hydration's own tail. */
            toInteractiveMs: r(n.domInteractive - n.responseEnd),
            interactiveToDclMs: r(n.domContentLoadedEventEnd - n.domInteractive),
        };
    });

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
        // Arm the post-complete recorder exactly here, so the records describe the same window
        // the count describes and nothing from first-order assembly leaks in.
        const post = (window as unknown as { __p076post?: { armed: boolean } }).__p076post;
        if (post) post.armed = true;
        return w.__p076?.count ?? 0;
    });
    await page.waitForTimeout(5_000);
    const postComplete = await page.evaluate((before: number) => {
        const w = window as unknown as { __p076?: { count: number } };
        return (w.__p076?.count ?? 0) - before;
    }, settleAt);
    const postCompleteRecords = await page.evaluate(() => {
        const post = (window as unknown as { __p076post?: { records: Array<Record<string, unknown>> } }).__p076post;
        return post?.records ?? [];
    });
    const idleMs = visibleCompleteMs;

    /*
     * The V2 answer, and the evidence that it is an answer rather than a window setting.
     *
     * `visibleCompleteV1` is the quiet-window number and MUST move when P076_QUIET_MS moves.
     * `visibleCompleteV2` is the last authoritative mutation inside a blocking region and MUST NOT:
     * it is a timestamp of something that happened, not of the observer giving up. Running this
     * spec at two windows is therefore a falsifiable test of the metric itself.
     */
    const apiTimingBrowserClock = await page.evaluate(() =>
        performance.getEntriesByType("resource")
            .filter((e) => /\/api\//.test(e.name))
            .map((e) => {
                const r = e as PerformanceResourceTiming;
                return {
                    url: r.name.replace(/^https?:\/\/[^/]+/, ""),
                    startMs: Math.round(r.startTime),
                    endMs: Math.round(r.responseEnd),
                };
            })
            .sort((a, b) => a.endMs - b.endMs));

    const v2 = await page.evaluate(() => {
        const V2 = window as unknown as {
            __p076v2?: {
                lastBlockingAuthoritativeMs: number;
                finalAuthoritativeMs: number;
                perSection: Record<string, {
                    firstMs: number; lastMs: number; lastVisibleMs: number;
                    data: number; structure: number; anim: number;
                    imageExpected: boolean; imageFinalMs: number;
                    contentMs: number; structureMs: number; visibleStateMs: number;
                    finalAuthMs: number; identicalRerenders: number; diagnosticWrites: number;
                }>;
                kinds: Record<string, number>;
                kinds21: Record<string, number>;
                blockingSeen: string[];
                latestGeneration: string | null;
                staleGenerationSuppressed: number;
                placeholderSuppressed: number;
                styledAttrCount: number;
                perCard: Record<string, { firstMs: number; lastMs: number; auth: number; anim: number }>;
            };
        };
        const s = V2.__p076v2;
        if (!s) return null;
        return {
            /*
             * BOTH NUMBERS FROM ONE SAMPLE. V2.1 corrects a measurement defect, so the only
             * honest comparison is the two rules run over the SAME mutations — re-measuring
             * would fold run-to-run variance into a delta that is not a product change at all.
             */
            visibleCompleteV2Ms: s.lastBlockingAuthoritativeMs,
            visibleCompleteV21Ms: s.finalAuthoritativeMs,
            measurementCorrectionMs: s.lastBlockingAuthoritativeMs - s.finalAuthoritativeMs,
            blockingSectionsSeen: s.blockingSeen.slice().sort(),
            // The visible DAG: which blocking region finished last, and what it was doing.
            perSection: Object.fromEntries(
                Object.entries(s.perSection).sort((a, b) => b[1].finalAuthMs - a[1].finalAuthMs),
            ),
            mutationKinds: s.kinds,
            mutationKinds21: s.kinds21,
            // WHO OWNS COMPLETION under each rule. The question section 15 asks directly.
            completionOwnerV2: Object.entries(s.perSection)
                .sort((a, b) => b[1].lastMs - a[1].lastMs)[0]?.[0] ?? null,
            completionOwnerV21: Object.entries(s.perSection)
                .sort((a, b) => b[1].finalAuthMs - a[1].finalAuthMs)[0]?.[0] ?? null,
            falseAuthoritativeRemoved: Object.values(s.perSection)
                .reduce((n, x) => n + x.identicalRerenders + x.diagnosticWrites, 0),
            // Did the finality rules actually fire on the real surface, or is this path simply
            // free of reserved geometry and stale generations? Reporting the counts answers it;
            // an absent field would have been read as "zero" without ever being measured.
            placeholderSuppressed: s.placeholderSuppressed,
            staleGenerationSuppressed: s.staleGenerationSuppressed,
            // Zero here means the stylesheets were unreadable and the semantic rule degraded to
            // "nothing is styled" — a correction that is not one. Never read a sample without it.
            styledAttrCount: s.styledAttrCount,
            latestGeneration: s.latestGeneration,
            // Per-area paint timeline, ordered latest-final first: which area finishes last.
            perCard: Object.fromEntries(Object.entries(s.perCard).sort((a, b) => b[1].lastMs - a[1].lastMs)),
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

    /*
     * CONFIGURATION IDENTITY — the other half of a specimen's identity.
     *
     * The header metric set and the Focus Panel card set are PUBLISHED CONFIGURATION, not
     * architecture. Today's deployment happens to publish three KPI slots and seven cards; the
     * code-owned default visible set names eight, and staging renders seven because v162 dropped
     * `billing_preview` from the layout. So "seven cards" was never a property of this build.
     *
     * That makes a code SHA an incomplete identity for a performance sample. Two runs of the same
     * SHA against different published configuration are measuring different products, and
     * comparing them as equivalent would attribute a configuration change to a code change — or
     * hide a regression behind a shrunken surface. A sample that got faster because a card left
     * the layout has not got faster.
     *
     * Nothing here changes product DOM: the KPI row already publishes its variant attribute and
     * every card section already publishes `data-alloy-section-id`. This reads what is on screen
     * and records it beside the SHA, so a specimen states the configuration it answered for.
     */
    const configIdentity = await page.evaluate(() => {
        const row = document.querySelector(
            "[data-work-unit-header-kpis], [data-workspace-header-kpis]",
        );
        const kpiLabels = row
            ? [...row.querySelectorAll('[role="listitem"]')].map((el) =>
                  (el as HTMLElement).innerText.replace(/\s+/g, " ").trim().slice(0, 40),
              )
            : [];
        /*
         * THE CARD'S OWN IDENTITY, NOT ITS CONTAINER'S.
         *
         * This asked each card for `closest("[data-alloy-section-id]")`, which is the enclosing
         * WORK UNIT SECTION — and all seven cards sit inside WU-09. So the "ordered card set"
         * recorded WU-09 seven times: a value that looks like a card set, changes when the section
         * changes, and is identical for every possible configuration. It could not have detected a
         * card being added, removed or reordered, which is the entire reason it exists.
         *
         * `data-universal-card-key` is the canonical per-card identity the product already emits
         * (UniversalCard, FocusPanelCardRenderer and the individual card components all set it),
         * so no new DOM identity is invented here.
         */
        const cards = [...document.querySelectorAll("article.alloy-os-ucard")].map(
            (el) =>
                el.getAttribute("data-universal-card-key") ||
                el.closest("[data-universal-card-key]")?.getAttribute("data-universal-card-key") ||
                "unidentified",
        );
        return {
            // ORDERED, because reordering is a configuration change even when the set is identical.
            configuredKpiSlots: kpiLabels,
            configuredKpiCount: kpiLabels.length,
            configuredCardSet: cards,
            configuredCardCount: cards.length,
        };
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

    /*
     * ONE LATE-MUTATION AUTHORITY.
     *
     * A second read used to publish `.slice(-40)` of the SAME buffer at the top level. Being the
     * LAST 40 it began after the completion burst on every sample, so the two arrays disagreed
     * about whether the completing mutations existed at all — and the truncated one was the one
     * read first. `regions.lateMutations` carries the whole buffer and is now the only copy.
     */

    /*
     * The Summary readiness chain — the direct causal evidence. Recorded by the product's OWN
     * commit-timing chain, which now records (not logs) whenever the route-timing diagnostic is on.
     */
    const focusChain = await page.evaluate(() => {
        const w = window as unknown as { __alloyFocusChain?: unknown; __alloyPerf?: { marks?: Record<string, number> } };
        const chainMarks = Object.fromEntries(
            Object.entries(w.__alloyPerf?.marks ?? {}).filter(([k]) => k.startsWith("focus_panel_chain")),
        );
        return { diag: w.__alloyFocusChain ?? null, chainMarks };
    });

    /*
     * DID THE SEED REACH THE BROWSER AT ALL?
     *
     * The server reports `outcome: resolved`, yet the client still issued its fallback request.
     * That has two very different causes — the field never crossed into the payload, or it
     * crossed and the identity match rejected it — and they need opposite repairs. Searching the
     * serialized document for the key separates them before any theory is formed.
     */
    /*
     * The client's OWN verdict on the seed, with both sides of every compared field. Two deploys
     * have shown the seed present and the client fetching anyway; this names the mismatch instead
     * of inviting a third guess.
     */
    const seedMatchDiagnostic = await page.evaluate(() => {
        // An ARRAY now: one record per hook instance per phase. A single overwritten value could
        // not say which of the two mounted instances issued the request.
        const raw = (window as unknown as { __alloyWorkViewSeed?: unknown[] }).__alloyWorkViewSeed;
        return Array.isArray(raw) ? raw : raw ?? null;
    });

    const seedReachedClient = await page.evaluate(() => {
        const html = document.documentElement.innerHTML;
        const idx = html.indexOf("workViewTotalsSeed");
        return {
            present: idx >= 0,
            // A short window around the key shows the identity it shipped with, if any.
            excerpt: idx >= 0 ? html.slice(idx, idx + 420) : null,
            mentionsSignature: html.includes("configuredViewSignature"),
        };
    });

    const marks = await page.evaluate(() => {
        const el = document.getElementById("__alloy_route_timing");
        try { return el ? JSON.parse(el.textContent || "null") : null; } catch { return null; }
    });
    const buildInfo = await page.evaluate(async () => {
        try { return await (await fetch("/api/build-info")).json(); } catch { return null; }
    });

    /*
     * FIRST-ORDER CORRECTNESS — because a faster wrong answer is a regression, not a win.
     *
     * The producer overlap starts the card producers from a SPECULATIVE subject and household
     * announced before composition settles. The join is supposed to verify both against the
     * canonical identities and discard the whole run on any mismatch. That guard is unit-gated,
     * but only the deployed surface can show whether the cards actually still say the right thing.
     *
     * So every sample carries the first-order text of every configured card, plus the two failure
     * shapes that a wrong identity or a lost authority would produce: a card that collapsed to
     * "unavailable"/"forbidden", and a schema/records error. A timing taken on a surface in either
     * state is not a measurement of the product.
     */
    const correctness = await page.evaluate(() => {
        const norm = (t: string) => t.replace(/\s+/g, " ").trim();
        const cards = [...document.querySelectorAll("article.alloy-os-ucard")].map((el) => {
            const key =
                el.getAttribute("data-universal-card-key") ||
                el.closest("[data-universal-card-key]")?.getAttribute("data-universal-card-key") ||
                "unidentified";
            const text = norm((el as HTMLElement).innerText || "");
            return {
                key,
                chars: text.length,
                firstOrder: text.slice(0, 400),
                unavailable: /\bunavailable\b|\bforbidden\b|not available|no access/i.test(text),
                recordsUnavailable: /records unavailable|unable to load|could not load/i.test(text),
            };
        });
        const body = norm(document.body.innerText || "");
        return {
            cards,
            cardCount: cards.length,
            unavailableCards: cards.filter((c) => c.unavailable).map((c) => c.key),
            recordsUnavailableCards: cards.filter((c) => c.recordsUnavailable).map((c) => c.key),
            // A PostgREST/schema failure surfaces as text on the page rather than a thrown error.
            schemaError: /schema cache|PGRST\d+|column .* does not exist|relation .* does not exist/i.test(body),
            authenticated: !/sign in to continue|please sign in|log in to continue/i.test(body.slice(0, 2000)),
        };
    });

    const out = {
        label: LABEL, url: URL_PATH, deployedSha: buildInfo?.gitSha ?? null,
        wall: {
            documentMs: domMs,
            navTiming,
            // V1, kept only so the artifact stays visible beside the answer that replaces it.
            visibleCompleteV1QuietWindowMs: visibleCompleteMs,
            quietWindowMs: QUIET_MS,
            postCompleteVisibleMutationCount: postComplete,
            postCompleteRecords,
            postCompleteAuthoritative: postCompleteRecords.filter((r) => r.advancesFinality === true).length,
        },
        metricV2: v2,
        marks,
        dataProbe,
        regions,
        /*
         * THE ACCEPTANCE FACT FOR THE WU-03 SEED.
         *
         * A matching seed means the browser issues NO queue-view-totals request at all, so the
         * proof is a COUNT of requests, not the shape of a response — with a bound seed there is
         * no response to inspect. Counted from the request log rather than the response listener
         * for exactly that reason.
         */
        queueViewTotalsRequestCount: requests.filter((r) => /\/api\/admin\/queue-view-totals/.test(r.url))
            .length,
        seedReachedClient,
        seedMatchDiagnostic,
        correctness,
        /*
         * A sample is valid only if the surface it measured was the real, authenticated,
         * fully-answering product. Rows alone were enough while the only failure mode was an
         * expired session; the overlap adds identity and authority failure modes that render a
         * populated page which is nonetheless wrong.
         */
        valid:
            dataProbe.rows > 0 &&
            !dataProbe.signedOut &&
            correctness.authenticated &&
            !correctness.schemaError &&
            correctness.recordsUnavailableCards.length === 0,
        apiRequestCount: requests.length,
        drawerBlocked,
        warmUpUrl: WARM_URL || null,
        warmUpDrawerVmRequests: warmRequests,
        apiRequests: requests,
        apiResponses: responses,
        /*
         * THE SAME CLOCK AS EVERYTHING ELSE.
         *
         * `apiRequests`/`apiResponses` above are stamped with Date.now() in the NODE driver, from a
         * t0 taken before page.goto. The probe and the readiness chain stamp performance.now() in
         * the PAGE, whose origin is navigationStart. Comparing them made the drawer VM response
         * look like it landed AFTER the completion it causes — an origin offset reported as a
         * causal contradiction. Resource timing answers on the page's own clock, so these entries
         * are the ones any causal claim must be built from.
         */
        configIdentity,
        apiTimingBrowserClock,
        focusChain,
        drawerVmTiming,
        drawerVmServerHeaders,
        queueViewTotals,
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
        + `V2.1=${v2?.visibleCompleteV21Ms}ms correction=${v2?.measurementCorrectionMs}ms `
        + `ownerV2=${v2?.completionOwnerV2} ownerV21=${v2?.completionOwnerV21} `
        + `falseAuth=${v2?.falseAuthoritativeRemoved} `
        + `styledAttrs=${v2?.styledAttrCount} `
        + `lastBlocking=${Object.keys(v2?.perSection ?? {})[0] ?? "none"} `
        + `blockingSeen=${v2?.blockingSectionsSeen.length ?? 0} `
        + `chain=${focusChain.diag ? "present" : "ABSENT"} flips=${(focusChain.diag as {flips?:unknown[]} | null)?.flips?.length ?? 0} `
        + `postMut=${postComplete} `
        + `api=${requests.length} marks=${marks ? "present" : "ABSENT"} rows=${dataProbe.rows} sections=${Object.keys(regions.presentSections).length} `
        + `qvt=${(queueViewTotals as {serverTiming?:string}|null)?.serverTiming ?? "ABSENT"} `
        + `qvtViews=${(queueViewTotals as {requestedTargetCount?:number}|null)?.requestedTargetCount ?? "-"} `
        + `valid=${out.valid} signedOut=${dataProbe.signedOut} auth=${correctness.authenticated} schemaErr=${correctness.schemaError} unavail=[${correctness.unavailableCards.join("|")}] `
        + `kpiSet=[${configIdentity.configuredKpiSlots.join("|")}] `
        + `cardSet=[${configIdentity.configuredCardSet.join("|")}] `
        + `kpis=${configIdentity.configuredKpiCount} cards=${configIdentity.configuredCardCount}`,
    );
});
