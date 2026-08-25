/**
 * Pass 3b — Locations Pattern Save + Room Board label recheck.
 * Closes BOS overlay first so it cannot intercept clicks.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

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

async function closeBos() {
  await page.locator('[data-adminv2-bos-rail-overlay="true"] button[aria-label="Close"]').click({ force: true }).catch(() => {});
  await page.getByRole("button", { name: /^Close$/i }).filter({ hasText: /^Close$/ }).last().click({ force: true }).catch(() => {});
  await page.waitForTimeout(400);
}

try {
  await page.goto("http://127.0.0.1:3015/organization/locations", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await closeBos();
  await page.getByText("North Campus").first().click({ force: true });
  await page.waitForTimeout(1200);
  await closeBos();
  await page.getByRole("tab", { name: /Scheduling/i }).click({ force: true }).catch(async () => {
    await page.locator("button, a, [role=tab]").filter({ hasText: /^Scheduling$/ }).first().click({ force: true });
  });
  await page.waitForTimeout(1500);
  await closeBos();

  // Prefer Patterns sub-nav if present
  await page.locator("button, a, [role=tab]").filter({ hasText: /Pattern/i }).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(1000);

  await page.getByText(/Soccer Shots/i).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(1500);
  await closeBos();

  // Auto-edit should already show Save; if not, click Edit schedule button (not a wrapper div)
  const save = page.getByTestId("locations-schedule-save");
  if ((await save.count()) === 0) {
    await page.getByRole("button", { name: /Edit schedule/i }).click({ force: true }).catch(() => {});
    await page.waitForTimeout(600);
  }
  L(
    `LOC_SAVE=${await save.count()} sticky=${await page.locator("[data-locations-schedule-actions]").count()} disabled=${await save.isDisabled().catch(() => "n/a")} text=${await save.innerText().catch(() => "")}`,
  );
  await shot("16-locations-scheduling-save");

  // Room board labels
  await page.goto("http://127.0.0.1:3015/workspace", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await closeBos();
  await page.locator("[data-adminv2-sidebar-modal-nav=scheduling]").click({ force: true });
  await page.locator("[data-adminv2-scheduling-modal=true]").waitFor({ timeout: 30000 });
  await page.waitForTimeout(3500);
  const site = page.getByTestId("scheduling-workspace-shell").getByLabel("Site");
  if (await site.count()) await site.selectOption({ label: "North Campus" }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.locator('[data-workspace-section-tab="roster"]').click();
  await page.locator('[data-assignment-roster-view="rooms"]').click();
  await page.waitForTimeout(2500);
  const meta = await page.locator("[data-scheduling-roster-room]").allTextContents();
  L(`ROOM_META_SAMPLE=${JSON.stringify(meta.slice(0, 4))}`);
  L(
    `RAW_pre_k=${meta.join(" ").includes("pre_k")} CAP_UNAVAIL_CELL=${await page.locator("[data-scheduling-cell-metrics]:has-text('Capacity unavailable')").count()} HEALTH_CAP=${await page.locator("[data-scheduling-roster-room]:has-text('Capacity unavailable')").count()}`,
  );
  await shot("17-room-board-labels");

  writeFileSync(join(OUT, "evidence-pass3.txt"), lines.join("\n") + "\n");
  L("PASS3_DONE");
} catch (e) {
  L(`PASS3_FAIL ${e?.message || e}`);
  await shot("99-pass3-fail");
  writeFileSync(join(OUT, "evidence-pass3.txt"), lines.join("\n") + "\n");
  process.exitCode = 1;
} finally {
  await browser.close();
}
