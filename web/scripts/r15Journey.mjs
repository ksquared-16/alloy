/**
 * R15 — how much prepared readiness a real journey actually consumes.
 *
 * A prepared answer is "hit" when the entry gesture resolves from the warm cache instead of issuing a
 * second request for the same URL. So consumption is measured by counting DISTINCT provisioning-answer
 * URLs requested before and after the click: a hit adds no new request for the destination the
 * operator chose. Bytes prepared but never consumed are the waste R15 is asking about.
 */
import { chromium } from "playwright";
import { BASE, STORAGE, assertLocalBase, assertCandidateBuild, writeEvidence, withResource } from "./r11Env.mjs";

const IS_ANSWER = /\/provisioning-answer/;
const viewOf = (u) => new URL(u).searchParams.get("work_view_id") ?? new URL(u).pathname.split("/").at(-2);

assertLocalBase();
assertCandidateBuild();

const out = await withResource(
    () => chromium.launch({ headless: true }),
    (b) => b.close(),
    async (browser) => {
        const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 1000 } });
        const page = await ctx.newPage();
        const answers = [];
        page.on("response", async (res) => {
            if (!IS_ANSWER.test(res.url())) return;
            let bytes = 0;
            try { bytes = Buffer.byteLength(await res.text(), "utf8"); } catch { /* unavailable */ }
            answers.push({ at: Date.now(), view: viewOf(res.url()), url: res.url().split("?")[0] + (res.url().includes("?") ? "?" + res.url().split("?")[1] : ""), bytes });
        });

        const t0 = Date.now();
        await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded", timeout: 120000 });
        await page.waitForFunction(() => document.querySelectorAll('a[href^="/workspace/work-unit/"]').length > 0, undefined, { timeout: 90000 });
        const workspaceT3 = Date.now() - t0;
        await page.waitForTimeout(14000);          // let idle readiness settle
        const prepared = [...answers];

        // The operator enters the destination readiness bet on most heavily.
        const clickAt = Date.now();
        await page.locator('a[href^="/workspace/work-unit/waitlist"]').first().click({ timeout: 20000 });
        await page.waitForFunction(() => document.querySelectorAll("[data-queue-row-subject]").length > 0, undefined, { timeout: 60000 });
        const preparedT3 = Date.now() - clickAt;
        await page.waitForTimeout(6000);

        const after = answers.filter((a) => a.at >= clickAt);
        return { workspaceT3, preparedT3, prepared, after };
    },
);

const kb = (n) => (n / 1024).toFixed(1) + " KB";
const preparedBytes = out.prepared.reduce((s, a) => s + a.bytes, 0);
const preparedUrls = new Set(out.prepared.map((a) => a.url));
const refetched = out.after.filter((a) => preparedUrls.has(a.url));
const consumedViews = new Set(["waitlist"]);
const unused = out.prepared.filter((a) => !consumedViews.has(a.view));

console.log(`Workspace T3: ${out.workspaceT3} ms | prepared Work Unit T3 after click: ${out.preparedT3} ms`);
console.log(`\nprepared answers: ${out.prepared.length}, total ${kb(preparedBytes)}`);
out.prepared.forEach((a) => console.log(`   ${String(a.view).padEnd(20)} ${kb(a.bytes)}`));
console.log(`\nprovisioning requests AFTER the click: ${out.after.length}`);
out.after.forEach((a) => console.log(`   ${String(a.view).padEnd(20)} ${kb(a.bytes)}  ${preparedUrls.has(a.url) ? "RE-FETCH of a prepared url (prepared MISS)" : "new url"}`));
console.log(`\nprepared-answer hit for the chosen destination: ${refetched.some((a) => a.view === "waitlist") ? "MISS (re-fetched)" : "HIT (served warm)"}`);
console.log(`answers prepared but not entered this journey: ${unused.length}, ${kb(unused.reduce((s, a) => s + a.bytes, 0))} never consumed`);
writeEvidence("readiness-journey.json", { ...out, preparedBytes, unusedBytes: unused.reduce((s, a) => s + a.bytes, 0) });
