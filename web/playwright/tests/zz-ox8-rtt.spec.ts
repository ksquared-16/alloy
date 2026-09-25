import { test } from "@playwright/test";

/**
 * OX SLICE 8 — THE TRANSPORT FLOOR, SO THE OUTER BLOCK IS NOT PART-INFERRED.
 *
 * The provisioning answer's outer block measured P50 1,023ms against an inner composer of 883ms.
 * Two of its three parts are already measured — `route_identity_ms` is 214ms on the route document,
 * and the settlement wait is what the deployed instrumentation will name — but the third, the
 * transport itself, has never been measured on this host from this browser. Without it the
 * settlement wait can only be bracketed, and a bracket is what Slice 12B mistook for a measurement.
 *
 * So this times same-origin authenticated round trips from the SAME browser, on the SAME session,
 * minutes from the provisioning samples, against endpoints that do almost no server work. What is
 * left is the transport floor: connection reuse, TLS session, edge hop and response read.
 */
test("ox8 transport floor", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(12000);

    const out = await page.evaluate(async () => {
        const time = async (url: string) => {
            const t = performance.now();
            try {
                const r = await fetch(url, { credentials: "include", cache: "no-store" });
                // Read the body: the provisioning number includes the body read too.
                await r.text();
                return { url, ms: Math.round(performance.now() - t), status: r.status };
            } catch {
                return { url, ms: null, status: null };
            }
        };
        const targets = ["/api/build-info", "/api/health", "/api/build-info?x=2"];
        const runs: Array<{ url: string; ms: number | null; status: number | null }> = [];
        // Sequential, and repeated: the first call pays connection setup the later ones reuse, and
        // reporting only a warm number would understate a cold operator's transport.
        for (let i = 0; i < 6; i += 1) for (const t of targets) runs.push(await time(t));
        return { signedOut: !!document.querySelector('input[type="password"]'), runs };
    });
    console.log(`[rtt] ${JSON.stringify(out)}`);
});
