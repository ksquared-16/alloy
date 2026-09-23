import { test } from "@playwright/test";

/**
 * WHAT IS IN THE SERVER HTML, BEFORE ANY SCRIPT RUNS.
 *
 * The frame measurement says the Focus Panel commits at ~1,521ms, long after the document. That is
 * consistent with two different worlds — the panel absent from the HTML, or present but repainted —
 * and they call for opposite repairs. This reads the raw document bytes with JavaScript DISABLED,
 * so nothing can have rendered client-side by the time we look.
 */
test("p076 ssr probe", async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    const url = process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads";
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    const html = (await res?.text()) ?? "";
    const count = (re: RegExp) => (html.match(re) ?? []).length;
    console.log(`[ssr] ${JSON.stringify({
        status: res?.status() ?? 0,
        bytes: html.length,
        signedOut: /sign in|login/i.test(html.slice(0, 4000)),
        ucard: count(/alloy-os-ucard/g),
        universalCardKey: count(/data-universal-card-key/g),
        sectionId: count(/data-alloy-section-id/g),
        focusPanel: count(/focus-panel/g),
        cellReserved: count(/data-focus-panel-cell-reserved/g),
        queueRow: count(/alloy-os-queue|data-queue-row/g),
        osShell: count(/alloy-os-/g),
        // Did the SERVER frame reach the flight payload at all? `initialFrame` is a prop on a
        // client component, so a composed frame is serialized into the document even when nothing
        // renders from it. This separates "the data never arrived" from "the data arrived and the
        // surface still did not render" — opposite repairs.
        frameHydrationKey: count(/initialFrame|\\"hydration\\"/g),
        recordOfAttention: count(/recordOfAttention/g),
        focusPanelSummaryDoc: count(/focusPanelSummaryDoc/g),
        currentBusinessState: count(/currentBusinessState/g),
        // `data-surface-slot` is what SurfaceHostProvider DECIDED during SSR:
        // "held" = showWorkUnit true (the surface should render), "current" = it did not.
        surfaceSlot: (html.match(/data-surface-slot=\\?"[a-z]+\\?"/g) ?? []).slice(0, 4),
        bootShell: count(/Thinking|boot-shell|AlloyOperationalBootShell/g),
        sectionIds: (html.match(/data-alloy-section-id=\\?"([A-Z0-9-]+)\\?"/g) ?? []).slice(0, 8),
    })}`);
    await ctx.close();
});
