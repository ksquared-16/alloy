import { test, expect } from "@playwright/test";

/** DIAGNOSTIC (Runtime V1 Realization): why did the streamed layout seed break the reveal? */
const ROUTE = "/workspace/work-unit/new-leads";

test("seed diagnostic", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (m) => {
        if (m.type() === "error" || m.type() === "warning") consoleErrors.push(`[${m.type()}] ${m.text()}`.slice(0, 240));
    });
    page.on("pageerror", (e) => consoleErrors.push(`[pageerror] ${String(e).slice(0, 240)}`));

    const apiCalls: string[] = [];
    page.on("request", (r) => {
        const u = r.url();
        if (/provisioning-answer|view-models\/drawer\/opportunity|work-unit-queue-summaries/.test(u)) {
            apiCalls.push(`${Math.round(performance.now?.() ?? 0)} ${u.replace(/^https?:\/\/[^/]+/, "")}`.slice(0, 160));
        }
    });

    await page.goto(ROUTE, { waitUntil: "commit" });

    const snapshots: Record<string, unknown>[] = [];
    for (const atMs of [3000, 6000, 9000, 13000, 18000]) {
        await page.waitForTimeout(atMs === 3000 ? 3000 : atMs - (snapshots.at(-1)?.t as number ?? 0));
        const snap = await page.evaluate((t) => {
            const grid = document.querySelectorAll("[data-focus-panel-grid-cell]").length;
            const reserved = document.querySelectorAll('[data-focus-panel-cell-reserved="true"]').length;
            const preparing = document.querySelectorAll("[data-focus-panel-cell-preparing]").length;
            const bootShell = document.querySelectorAll('[data-alloy-boot-shell], [data-surface-slot]').length;
            const surfaceSlot = document.querySelector("[data-surface-slot]")?.getAttribute("data-surface-slot") ?? null;
            const provisioned = document.querySelectorAll("[data-provisioned-work-unit-surface], [data-work-unit-surface]").length;
            const bodyLen = document.body?.innerText?.length ?? 0;
            return { t, grid, reserved, preparing, bootShell, surfaceSlot, provisioned, bodyLen };
        }, atMs);
        snapshots.push(snap);
    }

    console.log(`DIAG_SNAPSHOTS ${JSON.stringify(snapshots)}`);
    console.log(`DIAG_API_CALLS ${JSON.stringify(apiCalls)}`);
    console.log(`DIAG_CONSOLE ${JSON.stringify(consoleErrors.slice(0, 25))}`);
    expect(true).toBe(true);
});
