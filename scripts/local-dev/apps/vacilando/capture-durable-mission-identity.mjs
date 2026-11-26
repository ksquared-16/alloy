/**
 * Browser-certify Identity Platform durable-mission continuity.
 * Assert Status is not "Waiting on you" solely from register exhaustion.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "../../../../web/node_modules/playwright/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../../../..");
const BASE = process.env.VACILANDO_BASE || "http://127.0.0.1:3026";
const LIVE_ID = "msn_f74ed02c126c88d7ff";
const OUT = join(
  ROOT,
  "docs/platform/planning/vacilando-os/qa/director-experience-v2/screenshots",
);
mkdirSync(OUT, { recursive: true });

const failures = [];
function check(name, ok, detail = "") {
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
  console.log(ok ? `ok  ${name}` : `FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

const healthWrap = await fetch(`${BASE}/api/v2/views/workspace-shell?id=${LIVE_ID}`);
const shellJson = await healthWrap.json().catch(() => ({}));
const shell = shellJson.shell || shellJson;
const health = shell.missionHealth || shell.currentStateCompact?.missionHealth || null;
const postureId = shell.currentState?.postureId || shell.currentStateCompact?.postureId || null;
const compactLines = shell.currentStateCompact?.summaryLines || [];

check("api_has_mission_health", Boolean(health), JSON.stringify(health)?.slice(0, 120));
if (health) {
  check("mission_ongoing", health.missionProgressLabel === "Ongoing" || health.missionOngoing === true);
  check("register_complete_ok", health.register?.complete === true, JSON.stringify(health.register));
  check("not_waiting_on_you", health.waitingOnYou === false);
  check("no_mission_percent", health.missionPercent == null);
}
check(
  "status_lines_not_waiting",
  !compactLines.some((l) => /waiting on you/i.test(String(l))),
  compactLines.join(" | "),
);
check(
  "status_shows_ongoing_or_idle",
  compactLines.some((l) => /ongoing|idle|current work/i.test(String(l)))
    || /idle|ongoing/i.test(String(health?.lifecycleLabel || "")),
  compactLines.join(" | "),
);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${BASE}/#/workspaces/${LIVE_ID}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2800);

const bodyText = await page.locator("body").innerText();
check("browser_not_waiting_on_you_alone", !/Waiting on you/i.test(bodyText) || /decision/i.test(bodyText));
check(
  "browser_shows_ongoing_or_current_work",
  /Ongoing|Current work|Idle|Director/i.test(bodyText),
  bodyText.slice(0, 400),
);

const healthEl = page.locator(".ws-mission-health");
if (await healthEl.count()) {
  await healthEl.first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(OUT, "durable-identity-mission-health.png") });
}
await page.screenshot({ path: join(OUT, "durable-identity-workspace.png") });

const softPark = await page.locator('button:has-text("Done for now")').count();
const softClose = await page.locator('button:has-text("Close Without Continuing")').count();
check("no_done_for_now_cta", softPark === 0);
check("no_close_without_continuing_cta", softClose === 0);

await browser.close();

const report = {
  at: new Date().toISOString(),
  missionId: LIVE_ID,
  postureId,
  health,
  compactLines,
  failures,
  ok: failures.length === 0,
  shots: {
    health: "durable-identity-mission-health.png",
    workspace: "durable-identity-workspace.png",
  },
};
writeFileSync(join(OUT, "durable-mission-identity-certify.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, failures, postureId, lifecycle: health?.lifecycle }, null, 2));
process.exit(report.ok ? 0 : 1);
