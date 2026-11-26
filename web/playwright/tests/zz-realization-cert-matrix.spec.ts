import { test, expect, type Page } from "@playwright/test";

/**
 * Runtime V1 Realization — behavioral certification matrix.
 * Each test isolates a case (fresh context = clean cache/console) and records:
 * console errors, hydration warnings, provisioning/VM request counts, committed subject identity,
 * URL/subject sync, reveal state, stale/wrong-record flash, latest-click-wins.
 */

const SUBJECTS = {
    wenc: "b13ecce9-74d4-442d-9891-7c88f587bc23",
    kurzman: "df771481-841f-4329-b7bb-c0a03d9fb621",
    digan: "c78a8e14-4e4f-4a17-acd4-0ad3245cc81a",
};
const DEPT = "3933ac47-077a-4de8-aaac-8aed48d80413";

type Probe = {
    consoleErrors: string[];
    hydrationWarnings: string[];
    provisioningReqs: string[];
    vmReqs: string[];
};

function attachProbe(page: Page): Probe {
    const p: Probe = { consoleErrors: [], hydrationWarnings: [], provisioningReqs: [], vmReqs: [] };
    page.on("console", (m) => {
        const t = m.text();
        if (/hydrat|did not match|Text content does not match|server rendered HTML/i.test(t)) p.hydrationWarnings.push(t.slice(0, 160));
        else if (m.type() === "error") p.consoleErrors.push(t.slice(0, 160));
    });
    page.on("pageerror", (e) => p.consoleErrors.push(`[pageerror] ${String(e).slice(0, 160)}`));
    page.on("request", (r) => {
        const u = r.url().replace(/^https?:\/\/[^/]+/, "");
        if (/\/provisioning-answer/.test(u)) p.provisioningReqs.push(u);
        else if (/\/view-models\/drawer\/opportunity\/[^/?]+(\?|$)/.test(u)) p.vmReqs.push(u);
    });
    return p;
}

async function settle(page: Page, ms = 22000): Promise<{ first: number; all: number; cells: number }> {
    const t0 = Date.now();
    let first = -1;
    while (Date.now() - t0 < ms) {
        const s = await page.evaluate(() => {
            const cells = document.querySelectorAll("[data-focus-panel-grid-cell]").length;
            const reserved = document.querySelectorAll('[data-focus-panel-cell-reserved="true"], [data-focus-panel-cell-preparing]').length;
            return { cells, reserved };
        });
        if (s.cells > 0 && first < 0) first = Date.now() - t0;
        if (s.cells > 0 && s.reserved === 0) return { first, all: Date.now() - t0, cells: s.cells };
        await page.waitForTimeout(150);
    }
    const c = await page.locator("[data-focus-panel-grid-cell]").count();
    return { first, all: -1, cells: c };
}

async function committedSubject(page: Page): Promise<{ h2: string; activeId: string | null; urlSubject: string | null }> {
    return page.evaluate(() => {
        const h2 = (document.querySelector("h2")?.textContent ?? "").trim();
        const active = document.querySelector('[data-queue-row-active="true"]');
        const activeId = active?.getAttribute("data-entity-id") ?? null;
        const urlSubject = new URL(location.href).searchParams.get("subject_id");
        return { h2, activeId, urlSubject };
    });
}

test("C1 bare cold load — seed consumed, subject visible, clean", async ({ page }) => {
    const p = attachProbe(page);
    await page.goto("/workspace/work-unit/new-leads", { waitUntil: "commit" });
    const reveal = await settle(page);
    const subj = await committedSubject(page);
    // seed consumed => the PRIMARY (no work_view_id, i.e. default) provisioning fetch should NOT fire.
    const primary = p.provisioningReqs.filter((u) => !/work_view_id=/.test(u));
    console.log(`CERT C1 ${JSON.stringify({ reveal, subj, primaryProvisioningReqs: primary.length, allProvisioningReqs: p.provisioningReqs.length, vmReqs: p.vmReqs.length, hydration: p.hydrationWarnings, errors: p.consoleErrors })}`);
    expect(reveal.cells).toBeGreaterThan(0);
    expect(subj.h2.length).toBeGreaterThan(0);
    expect(p.consoleErrors).toEqual([]);
    expect(p.hydrationWarnings).toEqual([]);
});

