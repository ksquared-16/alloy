/**
 * E1-a/b — Focus Panel seed continuity browser validation.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
loadEnv({ path: path.join(webRoot, ".env.local") });

const outPath = path.join(webRoot, "../docs/sprints/07_2026/focus-panel-seed-continuity-step-e1-report.json");
const WU_PATH = "/workspace/work-unit/new-leads";

async function readFocusPanel(page) {
    return page.evaluate(() => {
        const panel = document.querySelector('[data-inline-focus-panel="true"]');
        const header = document.querySelector('[data-inline-focus-panel-header="true"]');
        const title = header?.querySelector("#admin-focus-panel-title")?.textContent?.trim() ?? null;
        const chips = [...document.querySelectorAll("[data-focus-panel-chip-kind]")].map((el) => ({
            kind: el.getAttribute("data-focus-panel-chip-kind"),
            label: el.textContent?.trim() ?? "",
        }));
        const summary = header?.querySelector(".alloy-os-fp-header-compact__summary-line")?.textContent?.trim() ?? null;
        const bodyText = document.body?.innerText ?? "";
        const genericLoading = /\bLoading…\b/.test(bodyText) || /\bLoading\.\.\.\b/.test(bodyText);
        const resolved = panel?.getAttribute("data-inline-focus-panel-resolved") ?? null;
        return {
            panelPresent: Boolean(panel),
            resolved,
            title,
            chipCount: chips.length,
            chips,
            summaryLine: summary,
            genericLoading,
            blankPanel: Boolean(panel) && !title && chips.length === 0 && resolved !== "true",
        };
    });
}

async function waitForRow(page) {
    await page.waitForSelector('[data-work-view-id][role="tab"]', { timeout: 120000 });
    await page.waitForSelector('[data-queue-region] [data-entity-id]', { timeout: 120000 });
    const rows = page.locator('[data-queue-region] [data-entity-id]');
    return rows.first();
}

async function runPass(page, runIndex) {
    await page.goto(WU_PATH, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForSelector("[data-queue-region]", { timeout: 120000 });
    const row = await waitForRow(page);

    const frames = [];
    const t0 = Date.now();
    await row.click();
    for (let i = 0; i < 80; i++) {
        frames.push({ t: Date.now() - t0, ...(await readFocusPanel(page)) });
        const last = frames.at(-1);
        if (last?.title && last.resolved === "true") break;
        await page.waitForTimeout(50);
    }

    const seedFrame = frames.find((f) => f.title && f.resolved === "false") ?? frames[0];
    const seedChipsFrame = frames.find((f) => f.chipCount > 0 && f.resolved === "false");
    const resolvedFrame = frames.find((f) => f.resolved === "true") ?? frames.at(-1);

    const secondRow = page.locator('[data-queue-region] [data-entity-id]').nth(1);
    const switchFrames = [];
    const t1 = Date.now();
    if ((await secondRow.count()) > 0) {
        await secondRow.click();
        for (let i = 0; i < 40; i++) {
            switchFrames.push({ t: Date.now() - t1, ...(await readFocusPanel(page)) });
            await page.waitForTimeout(16);
        }
    }

    const blankFrames = [...frames, ...switchFrames].filter((f) => f.blankPanel).length;
    const loadingFrames = [...frames, ...switchFrames].filter((f) => f.genericLoading).length;
    const switchHeaderFrame = switchFrames.find((f) => f.title);

    return {
        run: runIndex,
        seedTitleMs: seedFrame?.t ?? null,
        seedChipsMs: seedChipsFrame?.t ?? null,
        seedToResolvedMs: resolvedFrame?.t ?? null,
        switchHeaderMs: switchHeaderFrame?.t ?? null,
        seedTitle: seedFrame?.title ?? null,
        seedChips: seedChipsFrame?.chipCount ?? seedFrame?.chipCount ?? 0,
        resolvedTitle: resolvedFrame?.title ?? null,
        resolvedChipCount: resolvedFrame?.chipCount ?? 0,
        switchImmediateTitle: switchFrames[0]?.title ?? null,
        switchHeaderTitle: switchHeaderFrame?.title ?? null,
        blankFrames,
        loadingFrames,
        frameCount: frames.length + switchFrames.length,
    };
}

function median(nums) {
    const a = nums.filter((n) => typeof n === "number").sort((x, y) => x - y);
    if (!a.length) return null;
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

async function main() {
    const baseUrl = process.env.FOCUS_PANEL_STEP_E1_URL ?? "http://127.0.0.1:3001";
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
        blankFrames: runs.reduce((s, r) => s + r.blankFrames, 0),
        loadingFrames: runs.reduce((s, r) => s + r.loadingFrames, 0),
        seedTitleImmediate: runs.every((r) => r.seedTitle != null && (r.seedTitleMs ?? 999) < 500),
        medians: {
            clickToSeedTitleMs: median(runs.map((r) => r.seedTitleMs)),
            clickToSeedChipsMs: median(runs.map((r) => r.seedChipsMs)),
            seedToResolvedMs: median(runs.map((r) => r.seedToResolvedMs)),
            rowToRowHeaderSwapMs: median(runs.map((r) => r.switchHeaderMs)),
        },
    };

    const report = { capturedAt: new Date().toISOString(), baseUrl, path: WU_PATH, runs, aggregate, pass: aggregate.blankFrames === 0 && aggregate.loadingFrames === 0 };
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ outPath, aggregate, pass: report.pass, runs }, null, 2));
    await browser.close();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
