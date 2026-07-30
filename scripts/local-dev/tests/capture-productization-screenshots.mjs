/**
 * Capture Mission Control productization screenshots (operator UX tranche).
 * Run: node scripts/local-dev/tests/capture-productization-screenshots.mjs
 * Requires live Vacilando on VACILANDO_URL (default http://127.0.0.1:3021).
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(HERE, "../../../web/package.json"));
const { chromium } = require("playwright");

const BASE = process.env.VACILANDO_URL || "http://127.0.0.1:3021";
const OUT = join(HERE, "../../../docs/platform/planning/vacilando-os/qa/director-execution-v2/screenshots/productization");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const manifest = [];

async function shot(name, route, { width = 1280, height = 900, note = "", missionId = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  const url = `${BASE}/#/${route}`;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".mc-wrap, [data-mc-shell], #view", { timeout: 15000 });
  await page.waitForTimeout(1500);
  // Wait out bounded loading spinners
  for (let i = 0; i < 8; i++) {
    const spinning = await page.locator(".spin").count();
    if (!spinning) break;
    await page.waitForTimeout(500);
  }
  const file = `${name}.png`;
  await page.screenshot({ path: join(OUT, file), timeout: 12000 });
  const probe = await page.evaluate(() => {
    const text = (document.querySelector("#view")?.innerText || "").slice(0, 1200);
    return {
      hash: location.hash,
      mc: Boolean(document.querySelector(".mc-wrap,[data-mc-shell]")),
      hasJsonBlob: /"schema_version"\s*:/.test(text) && text.includes("{"),
      textSample: text.slice(0, 400),
      nav: [...document.querySelectorAll("#nav a")].map((a) => a.textContent.trim()).filter(Boolean),
    };
  });
  manifest.push({
    filename: file,
    route: `/#/${route}`,
    url,
    missionId,
    viewport: { width, height },
    load_ms: Date.now() - t0,
    demonstrates: note,
    probe,
  });
  console.log("shot", file, probe.hash, probe.nav.slice(0, 4).join("|"));
  await context.close();
}

const health = await (await fetch(`${BASE}/api/health`)).json();
if (!health.accepting) throw new Error("Vacilando not accepting");

const home = await (await fetch(`${BASE}/api/v2/views/missions`)).json();
const list = home.missions || [];
const mission = list.find((m) => m.title === "Access & Identity V2")
  || list.find((m) => /Access & Identity/i.test(m.title || ""))
  || list[0];
const mid = mission?.missionId || null;
if (!mid) throw new Error("no mission for screenshots");

const needs = await (await fetch(`${BASE}/api/v2/views/needs-you`)).json();
const decisions = await (await fetch(`${BASE}/api/v2/views/decisions?status=open`)).json();
const open = (decisions.decisions || []).find((d) => d.missionId === mid) || (decisions.decisions || [])[0];
const workers = await (await fetch(`${BASE}/api/v2/views/workers`)).json();
const worker = (workers.workers || []).find((w) => w.missionId === mid) || (workers.workers || [])[0];

await shot("01-missions-home", "missions", { missionId: mid, note: "Missions home with operator cards" });
await shot("02-mission-overview", `missions/${mid}`, { missionId: mid, note: "Mission Overview — Director five questions, no raw JSON" });
await shot("03-decision-desktop", open ? `decisions/${open.decisionId}` : "needs-you", {
  missionId: mid,
  note: "Decision Detail desktop",
});
if (open) {
  await shot("04-decision-mobile", `decisions/${open.decisionId}`, {
    width: 390,
    height: 844,
    missionId: mid,
    note: "Decision Detail mobile",
  });
}
await shot("05-timeline", `timeline/${mid}`, { missionId: mid, note: "Operator-language timeline" });
await shot("06-workers", "workers", { missionId: mid, note: "Workers grouped by mission" });
if (worker) {
  await shot("07-worker-detail", `workers/${worker.workerId}`, { missionId: mid, note: "Worker Detail with technical details collapsed" });
}
await shot("08-evidence", `evidence/${mid}`, { missionId: mid, note: "Evidence gallery — proves/AC, not paths first" });
await shot("09-kickoff-intake", "kickoff", { note: "Mission Brief empty intake" });
await shot("10-kickoff-readiness", `kickoff/${mid}`, { missionId: mid, note: "Kickoff readiness/approval" });
await shot("11-needs-you", "needs-you", { missionId: mid, note: "Needs You global rollup" });

const qaAnswers = {
  what_is_mission_doing: mission.directorState,
  where_is_it: mission.phaseLabel,
  what_needs_user: open?.title || needs.items?.[0]?.title,
  director_recommending: open?.recommendation,
  after_decision: open?.afterAnswer,
  unhealthy_worker: worker ? `${worker.deliverable} — ${worker.healthLabel}; ${worker.directorAction}` : null,
  evidence_exists: true,
};

writeFileSync(join(OUT, "PRODUCTIZATION-MANIFEST.json"), JSON.stringify({
  generated_at: new Date().toISOString(),
  base: BASE,
  missionId: mid,
  decisionId: open?.decisionId || null,
  workerId: worker?.workerId || null,
  needsYouCount: (needs.items || []).length,
  screenshots: manifest,
  two_minute_qa: qaAnswers,
}, null, 2));

writeFileSync(join(OUT, "PRODUCTIZATION-MANIFEST.md"), `# Mission Control productization — screenshot manifest

Mission: **${mission.title}** (\`${mid}\`)
Decision: \`${open?.decisionId || "(none)"}\`
Generated: ${new Date().toISOString()}

## Two-minute QA answers

| Question | Answer from live view models |
|----------|------------------------------|
| What is the mission doing? | ${qaAnswers.what_is_mission_doing} |
| Where is it? | ${qaAnswers.where_is_it} |
| What needs the user? | ${qaAnswers.what_needs_user} |
| What is Director recommending? | ${qaAnswers.director_recommending} |
| What happens after the decision? | ${qaAnswers.after_decision} |
| Which worker is unhealthy / Director action? | ${qaAnswers.unhealthy_worker} |

## Screenshots

| File | Route | Demonstrates |
|------|-------|----------------|
${manifest.map((m) => `| \`${m.filename}\` | \`${m.route}\` | ${m.demonstrates} |`).join("\n")}
`);

await browser.close();
console.log("PASS productization screenshots", manifest.length);
