/**
 * Step D — Queue continuity browser validation.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
loadEnv({ path: path.join(webRoot, ".env.local") });

const outPath = path.join(webRoot, "../docs/sprints/07_2026/work-view-continuity-step-d-report.json");
const WU_PATH = "/workspace/work-unit/new-leads";

async function readQueueFrame(page) {
    return page.evaluate(() => {
        const region = document.querySelector("[data-queue-region]");
        const rows = document.querySelectorAll("[data-queue-row-entity-id]");
        const skeleton = document.querySelector("[data-queue-skeleton]");
        const empty = document.querySelector('[data-queue-empty="true"]');
        const noMatches = document.querySelector('[data-queue-no-matches="true"]');
        const alert = region?.querySelector('[role="alert"]');
        return {
            regionPresent: Boolean(region),
            regionMountId: region?.getAttribute("data-build-sha") ?? null,
            ariaBusy: region?.querySelector('[role="list"]')?.getAttribute("aria-busy") ?? null,
            rowCount: rows.length,
            rowIds: [...rows].map((r) => r.getAttribute("data-queue-row-entity-id")),
            skeletonVisible: Boolean(skeleton),
            emptyVisible: Boolean(empty),
            noMatchesVisible: Boolean(noMatches),
            errorVisible: Boolean(alert),
            errorText: alert?.textContent?.trim() ?? null,
        };
    });
}

async function waitForSettledRows(page, minRows = 1, timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const frame = await readQueueFrame(page);
        if (frame.rowCount >= minRows && frame.ariaBusy !== "true") return frame;
        await page.waitForTimeout(100);
    }
    return readQueueFrame(page);
}

async function pollDuringAction(page, action, durationMs = 2500, intervalMs = 16) {
    const frames = [];
    const start = Date.now();
    const poll = async () => {
        while (Date.now() - start < durationMs) {
            frames.push({ t: Date.now() - start, ...(await readQueueFrame(page)) });
            await page.waitForTimeout(intervalMs);
        }
    };
    await Promise.all([poll(), action()]);
    frames.push({ t: Date.now() - start, ...(await readQueueFrame(page)) });
    return frames;
}

function analyzeFrames(frames, settledBefore) {
    let blankFrames = 0;
    let skeletonAfterSettle = 0;
    let falseEmptyFrames = 0;
    const regionMountIds = new Set(frames.map((f) => f.regionMountId).filter(Boolean));
    const hadRows = settledBefore.rowCount > 0;

    for (const frame of frames) {
        if (hadRows && frame.rowCount === 0 && !frame.emptyVisible) blankFrames++;
        if (hadRows && frame.skeletonVisible) skeletonAfterSettle++;
        if (hadRows && (frame.emptyVisible || frame.noMatchesVisible) && frame.rowCount === 0) {
            falseEmptyFrames++;
        }
    }

    return {
        blankFrames,
        skeletonAfterSettle,
        falseEmptyFrames,
        queueRegionRemounts: Math.max(0, regionMountIds.size - 1),
        frameCount: frames.length,
    };
}

async function findPillByLabel(page, labelPart) {
    const pills = page.locator('[data-work-view-id][role="tab"]');
    const n = await pills.count();
    for (let i = 0; i < n; i++) {
        const t = (await pills.nth(i).innerText()).trim();
        if (t.toLowerCase().includes(labelPart.toLowerCase())) return pills.nth(i);
    }
    return null;
}

async function runPass(page, runIndex) {
    const networkLog = [];
    page.on("response", async (res) => {
        const url = res.url();
        if (!url.includes("/api/admin/queues/")) return;
        let json = null;
        try {
            json = await res.json();
        } catch {
            json = null;
        }
        networkLog.push({
            url,
            status: res.status(),
            total: json?.total ?? null,
            itemCount: Array.isArray(json?.items) ? json.items.length : null,
            work_view_id: new URL(url).searchParams.get("work_view_id"),
            limit: new URL(url).searchParams.get("limit"),
        });
    });

    await page.goto(WU_PATH, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector("[data-queue-region]", { timeout: 120000 });
    const settledInitial = await waitForSettledRows(page);

    const allLeadsPill = await findPillByLabel(page, "all leads");
    const newLeadsPill = await findPillByLabel(page, "new leads");
    const waitlistPill =
        (await findPillByLabel(page, "waitlist")) ?? (await findPillByLabel(page, "wait list"));

    const switchToAllFrames = allLeadsPill
        ? await pollDuringAction(page, () => allLeadsPill.click(), 2500)
        : [];
    const afterAllLeads = await readQueueFrame(page);

    const switchToOtherFrames = waitlistPill
        ? await pollDuringAction(page, () => waitlistPill.click(), 2500)
        : [];
    const afterOther = await readQueueFrame(page);

    const switchBackFrames = newLeadsPill
        ? await pollDuringAction(page, () => newLeadsPill.click(), 2500)
        : [];
    const finalSnap = await readQueueFrame(page);

    const analysis = {
        switchToAll: analyzeFrames(switchToAllFrames, settledInitial),
        switchToOther: analyzeFrames(switchToOtherFrames, settledInitial),
        switchBack: analyzeFrames(switchBackFrames, settledInitial),
    };

    const totals = {
        blankFrames: Object.values(analysis).reduce((s, a) => s + a.blankFrames, 0),
        skeletonAfterSettle: Object.values(analysis).reduce((s, a) => s + a.skeletonAfterSettle, 0),
        falseEmptyFrames: Object.values(analysis).reduce((s, a) => s + a.falseEmptyFrames, 0),
        queueRegionRemounts: Object.values(analysis).reduce((s, a) => s + a.queueRegionRemounts, 0),
    };

    return {
        run: runIndex,
        settledInitial,
        afterAllLeads,
        afterOther,
        final: finalSnap,
        analysis,
        totals,
        networkLogCount: networkLog.length,
    };
}

async function main() {
    const baseUrl = process.env.WORK_VIEW_STEP_D_URL ?? "http://127.0.0.1:3001";
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ baseURL: baseUrl, viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();
    const { ensureAdminPlaywrightSession } = await import("../playwright/helpers/adminSessionAuth.ts");
    await ensureAdminPlaywrightSession(page);

    const runs = [];
    for (let i = 1; i <= 3; i++) {
        runs.push(await runPass(page, i));
        await page.waitForTimeout(500);
    }

    const aggregate = {
        blankFrames: runs.reduce((s, r) => s + r.totals.blankFrames, 0),
        skeletonAfterSettle: runs.reduce((s, r) => s + r.totals.skeletonAfterSettle, 0),
        falseEmptyFrames: runs.reduce((s, r) => s + r.totals.falseEmptyFrames, 0),
        queueRegionRemounts: runs.reduce((s, r) => s + r.totals.queueRegionRemounts, 0),
    };

    const report = {
        capturedAt: new Date().toISOString(),
        baseUrl,
        path: WU_PATH,
        runs,
        aggregate,
        pass:
            aggregate.blankFrames === 0 &&
            aggregate.falseEmptyFrames === 0 &&
            aggregate.queueRegionRemounts === 0,
    };

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ outPath, aggregate, pass: report.pass }, null, 2));
    await browser.close();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
