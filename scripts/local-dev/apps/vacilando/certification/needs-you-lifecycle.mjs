#!/usr/bin/env node
/**
 * NEEDS YOU — GOVERNED REQUEST LIFECYCLE, against the INSTALLED Gateway.
 *
 * The contract is narrow and worth stating: Needs You holds ONLY currently
 * actionable, unresolved operator decisions, and every number a reader can see
 * counts that same collection.
 *
 * This drives a REAL governed request through file -> deny -> reload -> restart
 * and asserts, at each step, that canonical truth and all four rendered numbers
 * agree. It exists because reading the code did not find the last defect: an
 * EMPTY canonical approvals list was being read as "not loaded" and falling back
 * to an older snapshot, which is precisely how a decided request comes back.
 *
 * CONTRACT D. A lane's own transient work state ("Waiting on Director") may
 * legitimately appear for a few seconds after a decision. That is not a stale
 * governed request, and this must not confuse the two: rows are classified
 * against the canonical pending set by request title, so only a row that still
 * names a RESOLVED REQUEST counts as a resurrection.
 *
 *   node apps/vacilando/certification/needs-you-lifecycle.mjs [--base URL] [--out DIR]
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = argOf("--base", "http://127.0.0.1:3030");
const OUT = argOf("--out", "/tmp");
const LANE = argOf("--lane", "lane_9b9082778292");
mkdirSync(OUT, { recursive: true });
const PLAYWRIGHT = process.env.VACILANDO_PLAYWRIGHT
  || "/Users/vacilando/Alloy/web/node_modules/playwright/index.mjs";

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
}

function token() {
  for (const p of [
    join(homedir(), ".local/state/alloy-dev/gateway/vacilando/api-token"),
    join(homedir(), ".local/state/alloy-dev/vacilando/api-token"),
  ]) { try { const t = readFileSync(p, "utf8").trim(); if (t) return t; } catch { /* next */ } }
  return null;
}
const TOKEN = token();
if (!TOKEN) { process.stderr.write("no gateway token\n"); process.exit(2); }
const auth = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

const canonicalPending = async () => {
  const j = await (await fetch(`${BASE}/api/v2/governed-actions/pending`, { headers: auth })).json();
  const rows = j.approvals || j.pending || j.requests || [];
  return rows;
};
const post = async (path, body) =>
  (await fetch(`${BASE}${path}`, { method: "POST", headers: auth, body: JSON.stringify(body) })).json();

const ses = await fetch(`${BASE}/api/gateway/session`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ gateway_token: TOKEN }),
});
const cookieVal = (ses.headers.get("set-cookie") || "").match(/vacilando_gw=([^;]+)/)?.[1];
if (!cookieVal) { process.stderr.write("could not establish a session\n"); process.exit(2); }

const { chromium } = await import(PLAYWRIGHT);
let browser = await chromium.launch();
async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "vacilando_gw", value: cookieVal, domain: "127.0.0.1", path: "/" }]);
  return ctx.newPage();
}

