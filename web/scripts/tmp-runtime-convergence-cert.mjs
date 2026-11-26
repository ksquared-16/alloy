/**
 * Final convergence browser certification — Slot 5 Assignments Workspace.
 * Do not commit. Evidence → docs/audits/active/assignment-runtime-convergence-qa/
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3015";
const OUT = join(process.cwd(), "../docs/audits/active/assignment-runtime-convergence-qa");
mkdirSync(OUT, { recursive: true });
const lines = [];
const log = (l) => {
  lines.push(l);
  console.log(l);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState:
    process.env.PLAYWRIGHT_STORAGE_STATE ||
    `${process.env.HOME}/.local/state/alloy-dev/auth/slot5/storage-state.json`,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const shot = async (n) => {
  await page.screenshot({ path: join(OUT, `${n}.png`), fullPage: false });
  log(`SHOT ${n}`);
};

const openScheduling = async () => {
  const t0 = Date.now();
  for (let i = 0; i < 4; i++) {
    const trigger = page.locator('[data-adminv2-sidebar-modal-nav="scheduling"]').first();
    if ((await trigger.count()) === 0) {
      await page.waitForTimeout(1500);
      continue;
    }
    await trigger.click({ force: true });
    try {
      await page.locator('[data-adminv2-scheduling-modal="true"]').waitFor({ timeout: 20000 });
      log(`MODAL_OPEN_MS=${Date.now() - t0}`);
      return;
    } catch {
      /* retry */
    }
  }
  throw new Error("Could not open Assignments workspace modal");
};

