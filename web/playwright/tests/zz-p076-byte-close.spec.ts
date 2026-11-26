import { test } from "@playwright/test";

/**
 * IS THE ~600ms TAIL REALLY EMPTY?
 *
 * The prior measurement timestamped SCRIPT-ELEMENT INSERTIONS and called the last one "last byte".
 * Those are not the same event: the document can still be receiving bytes that create no script
 * element, so a quiet period in script insertions does not prove a quiet period on the wire. That
 * probe already produced two confidently wrong answers in this programme before a verification line
 * caught it, so the claim gets checked at the byte level before any server work is planned on it.
 *
 * This reads the SAME url through fetch() with a streaming reader, from inside the authenticated
 * page context, and timestamps every chunk the network actually delivers plus the moment the body
 * stream terminates. `bodyEnd - lastChunk` is then the real empty tail, if one exists at all.
 *
 * Non-invasive: an extra GET of a page the session may already load. It measures transport, not the
 * app, and changes nothing about the navigation under test.
 */
test("p076 byte close", async ({ page }) => {
    const url = process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads";
    await page.goto("/adminV2/workspace", { waitUntil: "domcontentloaded" });

    const out = await page.evaluate(async (target) => {
        const t0 = performance.now();
        const res = await fetch(target, { credentials: "include" });
        const headers = performance.now() - t0;
        const reader = res.body!.getReader();
        const dec = new TextDecoder();
        const chunks: { t: number; n: number; mark: boolean }[] = [];
        let total = 0;
        let answerAt: number | null = null;
        let bytesAtAnswer: number | null = null;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value?.byteLength ?? 0;
            const text = value ? dec.decode(value, { stream: true }) : "";
            // The answer's own fields, not a card selector -- configuration-independent.
            const mark = text.includes("personal_seen") || text.includes("focusPanelSummaryDoc");
            if (mark && answerAt === null) {
                answerAt = Math.round(performance.now() - t0);
                bytesAtAnswer = total;
            }
            chunks.push({ t: Math.round(performance.now() - t0), n: value?.byteLength ?? 0, mark });
        }
        const bodyEnd = Math.round(performance.now() - t0);
        const last = chunks.length ? chunks[chunks.length - 1]!.t : null;
        return {
            status: res.status,
            headersAt: Math.round(headers),
            chunkCount: chunks.length,
            totalBytes: total,
            firstChunkT: chunks[0]?.t ?? null,
            lastChunkT: last,
            bodyEndT: bodyEnd,
            emptyTail: last == null ? null : bodyEnd - last,
            answerAt,
            bytesAtAnswer,
            bytesAfterAnswer: bytesAtAnswer == null ? null : total - bytesAtAnswer,
            msAfterAnswer: answerAt == null ? null : bodyEnd - answerAt,
            timeline: chunks,
            // the biggest inter-chunk silence, to see whether the wire really goes quiet mid-stream
            maxGap: chunks.reduce(
                (acc, c, i) => (i === 0 ? 0 : Math.max(acc, c.t - chunks[i - 1]!.t)),
                0,
            ),
        };
    }, url);
    console.log(`[byte] ${JSON.stringify(out)}`);
});
