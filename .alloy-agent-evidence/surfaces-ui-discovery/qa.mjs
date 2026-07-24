/**
 * Authenticated browser QA for Surfaces product UI (embedded editor).
 * BASE=http://127.0.0.1:3012
 *
 * Note: BOS rail / shell layout can yield zero bounding boxes for otherwise-present
 * nodes. Prefer `attached` + `.count()` over Playwright's default `visible` waits.
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
const SURFACES = `${BASE}/organization/surfaces`;

async function main() {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        storageState: AUTH,
        viewport: { width: 1600, height: 1000 },
    });
    const page = await context.newPage();
    const report = { startedAt: new Date().toISOString(), base: BASE, checks: {}, errors: [], steps: [] };

    async function shot(name) {
        await page.screenshot({ path: join(EVIDENCE, `${name}.png`), fullPage: true });
        report.steps.push({ name, url: page.url() });
    }

    async function dismissBos() {
        const close = page.locator("[data-bos-close]").first();
        if (await close.count()) {
            await close.click({ force: true, timeout: 1500 }).catch(() => {});
            await page.waitForTimeout(250);
        }
    }

    async function waitForCount(selector, { min = 1, timeoutMs = 45000 } = {}) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const n = await page.locator(selector).count();
            if (n >= min) return n;
            await page.waitForTimeout(400);
        }
        throw new Error(`Timed out waiting for ${min}+ of ${selector}`);
    }

    async function waitForSurfacesShell({ timeoutMs = 60000 } = {}) {
        const deadline = Date.now() + timeoutMs;
        let lastErr = null;
        while (Date.now() < deadline) {
            try {
                const landing = await page.locator('[data-testid="surfaces-landing"]').count();
                const config = await page.locator('[data-testid="surfaces-configuration-page"]').count();
                if (landing || config) {
                    const thinking = /Thinking\.\./i.test(
                        (await page.locator("body").innerText().catch(() => "")) || "",
                    );
                    if (!thinking) {
                        await dismissBos();
                        return;
                    }
                }
            } catch (err) {
                lastErr = err;
            }
            await page.waitForTimeout(750);
        }
        throw lastErr ?? new Error("Surfaces shell did not stabilize");
    }

    async function step(name, fn) {
        try {
            await fn();
        } catch (err) {
            report.errors.push({ name, message: err instanceof Error ? err.message : String(err) });
            await shot(`error-${name}`).catch(() => {});
        }
    }

    await step("shell", async () => {
        await page.goto(SURFACES, { waitUntil: "domcontentloaded", timeout: 90000 });
        await waitForSurfacesShell();
        const body = (await page.locator("body").innerText().catch(() => "")) || "";
        report.checks.shell = {
            onLogin: page.url().includes("/login"),
            onOrganizationPath: page.url().includes("/organization/surfaces"),
            landing: await page.locator('[data-testid="surfaces-landing"]').count(),
            landingTiles: await page.locator('[data-testid="surfaces-landing"] a, [data-testid="surfaces-landing"] button').count(),
            page: await page.locator('[data-testid="surfaces-configuration-page"], [data-testid="surfaces-configuration-page"]').count()
                + await page.locator('[data-testid="surfaces-landing"]').count(),
            categories: await page.locator('[data-testid="surfaces-section-queue"]').count(),
            conceptualCards:
                /How to start|Ownership|Process \/ workspace binding/i.test(body) &&
                /Choose a category/i.test(body),
            noLandingTiles: !(await page.locator('[data-testid="surfaces-launcher-tiles"]').count()),
            helperCopy: /Choose the Surface category you need to configure/i.test(body),
        };
        await shot("01-surfaces-shell");
    });

    await step("focus-panels", async () => {
        await waitForSurfacesShell();
        // Prefer URL selection — survives Fast Refresh remounts (Thinking…).
        await page.goto(
            `${SURFACES}?section=focus-panels&layout=enrollment-focus-panel-summary`,
            { waitUntil: "domcontentloaded", timeout: 90000 },
        );
        await waitForSurfacesShell();
        await waitForCount('[data-testid="surfaces-selected-workspace"]', { timeoutMs: 25000 });
        await waitForCount('[data-testid="surfaces-tab-overview"]', { timeoutMs: 15000 });
        await waitForCount('[data-testid="surfaces-tab-health"]', { timeoutMs: 10000 });
        await waitForCount('[data-testid="surfaces-tab-history"]', { timeoutMs: 10000 });
        await dismissBos();
        await page.locator('[data-testid="surfaces-tab-history"]').evaluate((el) => {
            el.scrollIntoView({ inline: "nearest", block: "nearest" });
        }).catch(() => {});
        report.checks.focusPanels = {
            items: await page.locator('[data-testid^="surfaces-object-item-"]').count(),
        };
        report.checks.selected = {
            workspace: await page.locator('[data-testid="surfaces-selected-workspace"]').count(),
            overviewTab: await page.locator('[data-testid="surfaces-tab-overview"]').count(),
            editTab: await page.locator('[data-testid="surfaces-tab-edit"]').count(),
            healthTab: await page.locator('[data-testid="surfaces-tab-health"]').count(),
            historyTab: await page.locator('[data-testid="surfaces-tab-history"]').count(),
            tabLabels: await page.locator('[role="tablist"] [role="tab"]').allTextContents(),
            urlHasLayout: page.url().includes("layout=enrollment-focus-panel-summary"),
            stayedOnSurfaces: page.url().includes("/organization/surfaces") || page.url().includes("/settings/surfaces"),
            onOrganizationPath: page.url().includes("/organization/surfaces"),
        };
        await shot("02-selected-overview");
    });

    await step("tabs", async () => {
        for (const [tab, shotName] of [
            ["edit", "03-edit-embedded"],
            ["assignments", "04-assignments"],
            ["versions", "05-versions"],
            ["health", "06-health"],
            ["history", "07-history"],
        ]) {
            const el = page.locator(`[data-testid="surfaces-tab-${tab}"]`);
            await waitForCount(`[data-testid="surfaces-tab-${tab}"]`, { timeoutMs: 10000 });
            await el.evaluate((node) => node.scrollIntoView({ inline: "nearest", block: "nearest" })).catch(() => {});
            await el.click({ force: true });
            if (tab === "edit") {
                await waitForCount('[data-testid="surfaces-edit-tab"]', { timeoutMs: 25000 });
                await page.waitForTimeout(2000);
            } else if (tab === "health") {
                await waitForCount('[data-testid="surfaces-health"]', { timeoutMs: 10000 });
            } else if (tab === "history") {
                await waitForCount('[data-testid="surfaces-history"]', { timeoutMs: 10000 });
            } else {
                await page.waitForTimeout(700);
            }
            await dismissBos();
            await shot(shotName);
        }

        await page.locator('[data-testid="surfaces-tab-edit"]').click({ force: true });
        await waitForCount('[data-testid="surfaces-edit-tab"]', { timeoutMs: 25000 });
        await page.waitForTimeout(1500);
        await dismissBos();

        report.checks.editEmbedded = {
            stillHasCategories: await page.locator('[data-testid="surfaces-section-queue"]').count(),
            stillHasCollection: await page.locator('[data-testid="surfaces-object-queue"]').count(),
            editPane: await page.locator('[data-testid="surfaces-edit-tab"]').count(),
            focusPanelEditor: await page.locator('[data-testid="focus-panel-summary-surface-editor"]').count(),
            backToOverviewLabel: await page.locator('[data-testid="focus-panel-surface-back"]').innerText().catch(() => null),
            urlHasEditor: page.url().includes("editor=1"),
            editTabSelected:
                (await page.locator('[data-testid="surfaces-tab-edit"]').getAttribute("aria-selected")) ===
                "true",
        };
        await shot("03b-edit-embedded-settled");
    });

    await step("queue-rows", async () => {
        await page.locator('[data-testid="surfaces-category-item-queue-rows"]').click({ force: true });
        await page.waitForTimeout(1200);
        const item = page.locator('[data-testid^="surfaces-object-item-"]').first();
        if (await item.count()) {
            await item.click({ force: true });
            await waitForCount('[data-testid="surfaces-tab-edit"]', { timeoutMs: 15000 });
            await page.locator('[data-testid="surfaces-tab-edit"]').click({ force: true });
            await waitForCount('[data-testid="surfaces-edit-tab"]', { timeoutMs: 20000 });
            await page.waitForTimeout(1500);
        }
        await dismissBos();
        report.checks.queueRows = {
            categoriesVisible: await page.locator('[data-testid="surfaces-section-queue"]').count(),
            editPane: await page.locator('[data-testid="surfaces-edit-tab"]').count(),
        };
        await shot("08-queue-row-edit");
    });

    await step("deep-link-edit", async () => {
        await page.locator('[data-testid="surfaces-category-item-focus-panels"]').click({ force: true });
        await page.waitForTimeout(800);
        const first = page.locator('[data-testid^="surfaces-object-item-"]').first();
        let layoutId = null;
        if (await first.count()) {
            const tid = await first.getAttribute("data-testid");
            layoutId = tid?.replace("surfaces-object-item-", "") ?? null;
        }
        if (!layoutId) {
            report.checks.deepLink = { skipped: true };
            return;
        }
        await page.goto(
            `${SURFACES}?section=focus-panels&editor=1&layout=${encodeURIComponent(layoutId)}`,
            { waitUntil: "domcontentloaded", timeout: 90000 },
        );
        await waitForSurfacesShell();
        // Edit tab may paint before the edit pane wrapper if the editor is still hydrating —
        // accept either the tab selected state or the edit pane / editor chrome.
        const deadline = Date.now() + 30000;
        let editReady = false;
        while (Date.now() < deadline) {
            const editPane = await page.locator('[data-testid="surfaces-edit-tab"]').count();
            const editor = await page.locator('[data-testid="focus-panel-summary-surface-editor"]').count();
            const selected =
                (await page.locator('[data-testid="surfaces-tab-edit"]').getAttribute("aria-selected")) ===
                "true";
            const bodyHasBack = /← Overview/i.test((await page.locator("body").innerText().catch(() => "")) || "");
            if ((editPane || editor || bodyHasBack) && selected) {
                editReady = true;
                break;
            }
            await page.waitForTimeout(500);
        }
        if (!editReady) throw new Error("Deep-link did not land in embedded Edit");
        await dismissBos();
        report.checks.deepLink = {
            categoriesVisible: await page.locator('[data-testid="surfaces-section-queue"]').count(),
            editActive: await page.locator('[data-testid="surfaces-edit-tab"]').count(),
            editor: await page.locator('[data-testid="focus-panel-summary-surface-editor"]').count(),
            editTabSelected:
                (await page.locator('[data-testid="surfaces-tab-edit"]').getAttribute("aria-selected")) ===
                "true",
            notFullBleedOnly: await page.locator('[data-testid="surfaces-configuration-page"]').count(),
            bodyHasBack: /← Overview/i.test((await page.locator("body").innerText().catch(() => "")) || ""),
        };
        await shot("09-deep-link-embedded-edit");
    });

    await step("narrow", async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(SURFACES, { waitUntil: "domcontentloaded", timeout: 90000 });
        await waitForSurfacesShell();
        await shot("10-narrow");
    });

    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(join(EVIDENCE, "qa-report.json"), JSON.stringify(report, null, 2));
    await browser.close();

    const deepOk =
        report.checks.deepLink?.skipped ||
        ((report.checks.deepLink?.editActive ||
            report.checks.deepLink?.editor ||
            report.checks.deepLink?.bodyHasBack) &&
            report.checks.deepLink?.editTabSelected &&
            report.checks.deepLink?.categoriesVisible);

    const fail =
        report.errors.length > 0 ||
        report.checks.shell?.onLogin ||
        !report.checks.shell?.landing ||
        !report.checks.shell?.onOrganizationPath ||
        report.checks.shell?.conceptualCards ||
        !report.checks.selected?.overviewTab ||
        !report.checks.selected?.editTab ||
        !report.checks.selected?.healthTab ||
        !report.checks.selected?.historyTab ||
        !report.checks.editEmbedded?.editPane ||
        !report.checks.editEmbedded?.stillHasCollection ||
        !report.checks.editEmbedded?.editTabSelected ||
        report.checks.editEmbedded?.urlHasEditor === true ||
        !deepOk;

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
