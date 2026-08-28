#!/usr/bin/env node
/**
 * The worker-facing producer for governed dependencies.
 *
 * A worker says WHAT it needs and what would prove it done. It does not say
 * where the work should run — placement fields are stripped, and the attempt is
 * kept as governance evidence rather than quietly ignored.
 *
 *   vac governed-dependency --run <id> --lane <lane> --json '{...}'
 *   vac governed-dependency --status <dependency_id>
 *   vac governed-dependency --dispatch <dependency_id>
 */
import { homedir } from "node:os";
import { join } from "node:path";

import {
  dispatchGovernedDependency,
  emitGovernedDependency,
  getDependency,
  parentRunView,
  publicDependency,
} from "./lib/vacilando/governed-dependency-runtime.mjs";

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};
const root = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(homedir(), ".local", "state", "alloy-dev");
const asJson = argv.includes("--json-out");

function out(obj, code = 0) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
  process.exit(code);
}

const statusId = flag("--status");
if (statusId) {
  const dep = getDependency(statusId, root);
  if (!dep) out({ ok: false, error: "dependency_not_found" }, 1);
  if (asJson) out({ ok: true, dependency: publicDependency(dep) });
  process.stdout.write(`${parentRunView(dep)}\n`);
  process.exit(0);
}

const dispatchId = flag("--dispatch");
if (dispatchId) {
  const res = await dispatchGovernedDependency(dispatchId, { root });
  out({
    ok: res.ok, action: res.action, state: res.dependency?.dependency_state ?? null,
    resumed_parent: Boolean(res.resumed_parent), detail: res.step?.detail ?? res.operator_message ?? null,
  }, res.ok ? 0 : 1);
}

const runId = flag("--run");
const laneId = flag("--lane");
const raw = flag("--json");
if (!runId || !raw) {
  process.stderr.write("usage: vac governed-dependency --run <id> --lane <lane> --json '{...}'\n");
  process.exit(2);
}

let intent;
try { intent = JSON.parse(raw); } catch (err) {
  out({ ok: false, error: "invalid_json", detail: err?.message || String(err) }, 2);
}

const res = await emitGovernedDependency({
  ...intent,
  originating_run_id: runId,
  originating_lane_id: laneId ?? intent.originating_lane_id ?? null,
}, { root });

if (!res.ok) out({ ok: false, error: res.error }, 1);
out({
  ok: true,
  deduped: Boolean(res.deduped),
  dependency_id: res.dependency.dependency_id,
  state: res.dependency.dependency_state,
  // Reported back so a worker learns its placement attempt was refused rather
  // than silently dropped.
  rejected_worker_overrides: res.dependency.rejected_worker_overrides || res.rejected_worker_overrides || [],
  originating_run: res.run?.run_id ?? runId,
  run_state: res.run?.state ?? null,
});
