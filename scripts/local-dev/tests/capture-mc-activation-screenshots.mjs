/**
 * Capture Mission Control primary-shell screenshots (post-activation).
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

const browser = await chromium.launch({ headless: true });
const manifest = [];

async function shot(name, route, { width = 1280, height = 800, note = "", missionId = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  const url = `${BASE}/#/${route}`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".mc-wrap, [data-mc-shell], #view", { timeout: 12000 });
  await page.waitForTimeout(1200);
  if (await page.locator(".spin").count()) await page.waitForTimeout(2000);
  const file = `mc-${name}.png`;
  await page.screenshot({ path: join(OUT, file), timeout: 10000 });
  const shell = await page.evaluate(() => ({
    hash: location.hash,
    mc: Boolean(document.querySelector(".mc-wrap,[data-mc-shell]")),
    enabled: window.VacilandoV2?.enabled === true,
    gated: window.VacilandoV2?.gated === true,
  }));
  if (!shell.enabled || shell.gated) throw new Error("MC not primary during screenshot: " + JSON.stringify(shell));
  manifest.push({
    filename: file,
    route: `/#/${route}`,
    url,
    missionId,
    viewport: { width, height },
    load_ms: Date.now() - t0,
    demonstrates: note,
    shell,
  });
  console.log("shot", file, shell.hash);
  await context.close();
}

const missions = await (await fetch(`${BASE}/api/v2/missions`)).json();
const list = missions.missions || missions.items || [];
const mission = list.find((m) => /Access & Identity/i.test(m.title || "")) || list[0];
const mid = mission?.mission_id || mission?.missionId || null;
const decisions = await (await fetch(`${BASE}/api/v2/decisions?status=open`)).json();
const open = (decisions.decisions || [])[0];
const workers = await (await fetch(`${BASE}/api/v2/workers`)).json();
const worker = (workers.workers || [])[0];

await shot("01-missions", "missions", { missionId: mid, note: "Primary Missions list" });
if (mid) await shot("02-mission-detail", `missions/${mid}`, { missionId: mid, note: "Mission detail" });
if (mid) await shot("03-timeline", `timeline/${mid}`, { missionId: mid, note: "Timeline for mission" });
await shot("04-workers", "workers", { missionId: mid, note: "Workers list" });
if (worker) await shot("05-worker-detail", `workers/${worker.workerId}`, { missionId: mid, note: "Worker detail" });
await shot("06-decisions-desktop", open ? `decisions/${open.decisionId}` : "decisions", {
  missionId: mid,
  note: "Open decision desktop",
});
if (open) {
  await shot("07-decision-mobile", `decisions/${open.decisionId}`, {
    width: 390,
    height: 844,
    missionId: mid,
    note: "Open decision mobile",
  });
}
await shot("08-evidence", mid ? `evidence/${mid}` : "evidence", { missionId: mid, note: "Evidence gallery" });
if (mid) await shot("09-kickoff", `kickoff/${mid}`, { missionId: mid, note: "Mission Brief kickoff/readiness" });

writeFileSync(join(OUT, "MC-ACTIVATION-MANIFEST.json"), JSON.stringify({
  generated_at: new Date().toISOString(),
  base: BASE,
  missionId: mid,
  openDecisionId: open?.decisionId || null,
  default_shell: "mission_control",
  screenshots: manifest,
}, null, 2));

writeFileSync(join(OUT, "MC-ACTIVATION-MANIFEST.md"), `# Mission Control activation — screenshot manifest

Default shell: **Mission Control** (\`#/missions\`)
Mission: \`${mid}\`
Open decision: \`${open?.decisionId || "(none)"}\`
Generated: ${new Date().toISOString()}

| File | Route | Demonstrates |
|------|-------|----------------|
${manifest.map((m) => `| \`${m.filename}\` | \`${m.route}\` | ${m.demonstrates} |`).join("\n")}
`);

await browser.close();
console.log("PASS mc screenshots", manifest.length);
