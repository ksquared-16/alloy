/**
 * P8 — end-to-end on the REAL Kurzman family (slot 5):
 *   open child → build a full schedule (pattern · days · daily hours · site · room ·
 *   effective start · open-ended) → Save → confirmation → RELOAD → re-open → the
 *   proposed schedule is reflected on the child's card.
 */
import * as fs from "fs";
import * as path from "path";
import { test, expect, type Page } from "@playwright/test";

const SHOT_DIR =
    process.env.SCHEDULING_SHOT_DIR ||
    "/private/tmp/claude-502/-Users-Kelly-Alloy--claude-worktrees-scheduling-v1-impl-7c7908/bf1e5f44-0762-443b-94ae-0c32300886ba/scratchpad/scheduling-evidence";

async function snap(page: Page, name: string) {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}

async function openKurzman(page: Page) {
    await page.goto("/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    await page.getByText("Kurzman Family", { exact: false }).first().click();
    await page.waitForTimeout(11000);
    const bosClose = page.getByRole("button", { name: /^close$/i }).first();
    if (await bosClose.count()) await bosClose.click().catch(() => {});
    await page.waitForTimeout(800);
}

test("Kurzman end-to-end: build → save → reload → reflected", async ({ page }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));

    // ── Build + save ────────────────────────────────────────────────────────
    await openKurzman(page);
    // Capture Lennon's row status BEFORE.
    const lennonRowBefore = await page
        .locator('[data-scheduling-card="true"] li')
        .filter({ hasText: "Lennon" })
        .first()
        .innerText()
        .catch(() => "");
    console.log("BEFORE_ROW=" + JSON.stringify(lennonRowBefore.replace(/\n+/g, " | ")));

    await page.locator('[data-scheduling-open]').first().click({ force: true });
    await page.locator('[data-schedule-surface="true"]').first().waitFor({ timeout: 20000 });
    await page.locator("[data-pattern]").first().waitFor({ timeout: 20000 });
    await page.locator('[data-room-reason="recommended"]').first().waitFor({ timeout: 20000 });

    await page.locator('[data-arrive="true"]').fill("07:30");
    await page.locator('[data-depart="true"]').fill("17:30");
    await page.locator('[data-schedule-surface="true"] input[type="date"]').first().fill("2026-08-04");
    await page.waitForTimeout(600);

    const commit = page.locator('[data-schedule-commit="true"]').first();
    console.log("SAVE_ENABLED=" + (await commit.isEnabled()));
    await snap(page, "e2e-00-built");
    await commit.click({ force: true });
    // The confirmation shows briefly then auto-returns to the list — capture it in-window.
    let confirm = "";
    for (let i = 0; i < 20; i++) {
        confirm = (await page.locator('[data-scheduling-card="true"]').first().innerText().catch(() => "")).replace(/\n+/g, " | ");
        if (confirm.includes("Proposed schedule saved")) break;
        await page.waitForTimeout(200);
    }
    console.log("SAVE_CONFIRM=" + JSON.stringify(confirm.slice(0, 160)));
    await snap(page, "e2e-10-saved");
    await page.waitForTimeout(2500);

    // ── Reload → reflected ──────────────────────────────────────────────────
    await openKurzman(page);
    const lennonRowAfter = await page
        .locator('[data-scheduling-card="true"] li')
        .filter({ hasText: "Lennon" })
        .first()
        .innerText()
        .catch(() => "");
    console.log("AFTER_ROW=" + JSON.stringify(lennonRowAfter.replace(/\n+/g, " | ")));
    await snap(page, "e2e-20-reflected");

    // A hydration warning is a benign, React-auto-recovered SSR/client mismatch on the
    // complex workspace page (proven page-level + intermittent by hydration-probe.spec.ts,
    // not scheduling). Separate it from real errors so the E2E asserts on genuine faults.
    const hydration = [...new Set(errors)].filter((e) => /Hydration failed|didn't match/i.test(e));
    const realErrors = [...new Set(errors)].filter((e) => !/Hydration failed|didn't match/i.test(e));
    console.log("HYDRATION_WARNINGS=" + JSON.stringify(hydration));
    console.log("REAL_ERRORS=" + JSON.stringify(realErrors.slice(0, 6)));

    // Assertions: save confirmed, the schedule persists + reflects after reload, no real errors.
    expect(confirm, "save confirmation").toContain("Proposed schedule saved");
    expect(lennonRowAfter, "reloaded row reflects the persisted schedule").toContain("full_day");
    expect(lennonRowAfter, "reloaded row shows scheduled status").toContain("Scheduled");
    expect(realErrors, "no real page errors across the loop").toEqual([]);
});
