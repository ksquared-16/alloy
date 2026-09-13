#!/usr/bin/env node
/**
 * `vac lane-resume` — what would each active lane do next after a reboot?
 *
 * READ-ONLY BY DEFAULT. It reads the canonical stores, derives a disposition per
 * lane and prints it. `--seed` writes the derived records through lane-memory,
 * the canonical owner, and is the only mutating mode; it is never the default,
 * because writing thirteen lanes' knowledge is not something a status command
 * should do by being run.
 *
 * Usage:
 *   vac-lane-resume.mjs [--json]     the disposition of every active lane
 *   vac-lane-resume.mjs --seed       write the derived records (mutates)
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  DISPOSITION, DURABLE_DISPOSITIONS, LIFECYCLE_SEAMS,
  deriveResumeDisposition, resumeRecordFor, resumeRecordIsPortable, sessionDispositionFor,
} from "./lib/vacilando/lane-resume.mjs";

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const seed = argv.includes("--seed");
const ROOT = process.env.ALLOY_RUNTIME_ROOT || join(homedir(), ".local", "state", "alloy-dev", "gateway");

const readJson = (p, f = null) => { try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : f; } catch { return f; } };

const laneStore = readJson(join(ROOT, "vacilando", "lanes", "lanes.json"), {});
const lanes = Object.values(laneStore?.lanes || {}).filter((l) => String(l.status || l.state || "").toUpperCase() === "ACTIVE");
const runStore = readJson(join(ROOT, "vacilando", "execution-runs", "runs.json"), {});
const handoffs = Object.values(readJson(join(ROOT, "vacilando", "execution-runs", "agent-handoffs.json"), {})?.handoffs || {});
const memory = readJson(join(ROOT, "vacilando", "lane-memory", "lanes.json"), {});

const TERMINAL = ["COMPLETE", "FAILED", "ABANDONED", "CANCELLED"];

/** Everything the deriver needs, read from the owners that already hold it. */
function evidenceFor(lane) {
  const laneRuns = Object.values(runStore?.lanes?.[lane.lane_id]?.runs || {});
  laneRuns.sort((a, b) => Date.parse(b.updated_at || b.created_at || 0) - Date.parse(a.updated_at || a.created_at || 0));
  const openRun = laneRuns.find((r) => !TERMINAL.includes(String(r.state || "").toUpperCase())) || null;
  const latestRun = laneRuns[0] || null;
  const handoff = handoffs
    .filter((h) => h.lane_id === lane.lane_id)
    .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))[0] || null;
  const mem = (memory?.lanes || memory)?.[lane.lane_id] || null;
  return {
    openRun,
    latestRun,
    handoff,
    recordedNextStep: mem?.next_step?.description ?? mem?.next_step ?? null,
    branch: lane.branch ?? lane.binding?.branch ?? null,
    candidate: mem?.promotion_checkpoints?.slice(-1)[0]?.lineage?.candidate ?? null,
    blockedOn: mem?.blockers?.[0]?.description ?? lane.blocked_on ?? null,
  };
}

const rows = lanes.map((l) => {
  const d = deriveResumeDisposition({ laneId: l.lane_id, ...evidenceFor(l) });
  return { name: l.name || l.lane_id, ...d, session: sessionDispositionFor(d), record: resumeRecordFor(d) };
});

const by = {};
for (const r of rows) by[r.disposition] = (by[r.disposition] || 0) + 1;
const durable = rows.filter((r) => DURABLE_DISPOSITIONS.includes(r.disposition)).length;

if (seed) {
  const { recordLaneNextStep } = await import("./lib/vacilando/lane-memory.mjs").catch(() => ({}));
  if (typeof recordLaneNextStep !== "function") {
    process.stderr.write("refusing to seed: lane-memory exposes no canonical next-step writer on this build.\n");
    process.stderr.write("The derived records are printed above; seeding waits for the canonical seam.\n");
    process.exit(3);
  }
}

if (asJson) {
  process.stdout.write(`${JSON.stringify({ lanes: rows.length, by_disposition: by, durable, rows }, null, 2)}\n`);
  process.exit(durable === rows.length ? 0 : 1);
}

process.stdout.write(`lane resume dispositions — ${rows.length} active lane(s), read-only\n\n`);
for (const r of rows) {
  process.stdout.write(`  ${r.disposition.padEnd(20)} ${String(r.name).slice(0, 22).padEnd(23)} ${r.source.padEnd(28)} ${r.session.action}\n`);
  if (r.next_action) process.stdout.write(`  ${" ".repeat(20)} → ${String(r.next_action).slice(0, 96)}\n`);
  else process.stdout.write(`  ${" ".repeat(20)} ⏸ ${r.needs || r.reason}\n`);
}
const portable = rows.every((r) => resumeRecordIsPortable(r.record).portable);
process.stdout.write(`\n${Object.entries(by).map(([k, v]) => `${k} ${v}`).join("   ")}\n`);
process.stdout.write(`durable dispositions ${durable}/${rows.length}   records portable: ${portable}\n`);
process.stdout.write(`update seams: ${LIFECYCLE_SEAMS.map((s) => s.id).join(", ")}\n`);
process.exit(durable === rows.length ? 0 : 1);
