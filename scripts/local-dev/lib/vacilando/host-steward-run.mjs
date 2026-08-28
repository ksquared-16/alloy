/**
 * One Host Steward cycle, end to end.
 *
 * This is the only module that both observes and mutates, and it does the
 * mutating exclusively by calling owners certified elsewhere. Its own
 * contribution is sequencing, locking, verification and audit.
 *
 * EVERY RESOURCE IS ISOLATED. A resource whose observation throws, whose owner
 * is missing, or whose postcondition fails stops work on THAT resource and the
 * cycle continues. A health loop that aborts on its first bad resource stops
 * observing exactly when observation matters most.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, loadavg, cpus } from "node:os";
import { join } from "node:path";
import {
  acquireCycleLock, releaseCycleLock, buildCyclePlan, recordAction, resourceKey,
  classifyHostAdmission,
} from "./host-steward-cycle.mjs";
import { residualHeavyCommands, asStewardResource } from "./heavy-command-registry.mjs";
import { applyStewardPlan } from "./host-steward-execute.mjs";
import { executionRunStorePath } from "./execution-run.mjs";

/** Read host memory/load signals for Host Admission V2. Unreadable stays null. */
export function observeHostSignals({ exec = defaultExec } = {}) {
  const vm = exec("/usr/bin/vm_stat", []);
  const page = Number((vm.match(/page size of (\d+)/) || [])[1] || 16384);
  const pages = (k) => { const m = vm.match(new RegExp(`${k}:\\s+(\\d+)`)); return m ? Number(m[1]) * page : null; };
  const swap = exec("/usr/sbin/sysctl", ["-n", "vm.swapusage"]);
  const mb = (k) => { const m = swap.match(new RegExp(`${k} = ([0-9.]+)M`)); return m ? Number(m[1]) * 1048576 : null; };
  const total = Number(String(exec("/usr/sbin/sysctl", ["-n", "hw.memsize"])).trim()) || null;
  const free = pages("Pages free");
  const inactive = pages("Pages inactive");
  return {
    totalBytes: total,
    freeBytes: free,
    availableBytes: free != null
      ? free + (pages("Pages speculative") || 0) + (pages("Pages purgeable") || 0) + (inactive || 0) * 0.5
      : null,
    compressorBytes: pages("Pages occupied by compressor"),
    swapTotalBytes: mb("total"),
    swapUsedBytes: mb("used"),
    loadAvg: loadavg(),
    cores: cpus().length,
  };
}

function defaultExec(cmd, args) {
  try { return execFileSync(cmd, args, { encoding: "utf8", timeout: 15000 }); } catch { return ""; }
}

/** Run states by id, or null when the store cannot be read — null is never "no owner". */
export function readRunStates(root) {
  try {
    const p = executionRunStorePath(root);
    if (!existsSync(p)) return null;
    const j = JSON.parse(readFileSync(p, "utf8"));
    const byId = new Map();
    for (const v of Object.values(j.lanes || {})) {
      const rs = Array.isArray(v) ? v : (v.runs || Object.values(v).find(Array.isArray) || []);
      for (const r of rs) if (r?.run_id) byId.set(r.run_id, r.state);
    }
    return byId;
  } catch { return null; }
}

const defaultGroupAlive = (pgid) => { try { process.kill(-Number(pgid), 0); return true; } catch { return false; } };

/**
 * Execute one cycle.
 *
 * `dryRun` observes and plans without mutating — the same planner, so a preview
 * and a real cycle can never disagree about what would happen.
 */