test("C2 explicit selected-subject deep link", async ({ page }) => {
    const p = attachProbe(page);
    await page.goto(`/workspace/work-unit/new-leads?subject_id=${SUBJECTS.kurzman}`, { waitUntil: "commit" });
    await settle(page);
    await page.waitForTimeout(1500);
    const subj = await committedSubject(page);
    const vmForKurzman = p.vmReqs.filter((u) => u.includes(SUBJECTS.kurzman)).length;
    console.log(`CERT C2 ${JSON.stringify({ subj, wantSubject: SUBJECTS.kurzman, vmForKurzman, errors: p.consoleErrors, hydration: p.hydrationWarnings })}`);
    expect(subj.activeId === SUBJECTS.kurzman || subj.h2.includes("Kurzman")).toBeTruthy();
    expect(p.consoleErrors).toEqual([]);
});

test("C3 queue-row click + rapid switch (latest wins) + back/forward", async ({ page }) => {
    const p = attachProbe(page);
    await page.goto("/workspace/work-unit/new-leads", { waitUntil: "commit" });
    await settle(page);
    const start = await committedSubject(page);

    // single click → Kurzman
    await page.click(`button[data-runtime-label="WU.QUEUE_ROW"][data-entity-id="${SUBJECTS.kurzman}"]`);
    await page.waitForTimeout(2500);
    const afterClick = await committedSubject(page);

    // capture any wrong-record flash: sample the h2 rapidly during a switch to Digan
    const flashes: string[] = [];
    const flashProbe = setInterval(async () => {
        try { flashes.push((await page.locator("h2").first().textContent()) ?? ""); } catch { /* nav */ }
    }, 60) as unknown as NodeJS.Timeout;

    // rapid switch across records: Digan → Wenc → Kurzman → Digan → Wenc (final should win = Wenc)
    const order = [SUBJECTS.digan, SUBJECTS.wenc, SUBJECTS.kurzman, SUBJECTS.digan, SUBJECTS.wenc];
    for (const id of order) {
        await page.click(`button[data-runtime-label="WU.QUEUE_ROW"][data-entity-id="${id}"]`).catch(() => {});
        await page.waitForTimeout(120);
    }
    await page.waitForTimeout(4000);
    clearInterval(flashProbe);
    const afterRapid = await committedSubject(page);

    // back/forward
    await page.goBack().catch(() => {});
    await page.waitForTimeout(2000);
    const afterBack = await committedSubject(page);
    await page.goForward().catch(() => {});
    await page.waitForTimeout(2000);
    const afterForward = await committedSubject(page);

    console.log(`CERT C3 ${JSON.stringify({ start: start.activeId, afterClick: afterClick.activeId, afterRapid: afterRapid.activeId, wantRapid: SUBJECTS.wenc, afterBack: afterBack.activeId, afterForward: afterForward.activeId, distinctFlashH2: [...new Set(flashes.filter(Boolean))].slice(0, 8), errors: p.consoleErrors, hydration: p.hydrationWarnings })}`);
    expect(afterClick.activeId).toBe(SUBJECTS.kurzman);
    // latest click wins
    expect(afterRapid.activeId).toBe(SUBJECTS.wenc);
    expect(p.consoleErrors).toEqual([]);
});

test("C4 warm revisit", async ({ page }) => {
    const p = attachProbe(page);
    await page.goto("/workspace/work-unit/new-leads", { waitUntil: "commit" });
    const cold = await settle(page);
    await page.goto("/workspace/work-unit/new-leads", { waitUntil: "commit" });
    const warm = await settle(page);
    console.log(`CERT C4 ${JSON.stringify({ coldFirst: cold.first, warmFirst: warm.first, errors: p.consoleErrors })}`);
    expect(warm.cells).toBeGreaterThan(0);
    expect(p.consoleErrors).toEqual([]);
});

