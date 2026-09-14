#!/usr/bin/env node
/**
 * vac operating-report [--kind daily|weekly] [--date YYYY-MM-DD] [--json] [--write]
 *
 * Reads the authoritative stores and renders one report for a WINDOW. The same
 * window always produces the same report_id, so a retry or a cadence that fires
 * twice cannot create a second "today".
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildOperatingReport, renderOperatingReport, reportIsDue, operatingReportWindow } from "./lib/vacilando/operating-report.mjs";

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const kind = flag("kind", "daily");
const HERE = dirname(fileURLToPath(import.meta.url));
// The same default the stores use. Named here rather than imported because no
// module exports it, and guessing a different one would read an empty fleet and
// report a quiet day.
const root = process.env.ALLOY_RUNTIME_ROOT?.trim()
  || join(process.env.HOME || homedir(), ".local", "state", "alloy-dev", "gateway");
const base = join(root, "vacilando");

function readJson(path, fallback) {
  try { return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback; }
  catch { return fallback; }
}

/*
 * Same window the steward reports on, from the same owner, in the configured
 * zone. --date still names a specific civil day; it is now a day IN THAT ZONE
 * rather than a UTC one, which is what anyone typing a date meant.
 */
const win = operatingReportWindow(kind, new Date(), { dayKey: flag("date", null) });
if (!win) {
  console.error(JSON.stringify({
    ok: false, error: "timezone_not_configured", setting: "VACILANDO_REPORT_TIMEZONE",
    detail: "A report window has no meaning without the zone its day is measured in.",
  }, null, 2));
  process.exit(2);
}
const { windowStart, windowEnd } = win;

const requests = readJson(join(base, "governed-actions", "requests.json"), { requests: [] }).requests || [];
const runStore = readJson(join(base, "execution-runs", "runs.json"), { lanes: {} }).lanes || {};
const runs = Object.values(runStore).flatMap((e) => e.runs || []);
const notifStore = readJson(join(base, "notifications.json"), { notifications: [] });
const notifications = Array.isArray(notifStore) ? notifStore
  : (Array.isArray(notifStore.notifications) ? notifStore.notifications : Object.values(notifStore.notifications || {}));
const laneStore = readJson(join(base, "lanes", "lanes.json"), { lanes: {} }).lanes || {};
const lanes = Object.values(laneStore);

/*
 * Health and toolkit state come from their OWN owners, by running them, rather
 * than by recomputing what they measure. A second opinion about health is a
 * second health check, and the two would disagree the first time either moved.
 * If an owner cannot answer, the field is null and the report says so.
 */
let health = null;
let runtime = null;
try {
  const out = spawnSync(process.execPath, [join(HERE, "vac-health.mjs"), "--json"], {
    encoding: "utf8", timeout: 120_000, env: { ...process.env, ALLOY_RUNTIME_ROOT: root },
  });
  /*
   * A NON-ZERO EXIT IS HEALTH'S VERDICT, NOT A FAILURE TO ANSWER. `vac health`
   * exits by severity, so gating on status === 0 threw away every report that
   * had anything to say — which is every report worth reading.
   */
  if (out.stdout?.trim()) health = JSON.parse(out.stdout);
} catch { /* the report reports null, never a guessed verdict */ }
try {
  const { measureToolkitConvergence } = await import("./lib/vacilando/toolkit-convergence.mjs");
  const m = measureToolkitConvergence({});
  runtime = {
    staging: m.promoted_staging_sha_full || m.promoted_staging_sha || null,
    installed: m.installed_toolkit_sha || null,
    running: m.running_toolkit_sha || m.installed_toolkit_sha || null,
    converged: m.toolkit_drift === false,
  };
} catch { /* same */ }

/*
 * `--due` lets the host's EXISTING timer ask whether to run, instead of this
 * process growing a clock of its own. Exit 0 when due, 3 when not, so a shell
 * line can gate on it without parsing anything.
 */
if (has("due")) {
  const verdict = reportIsDue(kind, new Date());
  process.stdout.write(`${JSON.stringify({ kind, ...verdict })}\n`);
  process.exit(verdict.due ? 0 : 3);
}

const report = buildOperatingReport({ kind, windowStart, windowEnd, requests, runs, lanes, notifications, health, runtime });

if (has("write")) {
  const dir = join(base, "operating-reports");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${report.report_id}.json`);
  // Idempotent BY WINDOW: the same day rewrites the same file, never a second one.
  writeFileSync(file, JSON.stringify(report, null, 2));
  process.stdout.write(`${file}\n`);
}
process.stdout.write(has("json") ? `${JSON.stringify(report, null, 2)}\n` : `${renderOperatingReport(report)}\n`);
