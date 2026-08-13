/**
 * Lighter UI probe after Settlement locator fix.
 * Prewarms drawer VM via API, then checks Tour menu + activity.
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const BASE = process.env.ALLOY_BASE_URL || "http://127.0.0.1:3015";
const outDir =
  "/Users/Kelly/Code/alloy-worktrees/wt5-epp-runtime-convergence/docs/audits/active/enrollment-e2e-tour-reaction-chain";
mkdirSync(outDir, { recursive: true });
const log = [];
const push = (e) => {
  log.push({ t: new Date().toISOString(), ...e });
  console.log(JSON.stringify(e));
  writeFileSync(path.join(outDir, "browser-qa-ui-probe.json"), JSON.stringify(log, null, 2));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const storage = path.join(process.env.HOME, ".local/state/alloy-dev/auth/slot5/storage-state.json");
const state = JSON.parse(readFileSync(storage, "utf8"));
const cookie = state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
const OPP = "d097e1a8-c3c0-4c51-a113-2275b009b9a9";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: storage,
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();
page.setDefaultTimeout(45000);

try {
  // Prewarm family opportunity VM so Focus Settlement is warm.
  const warm = await fetch(`${BASE}/api/admin/view-models/drawer/opportunity/${OPP}`, {
    headers: { Cookie: cookie },
  });
  const warmJson = await warm.json();
  const vm = warmJson.viewModel || warmJson.data?.viewModel || warmJson;
  push({
    step: "prewarm",
    status: warm.status,
    bookings: (vm?.summaries?.active_tour_bookings || []).length,
    activity: (vm?.above_fold?.record?._activity_timeline_events || []).length,
  });

  await page.goto(`${BASE}/workspace/work-unit/waitlist`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForSelector("[data-entity-id]", { timeout: 90000 });
  for (let i = 0; i < 20; i++) {
    if (!(await page.locator("text=Compiling").count())) break;
    await sleep(400);
  }

  const rows = page.locator("[data-entity-id]");
  for (let i = 0; i < (await rows.count()); i++) {
    const t = (await rows.nth(i).innerText()).replace(/\s+/g, " ");
    if (/Lennon/i.test(t)) {
      await rows.nth(i).click();
      push({ step: "row", t: t.slice(0, 100) });
      break;
    }
  }

  await page.waitForSelector("[data-work-tour-menu-trigger]", { timeout: 60000 });

  let settled = null;
  for (let i = 0; i < 30; i++) {
    settled = await page.evaluate(() => window.__ALLOY_FOCUS_SETTLEMENT_DIAG__ || null);
    const marker = await page
      .locator("[data-focus-panel-settlement]")
      .getAttribute("data-focus-panel-settlement")
      .catch(() => null);
    push({
      step: "poll",
      i,
      marker,
      displayVmId: settled?.displayVmId ?? null,
      runtimeError: settled?.runtimeError ?? null,
      bookingCount: settled?.bookingCount ?? null,
      activityCount: settled?.activityCount ?? null,
      settlementSubjectId: settled?.settlementSubjectId ?? null,
    });
    if (marker === "resolved" || (settled?.bookingCount ?? 0) > 0) break;
    if (settled?.runtimeError) break;
    await sleep(2000);
  }

  await page.screenshot({ path: path.join(outDir, "05-ui-probe-whats-next.png") });

  const diag = await page.evaluate(() => {
    const d = window.__ALLOY_FOCUS_CHILD_MISSION_DIAG__ || null;
    const s = window.__ALLOY_FOCUS_SETTLEMENT_DIAG__ || null;
    const card = document.querySelector(
      "[data-current-work-surface='true'], [data-work-card='true']",
    );
    const cardText = (card?.textContent || "").replace(/\s+/g, " ");
    return {
      path: d?.path || null,
      settlement: document
        .querySelector("[data-focus-panel-settlement]")
        ?.getAttribute("data-focus-panel-settlement"),
      hasInvite: /Tour invitation sent/i.test(cardText),
      hasScheduled: /Tour scheduled|Tour rescheduled/i.test(cardText),
      cardSlice: cardText.slice(0, 700),
      settlementDiag: s,
    };
  });
  push({ step: "diag", ...diag });

  if (await page.locator("[data-work-tour-menu-trigger]").count()) {
    await page.locator("[data-work-tour-menu-trigger]").click();
    await sleep(700);
    const menuKeys = await page
      .locator("[data-work-tour-menu] [data-work-supporting-action]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-work-supporting-action")));
    push({
      step: "tour-menu",
      menuKeys,
      pass:
        menuKeys.includes("reschedule_tour") &&
        menuKeys.includes("cancel_tour") &&
        !menuKeys.includes("schedule_tour"),
    });
    await page.screenshot({ path: path.join(outDir, "06-ui-probe-tour-menu.png") });
    await page.keyboard.press("Escape");
  } else {
    push({ step: "tour-menu", menuKeys: [], pass: false, note: "trigger missing" });
  }

  // Activity mode — best effort
  try {
    await page.getByRole("tab", { name: /^Activity$/i }).click({ timeout: 5000 });
    await page.waitForSelector("[data-focus-panel-activity-workspace='true']", {
      timeout: 20000,
    });
    await sleep(1500);
    const activity = await page.evaluate(() => {
      const root =
        document.querySelector("[data-focus-panel-activity-workspace='true']") || document.body;
      const text = (root.textContent || "").replace(/\s+/g, " ");
      return {
        hasInvite: /Tour invitation sent/i.test(text),
        hasScheduled: /Tour scheduled|Tour rescheduled/i.test(text),
        matches: text.match(/Tour [A-Za-z ]{3,40}/g)?.slice(0, 10) || [],
      };
    });
    push({ step: "activity-mode", ...activity });
    await page.screenshot({ path: path.join(outDir, "07-ui-probe-activity.png") });
  } catch (e) {
    push({ step: "activity-mode", error: String(e.message || e) });
  }

  push({
    step: "SUMMARY",
    settlementResolved: diag.settlement === "resolved",
    tourMenuPass: Boolean(
      log.find((e) => e.step === "tour-menu")?.pass,
    ),
    whatsNextActivityPass: Boolean(diag.hasInvite || diag.hasScheduled),
    path: diag.path,
  });
} catch (e) {
  push({ step: "ERROR", message: String(e.message || e) });
  await page.screenshot({ path: path.join(outDir, "ui-probe-error.png") }).catch(() => null);
  process.exitCode = 1;
} finally {
  await browser.close();
}
