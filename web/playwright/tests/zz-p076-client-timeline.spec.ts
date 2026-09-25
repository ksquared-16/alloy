import { test } from "@playwright/test";

/**
 * THE CLIENT INTERVAL, DECOMPOSED — seed byte in the browser → authoritative Focus Panel in the DOM.
 *
 * The frame DAG reconciles to 98.7% with one term left unattributed: ~426ms between the server
 * finishing and the panel existing. "Client hydration" is not an owner; this names what is inside it.
 *
 * Everything here is observed from the BROWSER with no application instrumentation:
 *
 *   - a MutationObserver installed BEFORE parsing sees the parser insert nodes, so it times the
 *     shell, the Flight payload scripts, the panel and each card on one clock;
 *   - Resource Timing gives every script's request start, response end and transfer size, which is
 *     what decides whether the panel is WAITING for code or executing it;
 *   - `longtask` entries give main-thread occupancy between the seed arriving and the panel
 *     existing, which is what decides whether unrelated startup work is blocking the frame.
 *
 * One clock throughout: `performance.now()`, origin navigationStart.
 */
test("p076 client timeline", async ({ page }) => {
    const url = process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads";
    test.setTimeout(180_000);

    await page.addInitScript(() => {
        const w = window as unknown as {
            __ct?: Record<string, unknown>;
        };
        const marks: Record<string, number> = {};
        const longtasks: Array<{ at: number; dur: number }> = [];
        const flight: Array<{ at: number; len: number }> = [];
        const mark = (k: string) => {
            if (marks[k] == null) marks[k] = Math.round(performance.now());
        };
        w.__ct = { marks, longtasks, flight };

        try {
            new PerformanceObserver((l) => {
                for (const e of l.getEntries()) longtasks.push({ at: Math.round(e.startTime), dur: Math.round(e.duration) });
            }).observe({ entryTypes: ["longtask"] });
        } catch { /* not all browsers */ }

        const scan = (recs?: MutationRecord[]) => {
            // Flight payload chunks arrive as inline scripts. The one carrying the provisioning
            // answer is the seed becoming available to the client runtime.
            if (recs) {
                for (const r of recs) {
                    r.addedNodes.forEach((n) => {
                        if ((n as Element).tagName === "SCRIPT") {
                            const t = (n as HTMLScriptElement).textContent ?? "";
                            if (t.includes("__next_f.push")) {
                                flight.push({ at: Math.round(performance.now()), len: t.length });
                                if (t.includes("recordOfAttention")) mark("seedAt");
                                if (t.includes("focusPanelSummaryDoc")) mark("summaryDocAt");
                            }
                        }
                    });
                }
            }
            if (document.querySelector('[data-alloy-section-id="WU-00"]')) mark("shellAt");
            if (document.querySelector("[data-surface-slot]")) mark("surfaceHostAt");
            if (document.querySelector('[data-alloy-section-id="WU-09"], [data-inline-focus-panel]')) mark("panelAt");
            const cards = document.querySelectorAll("article.alloy-os-ucard");
            if (cards.length >= 1) mark("firstCardAt");
            if (cards.length >= 6) mark("sixthCardAt");
            // How much of the configured set exists AT the moment the panel first appears.
            // If the panel mounts with all six shells, the frame is the panel; if it mounts with
            // one, "the frame" and "the panel" are different events and must not be conflated.
            if (marks.panelAt != null && (w.__ct as Record<string, unknown>).cardsAtPanel == null) {
                const store = w.__ct as Record<string, unknown>;
                store.cardsAtPanel = cards.length;
                /*
                 * GEOMETRY, not content. A configured cell the model cannot fill yet renders as a
                 * RESERVED cell, which holds its place in the grid but is not an
                 * `article.alloy-os-ucard`. Counting only cards answers "how many are FILLED", which
                 * is a different question from "is the configured geometry present".
                 */
                const cells = document.querySelectorAll(".alloy-os-ucard");
                store.cellsAtPanel = cells.length;
                store.reservedAtPanel = document.querySelectorAll('[data-focus-panel-cell-reserved="true"]').length;
                store.cellKeysAtPanel = [...cells].map(
                    (c) => c.getAttribute("data-universal-card-key")
                        ?? c.getAttribute("data-focus-panel-cell-preparing")
                        ?? c.closest("[data-universal-card-key]")?.getAttribute("data-universal-card-key")
                        ?? (c.tagName === "DIV" ? "reserved" : "?"),
                );
                // WHICH configured keys exist at the frame — the four-vs-six question is about
                // identity, not count, and a count cannot say which two are missing.
                store.keysAtPanel = [...cards].map(
                    (c) => c.getAttribute("data-universal-card-key")
                        ?? c.closest("[data-universal-card-key]")?.getAttribute("data-universal-card-key")
                        ?? "?",
                );
            }
            // First appearance of each configured key, so a late card names its own arrival.
            const seen = ((w.__ct as Record<string, unknown>).keyFirstAt ??= {}) as Record<string, number>;
            cards.forEach((c) => {
                const k = c.getAttribute("data-universal-card-key")
                    ?? c.closest("[data-universal-card-key]")?.getAttribute("data-universal-card-key");
                if (k && seen[k] == null) seen[k] = Math.round(performance.now());
            });
        };
        new MutationObserver((recs) => scan(recs)).observe(document, { childList: true, subtree: true });
        document.addEventListener("DOMContentLoaded", () => scan());
        scan();
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(9000);

    const out = await page.evaluate(() => {
        const w = window as unknown as { __ct?: { marks: Record<string, number>; longtasks: Array<{ at: number; dur: number }>; flight: Array<{ at: number; len: number }> } };
        const ct = w.__ct!;
        const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const scripts = (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
            .filter((r) => r.initiatorType === "script" || /\.js(\?|$)/.test(r.name))
            .map((r) => ({
                // Only the tail of the path: enough to name the chunk, nothing identifying.
                name: r.name.split("/").slice(-1)[0].slice(0, 48),
                start: Math.round(r.startTime),
                end: Math.round(r.responseEnd),
                dur: Math.round(r.duration),
                bytes: r.encodedBodySize,
            }))
            .sort((a, b) => a.end - b.end);
        const panelAt = ct.marks.panelAt ?? null;
        // Which scripts finished latest BEFORE the panel existed — the frame's real code dependency.
        const beforePanel = panelAt == null ? [] : scripts.filter((s) => s.end <= panelAt);
        const lastScripts = beforePanel.slice(-6);
        const seedAt = ct.marks.seedAt ?? null;
        const between = seedAt != null && panelAt != null
            ? ct.longtasks.filter((t) => t.at >= seedAt - 50 && t.at <= panelAt)
            : [];
        return {
            marks: ct.marks,
            responseStart: n ? Math.round(n.responseStart) : null,
            responseEnd: n ? Math.round(n.responseEnd) : null,
            domInteractive: n ? Math.round(n.domInteractive) : null,
            flightChunks: ct.flight.length,
            firstFlightAt: ct.flight.length ? ct.flight[0].at : null,
            lastFlightAt: ct.flight.length ? ct.flight[ct.flight.length - 1].at : null,
            scriptCount: scripts.length,
            scriptBytesBeforePanel: beforePanel.reduce((a, s) => a + s.bytes, 0),
            lastScriptsBeforePanel: lastScripts,
            longtaskCountSeedToPanel: between.length,
            longtaskMsSeedToPanel: between.reduce((a, t) => a + t.dur, 0),
            longtasksSeedToPanel: between.slice(0, 8),
            cardsAtPanel: (w.__ct as unknown as Record<string, unknown>).cardsAtPanel ?? null,
            keysAtPanel: (w.__ct as unknown as Record<string, unknown>).keysAtPanel ?? null,
            cellsAtPanel: (w.__ct as unknown as Record<string, unknown>).cellsAtPanel ?? null,
            reservedAtPanel: (w.__ct as unknown as Record<string, unknown>).reservedAtPanel ?? null,
            cellKeysAtPanel: (w.__ct as unknown as Record<string, unknown>).cellKeysAtPanel ?? null,
            keyFirstAt: (w.__ct as unknown as Record<string, unknown>).keyFirstAt ?? null,
            cards: document.querySelectorAll("article.alloy-os-ucard").length,
            signedOut: /sign in/i.test(document.body.innerText.slice(0, 400)),
        };
    });
    console.log(`[ct] ${JSON.stringify(out)}`);
});
