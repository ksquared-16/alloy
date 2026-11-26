/**
 * R15 — what Workspace readiness actually costs.
 *
 * Readiness prepares up to `WORKSPACE_READINESS_DESTINATION_CAP` provisioning answers per Workspace
 * load: the primary destination immediately, the rest on idle. The question is not how large the JSON
 * is — it is how much is TRANSFERRED, PARSED and RETAINED, and how much of it the operator's journey
 * ever consumes.
 *
 * Transfer bytes come from CDP `Network.loadingFinished.encodedDataLength`, which is the real
 * on-the-wire size after content-encoding. Comparing raw JSON length against that is the only way to
 * tell whether duplication in the payload survives compression at all.
 *
 * Env (PE3): PE3_SLOT / PE3_PORT / PE3_BASE / PE3_STORAGE. Local hosts only, read-only.
 */
import { chromium } from "playwright";
import { BASE, STORAGE, assertLocalBase, assertCandidateBuild, writeEvidence, withResource } from "./r11Env.mjs";

const IS_ANSWER = /\/provisioning-answer/;

function attach(page, sink) {
    const byReq = new Map();
    return page.context().newCDPSession(page).then(async (cdp) => {
        await cdp.send("Network.enable");
        cdp.on("Network.requestWillBeSent", (e) => byReq.set(e.requestId, { url: e.request.url, start: e.timestamp }));
        cdp.on("Network.responseReceived", (e) => {
            const r = byReq.get(e.requestId);
            if (r) { r.status = e.response.status; r.encoding = e.response.headers?.["content-encoding"] ?? "identity"; }
        });
        cdp.on("Network.loadingFinished", (e) => {
            const r = byReq.get(e.requestId);
            if (!r) return;
            r.transfer = e.encodedDataLength;
            r.durMs = Math.round((e.timestamp - r.start) * 1000);
            sink.push(r);
            byReq.delete(e.requestId);
        });
        return cdp;
    });
}

const summarize = (reqs) => {
    const answers = reqs.filter((r) => IS_ANSWER.test(r.url));
    const total = (k) => answers.reduce((s, r) => s + (r[k] ?? 0), 0);
    return {
        answerCount: answers.length,
        transferBytes: total("transfer"),
        answers: answers.map((r) => ({
            view: new URL(r.url).searchParams.get("work_view_id") ?? new URL(r.url).pathname.split("/").at(-2),
            status: r.status,
            transfer: r.transfer,
            encoding: r.encoding,
            durMs: r.durMs,
        })),
        allRequests: reqs.length,
        allTransfer: reqs.reduce((s, r) => s + (r.transfer ?? 0), 0),
    };
};

assertLocalBase();
assertCandidateBuild();

const result = await withResource(
    () => chromium.launch({ headless: true }),
    (b) => b.close(),
    async (browser) => {
        const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 1000 } });
        const page = await ctx.newPage();
        const reqs = [];
        await attach(page, reqs);

        // Raw (uncompressed) body length per answer, so raw-vs-transfer is measurable.
        const raw = [];
        page.on("response", async (res) => {
            if (!IS_ANSWER.test(res.url())) return;
            try {
                const body = await res.text();
                raw.push({ view: new URL(res.url()).searchParams.get("work_view_id") ?? "(default)", rawBytes: Buffer.byteLength(body, "utf8") });
            } catch { /* body unavailable */ }
        });

        const t0 = Date.now();
        await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
        await page.waitForFunction(() => document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0, undefined, { timeout: 90000 });
        const t3 = Date.now() - t0;
        // Let idle-scheduled readiness fire (requestIdleCallback timeout is 2.5s).
        await page.waitForTimeout(14000);

        const cold = summarize(reqs);
        const heap = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null).catch(() => null);
        return { t3, cold, raw, heap };
    },
);

console.log(`Workspace cold entry — T3 (work-unit tiles present): ${result.t3} ms`);
console.log(`  total requests: ${result.cold.allRequests}, total transfer: ${(result.cold.allTransfer / 1024).toFixed(1)} KB`);
console.log(`\n  readiness answers prepared: ${result.cold.answerCount}`);
console.log("  view                      status  transfer     encoding   dur");
for (const a of result.cold.answers) {
    console.log(`   ${String(a.view).padEnd(24)} ${String(a.status).padEnd(6)} ${String((a.transfer / 1024).toFixed(1) + " KB").padEnd(11)} ${String(a.encoding).padEnd(10)} ${a.durMs}ms`);
}
const rawTotal = result.raw.reduce((s, r) => s + r.rawBytes, 0);
console.log(`\n  raw JSON per answer:`);
for (const r of result.raw) console.log(`   ${String(r.view).padEnd(24)} ${(r.rawBytes / 1024).toFixed(1)} KB`);
console.log(`\n  RAW total ${(rawTotal / 1024).toFixed(1)} KB  vs  TRANSFER total ${(result.cold.transferBytes / 1024).toFixed(1)} KB` +
    (rawTotal ? `  → compression ratio ${(result.cold.transferBytes / rawTotal * 100).toFixed(1)}%` : ""));
if (result.heap) console.log(`  JS heap after readiness settles: ${(result.heap / 1048576).toFixed(1)} MB`);
writeEvidence("readiness-cold.json", result);
