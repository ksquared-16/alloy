/**
 * Scheduling V1 product-acceptance — full lifecycle.
 * Detail (read-only) → Edit/Create → save → back to Detail; room field + picker;
 * pattern shortcut; new=0 days; resolved labels; Alloy controls; persistence.
 */
import * as fs from "fs";
import * as path from "path";
import { test, expect, type Page } from "@playwright/test";

const SHOT_DIR =
    process.env.SCHEDULING_SHOT_DIR ||
    "/private/tmp/claude-502/-Users-Kelly-Alloy--claude-worktrees-scheduling-v1-impl-7c7908/bf1e5f44-0762-443b-94ae-0c32300886ba/scratchpad/acceptance";

async function snap(page: Page, name: string) {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function openKurzman(page: Page) {
    await page.goto("/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    await page.getByText("Kurzman Family", { exact: false }).first().click();
    await page.waitForTimeout(11000);
    const bos = page.getByRole("button", { name: /^close$/i }).first();
    if (await bos.count()) await bos.click().catch(() => {});
    await page.waitForTimeout(800);
    await page.locator("[data-scheduling-open]").first().waitFor({ timeout: 25000 });
}

test("Scheduling V1 lifecycle acceptance", async ({ page }) => {
    test.setTimeout(300000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 140)));

    await openKurzman(page);
    // Summary reveals WITH the panel from the prebuilt projection — no loading gate.
    const summaryThinking = await page.locator('[data-scheduling-card="true"] [data-scheduling-thinking="true"]').count();
    console.log("SUMMARY_THINKING=" + summaryThinking);
    await snap(page, "L01-summary");

    // Lennon (has a proposed schedule) → opens read-only DETAIL INSTANTLY (prebuilt).
    await page.locator('[data-scheduling-open="05cf9138-7f4f-482c-a839-4644359985d1"]').click({ force: true }).catch(async () => {
        await page.locator("[data-scheduling-open]").first().click({ force: true });
    });
    // Instant: Detail must appear fast (prebuilt data, not a fetch-and-think bootstrap).
    await page.locator('[data-schedule-detail="true"]').waitFor({ timeout: 3500 });
    const detailFirst = await page.locator('[data-schedule-detail="true"]').count();
    const openThinking = await page.locator('[data-scheduling-thinking="true"]').count();
    console.log("OPEN_THINKING=" + openThinking);
    const editBtn = await page.locator('[data-schedule-edit="true"]').count();
    const createBtn = await page.locator('[data-schedule-create-new="true"]').count();
    console.log(`DETAIL_ON_OPEN=${detailFirst} EDIT_BTN=${editBtn} CREATE_BTN=${createBtn}`);
    await snap(page, "L02-detail");

    // Edit → editor with existing values loaded.
    await page.locator('[data-schedule-edit="true"]').click();
    await page.locator('[data-schedule-editor="true"]').waitFor({ timeout: 8000 });
    const editDays = await page.locator('[data-day][aria-pressed="true"]').count();
    const roomVal = (await page.locator('[data-room-value="true"]').innerText().catch(() => "")).trim();
    console.log(`EDIT_LOADED_DAYS=${editDays} ROOM=${JSON.stringify(roomVal)}`);
    await snap(page, "L03-edit");

    // Room field → Change opens the picker (placement resolver), pick recommended.
    await page.locator('[data-room-change="true"]').click();
    await page.locator('[data-room-picker="true"]').waitFor({ timeout: 8000 });
    await page.locator("[data-room-option]").first().waitFor({ timeout: 12000 });
    const roomOptions = await page.locator("[data-room-option]").count();
    console.log(`ROOM_OPTIONS=${roomOptions}`);
    await page.locator("[data-room-option]").first().click();
    await page.locator('[data-schedule-editor="true"]').waitFor({ timeout: 8000 });
    const roomAfterPick = (await page.locator('[data-room-value="true"]').innerText()).trim();
    console.log(`ROOM_AFTER_PICK=${JSON.stringify(roomAfterPick)}`);

    // Save → returns to DETAIL (not stuck in editor).
    await page.locator('[data-schedule-commit="true"]').click({ force: true });
    await page.locator('[data-schedule-detail="true"]').waitFor({ timeout: 12000 });
    console.log("RETURNED_TO_DETAIL=1");
    await snap(page, "L04-back-to-detail");

    // Create new → editor with NO days selected.
    await page.locator('[data-schedule-create-new="true"]').click();
    await page.locator('[data-schedule-editor="true"]').waitFor({ timeout: 8000 });
    const createDays = await page.locator('[data-day][aria-pressed="true"]').count();
    console.log(`CREATE_DAYS_SELECTED=${createDays}`);

    // Pattern shortcut → applies days + hours.
    await page.locator('[data-pattern-shortcut="true"]').click();
    await page.locator('[data-pattern-list="true"]').waitFor({ timeout: 5000 }).catch(() => {});
    const patternOpts = await page.locator("[data-pattern-option]").count();
    if (patternOpts) await page.locator("[data-pattern-option]").first().click();
    await page.waitForTimeout(300);
    const daysAfterPattern = await page.locator('[data-day][aria-pressed="true"]').count();
    console.log(`PATTERN_OPTS=${patternOpts} DAYS_AFTER_PATTERN=${daysAfterPattern}`);
    await snap(page, "L05-create");
    await page.locator('[data-schedule-close="true"]').click();
    await page.waitForTimeout(500);

    // Reload → persistence + resolved labels in summary.
    await openKurzman(page);
    const summary = (await page.locator('[data-scheduling-card="true"]').first().innerText()).replace(/\n+/g, " | ");
    console.log("SUMMARY_RELOAD=" + JSON.stringify(summary.slice(0, 220)));
    const raw = UUID_RE.test(summary) || /full_day|half_day/.test(summary);
    console.log("RAW_IDS=" + raw);
    console.log("NATIVE_CHECKS=" + (await page.locator('[data-schedule-surface] input[type="checkbox"]').count()));
    console.log("PAGE_ERRORS=" + JSON.stringify([...new Set(errors)].slice(0, 6)));

    expect(summaryThinking, "summary reveals with panel (no loading gate)").toBe(0);
    expect(openThinking, "Detail opens instantly (no thinking spinner)").toBe(0);
    expect(detailFirst, "opens on read-only Detail, not editor").toBe(1);
    expect(editBtn, "Edit button present").toBe(1);
    expect(createBtn, "Create new button present").toBe(1);
    expect(editDays, "Edit loaded existing days").toBeGreaterThan(0);
    expect(roomOptions, "room picker lists options").toBeGreaterThan(0);
    expect(createDays, "Create starts with 0 days").toBe(0);
    expect(daysAfterPattern, "pattern shortcut applied days").toBeGreaterThan(0);
    expect(raw, "no raw ids/enums in summary").toBeFalsy();
    expect([...new Set(errors)].filter((e) => !/Hydration failed|didn't match/i.test(e)), "no real errors").toEqual([]);
});
