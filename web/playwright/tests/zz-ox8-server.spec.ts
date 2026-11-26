import { test } from "@playwright/test";

/**
 * OX SLICE 8 — THE PROVISIONING ANSWER'S SERVER INTERIOR, READ OFF THE REAL J5 REQUEST.
 *
 * Slice 7 left the owner unambiguous: 23/23 warm samples had the provisioning answer already in
 * flight at click, its P50 duration was 1,883ms, and one long task occurred across the entire batch.
 * The remaining latency is therefore inside that round trip, and the dispatch forbids guessing which
 * server sub-owner binds it.
 *
 * It does not have to be guessed, and it does not need a deploy. `ProvisioningTimings` is part of
 * the answer contract rather than a flag-gated diagnostic, so every operational answer already
 * carries its own authorization / work_unit / configuration / presentation / records / projection /
 * composition split plus named sub-spans. This reads that payload off the ACTUAL J5 request by
 * cloning the response, so the numbers describe the same event the milestones describe — not a
 * synthetic second request with a warm cache.
 *
 * `route_compose_spans` (the outer producers, which Slice 12D measured as the dominant block) is a
 * separate, flag-gated payload emitted on the ROUTE DOCUMENT, not on this answer. Whether that flag
 * is on in the deployed build is recorded here rather than assumed, because its absence decides
 * whether the producer breakdown needs a Director-owned environment change.
 */
test("ox8 provisioning answer server interior", async ({ page }) => {
    test.setTimeout(240_000);

    await page.addInitScript(() => {
        const w = window as unknown as Record<string, unknown>;
        const answers: Array<Record<string, unknown>> = [];
        w.__ox8 = { answers, clickAt: -1 };
        const orig = window.fetch.bind(window);
        window.fetch = async (...args: Parameters<typeof fetch>) => {
            const started = performance.now();
            const res = await orig(...args);
            let url = "";
            try { url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url ?? String(args[0]); } catch { /* ignore */ }
            if (url.includes("provisioning-answer")) {
                // Clone so the app's own read is untouched.
                res.clone().json().then((body: Record<string, unknown>) => {
                    answers.push({
                        rel: Math.round(started - ((w.__ox8 as { clickAt: number }).clickAt)),
                        clientDurMs: Math.round(performance.now() - started),
                        terminal: body?.terminal ?? null,
                        timings: body?.timings ?? null,
                        // OX Slice 8 — the OUTER spans, now carried on this seam's own answer.
                        outer: (body?.__route_timing as { route_compose_spans?: unknown } | undefined)
                            ?.route_compose_spans ?? null,
                        subject: (url.match(/subject_id=([0-9a-f-]{36})/) || [])[1] ?? null,
                    });
                }).catch(() => { /* a non-JSON answer is not a timing sample */ });
            }
            return res;
        };
    });

    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(15000);

    await page.evaluate(`(() => {
        const rows=[...document.querySelectorAll('.alloy-os-queue-row-card')];
        if (rows.length < 2) return false;
        const cur = rows.findIndex(r=>r.getAttribute('aria-selected')==='true'||r.className.includes('--selected'));
        window.__ox8.target = rows[cur>=0?(cur+1)%rows.length:1];
        for (const t of ["pointerover","mouseover","pointerenter","mouseenter"]) {
            window.__ox8.target.dispatchEvent(new MouseEvent(t, { bubbles: true }));
        }
        return true;
    })()`);
    await page.waitForTimeout(800);
    await page.evaluate(`(() => {
        window.__ox8.clickAt = performance.now();
        window.__ox8.target.click();
        return true;
    })()`);
    await page.waitForTimeout(14000);

    const out = await page.evaluate(() => {
        const w = window as unknown as { __ox8: { answers: Array<Record<string, unknown>> } };
        // Is the flag-gated route timing payload present in the deployed build?
        const el = document.getElementById("__alloy_route_timing");
        let routeTiming: unknown = null;
        try { routeTiming = el ? JSON.parse(el.textContent || "null") : null; } catch { routeTiming = "unparseable"; }
        return {
            signedOut: !!document.querySelector('input[type="password"]'),
            answers: w.__ox8.answers,
            routeTimingPresent: !!el,
            routeTiming,
        };
    });
    console.log(`[srv] ${JSON.stringify(out)}`);
});
