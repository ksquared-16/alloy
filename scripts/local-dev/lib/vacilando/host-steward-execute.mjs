/**
 * The Host Steward executor — the only place the steward signals anything.
 *
 * Kept apart from the policy for the same reason the reconciliation executor is:
 * a module that contains no destructive verb can be PROVEN to contain none, and
 * a module that contains one should contain nothing else.
 *
 * Everything here re-measures before it acts. A plan is a statement about a
 * moment that has already passed, and a process group is exactly the kind of
 * thing that changes underneath you.
 */
import { execFileSync } from "node:child_process";
import {
  AUTONOMOUS_ACTIONS, OWNERSHIP, buildStewardPlan, stewardFingerprint,
} from "./host-steward.mjs";
import { closeHeavyCommand } from "./heavy-command-registry.mjs";

export const STEWARD_EXECUTION_SCHEMA = "vacilando.host_steward_execution.v1";

/** Members of a process group, or null when it cannot be read. */
export function groupMembers(pgid, { ps = defaultPs } = {}) {
  const text = ps();
  if (text == null) return null;
  const out = [];
  for (const line of text.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    if (Number(m[2]) === Number(pgid)) out.push({ pid: Number(m[1]), pgid: Number(m[2]), command: m[3] });
  }
  return out;
}

function defaultPs() {
  try {
    return execFileSync("ps", ["-Ao", "pid=,pgid=,args="], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 15000 });
  } catch { return null; }
}

/**
 * Terminate one process group that the steward owns.
 *
 * REFUSES if the group contains anything the plan did not account for. The
 * earlier manual cleanup hit exactly this: the wt1 dev-server group also held
 * `alloy-certify serve`, and terminating the group wholesale would have taken
 * an unrelated process with it. Owning a group member is not owning the group.
 */
export function terminateOwnedGroup({
  pgid, expectPattern, ps = defaultPs, kill = defaultKill, waitMs = 4000, sleep = defaultSleep,
} = {}) {
  if (pgid == null) return { ok: false, error: "missing_process_group" };
  const before = groupMembers(pgid, { ps });
  if (before == null) return { ok: false, error: "process_table_unreadable" };
  if (!before.length) return { ok: true, already_absent: true, killed: [] };

  const re = expectPattern instanceof RegExp ? expectPattern : new RegExp(String(expectPattern || ".*"));
  const foreign = before.filter((p) => !re.test(p.command) && !/^<defunct>|\(node\)$/.test(p.command));
  if (foreign.length) {
    return {
      ok: false, error: "group_contains_unowned_members", killed: [],
      foreign: foreign.map((p) => ({ pid: p.pid, command: p.command.slice(0, 120) })),
    };
  }

  kill("TERM", -pgid);
  sleep(waitMs);
  let after = groupMembers(pgid, { ps }) || [];
  const stubborn = after.filter((p) => !/<defunct>/.test(p.command));
  for (const p of stubborn) kill("KILL", p.pid);
  if (stubborn.length) sleep(1500);
  after = groupMembers(pgid, { ps }) || [];
  const live = after.filter((p) => !/<defunct>/.test(p.command));
  return {
    ok: live.length === 0,
    killed: before.map((p) => p.pid),
    remaining: live.map((p) => p.pid),
    error: live.length ? "group_survived_termination" : null,
  };
}

function defaultKill(signal, target) {
  try { process.kill(target, `SIG${signal}`); return true; } catch { return false; }
}
function defaultSleep(ms) {
  const end = Date.now() + ms;
  // Deliberately crude: the executor must not depend on an event loop turn.
  while (Date.now() < end) { try { execFileSync("sleep", ["0.1"], { timeout: 2000 }); } catch { break; } }
}

/**
 * Apply a steward plan.
 *
 * Rebuilds the plan from freshly supplied resources and refuses entirely if the
 * fingerprint moved — same contract as reconciliation and retirement.
 */
export function applyStewardPlan({
  plan, freshResources = null, root = null, nowMs = Date.now(),
  ps = defaultPs, kill = defaultKill, sleep = defaultSleep, stopDevServer = null,
} = {}) {
  if (!plan) return { ok: false, error: "missing_plan" };
  if (freshResources) {
    const rebuilt = buildStewardPlan(freshResources, { nowMs });
    if (rebuilt.fingerprint !== plan.fingerprint) {
      return {
        ok: false, error: "stale_steward_plan", applied: [],
        expected_fingerprint: plan.fingerprint, observed_fingerprint: rebuilt.fingerprint,
      };
    }
  }
  const applied = [];
  const refused = [];
  for (const d of plan.autonomous || []) {
    if (!AUTONOMOUS_ACTIONS.includes(d.action)) { refused.push({ ...d, error: "not_autonomous" }); continue; }
    if (d.ownership === OWNERSHIP.LIVE || d.ownership === OWNERSHIP.FOREIGN_UNKNOWN) {
      refused.push({ ...d, error: "ownership_forbids_action" }); continue;
    }
    if (d.action === "terminate_terminal_test_process") {
      const out = terminateOwnedGroup({
        pgid: d.evidence?.pgid, expectPattern: /node|npm|vitest|tsc|bash|sh|tail|<defunct>/, ps, kill, sleep,
      });
      if (out.ok) {
        if (root && d.id) { try { closeHeavyCommand({ root, id: d.id, disposition: "reconciled", nowMs }); } catch { /* audit only */ } }
        applied.push({ ...d, result: out });
      } else refused.push({ ...d, error: out.error, detail: out.foreign || out.remaining });
      continue;
    }
    if (d.action === "stop_terminal_dev_server") {
      if (typeof stopDevServer !== "function") { refused.push({ ...d, error: "no_dev_server_stop_capability" }); continue; }
      const out = stopDevServer(d);
      (out?.ok ? applied : refused).push({ ...d, result: out, error: out?.ok ? null : (out?.error || "stop_failed") });
      continue;
    }
    // Seats, ports and toolkit are performed by their own canonical owners; the
    // steward schedules them but never reimplements them.
    refused.push({ ...d, error: "delegated_to_canonical_owner" });
  }
  return {
    schema_version: STEWARD_EXECUTION_SCHEMA,
    ok: true,
    fingerprint: plan.fingerprint,
    applied, refused,
    applied_count: applied.length,
    refused_count: refused.length,
  };
}
