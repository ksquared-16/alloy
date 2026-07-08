/**
 * C3 same-host pill queue prefetch — before/after browser validation.
 * Path: /workspace/work-unit/new-leads (6 pills; New Leads has rows).
 *
 * Usage:
 *   C3_LABEL_PREFIX=before npx tsx scripts/runC3PillPrefetchValidation.mjs
 *   C3_LABEL_PREFIX=after  npx tsx scripts/runC3PillPrefetchValidation.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "../.env.local") });

const BASE = process.env.C3_VALIDATION_URL ?? "http://127.0.0.1:3001";
const PREFIX = process.env.C3_LABEL_PREFIX ?? "run";
const OUT = path.join(
    __dirname,
    `../../docs/sprints/07_2026/perceived-performance-c3-validation-${PREFIX}.json`,
);
const WORK_UNIT_PATH = "/workspace/work-unit/new-leads";

function median(nums) {
    if (!nums.length) return null;
    const s = [...nums].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function oneRun(page, label) {
    const fetchLog = [];
    const perceived = [];
    await page.route("**/api/admin/**", async (route) => {
        const url = route.request().url().split("?")[0];
        fetchLog.push({ t: Date.now(), url });
        await route.continue();
    });

    page.on("console", (msg) => {
        const text = msg.text();
        if (text.includes("[perf:perceived]")) perceived.push(text);
    });

    await page.goto(WORK_UNIT_PATH, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForSelector('[data-runtime-label="WU.SURFACE"]', { timeout: 90_000 });
    await page.waitForSelector('[data-runtime-label="WU.WORK_VIEW_PILLS"] [role="tab"]', {
        timeout: 60_000,
    });
    await page.waitForTimeout(2000);

    const pills = page.locator('[data-runtime-label="WU.WORK_VIEW_PILLS"] [role="tab"][data-work-view-id]');
    const pillCount = await pills.count();
    if (pillCount < 2) throw new Error(`Need >=2 pills, got ${pillCount}`);

    // Prefer true same-host inactive pills on this tenant.
    // Active Pipeline (new_work_view_2) and Waitlist (new_work_view_4) navigate cross-host.
    let target = null;
    for (const prefer of ["new_work_view_6", "new_work_view_3", "new_work_view_5"]) {
        const el = page.locator(
            `[data-runtime-label="WU.WORK_VIEW_PILLS"] [role="tab"][data-work-view-id="${prefer}"]`,
        );
        if ((await el.count()) && (await el.getAttribute("aria-selected")) !== "true") {
            target = el;
            break;
        }
    }
    if (!target) {
        for (let i = 0; i < pillCount; i++) {
            if ((await pills.nth(i).getAttribute("aria-selected")) !== "true") {
                target = pills.nth(i);
                break;
            }
        }
    }
    if (!target) throw new Error("No inactive pill found");

    const tHover = Date.now();
    await target.hover();
    await page.waitForTimeout(350);
    const targetId = await target.getAttribute("data-work-view-id");
    const tClick = Date.now();
    await target.click();

    let ackMs = null;
    for (let i = 0; i < 30; i++) {
        const selected = await target.getAttribute("aria-selected");
        if (selected === "true") {
            ackMs = Date.now() - tClick;
            break;
        }
        await page.waitForTimeout(16);
    }
    await page.waitForTimeout(800);
    const pathAfterSwitch = new URL(page.url()).pathname;

    let skeletonFrames = 0;
    let queueHoldFrames = 0;
    for (let i = 0; i < 40; i++) {
        const snap = await page.evaluate(() => {
            const sk = document.querySelector('[aria-label="Loading queue rows"]');
            const list = document.querySelector("[data-queue-region] ul[role='list']");
            return {
                skeleton: Boolean(sk),
                busy: list?.getAttribute("aria-busy") === "true",
            };
        });
        if (snap.skeleton) skeletonFrames += 1;
        if (snap.busy) queueHoldFrames += 1;
        await page.waitForTimeout(50);
    }

    const first = pills.nth(0);
    await first.hover();
    await page.waitForTimeout(350);
    await first.click();
    await page.waitForTimeout(1200);

    const queueFetches = fetchLog.filter((f) => f.url.includes("/api/admin/queues/"));
    const dup = {};
    for (const f of queueFetches) dup[f.url] = (dup[f.url] ?? 0) + 1;
    const duplicate_queue_fetches = Object.fromEntries(Object.entries(dup).filter(([, n]) => n > 1));

    const warmMarks = perceived.filter((p) => p.includes("pill_switch") && p.includes("warm"));
    const sameHostWarms = perceived.filter((p) => p.includes("same_host_queue"));
    const warmHits = perceived.filter((p) => p.includes("warm_result: hit") || p.includes("warm_result:hit"));
    const warmMisses = perceived.filter((p) => p.includes("warm_result: miss") || p.includes("warm_result:miss"));

    return {
        label,
        pill_count: pillCount,
        ack_pill_ms: ackMs,
        hover_to_click_ms: tClick - tHover,
        skeleton_frames: skeletonFrames,
        queue_hold_frames: queueHoldFrames,
        queue_fetch_count: queueFetches.length,
        duplicate_queue_fetches,
        perceived_count: perceived.length,
        warm_mark_count: warmMarks.length,
        same_host_warm_mark_count: sameHostWarms.length,
        warm_hit_mark_count: warmHits.length,
        warm_miss_mark_count: warmMisses.length,
        target_view_id: targetId,
        path_after_first_switch: pathAfterSwitch,
        path_at_end: new URL(page.url()).pathname,
        stayed_on_host_for_c3: pathAfterSwitch.includes("/work-unit/new-leads"),
        perceived_sample: perceived.slice(0, 16),
    };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
const { ensureAdminPlaywrightSession } = await import("../playwright/helpers/adminSessionAuth.ts");
await ensureAdminPlaywrightSession(page);

const runs = [];
for (let i = 1; i <= 3; i++) {
    const run = await oneRun(page, `${PREFIX}-run-${i}`);
    runs.push(run);
    console.log("completed", run.label, {
        ack_pill_ms: run.ack_pill_ms,
        queue_fetch_count: run.queue_fetch_count,
        warm_mark_count: run.warm_mark_count,
        same_host_warm_mark_count: run.same_host_warm_mark_count,
    });
}

const summary = {
    generated_at: new Date().toISOString(),
    base_url: BASE,
    prefix: PREFIX,
    validation_path: WORK_UNIT_PATH,
    runs,
    median_ack_pill_ms: median(runs.map((r) => r.ack_pill_ms).filter((n) => n != null)),
    median_queue_fetch_count: median(runs.map((r) => r.queue_fetch_count)),
    median_skeleton_frames: median(runs.map((r) => r.skeleton_frames)),
    median_queue_hold_frames: median(runs.map((r) => r.queue_hold_frames)),
    median_warm_mark_count: median(runs.map((r) => r.warm_mark_count)),
    median_same_host_warm_mark_count: median(runs.map((r) => r.same_host_warm_mark_count)),
    median_warm_hit_mark_count: median(runs.map((r) => r.warm_hit_mark_count)),
    median_warm_miss_mark_count: median(runs.map((r) => r.warm_miss_mark_count)),
};

fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
await browser.close();