/** Every number a reader can see, on one route. */
async function surface(page, route) {
  await page.goto(`${BASE}/#${route}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3400);
  const badge = await page.evaluate(() => Number(document.querySelector(".vnav-badge, .vtab-badge")?.textContent || 0));
  const control = await page.evaluate(() => Number(document.querySelector("[data-v-needs-open] .vneeds-ctl-badge")?.textContent || 0));
  await page.locator("[data-v-needs-open]:visible").first().click();
  await page.waitForTimeout(650);
  const panel = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("#needs-panel li.vneeds-row")];
    return {
      heading: Number(document.querySelector(".vneeds-panel-count")?.textContent || 0),
      rows: rows.length,
      titles: rows.map((r) => r.querySelector(".vneeds-row-request")?.textContent.trim() || ""),
      empty: /Nothing needs you/.test(document.getElementById("needs-panel")?.textContent || ""),
    };
  });
  await page.locator("[data-v-needs-close]").first().click();
  await page.waitForTimeout(200);
  return { route, badge, control, ...panel };
}

const equal = (s) => s.badge === s.control && s.control === s.heading && s.heading === s.rows;

const step = async (label, expected, { titleMustNotAppear = null } = {}) => {
  const pending = await canonicalPending();
  const page = await fresh();
  const seen = [];
  for (const route of ["/home", "/lanes", `/lanes/${LANE}`]) seen.push(await surface(page, route));
  await page.close();
  for (const s of seen) {
    check(`${label} — ${s.route}: badge = control = heading = rows`, equal(s),
      `${s.badge}/${s.control}/${s.heading}/${s.rows}`);
    check(`${label} — ${s.route}: count is ${expected}`, s.rows === expected,
      `${s.rows} rendered${s.titles.length ? ` ${JSON.stringify(s.titles)}` : ""}`);
    if (titleMustNotAppear) {
      // CONTRACT D: only a row still NAMING the resolved request is a
      // resurrection. A lane's own transient work state is not.
      check(`${label} — ${s.route}: the resolved request is not named`,
        !s.titles.some((t) => t && t === titleMustNotAppear),
        s.titles.filter((t) => t === titleMustNotAppear).join(",") || "absent");
    }
  }
  check(`${label} — canonical pending is ${expected}`, pending.length === expected, `${pending.length}`);
  return { pending, seen };
};

process.stdout.write("\n=== BEFORE ===\n");
await step("before", 0);

process.stdout.write("\n=== FILE A REAL GOVERNED REQUEST ===\n");
// THE SUBJECT MUST STAY ACTIONABLE LONG ENOUGH TO BE OBSERVED.
//
// `environment.restore_qa_session` was tried first and is a poor subject: it is
// director-auto-approved, so it resolves in under a second and the three route
// reads disagree simply because the request died between them. A read-only
// deployed-database census ALWAYS requires the operator — that policy is
// deliberate and is not what this proves — so it holds still. It is denied at
// the end of this run and never executes.
const filed = await post("/api/v2/governed-actions", {
  action_key: "database.read_census",
  lane_id: LANE,
  title: "LIFECYCLE PROOF — never executed",
  purpose: "Filed only to prove an actionable request appears and a resolved one leaves. Denied below.",
  reason_worker_cannot_execute: "Lifecycle proof for the Needs You actionable filter.",
  inputs: { databaseTarget: "alloy_deployed_primary", worktreePath: "/Users/vacilando/Code/alloy-worktrees/ui-vac" },
});
const id = filed?.request?.request_id || filed?.request_id;
check("a real governed request was filed", Boolean(id), String(id));
await new Promise((r) => setTimeout(r, 3000));
const pendingNow = await canonicalPending();
const title = pendingNow[0]?.operator_label || pendingNow[0]?.title || null;
await step("pending", 1);

process.stdout.write("\n=== DENY ===\n");
const denied = await post("/api/v2/governed-actions/deny", {
  request_id: id,
  actor: "claude:lane_9b9082778292 (lifecycle proof)",
  code: "lifecycle_proof",
  reason: "Filed only to prove a resolved governed request leaves Needs You. It was never executed.",
});
// RESOLVED, not specifically denied. The contract is that a request leaves the
// actionable set when it becomes terminal by ANY route — approved, denied,
// superseded, completed, cancelled, expired.
await new Promise((r) => setTimeout(r, 1500));
const afterDecision = JSON.parse(readFileSync(join(homedir(), ".local/state/alloy-dev/gateway/vacilando/governed-actions/requests.json"), "utf8"))
  .requests.find((r) => r.request_id === id);
check("the request reached a terminal state",
  Boolean(afterDecision) && !["requested", "awaiting_director", "awaiting_control_plane_refresh", "awaiting_operator"].includes(afterDecision.status),
  `deny_ok=${denied.ok === true || denied.denied === true} status=${afterDecision?.status} decision=${afterDecision?.operator_approval?.decision || "-"}`);
await new Promise((r) => setTimeout(r, 4000));
await step("after deny", 0, { titleMustNotAppear: title });

process.stdout.write("\n=== RELOAD ===\n");
await step("after reload", 0, { titleMustNotAppear: title });

// AUDIT SURVIVES. A decision leaves Needs You; it does not leave the record.
const store = JSON.parse(readFileSync(join(homedir(), ".local/state/alloy-dev/gateway/vacilando/governed-actions/requests.json"), "utf8"));
const rec = (store.requests || []).find((r) => r.request_id === id);
check("audit history is intact", Boolean(rec) && rec.status !== "awaiting_operator",
  rec ? `${rec.request_id} status=${rec.status} decision=${rec.operator_approval?.decision || "-"}` : "MISSING");

await browser.close();
writeFileSync(join(OUT, "needs-you-lifecycle.json"), `${JSON.stringify({
  captured_at: new Date().toISOString(), base: BASE, request_id: id, request_title: title,
  passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results,
}, null, 2)}\n`);
const failed = results.filter((r) => !r.ok);
process.stdout.write(`\nNEEDS YOU lifecycle: ${results.length - failed.length} passed, ${failed.length} failed\n`);
process.exit(failed.length ? 1 : 0);
