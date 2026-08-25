import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(process.cwd(), "../docs/audits/active/assignment-runtime-convergence-qa");
mkdirSync(OUT, { recursive: true });
const lines = [];
const L = (l) => { console.log(l); lines.push(l); };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: `${process.env.HOME}/.local/state/alloy-dev/auth/slot5/storage-state.json`,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
page.setDefaultTimeout(20000);

try {
  // Room board labels
  await page.goto("http://127.0.0.1:3015/workspace", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.locator("[data-adminv2-sidebar-modal-nav=scheduling]").click({ force: true });
  await page.locator("[data-adminv2-scheduling-modal=true]").waitFor({ timeout: 30000 });
  await page.waitForTimeout(4000);
  const site = page.getByTestId("scheduling-workspace-shell").getByLabel("Site");
  if (await site.count()) await site.selectOption({ label: "North Campus" }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.locator('[data-workspace-section-tab="roster"]').click({ force: true });
  await page.locator('[data-assignment-roster-view="rooms"]').click({ force: true });
  await page.waitForTimeout(2500);
  const meta = await page.locator("[data-scheduling-roster-room]").allTextContents();
  L(`ROOM_META=${JSON.stringify(meta)}`);
  L(`RAW_pre_k=${/\bpre_k\b/.test(meta.join(" "))} CAP_CELL=${await page.locator("text=Capacity unavailable").count()}`);
  await page.screenshot({ path: join(OUT, "17-room-board-labels.png") });

  // Locations Scheduling Save — dismiss BOS via Escape / hide
  await page.goto("http://127.0.0.1:3015/organization/locations", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    document.querySelectorAll('[data-adminv2-bos-rail-overlay="true"]').forEach((el) => {
      el.style.pointerEvents = "none";
      el.style.visibility = "hidden";
    });
  });
  await page.getByText("North Campus").first().click({ force: true });
  await page.waitForTimeout(1000);
  await page.locator('[role="tab"], button').filter({ hasText: /^Scheduling$/ }).first().click({ force: true });
  await page.waitForTimeout(1500);
  await page.getByText(/Soccer Shots/i).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(1200);
  L(`LOC_EDITOR=${await page.locator("[data-locations-schedule-editing=true], [data-testid=locations-schedule-editor]").count()} SAVE=${await page.getByTestId("locations-schedule-save").count()} STICKY=${await page.locator("[data-locations-schedule-actions]").count()}`);
  await page.screenshot({ path: join(OUT, "16-locations-scheduling-save.png") });

  writeFileSync(join(OUT, "evidence-pass3.txt"), lines.join("\n") + "\n");
  L("PASS3_DONE");
} catch (e) {
  L("PASS3_FAIL " + (e.message || e));
  await page.screenshot({ path: join(OUT, "99-pass3-fail.png") }).catch(() => {});
  writeFileSync(join(OUT, "evidence-pass3.txt"), lines.join("\n") + "\n");
  process.exitCode = 1;
} finally {
  await browser.close();
}
