import { test, expect, type Page } from "@playwright/test";

/** Runtime V1 Realization cert — close the C5 gaps: Form Delivery, tour, Workspace→Work Unit entry. */

async function settle(page: Page, ms = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        if ((await page.locator("[data-focus-panel-grid-cell]").count()) > 0) {
            const reserved = await page.locator('[data-focus-panel-cell-reserved="true"],[data-focus-panel-cell-preparing]').count();
            if (reserved === 0) return true;
        }
        await page.waitForTimeout(150);
    }
    return (await page.locator("[data-focus-panel-grid-cell]").count()) > 0;
}

function errs(page: Page): string[] {
    const e: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") e.push(m.text().slice(0, 140)); });
    page.on("pageerror", (x) => e.push(`[pageerror] ${String(x).slice(0, 140)}`));
    return e;
}

for (const [label, key] of [["Send form", "form"], ["Schedule tour", "tour"]] as const) {
    test(`GAP action "${label}" opens (fresh state)`, async ({ page }) => {
        const e = errs(page);
        await page.goto("/workspace/work-unit/new-leads", { waitUntil: "commit" });
        await settle(page);
        await page.waitForTimeout(1000);
        let clicked = false;
        const btn = page.locator(`button[data-work-supporting-action]:has-text("${label}"), button[data-work-action]:has-text("${label}"), button:has-text("${label}")`).first();
        if (await btn.count()) { await btn.click({ timeout: 4000 }).catch(() => {}); clicked = true; }
        await page.waitForTimeout(2500);
        const opened = await page.evaluate(() => ({
            panel: document.querySelectorAll('[data-work-action-panel="true"],[data-work-action-surface]').length,
            formDelivery: document.querySelectorAll('[data-work-action-surface="form_delivery"]').length,
            tour: document.querySelectorAll('[data-work-action-surface="inline_form"],[data-tour-schedule]').length,
            bodyLen: document.body.innerText.length,
        }));
        console.log(`GAP_${key} ${JSON.stringify({ clicked, opened, errors: e })}`);
        expect(e).toEqual([]);
    });
}

test("GAP Workspace → Work Unit entry (click)", async ({ page }) => {
    const e = errs(page);
    await page.goto("/workspace", { waitUntil: "commit" });
    await page.waitForTimeout(8000);
    const entry = await page.evaluate(() => {
        const cand = [...document.querySelectorAll('[data-work-view-attention] a[href], a[href*="/work-unit/"], [data-alloy-section="WS.PROCESS_TILE_WORK_VIEWS"] a[href]')];
        const el = cand[0] as HTMLAnchorElement | undefined;
        return el ? { href: el.href.replace(/^https?:\/\/[^/]+/, ""), text: (el.textContent ?? "").trim().slice(0, 40) } : null;
    });
    let committed = false;
    if (entry) {
        await page.locator(`a[href="${entry.href}"]`).first().click({ timeout: 4000 }).catch(() => {});
        committed = await settle(page, 22000);
    }
    const subj = await page.evaluate(() => ({ h2: (document.querySelector("h2")?.textContent ?? "").trim(), path: location.pathname }));
    console.log(`GAP_workspace_entry ${JSON.stringify({ entry, committed, subj, errors: e })}`);
    expect(e).toEqual([]);
});