export function runStewardCycle({
  root,
  nowMs = Date.now(),
  dryRun = false,
  groupAlive = defaultGroupAlive,
  exec = defaultExec,
  stopDevServer = null,
} = {}) {
  const startedMs = nowMs;
  const wallStart = Date.now();
  const lock = dryRun ? { ok: true, cycle_id: "hsc_dryrun" } : acquireCycleLock({ root, nowMs });
  if (!lock.ok) return { ok: false, error: lock.error, running: lock.running };

  const cycleId = lock.cycle_id;
  const problems = [];
  let resources = [];
  let admissionBefore = null;

  // ── Observe. Each observation is independently fallible.
  try {
    const states = readRunStates(root);
    const residual = residualHeavyCommands({
      root,
      runStateFor: (id) => (states ? states.get(id) ?? null : null),
      groupAlive,
      nowMs,
    });
    // A run store we could not read means ownership is UNKNOWN, and unknown
    // ownership must reach the classifier as unknown — not as "no owner".
    // NOTE: residualHeavyCommands already yields owning_runs === null when no
    // state resolves, so unknown ownership reaches the classifier as unknown
    // without a second guard here. A redundant guard that no mutation can kill
    // is dead code pretending to be safety.
    resources = residual.map((r) => asStewardResource(r));
  } catch (e) { problems.push({ stage: "observe_residual", error: String(e?.message || e) }); }

  try { admissionBefore = classifyHostAdmission(observeHostSignals({ exec })); }
  catch (e) { problems.push({ stage: "observe_admission", error: String(e?.message || e) }); }

  const plan = buildCyclePlan({ cycleId, resources, admission: admissionBefore, root: dryRun ? null : root, nowMs });

  if (dryRun) {
    return { ok: true, dry_run: true, cycle_id: cycleId, plan, admission_before: admissionBefore, problems };
  }

  // ── Execute, one resource at a time, through canonical owners only.
  const executed = [];
  const refused = [];
  for (const entry of plan.proposed) {
    try {
      if (entry.action === "terminate_terminal_test_process") {
        const stewardPlan = {
          fingerprint: plan.plan_fingerprint,
          autonomous: [{
            id: entry.evidence?.id ?? null,
            action: entry.action,
            ownership: entry.ownership,
            resource_class: entry.resource_class,
            evidence: entry.evidence,
          }],
        };
        const out = applyStewardPlan({ plan: stewardPlan, root, nowMs, stopDevServer });
        const ok = out.ok && out.applied_count === 1;
        // Verify the postcondition rather than trusting the executor.
        const gone = entry.evidence?.pgid != null ? !groupAlive(entry.evidence.pgid) : null;
        const verified = ok && gone === true;
        recordAction({ root, resourceKey: entry.resource_key, action: entry.action, result: { ok: verified }, nowMs });
        (verified ? executed : refused).push({
          ...entry, ok: verified,
          postcondition_verified: gone,
          detail: verified ? null : (out.refused?.[0]?.error || "postcondition not verified"),
        });
        continue;
      }
      // Owners that exist but are invoked by their own subsystem: recorded as
      // proposed-and-delegated rather than silently performed here.
      refused.push({ ...entry, ok: false, detail: `delegated to ${entry.owner}` });
    } catch (e) {
      // One bad resource must not abort the loop.
      problems.push({ stage: "execute", resource: entry.resource_key, error: String(e?.message || e) });
      refused.push({ ...entry, ok: false, detail: String(e?.message || e) });
    }
  }

  let admissionAfter = null;
  if (executed.length) {
    try { admissionAfter = classifyHostAdmission(observeHostSignals({ exec })); }
    catch (e) { problems.push({ stage: "remeasure", error: String(e?.message || e) }); }
  }

  // Duration is measured on the WALL clock; every recorded timestamp uses the
  // cycle's own clock. Mixing them made the cycle untestable: a caller could
  // inject a clock for the decisions and still get real-time audit rows, so a
  // freshly-run cycle read as stale.
  const wallEnd = Date.now();
  const record = {
    cycle_id: cycleId,
    started_at: new Date(startedMs).toISOString(),
    duration_ms: Math.max(0, wallEnd - wallStart),
    admission_before: admissionBefore?.state ?? null,
    admission_after: admissionAfter?.state ?? admissionBefore?.state ?? null,
    observed: plan.classifications,
    proposed: plan.proposed.map((p) => ({ resource_key: p.resource_key, action: p.action, owner: p.owner })),
    executed: executed.map((e) => ({ resource_key: e.resource_key, action: e.action, owner: e.owner, ok: e.ok, postcondition_verified: e.postcondition_verified })),
    refused: refused.map((e) => ({ resource_key: e.resource_key, action: e.action, detail: e.detail })),
    suppressed: plan.suppressed.map((s) => ({ resource_key: s.resource_key, action: s.action, suppressed_because: s.suppressed_because })),
    problems,
  };
  releaseCycleLock({ root, cycleId, record, nowMs });

  return {
    ok: true,
    cycle_id: cycleId,
    plan,
    executed, refused, problems,
    admission_before: admissionBefore,
    admission_after: admissionAfter,
    record,
  };
}
