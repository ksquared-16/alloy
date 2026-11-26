import { test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3013";
const STORAGE = process.env.PLAYWRIGHT_STORAGE_STATE;
const DIR = process.env.EXP2_SHOT_DIR || "/tmp/exp2-shots";
if (STORAGE) test.use({ storageState: STORAGE });
test.describe.configure({ timeout: 4 * 60 * 1000 });

test("EXP-2 builder fidelity", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    fs.mkdirSync(DIR, { recursive: true });
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.goto(`${BASE}/dev/queue-row-surface-editor`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3500);

    // Open the field library (empty canvas → "Click to add content").
    const opener = page.locator("[data-canvas-open-library]").first();
    if (await opener.count()) { await opener.click({ noWaitAfter: true }); await page.waitForTimeout(1500); }
    const markersWhenLibraryOpen = await page.locator('[data-compact-effective="false"]').count();
    await page.screenshot({ path: path.join(DIR, "library-open.png") });

    // Pick an effective field so fields get placed (triggers the Live preview).
    const effectiveField = page.locator('[data-compact-effective="true"]').first();
    if (await effectiveField.count()) { await effectiveField.click({ noWaitAfter: true }); await page.waitForTimeout(2000); }

    const report = await page.evaluate(() => {
        const livePreview = document.querySelector("[data-canvas-live-preview]");
        const livePreviewRow = livePreview?.querySelector('[data-runtime-label="WU.QUEUE_ROW"], [data-queue-row-subject]');
        const canvas = document.querySelector("[data-canvas]");
        const notInRowBadges = Array.from(document.querySelectorAll('[data-compact-effective="false"]')).length;
        const bodyLen = (document.body.textContent || "").length;
        return {
            hasLivePreview: !!livePreview,
            livePreviewHasRealRow: !!livePreviewRow,
            livePreviewText: (livePreview?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
            hasCanvas: !!canvas,
            nonEffectiveMarkers: notInRowBadges,
            bodyLen,
        };
    });
    fs.writeFileSync(path.join(DIR, "exp2-report.json"), JSON.stringify({ report, errors: errors.slice(0, 5) }, null, 2));
    await page.screenshot({ path: path.join(DIR, "builder.png"), fullPage: true });
    console.log("@@EXP2@@ " + JSON.stringify({ report, errorCount: errors.length, err0: errors[0] ?? null }));
    await ctx.close();
});
