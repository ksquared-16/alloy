/**
 * Cold-load boot shell validation — paste metrics helper or run via Playwright.
 * Measures first branded shell vs blank/generic Loading on /workspace cold entry.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
loadEnv({ path: path.join(webRoot, ".env.local") });

const outPath = path.join(
    webRoot,
    "../docs/sprints/07_2026/perceived-performance-boot-shell-validation.json",
);

async function main() {
    const baseUrl = process.env.BOOT_SHELL_VALIDATION_URL ?? "http://127.0.0.1:3001";
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        baseURL: baseUrl,
        viewport: { width: 1440, height: 960 },
    });
    const page = await context.newPage();

    const { ensureAdminPlaywrightSession } = await import("../playwright/helpers/adminSessionAuth.ts");
    await ensureAdminPlaywrightSession(page);

    const runs = [];
    for (let i = 1; i <= 3; i++) {
        await context.clearCookies();
        await page.goto("/login", { waitUntil: "domcontentloaded" });
        await ensureAdminPlaywrightSession(page);

        const t0 = Date.now();
        await page.goto("/workspace", { waitUntil: "commit" });

        let bootShellMs = null;
        let meaningfulMs = null;
        let sawBlank = true;
        let sawGenericLoading = false;

        for (let tick = 0; tick < 300; tick++) {
            const snap = await page.evaluate(() => {
                const bodyText = document.body?.innerText ?? "";
                const boot = document.querySelector('[data-alloy-operational-boot-shell="true"]');
                const wsSurface = document.querySelector('[data-runtime-label="WS.SURFACE"]');
                const ready = wsSurface?.querySelector(
                    "[data-workspace-header-title], [data-workspace-org-title], [data-ws-business-process-grid], [data-alloy-section='WS.PROCESS_GRID']",
                );
                return {
                    boot: Boolean(boot),
                    ready: Boolean(ready),
                    genericLoading: /\bLoading…\b/.test(bodyText) || /\bLoading\.\.\.\b/.test(bodyText),
                    blank:
                        document.body?.childElementCount === 0 ||
                        (bodyText.trim().length < 8 && !boot && !wsSurface),
                    bodySample: bodyText.slice(0, 120),
                };
            });
            const elapsed = Date.now() - t0;
            if (snap.boot && bootShellMs == null) bootShellMs = elapsed;
            if (snap.ready && meaningfulMs == null) meaningfulMs = elapsed;
            if (snap.genericLoading) sawGenericLoading = true;
            if (snap.boot || snap.ready || snap.bodySample.length > 8) sawBlank = false;
            if (snap.ready) break;
            await page.waitForTimeout(100);
        }

        const cls = await page.evaluate(() => {
            const obs = performance.getEntriesByType("layout-shift");
            return obs.reduce((s, e) => s + (e.value ?? 0), 0);
        });

        runs.push({
            label: `cold-run-${i}`,
            boot_shell_visible_ms: bootShellMs,
            workspace_meaningful_ms: meaningfulMs,
            saw_blank_screen: sawBlank,
            saw_generic_loading_text: sawGenericLoading,
            layout_shift_cls: cls,
            duration_ms: Date.now() - t0,
        });
    }

    function median(nums) {
        if (!nums.length) return null;
        const s = [...nums].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }

    const summary = {
        generated_at: new Date().toISOString(),
        base_url: baseUrl,
        runs,
        median_boot_shell_visible_ms: median(
            runs.map((r) => r.boot_shell_visible_ms).filter((n) => n != null),
        ),
        median_workspace_meaningful_ms: median(
            runs.map((r) => r.workspace_meaningful_ms).filter((n) => n != null),
        ),
        any_blank_screen: runs.some((r) => r.saw_blank_screen),
        any_generic_loading_text: runs.some((r) => r.saw_generic_loading_text),
        median_layout_shift_cls: median(runs.map((r) => r.layout_shift_cls)),
    };

    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    await browser.close();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
