/**
 * Capture Director Execution V2 Mission Control screenshots against a live server.
 *
 * Requires: Vacilando on VACILANDO_URL (default http://127.0.0.1:3021) with real
 * V2 mission data (run access-identity-v2-cert.mjs with VACILANDO_CERT_USE_LIVE_STATE=1).
 *
 * Run from web/: node ../scripts/local-dev/tests/capture-v2-screenshots.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(HERE, "../../../web/package.json"));
const { chromium } = require("playwright");

const BASE = process.env.VACILANDO_URL || "http://127.0.0.1:3021";
const OUT = join(HERE, "../../../docs/platform/planning/vacilando-os/qa/director-execution-v2");
mkdirSync(OUT, { recursive: true });

async function waitMc(page, sel, timeout = 20000) {
  await page.waitForSelector(sel, { timeout });
}

const browser = await chromium.launch({ headless: true });
const manifest = [];

async function shot(name, route, { width = 1280, height = 800, wait = ".mc-wrap", missionId = null, note = "" } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const url = `${BASE}/?mc=1#/${route}`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // MC views must paint without full board — wait for mc-wrap, not board sprints
  await waitMc(page, wait);
  // Allow one fetch+repaint cycle for data
  await page.waitForTimeout(1200);
  // If still spinning, wait a bit more for API
  const spinning = await page.locator(".spin").count();
  if (spinning) await page.waitForTimeout(2500);
  const file = `${name}.png`;
  await page.screenshot({ path: join(OUT, file), fullPage: false, timeout: 10000 });
  const interactive = await page.evaluate(() => {
    const a = document.querySelector("#nav a, .btn, [data-nav]");
    if (!a) return false;
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return true;
  });
  manifest.push({
    filename: file,
    route: `/#/${route}`,
    url,
    missionId,
    viewport: { width, height },
    load_ms: Date.now() - t0,
    interactive_click_dispatched: interactive,
    demonstrates: note,
  });
  console.log("shot", file, `${Date.now() - t0}ms`);
  await context.close();
}

// Discover live mission + decision from API
const missions = await (await fetch(`${BASE}/api/v2/missions`)).json();
const list = missions.missions || missions.items || [];
const mission = list.find((m) => /Access & Identity/i.test(m.title || "")) || list[0];
if (!mission) {
  console.error("No V2 missions found — run access-identity-v2-cert with VACILANDO_CERT_USE_LIVE_STATE=1 first");
  process.exit(1);
}
const mid = mission.mission_id || mission.missionId;
const decisions = await (await fetch(`${BASE}/api/v2/decisions?status=open`)).json();
const open = (decisions.decisions || [])[0];
const workers = await (await fetch(`${BASE}/api/v2/workers`)).json();
const worker = (workers.workers || [])[0];

await shot("01-missions", "missions", {
  missionId: mid,
  note: "Missions list from live /api/v2/missions",
});
await shot("02-mission-detail", `missions/${mid}`, {
  missionId: mid,
  note: "Mission detail + Director summary payload",
});
await shot("03-worker-detail", worker ? `workers/${worker.workerId}` : "workers", {
  missionId: mid,
  note: "Worker telemetry / assignment binding",
});
if (open) {
  await shot("04-decision-desktop", `decisions/${open.decisionId}`, {
    missionId: mid,
    note: "Open material decision on desktop viewport",
  });
  await shot("05-decision-mobile", `decisions/${open.decisionId}`, {
    width: 390,
    height: 844,
    missionId: mid,
    note: "Open material decision at mobile width",
  });
} else {
  console.warn("No open decision — skipping decision screenshots");
}
await shot("06-evidence-gallery", `evidence/${mid}`, {
  missionId: mid,
  note: "Evidence gallery for cert mission",
});
await shot("07-kickoff-readiness", `kickoff/${mid}`, {
  missionId: mid,
  note: "Mission Brief kickoff / readiness findings",
});

writeFileSync(join(OUT, "SCREENSHOT-MANIFEST.json"), JSON.stringify({
  generated_at: new Date().toISOString(),
  base: BASE,
  missionId: mid,
  openDecisionId: open?.decisionId || null,
  screenshots: manifest,
}, null, 2));

writeFileSync(join(OUT, "SCREENSHOT-MANIFEST.md"), `# Director Execution V2 — screenshot manifest

Mission: \`${mid}\`
Open decision: \`${open?.decisionId || "(none)"}\`
Generated: ${new Date().toISOString()}

| File | Route | Demonstrates |
|------|-------|----------------|
${manifest.map((m) => `| \`${m.filename}\` | \`${m.route}\` | ${m.demonstrates} |`).join("\n")}
`);

await browser.close();
console.log("PASS screenshots", manifest.length);
