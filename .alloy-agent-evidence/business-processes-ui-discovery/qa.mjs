/**
 * Authenticated browser QA for Business Processes product UI.
 * Cookie domain is 127.0.0.1 — BASE=http://127.0.0.1:3012
 */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, "../../web/package.json"));
const { chromium } = require("playwright");

const EVIDENCE = process.env.EVIDENCE || join(__dirname, "qa");
const AUTH =
    process.env.AUTH ||
    `${process.env.HOME}/.local/state/alloy-dev/auth/slot2/storage-state.json`;
const BASE = process.env.BASE || "http://127.0.0.1:3012";

async function main() {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        storageState: AUTH,
        viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    const report = { startedAt: new Date().toISOString(), base: BASE, checks: {}, errors: [], steps: [] };

    async function shot(name) {
        await page.screenshot({ path: join(EVIDENCE, `${name}.png`), fullPage: true });
        report.steps.push({ name, url: page.url() });
    }

    async function step(name, fn) {
        try {
            await fn();
        } catch (err) {
            report.errors.push({ name, message: err instanceof Error ? err.message : String(err) });
            await shot(`error-${name}`).catch(() => {});
        }
    }

    await step("collection", async () => {
        await page.goto(`${BASE}/settings/processes`, { waitUntil: "domcontentloaded", timeout: 90000 });
        await page.waitForTimeout(3500);
        const body = (await page.locator("body").innerText().catch(() => "")) || "";
        report.checks.collection = {
            onLogin: page.url().includes("/login"),
            rail: await page.locator('[data-testid="business-process-collection-rail"]').count(),
            shell: await page.locator('[data-testid="business-process-collection-shell"]').count(),
            conceptualCards: /Ownership|How to start|Location activation/i.test(body) &&
                /Open a section/i.test(body),
            noDomainTiles: !(await page.locator('[data-testid="business-processes-launcher-tiles"]').count()),
        };
        await shot("01-process-collection");
    });

    await step("select-process", async () => {
        const row = page.locator('[data-testid^="business-process-collection-item-"]').first();
        if (!(await row.count())) {
            report.checks.selected = { skipped: true };
            return;
        }
        await row.click();
        await page.waitForTimeout(2500);
        report.checks.selected = {
            header: await page.locator('[data-testid="business-process-selected-header"]').count(),
            overviewTab: await page.locator('[data-testid="business-process-tab-overview"]').count(),
            noDuplicateNav: (await page.locator('[data-testid="business-process-workspace-nav"]').count()) === 0,
        };
        await shot("02-process-selected-header");
    });

    await step("overview", async () => {
        const tab = page.locator('[data-testid="business-process-tab-overview"]');
        if (await tab.count()) await tab.click();
        await page.waitForTimeout(1000);
        report.checks.overview = {
            panel: await page.locator('[data-testid="business-process-overview-panel"]').count(),
            journey: await page.locator('[data-testid="business-process-overview-journey"]').count(),
        };
        await shot("03-process-overview");
    });

    await step("stages", async () => {
        await page.locator('[data-testid="business-process-tab-stages"]').click();
        await page.waitForTimeout(1500);
        report.checks.stages = {
            list: await page.locator('[data-testid="business-process-list-column"]').count(),
        };
        const stage = page.locator('[data-testid="business-process-list-column"] [role="option"], [data-testid^="business-process-stage-"]').first();
        if (await stage.count()) {
            await stage.click();
            await page.waitForTimeout(1500);
        }
        await shot("04-stages");
    });

    await step("work-views", async () => {
        await page.locator('[data-testid="business-process-tab-work-views"]').click();
        await page.waitForTimeout(1500);
        await shot("05-work-views");
    });

    await step("actions", async () => {
        await page.locator('[data-testid="business-process-tab-actions"]').click();
        await page.waitForTimeout(1500);
        await shot("06-actions");
    });

    await step("automation", async () => {
        await page.locator('[data-testid="business-process-tab-automation"]').click();
        await page.waitForTimeout(800);
        report.checks.automationPlanned = await page.locator('[data-capability="planned"]').count();
        await shot("07-automation");
    });

    await step("health", async () => {
        await page.locator('[data-testid="business-process-tab-health"]').click();
        await page.waitForTimeout(1500);
        await shot("08-health");
    });

    await step("history", async () => {
        await page.locator('[data-testid="business-process-tab-history"]').click();
        await page.waitForTimeout(800);
        report.checks.historyPlanned = await page.locator('[data-capability="planned"]').count();
        await shot("09-history");
    });

    await step("narrow", async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`${BASE}/settings/processes`, { waitUntil: "domcontentloaded", timeout: 90000 });
        await page.waitForTimeout(2500);
        await shot("10-narrow");
    });

    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(join(EVIDENCE, "qa-report.json"), JSON.stringify(report, null, 2));
    await browser.close();

    const fail =
        report.errors.length > 0 ||
        report.checks.collection?.onLogin ||
        !report.checks.collection?.rail ||
        report.checks.collection?.conceptualCards;

    console.log(JSON.stringify({ checks: report.checks, errors: report.errors }, null, 2));
    if (fail) {
        console.error("QA failed");
        process.exit(1);
    }
    console.log("QA ok →", EVIDENCE);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