try {
  await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  log(`URL_AFTER_LOGIN=${page.url()}`);
  if (page.url().includes("/login")) {
    throw new Error("Auth storage expired — still on /login");
  }

  // ── Workspace runtime + expand ──────────────────────────────────────────
  await openScheduling();
  await page.waitForTimeout(2500);
  const timings = page.locator("[data-assignments-ws-timings]");
  await timings.waitFor({ timeout: 45000 }).catch(() => {});
  const coreReady = await timings.getAttribute("data-ws-core-ready").catch(() => null);
  const coreMs = await timings.getAttribute("data-ws-core-ms").catch(() => null);
  const shellMs = await timings.getAttribute("data-ws-shell-ms").catch(() => null);
  log(`RUNTIME coreReady=${coreReady} shellMs=${shellMs} coreMs=${coreMs}`);
  await shot("01-workspace-overview");

  // Expand / Restore
  const expandBtn = page.locator("[data-workspace-expand-control]").first();
  log(`EXPAND_CONTROL=${await expandBtn.count()}`);
  if (await expandBtn.count()) {
    await expandBtn.click();
    await page.waitForTimeout(400);
    log(
      `EXPANDED=${await page.locator('[data-workspace-expanded="true"]').count()} BOS=${await page.locator("[data-adminv2-bos-rail-overlay='true'], [data-adminv2-workspace-command-column]").count()}`,
    );
    await shot("02-workspace-expanded");
    await expandBtn.click();
    await page.waitForTimeout(300);
  }

  // Instant tab switches (Studio Categories / Patterns) — should not cold-load
  await page.waitForTimeout(4000); // allow shared snapshot
  const coreReady2 = await page.locator("[data-assignments-ws-timings]").getAttribute("data-ws-core-ready").catch(() => null);
  const coreMs2 = await page.locator("[data-assignments-ws-timings]").getAttribute("data-ws-core-ms").catch(() => null);
  log(`RUNTIME_AFTER_WAIT coreReady=${coreReady2} coreMs=${coreMs2}`);

  // Prefer a concrete site when available
  const siteSelect = page.locator('[data-testid="scheduling-site-select"], [data-scheduling-site-select]').first();
  if (await siteSelect.count()) {
    await siteSelect.click().catch(() => {});
    await page.getByRole("option").nth(1).click().catch(() => {});
    await page.waitForTimeout(2500);
  }

  const tCat = Date.now();
  await page.locator('[data-scheduling-mode-tab="studio"], button:has-text("Studio")').first().click({ force: true });
  await page.waitForTimeout(400);
  await page.locator('button:has-text("Assignment Categories"), [data-scheduling-section-tab="types"]').first().click({ force: true }).catch(() => {});
  await page.locator("[data-assignment-category-landing], [data-assignment-kind-list], [data-assignment-category-card]").first().waitFor({ timeout: 20000 }).catch(() => {});
  log(`CATEGORIES_TAB_MS=${Date.now() - tCat} cards=${await page.locator("[data-assignment-category-card]").count()}`);
  const bodyText = await page.locator("[data-scheduling-studio]").innerText().catch(() => "");
  const rawKeyHits = (bodyText.match(/\b(pre_k|full_day|program_match|assignment_type_id)\b/g) || []).length;
  log(`CATEGORIES_RAW_KEYS=${rawKeyHits}`);
  await shot("03-categories");

  const tPat = Date.now();
  await page.locator('button:has-text("Patterns"), [data-scheduling-section-tab="patterns"]').first().click({ force: true });
  await page.locator("[data-scheduling-pattern], [data-pattern-editor]").first().waitFor({ timeout: 20000 }).catch(() => {});
  log(`PATTERNS_TAB_MS=${Date.now() - tPat} patterns=${await page.locator("[data-scheduling-pattern]").count()}`);
  await shot("04-patterns");

  // Room Board
  await page.locator('[data-scheduling-mode-tab="work"], button:has-text("Work")').first().click({ force: true });
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Roster"), [data-scheduling-section-tab="roster"]').first().click({ force: true });
  await page.waitForTimeout(800);
  await page.locator('button:has-text("Room Board"), button:has-text("Rooms")').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(1500);
  log(
    `ROOM_BOARD rooms=${await page.locator("[data-scheduling-roster-room]").count()} cells=${await page.locator("[data-scheduling-roster-cell]").count()} proposed=${await page.locator("[data-scheduling-cell-proposed]").count()} toggles=${await page.locator("text=Daily Roster").count()}`,
  );
  await shot("05-room-board");

  // Room name → weekly detail
  const roomBtn = page.locator("[data-scheduling-roster-room]").first();
  if (await roomBtn.count()) {
    await roomBtn.click();
    await page.waitForTimeout(600);
    log(
      `WEEKLY_DETAIL scope=${await page.locator('[data-scheduling-room-detail-scope="weekly"]').count()} header=${await page.locator("[data-room-week-header]").count()}`,
    );
    await shot("06-room-weekly");
    await page.locator('[aria-label="Close room detail"]').click().catch(() => {});
  }

  // Cell → daily detail
  const cell = page.locator("[data-scheduling-roster-cell]:not([data-cell-state=closed])").first();
  if (await cell.count()) {
    await cell.click();
    await page.waitForTimeout(600);
    log(
      `DAILY_DETAIL scope=${await page.locator('[data-scheduling-room-detail-scope="daily"]').count()} header=${await page.locator("[data-room-day-header]").count()}`,
    );
    await shot("07-room-daily");
  }

  // Operational roster + Proposed
  await page.getByRole("button", { name: /Assignments|Operational/i }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  log(
    `ROSTER subjects=${await page.locator("[data-assignment-roster-subject]").count()} proposed=${await page.locator("[data-assignment-roster-proposed]").count()} avatars=${await page.locator("[data-assignment-roster-avatar]").count()}`,
  );
  await shot("08-operational-roster");

  // Close workspace
  await page.locator('[aria-label="Close assignments"]').click().catch(async () => {
    await page.keyboard.press("Escape");
  });
  await page.waitForTimeout(500);

  // ── Locations Pattern Save ──────────────────────────────────────────────
  await page.goto(`${BASE}/adminV2/settings/locations`, { waitUntil: "domcontentloaded" }).catch(async () => {
    await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
  });
  await page.waitForTimeout(3000);
  // Prefer sidebar Organization → Locations if settings route differs
  const locNav = page.locator("text=Locations").first();
  if (await locNav.count()) {
    await locNav.click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  const schedNav = page.getByText(/Scheduling|Schedule Patterns|Patterns/i).first();
  if (await schedNav.count()) {
    await schedNav.click().catch(() => {});
    await page.waitForTimeout(1500);
  }
  const soccer = page.getByText(/Soccer Shots/i).first();
  if (await soccer.count()) {
    await soccer.click();
    await page.waitForTimeout(1000);
  } else {
    const anyPattern = page.locator("[data-testid='locations-schedule-detail'], [data-testid='locations-schedule-edit'], [data-testid='locations-schedule-save']").first();
    if ((await page.locator("text=Edit schedule").count()) || (await anyPattern.count())) {
      log("PATTERN_PANEL_PRESENT");
    }
  }
  // Auto-edit should show Save
  const saveBtn = page.getByTestId("locations-schedule-save");
  const editBtn = page.getByTestId("locations-schedule-edit");
  if ((await saveBtn.count()) === 0 && (await editBtn.count())) {
    await editBtn.click();
    await page.waitForTimeout(400);
  }
  log(
    `LOCATIONS_SAVE visible=${await saveBtn.count()} disabled=${await saveBtn.isDisabled().catch(() => "n/a")} sticky=${await page.locator("[data-locations-schedule-actions]").count()}`,
  );
  await shot("09-locations-pattern");

  // ── Live Work Unit Children avatar ──────────────────────────────────────
  await page.goto(`${BASE}/workspace/work-unit/new-leads`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await page.getByRole("button", { name: /^close$/i }).first().click().catch(() => {});
  const search = page.getByTestId("wu-record-filter-search");
  if (await search.count()) {
    await search.fill("Kurzman");
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /Kurzman Family/i }).first().click().catch(async () => {
      await page.getByText(/Kurzman/i).first().click();
    });
    await page.waitForTimeout(8000);
  }
  // Open Children card / Context Facts
  await page.locator('[data-universal-card-key="children"], [data-children-card="true"]').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /Edit|Context Facts/i }).first().click().catch(() => {});
  await page.waitForTimeout(1000);
  const avatarUpload =
    (await page.locator("[data-child-edit-avatar-upload], [data-child-avatar-upload]").count()) +
    (await page.locator("[data-identity-avatar-editable='true']").count());
  log(
    `AVATAR_CONTROLS=${avatarUpload} editForm=${await page.locator("[data-child-focus-edit]").count()} photosAttr=${await page.locator("[data-child-edit-photos]").first().getAttribute("data-child-edit-photos").catch(() => null)}`,
  );
  await shot("10-children-edit-avatar");

  writeFileSync(join(OUT, "evidence.txt"), lines.join("\n") + "\n");
  log(`DONE evidence → ${OUT}`);
} catch (e) {
  log(`FAIL ${e?.message || e}`);
  await shot("99-fail");
  writeFileSync(join(OUT, "evidence.txt"), lines.join("\n") + "\n");
  process.exitCode = 1;
} finally {
  await browser.close();
}
