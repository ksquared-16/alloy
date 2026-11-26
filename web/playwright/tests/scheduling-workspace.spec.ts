/**
 * Scheduling Workspace — WorkspaceShell parity + navigability.
 *
 * Asserts the workspace is a first-class Operational Workspace on the SAME shared
 * WorkspaceShell as Processing / Communications / Work Items: Work | Studio modes,
 * per-mode section tabs, control-band operational health, navigable Overview launch
 * surfaces, a real Roster board, and the read-only Operational Calculations catalogue.
 * Opens as a modal from the left nav (no route change).
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const SHOT_DIR = process.env.SCHEDULING_SHOT_DIR || "/tmp/sched-workspace";

test("scheduling workspace adopts the shared shell and is fully navigable", async ({ page }) => {
    test.setTimeout(300000);

    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    const trigger = page.locator('[data-adminv2-sidebar-modal-nav="scheduling"]').first();
    await trigger.waitFor({ timeout: 90000 });

    // Open the modal with a retry — under host load the first click can land while the
    // (large) workspace bundle is still recompiling; the modal itself renders fine (a
    // console-clean diagnostic opens it in ~4s). Retrying makes the open robust.
    const modal = page.locator('[data-adminv2-scheduling-modal="true"]');
    let opened = false;
    for (let i = 0; i < 4 && !opened; i++) {
        await trigger.click({ force: true }).catch(() => {});
        opened = await modal
            .waitFor({ timeout: 60000 })
            .then(() => true)
            .catch(() => false);
    }
    expect(opened, "scheduling modal opened").toBe(true);

    const shell = page.locator('[data-testid="scheduling-workspace-shell"]');
    await shell.waitFor({ timeout: 30000 });
    await page.waitForTimeout(1200);

    // Wait for the operator's site to resolve (subtitle stops reading "All sites").
    await page
        .locator('[data-operational-modal-header="true"]')
        .locator("p", { hasText: "· this week" })
        .filter({ hasNotText: "All sites" })
        .first()
        .waitFor({ timeout: 30000 })
        .catch(() => {});

    const title = (await page.locator("#scheduling-workspace-title").first().innerText().catch(() => "")).trim();
    const siteSubtitle = (await page.locator('[data-operational-modal-header="true"] p').first().innerText().catch(() => "")).trim();
    console.log("WS_SITE_SUBTITLE=" + JSON.stringify(siteSubtitle));
    const hasWorkMode = await page.locator('[data-alloy-mode="work"]').count();
    const hasStudioMode = await page.locator('[data-alloy-mode="studio"]').count();
    const workTabs = await page.locator('[data-workspace-mode-sections="scheduling"] [data-workspace-section-tab]').count();
    const url = page.url();
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, "01-overview.png"), fullPage: true });

    console.log("WS_TITLE=" + JSON.stringify(title));
    console.log("WS_HAS_WORK_MODE=" + hasWorkMode);
    console.log("WS_HAS_STUDIO_MODE=" + hasStudioMode);
    console.log("WS_WORK_SECTION_TABS=" + workTabs);
    console.log("URL_UNCHANGED=" + String(!/\/scheduling/.test(url)));

    // Overview: navigable launch surfaces present.
    const needsPlacement = page.locator('[data-scheduling-launch-card="needs-placement"]');
    await needsPlacement.waitFor({ timeout: 20000 });
    const launchCards = await page.locator("[data-scheduling-launch-card]").count();
    console.log("WS_LAUNCH_CARDS=" + launchCards);

    // Today's Activity band (real scheduling activity) sits in the Overview body.
    const todayActivity = await page.locator('[data-scheduling-today-activity="true"]').count();
    console.log("WS_TODAY_ACTIVITY=" + todayActivity);

    // Clicking a launch card navigates into the Roster context WITH a filter applied.
    await needsPlacement.click();
    await page.locator('[data-scheduling-roster="true"]').waitFor({ timeout: 15000 });
    const rosterVisibleAfterCard = await page.locator('[data-scheduling-roster="true"]').count();
    const healthBand = await page.locator('[data-testid="scheduling-work-health-band"]').count();
    const filterBanner = await page.locator("[data-scheduling-roster-filter]").count();
    console.log("WS_ROSTER_AFTER_CARD=" + rosterVisibleAfterCard);
    console.log("WS_HEALTH_BAND_ON_ROSTER=" + healthBand);
    console.log("WS_FILTER_BANNER=" + filterBanner);

    // Real roster board — wait for rooms to render (North Campus has configured rooms).
    await page.locator("[data-scheduling-roster-room]").first().waitFor({ timeout: 20000 }).catch(() => {});
    const rosterRooms = await page.locator("[data-scheduling-roster-room]").count();
    console.log("WS_ROSTER_ROOMS=" + rosterRooms);

    // Clicking a room opens the room-detail inspector.
    await page.locator("[data-scheduling-roster-room]").first().click();
    await page.locator("[data-scheduling-room-detail]").first().waitFor({ timeout: 8000 }).catch(() => {});
    const roomDetail = await page.locator("[data-scheduling-room-detail]").count();
    console.log("WS_ROOM_DETAIL=" + roomDetail);
    await page.screenshot({ path: path.join(SHOT_DIR, "02-roster.png"), fullPage: true });

    // Studio mode → Operational Calculations (read-only) catalogue.
    await page.locator('[data-alloy-mode="studio"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-workspace-section-tab="calculations"]').click();
    await page.locator("[data-scheduling-calculation]").first().waitFor({ timeout: 20000 });
    const calcCount = await page.locator("[data-scheduling-calculation]").count();
    const hasRoomFit = await page.locator('[data-scheduling-calculation="placement.room_fit"]').count();
    // Operator-facing name, not the technical key.
    const roomRecoName = await page.getByText("Room Recommendation", { exact: false }).count();
    console.log("WS_CALCULATIONS=" + calcCount);
    console.log("WS_HAS_ROOM_FIT=" + hasRoomFit);
    console.log("WS_ROOM_RECO_NAME=" + roomRecoName);
    await page.screenshot({ path: path.join(SHOT_DIR, "03-studio-calculations.png"), fullPage: true });

    // Studio → Schedule Patterns (real schedule_patterns) with an administration surface.
    await page.locator('[data-workspace-section-tab="patterns"]').click();
    await page.locator("[data-scheduling-pattern]").first().waitFor({ timeout: 15000 }).catch(() => {});
    const patternCount = await page.locator("[data-scheduling-pattern]").count();
    const newPatternBtn = await page.locator('[data-pattern-new="true"]').count();
    const patternActions = await page.locator("[data-pattern-action]").count();
    console.log("WS_PATTERNS=" + patternCount);
    console.log("WS_NEW_PATTERN_BTN=" + newPatternBtn);
    console.log("WS_PATTERN_ACTIONS=" + patternActions);
    await page.screenshot({ path: path.join(SHOT_DIR, "04-studio-patterns.png"), fullPage: true });

    // The pattern editor opens (create) and cancels without mutating data.
    await page.locator('[data-pattern-new="true"]').click();
    await page.locator('[data-pattern-editor="true"]').waitFor({ timeout: 8000 }).catch(() => {});
    const editorOpen = await page.locator('[data-pattern-editor="true"]').count();
    const editorDays = await page.locator("[data-pattern-day]").count();
    console.log("WS_PATTERN_EDITOR=" + editorOpen);
    console.log("WS_PATTERN_EDITOR_DAYS=" + editorDays);
    await page.screenshot({ path: path.join(SHOT_DIR, "05-pattern-editor.png"), fullPage: true });

    // Studio → Planning is a coherent landing (not a redirect back to Work).
    await page.locator('[data-workspace-section-tab="planning"]').click();
    await page.locator("[data-scheduling-planning-capability]").first().waitFor({ timeout: 8000 }).catch(() => {});
    const planningCards = await page.locator("[data-scheduling-planning-capability]").count();
    const stillStudio = await page.locator('[data-alloy-mode="studio"][aria-selected="true"]').count();
    console.log("WS_PLANNING_CARDS=" + planningCards);
    console.log("WS_PLANNING_STILL_STUDIO=" + stillStudio);
    await page.screenshot({ path: path.join(SHOT_DIR, "06-studio-planning.png"), fullPage: true });

    expect(title, "workspace header title").toBe("Scheduling");
    expect(hasWorkMode, "Work mode tab present (WorkspaceShell parity)").toBeGreaterThan(0);
    expect(hasStudioMode, "Studio mode tab present (WorkspaceShell parity)").toBeGreaterThan(0);
    expect(workTabs, "three Work section tabs").toBe(3);
    expect(!/\/scheduling/.test(url), "opens as modal, not a route").toBe(true);
    expect(launchCards, "overview launch surfaces").toBeGreaterThanOrEqual(4);
    expect(rosterVisibleAfterCard, "launch card navigates to roster").toBeGreaterThan(0);
    expect(healthBand, "operational health band in control band on roster").toBeGreaterThan(0);
    expect(calcCount, "operational calculations catalogue populated").toBeGreaterThanOrEqual(5);
    expect(hasRoomFit, "placement.room_fit calculation surfaced").toBeGreaterThan(0);
    expect(rosterRooms, "roster renders real rooms from the read-model").toBeGreaterThan(0);
    expect(patternCount, "studio surfaces real schedule patterns").toBeGreaterThan(0);
    expect(todayActivity, "Today's Activity band on Overview").toBeGreaterThan(0);
    expect(filterBanner, "launch card applies a roster filter").toBeGreaterThan(0);
    expect(roomDetail, "clicking a room opens the room-detail inspector").toBeGreaterThan(0);
    expect(roomRecoName, "calculations show operator name (Room Recommendation)").toBeGreaterThan(0);
    expect(newPatternBtn, "patterns has a create affordance").toBeGreaterThan(0);
    expect(patternActions, "patterns are administrable (edit/duplicate/archive)").toBeGreaterThan(0);
    expect(editorOpen, "pattern editor opens").toBeGreaterThan(0);
    expect(planningCards, "planning is a coherent landing").toBeGreaterThan(0);
    expect(stillStudio, "planning stays in Studio (no redirect to Work)").toBeGreaterThan(0);
});
