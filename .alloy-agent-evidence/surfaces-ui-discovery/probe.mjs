import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, "../../web/package.json"));
const { chromium } = require("playwright");

const AUTH =
    process.env.AUTH ||
    `${process.env.HOME}/.local/state/alloy-dev/auth/slot2/storage-state.json`;
const BASE = process.env.BASE || "http://127.0.0.1:3012";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
    storageState: AUTH,
    viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
page.on("console", (msg) => {
    if (msg.type() === "error") console.error("console.error:", msg.text());
});
page.on("pageerror", (err) => console.error("pageerror:", err.message));

await page.goto(`${BASE}/settings/surfaces`, { waitUntil: "domcontentloaded", timeout: 90000 });
for (const ms of [2000, 4000, 8000, 12000]) {
    await page.waitForTimeout(ms === 2000 ? 2000 : ms - (ms === 4000 ? 2000 : ms === 8000 ? 4000 : 8000));
    const close = page.locator("[data-bos-close]").first();
    if (await close.count()) await close.click({ timeout: 1000 }).catch(() => {});
    const snap = {
        afterMs: ms,
        url: page.url(),
        page: await page.locator('[data-testid="surfaces-configuration-page"]').count(),
        categories: await page.locator('[data-testid="surfaces-section-queue"]').count(),
        tabOverview: await page.locator('[data-testid="surfaces-tab-overview"]').count(),
        tabEdit: await page.locator('[data-testid="surfaces-tab-edit"]').count(),
        tabHealth: await page.locator('[data-testid="surfaces-tab-health"]').count(),
        tabHistory: await page.locator('[data-testid="surfaces-tab-history"]').count(),
        objects: await page.locator('[data-testid^="surfaces-object-item-"]').count(),
        thinking: /Thinking/i.test(await page.locator("body").innerText().catch(() => "")),
    };
    console.log(JSON.stringify(snap));
    if (snap.page && snap.tabHealth) break;
}

// Select first focus panel if present
const cat = page.locator('[data-testid="surfaces-category-item-focus-panels"]');
if (await cat.count()) await cat.click();
await page.waitForTimeout(800);
const item = page.locator('[data-testid^="surfaces-object-item-"]').first();
if (await item.count()) {
    await item.click();
    await page.waitForTimeout(1200);
}
console.log(
    JSON.stringify({
        selected: {
            workspace: await page.locator('[data-testid="surfaces-selected-workspace"]').count(),
            tabs: {
                overview: await page.locator('[data-testid="surfaces-tab-overview"]').count(),
                edit: await page.locator('[data-testid="surfaces-tab-edit"]').count(),
                health: await page.locator('[data-testid="surfaces-tab-health"]').count(),
                history: await page.locator('[data-testid="surfaces-tab-history"]').count(),
            },
            tabLabels: await page.locator('[role="tablist"] [role="tab"]').allTextContents(),
        },
    }),
);

await browser.close();
