/**
 * Step C — Work View pill-count continuity browser validation.
 * Polls pill counts during transitions to detect settled-count disappearance.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
loadEnv({ path: path.join(webRoot, ".env.local") });

const outPath = path.join(webRoot, "../docs/sprints/07_2026/work-view-continuity-step-c-report.json");
const WU_PATH = "/workspace/work-unit/new-leads";

async function readPillSnapshot(page) {
    return page.evaluate(() => {
        const strip = document.querySelector('[data-alloy-section="WU.WORK_VIEW_PILLS"]');
        const pills = [...document.querySelectorAll('[data-work-view-id][role="tab"]')].map((el) => {
            const rect = el.getBoundingClientRect();
            const badge = el.querySelector(".tabular-nums");
            const spans = [...el.querySelectorAll("span")];
            const label = spans[0]?.textContent?.trim() ?? "";
            const countText = badge?.textContent?.trim() ?? null;
            const countVisible = badge ? !badge.classList.contains("invisible") : false;
            return {
                id: el.getAttribute("data-work-view-id"),
                label,
                ariaSelected: el.getAttribute("aria-selected"),
                countText,
                countVisible,
                width: rect.width,
                left: rect.left,
            };
        });
        return {
            stripPresent: Boolean(strip),
            stripMountId: strip?.getAttribute("data-pill-strip-mount-id") ?? null,
            pillCount: pills.length,
            pills,
        };
    });
}

async function waitForSettledCounts(page, minPills = 4, timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const snap = await readPillSnapshot(page);
        const visibleCounts = snap.pills.filter((p) => p.countVisible && p.countText != null);
        if (visibleCounts.length >= minPills) return snap;
        await page.waitForTimeout(100);
    }
    return readPillSnapshot(page);
}

async function pollDuringAction(page, action, durationMs = 2000, intervalMs = 16) {
    const frames = [];
    const start = Date.now();
    const poll = async () => {
        while (Date.now() - start < durationMs) {
            frames.push({ t: Date.now() - start, ...(await readPillSnapshot(page)) });
            await page.waitForTimeout(intervalMs);
        }
    };
    await Promise.all([poll(), action()]);
    frames.push({ t: Date.now() - start, ...(await readPillSnapshot(page)) });
    return frames;
}

function analyzeFrames(frames, settledBefore, { allowColdUnresolved = false } = {}) {
    const settledMap = new Map(
        settledBefore.pills
            .filter((p) => p.countVisible && p.countText != null)
            .map((p) => [p.id, p.countText]),
    );

    let settledDisappearanceFrames = 0;
    let incorrectZeroFrames = 0;
    let widthShiftFrames = 0;
    const baseWidths = new Map(settledBefore.pills.map((p) => [p.id, p.width]));
    let prevFrame = settledBefore;

    for (const frame of frames) {
        for (const pill of frame.pills) {
            const prior = settledMap.get(pill.id);
            const prevPill = prevFrame.pills.find((p) => p.id === pill.id);
            if (prior == null) continue;

            const wasVisible = prevPill?.countVisible && prevPill?.countText != null;
            const nowVisible = pill.countVisible && pill.countText != null;
            if (wasVisible && !nowVisible && !allowColdUnresolved) settledDisappearanceFrames++;
            if (
                wasVisible &&
                nowVisible &&
                pill.countText === "0" &&
                prior !== "0" &&
                prevPill?.countText !== "0"
            ) {
                incorrectZeroFrames++;
            }
            const baseW = baseWidths.get(pill.id);
            if (baseW != null && Math.abs(pill.width - baseW) > 2) widthShiftFrames++;
        }
        prevFrame = frame;
    }

    const stripMountIds = new Set(frames.map((f) => f.stripMountId).filter(Boolean));
    const pillOrderChanged = frames.some((f) => {
        const ids = f.pills.map((p) => p.id).join(",");
        return ids !== settledBefore.pills.map((p) => p.id).join(",");
    });

    return {
        settledDisappearanceFrames,
        incorrectZeroFrames,
        widthShiftFrames,
        pillStripRemounts: Math.max(0, stripMountIds.size - 1),
        pillReorder: pillOrderChanged ? 1 : 0,
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
            work_view_id: new URL(url).searchParams.get("work_view_id"),
            count_mode: new URL(url).searchParams.get("count_mode"),
        });
    });

    await page.goto(WU_PATH, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector('[data-work-view-id][role="tab"]', { timeout: 120000 });
    const settledInitial = await waitForSettledCounts(page);

    const allLeadsPill = await findPillByLabel(page, "all leads");
    const newLeadsPill = await findPillByLabel(page, "new leads");
    const waitlistPill =
        (await findPillByLabel(page, "waitlist")) ?? (await findPillByLabel(page, "wait list"));

    const switchToAllFrames = allLeadsPill
        ? await pollDuringAction(page, () => allLeadsPill.click(), 2500)
        : [];
    const afterAllLeads = await readPillSnapshot(page);

    const switchToOtherFrames = waitlistPill
        ? await pollDuringAction(page, () => waitlistPill.click(), 2500)
        : [];
    const afterOther = await readPillSnapshot(page);

    const switchBackFrames = newLeadsPill
        ? await pollDuringAction(page, () => newLeadsPill.click(), 2500)
        : [];
    const finalSnap = await readPillSnapshot(page);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-work-view-id][role="tab"]', { timeout: 120000 });
    const refreshFrames = [];
    const refreshStart = Date.now();
    for (let i = 0; i < 120; i++) {
        refreshFrames.push({ t: Date.now() - refreshStart, ...(await readPillSnapshot(page)) });
        const visible = refreshFrames.at(-1)?.pills?.filter((p) => p.countVisible && p.countText != null) ?? [];
        if (visible.length >= 4) break;
        await page.waitForTimeout(50);
    }
    const afterRefresh = await waitForSettledCounts(page);

    const analysis = {
        switchToAll: analyzeFrames(switchToAllFrames, settledInitial),
        switchToOther: analyzeFrames(switchToOtherFrames, settledInitial),
        switchBack: analyzeFrames(switchBackFrames, settledInitial),
        refresh: analyzeFrames(refreshFrames, settledInitial, { allowColdUnresolved: true }),
    };

    const switchAnalyses = [analysis.switchToAll, analysis.switchToOther, analysis.switchBack];
    const totals = {
        settledDisappearanceFrames: switchAnalyses.reduce((s, a) => s + a.settledDisappearanceFrames, 0),
        incorrectZeroFrames: switchAnalyses.reduce((s, a) => s + a.incorrectZeroFrames, 0),
        widthShiftFrames: switchAnalyses.reduce((s, a) => s + a.widthShiftFrames, 0),
        pillStripRemounts: switchAnalyses.reduce((s, a) => s + a.pillStripRemounts, 0),
        pillReorder: switchAnalyses.reduce((s, a) => s + a.pillReorder, 0),
    };

    return {
        run: runIndex,
        settledInitial: settledInitial.pills.map((p) => ({ id: p.id, label: p.label, count: p.countText })),
        afterAllLeads: afterAllLeads.pills.map((p) => ({ id: p.id, label: p.label, count: p.countText })),
        afterOther: afterOther.pills.map((p) => ({ id: p.id, label: p.label, count: p.countText })),
        final: finalSnap.pills.map((p) => ({ id: p.id, label: p.label, count: p.countText })),
        afterRefresh: afterRefresh.pills.map((p) => ({ id: p.id, label: p.label, count: p.countText })),
        analysis,
        totals,
        networkLogCount: networkLog.length,
    };
}

async function main() {
    const baseUrl = process.env.WORK_VIEW_STEP_C_URL ?? "http://127.0.0.1:3001";
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
        settledDisappearanceFrames: runs.reduce((s, r) => s + r.totals.settledDisappearanceFrames, 0),
        incorrectZeroFrames: runs.reduce((s, r) => s + r.totals.incorrectZeroFrames, 0),
        widthShiftFrames: runs.reduce((s, r) => s + r.totals.widthShiftFrames, 0),
        pillStripRemounts: runs.reduce((s, r) => s + r.totals.pillStripRemounts, 0),
        pillReorder: runs.reduce((s, r) => s + r.totals.pillReorder, 0),
    };

    const report = {
        capturedAt: new Date().toISOString(),
        baseUrl,
        path: WU_PATH,
        runs,
        aggregate,
        pass:
            aggregate.settledDisappearanceFrames === 0 &&
            aggregate.incorrectZeroFrames === 0 &&
            aggregate.pillReorder === 0 &&
            aggregate.pillStripRemounts === 0,
    };

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ outPath, aggregate, pass: report.pass, runs: runs.map((r) => r.totals) }, null, 2));
    await browser.close();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
