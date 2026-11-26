import { test } from "@playwright/test";

/**
 * SSR_AUTHORITATIVE_FRAME — when the configured Focus Panel first EXISTS in the document.
 *
 * ── WHY NEITHER EXISTING METRIC WILL DO ─────────────────────────────────────────────────────────
 *
 * `WU-09.firstMs` was the frame while the panel was CREATED by client code. Once the panel arrives
 * in server HTML there is no creating mutation, so it reports some later change instead — the two
 * architectures would be compared on two different events.
 *
 * First Contentful Paint is honest but is a LOWER bound: the OS shell streams first, so FCP can be
 * the shell painting well before the panel's own markup has even arrived.
 *
 * ── WHAT THIS MEASURES ──────────────────────────────────────────────────────────────────────────
 *
 * A MutationObserver installed BEFORE the document parses. The HTML parser inserts server-rendered
 * nodes, and those insertions raise mutation records exactly as client-created ones do — so the
 * same observer answers the same question on both architectures: at what offset did the configured
 * Focus Panel, and the first card, first exist in the DOM?
 *
 * That is the event both sides can be compared on without an asymmetry argument.
 */
test("p076 ssr frame event", async ({ page }) => {
    const url = process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads";
    test.setTimeout(180_000);

    await page.addInitScript(() => {
        const w = window as unknown as { __ssrFrame?: Record<string, number | null> };
        w.__ssrFrame = { panelAt: null, firstCardAt: null, sixthCardAt: null, queueRowAt: null, shellAt: null };
        const mark = (k: string) => {
            const s = w.__ssrFrame!;
            if (s[k] == null) s[k] = Math.round(performance.now());
        };
        const scan = () => {
            const s = w.__ssrFrame!;
            if (document.querySelector('[data-alloy-section-id="WU-00"]')) mark("shellAt");
            if (document.querySelector('[data-alloy-section-id="WU-09"], [data-inline-focus-panel]')) mark("panelAt");
            const cards = document.querySelectorAll("article.alloy-os-ucard");
            if (cards.length >= 1) mark("firstCardAt");
            // The CONFIGURED set is six. The frame is not the frame until all of it exists.
            if (cards.length >= 6) mark("sixthCardAt");
            if (document.querySelector("[data-queue-row], .alloy-os-queue-row")) mark("queueRowAt");
        };
        const obs = new MutationObserver(scan);
        obs.observe(document, { childList: true, subtree: true });
        document.addEventListener("DOMContentLoaded", scan);
        scan();
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    // Give a slow stream time to finish delivering the surface; the marks themselves are stamped at
    // the instant each node appeared, so waiting here cannot inflate them.
    await page.waitForTimeout(8000);

    const out = await page.evaluate(() => {
        const w = window as unknown as { __ssrFrame?: Record<string, number | null> };
        const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const fcp = performance.getEntriesByName("first-contentful-paint")[0];
        return {
            ...(w.__ssrFrame ?? {}),
            fcp: fcp ? Math.round(fcp.startTime) : null,
            domInteractive: n ? Math.round(n.domInteractive) : null,
            responseEnd: n ? Math.round(n.responseEnd) : null,
            cards: document.querySelectorAll("article.alloy-os-ucard").length,
            signedOut: /sign in/i.test(document.body.innerText.slice(0, 400)),
        };
    });
    console.log(`[ssrframe] ${JSON.stringify(out)}`);
});