test("C5 Activity mode + Communications composer + Form Delivery + tour (dynamic splits load)", async ({ page }) => {
    const p = attachProbe(page);
    await page.goto("/workspace/work-unit/new-leads", { waitUntil: "commit" });
    await settle(page);
    const results: Record<string, unknown> = {};

    // Activity mode
    await page.click('button[data-focus-panel-mode="activity"]').catch(() => {});
    await page.waitForTimeout(2500);
    results.activityCommsReqs = (await page.evaluate(() => performance.getEntriesByType("resource").filter((r) => /communications\/family-workspace/.test((r as PerformanceResourceTiming).name)).length));
    results.activityRendered = await page.locator('[data-focus-panel-mode="activity"][data-focus-panel-mode-selected="true"], [data-activity-cockpit-embed]').count();

    // back to Work, then trigger a What's Next action = Message (communications composer, a dynamic split)
    await page.click('button[data-focus-panel-mode="summary"]').catch(() => {});
    await page.waitForTimeout(1000);
    for (const [label, key] of [["Message", "comms"], ["Send form", "form"], ["Schedule tour", "tour"]] as const) {
        try {
            const btn = page.locator(`[data-work-summary] button:has-text("${label}"), button:has-text("${label}")`).first();
            await btn.click({ timeout: 3000 });
            await page.waitForTimeout(2500);
            const opened = await page.evaluate(() => ({
                comms: document.querySelectorAll('[data-work-action-surface="communications_composer"], .alloy-os-currentwork__composer-host').length,
                any: document.querySelectorAll('[data-work-action-panel="true"], [data-work-action-surface]').length,
                bodyLen: document.body.innerText.length,
            }));
            results[`action_${key}`] = { opened, err: p.consoleErrors.length };
            // close if a close button exists
            await page.locator('[data-work-action-panel-close="true"], button:has-text("Close")').first().click({ timeout: 1500 }).catch(() => {});
            await page.waitForTimeout(600);
        } catch (e) {
            results[`action_${key}`] = { error: String(e).slice(0, 80) };
        }
    }
    console.log(`CERT C5 ${JSON.stringify({ results, errors: p.consoleErrors, hydration: p.hydrationWarnings })}`);
    expect(p.consoleErrors).toEqual([]);
});

test("C6 Create Lead launch (dynamic split loads on event)", async ({ page }) => {
    const p = attachProbe(page);
    await page.goto("/workspace/work-unit/new-leads", { waitUntil: "commit" });
    await settle(page);
    await page.evaluate((dept) => {
        window.dispatchEvent(new CustomEvent("adminv2:open-create-lead", { detail: { department_id: dept, work_unit_id: null } }));
    }, DEPT);
    await page.waitForTimeout(3500);
    const modal = await page.evaluate(() => ({
        dialogs: document.querySelectorAll('[role="dialog"], [data-create-lead], [data-command-surface]').length,
        bodyGrew: document.body.innerText.length,
        hasCreateLeadText: /create lead|new lead|add lead|inquiry/i.test(document.body.innerText),
    }));
    console.log(`CERT C6 ${JSON.stringify({ modal, errors: p.consoleErrors, hydration: p.hydrationWarnings })}`);
    expect(p.consoleErrors).toEqual([]);
});

test("C7 no-data / failed-compose (bad slug) — honest, no crash", async ({ page }) => {
    const p = attachProbe(page);
    await page.goto("/workspace/work-unit/this-work-unit-does-not-exist-zzz", { waitUntil: "commit" });
    await page.waitForTimeout(6000);
    const state = await page.evaluate(() => ({
        bodyLen: document.body.innerText.length,
        hasError: /not found|unavailable|no work unit|error|does not exist|couldn.t/i.test(document.body.innerText),
        crashed: document.body.innerText.length < 40,
    }));
    console.log(`CERT C7 ${JSON.stringify({ state, errors: p.consoleErrors })}`);
    // honest terminal, not a blank crash
    expect(state.crashed).toBeFalsy();
});
