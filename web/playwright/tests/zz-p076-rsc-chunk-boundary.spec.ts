import { test } from "@playwright/test";

/**
 * WHEN DOES FIRST-ORDER TRUTH ACTUALLY CROSS THE WIRE?
 *
 * The programme has measured responseStart (~32ms) and responseEnd (~1,451ms) and has repeatedly
 * been unable to say where inside that window the authoritative payload arrives. responseStart is
 * not emission — the shell opens long before any truth exists — and responseEnd is not receipt,
 * because it is the END of everything.
 *
 * Next streams the RSC payload as successive `self.__next_f.push([...])` calls embedded in the
 * document. Patching that array's push in an init script, BEFORE any app code runs, timestamps
 * each chunk as the browser actually receives it. Nothing about delivery changes: the same chunks
 * arrive in the same order and are forwarded to the original push untouched.
 *
 * This is TEST-SIDE ONLY and deliberately so. The brief's rule is that instrumentation must not
 * become the architecture: building a Stage-1 stream in order to observe a Stage-1 boundary would
 * be assuming the answer. So this measures the CURRENT single-frame shape as it is.
 *
 * Markers are chosen to be configuration-independent rather than keyed to today's six cards:
 *   `workViewTotalsSeed`  rides every provisioning terminal — marks the ANSWER crossing.
 *   `alloy-os-financials` / `availablePrepaid` mark the completion-setting Financials summary,
 *                         which the canonical baseline proved sets first-order finality.
 * The financials markers are a known specimen-specific limitation and are reported as such.
 */
test("p076 rsc chunk boundary", async ({ page }) => {
    const url = process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads";

    /*
     * WHY NOT PATCH `__next_f.push`.
     *
     * The first version of this probe did exactly that and produced a confident, wrong answer: 14
     * chunks, all at ~107ms, no markers. The verification line is what caught it --
     * `htmlHasSeed: true` with `nextFLen: 0` means the payload WAS in the document while the
     * patched array was empty. Next replaces `self.__next_f` with its own consuming implementation
     * during bootstrap, so every later push -- including every one carrying the answer -- bypassed
     * the patch. A silent probe looked like "the truth never arrived".
     *
     * Streamed RSC chunks reach the browser as appended <script> elements. Observing insertion
     * timestamps the payload as the document actually receives it, and nothing can reassign the
     * DOM out from under it.
     */
    await page.addInitScript(() => {
        const w = window as unknown as {
            __p076chunks?: { t: number; len: number; marks: string[] }[];
            __p076t0?: number;
        };
        w.__p076t0 = performance.now();
        w.__p076chunks = [];
        const MARKERS = [
            "workViewTotalsSeed",
            "focusPanelSummaryDoc",
            "alloy-os-financials",
            "availablePrepaid",
            "personal_seen",
        ];
        const scan = (node: Node) => {
            if (!(node instanceof HTMLScriptElement)) return;
            const text = node.textContent || "";
            if (!text) return;
            const marks = MARKERS.filter((m) => text.includes(m));
            w.__p076chunks!.push({
                t: Math.round(performance.now() - (w.__p076t0 as number)),
                len: text.length,
                marks,
            });
        };
        new MutationObserver((records) => {
            for (const r of records) for (const n of Array.from(r.addedNodes)) scan(n);
        }).observe(document, { childList: true, subtree: true });
    });

    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(Number(process.env.P076_SETTLE_MS || 6000));

    const out = await page.evaluate(() => {
        const w = window as unknown as {
            __p076chunks?: { i: number; t: number; len: number; marks: string[] }[];
        };
        const chunks = w.__p076chunks ?? [];
        const firstWith = (m: string) => chunks.find((c) => c.marks.includes(m))?.t ?? null;
        const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        return {
            chunkCount: chunks.length,
            markedChunks: chunks.filter((c) => c.marks.length > 0).length,
            totalChars: chunks.reduce((a, c) => a + c.len, 0),
            firstChunkT: chunks[0]?.t ?? null,
            lastChunkT: chunks[chunks.length - 1]?.t ?? null,
            answerT: firstWith("workViewTotalsSeed"),
            summaryDocT: firstWith("focusPanelSummaryDoc"),
            financialsT: firstWith("alloy-os-financials"),
            prepaidT: firstWith("availablePrepaid"),
            personalSeenT: firstWith("personal_seen"),
            responseStart: n ? Math.round(n.responseStart) : null,
            responseEnd: n ? Math.round(n.responseEnd) : null,
            // MEASURE THE MEASUREMENT: if the markers are absent from the document entirely, the
            // probe is looking in the wrong place and its silence means nothing.
            scriptTagsWithPush: document.querySelectorAll("script").length,
            htmlHasSeed: document.documentElement.innerHTML.includes("workViewTotalsSeed"),
            htmlHasFinancials: document.documentElement.innerHTML.includes("alloy-os-financials"),
            htmlHasPersonalSeen: document.documentElement.innerHTML.includes("personal_seen"),

        };
    });
    console.log(`[chunk] ${JSON.stringify(out)}`);
});
