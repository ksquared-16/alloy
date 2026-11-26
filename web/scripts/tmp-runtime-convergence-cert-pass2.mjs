/**
 * Pass 2: Room Board drill-in, Locations Pattern Save, Kurzman Children avatar.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3015";
const OUT = join(process.cwd(), "../docs/audits/active/assignment-runtime-convergence-qa");
mkdirSync(OUT, { recursive: true });
const lines = [];
const L = (l) => {
  console.log(l);
  lines.push(l);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: `${process.env.HOME}/.local/state/alloy-dev/auth/slot5/storage-state.json`,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const shot = async (n) => {
  await page.screenshot({ path: join(OUT, `${n}.png`), fullPage: false });
  L(`SHOT ${n}`);
};

try {
  await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await page.locator("[data-adminv2-sidebar-modal-nav=scheduling]").first().click({ force: true });
  await page.locator("[data-adminv2-scheduling-modal=true]").waitFor({ timeout: 30000 });
  await page.waitForTimeout(3500);

  const site = page.getByTestId("scheduling-workspace-shell").getByLabel("Site");
  if (await site.count()) {
    await site.selectOption({ label: "North Campus" }).catch(async () => {
      await site.click();
      await page.getByRole("option", { name: /North Campus/i }).click().catch(() => {});
    });
    await page.waitForTimeout(2500);
  }

  await page.locator('[data-workspace-section-tab="roster"]').click();
  await page.waitForTimeout(800);
  await page.locator('[data-assignment-roster-view="rooms"]').click();
  await page.waitForTimeout(2500);
  L(
    `ROOM rooms=${await page.locator("[data-scheduling-roster-room]").count()} cells=${await page.locator("[data-scheduling-roster-cell]").count()} proposed=${await page.locator("[data-scheduling-cell-proposed]").count()} toggles=${await page.locator("text=Daily Roster").count()}`,
  );
  await shot("11-room-board");

  const room = page.locator("[data-scheduling-roster-room]").first();
  if (await room.count()) {
    await room.click();
    await page.waitForTimeout(700);
    const weekHdr = (await page.locator("[data-room-week-header]").innerText().catch(() => "")).replace(/\n/g, " ");
    L(`WEEKLY=${await page.locator('[data-scheduling-room-detail-scope="weekly"]').count()} hdr=${weekHdr}`);
    await shot("12-room-weekly");
    await page.locator('[aria-label="Close room detail"]').click().catch(() => {});
    await page.waitForTimeout(300);
  }

  const cell = page.locator("[data-scheduling-roster-cell]:not([data-cell-state='closed'])").first();
  if (await cell.count()) {
    await cell.click();
    await page.waitForTimeout(700);
    const dayHdr = (await page.locator("[data-room-day-header]").innerText().catch(() => "")).replace(/\n/g, " ");
    L(`DAILY=${await page.locator('[data-scheduling-room-detail-scope="daily"]').count()} hdr=${dayHdr}`);
    await shot("13-room-daily");
  }

  await page.locator('[aria-label="Close assignments"]').click().catch(() => page.keyboard.press("Escape"));
  await page.waitForTimeout(500);

  // Locations Pattern Save
  await page.goto(`${BASE}/adminV2/settings/locations`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  L(`LOC_URL=${page.url()}`);
  await page.getByText(/North Campus/i).first().click().catch(() => {});
  await page.waitForTimeout(800);
  for (const t of ["Scheduling", "Schedule", "Patterns", "Schedule Patterns"]) {
    const n = page.getByRole("button", { name: new RegExp(`^${t}$`, "i") });
    if (await n.count()) {
      await n.first().click().catch(() => {});
      await page.waitForTimeout(500);
    }
  }
  await page.getByText(/Soccer Shots/i).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  if (await page.getByTestId("locations-schedule-edit").count()) {
    await page.getByTestId("locations-schedule-edit").click();
    await page.waitForTimeout(500);
  }
  L(
    `LOC_SAVE=${await page.getByTestId("locations-schedule-save").count()} sticky=${await page.locator("[data-locations-schedule-actions]").count()} disabled=${await page.getByTestId("locations-schedule-save").isDisabled().catch(() => "n/a")}`,
  );
  await shot("14-locations-pattern-save");

  // Kurzman Children avatar
  await page.goto(`${BASE}/workspace/work-unit/new-leads`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await page.getByRole("button", { name: /^close$/i }).first().click().catch(() => {});
  await page.getByTestId("wu-record-filter-search").fill("Kurzman");
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: /Kurzman Family/i }).first().click({ timeout: 20000 });
  await page.waitForTimeout(10000);
  await page.locator('[data-universal-card-key="children"]').first().scrollIntoViewIfNeeded().catch(() => {});
  await page.locator('[data-universal-card-key="children"]').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(1200);
  await page.getByText(/Lennon/i).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(800);
  if ((await page.locator("[data-child-focus-edit]").count()) === 0) {
    await page.getByRole("button", { name: /^Edit$/i }).first().click({ force: true }).catch(async () => {
      await page.locator("button:has-text('Edit')").first().click({ force: true }).catch(() => {});
    });
  }
  await page.waitForTimeout(1500);
  L(
    `AVATAR upload=${await page.locator("[data-child-edit-avatar-upload], [data-child-avatar-upload]").count()} editable=${await page.locator('[data-identity-avatar-editable="true"]').count()} form=${await page.locator("[data-child-focus-edit]").count()}`,
  );
  await shot("15-kurzman-children-avatar");

  writeFileSync(join(OUT, "evidence-pass2.txt"), lines.join("\n") + "\n");
  L("PASS2_DONE");
} catch (e) {
  L(`PASS2_FAIL ${e?.message || e}`);
  await shot("99-pass2-fail");
  writeFileSync(join(OUT, "evidence-pass2.txt"), lines.join("\n") + "\n");
  process.exitCode = 1;
} finally {
  await browser.close();
}
