/**
 * Phase 2C browser acceptance — Assignment operator experience completion.
 * Evidence: ~/.local/state/alloy-dev/evidence/wt5-assignment-platform-phase-2/p2c-shots-*
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { homedir } from "node:os";

const require = createRequire(join(process.cwd(), "package.json"));
const { chromium } = require("@playwright/test");

const BASE = process.env.ALLOY_ACCEPT_BASE || "http://127.0.0.1:3015";
const STORAGE =
  process.env.ALLOY_ACCEPT_STORAGE ||
  join(homedir(), ".local/state/alloy-dev/auth/slot5/storage-state.json");
const EVIDENCE =
  process.env.ALLOY_ACCEPT_EVIDENCE ||
  join(homedir(), ".local/state/alloy-dev/evidence/wt5-assignment-platform-phase-2");

await mkdir(EVIDENCE, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const shots = join(EVIDENCE, `p2c-shots-${stamp}`);
await mkdir(shots, { recursive: true });

const report = { stamp, base: BASE, scenarios: [], defects: [], notes: [] };

async function shot(page, name) {
  const path = join(shots, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  return path;
}

function add(scenario, result, detail, evidence) {
  report.scenarios.push({ scenario, result, detail, evidence });
  if (result === "fail") report.defects.push({ scenario, detail });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: STORAGE,
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage();

try {
  await page.goto(`${BASE}/adminV2/scheduling`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(3000);
  const overviewShot = await shot(page, "01-scheduling-overview");
  const onLogin = page.url().includes("/login");
  const attn = page.locator("[data-assignment-attention], [data-testid=scheduling-assignment-attention]");
  const hasAttn = (await attn.count()) > 0;
  add(
    "workspace-overview",
    onLogin ? "fail" : hasAttn ? "pass" : "partial",
    onLogin
      ? "Redirected to login"
      : hasAttn
        ? "Overview shows Assignment attention strip"
        : `Overview loaded without assignment attention (url=${page.url()})`,
    overviewShot
  );

  // New Leads → open a record → Scheduling card
  await page.goto(`${BASE}/adminV2/work/new-leads`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(4000);
  const queueShot = await shot(page, "02-new-leads-queue");
  const row = page.locator("[data-queue-row], [data-work-unit-row], tr[data-id], button[data-open-record]").first();
  let opened = false;
  if ((await row.count()) > 0) {
    await row.click({ timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(5000);
    opened = true;
  }
  add(
    "open-record",
    opened ? "pass" : "fail",
    opened ? "Opened a New Leads row" : "No queue row to open",
    queueShot
  );

  const schedCard = page.locator("[data-scheduling-card], [data-universal-card-key=scheduling]").first();
  const schedVisible = (await schedCard.count()) > 0;
  const summaryLine = page.locator("[data-scheduling-summary]").first();
  const summaryText = schedVisible && (await summaryLine.count()) ? await summaryLine.innerText().catch(() => "") : "";
  const summaryShot = await shot(page, "03-scheduling-card-summary");
  const looksLikeScan =
    /·/.test(summaryText) &&
    !/from Aug|from Sep|Monday–Friday/.test(summaryText);
  add(
    "summary-scan-line",
    schedVisible && summaryText ? (looksLikeScan ? "pass" : "partial") : "fail",
    schedVisible
      ? `Summary: ${summaryText.slice(0, 120) || "(empty)"}`
      : "Scheduling card not visible",
    summaryShot
  );

  if (schedVisible) {
    const openChild = page.locator("[data-scheduling-open]").first();
    if ((await openChild.count()) > 0) {
      await openChild.click({ timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(2500);
    }
  }

  const detailShot = await shot(page, "04-assignment-list");
  const assignList = page.locator("[data-assignment-summary], [data-assignment-list]");
  const createBtn = page.locator("[data-schedule-create-new], button:has-text('Add assignment')");
  add(
    "assignment-summary-list",
    (await assignList.count()) > 0 ? "pass" : "partial",
    (await assignList.count()) > 0 ? "Assignment summary list present" : "No assignment summary (may be empty schedule)",
    detailShot
  );

  if ((await createBtn.count()) > 0) {
    await createBtn.first().click({ timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const picker = page.locator("[data-assignment-type-picker]");
    const createShot = await shot(page, "05-create-or-type-picker");
    if ((await picker.count()) > 0) {
      add("create-type-picker", "pass", "Type picker opened for secondary create", createShot);
      const opt = page.locator("[data-assignment-type-option]").first();
      if ((await opt.count()) > 0) {
        await opt.click();
        await page.waitForTimeout(1000);
        const editorShot = await shot(page, "06-assignment-editor");
        add("create-editor", "pass", "Editor opened after type selection", editorShot);
      } else {
        add("create-type-picker-options", "fail", "Type picker empty — types table/migration missing?", createShot);
      }
    } else {
      // First create may open schedule editor without picker
      const editor = page.locator("[data-schedule-editor]");
      add(
        "create-path",
        (await editor.count()) > 0 ? "pass" : "partial",
        (await editor.count()) > 0
          ? "First-assignment schedule editor opened"
          : "Create click did not open picker or editor",
        createShot
      );
    }
  } else {
    add("create-button", "fail", "Add/Create assignment control not found", detailShot);
  }

  // Assignment detail if a row exists
  const assignRow = page.locator("[data-assignment-row]").first();
  if ((await assignRow.count()) > 0) {
    await assignRow.click({ timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const adShot = await shot(page, "07-assignment-detail");
    const props = page.locator("[data-assignment-props]");
    const timeline = page.locator("[data-assignment-timeline]");
    const financial = page.locator("[data-assignment-financial]");
    add(
      "assignment-detail-two-column",
      (await props.count()) > 0 && (await timeline.count()) > 0 && (await financial.count()) > 0 ? "pass" : "fail",
      `props=${await props.count()} timeline=${await timeline.count()} financial=${await financial.count()}`,
      adShot
    );
  } else {
    report.notes.push("No assignment rows to open for detail/timeline cert");
  }
} catch (e) {
  report.defects.push({ scenario: "runner", detail: e instanceof Error ? e.message : String(e) });
} finally {
  await browser.close();
  const out = join(EVIDENCE, `acceptance-phase2c-${stamp}.json`);
  await writeFile(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ reportPath: out, shots, ...report }, null, 2));
  const failed = report.scenarios.some((s) => s.result === "fail") || report.defects.length > 0;
  process.exit(failed ? 1 : 0);
}
